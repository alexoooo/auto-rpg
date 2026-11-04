import type { Readiness, Resource, Window } from "../skills/framework/action.ts";
import { intentOfSet, type Intent, type SelectedAsk } from "../intent/intent.ts";
import type { Sight } from "../mind/decider.ts";
import type { Choice } from "../mind/choice.ts";
import { bearingAround, graceAt, inReach, type Cues, type ModelledStrike, type Percepts, type Predictions } from "./percepts.ts";
import { hypot } from "../math/real.ts";
import type { PartConfig } from "../parts/parts.ts";
import type { Edge } from "./rise.ts";
import type { Leaves, Terms } from "./value.ts";

/**
 * **What a decision reads**, once a control step: the body and its skills as the last step left
 * them, and each percept (`PERCEPTS`) and prediction (`PREDICTIONS`), read the first time it is
 * asked and kept for the step; and, by its config, a percept or prediction part's reading, read as
 * it is asked: one an option kind or an objective names in its `uses`. Those parts have no cue,
 * and a predicted state (`placed`) leaves them as they are now. Which cued percepts were asked for
 * is counted for its chooser (`cues`).
 */
export interface Situation extends Percepts {
  readonly sight: Sight;
  readonly time: number;
  readonly predictions: Predictions;
  /** At a state an Option leaves the body in (`placed`), the seconds before the focus's pressure reaches it there (`graceAt`); absent at the state now. */
  readonly grace?: number;
  /** What its chooser watches: the cued percepts asked for of any situation its reader made (`Cues`). */
  readonly cues: Cues;
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
 * **What an Option is asked to price** besides the state: the target it runs at, by its place in
 * its `targets` (its first unless given), so a search prices each without aiming it (`Choice.aim`);
 * and, for an Option that runs as long as it is held (`Option.open`), the seconds it is priced
 * over (none unless given: it is priced as an instant).
 */
export interface Ask {
  readonly target?: number;
  readonly until?: number;
}

/**
 * **An option**: a skill applied to a target, chosen by its chooser (`Chooser`) in a set of options
 * whose resources do not overlap (a `Choice`: its entry, where it can begin, or, running, go on; the
 * resources it claims, `WHOLE` the whole body; whether it is a rest option, `hold`, `guard`,
 * `brace`; its targets, a gait's destinations; and its status), with its model (what running it
 * from a state is expected to bring: measured where a profile prices it, else built by hand) and its
 * step. Begun, it runs until it is over, out of its entry, or given up for a better one where it
 * yields. What it may say beside, where its kind has it to say, its mind reads of any option alike.
 */
export interface Option extends Choice<Situation> {
  /**
   * **What running it from `at` is expected to bring** (`Terms`), at the state the body is in now
   * or one an Option leaves it in (`placed`), asked as `ask` says; null where it is not on offer
   * there. It reads the state's percepts, so it answers at a predicted state as it would there; at
   * the state now its entry has the last word (`Choice.entry`).
   */
  model(at: Situation, ask?: Ask): Terms | null;
  /** It runs as long as it is held, never over of itself (hold, guard, brace, the cover): priced over the seconds it is asked (`Ask.until`), and nothing after it. */
  readonly open?: true;
  /** Where it is held, where it names a place: the name of a walk's target (`Choice.targets`) that goes there, so the search reaches it there as well as where the body stands. */
  readonly site?: string;
  /**
   * How its model is priced now, a sentence: measured, where its profile prices it (and why
   * scaled, `ProfileReading.scaled`); else by hand, and why: no drill measured it, its profile is
   * stale (`staleness`), or no trial reads where it stands. Absent where it reads no profile.
   */
  priced?(now: Situation): string;
  /**
   * What it is expected to take of the focus a second, within its reach, as a share of the
   * focus's full life, begun afresh; 0 with no focus. Not at the range now: out of reach it reads
   * what it would deal in reach. Absent where it deals nothing.
   */
  rate?(now: Situation): number;
  /**
   * The window its legs are to be brought to for it now (`Readiness`'s `position`), null where it
   * needs none now; what a walk into it goes to (`windowPlace`). Absent where its skill has none.
   */
  window?(now: Situation): Window | null;
  /** The strike its body is modelled by (`ModelledStrike`, `Seen.strikes`), where it is one. */
  readonly modelled?: ModelledStrike;
  /** The edges it takes the body by on the ground (`TechniquePart.edges`), where it is a way up. */
  readonly route?: readonly Edge[];
  /** What it asks this step, and what that holds. */
  step(now: Situation, dt: number): Step;
}

/**
 * **The state `leaves` leaves the body in** (`Leaves`), from `at`, read through it: where it stands
 * (`where`), and from there its range centre to centre and head to head to the focus, the head as
 * far from the centre as at `at`, and its bearing around the focus, unless `leaves` names it; its
 * posture, down where it is not standing, and its velocity. A state an Option leaves is later than
 * the blow coming and the body's own blows under way: no blow comes there (`incoming`,
 * `Predictions.danger`), none of its own is under way there (`SkillReport.actions`), and no ground
 * reading is read there (`ground`). Its grace (`Situation.grace`) is what `leaves` reckons; else, within the
 * focus's reach, what is left of `at`'s after the Option's `seconds` where `at` is within it too
 * (one stretch in reach counts the focus's latency once), and the whole latency where the body has
 * just come within it or is out of it. The foe and every other percept are as `at` reads them.
 */
/** No action under way: a state an Option leaves the body in (`placed`). */
const NO_ACTIONS: Sight["report"]["actions"] = Object.freeze([]);

export function placed(at: Situation, leaves: Leaves, seconds: number): Situation {
  const report = Object.create(at.sight.report, { actions: { value: NO_ACTIONS } }) as Sight["report"];
  const props: PropertyDescriptorMap = { ground: { value: null }, incoming: { value: null }, sight: { value: Object.create(at.sight, { report: { value: report } }) },
    predictions: { value: Object.create(at.predictions, { danger: { value: 0 } }) } };
  const where = leaves.where, focus = at.focus;
  if (where) {
    props.where = { value: where };
    if (focus) {
      const apart = hypot(where.x - focus.centre.x, where.z - focus.centre.z);
      props.apart = { value: apart }; props.range = { value: apart + at.range - at.apart };
      props.around = { value: leaves.around ?? bearingAround(focus, where.x, where.z) };
    }
  } else if (leaves.around !== undefined) props.around = { value: leaves.around };
  if (leaves.posture) { props.posture = { value: leaves.posture }; props.down = { value: leaves.posture !== "standing" }; }
  if (leaves.velocity) props.velocity = { value: leaves.velocity };
  const there = Object.create(at, props) as Situation, latency = at.predictions.pressure.latency;
  const grace = leaves.grace ?? (!inReach(there) ? latency : inReach(at) ? Math.max(0, graceAt(at) - seconds) : latency);
  Object.defineProperty(there, "grace", { value: grace });
  return there;
}

/**
 * **Whether the body stands at `at`**: not down, and borne by its feet with no rise of its own
 * holding it otherwise (`posture` standing): where an Option that begins standing is on offer.
 */
export const standing = (at: Situation): boolean => !at.down && at.posture === "standing";

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
