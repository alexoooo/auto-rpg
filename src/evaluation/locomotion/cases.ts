/**
 * **The Locomotion drill's cases**: a lone body under the subject's mind (`lone.ts`), given orders
 * and shoves by a script, its gaits the ones its mind chooses for them. Each trial is one of:
 *
 * - `walk`: told to walk `way` degrees from forward (+z, toward +x) at `pace` m/s, facing forward,
 *   from `START` s for `WALK` s, then to stop;
 * - `run`: told to go forward with no pace, facing the way it goes, for `RUN` s, then to stop;
 * - `turn`: told to go forward with no pace for `WALK` s, then `way` degrees aside for `WALK` s, then
 *   to stop;
 * - `shove`: standing, shoved level at the middle trunk by `impulse` N s from `way` degrees at
 *   `SHOVE` s;
 * - `shoved-walk`: told to walk forward at `pace` for `WALK` s, then to stop, and shoved by
 *   `impulse` from `way` degrees `SETTLE` s after the stop is asked.
 *
 * Calm air, no balance unless its character has one. A change here is a new protocol.
 */
import { CONTROLLERS } from "../../core/mind/controllers.ts";
import { presetFitsModel } from "../../core/mind/controller.ts";
import type { MindConfig } from "../../core/mind/config.ts";
import type { Orders } from "../../core/mind/orders.ts";
import { cos, sin } from "../../core/math/real.ts";
import type { BodyModel } from "../../core/models.ts";
import { deepFreeze } from "../../core/state.ts";
import type { Cases, Json, Subject } from "../evaluation.ts";
import type { BuiltLone, LoneCue } from "../lone.ts";
import { readLocomotion, type LocomotionReading } from "./read.ts";

/** When a trial's first order comes, how long a walk or a turn's leg lasts, a run, the standing shove's time, and how long after a stop the walked body is shoved, s. */
export const START = 1, WALK = 4, RUN = 6, SHOVE = 2, SETTLE = 2;
/** How long a trial runs on after its last cue, s: what its stop or its shove is read over. */
export const AFTER = 4;

/** One trial: its kind, its body, and what the kind reads (`way` degrees from forward toward +x, `pace` m/s, `impulse` N s). */
export type LocomotionCondition =
  | { readonly kind: "walk"; readonly model: BodyModel; readonly way: number; readonly pace: number }
  | { readonly kind: "run"; readonly model: BodyModel }
  | { readonly kind: "turn"; readonly model: BodyModel; readonly way: number }
  | { readonly kind: "shove"; readonly model: BodyModel; readonly way: number; readonly impulse: number }
  | { readonly kind: "shoved-walk"; readonly model: BodyModel; readonly way: number; readonly impulse: number; readonly pace: number };

/** The screen: each body, the walk four ways at a slow and a brisk pace, a run, a turn each way, shoves eight ways at three sizes, and a shove four ways after a walk. */
const SCREEN = deepFreeze({
  models: ["workshop-fighter", "workshop-rogue"] as BodyModel[],
  ways: [0, 90, 180, 270], paces: [.3, .7], turns: [90, 270],
  shoves: { ways: [0, 45, 90, 135, 180, 225, 270, 315], impulses: [30, 45, 60] },
  walked: { ways: [0, 90, 180, 270], impulse: 20, pace: .3 },
});
type Protocol = typeof SCREEN;

/** Facing forward, +z. */
const FORWARD = deepFreeze({ x: 0, z: 1 });
/** The ground direction `degrees` from +z toward +x. */
const toward = (degrees: number) => { const way = degrees * Math.PI / 180; return { x: sin(way), z: cos(way) }; };
const STOP: Orders = deepFreeze({ move: null, face: FORWARD });

/** The script `condition` gives its body, and when its last cue comes, s. */
export function scriptOf(condition: LocomotionCondition): { readonly cues: readonly LoneCue[]; readonly last: number } {
  switch (condition.kind) {
    case "walk": return { last: START + WALK, cues: [
      { at: START, orders: { move: { kind: "direct", direction: toward(condition.way) }, pace: condition.pace, face: FORWARD } }, { at: START + WALK, orders: STOP }] };
    case "run": return { last: START + RUN, cues: [
      { at: START, orders: { move: { kind: "direct", direction: FORWARD }, face: null } }, { at: START + RUN, orders: STOP }] };
    case "turn": return { last: START + 2 * WALK, cues: [
      { at: START, orders: { move: { kind: "direct", direction: FORWARD }, face: null } },
      { at: START + WALK, orders: { move: { kind: "direct", direction: toward(condition.way) }, face: null } }, { at: START + 2 * WALK, orders: STOP }] };
    case "shove": return { last: SHOVE, cues: [{ at: 0, orders: STOP }, { at: SHOVE, shove: { impulse: condition.impulse, degrees: condition.way } }] };
    case "shoved-walk": return { last: START + WALK + SETTLE, cues: [
      { at: START, orders: { move: { kind: "direct", direction: FORWARD }, pace: condition.pace, face: FORWARD } }, { at: START + WALK, orders: STOP },
      { at: START + WALK + SETTLE, shove: { impulse: condition.impulse, degrees: condition.way } }] };
    default: { const never: never = condition; throw new Error(`no locomotion trial ${JSON.stringify(never)}`); }
  }
}

/** Why `value` cannot walk `model`: not a mind, or a named calibration that keeps it off that body. */
function faultsOf(value: Json, model: BodyModel, subject?: Subject): readonly string[] {
  const kind = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as { kind?: unknown }).kind : undefined;
  if (typeof kind !== "string" || !Object.hasOwn(CONTROLLERS, kind)) return [`no mind: a config names its kind (${Object.keys(CONTROLLERS).join(", ")})`];
  return presetFitsModel(subject ?? {}, model) ? [] : [`named calibration allows ${subject?.models?.join(", ") || "no bodies"}; ${model} is unavailable`];
}

/** The conditions of `protocol`, body by body, in the order the kinds are listed above. */
function conditionsOf(protocol: Protocol): LocomotionCondition[] {
  return protocol.models.flatMap((model): LocomotionCondition[] => [
    ...protocol.ways.flatMap((way) => protocol.paces.map((pace) => ({ kind: "walk" as const, model, way, pace }))),
    { kind: "run", model },
    ...protocol.turns.map((way) => ({ kind: "turn" as const, model, way })),
    ...protocol.shoves.impulses.flatMap((impulse) => protocol.shoves.ways.map((way) => ({ kind: "shove" as const, model, way, impulse }))),
    ...protocol.walked.ways.map((way) => ({ kind: "shoved-walk" as const, model, way, impulse: protocol.walked.impulse, pace: protocol.walked.pace })),
  ]);
}

function locomotionCases(protocol: Protocol): Cases<LocomotionCondition, LocomotionReading, BuiltLone> {
  return {
    arity: 1,
    play: protocol as unknown as Json,
    conditions: conditionsOf(protocol),
    seconds: START + 2 * WALK + SETTLE + AFTER,
    faults: (value, { model }, subject) => faultsOf(value, model, subject),
    world: ([mind], condition, engine, [character]) => ({ kind: "lone", engine,
      lone: { model: condition.model, mind: mind as unknown as MindConfig, script: scriptOf(condition).cues,
        ...(character && Object.keys(character).length > 0 ? { character } : {}) } }),
    read: (built, condition) => readLocomotion(built, condition),
  };
}

/** Every protocol the drill may be played on, by name. */
export const LOCOMOTION_CASES: Readonly<Record<string, Cases<LocomotionCondition, LocomotionReading, BuiltLone>>> = Object.freeze({
  screen: locomotionCases(SCREEN),
});
