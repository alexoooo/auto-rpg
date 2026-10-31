import type { Readiness, Resource } from "../skills/framework/action.ts";
import { intentOfSet, type Intent, type SelectedAsk } from "../intent/intent.ts";
import type { Sight } from "../mind/decider.ts";
import type { Choice } from "../mind/choice.ts";
import type { Percepts, Predictions } from "./percepts.ts";
import type { PartConfig } from "../parts/parts.ts";
import type { Place } from "./position.ts";
import type { Terms } from "./value.ts";

/**
 * **What a decision reads**, once a control step: the body and its skills as the last step left
 * them, each percept (`PERCEPTS`), and the predictions, read as they are asked (`PREDICTIONS`);
 * and, by its config, a percept or prediction part's reading, read as it is asked: one an option
 * kind or an objective names in its `uses`. Those parts have no cue, and a place (`Place`) leaves
 * them as they are now.
 */
export interface Situation extends Percepts {
  readonly sight: Sight;
  readonly time: number;
  readonly predictions: Predictions;
  /** What the percept part `config` names reads now (`PerceptPart`). */
  perceive<V>(config: PartConfig): V;
  /** What the prediction part `config` names predicts now (`PredictionPart`). */
  predict<V>(config: PartConfig): V;
}

/** What an option asks of the skills in a step, the hands' cover aside. */
export type Asked = SelectedAsk["asked"];

/** **An option's step**: what it asks, and what its asks hold (`Sight.needs`, `asking`), by resource. */
export interface Step {
  readonly asked: Asked;
  readonly holds: readonly Resource[];
}

/**
 * **An option**: a skill applied to a target, chosen by its chooser (`Chooser`) in a set of options
 * whose resources do not overlap (a `Choice`: its entry, where it can begin, or, running, go on; the
 * resources it claims, `WHOLE` the whole body; whether it is a rest option, `hold`, `guard`,
 * `brace`; its targets, a gait's destinations; and its status), with its model (what running it
 * from now is expected to bring: measured where a profile prices it, else built by hand) and its
 * step. Begun, it runs until it is over, out of its entry, or given up for a better one where it
 * yields.
 */
export interface Option extends Choice<Situation> {
  /** What running it from now is expected to bring (`Terms`). */
  model(now: Situation): Terms;
  /**
   * What running it is expected to bring once the body stands where `place` leaves it (`Place.at`),
   * read at `there`, the situation that place predicts (`placed`): its entry there and its model
   * there, null where it is not on offer there. Absent, an option the chooser does not look at past
   * a walk: its entry reads nothing a place predicts, so it answers there as it does here.
   */
  at?(now: Situation, there: Situation, place: Place): Terms | null;
  /** What it asks this step, and what that holds. */
  step(now: Situation, dt: number): Step;
}

/**
 * **The situation where `place` leaves the body**, as `now` reads it otherwise: its range and the
 * range centre to centre moved alike, and its bearing around the focus where it names one.
 */
export const placed = (now: Situation, place: Place): Situation =>
  ({ ...now, range: place.range, apart: now.apart + place.range - now.range, around: place.around ?? now.around });

/** An entry or exit that admits. */
export const READY: Readiness = Object.freeze({ kind: "ready" });

/** An entry or exit that does not admit, for `reason`: made once, as the options are. */
export const blocked = (reason: string): Readiness => Object.freeze({ kind: "blocked", reason });

/** What a step's asks hold (`Sight.needs`): each blow continued, what it holds; each asked anew, what it will. */
export function asking(now: Situation, asked: Asked): readonly Resource[] {
  const held: Resource[] = [];
  for (const request of asked.actions) {
    const live = now.sight.report.actions.find((action) => action.id === request.id);
    for (const resource of live ? live.holds : now.sight.needs(request.action, request.effector)) if (!held.includes(resource)) held.push(resource);
  }
  return held;
}

/** What footwork holds: the legs. */
export const LEGS: readonly Resource[] = Object.freeze(["legs"]);

/**
 * **What a set of options asks in a step**: each member's step as a selected set's
 * (`SelectedAsk`), made one intent (`intentOfSet`): the walk and facing of the one that claims the
 * legs, else `idle`'s; every one's actions; every one's covers of a hand no one's asks hold.
 */
export function stepSet(set: readonly Option[], now: Situation, dt: number, idle: () => Omit<Intent, "guard" | "actions">): Intent {
  return intentOfSet(set.map((option) => ({ claims: option.claims, ...option.step(now, dt) })), idle);
}
