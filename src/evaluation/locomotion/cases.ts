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
 *   `impulse` from `way` degrees `SETTLE` s after the stop is asked;
 * - `run-held`: told to run forward with no pace for `RUN_UP` s and `HOLD` s more, then to stop;
 * - `run-turn`: told to run forward at `TURNING_PACE` for `RUN_UP` s, then the way asked turning
 *   `way` times `TURN_RATE` rad/s for a circle, then to stop;
 * - `run-stop`: told to run forward at `STOPPING_PACE` for `RUN_UP` s and `SETTLE` s more, then to stop.
 *
 * A trial may name what the body holds (`loadout`, empty hands where it names none), the lab's
 * gusts (`gusts`, `LAB_GUSTS`) and the seed of its mind's chance and the gusts (`seed`). Calm
 * air, no balance unless its character has one. A change here is a new protocol.
 */
import { CONTROLLERS } from "../../entrants/game.ts";
import { presetFitsModel } from "../../core/mind/controller.ts";
import type { MindConfig } from "../../core/mind/config.ts";
import type { Orders } from "../../core/intent/orders.ts";
import { cos, sin } from "../../core/math/real.ts";
import type { BodyModel } from "../../core/models.ts";
import { loadoutKey, REPRESENTATIVE, type Loadout } from "../../core/items/held.ts";
import { deepFreeze } from "../../core/state.ts";
import type { Cases, Json, Subject } from "../evaluation.ts";
import type { BuiltLone, LoneCue } from "../lone.ts";
import { readLocomotion, type LocomotionReading } from "./read.ts";

/** When a trial's first order comes, how long a walk or a turn's leg lasts, a run, the standing shove's time, and how long after a stop the walked body is shoved, s. */
export const START = 1, WALK = 4, RUN = 6, SHOVE = 2, SETTLE = 2;

/**
 * The run's bar: how long a run is given to come up to speed, and how long it is then held, s; the
 * pace a turning run is asked, m/s, and how fast its way turns, rad/s; the pace a run is stopped
 * from, m/s; and how often a turning way is given again, s.
 */
export const RUN_UP = 3, HOLD = 10, TURNING_PACE = 2, TURN_RATE = 1, STOPPING_PACE = 3, TURN_CUE = .1;
/** How long a trial runs on after its last cue, s: what its stop or its shove is read over. */
export const AFTER = 4;

/** One trial: its kind, its body, and what the kind reads (`way` degrees from forward toward +x, `pace` m/s, `impulse` N s). */
export type LocomotionCondition = Held & (
  | { readonly kind: "walk"; readonly model: BodyModel; readonly way: number; readonly pace: number }
  | { readonly kind: "run"; readonly model: BodyModel }
  | { readonly kind: "turn"; readonly model: BodyModel; readonly way: number }
  | { readonly kind: "shove"; readonly model: BodyModel; readonly way: number; readonly impulse: number }
  | { readonly kind: "shoved-walk"; readonly model: BodyModel; readonly way: number; readonly impulse: number; readonly pace: number }
  | { readonly kind: "run-held"; readonly model: BodyModel }
  | { readonly kind: "run-turn"; readonly model: BodyModel; readonly way: 1 | -1 }
  | { readonly kind: "run-stop"; readonly model: BodyModel });

/** What a trial may name beside its kind: what its body holds, the lab's gusts, and its seed. */
type Held = { readonly loadout?: Loadout; readonly gusts?: true; readonly seed?: number };

/** The screen: each body, the walk four ways at a slow and a brisk pace, a run, a turn each way, shoves eight ways at three sizes, and a shove four ways after a walk. */
const SCREEN = deepFreeze({
  models: ["workshop-fighter", "workshop-rogue"] as BodyModel[],
  ways: [0, 90, 180, 270], paces: [.3, .7], turns: [90, 270],
  shoves: { ways: [0, 45, 90, 135, 180, 225, 270, 315], impulses: [30, 45, 60] },
  walked: { ways: [0, 90, 180, 270], impulse: 20, pace: .3 },
});
type Protocol = typeof SCREEN;

/**
 * The walk on every body in every rated loadout (`REPRESENTATIVE`): the screen's trials, and its
 * walks again in the lab's gusts.
 */
const EVERY = deepFreeze({ ...SCREEN, models: ["workshop-fighter", "workshop-rogue", "crypt-skeleton"] as BodyModel[], loadouts: REPRESENTATIVE as Loadout[], gusts: true });

/** The run's bar on the Warrior and the Rogue in every rated loadout: each run trial in calm air and the lab's gusts, seeds 1 to 4. */
const RUN_BAR = deepFreeze({ models: ["workshop-fighter", "workshop-rogue"] as BodyModel[], loadouts: REPRESENTATIVE as Loadout[], seeds: [1, 2, 3, 4], airs: [false, true] });

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
    case "run-held": return { last: START + RUN_UP + HOLD, cues: [
      { at: START, orders: { move: { kind: "direct", direction: FORWARD }, gait: "run", face: null } }, { at: START + RUN_UP + HOLD, orders: STOP }] };
    case "run-turn": {
      const cues: LoneCue[] = [{ at: START, orders: { move: { kind: "direct", direction: FORWARD }, pace: TURNING_PACE, gait: "run", face: null } }];
      for (let k = 1; k * TURN_CUE <= TURNING; k++) {
        const angle = condition.way * TURN_RATE * k * TURN_CUE;
        cues.push({ at: START + RUN_UP + k * TURN_CUE, orders: { move: { kind: "direct", direction: { x: sin(angle), z: cos(angle) } }, pace: TURNING_PACE, gait: "run", face: null } });
      }
      cues.push({ at: START + RUN_UP + TURNING, orders: STOP });
      return { last: START + RUN_UP + TURNING, cues };
    }
    case "run-stop": return { last: START + RUN_UP + SETTLE, cues: [
      { at: START, orders: { move: { kind: "direct", direction: FORWARD }, pace: STOPPING_PACE, gait: "run", face: null } }, { at: START + RUN_UP + SETTLE, orders: STOP }] };
    default: { const never: never = condition; throw new Error(`no locomotion trial ${JSON.stringify(never)}`); }
  }
}

/** Why `value` cannot walk `model`: not a mind, or a named calibration that keeps it off that body. */
function faultsOf(value: Json, model: BodyModel, subject?: Subject): readonly string[] {
  const kind = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as { kind?: unknown }).kind : undefined;
  if (typeof kind !== "string" || !Object.hasOwn(CONTROLLERS, kind)) return [`no mind: a config names its kind (${Object.keys(CONTROLLERS).join(", ")})`];
  return presetFitsModel(subject ?? {}, model) ? [] : [`named calibration allows ${subject?.models?.join(", ") || "no bodies"}; ${model} is unavailable`];
}

/** How long a turning run's way turns: a circle at `TURN_RATE`, s. */
export const TURNING = 2 * Math.PI / TURN_RATE;

/** The conditions of `protocol`, body by body, in the order the kinds are listed above. */
function conditionsOf(protocol: Protocol): LocomotionCondition[] {
  return screenOf(protocol, {});
}

/** The screen's trials of `protocol` on each of its bodies, each naming `held`. */
function screenOf(protocol: Protocol, held: Held): LocomotionCondition[] {
  return protocol.models.flatMap((model): LocomotionCondition[] => [
    ...protocol.ways.flatMap((way) => protocol.paces.map((pace) => ({ kind: "walk" as const, model, way, pace }))),
    { kind: "run" as const, model },
    ...protocol.turns.map((way) => ({ kind: "turn" as const, model, way })),
    ...protocol.shoves.impulses.flatMap((impulse) => protocol.shoves.ways.map((way) => ({ kind: "shove" as const, model, way, impulse }))),
    ...protocol.walked.ways.map((way) => ({ kind: "shoved-walk" as const, model, way, impulse: protocol.walked.impulse, pace: protocol.walked.pace })),
  ].map((condition) => ({ ...condition, ...held })));
}

/** The walk on every body in every loadout (`EVERY`): the screen's trials holding each, then its walks in the gusts. */
const everyOf = (protocol: typeof EVERY): LocomotionCondition[] => protocol.loadouts.flatMap((loadout) => [
  ...screenOf(protocol, { loadout }),
  ...screenOf(protocol, { loadout, gusts: true }).filter((condition) => condition.kind === "walk")]);

/** The run's bar's trials (`RUN_BAR`): each body and loadout, each run trial, in each air and seed. */
const runsOf = (protocol: typeof RUN_BAR): LocomotionCondition[] => protocol.models.flatMap((model) => protocol.loadouts.flatMap((loadout) =>
  protocol.airs.flatMap((gusts) => protocol.seeds.flatMap((seed): LocomotionCondition[] => {
    const held: Held = { loadout, seed, ...(gusts ? { gusts: true as const } : {}) };
    return [{ kind: "run-held", model, ...held }, { kind: "run-turn", model, way: 1, ...held }, { kind: "run-turn", model, way: -1, ...held }, { kind: "run-stop", model, ...held }];
  }))));

/** How long a trial of `conditions` plays at most: its last cue and `AFTER`, s. */
const longest = (conditions: readonly LocomotionCondition[]) => Math.max(...conditions.map((condition) => scriptOf(condition).last)) + AFTER;

function locomotionCases(play: Json, conditions: readonly LocomotionCondition[]): Cases<LocomotionCondition, LocomotionReading, BuiltLone> {
  return {
    arity: 1,
    play,
    conditions,
    seconds: longest(conditions),
    faults: (value, { model }, subject) => faultsOf(value, model, subject),
    world: ([mind], condition, engine, [character]) => ({ kind: "lone", engine,
      lone: { model: condition.model, mind: mind as unknown as MindConfig, script: scriptOf(condition).cues,
        ...(character && Object.keys(character).length > 0 ? { character } : {}),
        ...(condition.loadout && loadoutKey(condition.loadout) !== "empty,empty" ? { loadout: condition.loadout } : {}),
        ...(condition.gusts ? { gusts: true as const } : {}), ...(condition.seed !== undefined ? { seed: condition.seed } : {}) } }),
    read: (built, condition) => readLocomotion(built, condition),
  };
}

/** Every protocol the drill may be played on, by name. */
export const LOCOMOTION_CASES: Readonly<Record<string, Cases<LocomotionCondition, LocomotionReading, BuiltLone>>> = Object.freeze({
  screen: locomotionCases(SCREEN as unknown as Json, conditionsOf(SCREEN)),
  every: locomotionCases(EVERY as unknown as Json, everyOf(EVERY)),
  run: locomotionCases(RUN_BAR as unknown as Json, runsOf(RUN_BAR)),
});
