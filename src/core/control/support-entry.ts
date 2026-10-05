import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyObservation } from "../observation.ts";
import type { BodyAction } from "../mind/body-actions.ts";
import { deepFreeze } from "../state.ts";
import type { MotionModel } from "./tasks.ts";

type Lie = "front" | "back" | "left" | "right";
interface Pose { readonly targets: Readonly<Record<string, number>>; readonly seconds: number }
interface Settings {
  readonly root: string;
  readonly reference: readonly [number, number, number, number];
  readonly facing: number;
  readonly required: readonly string[];
  readonly forbidden: readonly string[];
  readonly slow: number;
  readonly stillSeconds: number;
  readonly settleLimit: number;
  readonly holdLimit: number;
  readonly response: number;
  readonly speed: number;
  readonly roll: Readonly<Record<Exclude<Lie, "front">, readonly Pose[]>>;
  readonly prepare: readonly Pose[];
  readonly targets: Readonly<Record<string, number>>;
}

/** Measured support, independent of which policy requested the pose. */
export function supportEntryReading(observation: BodyObservation, settings: Pick<Settings,
  "root" | "reference" | "facing" | "required" | "forbidden" | "slow">) {
  const root = observation.segments.find((s) => s.name === settings.root);
  if (!root) throw new Error("support entry has no root observation");
  const relative = new Quaternion(...root.rotation).normalize().multiply(Quaternion.Inverse(new Quaternion(...settings.reference).normalize()));
  const forward = new Vector3(0, 0, 1).applyRotationQuaternionToRef(relative, new Vector3());
  const left = new Vector3(-1, 0, 0).applyRotationQuaternionToRef(relative, new Vector3());
  const lie: Lie = forward.y > settings.facing ? "back" : forward.y < -settings.facing ? "front" : left.y < 0 ? "left" : "right";
  const contact = new Set(observation.contacts.filter((c) => c.fixed !== null && c.impulse > 0).map((c) => c.segment));
  const supported = lie === "front" && settings.required.every((name) => contact.has(name)) && !settings.forbidden.some((name) => contact.has(name));
  const still = observation.segments.every((s) => s.velocity[0] * s.velocity[0] + s.velocity[1] * s.velocity[1]
    + s.velocity[2] * s.velocity[2] < settings.slow * settings.slow);
  return { lie, supported, still };
}

/** Optional pose-sequence policy: settle, orient, acquire support, and retry from actual motion. */
export function supportEntry(model: Pick<MotionModel, "channels">, input: Settings) {
  const settings = deepFreeze(structuredClone(input));
  const referenceLength = settings.reference.reduce((sum, v) => sum + v * v, 0);
  if (![settings.facing, settings.slow, settings.stillSeconds, settings.settleLimit, settings.holdLimit,
    settings.response, settings.speed].every((v) => v > 0 && Number.isFinite(v)) || settings.facing >= 1
    || !settings.required.length || !settings.prepare.length || settings.reference.length !== 4
    || !Array.from(settings.reference).every(Number.isFinite) || !(referenceLength > 0) || !Number.isFinite(referenceLength)
    || new Set(settings.required).size !== settings.required.length || settings.required.some((name) => settings.forbidden.includes(name))) throw new Error("invalid support entry settings");
  for (const sequence of [settings.prepare, settings.roll.back, settings.roll.left, settings.roll.right]) {
    if (!sequence.length || sequence.some((p) => !(p.seconds > 0) || !Number.isFinite(p.seconds))) throw new Error("invalid support entry sequence");
  }
  for (const targets of [settings.targets, ...settings.prepare.map((p) => p.targets), ...Object.values(settings.roll).flat().map((p) => p.targets)]) {
    if (Object.keys(targets).length !== model.channels.length || model.channels.some((c) =>
      !Number.isFinite(targets[c.name]) || targets[c.name]! < c.min || targets[c.name]! > c.max)) throw new Error("invalid support entry targets");
  }
  const state = { phase: "settle" as "settle" | "roll" | "prepare" | "hold", time: 0, still: 0, stage: 0,
    lie: "front" as Lie, attempts: 0, steps: 0 };
  const activation = model.channels.map(() => 0), velocity = model.channels.map(() => 0);
  return { name: "support-entry", state, step(observation: BodyObservation, dt: number): BodyAction {
    if (!(dt > 0) || !Number.isFinite(dt)) throw new Error("invalid support entry step");
    state.steps++; state.time += dt;
    const reading = supportEntryReading(observation, settings);
    if (state.phase === "settle") {
      state.still = reading.still ? state.still + dt : 0;
      if (state.still >= settings.stillSeconds || state.time >= settings.settleLimit) {
        state.lie = reading.lie; state.phase = reading.lie === "front" ? "prepare" : "roll";
        state.time = 0; state.stage = 0; state.attempts++;
      }
    }
    let sequence: readonly Pose[] | undefined;
    switch (state.phase) {
      case "settle": case "hold": break;
      case "prepare": sequence = settings.prepare; break;
      case "roll":
        if (state.lie === "front") throw new Error("front-facing entry cannot roll");
        sequence = settings.roll[state.lie]; break;
      default: { const never: never = state.phase; throw new Error(`unknown entry phase ${never}`); }
    }
    let pose = sequence?.[state.stage];
    if (pose && state.time >= pose.seconds) {
      state.stage++; state.time = 0;
      if (state.stage === sequence!.length) { state.phase = state.phase === "prepare" ? "hold" : "settle"; state.still = 0; }
      pose = sequence![state.stage];
    }
    if (state.phase === "hold" && state.time >= settings.holdLimit && !reading.supported) {
      state.phase = "settle"; state.time = 0; state.still = 0;
    }
    const targets = pose?.targets ?? settings.targets;
    for (let i = 0; i < model.channels.length; i++) {
      activation[i] = state.phase === "settle" ? 0 : 1;
      velocity[i] = Math.max(-settings.speed, Math.min(settings.speed,
        (targets[model.channels[i]!.name]! - observation.joints[i]!.angle) / settings.response));
    }
    return { kind: "velocity", activation, velocity };
  } };
}
