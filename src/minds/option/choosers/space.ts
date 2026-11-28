import { onOffer } from "../options/readiness.ts";
import type { ExchangePredictor } from "../contract/predictors.ts";
import { placing } from "../situation/imagined.ts";
import type { Option } from "../contract/option.ts";
import type { Situation } from "../contract/situation.ts";
import type { Objective, Tally, Obedience } from "../contract/objective.ts";
import type { Leaves, Terms } from "../contract/terms.ts";
import { unchanged } from "../options/outcomes.ts";
import { notPriced } from "../../../skills/framework/profile/source.ts";
import { type Rerun, again } from "./again.ts";
import { handSet } from "../../../core/hand-set.ts";

/** How far the chances of an Option's outcomes may sum from one: the rounding of their sum. */
const CHANCES_SUM = handSet({
  name: "CHANCES_SUM", sort: "own",
  says: "How far the chances of an Option's outcomes may sum from one before the search calls it a defect.",
  value: 1e-9,
});

/** An Option and target (0 where it has none), with its slot in each situation's model row, and what its model is asked there (`Option.model`): the same each time, so made once. */
export interface Pair { readonly option: Option; readonly target: number; readonly slot: number; readonly ask: Readonly<{ target: number; until?: number }> }

/**
 * **What a leaf weighs** (`space`'s `leaf`): `whole`, where a line's last Option ends, every Option held or
 * run again and a walk to a site; `arrived`, where that walk ends, all but another walk; `held`,
 * where a run again leaves the body, the open Options only.
 */
export type Reach = "whole" | "arrived" | "held";

/**
 * **A state made from a state** (`space`'s `child`), and what tells it from another made there:
 * where `leaves` leave the body and after how long, each field as the state was made from it.
 */
interface Made {
  readonly x: number | undefined; readonly z: number | undefined; readonly face: number | undefined; readonly around: number | undefined; readonly posture: string | undefined;
  readonly vx: number | undefined; readonly vz: number | undefined; readonly grace: number | undefined; readonly seconds: number; readonly state: Situation;
}

/** Whether `a` and `b` are alike as a key compares them: -0 as 0, NaN as NaN, absent only as absent. */
const alike = (a: number | string | undefined, b: number | string | undefined): boolean => a === b || (a !== a && b !== b);

/** Whether `made` is the state `leaves` leaves the body in after `seconds` s: every field that tells one from another alike (`alike`). */
function madeFrom(made: Made, leaves: Leaves, seconds: number): boolean {
  const where = leaves.where, velocity = leaves.velocity;
  return alike(made.x, where?.x) && alike(made.z, where?.z) && alike(made.face, where?.face) && alike(made.around, leaves.around) && alike(made.posture, leaves.posture)
    && alike(made.vx, velocity?.x) && alike(made.vz, velocity?.z) && alike(made.grace, leaves.grace) && alike(made.seconds, seconds);
}

/**
 * **What a search is over**, made once a chooser: its Options, the objective it prices them by,
 * the obedience it prices orders at, and how far it looks, s.
 */
export interface Searched {
  readonly options: readonly Option[];
  readonly objective: Objective;
  readonly obedience: Obedience;
  readonly horizon: number;
  /** What it asks where the foe is later (`placing`) and how the foe replies to a line (`repliedSearch`). */
  readonly exchange: ExchangePredictor;
  /** The seconds of the focus's motion the states the search reads take in (`placing`): the config's `carry`, or a reply's seconds in its search (`repliedSearch`). */
  readonly carry: number;
}

/**
 * **The states a search at `root` reads** (`Situation`), over `options` priced by `objective` at
 * `obedience` over the `horizon`, s, made once a decision. A model is asked at most once a state for
 * each model and target (`Option.model`: Options made on one, as a walk's by each navigator, share
 * it), and only where something reads it (`modelAt`, `pairsAt`: at `root` an Option
 * with no targets only where its entry admits, `onOffer`; elsewhere its model says whether it is on
 * offer), and a state an Option leaves
 * the body in made once from each state for each place it names (`child`, `placed`). A path is
 * priced whole by the objective (`price`, `Path`). A line (`line`) runs its Option (`Option.model`),
 * then at each way it ends (`Outcome`) the best single Option from there where it goes deeper
 * (`best`), and ends at a leaf (`leaf`); a line is cut at the horizon, so every worth is absolute
 * over the same seconds and lines compare alike. Each side of the life a line trades counts as the
 * objective weighs it by when it comes (`Objective.weigh`: `dealtWeight`, `takenWeight`), as
 * itself where it weighs none.
 */
export function space(root: Situation, { options, objective, obedience, horizon, exchange, carry }: Searched) {
  const place = placing(exchange, carry);
  /** What life dealt, and taken, traded evenly over `span` s from `from` s on counts for, a share (`Objective.weigh`); 1 where the objective weighs none. */
  const dealtWeight = (from: number, span: number): number => objective.weigh ? objective.weigh("dealt", from, span, horizon) : 1;
  const takenWeight = (from: number, span: number): number => objective.weigh ? objective.weigh("taken", from, span, horizon) : 1;
  const sites = new Set<string>();
  for (const option of options) if (option.sites) for (const site of option.sites) sites.add(site.name);
  // Descriptors belong to the search; each situation owns its result row and offered list.
  // Repeated Option identities share slots but keep their occurrences in the offered list.
  // Options made on one model share its slots, one a target.
  const offsets = new Map<Option, number>(), descriptors: Pair[] = [], slots = new Map<Option["model"], number>();
  let width = 0;
  for (const option of options) if (!offsets.has(option)) {
    const targets = Math.max(1, option.targets?.length ?? 0);
    let first = slots.get(option.model);
    if (first === undefined) { slots.set(option.model, first = width); width += targets; }
    offsets.set(option, descriptors.length);
    for (let target = 0; target < targets; target++)
      descriptors.push(Object.freeze({ option, target, slot: first + target, ask: Object.freeze(option.open ? { target } : { target, until: horizon }) }));
  }
  // A state's offers, all of them (`offered`) and those a held or an arrived leaf reads (`held`, `arrived`); and the states made from it (`children`).
  const models = new Map<Situation, (Terms | null | undefined)[]>(), offered = new Map<Situation, readonly Pair[]>(), children = new Map<Situation, Made[]>();
  const held = new Map<Situation, readonly Pair[]>(), arrived = new Map<Situation, readonly Pair[]>();
  /** The search's descriptor for `option` at `target`. */
  const pairAt = (option: Option, target: number): Pair => descriptors[offsets.get(option)! + target]!;
  /** The model of `pair` from `at`, asked once (an open one priced as an instant). */
  const modelAt = (pair: Pair, at: Situation): Terms | null => {
    let row = models.get(at);
    if (!row) models.set(at, row = new Array<Terms | null | undefined>(width));
    const { option, slot } = pair;
    let terms = row[slot];
    if (terms === undefined) row[slot] = terms = option.model(at, pair.ask);
    return terms;
  };
  /** The Options on offer at `at`, at each of their targets, out of the pairs `asked` lets through. A pair it leaves out is not modelled. */
  const offeredOf = (at: Situation, asked: (pair: Pair) => boolean): Pair[] => {
    const found: Pair[] = [];
    for (const option of options) {
      if (at === root && !option.targets && !onOffer(option, at)) continue;
      const offset = offsets.get(option)!;
      for (let target = 0; target < Math.max(1, option.targets?.length ?? 0); target++) {
        const pair = descriptors[offset + target]!;
        if (asked(pair) && modelAt(pair, at)) found.push(pair);
      }
    }
    return found;
  };
  /** Every pair, for `offeredOf`. */
  const everyPair = (): boolean => true;
  /** Whether a pair is a walk to a site (`Option.sites`). */
  const toSite = ({ option, target }: Pair): boolean => option.targets !== undefined && sites.has(option.targets[target]!);
  /** The pairs a leaf reads where a walk has arrived (`arrivedReads`), and where it is held (`heldReads`). */
  const arrivedReads = (pair: Pair): boolean => !toSite(pair), heldReads = (pair: Pair): boolean => pair.option.open === true;
  /** The Options on offer at `at`, at each of their targets. */
  const pairsAt = (at: Situation): readonly Pair[] => {
    let pairs = offered.get(at);
    if (!pairs) offered.set(at, pairs = offeredOf(at, everyPair));
    return pairs;
  };
  /** The offers a leaf that reads `reach` reads at `at`: all of them once found, else those it reads, found once. */
  const readsAt = (at: Situation, reach: "held" | "arrived"): readonly Pair[] => {
    const all = offered.get(at);
    if (all) return all;
    const known = reach === "held" ? held : arrived;
    let pairs = known.get(at);
    if (!pairs) known.set(at, pairs = offeredOf(at, reach === "held" ? heldReads : arrivedReads));
    return pairs;
  };
  /** The state `leaves` leaves the body in from `at` after `seconds` s, made once: the first made for alike leaves (`madeFrom`). */
  const child = (at: Situation, leaves: Leaves, seconds: number): Situation => {
    let made = children.get(at);
    if (!made) children.set(at, made = []);
    for (let i = 0; i < made.length; i++) if (madeFrom(made[i]!, leaves, seconds)) return made[i]!.state;
    const where = leaves.where, velocity = leaves.velocity, state = place(at, leaves, seconds);
    made.push({ x: where?.x, z: where?.z, face: where?.face, around: leaves.around, posture: leaves.posture, vx: velocity?.x, vz: velocity?.z, grace: leaves.grace, seconds, state });
    return state;
  };
  const path = { dealt: 0, taken: 0, orders: 0, seconds: 0, end: root };
  /** What the path that brought `tally` and ends at `end` is worth, priced whole (`Objective.worth`). */
  const price = (tally: Tally, end: Situation): number => {
    path.dealt = tally.dealt; path.taken = tally.taken; path.orders = tally.orders; path.seconds = tally.seconds; path.end = end;
    const worth = objective.worth(path, root, obedience);
    if (!Number.isFinite(worth)) throw new Error(`a path is worth ${worth}`);
    return worth;
  };
  /** The model a line runs `pair` by from `at`, `seconds` s into the horizon: an open one's held `held` s, never past the horizon. */
  const heldTerms = (pair: Pair, at: Situation, seconds: number, held: number): Terms =>
    (pair.option.open ? pair.option.model(at, { target: pair.target, until: Math.max(0, Math.min(held, horizon - seconds)) }) : modelAt(pair, at))!;
  /** The model a line runs `pair` by from `at`, `seconds` s into the horizon: an open one's to the horizon. */
  const termsOf = (pair: Pair, at: Situation, seconds: number): Terms => heldTerms(pair, at, seconds, horizon);
  /**
   * **A step of a line** (`Step`): `pair` run from `at`, after a path that brought `from`, an open
   * one held `held` s (`heldTerms`), written into `out`.
   */
  const stepInto = (out: Work, pair: Pair, at: Situation, from: Tally, held: number): Step => {
    const { dealt, taken, orders, seconds } = from, option = pair.option, terms = heldTerms(pair, at, seconds, held), share = terms.duration > 0 ? Math.max(0, Math.min(1, (horizon - seconds) / terms.duration)) : 1;
    let chances = 0;
    for (let i = 0; i < terms.outcomes.length; i++) chances += terms.outcomes[i]!.chance;
    if (Math.abs(chances - 1) > CHANCES_SUM) throw new Error(`${option.name}'s outcomes' chances sum to ${chances}`);
    const after = seconds + share * terms.duration, counts = takenWeight(seconds, share * terms.duration), dealing = dealtWeight(seconds, share * terms.duration);
    out.terms = terms; out.dealt = dealt + dealing * share * terms.dealt; out.taken = taken + counts * share * terms.taken; out.orders = orders + share * terms.orders; out.seconds = after;
    out.cut = after >= horizon || option.open === true && seconds + held >= horizon;
    return out;
  };
  /** A step of a line, made anew: what a tree's edge keeps, an open one held to the horizon. */
  const stepOf = (pair: Pair, at: Situation, from: Tally): Step => stepInto(blankStep(), pair, at, from, horizon);
  /** A step of a line, made anew, an open one held `held` s: one held short of the horizon ends where it leaves the body, and the line goes on from there. */
  const heldStepOf = (pair: Pair, at: Situation, from: Tally, held: number): Step => stepInto(blankStep(), pair, at, from, held);
  // A line's step is read until the line's worth is found, through its deeper lines: a frame for each depth of the line under way.
  const frames: Work[] = [];
  let depth = 0;
  /** What a step cut (`Step.cut`) from `at` is worth: each way it ends priced where it leaves the body, by its chance. */
  const cutWorth = (at: Situation, step: Step): number => {
    let worth = 0;
    for (let i = 0; i < step.terms.outcomes.length; i++) {
      const outcome = step.terms.outcomes[i]!;
      worth += outcome.chance * price(step, unchanged(outcome.leaves) ? at : child(at, outcome.leaves, step.terms.duration));
    }
    return worth;
  };
  /**
   * The worth of the line through `pair` from `at`, after what the path brought before it (`from`); then, where it ends, the best line `left` - 1 Options
   * deep (`best`) where `left` is more than 1, else the leaf (`leaf`: whole where `left` is 1,
   * arrived where 0).
   */
  const line = (pair: Pair, at: Situation, left: number, from: Tally): number => {
    const step = stepInto(frames[depth] ??= blankStep(), pair, at, from, horizon), terms = step.terms;
    if (step.cut) return cutWorth(at, step);
    depth++;
    let worth = 0;
    for (let i = 0; i < terms.outcomes.length; i++) {
      const outcome = terms.outcomes[i]!, end = child(at, outcome.leaves, terms.duration);
      worth += outcome.chance * (left > 1 ? best(end, left - 1, step) : leaf(end, left === 1 ? "whole" : "arrived", step));
    }
    depth--;
    return worth;
  };
  /** The best line from `at` of any Option on offer there, `left` deep; the path as it is where none is. */
  const best = (at: Situation, left: number, from: Tally): number => {
    let top = -Infinity;
    const pairs = pairsAt(at);
    for (let i = 0; i < pairs.length; i++) top = Math.max(top, line(pairs[i]!, at, left, from));
    return top > -Infinity ? top : price(from, at);
  };
  /**
   * **Where a line ends** (`Reach`): at `at`, the best, to the horizon, of each Option on offer
   * there that leaves the body where it began, run again and again (an open Option, `Option.open`,
   * held, the case of none; unless `held`, any other, `again`), and, where `whole`, of each Option
   * reached at its sites (`Option.sites`: a walk to one, then the best there, `arrived`); the path
   * as it is where none is.
   */
  const leaf = (at: Situation, reach: Reach, from: Tally): number => {
    let top = -Infinity;
    // A leaf where a walk has arrived never walks on to a site, and a held leaf reads only open Options.
    // Such a leaf models only the pairs it reads. Most leaves are where a walk arrives, so modelling every
    // walk from each of them would be most of a search's cost.
    const pairs = reach === "whole" ? pairsAt(at) : readsAt(at, reach);
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i]!;
      if (pair.option.open) top = Math.max(top, line(pair, at, 1, from));
      else if (reach === "held") continue;
      else if (toSite(pair)) { if (reach === "whole") top = Math.max(top, line(pair, at, 0, from)); }
      else top = Math.max(top, again(rerun, pair, at, from));
    }
    return top > -Infinity ? top : price(from, at);
  };
  /** What an Option run again from a leaf reads of the search (`Rerun`). */
  const rerun: Rerun = { horizon, dealtWeight, takenWeight, modelAt, child, price, leaf };
  return { horizon, dealtWeight, takenWeight, pairAt, modelAt, pairsAt, child, price, termsOf, stepOf, heldStepOf, cutWorth, line, leaf };
}

/** **The states a search reads** (`space`). */
export type Space = ReturnType<typeof space>;

/** **A step of a line** (`space`'s `stepOf`): its Option's model, and what the path has brought once it has run (`Tally`), what it brings counted by the share of its time within the horizon; an open Option held to the horizon, or one the horizon cuts, ends the path (`cut`). */
export interface Step extends Tally { readonly terms: Terms; readonly cut: boolean }
/** A step as it is written (`stepInto`). */
type Work = { -readonly [K in keyof Step]: Step[K] };
/** No model yet: what a step is made with before it is written. */
const UNPRICED = notPriced("no model is written yet");
const UNWRITTEN: Terms = Object.freeze({ duration: 0, dealt: 0, taken: 0, orders: 0, outcomes: Object.freeze([]),
  from: Object.freeze({ duration: UNPRICED, dealt: UNPRICED, taken: () => UNPRICED, leaves: UNPRICED }) });
const blankStep = (): Work => ({ terms: UNWRITTEN, dealt: 0, taken: 0, orders: 0, seconds: 0, cut: false });
/** A path that has brought nothing yet: where every line begins. */
export const UNBEGUN: Tally = Object.freeze({ dealt: 0, taken: 0, orders: 0, seconds: 0 });
