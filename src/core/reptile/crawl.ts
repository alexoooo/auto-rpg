import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { OwnBody } from "../mind/mind.ts";
import type { Orders } from "../mind/orders.ts";
import type { Senses } from "../mind/senses.ts";
import type { Skill } from "../skills/skill.ts";
import type { supportedMotor, SupportedCommand } from "../control/supported-motor.ts";
import type { EffectorGoal } from "../control/effector-tracker.ts";
import { withinSupport } from "../control/support.ts";
import { atan2, cos, sin } from "../math/real.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { REPTILE_CRAWL } from "./tuning.ts";

/** A quadruped's proprioception exposes support endpoints rather than fabricated hands. */
export interface QuadrupedView {
  readonly centre: Vector3;
  readonly velocity: Vector3;
  readonly feet: ReturnType<typeof supportedMotor>["state"]["endpoints"];
  readonly senses: Senses;
  readonly yaw: number;
  readonly down: boolean;
}

/**
 * A paw's goal, root frame: its `point` to `at` and turned to `turn` in `seconds`, coming down
 * at `landing`. On a `curve`, it leaves from rest and bows by `curve`.
 */
export function soleGoal(point: string, at: Vector3, seconds: number, sequence: number, landing: Vector3, turn: Quaternion, curve?: Vector3): EffectorGoal {
  return { places: [{ point, position: [at.x, at.y, at.z] }], seconds, follows: true, sequence,
    ...(curve ? { initialVelocity: [0, 0, 0] as const } : {}), terminalVelocity: [landing.x, landing.y, landing.z],
    ...(curve ? { curve: [curve.x, curve.y, curve.z] as const } : {}), orientation: { target: [turn.x, turn.y, turn.z, turn.w], seconds } };
}

/** One paw moves after the centre enters the other three paws' support triangle. */
export function crawl(own: OwnBody, motor: ReturnType<typeof supportedMotor>, names: readonly string[], T = REPTILE_CRAWL) {
  const root = motor.root, nominal = names.map(name => own.built.segments.get(name)!.spec.points!.sole!.value);
  const mass = own.spec.mass.value, reference = own.spec.segments.reduce((c, p) => {
    const m = p.mass.value / mass, at = p.centreOfMass.value;
    return [c[0] + m * at[0], c[1] + m * at[1], c[2] + m * at[2]] as Vec3;
  }, [0, 0, 0] as Vec3);
  const q = root.node.rotationQuaternion!;
  const state = {
    phase: "settle" as "settle" | "shift" | "swing" | "land" | "return", time: 0, paw: 0, steps: 0, sequence: 0, yaw: 0, align: 0, standing: false, lifted: false,
    centre: [motor.state.centre.x, reference[1], motor.state.centre.z] as [number, number, number],
    anchors: motor.state.endpoints.map(e => [e.at.x, e.ground, e.at.z] as [number, number, number]),
    from: [0, 0, 0] as [number, number, number], to: [0, 0, 0] as [number, number, number],
    command: {
      centre: [motor.state.centre.x, reference[1], motor.state.centre.z] as [number, number, number],
      velocity: [0, 0, 0] as [number, number, number], rotation: [q.x, q.y, q.z, q.w] as [number, number, number, number],
      endpoints: motor.state.endpoints.map((e, i) => ({ target: [e.at.x, nominal[i]![1], e.at.z] as [number, number, number],
        bearing: true, rotation: [0, 0, 0, 1] as [number, number, number, number] })),
      posture: {} as Record<string, number>,
    },
  };
  const rotation = new Quaternion(), turned = new Quaternion(), support = names.map(() => ({ corners: [new Vector3()] }));
  const resume = (view: QuadrupedView) => {
    state.phase = "settle"; state.time = 0; state.sequence++; state.yaw = view.yaw; state.standing = false; state.align = 0;
    state.centre[0] = view.centre.x; state.centre[2] = view.centre.z;
    view.feet.forEach((e, i) => { state.anchors[i]![0] = e.at.x; state.anchors[i]![1] = e.ground; state.anchors[i]![2] = e.at.z; });
  };
  const skill: Skill<QuadrupedView> & { readonly state: typeof state; command(view: QuadrupedView, intent: Orders, dt: number, height?: number): SupportedCommand } = {
    state, resume,
    command(view, intent, dt, height = T.crawlHeight) {
      const face = intent.face ?? intent.move;
      let error = 0;
      if (face && (face.x * face.x + face.z * face.z) > 0) {
        const angle = atan2(face.x, face.z), d = angle - state.yaw;
        error = atan2(sin(d), cos(d));

      }
      const moving = !!intent.move || Math.abs(error) > T.turnError || state.align > 0 && !!face;
      state.time += dt;
      view.feet.forEach((e, i) => {
        if (e.contact && (i !== state.paw || state.phase === "settle" || state.phase === "shift")) {
          state.anchors[i]![0] = e.at.x; state.anchors[i]![1] = e.ground; state.anchors[i]![2] = e.at.z;
        }
      });
      const average = [0, 0, 0];
      for (const anchor of state.anchors) for (let k = 0; k < 3; k++) average[k] += anchor[k]! / names.length;
      const ground = average[1]!;
      state.command.centre[1] = ground + reference[1] * (state.phase === "settle" ? 1 : height);
      if (state.phase === "settle") {
        if (moving || !state.standing) {
          const c = cos(state.yaw), s = sin(state.yaw);
          state.centre[0] = average[0]! + c * reference[0] + s * reference[2];
          state.centre[2] = average[2]! - s * reference[0] + c * reference[2];
        }
        state.standing = !moving;
        state.command.centre[0] = state.centre[0]; state.command.centre[2] = state.centre[2];
        if (moving && state.time >= T.settle && view.feet.every(e => e.contact)) {
          if (state.paw === 0) state.yaw += Math.max(-T.yawStep, Math.min(T.yawStep, error));
          if (Math.abs(error) > T.turnError) state.align = names.length;
          else state.align = Math.max(0, state.align - 1);
          state.phase = "shift"; state.time = 0; state.standing = false;
          const anchor = state.anchors[state.paw]!;
          state.from.splice(0, 3, ...anchor);
          let dx = 0, dz = 0;
          if (intent.move) { const length = Math.sqrt(intent.move.x * intent.move.x + intent.move.z * intent.move.z); if (length) { dx = intent.move.x / Math.max(1, length); dz = intent.move.z / Math.max(1, length); } }
          const n = nominal[state.paw]!, c = cos(state.yaw), s = sin(state.yaw), x = n[0] - reference[0], z = n[2] - reference[2];
          state.to[0] = view.centre.x + c * x + s * z + dx * T.stride;
          state.to[1] = ground; state.to[2] = view.centre.z - s * x + c * z + dz * T.stride;
        }
      }
      if (state.phase === "shift" || state.phase === "swing" || state.phase === "land" || state.phase === "return") {
        let x = 0, z = 0;
        const otherSupport = support.filter((_p, i) => i !== state.paw);
        for (let i = 0; i < names.length; i++) {
          support[i]!.corners[0]!.set(...state.anchors[i]!);
          if (i !== state.paw) { x += state.anchors[i]![0] / (names.length - 1); z += state.anchors[i]![2] / (names.length - 1); }
        }
        const inside = withinSupport(otherSupport, x, z, T.inset);
        state.command.centre[0] = inside[0]; state.command.centre[2] = inside[1];
        if (state.phase === "shift") {
          const projected = withinSupport(otherSupport, view.centre.x, view.centre.z, T.supportInset);
          const dx = projected[0] - view.centre.x, dz = projected[1] - view.centre.z;
          if (state.time >= T.shift && dx * dx + dz * dz < T.shiftError * T.shiftError && view.feet.every(e => e.contact)) {
            state.phase = "swing"; state.time = 0; state.sequence++; state.lifted = false;
          }
        } else if (state.phase === "swing") {
          if (!view.feet[state.paw]!.contact && view.feet[state.paw]!.low - view.feet[state.paw]!.ground > T.liftConfirm) state.lifted = true;
          if (state.time >= T.swing) { state.phase = "land"; state.time = 0; }
        } else if (state.phase === "land" && state.lifted && view.feet[state.paw]!.contact) {
          state.anchors[state.paw]![0] = view.feet[state.paw]!.at.x;
          state.anchors[state.paw]![1] = view.feet[state.paw]!.ground;
          state.anchors[state.paw]![2] = view.feet[state.paw]!.at.z;
          state.steps++; state.paw = (state.paw + 1) % names.length; state.phase = "settle"; state.time = 0;
        } else if ((state.phase === "land" || state.phase === "return") && state.time >= T.placementLimit) {
          if (view.feet[state.paw]!.contact) { state.phase = "settle"; state.time = 0; }
          else {
            state.phase = "return"; state.time = 0; state.sequence++; state.lifted = false;
            state.to.splice(0, 3, ...state.from);
          }
        } else if (state.phase === "return" && state.time >= T.plant && view.feet[state.paw]!.contact) {
          state.phase = "settle"; state.time = 0;
        }
      }
      rotation.set(0, sin(state.yaw / 2), 0, cos(state.yaw / 2));
      rotation.multiplyToRef(root.rest, turned);
      state.command.rotation.splice(0, 4, turned.x, turned.y, turned.z, turned.w);
      state.command.endpoints.forEach((goal, i) => {
        rotation.multiplyToRef(own.built.segments.get(names[i]!)!.rest, turned);
        goal.rotation.splice(0, 4, turned.x, turned.y, turned.z, turned.w);
        goal.target.splice(0, 3, ...state.anchors[i]!); goal.bearing = true;
        if (i === state.paw && (state.phase === "swing" || state.phase === "land" || state.phase === "return")) {
          goal.target.splice(0, 3, ...state.to);
          goal.bearing = false;
        }
      });
      return state.command;
    },
  };
  return skill;
}
