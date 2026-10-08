import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import type { OwnBody } from "../mind/mind.ts";
import type { Orders } from "../mind/orders.ts";
import type { Skill } from "../skills/skill.ts";
import type { supportedMotor, SupportedCommand } from "../control/supported-motor.ts";
import { atan2, cos, sin } from "../math/real.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { REPTILE_TROT } from "./tuning.ts";
import type { QuadrupedView } from "./crawl.ts";

/** Travel admission reads the body's actual heading against the requested direction. */
export function headingAligned(yaw: number, face: Orders["face"], maximum: number): boolean {
  if (!face || !(face.x * face.x + face.z * face.z > 0)) return true;
  const angle = atan2(face.x, face.z) - yaw;
  return Math.abs(atan2(sin(angle), cos(angle))) <= maximum;
}

/** Diagonal support pairs carry continuous travel; every counted paw clears and reloads the ground. */
export function trot(own: OwnBody, motor: ReturnType<typeof supportedMotor>, names: readonly string[], T = REPTILE_TROT) {
  const root = motor.root, nominal = names.map(name => own.built.segments.get(name)!.spec.points!.sole!.value);
  const mass = own.spec.mass.value, reference = own.spec.segments.reduce((c, p) => {
    const m = p.mass.value / mass, at = p.centreOfMass.value;
    return [c[0] + m * at[0], c[1] + m * at[1], c[2] + m * at[2]] as Vec3;
  }, [0, 0, 0] as Vec3);
  const q = root.node.rotationQuaternion!;
  const groups = names.map((_name, i) => [i]);
  if (names.length === 4) {
    let opposite = 1, farthest = 0;
    for (let i = 1; i < names.length; i++) {
      const dx = nominal[i]![0] - nominal[0]![0], dz = nominal[i]![2] - nominal[0]![2], squared = dx * dx + dz * dz;
      if (squared > farthest) { opposite = i; farthest = squared; }
    }
    groups.splice(0, groups.length, [0, opposite], names.map((_name, i) => i).filter(i => i !== 0 && i !== opposite));
  }
  const state = {
    phase: "settle" as "settle" | "swing" | "land" | "return", time: 0, paw: 0, steps: 0, sequence: 0, yaw: 0, standing: false, lifted: false,
    centre: [motor.state.centre.x, reference[1], motor.state.centre.z] as [number, number, number],
    anchors: motor.state.endpoints.map(e => [e.at.x, e.ground, e.at.z] as [number, number, number]),
    targets: motor.state.endpoints.map(e => [e.at.x, e.ground, e.at.z] as [number, number, number]),
    liftedPaws: names.map(() => false),
    command: {
      centre: [motor.state.centre.x, reference[1], motor.state.centre.z] as [number, number, number],
      velocity: [0, 0, 0] as [number, number, number], rotation: [q.x, q.y, q.z, q.w] as [number, number, number, number],
      endpoints: motor.state.endpoints.map((e, i) => ({ target: [e.at.x, nominal[i]![1], e.at.z] as [number, number, number],
        bearing: true, rotation: [0, 0, 0, 1] as [number, number, number, number] })),
      posture: {} as Record<string, number>,
    },
  };
  const rotation = new Quaternion(), turned = new Quaternion();
  const resume = (view: QuadrupedView) => {
    state.phase = "settle"; state.time = 0; state.sequence++; state.yaw = view.yaw; state.standing = false;
    state.centre[0] = view.centre.x; state.centre[2] = view.centre.z;
    state.command.velocity.fill(0);
    view.feet.forEach((e, i) => { state.anchors[i]![0] = e.at.x; state.anchors[i]![1] = e.ground; state.anchors[i]![2] = e.at.z; });
  };
  const skill: Skill<QuadrupedView> & { readonly state: typeof state; command(view: QuadrupedView, intent: Orders, dt: number): SupportedCommand } = {
    state, resume,
    command(view, intent, dt) {
      const face = intent.face ?? intent.move;
      let error = 0;
      if (face && (face.x * face.x + face.z * face.z) > 0) {
        const angle = atan2(face.x, face.z), d = angle - state.yaw;
        error = atan2(sin(d), cos(d));
      }
      const moving = !!intent.move || Math.abs(error) > T.turnError;
      state.time += dt;
      const free = groups[state.paw]!;
      view.feet.forEach((e, i) => {
        if (e.contact && (!free.includes(i) || state.phase === "settle")) {
          state.anchors[i]![0] = e.at.x; state.anchors[i]![1] = e.ground; state.anchors[i]![2] = e.at.z;
        }
      });
      const average = [0, 0, 0];
      for (const anchor of state.anchors) for (let k = 0; k < 3; k++) average[k] += anchor[k]! / names.length;
      const ground = average[1]!;
      let vx = 0, vz = 0;
      const delayed = state.phase === "return" || state.phase === "land" && state.time >= T.landingWait
        || state.phase === "settle" && state.time >= T.landingWait && !view.feet.every(foot => foot.contact);
      if (intent.move && !delayed && headingAligned(view.yaw, face, T.turnMoveAngle)) {
        const length = Math.sqrt(intent.move.x * intent.move.x + intent.move.z * intent.move.z);
        const scale = length ? T.speed * Math.min(1, length) / length : 0;
        vx = intent.move.x * scale; vz = intent.move.z * scale;
        const s = sin(view.yaw), c = cos(view.yaw), sideways = (vx * c - vz * s) * (1 - T.sideways);
        vx -= sideways * c; vz += sideways * s;
      }
      const dvx = vx - state.command.velocity[0], dvz = vz - state.command.velocity[2], change = Math.sqrt(dvx * dvx + dvz * dvz);
      const fraction = change ? Math.min(1, T.acceleration * dt / change) : 0;
      state.command.velocity[0] += fraction * dvx; state.command.velocity[2] += fraction * dvz;
      state.yaw += Math.max(-T.turnRate * dt, Math.min(T.turnRate * dt, error));
      const travelling = moving || Math.abs(state.command.velocity[0]) + Math.abs(state.command.velocity[2]) > 0;
      if (travelling) { state.centre[0] = view.centre.x; state.centre[2] = view.centre.z; }
      else if (!state.standing) {
        const c = cos(state.yaw), s = sin(state.yaw);
        state.centre[0] = average[0]! + c * reference[0] + s * reference[2];
        state.centre[2] = average[2]! - s * reference[0] + c * reference[2];
      }
      state.standing = !travelling;
      state.command.centre[0] = state.centre[0]; state.command.centre[2] = state.centre[2];
      state.command.centre[1] = ground + reference[1] * (travelling || state.phase !== "settle" ? T.crawlHeight : 1);
      if (state.phase === "settle" && moving && state.time >= T.settle && view.feet.every(e => e.contact)) {
        state.phase = "swing"; state.time = 0; state.sequence++; state.lifted = false;
        state.liftedPaws.fill(false);
        for (const i of free) {
          const n = nominal[i]!, c = cos(state.yaw), s = sin(state.yaw), x = n[0] - reference[0], z = n[2] - reference[2];
          state.targets[i]![0] = view.centre.x + c * x + s * z + state.command.velocity[0] * T.lead;
          state.targets[i]![1] = ground;
          state.targets[i]![2] = view.centre.z - s * x + c * z + state.command.velocity[2] * T.lead;
        }
      } else if (state.phase !== "settle") {
        if (state.phase === "swing") {
          for (const i of free) if (!view.feet[i]!.contact && view.feet[i]!.low - view.feet[i]!.ground > T.liftConfirm) state.liftedPaws[i] = true;
          state.lifted = free.every(i => state.liftedPaws[i]);
          if (state.time >= T.swing) { state.phase = "land"; state.time = 0; }
        } else if (state.phase === "land" && state.lifted && free.every(i => view.feet[i]!.contact)) {
          for (const i of free) { state.anchors[i]![0] = view.feet[i]!.at.x; state.anchors[i]![1] = view.feet[i]!.ground; state.anchors[i]![2] = view.feet[i]!.at.z; }
          state.steps += free.length; state.paw = (state.paw + 1) % groups.length; state.phase = "settle"; state.time = 0;
        } else if ((state.phase === "land" || state.phase === "return") && state.time >= T.placementLimit) {
          if (free.every(i => view.feet[i]!.contact)) { state.phase = "settle"; state.time = 0; }
          else {
            state.phase = "return"; state.time = 0; state.sequence++; state.lifted = false;
            for (const i of free) state.targets[i]!.splice(0, 3, ...state.anchors[i]!);
          }
        } else if (state.phase === "return" && state.time >= T.plant && free.every(i => view.feet[i]!.contact)) {
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
        if (groups[state.paw]!.includes(i) && (state.phase === "swing" || state.phase === "land" || state.phase === "return")) {
          goal.target.splice(0, 3, ...state.targets[i]!);
          goal.bearing = false;
        }
      });
      return state.command;
    },
  };
  return skill;
}
