import type { Readiness, Resource } from "../../../skills/action.ts";
import { intentOfSet, type Intent, type SelectedAsk } from "../../../mind/intent.ts";
import type { Sight } from "../../../mind/tactics.ts";
import type { Percepts, Predictions } from "./percepts.ts";
import type { Place } from "./position.ts";
import type { Terms } from "./value.ts";

/**
 * **What a decision reads**, once a control step: the body and its skills as the last step left
 * them, each percept (`PERCEPTS`), and the predictions, read as they are asked (`PREDICTIONS`).
 */
export interface Situation extends Percepts {
  readonly sight: Sight;
  readonly time: number;
  readonly predictions: Predictions;
}

/**
 * Where an option running is (`Option.status`): `committed`, keeping what it claims; `yields`,
 * given up for a better one if there is one; at its `exit`, where the body can be handed to another
 * option here, which a chooser decides afresh at and looks past (yielding there too); or `over`,
 * having run its course, to be begun afresh only.
 */
export type Status = "committed" | "yields" | "exit" | "over";

/** What an option asks of the skills in a step, the hands' cover aside. */
export type Asked = SelectedAsk["asked"];

/** **An option's step**: what it asks, and what its asks hold (`Sight.needs`, `asking`), by resource. */
export interface Step {
  readonly asked: Asked;
  readonly holds: readonly Resource[];
}

/**
 * **An option**: a skill applied to a target, chosen by its chooser (`Chooser`) in a set of options
 * whose resources do not overlap, in one shape: its entry (where it can begin, or, running, go on),
 * the resources it claims, its model (what running it from now is expected to bring: measured where
 * a profile prices it, else built by hand), its step and its status. Begun, it runs until it is
 * over, out of its entry, or given up for a better one where it yields.
 */
export interface Option {
  readonly name: string;
  /** Its memory (`src/core/state.ts`), plain data. */
  readonly state: object;
  /** The resources it takes from the set while it runs (`Resource`; `WHOLE`, the whole body): what no other option chosen beside it may hold. */
  readonly claims: readonly Resource[];
  /**
   * Whether it is a rest option (`hold`, `guard`, `brace`): one worth no more than it does not take
   * its resource from it. A mark of its own: by rank the rest options are last, the floor, and by
   * worth a rest option wins a tie, so neither its rank nor its model can say it.
   */
  readonly rest?: true;
  /**
   * The targets it may run at, by name, where it has a choice of them (a gait's destinations): the
   * chooser prices it at each (`aim`) and runs it at the best. One with none runs at its own.
   */
  readonly targets?: readonly string[];
  /** Run it at its target at `index` of `targets` from now on: its name, entry, status, model and step are there. */
  aim?(index: number): void;
  /** Its entry, now: `ready` to begin or go on, else `waiting` or `blocked`, and why. */
  entry(now: Situation): Readiness;
  /** Where it is now, running (`Status`). */
  status(now: Situation): Status;
  begin(now: Situation): void;
  /** It is over, run out or given up. */
  end(): void;
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

/** Whether `option` is on offer now: its entry admits. */
export const onOffer = (option: Option, now: Situation): boolean => option.entry(now).kind === "ready";

/** What a step's asks hold (`Sight.needs`): each blow continued, what it holds; each asked anew, what it will. */
export function asking(now: Situation, asked: Asked): readonly Resource[] {
  const held: Resource[] = [];
  for (const request of asked.actions) {
    const live = now.sight.report.actions.find((action) => action.id === request.id);
    for (const resource of live ? live.holds : now.sight.needs(request.action, request.effector)) if (!held.includes(resource)) held.push(resource);
  }
  return held;
}

/** What an option that holds nothing holds. */
export const NOTHING: readonly Resource[] = Object.freeze([]);

/** What footwork holds: the legs. */
export const LEGS: readonly Resource[] = Object.freeze(["legs"]);

/** The whole body as a claim: it overlaps every other (`overlaps`). */
export const WHOLE: readonly Resource[] = Object.freeze(["*"]);

/** Whether two claims share a resource, the whole body sharing every one. */
export const overlaps = (a: readonly Resource[], b: readonly Resource[]): boolean =>
  a.includes("*") && b.length > 0 || b.includes("*") && a.length > 0 || a.some((resource) => b.includes(resource));

/**
 * **What a set of options asks in a step**: each member's step as a selected set's
 * (`SelectedAsk`), made one intent (`intentOfSet`): the walk and facing of the one that claims the
 * legs, else `idle`'s; every one's actions; every one's covers of a hand no one's asks hold.
 */
export function stepSet(set: readonly Option[], now: Situation, dt: number, idle: () => Omit<Intent, "guard" | "actions">): Intent {
  return intentOfSet(set.map((option) => ({ claims: option.claims, ...option.step(now, dt) })), idle);
}
