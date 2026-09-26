import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsConstraintAxis, PhysicsConstraintAxisLimitMode } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { capsulePart, joint, type Part } from "../../rig.ts";
import { materialForGolemRole } from "../materials.ts";
import { FULL_TONE, JointActuator, servoGain, servoLead } from "../joint-servo.ts";
import { attributeOf } from "../attributes.ts";
import { defineChain, type BuiltChain, type GolemPart } from "../module.ts";
import { ARM_STROKES } from "../effectors/chains/arm-core.ts";
import { ARM_IDS, ARM_LIMITS, ARM_REST, armForward, clamp, solveArm, validOrientation, rotationError, measureArm } from "./kinematics.ts";
import { PALM_GRIP, HUMAN_MOUNT } from "./grip.ts";
import { carryOrientation } from "./orientation.ts";
import { humanEquipment } from "./equipment.ts";
import type { HandCursor, HandIntent } from "../../mind.ts";

// Three anatomical segments. The seven coordinates are virtual axes, never extra bodies.
const MASSES = [2.8, 2.0, 1.1];
// Constraint-axis budgets: shoulder X/Y/Z, elbow pronation/flexion, wrist deviation/bend.
const TORQUES = [[100, 100, 65], [25, 75, 0], [20, 25, 0]];
const RATES = [3, 3, 4, 4, 5, 5, 4];
// Awake Node/Havok stand, 10 s loaded heater hold (human-arm-probe):
// straight elbow constraint reference: 4â€“15 mm hand error, pronation oscillates >1 rad;
// resting-bend reference + 10/s response: .783 mm error, <.001 mm final-window wander.
// Motor ceilings were not raised. Small segment inertia floor is kg mÂ².
// `response` is per second at the tuning rate (`CONFIG.world.solverTuningHz`) and is held to it at
// a longer step by `servoLead` and `servoGain`, as the golem servo is. Node golem bench, one trial,
// the anatomical arm with its blade / mace (240 Hz; 120 on the shipped law; 120 as here):
// stroke stray 76.0 / 136.1, 91.9 / 144.4, 78.7 / 130.0 mm; parry overshoot 113 / 180, 119 / 228,
// 97 / 196 mm; peak stroke tip 11.24 / 9.26, 11.41 / 9.26, 11.11 / 9.21 m/s.
export const HUMAN_ARM_DRIVE = { inertiaFloor: 0.015, response: 10 };
export const anatomicalChain = defineChain({
  id: "anatomical", fitTerminal: humanEquipment, label: "anatomical arm - full hand pose", axes: 7,
  strokes: ARM_STROKES, pointTarget: true, massKg: MASSES.reduce((a, b) => a + b), swingInertia: 0.8,
  build(ctx, limits, crossing): BuiltChain {
    const side = ctx.socket.outboard;
    // The body's arm-speed stat, on every coordinate's rate (`withArmSpeed` says why the rate and
    // not the torque). The +-8 clamp on a drive target below is a bound on the command, not a rate.
    const armSpeed = attributeOf(ctx, "armSpeed");
    const rates = armSpeed === 1 ? RATES : RATES.map((rate) => rate * armSpeed);
    // And its weight stat, on each segment's mass and on the torques that move them (`withWeight`);
    // the inertia floor below stays.
    const weight = attributeOf(ctx, "weight");
    const reachable = { reachMin: Math.max(0.24, limits?.reachMin ?? 0.24), reachMax: Math.min(0.65, limits?.reachMax ?? 0.65),
      swingMin: crossing?.swingMin ?? Math.max(-0.65, limits?.swingMin ?? -0.65),
      swingMax: Math.min(1.6, limits?.swingMax ?? 1.6),
      liftMin: Math.max(-1.15, limits?.liftMin ?? -1.15), liftMax: Math.min(1.15, limits?.liftMax ?? 1.15),
      carryMin: crossing?.carryMin ?? Math.max(-0.13, limits?.carryMin ?? -0.13) };
    const initial = [...ARM_REST], bind = armForward(initial);
    const bodies: Part[] = [], constraints: ReturnType<typeof joint>[] = [];
    const rotate = (p: Vector3, q: Quaternion) => p.rotateByQuaternionToRef(q, new Vector3());
    const toWorld = (p: Vector3) => rotate(p, ctx.socket.rotation).addInPlace(ctx.socket.world);
    const actuators: JointActuator[][] = [];
    const groups = [2, 4, 6], ids = ["upper", "fore", "hand"], lengths = [.32, .27, .09];
    for (let i = 0; i < 3; i++) {
      const frame = bind.frames[groups[i]], proximal = bind.frames[i === 0 ? 0 : i === 1 ? 3 : 5].pivot;
      const distal = i === 0 ? bind.frames[2].end : i === 1 ? bind.frames[3].end : bind.frames[6].end;
      const body = capsulePart(ctx.scene, { name: `${ctx.name}.${ids[i]}`,
        position: toWorld(Vector3.Center(proximal, distal)), rotation: ctx.socket.rotation.multiply(frame.rotation),
        height: lengths[i], radius: i === 0 ? .055 : i === 1 ? .043 : .032,
        mass: MASSES[i] * weight, layer: ctx.layers.body, collidesWith: ctx.layers.bodyCollidesWith,
        material: materialForGolemRole(ctx.materials, "armour") });
      body.body.setLinearDamping(.1); body.body.setAngularDamping(.2);
      const properties = body.body.getMassProperties(), inertia = properties.inertia!;
      body.body.setMassProperties({ ...properties, inertia: new Vector3(
        Math.max(inertia.x, HUMAN_ARM_DRIVE.inertiaFloor), Math.max(inertia.y, HUMAN_ARM_DRIVE.inertiaFloor),
        Math.max(inertia.z, HUMAN_ARM_DRIVE.inertiaFloor)) });
      const parent = i ? bodies[i - 1] : ctx.socket.mount;
      const constraint = joint(ctx.scene, parent, body, {
        pivotParent: i ? new Vector3(0, -lengths[i - 1] / 2, 0) : ctx.socket.local,
        pivotChild: new Vector3(0, lengths[i] / 2, 0),
        ...(i ? { axisParent: i === 1 ? rotate(Vector3.Up(), Quaternion.RotationAxis(Vector3.Right(), ARM_REST[3])) : Vector3.Forward(), axisChild: i === 1 ? Vector3.Up() : Vector3.Forward(), perpParent: Vector3.Right(), perpChild: Vector3.Right() } : {}),
        swing: i === 0 ? { x: { min: -Math.PI, max: Math.PI }, y: { min: -Math.PI, max: Math.PI }, z: { min: -Math.PI, max: Math.PI } } :
          i === 1 ? { x: { min: -1.5, max: 1.5 }, y: { min: -2.65 - ARM_REST[3], max: -.04 - ARM_REST[3] } } :
          { x: { min: -.5, max: .5 }, y: { min: -.85, max: .85 } },
      });
      bodies.push(body); constraints.push(constraint);
      actuators.push([PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintAxis.ANGULAR_Y, PhysicsConstraintAxis.ANGULAR_Z]
        .map(axis => new JointActuator(constraint, axis, ctx.tone ?? FULL_TONE)));
    }
    const parts: GolemPart[] = bodies.map((part, i) => ({ id: part.name, part, shell: [],
      health: i < 2 ? 100 : 70, vitalityWeight: i < 2 ? .025 : .015,
      fatal: false, armour: .35, combatRole: "body", appearance: "human" }));
    const hand = bodies[2], handPivot = PALM_GRIP.clone();
    let supported = false;
    const release = () => actuators.flat().forEach(a => a.release());
    let command: HandIntent = { pointerX: 0, pointerY: 0, reach: 0, roll: 0, wristBend: 0, thrust: false, guard: false };
    let desired = [...initial], angles = [...initial], stopped = false, passive = false;
    let forced: Vector3 | null = null, forcedOrientation: Quaternion | null = null, solveTime = 0;
    let commanded = armForward(angles);
    const axes = ARM_IDS.map(id => ({ id, commanded: 0, achieved: 0 }));
    const socketRotation = () => ctx.socket.mount.mesh.rotationQuaternion!;
    const socketPoint = () => rotate(ctx.socket.local, socketRotation()).addInPlace(ctx.socket.mount.mesh.position);
    const worldCommand = () => rotate(commanded.point, socketRotation()).addInPlace(socketPoint());
    // The stray is read against the point the drive is steering to, as the golem arm's is (see
    // `steeredTo` in `src/golem/effectors/chains/arm-core.ts`): the command itself at 240 Hz.
    const previousPoint = commanded.point.clone();
    let lastStep = 0;
    const steeredTo = () => {
      const lead = servoLead(lastStep);
      return lead === 1 ? worldCommand()
        : rotate(Vector3.Lerp(previousPoint, commanded.point, lead), socketRotation()).addInPlace(socketPoint());
    };
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
      const requestedOrientation = validOrientation(command.orientation);
      let orientation = requestedOrientation;
      if (!orientation) {
        const direction = p.normalizeToNew();
        // Aim the palm's handle axis; roll sets the cutting edge.
        orientation = carryOrientation(direction, 0, command.thrust);
        orientation = orientation.multiply(Quaternion.RotationAxis(HUMAN_MOUNT.perp, command.roll * side))
          .multiply(Quaternion.RotationAxis(Vector3.Right(), -command.wristBend * 0.7));
      }
      if (supported && !forced) {
        const face = requestedOrientation ? rotate(Vector3.Right().scale(side), requestedOrientation) :
          new Vector3(p.x * .4, 0, Math.max(.1, p.z)).normalize();
        // Keep the shield's top well-defined even when the requested normal is vertical.
        if (Math.abs(face.y) > .98) { face.y = Math.sign(face.y) * .98; face.z += .2; face.normalize(); }
        const x = face.scale(side), y = Vector3.Cross(Vector3.Up(), face).normalize().scale(side), z = Vector3.Cross(x, y);
        const basis = Matrix.Identity(); Matrix.FromXYZAxesToRef(x, y, z, basis);
        orientation = Quaternion.FromRotationMatrix(basis);
        p.x = side * (p.x * side * .35 - .14);
        p.z = clamp(p.z, .24, .45); p.y = clamp(p.y - .12, -.25, .15);
      }
      desired = solveArm(p, forced ? (forcedOrientation ? socketRotation().conjugate().multiply(forcedOrientation) : null) : orientation, desired, 24, side, supported);
    };
    let previousAngles = [...initial];
    let previousRotations = groups.map(i => bind.frames[i].rotation.clone());
    const handWeld = { kind: "hand" as const, link: hand, pivot: handPivot, world: toWorld(bind.point),
      rotation: hand.mesh.rotationQuaternion!.clone(), mount: HUMAN_MOUNT };
    return {
      attachment(kind) {
        if (kind === "hand") return handWeld;
        if (kind !== "forearm") throw new Error(`Anatomical arm cannot mount ${kind} equipment`);
        supported = true;
        constraints[2].setAxisMode(PhysicsConstraintAxis.ANGULAR_X, PhysicsConstraintAxisLimitMode.LOCKED);
        constraints[2].setAxisMode(PhysicsConstraintAxis.ANGULAR_Y, PhysicsConstraintAxisLimitMode.LOCKED);
        constraints[2].setAxisMinLimit(PhysicsConstraintAxis.ANGULAR_X, 0);
        constraints[2].setAxisMaxLimit(PhysicsConstraintAxis.ANGULAR_X, 0);
        constraints[2].setAxisMinLimit(PhysicsConstraintAxis.ANGULAR_Y, 0);
        constraints[2].setAxisMaxLimit(PhysicsConstraintAxis.ANGULAR_Y, 0);
        return { kind, link: bodies[1], pivot: new Vector3(0, -.27 / 2, 0),
          world: toWorld(bind.frames[3].end), rotation: bodies[1].mesh.rotationQuaternion!.clone(), mount: HUMAN_MOUNT };
      },
      parts, weld: handWeld, ownTerminal: null, reach: reachable.reachMax,
      command(next) {
        command = { ...next, ...(next.orientation ? { orientation: { ...next.orientation } } : {}) }; forced = null;
      },
      commandWeldTo(world, orientation) { forced = world.clone(); forcedOrientation = orientation?.clone() ?? null; },
      commandedOrientation: () => socketRotation().multiply(commanded.rotation),
      step(dt) {
        if (stopped || passive) return;
        solveTime += dt;
        if (solveTime >= 1 / 60) { solve(); solveTime = 0; }
        angles = angles.map((a, i) => a + clamp(desired[i] - a, -rates[i] * dt, rates[i] * dt));
        previousPoint.copyFrom(commanded.point); lastStep = dt;
        commanded = armForward(angles);
        const rotations = groups.map(i => commanded.frames[i].rotation);
        const achieved = measureArm(bodies.map(b => socketRotation().conjugate().multiply(b.mesh.rotationQuaternion!)), angles);
        // The golem servo's law, held to the tuning rate the same way (`servoLead` and `servoGain`
        // in `src/golem/joint-servo.ts`): at 240 Hz this is `wanted` and `response` exactly.
        const lead = servoLead(dt), gain = servoGain(HUMAN_ARM_DRIVE.response, dt);
        for (let i = 0; i < 3; i++) {
          const parent = i ? bodies[i - 1].mesh.rotationQuaternion! : socketRotation();
          const wanted = i ? rotations[i - 1].conjugate().multiply(rotations[i]) : rotations[i];
          const old = i ? previousRotations[i - 1].conjugate().multiply(previousRotations[i]) : previousRotations[i];
          const actual = parent.conjugate().multiply(bodies[i].mesh.rotationQuaternion!);
          const aim = lead === 1 ? wanted : Quaternion.Slerp(old, wanted, lead);
          const velocity = rotationError(wanted, old).scale(1 / dt)
            .add(rotationError(aim, actual).scale(gain));
          for (let axis = 0; axis < 3; axis++) {
            if ((i > 0 && axis === 2) || (i === 2 && supported)) continue;
            const coordinate = i === 1 ? (axis === 0 ? 4 : 3) : (axis === 0 ? 6 : 5);
            const from = previousAngles[coordinate], to = angles[coordinate];
            const target = i === 0 ? velocity.asArray()[axis] : (to - from) / dt +
              gain * ((lead === 1 ? to : from + (to - from) * lead) - achieved[coordinate]);
            actuators[i][axis].drive(clamp(target, -8, 8), TORQUES[i][axis] * weight);
          }
        }
        previousRotations = rotations.map(q => q.clone()); previousAngles = [...angles];
        for (let i = 0; i < 7; i++) { axes[i].commanded = angles[i]; axes[i].achieved = achieved[i]; }
      },
      envelope: () => ({ fullOrientation: true, axes: ARM_IDS.map((id, i) => ({ id, unit: "rad", min: supported && i >= 5 ? 0 : ARM_LIMITS[i][0], max: supported && i >= 5 ? 0 : ARM_LIMITS[i][1], rate: rates[i] })),
        reach: reachable.reachMax, reachable, strokes: ARM_STROKES, settledBand: 0.025,
        // The shoulder's rate and torque against the shipped arm's (`ArmDrive`); a human is x1 in size.
        drive: { rateScale: rates[0] / RATES[0], torqueScale: weight } }),
      axes: () => axes, stroke: () => "idle", anchor: worldCommand,
      anchorStray: () => Vector3.Distance(steeredTo(), handPoint()), cursor,
      orientation: () => socketRotation().conjugate().multiply(hand.mesh.rotationQuaternion!),
      commandedEnd(distance) { return worldCommand().addInPlace(rotate(HUMAN_MOUNT.perp.scale(distance - reachable.reachMax), socketRotation().multiply(commanded.rotation))); },
      unmotorise() { passive = true; release(); },
      limp() { passive = true; release(); },
      sever() { if (stopped) return; stopped = true; release(); constraints.forEach(c => c.dispose()); },
      dispose() { if (!stopped) { release(); constraints.forEach(c => c.dispose()); } stopped = true;
        bodies.forEach(p => { p.body.dispose(); p.shape.dispose(); p.mesh.dispose(false, false); }); },
      // A fork of the world (`src/forkable.ts`): every let and private object this closure steps on.
      captureState: (): Record<string, unknown> => ({
        supported, command, desired, angles, stopped, passive, forced, forcedOrientation, solveTime,
        commanded, previousAngles, previousRotations, lastStep,
        ctx, rates, reachable, bind, bodies, constraints, actuators, groups, axes, handPivot, handWeld,
        previousPoint,
      }),
      restoreState(state: Record<string, unknown>): void {
        ({
          supported, command, desired, angles, stopped, passive, forced, forcedOrientation, solveTime,
          commanded, previousAngles, previousRotations, lastStep,
        } = state as never);
      },
    } as BuiltChain;
  },
});
