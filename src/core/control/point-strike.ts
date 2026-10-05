import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyObservation } from "../observation.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { deepFreeze } from "../state.ts";
import type { MotionCommand } from "./tasks.ts";

type FrameGoal = MotionCommand["frames"][number];
interface Effector {
  readonly id: string;
  readonly frame: FrameGoal["frame"];
  readonly at: Vec3;
  readonly guard: Vec3;
  readonly target: Vec3;
}
interface Settings {
  readonly effectors: readonly Effector[];
  readonly joints: MotionCommand["joints"];
  readonly hold: MotionCommand["frames"];
  readonly seconds: number;
  readonly weight: number;
  readonly tolerance: number;
  readonly readySeconds: number;
  readonly strikeSeconds: number;
  readonly followSeconds: number;
  readonly returnSeconds: number;
}

/**
 * Optional point-space strike reference. Named segment or item points share a motion solve.
 * A measured guard precedes a quintic strike, follow-through and measured return. There is no
 * hit authority here: contacts and task scoring remain physical observations of the host world.
 */
export function pointStrike(settings: Settings, equipment: readonly { readonly id: string; readonly centre: Vec3 }[] = []) {
  if (!settings.effectors.length || ![settings.seconds, settings.weight, settings.tolerance, settings.readySeconds,
    settings.strikeSeconds, settings.followSeconds, settings.returnSeconds].every((v) => Number.isFinite(v) && v > 0)) throw new Error("invalid point strike settings");
  const config = deepFreeze(structuredClone(settings));
  const centres = new Map(equipment.map((item) => [item.id, [...item.centre] as Vec3]));
  if (config.effectors.some((g) => g.frame.kind === "item" && !centres.has(g.frame.id))) throw new Error("strike item has no centre in its model");
  const state = { phase: "prepare" as "prepare" | "strike" | "follow" | "return" | "complete", time: 0, ready: 0,
    start: [] as { position: Vec3; velocity: Vec3 }[] };
  const position = new Vector3(), offset = new Vector3(), velocity = new Vector3(), spin = new Vector3(), rotation = new Quaternion();
  const read = (observation: BodyObservation, goal: Effector) => {
    const frame = goal.frame;
    const part = frame.kind === "segment" ? observation.segments.find((s) => s.name === frame.name)
      : observation.equipment?.find((s) => s.id === frame.id);
    if (!part) throw new Error("strike effector is absent from observation");
    rotation.set(...part.rotation);
    position.set(...goal.at).applyRotationQuaternionToRef(rotation, position).addInPlaceFromFloats(...part.position);
    if (frame.kind === "segment") {
      const segment = observation.segments.find((s) => s.name === frame.name)!;
      offset.set(...segment.centre);
    } else {
      offset.set(...centres.get(frame.id)!).applyRotationQuaternionToRef(rotation, offset).addInPlaceFromFloats(...part.position);
    }
    position.subtractToRef(offset, offset);
    spin.set(...part.spin); velocity.set(...part.velocity);
    Vector3.CrossToRef(spin, offset, offset); velocity.addInPlace(offset);
    return { position: [position.x, position.y, position.z] as Vec3, velocity: [velocity.x, velocity.y, velocity.z] as Vec3 };
  };
  const begin = (phase: typeof state.phase, readings: typeof state.start) => {
    state.phase = phase; state.time = 0; state.ready = 0; state.start = readings;
  };
  return { name: "point-strike-reference", state,
    idle() { if (state.phase !== "complete") begin("prepare", []); },
    step(observation: BodyObservation, dt: number): MotionCommand {
      const readings = config.effectors.map((g) => read(observation, g));
      const ready = readings.every((p, i) => p.position.reduce((sum, v, k) => sum + (v - config.effectors[i]!.guard[k]!) * (v - config.effectors[i]!.guard[k]!), 0) <= config.tolerance * config.tolerance);
      switch (state.phase) {
        case "prepare":
          state.ready = ready ? state.ready + dt : 0;
          if (state.ready >= config.readySeconds) begin("strike", readings);
          break;
        case "strike": if (state.time >= config.strikeSeconds) begin("follow", readings); break;
        case "follow": if (state.time >= config.followSeconds) begin("return", readings); break;
        case "return":
          state.ready = state.time >= config.returnSeconds && ready ? state.ready + dt : 0;
          if (state.ready >= config.readySeconds) begin("complete", readings);
          break;
        case "complete": break;
        default: { const never: never = state.phase; throw new Error(`unknown strike phase ${never}`); }
      }
      const frames = config.effectors.map((g, i): FrameGoal => {
        const moving = state.phase === "strike" || state.phase === "return";
        const target = state.phase === "strike" || state.phase === "follow" ? g.target : g.guard;
        const path = moving ? trajectory(state.start[i]!, target, state.time, state.phase === "strike" ? config.strikeSeconds : config.returnSeconds)
          : { target, velocity: [0, 0, 0] as Vec3, acceleration: [0, 0, 0] as Vec3 };
        return { id: g.id, frame: g.frame, at: g.at, translation: { ...path, seconds: config.seconds, weight: config.weight } };
      });
      state.time += dt;
      return { joints: config.joints, frames: [...config.hold, ...frames], grips: [] };
    },
  };
}

/** Quintic Hermite interpolation: measured initial velocity, zero endpoint velocity/accelerations. */
function trajectory(start: { position: Vec3; velocity: Vec3 }, finish: Vec3, time: number, seconds: number) {
  if (time >= seconds) return { target: finish, velocity: [0, 0, 0] as Vec3, acceleration: [0, 0, 0] as Vec3 };
  const u = time / seconds, target: number[] = [], velocity: number[] = [], acceleration: number[] = [];
  for (let k = 0; k < 3; k++) {
    const p = start.position[k]!, v = start.velocity[k]! * seconds, d = finish[k]! - p;
    const a = 10 * d - 6 * v, b = -15 * d + 8 * v, c = 6 * d - 3 * v;
    target.push(p + u * (v + u * u * (a + u * (b + u * c))));
    velocity.push((v + u * u * (3 * a + u * (4 * b + u * 5 * c))) / seconds);
    acceleration.push(u * (6 * a + u * (12 * b + u * 20 * c)) / (seconds * seconds));
  }
  return { target: target as unknown as Vec3, velocity: velocity as unknown as Vec3, acceleration: acceleration as unknown as Vec3 };
}
