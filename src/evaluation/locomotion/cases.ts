/**
 * **The Locomotion drill's cases**: a lone body under the subject's mind (`lone.ts`) on an open floor
 * (`OPEN_FLOOR`: a run goes further than the arena's parapet and passes through its ring of posts),
 * given orders and shoves by a script, its gaits the ones its mind chooses for them. Each trial is one of:
 *
 * - `walk`: told to walk `way` degrees from forward (+z, toward +x) at `pace` m/s, facing forward,
 *   from `START` s for `WALK` s, then to stop;
 * - `run`: told to go forward with no pace, facing the way it goes, for `RUN` s, then to stop;
 * - `turn`: told to go forward with no pace for `WALK` s, then `way` degrees aside for `WALK` s, then
 *   to stop;
 * - `shove`: standing, shoved level at the middle trunk by `impulse` N s from `way` degrees at
 *   `SHOVE` s; a protocol names the Warrior's impulses, and each body is shoved by its own share
 *   of them (`shoveOf`);
 * - `shoved-walk`: told to walk forward at `pace` for `WALK` s, then to stop, and shoved by
 *   `impulse` from `way` degrees `SETTLE` s after the stop is asked;
 * - `run-held`: told to run forward with no pace for `RUN_UP` s and `HOLD` s more, then to stop;
 * - `run-turn`: told to run forward at `TURNING_PACE` for `RUN_UP` s, then the way asked turning
 *   `way` times `TURN_RATE` rad/s for a circle, then to stop;
 * - `run-stop`: told to run forward at `STOPPING_PACE` for `RUN_UP` s and `SETTLE` s more, then to stop;
 * - `run-route`: told to run with no pace to a place by a route `COURSE.leg` m forward, then
 *   `COURSE.aside` m to the side `way` names (1 toward +x), met within the commanders' arrival;
 * - `run-moved`: told to run with no pace to a place `COURSE.ahead` m forward, which moves
 *   `COURSE.aside` m to the side `way` names `RUN_UP` s on, as the body runs;
 * - `walk-run`: told to walk forward at `WALKING_PACE` for `RUN_UP` s, then to run forward with no
 *   pace for `RUN_UP` s and `SETTLE` s more, then to stop.
 *
 * A trial may name what the body holds (`loadout`, empty hands where it names none), the lab's
 * gusts (`gusts`, `labGusts`: the Warrior's, scaled by the body's mass) and the seed of its mind's chance and the gusts (`seed`). Calm
 * air, no balance unless its character has one. A change here is a new protocol.
 */
import { mindOf } from "../evaluation.ts";
import { presetFitsModel } from "../../minds/catalog/controller.ts";
import type { Orders } from "../../minds/orders.ts";
import { cos, sin } from "../../core/math/real.ts";
import { modelHolding, modelSpec, type BodyModel } from "../../core/bodies/models.ts";
import { EMPTY_LOADOUT, loadoutKey, type Loadout } from "../../core/bodies/items/held.ts";
import { heldPace } from "../../control/stance/stance-envelope.ts";
import { stanceEnvelopeOf } from "../../skills/locomotion/stance/envelope.ts";
import { REPRESENTATIVE } from "../loadouts.ts";
import { deepFreeze } from "../../core/state.ts";
import type { Cases, Json, Subject } from "../evaluation.ts";
import { OPEN_FLOOR, type BuiltLone, type LoneCue } from "../lone.ts";
import { readLocomotion, type LocomotionReading } from "./read.ts";
import { between, later, turned } from "../twin.ts";
import { type GameContext } from "../../game/arena/context.ts";
import { ARRIVAL } from "../../minds/command/goals.ts";

/** When a trial's first order comes, and how long a walk or a turn's leg lasts, s. */
export const START = 1, WALK = 4;

/** How long a run lasts, the standing shove's time, and how long after a stop the walked body is shoved, s. */
const RUN = 6, SHOVE = 2, SETTLE = 2;

/**
 * The run's bar: how long a run is given to come up to speed, and how long it is then held, s; the
 * pace a turning run is asked, m/s, and how fast its way turns, rad/s; and the pace a run is
 * stopped from, m/s.
 */
export const RUN_UP = 3, HOLD = 10, TURNING_PACE = 2, TURN_RATE = 1, STOPPING_PACE = 3;

/** The pace a run is started from while walking, m/s. */
const WALKING_PACE = 1;

/**
 * A run to a place: a route's first leg and how far a goal is ahead, and how far the route's second
 * leg or the moved goal is to the side, m. A place held to the end is to be reached in the time its
 * legs take at `STOPPING_PACE` after the run-up.
 */
const COURSE = deepFreeze({ leg: 15, ahead: 24, aside: 9 });

/** How often a turning way is given again, s. */
const TURN_CUE = .1;

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
  | { readonly kind: "run-stop"; readonly model: BodyModel }
  | { readonly kind: "run-route"; readonly model: BodyModel; readonly way: 1 | -1 }
  | { readonly kind: "run-moved"; readonly model: BodyModel; readonly way: 1 | -1 }
  | { readonly kind: "walk-run"; readonly model: BodyModel });

/** What a trial may name beside its kind: what its body holds, the lab's gusts, and its seed. */
type Held = { readonly loadout?: Loadout; readonly gusts?: true; readonly seed?: number };

/** The screen: each body, the walk four ways at a slow and a brisk pace, a run, a turn each way, shoves eight ways at three sizes, and a shove four ways after a walk. */
const SCREEN = deepFreeze({
  models: ["workshop-fighter", "workshop-rogue"] as BodyModel[],
  ways: [0, 90, 180, 270], paces: [.3, .7], turns: [90, 270],
  shoves: { ways: [0, 45, 90, 135, 180, 225, 270, 315], impulses: [30, 45, 60] },
  walked: { ways: [0, 90, 180, 270], impulse: 20, pace: .3 },
});

/** A screen's trials, and with `fastest`, each way's walks up to the body's fastest that way (`pacesOf`). */
type Protocol = typeof SCREEN & { readonly fastest?: true };

/**
 * The walk on every body in every rated loadout (`REPRESENTATIVE`): the screen's trials eight ways,
 * the diagonals among them, each way's walks up to the fastest the body holds that way
 * (`fastest`), and its walks again in the lab's gusts.
 */
const EVERY = deepFreeze({ ...SCREEN, models: ["workshop-fighter", "workshop-rogue", "crypt-skeleton"] as BodyModel[], ways: [0, 45, 90, 135, 180, 225, 270, 315],
  fastest: true as const, loadouts: REPRESENTATIVE as Loadout[], gusts: true });

/**
 * **The walk's training twin** (`src/evaluation/twin.ts`): `EVERY`'s trials drawn at other points,
 * research's to tune on, the cell's held out: its ways and its shoves' turned half their spacing
 * (each way's fastest walk read at its own way), its paces and impulses halfway between, its turns
 * aside half as far, and the next seed.
 */
const EVERY_TWIN = deepFreeze({ ...EVERY, ways: turned(EVERY.ways), paces: between(EVERY.paces), turns: EVERY.turns.map((way) => way < 180 ? way / 2 : 360 - (360 - way) / 2),
  shoves: { ways: turned(EVERY.shoves.ways), impulses: between(EVERY.shoves.impulses) }, walked: { ...EVERY.walked, ways: turned(EVERY.walked.ways) }, seed: 2 });

/** The run's bar on the Warrior and the Rogue in every rated loadout: each run trial in calm air and the lab's gusts, seeds 1 to 4. */
const RUN_BAR = deepFreeze({ models: ["workshop-fighter", "workshop-rogue"] as BodyModel[], loadouts: REPRESENTATIVE as Loadout[], seeds: [1, 2, 3, 4], airs: [false, true] });

/** **The run's bar's training twin**: its trials on the next seeds (`later`), research's to tune on. */
const RUN_TWIN = deepFreeze({ ...RUN_BAR, seeds: later(RUN_BAR.seeds) });

/** Facing forward, +z. */
const FORWARD = deepFreeze({ x: 0, z: 1 });

/** The ground direction `degrees` from +z toward +x. */
const toward = (degrees: number) => { const way = degrees * Math.PI / 180; return { x: sin(way), z: cos(way) }; };

const STOP: Orders = deepFreeze({ move: null, face: FORWARD });

/** A run to `points` (`run-route`, `run-moved`), as fast as the body goes, met within the commanders' arrival. */
const placed = (points: readonly { readonly x: number; readonly z: number }[]): Orders =>
  ({ move: { kind: "place", points, near: ARRIVAL.point }, gait: "run", face: null });

/** The script `condition` gives its body, and when its last cue comes, s: for a place held to the end, when it is to have come there. */
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
    case "run-route": return { last: START + RUN_UP + (COURSE.leg + COURSE.aside) / STOPPING_PACE, cues: [
      { at: START, orders: placed([{ x: 0, z: COURSE.leg }, { x: condition.way * COURSE.aside, z: COURSE.leg }]) }] };
    case "run-moved": return { last: START + RUN_UP + (COURSE.ahead + COURSE.aside) / STOPPING_PACE, cues: [
      { at: START, orders: placed([{ x: 0, z: COURSE.ahead }]) }, { at: START + RUN_UP, orders: placed([{ x: condition.way * COURSE.aside, z: COURSE.ahead }]) }] };
    case "walk-run": return { last: START + 2 * RUN_UP + SETTLE, cues: [
      { at: START, orders: { move: { kind: "direct", direction: FORWARD }, pace: WALKING_PACE, face: FORWARD } },
      { at: START + RUN_UP, orders: { move: { kind: "direct", direction: FORWARD }, gait: "run", face: null } }, { at: START + 2 * RUN_UP + SETTLE, orders: STOP }] };
    default: { const never: never = condition; throw new Error(`no locomotion trial ${JSON.stringify(never)}`); }
  }
}

/** How long a turning run's way turns: a circle at `TURN_RATE`, s. */
export const TURNING = 2 * Math.PI / TURN_RATE;

/**
 * **The shove a body takes for the Warrior's `impulse`**, N s: the one that changes its speed as
 * much as the Warrior's changes his, `impulse` times its mass over his (`BodySpec.mass`). The
 * Warrior's is `impulse` itself.
 */
const shoveOf = (model: BodyModel, impulse: number): number =>
  impulse * (modelSpec(model).mass.value / modelSpec("workshop-fighter").mass.value);

/**
 * **The paces `protocol` walks `model` holding `loadout` the way `way` degrees from forward**, m/s:
 * its paces; and where it asks the `fastest` and the stance's envelope was measured on the body
 * holding it (`stanceEnvelopeOf`), the fastest that envelope holds that way (`heldPace`, the rule
 * the game's walk is held to), to the centimetre below, its paces past that left out, as the game
 * asks no walk faster than its body holds.
 */
function pacesOf(protocol: Protocol, model: BodyModel, loadout: Loadout | undefined, way: number): readonly number[] {
  const envelope = protocol.fastest ? stanceEnvelopeOf(modelHolding(model, loadout ?? EMPTY_LOADOUT)) : null;
  if (!envelope) return protocol.paces;
  const angle = way * Math.PI / 180, fastest = Math.floor(heldPace(envelope, cos(angle), sin(angle)) * 100) / 100;
  return fastest > 0 ? [...protocol.paces.filter((pace) => pace < fastest), fastest] : protocol.paces;
}

/** The conditions of `protocol`, body by body, in the order the kinds are listed above. */
function conditionsOf(protocol: Protocol): LocomotionCondition[] {
  return screenOf(protocol, {});
}

/** The screen's trials of `protocol` on each of its bodies, each naming `held`. */
function screenOf(protocol: Protocol, held: Held): LocomotionCondition[] {
  return protocol.models.flatMap((model): LocomotionCondition[] => [
    ...protocol.ways.flatMap((way) => pacesOf(protocol, model, held.loadout, way).map((pace) => ({ kind: "walk" as const, model, way, pace }))),
    { kind: "run" as const, model },
    ...protocol.turns.map((way) => ({ kind: "turn" as const, model, way })),
    ...protocol.shoves.impulses.flatMap((impulse) => protocol.shoves.ways.map((way) => ({ kind: "shove" as const, model, way, impulse: shoveOf(model, impulse) }))),
    ...protocol.walked.ways.map((way) => ({ kind: "shoved-walk" as const, model, way, impulse: shoveOf(model, protocol.walked.impulse), pace: protocol.walked.pace })),
  ].map((condition) => ({ ...condition, ...held })));
}

/** The walk on every body in every loadout (`EVERY`): the screen's trials holding each, then its walks in the gusts; each on the protocol's seed where it names one. */
const everyOf = (protocol: typeof EVERY & { readonly seed?: number }): LocomotionCondition[] => protocol.loadouts.flatMap((loadout) => {
  const seeded = protocol.seed === undefined ? {} : { seed: protocol.seed };
  return [...screenOf(protocol, { loadout, ...seeded }),
    ...screenOf(protocol, { loadout, gusts: true, ...seeded }).filter((condition) => condition.kind === "walk")];
});

/** The run's bar's trials (`RUN_BAR`): each body and loadout, each run trial, in each air and seed. */
const runsOf = (protocol: typeof RUN_BAR): LocomotionCondition[] => protocol.models.flatMap((model) => protocol.loadouts.flatMap((loadout) =>
  protocol.airs.flatMap((gusts) => protocol.seeds.flatMap((seed): LocomotionCondition[] => {
    const held: Held = { loadout, seed, ...(gusts ? { gusts: true as const } : {}) };
    return [{ kind: "run-held", model, ...held }, { kind: "run-turn", model, way: 1, ...held }, { kind: "run-turn", model, way: -1, ...held }, { kind: "run-stop", model, ...held },
      { kind: "run-route", model, way: 1, ...held }, { kind: "run-route", model, way: -1, ...held },
      { kind: "run-moved", model, way: 1, ...held }, { kind: "run-moved", model, way: -1, ...held }, { kind: "walk-run", model, ...held }];
  }))));

/** How long a trial of `conditions` plays at most: its last cue and `AFTER`, s. */
const longest = (conditions: readonly LocomotionCondition[]) => Math.max(...conditions.map((condition) => scriptOf(condition).last)) + AFTER;

export function createLocomotionCases(context: GameContext) {
  const { controllers: CONTROLLERS } = context.catalog;

  /** Why `value` cannot walk `model`: not a mind, or a named calibration that keeps it off that body. */
  function faultsOf(value: Json, model: BodyModel, subject?: Subject): readonly string[] {
    const kind = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as { kind?: unknown }).kind : undefined;
    if (typeof kind !== "string" || !Object.hasOwn(CONTROLLERS, kind)) return [`no mind: a config names its kind (${Object.keys(CONTROLLERS).join(", ")})`];
    return presetFitsModel(subject ?? {}, model) ? [] : [`named calibration allows ${subject?.models?.join(", ") || "no bodies"}; ${model} is unavailable`];
  }

  function locomotionCases(play: Json, conditions: readonly LocomotionCondition[]): Cases<LocomotionCondition, LocomotionReading, BuiltLone> {
    return {
      arity: 1,
      play,
      conditions,
      seconds: longest(conditions),
      faults: (value, { model }, subject) => faultsOf(value, model, subject),
      world: ([mind], condition, engine, [character]) => ({ kind: "lone", engine,
        lone: { model: condition.model, mind: mindOf(mind), script: scriptOf(condition).cues, floorSize: OPEN_FLOOR,
          ...(character && Object.keys(character).length > 0 ? { character } : {}),
          ...(condition.loadout && loadoutKey(condition.loadout) !== "empty,empty" ? { loadout: condition.loadout } : {}),
          ...(condition.gusts ? { gusts: true as const } : {}), ...(condition.seed !== undefined ? { seed: condition.seed } : {}) } }),
      read: (built, condition) => readLocomotion(built, condition),
    };
  }

  /** Every protocol the drill may be played on, by name. */
  const LOCOMOTION_CASES: Readonly<Record<string, Cases<LocomotionCondition, LocomotionReading, BuiltLone>>> = Object.freeze({
    screen: locomotionCases(SCREEN as unknown as Json, conditionsOf(SCREEN)),
    every: { ...locomotionCases(EVERY as unknown as Json, everyOf(EVERY)), twin: "every-twin" },
    "every-twin": locomotionCases(EVERY_TWIN as unknown as Json, everyOf(EVERY_TWIN)),
    run: { ...locomotionCases(RUN_BAR as unknown as Json, runsOf(RUN_BAR)), twin: "run-twin" },
    "run-twin": locomotionCases(RUN_TWIN as unknown as Json, runsOf(RUN_TWIN)),
  });

  return { LOCOMOTION_CASES };
}
