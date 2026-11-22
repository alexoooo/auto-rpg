import { PROFILE_MODEL } from "./profile-contract.ts";
import { deepFreeze } from "../../core/state.ts";
import { number, type PartField } from "../../parts/fields.ts";
import type { ConfigFor, PartLookup } from "../../parts/lookup.ts";
import type { ChooserPart } from "./parts.ts";
import { anyBody, slotOne, type PartConfig, type Supplied } from "../../parts/parts.ts";
import { whenEmpty } from "../../parts/tree.ts";
import type { OfferTerms } from "../engagement.ts";
import { onOffer, selectSet, type Appraise, type Chance, type Cue, type Deciding, type Holding, type Selection } from "../choice.ts";
import { placed, placing, type Option, type Situation } from "./option.ts";
import { FEW_TERMS_PART, type Objective, type Tally } from "./objective.ts";
import { cachedPressure, graceAt, threatened, type Pressure } from "./percepts.ts";
import { bodyOf, featuresOf, fittedOn, fittedOver, offeredOf, readingAt, validFitted, type Offered } from "./fitted-value.ts";
import { priorsOf, validPrior } from "./move-prior.ts";
import { dataOf, type DataKey } from "../../core/data/store.ts";
import { exp, hypot, log } from "../../core/math/real.ts";
import { ARRIVED } from "../../skills/framework/movement.ts";
import { randomStream } from "../../core/math/random.ts";
import { OBEDIENCE, RETHINK, STEADY, type Leaves, type Obedience, type ObedienceLevel, type Terms } from "./value.ts";


/**
 * How long the valued chooser keeps the target an option runs at (`Deciding.keep`), s: one left
 * sooner, for another near alike, was chosen for a worth it was never given the time to earn, and
 * two such are walked toward by turns.
 */
const KEEP = 1;

/**
 * How long the valued chooser holds its price of a foe other than its focus (`Holding`): until
 * that foe has moved `moved` m about the body, gone down or got up, or `rethink` s have passed.
 */
const HELD_FOE = Object.freeze({ moved: .3, rethink: .6 });

/** The valued chooser's hold of each other foe's situation (`HELD_FOE`), by the foe. */
const FOE_HOLDING: Holding<Situation> = Object.freeze({
  rethink: HELD_FOE.rethink,
  key: (other: Situation) => other.focus?.id ?? "",
  drift: (other: Situation) => {
    const foe = other.focus, centre = other.sight.view.stance.centre;
    return foe ? [{ at: [foe.centre.x - centre.x, foe.centre.z - centre.z], within: HELD_FOE.moved }, { at: [foe.down ? 1 : 0], within: .5 }] : [];
  },
});

/**
 * **A chooser**: of a body's options, the set it runs, whose claims (`Option.claims`) do not
 * overlap: the toolkit's set selection (`selectSet`) over options, priced in a body's terms
 * (`OfferTerms`), each decision's event the cues of the percepts its last decision read (`watching`).
 */
export type Chooser = Selection<Situation, OfferTerms, Option>;

/**
 * **What a chooser watches** (`Cue`): the cues of the cued percepts its last decision asked for
 * (`Cues`), counted afresh as each decision begins. Its memory is their names.
 */
function watching(): Cue<Situation> & { readonly state: { watched: string[] } } {
  const state = { watched: [] as string[] };
  return {
    state,
    event: (now) => now.cues.event(now, state.watched),
    deciding: (now) => now.cues.clear(),
    decided: (now) => { state.watched = now.cues.asked(); },
  };
}

/**
 * **The one policy** (`selectSet`) over `options`, priced by `appraise`, its event the cues its last
 * decision read (`watching`), drawn by `chance` where it gives a margin, each other foe's price held as
 * `holding` says where it is not null; its memory the selection's, what it watches, the memory of the `objective`
 * it prices by, where that keeps one (`Objective.state`), and the chooser's `own`.
 */
const chooser = ({ options, appraise, deciding, chance, objective, holding, own }: {
  readonly options: readonly Option[]; readonly appraise: Appraise<Situation, OfferTerms, Option>; readonly deciding: Deciding; readonly chance: Chance;
  readonly objective: Objective | null; readonly holding: Holding<Situation> | null; readonly own: Readonly<Record<string, object>>;
}): Chooser => {
  const cue = watching();
  return selectSet<Situation, OfferTerms, Option>({ choices: options, appraise, deciding, cue, chance,
    memory: { cue: cue.state, ...(objective?.state ? { objective: objective.state } : {}), ...own }, holding });
};

/** **A kind of Option Mind's chooser** (`ChooserPart`): over its options (`Option`), the chooser it makes a `Chooser`. */
export type OptionChooserPart<C extends PartConfig = PartConfig> = ChooserPart<C, Option, Chooser>;

/**
 * The chooser `config` names, as `parts` finds it, over `options`, its chances drawn from `seed`, for
 * `body` (`bodyOf`): a part of the role makes a chooser over the options it is given
 * (`ChooserPart`), which Option Mind's are.
 */
export const chooserOf = (parts: PartLookup, config: PartConfig, options: readonly Option[], seed: number, body: string): Chooser =>
  parts.of("chooser", config).make({ config, options, seed, parts, body }) as Chooser;

/** How many options deep the valued chooser searches: the one it takes, or that and the best from where it leaves the body (`searching`). */
const VALUED_DEPTHS: readonly number[] = Object.freeze([1, 2]);

/**
 * How far ahead the valued chooser looks unless its config says (`ValuedConfig.horizon`), s: set
 * so that from every posture the body lies in, a way up's standing falls within it.
 */
const HORIZON = 20;

/** A depth other than those the valued chooser looks (`VALUED_DEPTHS`), as a fault. */
const depthFaults = (depth: number): readonly string[] =>
  VALUED_DEPTHS.includes(depth) ? [] : [`depth: ${VALUED_DEPTHS.join(" or ")}`];

/** An Option and target (0 where it has none), with its slot in each situation's model row, and what its model is asked there (`Option.model`): the same each time, so made once. */
export interface Pair { readonly option: Option; readonly target: number; readonly slot: number; readonly ask: Readonly<{ target: number; until?: number }> }

/** **A line's price at a decision**: its worth, life, and the model of the Option it begins with there. */
interface Line { readonly worth: number; readonly terms: Terms }

/**
 * **What a leaf weighs** (`Leaf`): `whole`, where a line's last Option ends, every Option held or
 * run again and a walk to a site; `arrived`, where that walk ends, all but another walk; `held`,
 * where a run again leaves the body, the open Options only.
 */
export type Reach = "whole" | "arrived" | "held";

/** Whether `leaves` changes nothing (`AS_IS`). */
const unchanged = (leaves: Leaves): boolean => leaves.where === undefined && leaves.around === undefined && leaves.posture === undefined && leaves.velocity === undefined && leaves.grace === undefined;

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
interface Searched {
  readonly options: readonly Option[];
  readonly objective: Objective;
  readonly obedience: Obedience;
  readonly horizon: number;
  /** The seconds the focus keeps its velocity in the states the search reads (`placing`). */
  readonly carry: number;
  /** The body it searches for: its model and what it holds (`bodyOf`). */
  readonly body: string;
}

/**
 * **The states a search at `root` reads** (`Situation`), over `options` priced by `objective` at
 * `obedience` over the `horizon`, s, made once a decision. A model is asked at most once a state for
 * each Option and target, and only where something reads it (`modelAt`, `pairsAt`: at `root` an Option
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
function space(root: Situation, { options, objective, obedience, horizon, carry, body }: Searched) {
  const place = placing(carry);
  /** What life dealt, and taken, traded evenly over `span` s from `from` s on counts for, a share (`Objective.weigh`); 1 where the objective weighs none. */
  const dealtWeight = (from: number, span: number): number => objective.weigh ? objective.weigh("dealt", from, span, horizon) : 1;
  const takenWeight = (from: number, span: number): number => objective.weigh ? objective.weigh("taken", from, span, horizon) : 1;
  const sites = new Set<string>();
  for (const option of options) if (option.sites) for (const site of option.sites) sites.add(site.name);
  // Descriptors belong to the search; each situation owns its result row and offered list.
  // Repeated Option identities share slots but keep their occurrences in the offered list.
  const offsets = new Map<Option, number>(), descriptors: Pair[] = [];
  for (const option of options) if (!offsets.has(option)) {
    offsets.set(option, descriptors.length);
    for (let target = 0; target < Math.max(1, option.targets?.length ?? 0); target++)
      descriptors.push(Object.freeze({ option, target, slot: descriptors.length, ask: Object.freeze(option.open ? { target } : { target, until: horizon }) }));
  }
  // A state's offers, all of them (`offered`) and those a held or an arrived leaf reads (`held`, `arrived`); and the states made from it (`children`).
  const models = new Map<Situation, (Terms | null | undefined)[]>(), offered = new Map<Situation, readonly Pair[]>(), children = new Map<Situation, Made[]>();
  const held = new Map<Situation, readonly Pair[]>(), arrived = new Map<Situation, readonly Pair[]>();
  /** The search's descriptor for `option` at `target`. */
  const pairAt = (option: Option, target: number): Pair => descriptors[offsets.get(option)! + target]!;
  /** The model of `pair` from `at`, asked once (an open one priced as an instant). */
  const modelAt = (pair: Pair, at: Situation): Terms | null => {
    let row = models.get(at);
    if (!row) models.set(at, row = new Array<Terms | null | undefined>(descriptors.length));
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
  /** The model a line runs `pair` by from `at`, `seconds` s into the horizon: an open one's to the horizon. */
  const termsOf = (pair: Pair, at: Situation, seconds: number): Terms =>
    (pair.option.open ? pair.option.model(at, { target: pair.target, until: Math.max(0, horizon - seconds) }) : modelAt(pair, at))!;
  /**
   * **A step of a line** (`Step`): `pair` run from `at`, after a path that brought `from`, written into `out`.
   */
  const stepInto = (out: Work, pair: Pair, at: Situation, from: Tally): Step => {
    const { dealt, taken, orders, seconds } = from, option = pair.option, terms = termsOf(pair, at, seconds), share = terms.duration > 0 ? Math.max(0, Math.min(1, (horizon - seconds) / terms.duration)) : 1;
    let chances = 0;
    for (let i = 0; i < terms.outcomes.length; i++) chances += terms.outcomes[i]!.chance;
    if (Math.abs(chances - 1) > 1e-9) throw new Error(`${option.name}'s outcomes' chances sum to ${chances}`);
    const after = seconds + share * terms.duration, counts = takenWeight(seconds, share * terms.duration), dealing = dealtWeight(seconds, share * terms.duration);
    out.terms = terms; out.dealt = dealt + dealing * share * terms.dealt; out.taken = taken + counts * share * terms.taken; out.orders = orders + share * terms.orders; out.seconds = after;
    out.cut = option.open === true || after >= horizon;
    return out;
  };
  /** A step of a line, made anew: what a tree's edge keeps. */
  const stepOf = (pair: Pair, at: Situation, from: Tally): Step => stepInto(blankStep(), pair, at, from);
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
    const step = stepInto(frames[depth] ??= blankStep(), pair, at, from), terms = step.terms;
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
  return { horizon, body, dealtWeight, takenWeight, pairAt, modelAt, pairsAt, child, price, termsOf, stepOf, cutWorth, line, leaf };
}

/** **The states a search reads** (`space`). */
type Space = ReturnType<typeof space>;


/** **What an Option run again from a leaf reads of a search** (`space`): its horizon, how it weighs life by when it comes, its models, the states it makes, its price and its leaves. */
interface Rerun {
  readonly horizon: number;
  dealtWeight(from: number, span: number): number;
  takenWeight(from: number, span: number): number;
  modelAt(pair: Pair, at: Situation): Terms | null;
  child(at: Situation, leaves: Leaves, seconds: number): Situation;
  price(tally: Tally, end: Situation): number;
  leaf(at: Situation, reach: Reach, from: Tally): number;
}

/**
 * **`pair` run again and again from `at` to the horizon**, where a try of it leaves
 * the body where it began (its staying outcome, by the chance it stays): the life each try
 * deals and takes, the tries as many as fit in the time left, and the orders it carries out once
 * (`Terms.orders`: an order carried out is carried out, and a try that leaves the state as it found
 * it carries out nothing more of it); each the chance of leaving compounding, the body leaving after
 * as many tries as it is expected to, then held where it went (`leaf`, an open Option). -Infinity
 * where no outcome stays, or a try takes no time.
 */
function again({ horizon, dealtWeight, takenWeight, modelAt, child, price, leaf }: Rerun, pair: Pair, at: Situation, from: Tally): number {
  const { dealt, taken, orders, seconds } = from, terms = modelAt(pair, at)!, duration = terms.duration;
  if (!(duration > 0) || seconds >= horizon) return -Infinity;
  let stay = 0, there: Situation | null = null;
  for (let i = 0; i < terms.outcomes.length; i++) {
    const end = child(at, terms.outcomes[i]!.leaves, duration);
    if (end.posture === at.posture && Math.abs(end.range - at.range) <= ARRIVED) { stay += terms.outcomes[i]!.chance; there = end; }
  }
  if (!there) return -Infinity;
  // Of `full` whole tries, the chance all stay (`through`), and the tries the body is expected to run where one leaves (`run`).
  const tries = (horizon - seconds) / duration, full = Math.floor(tries), through = full === 0 ? 1 : stay === 0 ? 0 : exp(full * log(stay)), left = 1 - through;
  const o = orders + Math.min(1, tries) * terms.orders;
  const whole = takenWeight(seconds, horizon - seconds), wholeDealt = dealtWeight(seconds, horizon - seconds);
  let worth = through * price({ dealt: dealt + wholeDealt * tries * terms.dealt, taken: taken + whole * tries * terms.taken, orders: o, seconds: horizon }, there);
  if (left > 0) {
    const run = (1 - (full + 1) * through + full * through * stay) / ((1 - stay) * left), part = takenWeight(seconds, run * duration);
    const ran: Tally = { dealt: dealt + dealtWeight(seconds, run * duration) * run * terms.dealt, taken: taken + part * run * terms.taken, orders: o, seconds: seconds + run * duration };
    for (let i = 0; i < terms.outcomes.length; i++) {
      const outcome = terms.outcomes[i]!, end = child(at, outcome.leaves, duration);
      if (end === there || end.posture === at.posture && Math.abs(end.range - at.range) <= ARRIVED) continue;
      worth += left * outcome.chance / (1 - stay) * leaf(end, "held", ran);
    }
  }
  return worth;
}

/**
 * **A kind of leaf** (`TreeConfig.leaf`): its name on the page, the mind data it reads, and what a
 * search's leaf is worth at a state, after what the path to it brought (`leafOf`, made once a
 * search at its root).
 */
interface LeafKind {
  readonly label: string;
  readonly reads: readonly DataKey[];
  leafOf(search: Space, root: Situation): (at: Situation, from: Tally) => number;
}

/**
 * **The kinds of leaf**: `tail`, the game's, the best of each Option on offer run again to the
 * horizon or held, and of a walk to each site (`space`'s `leaf`, whole); `fitted`, the path's
 * price and a value fitted to what followed the states bouts reached (`fittedLeaf`).
 */
const LEAVES = Object.freeze({
  tail: Object.freeze({ label: "Tail", reads: Object.freeze([]), leafOf: (search: Space) => (at: Situation, from: Tally) => search.leaf(at, "whole", from) }),
  fitted: Object.freeze({ label: "Fitted to what followed", reads: Object.freeze(["fitted-value"] as const), leafOf: fittedLeaf }),
} satisfies Readonly<Record<string, LeafKind>>);

/**
 * **A leaf worth its path priced with what a value fitted to what followed reads there**
 * (`dataOf("fitted-value")`, `fittedOver`): the life dealt and taken over the seconds the path
 * leaves to the horizon added to the path's, as if it ran there, each weighed as traded evenly over
 * those seconds (`dealtWeight`, `takenWeight`); the state read with the Options on
 * offer as their models price one try, and the reach's grace its own where its Option reckoned it,
 * else the root's. The tail's where the state has no focus, and through a search whose body or
 * focus is not one the value was fitted on (`fittedOn`).
 */
function fittedLeaf(search: Space, root: Situation): (at: Situation, from: Tally) => number {
  const value: unknown = dataOf("fitted-value"), grace = graceAt(root);
  if (!validFitted(value)) throw new Error("fitted-value: not a value over today's features");
  if (!fittedOn(value.bodies, search.body, root.focus)) return (at, from) => search.leaf(at, "whole", from);
  return (at, from) => {
    const offered: Offered[] = [];
    for (const pair of search.pairsAt(at)) { const terms = search.modelAt(pair, at); if (terms) offered.push(offeredOf(pair.option.kind, pair.option.open === true, terms)); }
    const reading = readingAt(at, at.grace ?? grace, offered);
    if (!reading) return search.leaf(at, "whole", from);
    const left = search.horizon - from.seconds, followed = fittedOver(value, featuresOf(reading), left);
    const dealt = from.dealt + search.dealtWeight(from.seconds, left) * followed.dealt, taken = from.taken + search.takenWeight(from.seconds, left) * followed.taken;
    return search.price({ dealt, taken, orders: from.orders, seconds: Math.max(from.seconds, search.horizon) }, at);
  };
}
type LeafName = keyof typeof LEAVES;

/**
 * **A kind of prior** (`TreeConfig.prior`): its name on the page, the mind data it reads, and, made
 * once a search at its root, what share of a state's runs it gives each Option on offer there
 * (`priorOf`), none where it reads none; a search without one has none.
 */
interface PriorKind {
  readonly label: string;
  readonly reads: readonly DataKey[];
  priorOf(search: Space, root: Situation): ((at: Situation, pairs: readonly Pair[]) => readonly number[] | null) | null;
}

/**
 * **The kinds of prior**: `none`, the game's, each Option tried once before the bound picks among
 * them (UCT); `fitted`, shares of a search's runs fitted to where searches' runs went
 * (`fittedPrior`), guiding the bound below the root (PUCT); `even`, every Option on offer the
 * same share, PUCT's bound unguided.
 */
const PRIORS = Object.freeze({
  none: Object.freeze({ label: "None", reads: Object.freeze([]), priorOf: () => null }),
  fitted: Object.freeze({ label: "Fitted to runs", reads: Object.freeze(["move-prior"] as const), priorOf: fittedPrior }),
  even: Object.freeze({ label: "Even", reads: Object.freeze([]), priorOf: () => (_at: Situation, pairs: readonly Pair[]) => pairs.map(() => 1 / pairs.length) }),
} satisfies Readonly<Record<string, PriorKind>>);
type PriorName = keyof typeof PRIORS;

/**
 * **What a prior's bound makes of an Option no run below the root has taken yet** (`TreeConfig.untried`):
 * `floor`, worth its state's leaf (`TreeNode.floor`), tried or not by its bound; `mean`, worth what its
 * state is worth so far (`TreeNode.worth`); `once`, each tried once, the greater share first, before the
 * bound picks among them.
 */
const UNTRIED = Object.freeze({
  floor: Object.freeze({ label: "Its state's leaf" }),
  mean: Object.freeze({ label: "Its state's worth so far" }),
  once: Object.freeze({ label: "Each once, the greater share first" }),
});
type UntriedName = keyof typeof UNTRIED;

/**
 * **Which of a line's runs its state's mean counts** (`TreeConfig.counts`, `backedUp`): all but the first
 * `skipped` of them; `every` one, or, `past-first`, those past its first, the first being the search's try of every line in turn,
 * not what the body would take there, so a state whose lines were each tried once is worth its leaf.
 */
const COUNTS = Object.freeze({
  every: Object.freeze({ label: "Every run", skipped: 0 }),
  "past-first": Object.freeze({ label: "Past each line's first", skipped: 1 }),
});
type CountsName = keyof typeof COUNTS;

/**
 * **Shares of a state's runs a move prior reads** (`dataOf("move-prior")`, `priorsOf`): the
 * state read as the fitted leaf reads one (`readingAt`, the reach's grace its own where its Option
 * reckoned it, else the root's), and each Option by its first step from there on a path begun there
 * and what the objective prices that step at. None where the state has no focus, nor through a
 * search whose body or focus is not one the prior was fitted on (`fittedOn`).
 */
function fittedPrior(search: Space, root: Situation): ((at: Situation, pairs: readonly Pair[]) => readonly number[] | null) | null {
  const prior: unknown = dataOf("move-prior"), grace = graceAt(root);
  if (!validPrior(prior)) throw new Error("move-prior: not a prior over today's features");
  if (!fittedOn(prior.bodies, search.body, root.focus)) return null;
  return (at, pairs) => {
    const offered: Offered[] = [];
    for (const pair of pairs) { const terms = search.modelAt(pair, at); if (terms) offered.push(offeredOf(pair.option.kind, pair.option.open === true, terms)); }
    const reading = readingAt(at, at.grace ?? grace, offered);
    if (!reading) return null;
    return priorsOf(prior, featuresOf(reading), pairs.map((pair) => {
      const step = search.stepOf(pair, at, UNBEGUN), terms = step.terms;
      return { kind: pair.option.kind, open: pair.option.open === true, duration: terms.duration, dealt: terms.dealt, taken: terms.taken, price: search.price(step, at) };
    }));
  };
}

/** **A step of a line** (`space`'s `stepOf`): its Option's model, and what the path has brought once it has run (`Tally`), what it brings counted by the share of its time within the horizon; an open Option, or one the horizon cuts, ends the path (`cut`). */
interface Step extends Tally { readonly terms: Terms; readonly cut: boolean }
/** A step as it is written (`stepInto`). */
type Work = { -readonly [K in keyof Step]: Step[K] };
/** No model yet: what a step is made with before it is written. */
const UNWRITTEN: Terms = Object.freeze({ duration: 0, dealt: 0, taken: 0, orders: 0, outcomes: Object.freeze([]) });
const blankStep = (): Work => ({ terms: UNWRITTEN, dealt: 0, taken: 0, orders: 0, seconds: 0, cut: false });
/** A path that has brought nothing yet: where every line begins. */
const UNBEGUN: Tally = Object.freeze({ dealt: 0, taken: 0, orders: 0, seconds: 0 });

/** What a search prices at a decision: each Option at each target its line from the state decided at (`Line`), null where it is not on offer. */
type Lines = (option: Option, target: number) => Line | null;

/** **A root's line as a search priced it**: its Option at its target (`Pair`), its worth and its model's terms. */
type PricedLine = Line & { readonly pair: Pair };

/** A completed tree's lookup captures only root prices, without its nodes or search workspace. */
function pricedLines(prices: readonly PricedLine[]): Lines {
  return (option, target) => {
    for (let i = 0; i < prices.length; i++) {
      const priced = prices[i]!;
      if (priced.pair.option === option && priced.pair.target === target) return { worth: priced.worth, terms: priced.terms };
    }
    return null;
  };
}

/** **The valued chooser's search at `root`**: each Option's line from there at each of its targets, `depth` Options deep (`space`'s `line`). */
function search(root: Situation, searched: Searched & { readonly depth: number }): Lines {
  const at = space(root, searched), { depth } = searched, lines = new Map<Option, (Line | null)[]>();
  return (option, target) => {
    let byTarget = lines.get(option);
    if (!byTarget) lines.set(option, byTarget = []);
    let priced = byTarget[target];
    if (priced === undefined) {
      const pair = at.pairAt(option, target);
      byTarget[target] = priced = at.modelAt(pair, root) ? { worth: at.line(pair, root, depth, UNBEGUN), terms: at.termsOf(pair, root, 0) } : null;
    }
    return priced;
  };
}

/**
 * **A state in the tree** (`treeSearch`): the state, the path to it (life dealt and taken, orders,
 * s), the runs through it, an edge for each Option on offer there (made when first run through),
 * what its leaf is worth (`floor`), and what it is worth (`worth`, `backedUp`).
 */
interface TreeNode extends Tally { readonly at: Situation; readonly floor: number;
  runs: number; worth: number; edges: TreeEdge[] | null }

/**
 * **An Option in the tree** (`treeSearch`), at its target from its state: its step (`Step`), the
 * state each way it ends leads to (made when first drawn), the runs through it, and what it is
 * worth: cut, its ways of ending priced where they leave the body; else the worths of the states
 * drawn by their chances among those drawn. With a prior, the share of its state's runs that gives it.
 */
interface TreeEdge { readonly pair: Pair; readonly step: Step; readonly ends: (TreeNode | null)[]; runs: number; worth: number; readonly kept?: Kept; readonly prior?: number }

/** **What a search starts an Option at its root from** (`RootStart`): its worth, and how many runs it is worth as evidence now. */
interface Kept { readonly worth: number; readonly weight: number }

/**
 * **Where a tree search starts its root** (`treeSearch`), one search at a time: each Option and
 * target's evidence before it runs (`Kept`), none where it has none; and, the search over, what it
 * keeps of the root's Options (`TreeEdge`), each its worth and the runs it stood on, its evidence's
 * among them.
 */
type RootStart = (root: Situation) => {
  kept(pair: Pair): Kept | undefined;
  keep(edges: readonly TreeEdge[]): void;
};

/** **A cold start**: no evidence, nothing kept. */
const COLD_ROOT: ReturnType<RootStart> = Object.freeze({ kept: () => undefined, keep: () => {} });
const COLD: RootStart = () => COLD_ROOT;

/**
 * **A tree chooser's kept work** (`TreeConfig.keeps`), by the focus searched against (its id, or
 * none): when its last search was, s, and each Option and target at its root then, by its place
 * in the options and its target, its worth and the runs it stood on. Plain numbers, in the
 * chooser's state, so a bout saved and loaded searches on from the same.
 */
interface Warm { byFocus: Record<string, { at: number; keys: string[]; worths: number[]; weights: number[] }> }

/**
 * **A warm start** (`RootStart`): what the last search against the same focus kept of its root
 * (`Warm`, its `state`), each Option at the root by its worth and runs, the runs fading by half
 * each `keeps` s since.
 */
function warmStart(options: readonly Option[], keeps: number): { readonly start: RootStart; readonly state: Warm } {
  const keyOf = (pair: Pair): string => `${options.indexOf(pair.option)}:${pair.target}`, state: Warm = { byFocus: {} };
  return { state, start: (root) => {
    const kept = new Map<string, Kept>(), focus = root.focus?.id ?? "", last = state.byFocus[focus];
    if (last && root.time >= last.at) {
      const fade = exp(-log(2) * (root.time - last.at) / keeps);
      last.keys.forEach((key, i) => kept.set(key, { worth: last.worths[i]!, weight: last.weights[i]! * fade }));
    }
    return {
      kept: (pair) => kept.get(keyOf(pair)),
      keep: (edges) => { state.byFocus[focus] = { at: root.time, keys: edges.map((edge) => keyOf(edge.pair)), worths: edges.map((edge) => edge.worth), weights: edges.map((edge) => edge.runs + (edge.kept?.weight ?? 0)) }; },
    };
  } };
}

/**
 * **What a state in the tree is worth** (`TreeNode.worth`): its best line by `best` and the mean of
 * its lines by the rest. Its best line, the more of its floor and its best Option run or kept: the
 * models are the mind's own, so its best line found, never less than its leaf. The mean of its
 * lines: its floor as `leaf` runs and each Option by the runs it stood on past its first `skipped`
 * (`COUNTS`), a kept one's evidence among them.
 */
function backedUp(node: TreeNode, best: number, skipped: number, leaf: number): number {
  let top = node.floor, sum = node.floor * leaf, weight = leaf;
  const edges = node.edges;
  if (edges) for (let i = 0; i < edges.length; i++) {
    const edge = edges[i]!, runs = Math.max(0, edge.runs - skipped) + (edge.kept?.weight ?? 0);
    if (edge.runs > 0 || edge.kept) top = Math.max(top, edge.worth);
    sum += edge.worth * runs; weight += runs;
  }
  return top + (1 - best) * (sum / weight - top);
}

/**
 * **The tree chooser's search at `root`**: `runs` runs of a Monte Carlo tree search over the
 * states its Options' models lead to (`space`), `stream` drawing the ways they end. A run goes down
 * from `root`, at each state taking the first Option on offer there that no run has taken, else the
 * one of best bound (its worth and `exploration` times the spread of its siblings' worths, by how
 * few of the state's runs it has had), the fewer runs on a tie. Below the root, where `prior` gives
 * a state's Options their shares, it takes the one of best bound by them instead: its worth, or
 * untried what `untried` makes it, and `exploration` times the spread of that and its tried
 * Options' worths, times its share and the root of the state's runs over one more than its own
 * (PUCT), the greater share on a tie; under `once` each first tried once, the greater share first. At each Option one way it ends,
 * drawn by its chance. It ends at the first state it makes, worth its leaf (`leaf`, whole), or where
 * its Option is cut (`cutWorth`); then each Option and state it went through is worth again what
 * lies below it (`TreeEdge`; a state its best line by `best`, `backedUp`). Every Option on offer
 * at `root` is run at least once. Its root's Options start from what `start` gives them, as
 * evidence of as many runs as it says.
 */
function treeSearch(root: Situation, searched: Searched & { readonly runs: number; readonly exploration: number; readonly best: number; readonly stream: { next(): number }; readonly leaf: LeafKind; readonly prior: PriorKind; readonly untried: UntriedName; readonly skipped: number; readonly leafWeight: number; readonly start: RootStart }): PricedLine[] {
  const { runs, exploration, best, stream, start, untried, skipped, leafWeight } = searched;
  const predictions = root.predictions;
  let pressure: Pressure | undefined;
  root = Object.create(root, { predictions: { value: Object.create(predictions, {
    pressure: { get: () => pressure ??= cachedPressure(predictions.pressure) },
  }) } }) as Situation;
  const at = space(root, searched), leafAt = searched.leaf.leafOf(at, root), priorAt = searched.prior.priorOf(at, root);
  const nodeAt = (state: Situation, from: Tally): TreeNode => {
    const floor = leafAt(state, from);
    return { at: state, dealt: from.dealt, taken: from.taken, orders: from.orders, seconds: from.seconds, floor, runs: 0, worth: floor, edges: null };
  };
  const top = nodeAt(root, UNBEGUN), started = start(root);
  // A cut edge draws no way of ending (`run`): it shares one empty store.
  const edgesOf = (node: TreeNode): TreeEdge[] => {
    if (node.edges) return node.edges;
    const pairs = at.pairsAt(node.at), edges = new Array<TreeEdge>(pairs.length), shares = node === top || !priorAt ? null : priorAt(node.at, pairs);
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i]!, step = at.stepOf(pair, node.at, node);
      const was = node === top ? started.kept(pair) : undefined;
      edges[i] = { pair, runs: 0, worth: was?.worth ?? 0, ends: [], step, ...(was && was.weight > 0 ? { kept: was } : {}), ...(shares ? { prior: shares[i]! } : {}) };
    }
    if (node === top) for (const edge of edges) node.runs += edge.kept?.weight ?? 0;
    return node.edges = edges;
  };
  /** The edge a run takes from `node`. */
  const pick = (node: TreeNode, edges: readonly TreeEdge[]): TreeEdge => {
    const guided = edges[0]!.prior !== undefined;
    if (guided && untried === "once") {
      let first: TreeEdge | null = null;
      for (const edge of edges) if (edge.runs === 0 && (!first || edge.prior! > first.prior!)) first = edge;
      if (first) return first;
    }
    const unrun = untried === "mean" ? node.worth : node.floor, spread = guided && untried !== "once";
    let low = spread ? unrun : Infinity, high = spread ? unrun : -Infinity;
    for (const edge of edges) {
      if (edge.runs === 0 && !edge.kept) { if (guided) continue; return edge; }
      low = Math.min(low, edge.worth); high = Math.max(high, edge.worth);
    }
    const scale = exploration * (high - low), total = log(node.runs);
    let chosen = edges[0]!, bound = -Infinity;
    if (guided) {
      const visits = Math.sqrt(node.runs);
      for (const edge of edges) {
        const value = (edge.runs > 0 ? edge.worth : unrun) + scale * edge.prior! * visits / (1 + edge.runs);
        if (value > bound || value === bound && edge.prior! > chosen.prior!) { chosen = edge; bound = value; }
      }
      return chosen;
    }
    for (const edge of edges) {
      const value = edge.worth + scale * Math.sqrt(total / (edge.runs + (edge.kept?.weight ?? 0)));
      if (value > bound || value === bound && edge.runs < chosen.runs) { chosen = edge; bound = value; }
    }
    return chosen;
  };
  /** The way `terms` ends that a draw takes, by their chances. */
  const draw = (terms: Terms): number => {
    const outcomes = terms.outcomes;
    let u = stream.next();
    for (let k = 0; k < outcomes.length - 1; k++) { u -= outcomes[k]!.chance; if (u < 0) return k; }
    return outcomes.length - 1;
  };
  /** What `edge` is worth from the states drawn of its ways of ending (`TreeEdge`); a cut edge keeps its own. */
  const reprice = (edge: TreeEdge): void => {
    if (edge.step.cut) return;
    let worth = 0, mass = 0;
    const outcomes = edge.step.terms.outcomes;
    for (let k = 0; k < outcomes.length; k++) {
      const end = edge.ends[k], chance = outcomes[k]!.chance;
      if (end) { worth += chance * end.worth; mass += chance; }
    }
    edge.worth = worth / mass;
    // Kept worth weighs as its runs against this search's.
    const kept = edge.kept;
    if (kept) edge.worth = (kept.worth * kept.weight + edge.worth * edge.runs) / (kept.weight + edge.runs);
  };
  const nodes: TreeNode[] = [], taken: TreeEdge[] = [];
  /** One run from the top: down to its first new state or a cut; then every edge and state it went through worth again what lies below. */
  const run = (): void => {
    nodes.length = 0; taken.length = 0;
    let node = top;
    for (;;) {
      nodes.push(node);
      const edges = edgesOf(node);
      if (edges.length === 0) break;
      const edge = pick(node, edges), step = edge.step;
      taken.push(edge);
      if (step.cut) { if (edge.runs === 0) edge.worth = at.cutWorth(node.at, step); break; }
      const k = draw(step.terms), next = edge.ends[k];
      if (next) { node = next; continue; }
      edge.ends[k] = nodeAt(at.child(node.at, step.terms.outcomes[k]!.leaves, step.terms.duration), step);
      break;
    }
    for (let i = taken.length - 1; i >= 0; i--) { const edge = taken[i]!; edge.runs++; reprice(edge); const node = nodes[i]!; node.worth = backedUp(node, best, skipped, leafWeight); }
    for (const visited of nodes) visited.runs++;
  };
  for (let k = 0; k < Math.max(runs, edgesOf(top).length); k++) run();
  const edges = top.edges!, prices = new Array<PricedLine>(edges.length);
  started.keep(edges);
  for (let i = 0; i < edges.length; i++) { const edge = edges[i]!; prices[i] = { pair: edge.pair, worth: edge.worth, terms: edge.step.terms }; }
  return prices;
}

/** What a tree search is given (`treeSearch`). */
type TreeSearched = Parameters<typeof treeSearch>[1];

/**
 * **The tree's search against the foe's replies** (`TreeConfig.replies`, `against`): each line at
 * `root` worth its worst (`worst`) or the mean (`mean`) of what a tree search prices it at with the
 * foe standing (`treeSearch`) and with the foe running each of `replies` replies over the line's
 * first step, a joint step; past it the foe stands, as in any line. A foe of the body's own build
 * (`bodyOf`) can do what the body's own lines do, roles swapped: two bodies swap by a half turn
 * about their midpoint, so where a line moves the body by a step, the foe's like move is the step
 * reversed, over its seconds (`replyOf`). Its replies are those moves that go furthest each way
 * (`DIRECTIONS`): closing on the body, backing off, and to either side, the first `replies` of
 * them, so the worst of them is the foe's best reply whatever it prefers. Elsewhere, and where
 * none moves, the foe stands.
 */
function repliedSearch(root: Situation, searched: TreeSearched & { readonly replies: number; readonly against: AgainstName }): PricedLine[] {
  const own = treeSearch(root, searched), focus = root.focus, where = root.where;
  if (searched.replies === 0 || !focus || !where || bodyOf(focus.spec) !== searched.body) return own;
  const apart = hypot(where.x - focus.centre.x, where.z - focus.centre.z);
  if (!(apart > 0)) return own;
  // From the foe toward the body, and across.
  const ux = (where.x - focus.centre.x) / apart, uz = (where.z - focus.centre.z) / apart;
  const moves = own.map((line) => replyOf(root, line.terms)), worths = own.map((line) => [line.worth]), chosen = new Set<number>();
  for (const [along, across] of DIRECTIONS.slice(0, searched.replies)) {
    let best = -1, most = 0;
    moves.forEach((move, i) => {
      if (!move || chosen.has(i)) return;
      const toward = (move.x * ux + move.z * uz) * along + (move.z * ux - move.x * uz) * across;
      if (toward > most) { most = toward; best = i; }
    });
    if (best < 0) continue;
    chosen.add(best);
    const reply = moves[best]!, moved = Object.create(root, { focus: { value: Object.create(focus, { velocity: { value: { x: reply.x, y: 0, z: reply.z } } }) } }) as Situation;
    const replied = treeSearch(moved, { ...searched, carry: reply.seconds, start: COLD });
    own.forEach((line, i) => {
      const same = replied.find((other) => other.pair.option === line.pair.option && other.pair.target === line.pair.target);
      if (same) worths[i]!.push(same.worth);
    });
  }
  return own.map((line, i) => {
    const all = worths[i]!;
    return { ...line, worth: searched.against === "mean" ? all.reduce((sum, worth) => sum + worth, 0) / all.length : Math.min(...all) };
  });
}

/**
 * **The foe's reply to a line of model `terms` at `root`**: the velocity that moves the foe by the
 * line's first step reversed (each way it ends by its chance, `Leaves.where`), over that step's
 * seconds; none where it does not move the body.
 */
function replyOf(root: Situation, terms: Terms): { readonly x: number; readonly z: number; readonly seconds: number } | null {
  const from = root.where!;
  let x = 0, z = 0;
  for (const outcome of terms.outcomes) { const where = outcome.leaves.where ?? from; x += outcome.chance * (where.x - from.x); z += outcome.chance * (where.z - from.z); }
  if (!(terms.duration > 0) || hypot(x, z) < REPLY_LEAST) return null;
  return { x: -x / terms.duration, z: -z / terms.duration, seconds: terms.duration };
}

/** The least a reply moves the foe, m (`replyOf`): a line moving the body less is the foe standing. */
const REPLY_LEAST = .01;

/** **The ways a foe's replies go** (`repliedSearch`), in order, as [toward the body, across it]: closing, backing off, to one side, to the other. */
const DIRECTIONS: readonly (readonly [number, number])[] = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);

/**
 * **What a line is worth against the foe's replies** (`TreeConfig.against`): `worst`, the least of
 * its worths with the foe standing and replying; `mean`, their mean.
 */
const AGAINST = Object.freeze({
  worst: Object.freeze({ label: "Its worst" }),
  mean: Object.freeze({ label: "Their mean" }),
});
type AgainstName = keyof typeof AGAINST;

/**
 * **A chooser's appraisal by a search** (`search`, `treeSearch`), made once a decision for each
 * state by `make`: a running choice's price, its line, its model's terms with what it is expected to
 * leave as a readout shows it (`OfferTerms`: the range and the chance of being down, by the
 * chances of the ways it ends), how much its line is worth beyond what its own model brings
 * (`moves`), and what letting it go costs (`letGo`: the life it loses while it comes back beyond
 * what holding as long costs, `threatened`, none below nothing).
 */
function searching(make: (now: Situation) => Lines): Appraise<Situation, OfferTerms, Option> {
  const searches = new Map<Situation, Lines>();
  let time = NaN;
  return (option, _i, now, target) => {
    if (now.time !== time) { searches.clear(); time = now.time; }
    let lines = searches.get(now);
    if (!lines) searches.set(now, lines = make(now));
    const priced = lines(option, target);
    if (!priced) return null;
    const { worth, terms } = priced;
    let range = 0, down = 0;
    for (const outcome of terms.outcomes) {
      const end = unchanged(outcome.leaves) ? now : placed(now, outcome.leaves, terms.duration);
      range += outcome.chance * end.range; down += outcome.chance * (end.down ? 1 : 0);
    }
    const letGo = terms.letGo ? Math.max(0, terms.letGo.taken - threatened(now, terms.letGo.seconds)) : 0;
    return { name: option.name, kind: option.kind, worth, terms: { open: option.open === true, duration: terms.duration, dealt: terms.dealt, taken: terms.taken, orders: terms.orders, exit: { range, down } },
      moves: worth - (terms.dealt - terms.taken), letGo };
  };
}

/**
 * **What a chooser that prices by a search is given**: how far ahead it looks, s (`horizon`;
 * `HORIZON` unless given), what a metre walked as ordered is worth, life (`obedience`, a level of
 * `OBEDIENCE`; steady, `STEADY`, unless given), the margin of worth, life, within which it chooses
 * by chance (`Chance`), none unless given, the objective it prices options by (`objective`, a
 * part of role `objective`; the few terms, `FEW_TERMS_PART`, unless given).
 */
interface SearchConfig { readonly horizon?: number; readonly carry?: number; readonly obedience?: ObedienceLevel; readonly margin?: number; readonly objective?: ConfigFor<"objective"> | null }

/** **The valued chooser's config**: its depth (`VALUED_DEPTHS`), and what every search is given (`SearchConfig`). */
interface ValuedConfig extends SearchConfig { readonly kind: "valued"; readonly depth: number }

/**
 * A searching chooser's obedience (`OBEDIENCE`): a choice written as its level's value, the steady
 * level written as none, so a config at steady equals the preset.
 */
function obedienceField<C extends SearchConfig>(): PartField<C> {
  return {
    kind: "choice", key: "obedience", label: "Obedience", options: () => OBEDIENCE.map(([value, name]) => [value, name] as const),
    read: (config) => config.obedience ?? "steady",
    write: (config, text) => {
      const level = OBEDIENCE.find(([value]) => value === text);
      if (!level) return null;
      const { obedience: _, ...rest } = config;
      return (level[2] === STEADY ? rest : { ...rest, obedience: level[0] }) as C;
    },
  };
}

/** How far ahead a searching chooser looks (`SearchConfig.horizon`), s, `HORIZON` written as none. */
function horizonField<C extends SearchConfig>(): PartField<C> { return number<C, "horizon">("horizon", "Horizon", 1, 60, 1, "s", HORIZON); }

/** How long the focus keeps moving in the states a search reads (`SearchConfig.carry`), s: standing where it is, none, written as none. */
function carryField<C extends SearchConfig>(): PartField<C> { return number<C, "carry">("carry", "Foe keeps moving", 0, 2, .1, "s", 0); }

/** What is wrong with what a searching chooser is given (`SearchConfig`), each a sentence. */
const searchFaults = (config: SearchConfig): readonly string[] => [
  ...config.horizon === undefined || Number.isFinite(config.horizon) && config.horizon > 0 ? [] : ["horizon: a finite time, more than none"],
  ...config.carry === undefined || Number.isFinite(config.carry) && config.carry >= 0 ? [] : ["carry: a finite time, not negative"],
  ...config.margin === undefined || Number.isFinite(config.margin) && config.margin >= 0 ? [] : ["margin: a finite worth, not negative"],
  ...config.obedience === undefined || OBEDIENCE.some(([value]) => value === config.obedience) ? [] : [`obedience: one of ${OBEDIENCE.map(([value]) => value).join(", ")}`]];

/** A searching chooser's slots: the objective it prices a path by, the few terms (`FEW_TERMS_PART`) where empty. */
const OBJECTIVE_SLOTS = Object.freeze([slotOne("objective", "Objective", "objective", true)]);
const objectiveSupplied = (config: PartConfig): readonly Supplied[] => whenEmpty(OBJECTIVE_SLOTS, config, { objective: FEW_TERMS_PART.defaults });

/** A searching chooser's obedience, as `config` names it, and its objective, made by `parts`. */
function pricing(config: SearchConfig, parts: PartLookup): { readonly obedience: Obedience; readonly objective: Objective } {
  const given = config.objective ?? FEW_TERMS_PART.defaults;
  return { obedience: OBEDIENCE.find(([value]) => value === config.obedience)?.[2] ?? STEADY, objective: parts.of("objective", given).make(given) as Objective };
}

/**
 * **Valued**: each option worth its lines in life, searched to its depth over its horizon (`searching`), each path
 * priced by its objective (`Objective.worth`), its orders at its obedience; a running option with
 * targets keeps the one it runs at `KEEP` s.
 */
export const VALUED_CHOOSER = deepFreeze<OptionChooserPart<ValuedConfig>>({
  role: "chooser", model: PROFILE_MODEL, label: "By worth", fields: [obedienceField<ValuedConfig>(), horizonField<ValuedConfig>(), carryField<ValuedConfig>()], slots: OBJECTIVE_SLOTS, supplies: objectiveSupplied,
  defaults: { kind: "valued", depth: 2 }, keys: { kind: true, depth: true, horizon: true, carry: true, obedience: true, margin: true, objective: true }, fits: anyBody,
  faults: (config: ValuedConfig) => [...depthFaults(config.depth), ...searchFaults(config)],
  make: ({ config, options, seed, parts, body }) => {
    const { obedience, objective } = pricing(config, parts), horizon = config.horizon ?? HORIZON;
    const searched = { options, objective, obedience, horizon, carry: config.carry ?? 0, body, depth: config.depth };
    return chooser({ options, appraise: searching((now) => search(now, searched)), deciding: { rethink: RETHINK, keep: KEEP },
      chance: { margin: config.margin ?? 0, seed }, objective, holding: FOE_HOLDING, own: {} });
  },
});

/** How many runs the tree chooser makes a decision unless its config says (`TreeConfig.runs`). */
const RUNS = 50;

/**
 * How far the tree chooser looks beyond an Option's worth unless its config says
 * (`TreeConfig.exploration`), in spreads of its siblings' worths.
 */
const EXPLORATION = 1;

/**
 * **The tree chooser's config**: its runs a search (`RUNS` unless given), how far it explores
 * (`EXPLORATION` unless given), how its leaves read an Option run again (`Leaf`, the tail unless
 * given), whether it keeps its work (`keeps`, s: each Option's worth at its last search's root,
 * as evidence of as many runs as it stood on, fading by half each so long; none kept unless given),
 * how much a state is worth its best line against the mean of its lines (`best`, its best alone
 * unless given), what guides its runs below the root (`prior`, `PRIORS`, none unless given), what
 * the prior's bound makes of an Option untried there (`untried`, `UNTRIED`, its state's leaf unless
 * given), how many of the foe's replies it prices each line against (`replies`, `repliedSearch`;
 * none unless given) and how (`against`, `AGAINST`; its worst unless given), and what every
 * search is given (`SearchConfig`).
 */
interface TreeConfig extends SearchConfig { readonly kind: "tree"; readonly runs?: number; readonly exploration?: number; readonly leaf?: LeafName; readonly keeps?: number; readonly best?: number; readonly prior?: PriorName; readonly untried?: UntriedName; readonly counts?: CountsName; readonly leafWeight?: number; readonly replies?: number; readonly against?: AgainstName }

/** The tree's runs a search (`TreeConfig.runs`), `RUNS` written as none. */
const RUNS_FIELD = number<TreeConfig, "runs">("runs", "Runs", 1, 1000, 1, "", RUNS);

/** How far the tree looks beyond an Option's worth (`TreeConfig.exploration`), `EXPLORATION` written as none. */
const EXPLORATION_FIELD = number<TreeConfig, "exploration">("exploration", "Exploration", 0, 10, .1, "", EXPLORATION);

/** How much a state in the tree is worth its best line against the mean of its lines (`TreeConfig.best`, `backedUp`), its best alone written as none. */
const BEST_FIELD = number<TreeConfig, "best">("best", "Best line's weight", 0, 1, .1, "", 1);

/** How many runs a state's leaf weighs in the mean of its lines (`backedUp`), one written as none. */
const LEAF_WEIGHT_FIELD = number<TreeConfig, "leafWeight">("leafWeight", "Leaf's weight (runs)", .5, 100, .5, "", 1);

/** The tree's warm start (`TreeConfig.keeps`), the seconds its kept worths fade by half in: none kept written as none (0). */
const KEEPS_FIELD = number<TreeConfig, "keeps">("keeps", "Warm start (half-life)", 0, 5, .1, "s", 0);

/** Whether `name` names a kind of leaf (`LEAVES`). */
const isLeaf = (name: unknown): name is LeafName => typeof name === "string" && Object.hasOwn(LEAVES, name);

/** Whether `name` names a kind of prior (`PRIORS`). */
const isPrior = (name: unknown): name is PriorName => typeof name === "string" && Object.hasOwn(PRIORS, name);

/** Whether `name` names how a line is worth against the foe's replies (`AGAINST`). */
const isAgainst = (name: unknown): name is AgainstName => typeof name === "string" && Object.hasOwn(AGAINST, name);

/** Whether `name` names what a prior's bound makes of an untried Option (`UNTRIED`). */
const isUntried = (name: unknown): name is UntriedName => typeof name === "string" && Object.hasOwn(UNTRIED, name);

/** Whether `name` names which of a line's runs its state's mean counts (`COUNTS`). */
const isCounts = (name: unknown): name is CountsName => typeof name === "string" && Object.hasOwn(COUNTS, name);

/** A choice of the tree's among `kinds` (`LEAVES`, `PRIORS`, `UNTRIED`) at `key`: `none` written as none, so a config on it equals the preset. */
function kindField(key: "leaf" | "prior" | "untried" | "counts" | "against", label: string, kinds: Readonly<Record<string, { readonly label: string }>>, none: string): PartField<TreeConfig> {
  return {
    kind: "choice", key, label, options: () => Object.entries(kinds).map(([name, kind]) => [name, kind.label] as const),
    read: (config) => config[key] ?? none,
    write: (config, text) => {
      if (!Object.hasOwn(kinds, text)) return null;
      const { [key]: _, ...rest } = config;
      return (text === none ? rest : { ...rest, [key]: text }) as TreeConfig;
    },
  };
}

/** The tree's kind of leaf (`LEAVES`), the tail written as none; shown where there is more than one. */
const LEAF_FIELD = kindField("leaf", "Leaf", LEAVES, "tail");

/** The tree's kind of prior (`PRIORS`), none written as none. */
const PRIOR_FIELD = kindField("prior", "Prior", PRIORS, "none");

/** What the prior's bound makes of an untried Option (`UNTRIED`), its state's leaf written as none. */
const UNTRIED_FIELD = kindField("untried", "Prior's untried", UNTRIED, "floor");

/** Which of a line's runs its state's mean counts (`COUNTS`), every one written as none. */
const COUNTS_FIELD = kindField("counts", "Runs the mean counts", COUNTS, "every");

/** How many of the foe's replies the tree prices each line against (`TreeConfig.replies`), none written as none. */
const REPLIES_FIELD = number<TreeConfig, "replies">("replies", "Foe's replies", 0, DIRECTIONS.length, 1, "", 0);

/** How a line is worth against the foe's replies (`AGAINST`), its worst written as none. */
const AGAINST_FIELD = kindField("against", "Against its replies", AGAINST, "worst");

/**
 * **By tree**: each option worth the mean of its runs in a Monte Carlo tree search over its
 * horizon (`treeSearch`), each path priced by its objective (`Objective.worth`), its orders at its
 * obedience; its draws from one stream begun at its seed, kept in its state; a running option with
 * targets keeps the one it runs at `KEEP` s.
 */
export const TREE_CHOOSER = deepFreeze<OptionChooserPart<TreeConfig>>({
  role: "chooser", model: PROFILE_MODEL, label: "By tree", fields: [obedienceField<TreeConfig>(), horizonField<TreeConfig>(), carryField<TreeConfig>(), ...Object.keys(LEAVES).length > 1 ? [LEAF_FIELD] : [], PRIOR_FIELD, UNTRIED_FIELD, COUNTS_FIELD, REPLIES_FIELD, AGAINST_FIELD, RUNS_FIELD, EXPLORATION_FIELD, BEST_FIELD, LEAF_WEIGHT_FIELD, KEEPS_FIELD], slots: OBJECTIVE_SLOTS, supplies: objectiveSupplied,
  defaults: { kind: "tree" }, reads: (config) => [...LEAVES[config.leaf ?? "tail"].reads, ...PRIORS[config.prior ?? "none"].reads], keys: { kind: true, runs: true, exploration: true, leaf: true, prior: true, untried: true, counts: true, leafWeight: true, replies: true, against: true, keeps: true, best: true, horizon: true, carry: true, obedience: true, margin: true, objective: true }, fits: anyBody,
  faults: (config: TreeConfig) => [...searchFaults(config),
    ...config.runs === undefined || Number.isSafeInteger(config.runs) && config.runs > 0 ? [] : ["runs: a whole number, more than none"],
    ...config.exploration === undefined || Number.isFinite(config.exploration) && config.exploration >= 0 ? [] : ["exploration: a finite number, not negative"],
    ...config.leaf === undefined || isLeaf(config.leaf) ? [] : [`leaf: one of ${Object.keys(LEAVES).join(", ")}`],
    ...config.prior === undefined || isPrior(config.prior) ? [] : [`prior: one of ${Object.keys(PRIORS).join(", ")}`],
    ...config.untried === undefined || isUntried(config.untried) ? [] : [`untried: one of ${Object.keys(UNTRIED).join(", ")}`],
    ...config.counts === undefined || isCounts(config.counts) ? [] : [`counts: one of ${Object.keys(COUNTS).join(", ")}`],
    ...config.replies === undefined || Number.isSafeInteger(config.replies) && config.replies >= 0 && config.replies <= DIRECTIONS.length ? [] : [`replies: a whole number from 0 to ${DIRECTIONS.length}`],
    ...config.against === undefined || isAgainst(config.against) ? [] : [`against: one of ${Object.keys(AGAINST).join(", ")}`],
    ...config.keeps === undefined || Number.isFinite(config.keeps) && config.keeps > 0 ? [] : ["keeps: a finite time, more than none"],
    ...config.best === undefined || Number.isFinite(config.best) && config.best >= 0 && config.best <= 1 ? [] : ["best: a number from 0 to 1"],
    ...config.leafWeight === undefined || Number.isFinite(config.leafWeight) && config.leafWeight > 0 ? [] : ["leafWeight: a number above 0"]],
  make: ({ config, options, seed, parts, body }) => {
    const { obedience, objective } = pricing(config, parts), horizon = config.horizon ?? HORIZON, runs = config.runs ?? RUNS, exploration = config.exploration ?? EXPLORATION;
    const stream = randomStream(seed), warm = config.keeps === undefined ? null : warmStart(options, config.keeps);
    const searched = { options, objective, obedience, horizon, carry: config.carry ?? 0, body, runs, exploration, best: config.best ?? 1, stream, leaf: LEAVES[config.leaf ?? "tail"], prior: PRIORS[config.prior ?? "none"], untried: config.untried ?? "floor", skipped: COUNTS[config.counts ?? "every"].skipped, leafWeight: config.leafWeight ?? 1, replies: config.replies ?? 0, against: config.against ?? "worst", start: warm?.start ?? COLD };
    return chooser({ options, appraise: searching((now) => pricedLines(repliedSearch(now, searched))), deciding: { rethink: RETHINK, keep: KEEP },
      chance: { margin: config.margin ?? 0, seed }, objective, holding: FOE_HOLDING, own: { tree: stream.state, ...(warm ? { warm: warm.state } : {}) } });
  },
});

/** **The ranked chooser's config**: its kind alone. */
interface RankedConfig { readonly kind: "ranked" }

/**
 * **Ranked**, the drills' chooser: each option worth its place in its mind's options, the first the
 * most, at its first target. Firm orders are carried out first (`Choice.bound`); else the first
 * option on offer runs, then the first of the rest whose claims are still free. Nothing is priced,
 * searched or drawn, so a drill drives its skills by a fixed order, fast and the same each time;
 * which option a fight should choose is the valued and tree choosers' question. Not offered.
 */
export const RANKED_CHOOSER = deepFreeze<OptionChooserPart<RankedConfig>>({
  role: "chooser", model: PROFILE_MODEL, label: "By rank", offered: false, fields: [], slots: [],
  defaults: { kind: "ranked" }, keys: { kind: true }, fits: anyBody, faults: () => [],
  make: ({ options, seed }) =>
    chooser({ options, appraise: (option, i) => ({ name: option.name, kind: option.kind, worth: options.length - i, terms: null, moves: null, letGo: 0 }),
      deciding: { rethink: RETHINK, keep: 0 }, chance: { margin: 0, seed }, objective: null, holding: null, own: {} }),
});

declare module "./parts.ts" {
  interface ChooserConfigs {
    readonly valued: ValuedConfig;
    readonly tree: TreeConfig;
    readonly ranked: RankedConfig;
  }
}
