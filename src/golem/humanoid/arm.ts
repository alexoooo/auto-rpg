import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsConstraintAxis } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { capsulePart, joint, type Part } from "../../rig.ts";
import { materialForGolemRole } from "../materials.ts";
import { JointActuator, JointServo } from "../joint-servo.ts";
import { defineChain, type BuiltChain, type GolemPart } from "../module.ts";
import { LIMB_MOUNT, ARM_STROKES } from "../effectors/chains/arm-core.ts";
import { ARM_AXES, ARM_IDS, ARM_LENGTHS, ARM_LIMITS, ARM_REST, armForward, clamp, solveArm, validOrientation } from "./kinematics.ts";
import { humanEquipment } from "./equipment.ts";
import type { HandCursor, HandIntent } from "../../mind.ts";

// Authored human arm + gauntlet mass distribution; sums to 5.9 kg including armour.
const MASSES = [0.3, 0.3, 2.5, 1.6, 0.3, 0.3, 0.6];
// Initial finite-effort budgets in Nm. Bench measurements accompany subsequent changes.
const TORQUES = [100, 100, 65, 75, 25, 25, 20];
const RATES = [3, 3, 4, 4, 5, 5, 4];
// Node/NullEngine arm bench, 4 s hold after motion, real Havok (2026-09-22):
// inertia floor kg m²: 0 / .005 / .015 / .04 / .1; hand error mm: 386 / 178 / 5.8 / 2.7 / 1.5.
// This conditions small bearing links without increasing mass or motor effort.
export const HUMAN_ARM_DRIVE = { inertiaFloor: 0.04, response: 20 };
export const anatomicalChain = defineChain({
  id: "anatomical", fitTerminal: humanEquipment, label: "anatomical arm - full hand pose", axes: 7,
  strokes: ARM_STROKES, pointTarget: true, massKg: MASSES.reduce((a, b) => a + b), swingInertia: 0.8,
  build(ctx, limits, crossing): BuiltChain {
    const side = ctx.socket.outboard;
    const reachable = { reachMin: Math.max(0.24, limits?.reachMin ?? 0.24), reachMax: Math.min(0.70, limits?.reachMax ?? 0.70),
      swingMin: crossing?.swingMin ?? Math.max(-0.65, limits?.swingMin ?? -0.65),
      swingMax: Math.min(1.6, limits?.swingMax ?? 1.6),
      liftMin: Math.max(-1.15, limits?.liftMin ?? -1.15), liftMax: Math.min(1.15, limits?.liftMax ?? 1.15),
      carryMin: crossing?.carryMin ?? Math.max(-0.13, limits?.carryMin ?? -0.13) };
    const initial = [...ARM_REST], bind = armForward(initial);
    const bodies: Part[] = [], constraints: ReturnType<typeof joint>[] = [];
    const rotate = (p: Vector3, q: Quaternion) => p.rotateByQuaternionToRef(q, new Vector3());
    const toWorld = (p: Vector3) => rotate(p, ctx.socket.rotation).addInPlace(ctx.socket.world);
    const measures: (() => number)[] = [], servos: JointServo[] = [];
    for (let i = 0; i < 7; i++) {
      const frame = bind.frames[i], length = ARM_LENGTHS[i];
      const body = capsulePart(ctx.scene, { name: `${ctx.name}.${ARM_IDS[i]}`,
        position: toWorld(Vector3.Center(frame.pivot, frame.end)),
        rotation: ctx.socket.rotation.multiply(frame.rotation),
        height: Math.max(length, 0.07), radius: i === 2 ? 0.055 : i === 3 ? 0.043 : 0.032,
        mass: MASSES[i], layer: ctx.layers.body, collidesWith: ctx.layers.bodyCollidesWith,
        material: materialForGolemRole(ctx.materials, "armour") });
      body.body.setLinearDamping(0.1); body.body.setAngularDamping(0.2);
      const properties = body.body.getMassProperties(), inertia = properties.inertia!;
      body.body.setMassProperties({ ...properties, inertia: new Vector3(
        Math.max(inertia.x, HUMAN_ARM_DRIVE.inertiaFloor), Math.max(inertia.y, HUMAN_ARM_DRIVE.inertiaFloor),
        Math.max(inertia.z, HUMAN_ARM_DRIVE.inertiaFloor)) });
      const parent = i ? bodies[i - 1] : ctx.socket.mount;
      const pivotParent = i ? new Vector3(0, -ARM_LENGTHS[i - 1] / 2, 0) : ctx.socket.local;
      const relativeBind = Quaternion.RotationAxis(ARM_AXES[i], initial[i]);
      const perpendicular = Math.abs(ARM_AXES[i].x) > 0.5 ? Vector3.Up() : Vector3.Right();
      const constraint = joint(ctx.scene, parent, body, { pivotParent, pivotChild: new Vector3(0, length / 2, 0),
        axisParent: ARM_AXES[i], axisChild: ARM_AXES[i], perpParent: perpendicular,
        perpChild: rotate(perpendicular, relativeBind.conjugate()),
        swing: { x: { min: ARM_LIMITS[i][0] - initial[i], max: ARM_LIMITS[i][1] - initial[i] } } });
      bodies.push(body); constraints.push(constraint);
      const measure = () => {
        const relative = parent.mesh.rotationQuaternion!.conjugate().multiply(body.mesh.rotationQuaternion!);
        const angle = 2 * Math.atan2(Vector3.Dot(new Vector3(relative.x, relative.y, relative.z), ARM_AXES[i]), relative.w);
        return Math.atan2(Math.sin(angle), Math.cos(angle));
      };
      measures.push(measure);
      servos.push(new JointServo(new JointActuator(constraint, PhysicsConstraintAxis.ANGULAR_X), measure, initial[i], HUMAN_ARM_DRIVE.response));
    }
    const parts: GolemPart[] = bodies.map((part, i) => ({ id: part.name, part, shell: [],
      health: i === 2 || i === 3 ? 100 : 70, vitalityWeight: i === 2 || i === 3 ? 0.02 : 0.005,
      fatal: false, armour: 0.35, combatRole: "body", appearance: "human" }));
    const hand = bodies[6], handPivot = new Vector3(0, -ARM_LENGTHS[6] / 2, 0);
    let command: HandIntent = { pointerX: 0, pointerY: 0, reach: 0, roll: 0, wristBend: 0, thrust: false, guard: false };
    let desired = [...initial], angles = [...initial], stopped = false, passive = false;
    let forced: Vector3 | null = null, solveTime = 0;
    let commanded = armForward(angles);
    const axes = ARM_IDS.map(id => ({ id, commanded: 0, achieved: 0 }));
    const socketRotation = () => ctx.socket.mount.mesh.rotationQuaternion!;
    const socketPoint = () => rotate(ctx.socket.local, socketRotation()).addInPlace(ctx.socket.mount.mesh.position);
    const worldCommand = () => rotate(commanded.point, socketRotation()).addInPlace(socketPoint());
    const handPoint = () => rotate(handPivot, hand.mesh.rotationQuaternion!).addInPlace(hand.mesh.position);
    const cursor = (): HandCursor => ({ pointerX: command.pointerX, pointerY: command.pointerY, reach: command.reach,
      roll: command.roll, wristBend: command.wristBend,
      orientation: { x: commanded.rotation.x, y: commanded.rotation.y, z: commanded.rotation.z, w: commanded.rotation.w } });
    const solve = () => {
      const span = (v: number, lo: number, hi: number) => lo + (clamp(v, -1, 1) + 1) * 0.5 * (hi - lo);
      const swing = span(command.pointerX * side, reachable.swingMin, reachable.swingMax);
      const lift = span(command.pointerY, reachable.liftMin, reachable.liftMax);
      const reach = span(command.reach, reachable.reachMin, reachable.reachMax);
      const p = forced ? rotate(forced.subtract(socketPoint()), socketRotation().conjugate()) :
        new Vector3(Math.sin(swing) * Math.cos(lift) * reach * side, Math.sin(lift) * reach, Math.cos(swing) * Math.cos(lift) * reach);
      p.x = side * Math.max(reachable.carryMin, p.x * side);
      // Keep cross-body commands in front of the chest, including paired grips.
      if (p.x * side < 0.03) p.z = Math.max(0.22, p.z);
      if (p.length() > reachable.reachMax) p.scaleInPlace(reachable.reachMax / p.length());
      let orientation = validOrientation(command.orientation);
      if (!orientation) {
        const direction = p.normalizeToNew();
        // The hand's -Y aims along the weapon; roll sets the cutting edge.
        orientation = Quaternion.FromUnitVectorsToRef(new Vector3(0, -1, 0), direction, new Quaternion());
        orientation = orientation.multiply(Quaternion.RotationAxis(Vector3.Up(), command.roll * side))
          .multiply(Quaternion.RotationAxis(Vector3.Right(), -command.wristBend * 0.7));
      }
      desired = solveArm(p, forced ? null : orientation, desired, 12);
    };
    return {
      parts, weld: { link: hand, pivot: handPivot, world: toWorld(bind.point),
        rotation: hand.mesh.rotationQuaternion!.clone(), mount: LIMB_MOUNT }, ownTerminal: null, reach: reachable.reachMax,
      command(next) {
        command = { ...next, ...(next.orientation ? { orientation: { ...next.orientation } } : {}) }; forced = null;
      },
      commandWeldTo(world) { forced = world.clone(); },
      step(dt) {
        if (stopped || passive) return;
        solveTime += dt;
        if (solveTime >= 1 / 60) { solve(); solveTime = 0; }
        angles = angles.map((a, i) => a + clamp(desired[i] - a, -RATES[i] * dt, RATES[i] * dt));
        commanded = armForward(angles);
        for (let i = 0; i < 7; i++) { axes[i].commanded = angles[i]; axes[i].achieved = measures[i](); servos[i].track(angles[i], dt, TORQUES[i]); }
      },
      envelope: () => ({ fullOrientation: true, axes: ARM_IDS.map((id, i) => ({ id, unit: "rad", min: ARM_LIMITS[i][0], max: ARM_LIMITS[i][1], rate: RATES[i] })),
        reach: reachable.reachMax, reachable, strokes: ARM_STROKES, settledBand: 0.025 }),
      axes: () => axes, stroke: () => "idle", anchor: worldCommand,
      anchorStray: () => Vector3.Distance(worldCommand(), handPoint()), cursor,
      orientation: () => socketRotation().conjugate().multiply(hand.mesh.rotationQuaternion!),
      commandedEnd(distance) { return worldCommand().addInPlace(rotate(new Vector3(0, -(distance - reachable.reachMax), 0), socketRotation().multiply(commanded.rotation))); },
      unmotorise() { passive = true; servos.forEach(s => s.actuator.release()); },
      sever() { if (stopped) return; stopped = true; servos.forEach(s => s.actuator.release()); constraints.forEach(c => c.dispose()); },
      dispose() { if (!stopped) { servos.forEach(s => s.actuator.release()); constraints.forEach(c => c.dispose()); } stopped = true;
        bodies.forEach(p => { p.body.dispose(); p.shape.dispose(); p.mesh.dispose(false, false); }); },
    };
  },
});
