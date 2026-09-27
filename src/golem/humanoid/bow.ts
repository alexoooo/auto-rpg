import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsRaycastResult } from "@babylonjs/core/Physics/physicsRaycastResult.js";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin.js";
import type { HandIntent } from "../../mind.ts";
import type { RangedCommand, RangedView } from "../../archery.ts";
import { declare } from "../../body-command.ts";
import { CONFIG } from "../../config.ts";
import { boxPart, joint } from "../../rig.ts";
import { LAYER } from "../../physics.ts";
import { attributeOf, SIZE_LAW_POWER } from "../attributes.ts";
import { type BuiltModule, type GolemModuleDefinition, defineTerminal } from "../module.ts";
import { anatomicalChain } from "./arm.ts";
import { workshopArm, WORKSHOP_STRING_HOOK } from "./workshop-profile.ts";
import { ArcherQuiver } from "./arrows.ts";

/** Registry metadata. The coordinated module, not the rigid-terminal composer, builds this kit. */
export const bowTerminal = defineTerminal({ id: "bow", label: "Bow (two hands)", sockets: 2, bite: "none",
  massKg: .85, limits: null, attachment: "hand", partRole: "equipment",
  build() { throw new Error("A bow requires the coordinated anatomical bow module"); } });

const rotate = (p: Vector3, q: Quaternion) => p.rotateByQuaternionToRef(q, new Vector3());
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t*t*(3-2*t); };

export const anatomicalBow: GolemModuleDefinition<HandIntent> = {
  id: "effector.anatomical.bow", label: "Anatomical archer", slots: ["primary", "secondary"], sockets: 2,
  massKg: 12.65, itemMassKg: .85,
  build(ctx): BuiltModule<HandIntent> {
    if (!ctx.companion) throw new Error("Archery requires both arm sockets");
    const human = ctx.human ?? { model: "workshop-rogue" as const, boots: true, armour: false };
    const size = attributeOf(ctx, "size");
    const rightSocket = ctx.socket.outboard > 0 ? ctx.socket : ctx.companion;
    const leftSocket = ctx.socket.outboard < 0 ? ctx.socket : ctx.companion;
    const rootName = ctx.name.replace(/\.(primary|secondary)$/, "");
    const right = anatomicalChain.build({ ...ctx, human, socket: rightSocket, name: `${rootName}.primary` }, null, null, 0);
    const left = anatomicalChain.build({ ...ctx, human, socket: leftSocket, name: `${rootName}.secondary` }, null, null, .85);
    const rw = right.weld!, lw = left.weld!;
    const bow = boxPart(ctx.scene, { name: `${rootName}.secondary.bow`, position: lw.world.clone(), rotation: lw.rotation.clone(),
      size: new Vector3(.035, .035, 1.18), mass: .85, layer: ctx.layers.strike,
      collidesWith: ctx.layers.strikeCollidesWith, material: ctx.materials.functionalMetal });
    const weld = joint(ctx.scene, lw.link, bow, { pivotParent: lw.pivot, pivotChild: Vector3.Zero(), swing: {} });
    const quiver = new ArcherQuiver(ctx.scene, ctx.side, `${rootName}.bow`, ctx.materials.functionalMetal);
    const parts = [...right.parts.map(p => ({ ...p, visualSlot: "primary" as const })),
      ...left.parts.map(p => ({ ...p, visualSlot: "secondary" as const })),
      { id: bow.name, part: bow, shell: [], health: 100, vitalityWeight: 0, fatal: false,
        appearance: "human" as const, combatRole: "equipment" as const, visualSlot: "secondary" as const }];
    const state: RangedView = { phase: "carry", draw: 0, ready: false, clear: false, shots: 0 };
    bow.mesh.metadata = { archery: state };
    let request: RangedCommand | null = null, elapsed = 0, lift = 0, pull = 0, released = false, disabled = false;
    let recovering = 0;
    const plugin = ctx.scene.getPhysicsEngine()!.getPhysicsPlugin() as HavokPlugin;
    const ray = new PhysicsRaycastResult();
    const point = (socket: typeof rightSocket) => rotate(socket.local, socket.mount.mesh.rotationQuaternion!).add(socket.mount.mesh.position);
    const grip = () => rotate(lw.pivot, lw.link.mesh.rotationQuaternion!).add(lw.link.mesh.position);
    const hook = Vector3.FromArray(WORKSHOP_STRING_HOOK).scale(size);
    const nock = () => rotate(hook, rw.link.mesh.rotationQuaternion!).add(rw.link.mesh.position);
    const view = { slot: ctx.socket.slot, tip: Vector3.Zero(), commandedTip: Vector3.Zero(), axes: right.axes(),
      stroke: "idle" as const, anchor: Vector3.Zero(), anchorStray: 0, edge: null, gripStray: null as number | null };
    const geometry = workshopArm(-1, size, human.model);
    const cancel = () => { request = null; elapsed = 0; released = false; state.ready = false; state.phase = disabled ? "disabled" : "carry"; state.draw=0; };
    return {
      parts, strikers: quiver.arrows,
      command() { cancel(); },
      commandEffector(next) {
        request = next.ranged ? { ...next.ranged, target: { ...next.ranged.target } } : null;
        if (!request?.release) released = false;
      },
      ranged: () => state,
      publishProjectiles: (into, at, owner) => quiver.publish(into, at, owner),
      channels: () => [declare("effector", "effector.anatomical.bow", ["shoot"], "bounded anatomical arms and physical bow", "primary")],
      step(dt) {
        if (disabled) return;
        recovering = Math.max(0, recovering-dt);
        const drawing = !!request?.draw && recovering === 0;
        elapsed = drawing ? elapsed + dt : 0;
        lift += Math.max(-dt*1.8, Math.min(dt*1.8, (drawing ? 1 : 0)-lift));
        pull += Math.max(-dt*2, Math.min(dt/CONFIG.arrow.drawSeconds, (drawing && lift > .95 ? 1 : 0)-pull));
        const q = leftSocket.mount.mesh.rotationQuaternion!;
        const ls = point(leftSocket), rs = point(rightSocket);
        const across = rotate(new Vector3(-1,0,0), q);
        const anchor = rs.add(rotate(new Vector3(-.04,.12,.20).scale(size),q));
        const requested = request ? new Vector3(request.target.x, request.target.y, request.target.z).subtract(anchor).normalize() : across;
        // Remain side-on: the gait owns yaw; this bounded elevation never yanks an arm across the torso.
        const direction = Vector3.Dot(across,requested)>.94 ? requested.clone() : across.clone(); direction.y = Math.max(-.35, Math.min(.45, requested.y)); direction.normalize();
        const up = Vector3.Up().subtract(direction.scale(direction.y)).normalize();
        const y = direction.negate(), x = Vector3.Cross(y, up).normalize();
        const basis = Matrix.Identity(); Matrix.FromXYZAxesToRef(x, y, up, basis);
        const aimingQ = Quaternion.FromRotationMatrix(basis);
        const carryQ = q.multiply(Quaternion.FromEulerAngles(.4,0,Math.PI/2));
        const handQ = Quaternion.Slerp(carryQ, aimingQ, smooth(lift));
        const carry = ls.add(rotate(new Vector3(-.18,-.38,.28).scale(size),q));
        const extension = geometry.lengths[2]+geometry.lengths[3]+.025*size;
        const aim = ls.add(direction.scale(extension)).add(up.scale(.04*size)).add(rotate(new Vector3(0,0,.20*size),q));
        const bowTarget = Vector3.Lerp(carry, aim, smooth(lift));
        const rightCarry = rs.add(rotate(new Vector3(-.1,-.25,.30).scale(size),q));
        // Anchor beside the cheek, forward of the face surface and below eye level.
        const stringRest = bowTarget.subtract(direction.scale(.14));
        const stringTarget = Vector3.Lerp(stringRest, anchor, smooth(pull));
        const rightTarget = Vector3.Lerp(rightCarry, stringTarget.subtract(rotate(hook.subtract(rw.pivot),handQ)), smooth(lift));
        left.commandTarget!({position:bowTarget,orientation:handQ,speed:1,force:1},0); right.commandTarget!({position:rightTarget,orientation:handQ,speed:1,force:1},0);
        left.step(dt); right.step(dt);
        view.tip.copyFrom(grip()); view.commandedTip.copyFrom(bowTarget); view.anchor.copyFrom(bowTarget);
        view.anchorStray = Math.max(left.anchorStray() ?? 0, right.anchorStray() ?? 0);
        view.gripStray = Vector3.Distance(nock(), rightTarget.add(rotate(hook.subtract(rw.pivot),handQ)));
        const actualDirection = grip().add(rotate(new Vector3(0,0,.06),bow.mesh.rotationQuaternion!)).subtract(nock()).normalize();
        const distance = Vector3.Dot(grip().subtract(nock()), actualDirection);
        const fullDistance = Math.max(.25, Vector3.Dot(aim.subtract(anchor), direction));
        state.draw = Math.max(0,Math.min(pull,(distance-.14)/Math.max(.1,fullDistance-.14)));
        const alignment = Vector3.Dot(actualDirection, requested);
        state.clear = false;
        if (request) {
          const start = grip().add(actualDirection.scale(.1));
          plugin.raycast(start, Vector3.FromArray([request.target.x,request.target.y,request.target.z]), ray,
            { collideWith: LAYER.WORLD });
          state.clear = !ray.hasHit;
        }
        state.ready = drawing && elapsed > 1.35 && state.draw >= .93 && view.anchorStray < .045*size
          && alignment > .985 && state.clear;
        state.phase = recovering > 0 ? "recover" : !drawing ? "carry" : lift < .95 ? "raise" : state.ready ? "aim" : "draw";
        if (request?.release && !released) {
          released = true;
          if (state.ready) {
            const t = (state.draw-CONFIG.arrow.minDraw)/(1-CONFIG.arrow.minDraw);
            const speed = CONFIG.arrow.speedMin + (CONFIG.arrow.speedMax-CONFIG.arrow.speedMin)*t;
            if (quiver.fire(nock(), actualDirection, speed, lw.link.body.getLinearVelocity())) {
              state.shots++; recovering = .7; elapsed = 0; state.ready = false;
            }
          }
        }
      },
      envelope: () => ({ ...left.envelope(), strokes: [],
        swingInertia: anatomicalChain.swingInertia * 2 * attributeOf(ctx,"weight") * size ** SIZE_LAW_POWER.inertia
          + .85 * left.reach ** 2 }), view: () => view,
      ruin() { disabled = true; cancel(); state.phase = "disabled"; left.limp(); right.limp(); },
      sever() { disabled = true; cancel(); state.phase = "disabled"; left.sever(); right.sever(); },
      dispose() { quiver.dispose(); weld.dispose(); bow.body.dispose(); bow.shape.dispose(); bow.mesh.dispose(false,false); left.dispose(); right.dispose(); },
      captureState: () => ({ request, elapsed, lift, pull, released, disabled, recovering, state, right, left, bow, quiver,
        ctx, rightSocket, leftSocket, size, human, geometry, view, ray, plugin, weld, parts, rw, lw, hook }),
      restoreState(s: Record<string, unknown>) { ({request,elapsed,lift,pull,released,disabled,recovering}=s as never); },
    } as BuiltModule<HandIntent>;
  },
};
