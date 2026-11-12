import { PROFILE_MODEL } from "./profile-contract.ts";
import { deepFreeze } from "../../core/state.ts";
import type { PartField } from "../../parts/fields.ts";
import type { ConfigFor, PartLookup } from "../../parts/lookup.ts";
import type { ChooserPart } from "./parts.ts";
import { anyBody, slotOne, type PartConfig, type Supplied } from "../../parts/parts.ts";
import { whenEmpty } from "../../parts/tree.ts";
import type { OfferTerms } from "../engagement.ts";
import { onOffer, selectSet, type Appraise, type Chance, type Cue, type Deciding, type Holding, type Selection } from "../choice.ts";
import { placed, placing, type Option, type Situation } from "./option.ts";
import { FEW_TERMS_PART, type Objective, type Path } from "./objective.ts";
import { cachedPressure, threatened, type Pressure } from "./percepts.ts";
import { ARRIVED } from "../../skills/framework/movement.ts";
import { exp, log } from "../../core/math/real.ts";
import { randomStream } from "../../core/math/random.ts";
import { DECIDING, OBEDIENCE, STEADY, type Leaves, type Obedience, type ObedienceLevel, type Terms } from "./value.ts";


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
 * `holding` says where it is given; its memory the selection's, what it watches, the memory of the `objective`
 * it prices by, where that keeps one (`Objective.state`), and the chooser's `own`.
 */
const chooser = (options: readonly Option[], appraise: Appraise<Situation, OfferTerms, Option>, deciding: Deciding, chance?: Chance, objective: Objective | null = null,
  holding: Holding<Situation> | null = null, own: Readonly<Record<string, object>> = {}): Chooser => {
  const cue = watching();
  return selectSet<Situation, OfferTerms, Option>(options, appraise, deciding, cue, chance, { cue: cue.state, ...(objective?.state ? { objective: objective.state } : {}), ...own }, holding);
};

/** **A kind of Option Mind's chooser** (`ChooserPart`): over its options (`Option`), the chooser it makes a `Chooser`. */
export type OptionChooserPart<C extends PartConfig = PartConfig> = ChooserPart<C, Option, Chooser>;

/**
 * The chooser `config` names, as `parts` finds it, over `options`, its chances drawn from `seed`:
 * a part of the role makes a chooser over the options it is given (`ChooserPart`), which Option Mind's are.
 */
export const chooserOf = (parts: PartLookup, config: PartConfig, options: readonly Option[], seed: number, phase: number): Chooser =>
  parts.of("chooser", config).make(config, options, seed, parts, phase) as Chooser;

/** How many options deep the valued chooser searches: the one it takes, or that and the best from where it leaves the body (`searching`). */
const VALUED_DEPTHS: readonly number[] = Object.freeze([1, 2]);

/**
 * How far ahead the valued chooser looks unless its config says (`ValuedConfig.horizon`), s: set
 * so that from every posture the body lies in, a way up's standing falls within it.
 */
const HORIZON = 20;

/** A depth other than those a chooser looks (`depths`), as a fault. */
const depthFaults = (depths: readonly number[]) => (config: { readonly depth: number }): readonly string[] =>
  depths.includes(config.depth) ? [] : [`depth: ${depths.join(" or ")}`];

/** An Option and target (0 where it has none), with its slot in each situation's model row, and what its model is asked there (`Option.model`): the same each time, so made once. */
interface Pair { readonly option: Option; readonly target: number; readonly slot: number; readonly ask: Readonly<{ target: number; until?: number }> }

/** **A line's price at a decision**: its worth, life, and the model of the Option it begins with there. */
interface Line { readonly worth: number; readonly terms: Terms }

/**
 * **What a leaf weighs** (`search`'s `leaf`): `whole`, where a line's last Option ends, every Option
 * held or run again and a walk to a site; `arrived`, where that walk ends, all but another walk;
 * `held`, where a run again leaves the body, the open Options only.
 */
type Reach = "whole" | "arrived" | "held";

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
 * **The states a search at `root` reads** (`Situation`), over `options` priced by `objective` at
 * `obedience` over the `horizon`, s, made once a decision. A model is asked at most once a state for
 * each Option and target, and only where something reads it (`modelAt`, `pairsAt`: at `root` an Option
 * with no targets only where its entry admits, `onOffer`; elsewhere its model says whether it is on
 * offer), and a state an Option leaves
 * the body in made once from each state for each place it names (`child`, `placed`). A path is
 * priced whole by the objective (`price`, `Path`). A line (`line`) runs its Option (`Option.model`),
 * then at each way it ends (`Outcome`) the best single Option from there where it goes deeper
 * (`best`), and ends at a leaf (`leaf`: the best Option held or run again until the horizon, where
 * the body is or at a site, `Option.sites`); a line is cut at the horizon, so every worth is
 * absolute over the same seconds and lines compare alike.
 */
function space(root: Situation, options: readonly Option[], objective: Objective, obedience: Obedience, horizon: number) {
  const place = placing();
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
  /** What a path is worth, priced whole (`Objective.worth`). */
  const price = (dealt: number, taken: number, orders: number, seconds: number, end: Situation): number => {
    path.dealt = dealt; path.taken = taken; path.orders = orders; path.seconds = seconds; path.end = end;
    const worth = objective.worth(path as Path, root, obedience);
    if (!Number.isFinite(worth)) throw new Error(`a path is worth ${worth}`);
    return worth;
  };
  /** The model a line runs `pair` by from `at`, `seconds` s into the horizon: an open one's to the horizon. */
  const termsOf = (pair: Pair, at: Situation, seconds: number): Terms =>
    (pair.option.open ? pair.option.model(at, { target: pair.target, until: Math.max(0, horizon - seconds) }) : modelAt(pair, at))!;
  /**
   * **A step of a line** (`Step`): `pair` run from `at`, `seconds` s into the horizon,
   * after a path that brought `dealt`, `taken` and `orders`, written into `out`.
   */
  const stepInto = (out: Work, pair: Pair, at: Situation, dealt: number, taken: number, orders: number, seconds: number): Step => {
    const option = pair.option, terms = termsOf(pair, at, seconds), share = terms.duration > 0 ? Math.max(0, Math.min(1, (horizon - seconds) / terms.duration)) : 1;
    let chances = 0;
    for (const outcome of terms.outcomes) chances += outcome.chance;
    if (Math.abs(chances - 1) > 1e-9) throw new Error(`${option.name}'s outcomes' chances sum to ${chances}`);
    const after = seconds + share * terms.duration;
    out.terms = terms; out.dealt = dealt + share * terms.dealt; out.taken = taken + share * terms.taken; out.orders = orders + share * terms.orders; out.after = after;
    out.cut = option.open === true || after >= horizon;
    return out;
  };
  /** A step of a line, made anew: what a tree's edge keeps. */
  const stepOf = (pair: Pair, at: Situation, dealt: number, taken: number, orders: number, seconds: number): Step => stepInto(blankStep(), pair, at, dealt, taken, orders, seconds);
  // A line's step is read until the line's worth is found, through its deeper lines: a frame for each depth of the line under way.
  const frames: Work[] = [];
  let depth = 0;
  /** What a step cut (`Step.cut`) from `at` is worth: each way it ends priced where it leaves the body, by its chance. */
  const cutWorth = (at: Situation, step: Step): number => {
    let worth = 0;
    for (const outcome of step.terms.outcomes)
      worth += outcome.chance * price(step.dealt, step.taken, step.orders, step.after, unchanged(outcome.leaves) ? at : child(at, outcome.leaves, step.terms.duration));
    return worth;
  };
  /**
   * The worth of the line through `pair` from `at`, `seconds` s into the horizon,
   * after what the path brought before it; then, where it ends, the best line `left` - 1 Options
   * deep (`best`) where `left` is more than 1, else the leaf (`leaf`: whole where `left` is 1,
   * arrived where 0).
   */
  const line = (pair: Pair, at: Situation, left: number, dealt: number, taken: number, orders: number, seconds: number): number => {
    const step = stepInto(frames[depth] ??= blankStep(), pair, at, dealt, taken, orders, seconds), terms = step.terms;
    if (step.cut) return cutWorth(at, step);
    depth++;
    let worth = 0;
    for (const outcome of terms.outcomes) {
      const end = child(at, outcome.leaves, terms.duration);
      worth += outcome.chance * (left > 1 ? best(end, left - 1, step.dealt, step.taken, step.orders, step.after)
        : leaf(end, left === 1 ? "whole" : "arrived", step.dealt, step.taken, step.orders, step.after));
    }
    depth--;
    return worth;
  };
  /** The best line from `at` of any Option on offer there, `left` deep; the path as it is where none is. */
  const best = (at: Situation, left: number, dealt: number, taken: number, orders: number, seconds: number): number => {
    let top = -Infinity;
    for (const pair of pairsAt(at)) top = Math.max(top, line(pair, at, left, dealt, taken, orders, seconds));
    return top > -Infinity ? top : price(dealt, taken, orders, seconds, at);
  };
  /**
   * **Where a line ends**, at `at`, `seconds` s into the horizon, as `reach` says: the best, to the
   * horizon, of each Option on offer there that leaves the body where it began, run again and again
   * (an open Option, `Option.open`, held, the case of none; unless `held`, any other, `again`), and,
   * where `whole`, of each Option reached at its sites (`Option.sites`: a walk to one, then the best
   * there, `arrived`); the path as it is where none is.
   */
  const leaf = (at: Situation, reach: Reach, dealt: number, taken: number, orders: number, seconds: number): number => {
    let top = -Infinity;
    // A leaf where a walk has arrived never walks on to a site, and a held leaf reads only open Options.
    // Such a leaf models only the pairs it reads. Most leaves are where a walk arrives, so modelling every
    // walk from each of them would be most of a search's cost.
    const pairs = reach === "whole" ? pairsAt(at) : readsAt(at, reach);
    for (const pair of pairs) {
      const { option, target } = pair;
      if (option.open) top = Math.max(top, line(pair, at, 1, dealt, taken, orders, seconds));
      else if (reach === "held") continue;
      else if (option.targets && sites.has(option.targets[target]!)) { if (reach === "whole") top = Math.max(top, line(pair, at, 0, dealt, taken, orders, seconds)); }
      else top = Math.max(top, again(pair, at, dealt, taken, orders, seconds));
    }
    return top > -Infinity ? top : price(dealt, taken, orders, seconds, at);
  };
  /**
   * **`pair` run again and again from `at` to the horizon**, where a try of it leaves
   * the body where it began (`stays`, its staying outcome, by the chance it stays): the life each try
   * deals and takes, the tries as many as fit in the time left, and the orders it carries out once
   * (`Terms.orders`: an order carried out is carried out, and a try that leaves the state as it found
   * it carries out nothing more of it); each the chance of leaving compounding, the body leaving after
   * as many tries as it is expected to, then held where it went (`leaf`, an open Option). -Infinity
   * where no outcome stays, or a try takes no time.
   */
  const again = (pair: Pair, at: Situation, dealt: number, taken: number, orders: number, seconds: number): number => {
    const terms = modelAt(pair, at)!, duration = terms.duration;
    if (!(duration > 0) || seconds >= horizon) return -Infinity;
    let stay = 0, there: Situation | null = null;
    for (const outcome of terms.outcomes) {
      const end = child(at, outcome.leaves, duration);
      if (end.posture === at.posture && Math.abs(end.range - at.range) <= ARRIVED) { stay += outcome.chance; there = end; }
    }
    if (!there) return -Infinity;
    // Of `full` whole tries, the chance all stay (`through`), and the tries the body is expected to run where one leaves (`run`).
    const tries = (horizon - seconds) / duration, full = Math.floor(tries), through = full === 0 ? 1 : stay === 0 ? 0 : exp(full * log(stay)), left = 1 - through;
    const o = orders + Math.min(1, tries) * terms.orders;
    let worth = through * price(dealt + tries * terms.dealt, taken + tries * terms.taken, o, horizon, there);
    if (left > 0) {
      const run = (1 - (full + 1) * through + full * through * stay) / ((1 - stay) * left), d = dealt + run * terms.dealt, t = taken + run * terms.taken, after = seconds + run * duration;
      for (const outcome of terms.outcomes) {
        const end = child(at, outcome.leaves, duration);
        if (end === there || end.posture === at.posture && Math.abs(end.range - at.range) <= ARRIVED) continue;
        worth += left * outcome.chance / (1 - stay) * leaf(end, "held", d, t, o, after);
      }
    }
    return worth;
  };
  return { pairAt, modelAt, pairsAt, child, price, termsOf, stepOf, cutWorth, line, leaf };
}

/** **A step of a line** (`space`'s `stepOf`): its Option's model, and the path once it has run, what it brings counted by the share of its time within the horizon (`after`, s); an open Option, or one the horizon cuts, ends the path (`cut`). */
interface Step { readonly terms: Terms; readonly dealt: number; readonly taken: number; readonly orders: number; readonly after: number; readonly cut: boolean }
/** A step as it is written (`stepInto`). */
type Work = { -readonly [K in keyof Step]: Step[K] };
/** No model yet: what a step is made with before it is written. */
const UNWRITTEN = Object.freeze({ duration: 0, dealt: 0, taken: 0, orders: 0, outcomes: Object.freeze([]) }) as unknown as Terms;
const blankStep = (): Work => ({ terms: UNWRITTEN, dealt: 0, taken: 0, orders: 0, after: 0, cut: false });

/** What a search prices at a decision: each Option at each target its line from the state decided at (`Line`), null where it is not on offer. */
type Lines = (option: Option, target: number) => Line | null;

/** A completed tree's lookup captures only root prices, without its nodes or search workspace. */
function pricedLines(prices: readonly (Line & { readonly pair: Pair })[]): Lines {
  return (option, target) => {
    for (let i = 0; i < prices.length; i++) {
      const priced = prices[i]!;
      if (priced.pair.option === option && priced.pair.target === target) return { worth: priced.worth, terms: priced.terms };
    }
    return null;
  };
}

/** **The valued chooser's search at `root`**: each Option's line from there at each of its targets, `depth` Options deep (`space`'s `line`). */
function search(root: Situation, options: readonly Option[], objective: Objective, obedience: Obedience, depth: number, horizon: number): Lines {
  const at = space(root, options, objective, obedience, horizon), lines = new Map<Option, (Line | null)[]>();
  return (option, target) => {
    let byTarget = lines.get(option);
    if (!byTarget) lines.set(option, byTarget = []);
    let priced = byTarget[target];
    if (priced === undefined) {
      const pair = at.pairAt(option, target);
      byTarget[target] = priced = at.modelAt(pair, root) ? { worth: at.line(pair, root, depth, 0, 0, 0, 0), terms: at.termsOf(pair, root, 0) } : null;
    }
    return priced;
  };
}

/**
 * **A state in the tree** (`treeSearch`): the state, the path to it (life dealt and taken, orders,
 * s), the runs through it, an edge for each Option on offer there (made when first run through),
 * what its leaf is worth (`floor`), and what it is worth (`worth`): the more of its floor and its
 * best Option run.
 */
interface TreeNode { readonly at: Situation; readonly dealt: number; readonly taken: number; readonly orders: number; readonly seconds: number; readonly floor: number;
  runs: number; worth: number; edges: TreeEdge[] | null }

/**
 * **An Option in the tree** (`treeSearch`), at its target from its state: its step (`Step`), the
 * state each way it ends leads to (made when first drawn), the runs through it, and what it is
 * worth: cut, its ways of ending priced where they leave the body; else the worths of the states
 * drawn by their chances among those drawn.
 */
interface TreeEdge { readonly pair: Pair; readonly step: Step; readonly ends: (TreeNode | null)[]; runs: number; worth: number }
/** A cut edge's ways of ending: none is ever drawn. */
const NO_ENDS = Object.freeze([]) as unknown as (TreeNode | null)[];

/**
 * **The tree chooser's search at `root`**: `runs` runs of a Monte Carlo tree search over the
 * states its Options' models lead to (`space`), `stream` drawing the ways they end. A run goes down
 * from `root`, at each state taking the first Option on offer there that no run has taken, else the
 * one of best bound (its worth and `exploration` times the spread of its siblings' worths, by how
 * few of the state's runs it has had), the fewer runs on a tie; and at each Option one way it ends,
 * drawn by its chance. It ends at the first state it makes, worth its leaf (`leaf`, whole), or where
 * its Option is cut (`cutWorth`); then each Option and state it went through is worth again what
 * lies below it (`TreeEdge`, `TreeNode`): the models are the mind's own, so a state is worth its best
 * line found, never less than its leaf. Every Option on offer at `root` is run at least once.
 */
function treeSearch(root: Situation, options: readonly Option[], objective: Objective, obedience: Obedience, horizon: number, runs: number,
  exploration: number, stream: { next(): number }): Lines {
  const predictions = root.predictions;
  let pressure: Pressure | undefined;
  root = Object.create(root, { predictions: { value: Object.create(predictions, {
    pressure: { get: () => pressure ??= cachedPressure(predictions.pressure) },
  }) } }) as Situation;
  const at = space(root, options, objective, obedience, horizon);
  const nodeAt = (state: Situation, dealt: number, taken: number, orders: number, seconds: number): TreeNode => {
    const floor = at.leaf(state, "whole", dealt, taken, orders, seconds);
    return { at: state, dealt, taken, orders, seconds, floor, runs: 0, worth: floor, edges: null };
  };
  const top = nodeAt(root, 0, 0, 0, 0);
  // A cut edge draws no way of ending (`run`): it shares one empty store.
  const edgesOf = (node: TreeNode): TreeEdge[] => {
    if (node.edges) return node.edges;
    const pairs = at.pairsAt(node.at), edges = new Array<TreeEdge>(pairs.length);
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i]!, step = at.stepOf(pair, node.at, node.dealt, node.taken, node.orders, node.seconds);
      edges[i] = { pair, runs: 0, worth: 0, ends: step.cut ? NO_ENDS : [], step };
    }
    return node.edges = edges;
  };
  /** The edge a run takes from `node`. */
  const pick = (node: TreeNode, edges: readonly TreeEdge[]): TreeEdge => {
    let low = Infinity, high = -Infinity;
    for (const edge of edges) {
      if (edge.runs === 0) return edge;
      low = Math.min(low, edge.worth); high = Math.max(high, edge.worth);
    }
    const scale = exploration * (high - low), total = log(node.runs);
    let chosen = edges[0]!, bound = -Infinity;
    for (const edge of edges) {
      const value = edge.worth + scale * Math.sqrt(total / edge.runs);
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
  };
  /** What `node` is worth (`TreeNode`): the more of its floor and its best edge run. */
  const revalue = (node: TreeNode): void => {
    let worth = node.floor;
    const edges = node.edges;
    if (edges) for (let i = 0; i < edges.length; i++) if (edges[i]!.runs > 0) worth = Math.max(worth, edges[i]!.worth);
    node.worth = worth;
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
      edge.ends[k] = nodeAt(at.child(node.at, step.terms.outcomes[k]!.leaves, step.terms.duration), step.dealt, step.taken, step.orders, step.after);
      break;
    }
    for (let i = taken.length - 1; i >= 0; i--) { const edge = taken[i]!; edge.runs++; reprice(edge); revalue(nodes[i]!); }
    for (const visited of nodes) visited.runs++;
  };
  for (let k = 0; k < Math.max(runs, edgesOf(top).length); k++) run();
  const edges = top.edges!, prices = new Array<Line & { readonly pair: Pair }>(edges.length);
  for (let i = 0; i < edges.length; i++) { const edge = edges[i]!; prices[i] = { pair: edge.pair, worth: edge.worth, terms: edge.step.terms }; }
  return pricedLines(prices);
}

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
    return { name: option.name, worth, terms: { duration: terms.duration, dealt: terms.dealt, taken: terms.taken, orders: terms.orders, exit: { range, down } },
      moves: worth - (terms.dealt - terms.taken), letGo };
  };
}

/**
 * **What a chooser that prices by a search is given**: how far ahead it looks, s (`horizon`;
 * `HORIZON` unless given), what a metre walked as ordered is worth, life (`obedience`, a level of
 * `OBEDIENCE`; steady, `STEADY`, unless given), the margin of worth, life, within which it chooses
 * by chance (`Chance`), none unless given, and the objective it prices options by (`objective`, a
 * part of role `objective`; the few terms, `FEW_TERMS`, unless given).
 */
interface SearchConfig { readonly horizon?: number; readonly obedience?: ObedienceLevel; readonly margin?: number; readonly objective?: ConfigFor<"objective"> | null }

/** **The valued chooser's config**: its depth (`VALUED_DEPTHS`), and what every search is given (`SearchConfig`). */
interface ValuedConfig extends SearchConfig { readonly kind: "valued"; readonly depth: number }

/**
 * A searching chooser's obedience (`OBEDIENCE`): a choice written as its level's value, the steady
 * level written as none, so a config at steady equals the preset.
 */
function obedienceField<C extends SearchConfig>(): PartField<C> {
  return {
    kind: "choice", key: "obedience", label: "Obedience", options: OBEDIENCE.map(([value, name]) => [value, name] as const),
    read: (config) => config.obedience ?? "steady",
    write: (config, text) => {
      const level = OBEDIENCE.find(([value]) => value === text);
      if (!level) return null;
      const { obedience: _, ...rest } = config;
      return (level[2] === STEADY ? rest : { ...rest, obedience: level[0] }) as C;
    },
  };
}

/** What is wrong with what a searching chooser is given (`SearchConfig`), each a sentence. */
const searchFaults = (config: SearchConfig): readonly string[] => [
  ...config.horizon === undefined || Number.isFinite(config.horizon) && config.horizon > 0 ? [] : ["horizon: a finite time, more than none"],
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
  role: "chooser", model: PROFILE_MODEL, label: "By worth", stage: "game", fields: [obedienceField<ValuedConfig>()], slots: OBJECTIVE_SLOTS, supplies: objectiveSupplied,
  defaults: { kind: "valued", depth: 2 }, keys: { kind: true, depth: true, horizon: true, obedience: true, margin: true, objective: true }, fits: anyBody,
  faults: (config: ValuedConfig) => [...depthFaults(VALUED_DEPTHS)(config), ...searchFaults(config)],
  make: (config: ValuedConfig, options: readonly Option[], seed: number, parts: PartLookup, phase = 0) => {
    const { obedience, objective } = pricing(config, parts), horizon = config.horizon ?? HORIZON;
    return chooser(options, searching((now) => search(now, options, objective, obedience, config.depth, horizon)), { ...DECIDING, phase, keep: KEEP },
      { margin: config.margin ?? 0, seed }, objective, FOE_HOLDING);
  },
});

/**
 * How many runs the tree chooser makes a decision unless its config says (`TreeConfig.runs`): set
 * for what it finds; at 20 or fewer it stands the body from fewer falls.
 */
const RUNS = 100;

/**
 * How far the tree chooser looks beyond an Option's worth unless its config says
 * (`TreeConfig.exploration`), in spreads of its siblings' worths.
 */
const EXPLORATION = 1;

/** **The tree chooser's config**: its runs a decision (`RUNS` unless given), how far it explores (`EXPLORATION` unless given), and what every search is given (`SearchConfig`). */
interface TreeConfig extends SearchConfig { readonly kind: "tree"; readonly runs?: number; readonly exploration?: number }

/**
 * **By tree**: each option worth the mean of its runs in a Monte Carlo tree search over its
 * horizon (`treeSearch`), each path priced by its objective (`Objective.worth`), its orders at its
 * obedience; its draws from one stream begun at its seed, kept in its state; a running option with
 * targets keeps the one it runs at `KEEP` s.
 */
export const TREE_CHOOSER = deepFreeze<OptionChooserPart<TreeConfig>>({
  role: "chooser", model: PROFILE_MODEL, label: "By tree", stage: "game", fields: [obedienceField<TreeConfig>()], slots: OBJECTIVE_SLOTS, supplies: objectiveSupplied,
  defaults: { kind: "tree" }, keys: { kind: true, runs: true, exploration: true, horizon: true, obedience: true, margin: true, objective: true }, fits: anyBody,
  faults: (config: TreeConfig) => [...searchFaults(config),
    ...config.runs === undefined || Number.isSafeInteger(config.runs) && config.runs > 0 ? [] : ["runs: a whole number, more than none"],
    ...config.exploration === undefined || Number.isFinite(config.exploration) && config.exploration >= 0 ? [] : ["exploration: a finite number, not negative"]],
  make: (config: TreeConfig, options: readonly Option[], seed: number, parts: PartLookup, phase = 0) => {
    const { obedience, objective } = pricing(config, parts), horizon = config.horizon ?? HORIZON, runs = config.runs ?? RUNS, exploration = config.exploration ?? EXPLORATION;
    const stream = randomStream(seed);
    return chooser(options, searching((now) => treeSearch(now, options, objective, obedience, horizon, runs, exploration, stream)), { ...DECIDING, phase, keep: KEEP },
      { margin: config.margin ?? 0, seed }, objective, FOE_HOLDING, { tree: stream.state });
  },
});

declare module "./parts.ts" {
  interface ChooserConfigs {
    readonly valued: ValuedConfig;
    readonly tree: TreeConfig;
  }
}
