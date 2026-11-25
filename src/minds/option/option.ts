import type { Spot } from "../../skills/framework/menu.ts";
import type { Exit } from "../../skills/framework/profile/profile.ts";
import { hasResource, type Readiness, type Resource } from "../../skills/framework/action.ts";
import { SETTLED } from "../../skills/intent/action-window.ts";
import type { Sight } from "../decider.ts";
import { bearingAround, graceAt, inReach } from "./percepts.ts";
import type { Asked } from "./contract/option.ts";
import type { ExchangePredictor } from "./contract/predictors.ts";
import type { Predictions, Situation } from "./contract/situation.ts";
import { atan2, cos, hypot, sin } from "../../core/math/real.ts";
import type { BodySense } from "../../core/bodies/senses.ts";
import { upOrDown } from "./value.ts";
import type { Leaves, Outcome } from "./contract/terms.ts";

/**
 * **Where the body stands `range` m head to head from the focus of `at`**: on the line from the
 * focus through where it stands at `at` (the way it faces, back, where it stands on the focus's
 * centre), facing the focus.
 */
export function along(at: Situation, range: number): Spot {
  const focus = at.focus!, where = at.where, apart = at.apart, to = Math.max(0, range + apart - at.range);
  const x = apart > 0 ? (where.x - focus.centre.x) / apart : -sin(where.face), z = apart > 0 ? (where.z - focus.centre.z) / apart : -cos(where.face);
  return { x: focus.centre.x + x * to, z: focus.centre.z + z * to, face: atan2(-x, -z) };
}

/**
 * **Where an Option leaves the body by its trials' exit** (`Expected.exit`) from `at`, as `leaves`
 * says but for where: where it stands in the share of its trials that ended within `ARRIVED` of
 * where they began centre to centre (`stays`), else as much further from the focus as the rest
 * moved (`moved`, m), on the line from the focus through it (`along`); where its trials do not
 * say, where it stands. Down in the share `down` (`upOrDown`).
 */
export function exitOutcomes(at: Situation, exit: Exit | undefined, down: number, leaves: Omit<Leaves, "where"> = {}): readonly Outcome[] {
  const stays = exit?.stays ?? 1, here = { ...leaves, where: along(at, at.range) };
  if (!(stays < 1)) return upOrDown(here, down);
  const there = { ...leaves, where: along(at, at.range + (exit?.moved ?? 0)) };
  if (!(stays > 0)) return upOrDown(there, down);
  return upOrDown(here, down).flatMap((one) => one.leaves === here ? [{ leaves: here, chance: one.chance * stays }, { leaves: there, chance: one.chance * (1 - stays) }] : [one]);
}

/** No action under way: a state an Option leaves the body in (`placed`). */
const NO_ACTIONS: Sight["report"]["actions"] = Object.freeze([]);

/** A sight after its actions end, inheriting every other report and sight reading. */
const afterActions = (sight: Sight): Sight => Object.create(sight, {
  report: { value: Object.create(sight.report, { actions: { value: NO_ACTIONS } }) },
});

/** Predictions past the blow coming, inheriting every other prediction. */
const afterDanger = (predictions: Predictions): Predictions => Object.create(predictions, { danger: { value: 0 } });

/** Each overlay of predictions at another own stance (`stancedPredictions`), by the predictions and the stance. */
const STANCED_PREDICTIONS = new WeakMap<Predictions, WeakMap<object, Predictions>>();

/** **`predictions` with the body standing at `own`**: its focus's pressure on it read there (`Pressure.stanced`); made once for the two. */
function stancedPredictions(predictions: Predictions, own: NonNullable<Leaves["stance"]>): Predictions {
  let by = STANCED_PREDICTIONS.get(predictions);
  if (!by) STANCED_PREDICTIONS.set(predictions, by = new WeakMap());
  let made = by.get(own);
  if (!made) {
    const pressure = predictions.pressure.stanced(own);
    by.set(own, made = pressure === predictions.pressure ? predictions : Object.create(predictions, { pressure: { value: pressure } }) as Predictions);
  }
  return made;
}

/**
 * What `placedWith` defines a field by, one at a time: a value, neither writable, enumerable nor
 * configurable, as `Object.create`'s descriptors define. Its value is let go once defined.
 */
const FIELD: PropertyDescriptor & { value: unknown } = { value: undefined };
const define = (on: object, key: keyof Situation, value: unknown): void => { FIELD.value = value; Object.defineProperty(on, key, FIELD); FIELD.value = undefined; };

/**
 * A placement with the sight and predictions after the actions and blow coming end, and the focus
 * as it is there (`focus`; `at`'s own where it has not moved). A search calls it for every state
 * it makes, so it takes its arguments by place and no argument object is made.
 */
function placedWith(at: Situation, leaves: Leaves, seconds: number, sight: Sight, predictions: Predictions, focus: BodySense | null): Situation {
  const there = Object.create(at) as Situation, where = leaves.where;
  define(there, "ground", null); define(there, "incoming", null); define(there, "sight", sight);
  // Standing otherwise, the body reads the two pressures at its stance there.
  define(there, "predictions", leaves.stance ? stancedPredictions(predictions, leaves.stance) : predictions);
  if (leaves.stance) define(there, "stances", { ...at.stances, own: leaves.stance });
  if (focus !== at.focus) define(there, "focus", focus);
  if (where) define(there, "where", where);
  const from = where ?? (focus !== at.focus ? at.where : undefined);
  if (from && focus) {
    const apart = hypot(from.x - focus.centre.x, from.z - focus.centre.z);
    define(there, "apart", apart); define(there, "range", apart + at.range - at.apart);
    define(there, "around", leaves.around ?? bearingAround(focus, from.x, from.z));
  } else if (!where && leaves.around !== undefined) define(there, "around", leaves.around);
  if (leaves.posture) { define(there, "posture", leaves.posture); define(there, "down", leaves.posture !== "standing"); }
  if (leaves.phase) define(there, "phase", leaves.phase);
  if (leaves.velocity) {
    define(there, "velocity", leaves.velocity);
    if (hypot(leaves.velocity.x, leaves.velocity.z) <= SETTLED) define(there, "stride", "stand");
  }
  const latency = at.predictions.pressure.latency, was = graceAt(at), within = inReach(there);
  const grace = leaves.grace ?? (within !== inReach(at) ? was : within ? Math.max(0, was - seconds) : Math.min(latency, was + seconds));
  define(there, "grace", grace);
  return there;
}

/**
 * **The state `leaves` leaves the body in** (`Leaves`), from `at`, read through it: where it stands
 * (`where`), and from there its range centre to centre and head to head to the focus, the head as
 * far from the centre as at `at`, and its bearing around the focus, unless `leaves` names it; its
 * posture, down where it is not standing, and its velocity, its stance standing where that leaves
 * it still (`stride`, `still`). A state an Option leaves is later than
 * the blow coming and the body's own blows under way: no blow comes there (`incoming`,
 * `Predictions.danger`), none of its own is under way there (`SkillReport.actions`), and no ground
 * reading is read there (`ground`). Its grace (`Situation.grace`) is what `leaves` reckons; else
 * `at`'s: spent over the Option's `seconds` where both are within the focus's reach (one stretch in
 * reach counts the focus's latency once), restored over them where both are out of it (never past
 * the latency), and as it was where the body crosses the reach's edge, the crossing's time unknown.
 * The foe and every other percept are as `at` reads them.
 */
export function placed(at: Situation, leaves: Leaves, seconds: number): Situation {
  return placedWith(at, leaves, seconds, afterActions(at.sight), afterDanger(at.predictions), at.focus);
}

/**
 * Placements within one search, sharing read-only sights and predictions after their actions and
 * incoming blow end. Each overlay maps to itself, so descendants keep the same overlay; geometry,
 * posture and grace still belong to each situation. The scratch ends with the search. The focus
 * is where `exchange` predicts it after an Option's seconds, at most `carry`
 * (`ExchangePredictor.later`): along a line it moves over the first step alone, at most `carry` s;
 * none, as it stands now.
 */
export function placing(exchange: ExchangePredictor, carry: number): typeof placed {
  const sights = new WeakMap<Sight, Sight>(), predictions = new WeakMap<Predictions, Predictions>();
  return (at, leaves, seconds) => {
    let sight = sights.get(at.sight), predicted = predictions.get(at.predictions);
    if (!sight) {
      sight = afterActions(at.sight);
      sights.set(at.sight, sight); sights.set(sight, sight);
    }
    if (!predicted) {
      predicted = afterDanger(at.predictions);
      predictions.set(at.predictions, predicted); predictions.set(predicted, predicted);
    }
    return placedWith(at, leaves, seconds, sight, predicted, at.focus && exchange.later(at.focus, Math.min(seconds, carry)));
  };
}

/**
 * **Whether the body stands at `at`**: not down, and borne by its feet with no rise of its own
 * holding it otherwise (`posture` standing): where an Option that begins standing is on offer.
 */
export const standing = (at: Situation): boolean => !at.down && at.posture === "standing";

/**
 * **Whether the body stands still at `at`**: its stance standing, not in a step (`stride`), and its
 * centre moving no faster than a standing body's once its sway has died out (`SETTLED`).
 */
export const still = (at: Situation): boolean => at.stride === "stand" && hypot(at.velocity.x, at.velocity.z) <= SETTLED;

/** An entry or exit that admits. */
export const READY: Readiness = Object.freeze({ kind: "ready" });

/** An entry or exit that does not admit, for `reason`: made once, as the options are. */
export const blocked = (reason: string): Readiness => Object.freeze({ kind: "blocked", reason });

/** What a step's asks hold (`SkillsActions.needs`): each blow continued, what it holds; each asked anew, what it will. */
export function asking(now: Situation, asked: Asked): readonly Resource[] {
  const held: Resource[] = [];
  for (const request of asked.actions) {
    const live = now.sight.report.actions.find((action) => action.id === request.id);
    for (const resource of live ? live.holds : now.sight.actions.needs(request.action, request.effector)) if (!hasResource(held, resource)) held.push(resource);
  }
  return held;
}
