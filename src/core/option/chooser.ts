import { deepFreeze } from "../state.ts";
import type { PartField } from "../parts/fields.ts";
import type { PartLookup } from "../parts/lookup.ts";
import type { ChooserPart } from "./parts.ts";
import { anyBody, slotOne, type PartConfig } from "../parts/parts.ts";
import type { OfferTerms } from "../mind/engagement.ts";
import { onOffer, selectSet, type Appraise, type Chance, type Cue, type Deciding, type Holding, type Selection } from "../mind/choice.ts";
import { placed, type Option, type Situation } from "./option.ts";
import { FEW_TERMS_PART, type Objective, type Path } from "./objective.ts";
import { threatened } from "./percepts.ts";
import { ARRIVED } from "../intent/movement.ts";
import { exp, log } from "../math/real.ts";
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
 * `holding` says where it is given; its memory the selection's, what it watches, and the memory of the `objective`
 * it prices by, where that keeps one (`Objective.state`).
 */
const chooser = (options: readonly Option[], appraise: Appraise<Situation, OfferTerms, Option>, deciding: Deciding, chance?: Chance, objective: Objective | null = null,
  holding: Holding<Situation> | null = null): Chooser => {
  const cue = watching();
  return selectSet<Situation, OfferTerms, Option>(options, appraise, deciding, cue, chance, { cue: cue.state, ...(objective?.state ? { objective: objective.state } : {}) }, holding);
};

/** **A kind of Option Mind's chooser** (`ChooserPart`): over its options (`Option`), the chooser it makes a `Chooser`. */
export type OptionChooserPart<C extends PartConfig = PartConfig> = ChooserPart<C, Option, Chooser>;

/**
 * The chooser `config` names, as `parts` finds it, over `options`, its chances drawn from `seed`:
 * a part of the role makes a chooser over the options it is given (`ChooserPart`), which Option Mind's are.
 */
export const chooserOf = (parts: PartLookup, config: PartConfig, options: readonly Option[], seed: number, phase: number): Chooser =>
  parts.of("chooser", config).make(config, options, seed, parts, phase) as Chooser;

/** How many options ahead the ranked chooser looks: the one it takes. */
const RANKED_DEPTH = 1;

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

/** An Option on offer at a state, at the target at `target` of its targets (0 for one with none). */
interface Pair { readonly option: Option; readonly target: number }

/** **A line's price at a decision**: its worth, life, and the model of the Option it begins with there. */
interface Line { readonly worth: number; readonly terms: Terms }

/** Whether `leaves` changes nothing (`AS_IS`). */
const unchanged = (leaves: Leaves): boolean => leaves.where === undefined && leaves.around === undefined && leaves.posture === undefined && leaves.velocity === undefined && leaves.grace === undefined;

/** What tells one state `leaves` leaves the body in after `seconds` s from another, from one state. */
const keyOf = (leaves: Leaves, seconds: number): string => {
  const where = leaves.where, velocity = leaves.velocity;
  return `${where?.x} ${where?.z} ${where?.face} ${leaves.around} ${leaves.posture} ${velocity?.x} ${velocity?.z} ${leaves.grace} ${seconds}`;
};

/**
 * **The valued chooser's search at the state `root`** (`Situation`), over `options` priced by
 * `objective` at `obedience`, `depth` Options deep, over the `horizon`, s: each Option's line from
 * `root` at each of its targets (`line`). A line runs its Option (`Option.model`), then at each way
 * it ends (`Outcome`) the best single Option from there where the search goes deeper (`best`), and
 * ends at a leaf (`leaf`: the best open Option, held where the body is or at its site, `Option.site`)
 * until the horizon; a line is cut at the horizon, so every worth is absolute over the same seconds
 * and depths compare alike. Each path is priced whole by the objective (`Path`) and weighed by its
 * chances. At `root` an Option with no targets is asked only where its entry admits (`onOffer`);
 * elsewhere its model says whether it is on offer. A model is asked once a state for each Option
 * and target, and a state an Option leaves the body in once from each state for each place it
 * names (`placed`).
 */
function search(root: Situation, options: readonly Option[], objective: Objective, obedience: Obedience, depth: number, horizon: number): (option: Option, target: number) => Line | null {
  const sites = new Set<string>();
  for (const option of options) if (option.open && option.site !== undefined) sites.add(option.site);
  const models = new Map<Situation, Map<Option, (Terms | null)[]>>(), offered = new Map<Situation, readonly Pair[]>(), children = new Map<Situation, Map<string, Situation>>();
  /** The model of `option` at `target` from `at`, asked once (an open one priced as an instant). */
  const modelAt = (option: Option, target: number, at: Situation): Terms | null => {
    let byOption = models.get(at);
    if (!byOption) models.set(at, byOption = new Map());
    let byTarget = byOption.get(option);
    if (!byTarget) byOption.set(option, byTarget = []);
    let terms = byTarget[target];
    if (terms === undefined) byTarget[target] = terms = option.model(at, { target });
    return terms;
  };
  /** The Options on offer at `at`, at each of their targets. */
  const pairsAt = (at: Situation): readonly Pair[] => {
    let pairs = offered.get(at);
    if (pairs) return pairs;
    const found: Pair[] = [];
    for (const option of options) {
      if (at === root && !option.targets && !onOffer(option, at)) continue;
      for (let target = 0; target < Math.max(1, option.targets?.length ?? 0); target++) if (modelAt(option, target, at)) found.push({ option, target });
    }
    offered.set(at, pairs = found);
    return pairs;
  };
  /** The state `leaves` leaves the body in from `at` after `seconds` s, made once. */
  const child = (at: Situation, leaves: Leaves, seconds: number): Situation => {
    let made = children.get(at);
    if (!made) children.set(at, made = new Map());
    const key = keyOf(leaves, seconds);
    let state = made.get(key);
    if (!state) made.set(key, state = placed(at, leaves, seconds));
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
  /** The model a line runs `option` by from `at`, `seconds` s into the horizon: an open one's to the horizon. */
  const termsOf = (option: Option, target: number, at: Situation, seconds: number): Terms =>
    (option.open ? option.model(at, { target, until: Math.max(0, horizon - seconds) }) : modelAt(option, target, at))!;
  /**
   * The worth of the line through `option` at `target` from `at`, `seconds` s into the horizon,
   * after what the path brought before it; then, where it ends, the best line `left` - 1 Options
   * deep (`best`) where `left` is more than 1, else the leaf (`leaf`: whole where
   * `left` is 1, held where it ends where 0). An open Option, or one the horizon cuts, ends the path:
   * what it brings is counted by the share of its time within the horizon.
   */
  const line = (option: Option, target: number, at: Situation, left: number, dealt: number, taken: number, orders: number, seconds: number): number => {
    const terms = termsOf(option, target, at, seconds), share = terms.duration > 0 ? Math.max(0, Math.min(1, (horizon - seconds) / terms.duration)) : 1;
    const d = dealt + share * terms.dealt, t = taken + share * terms.taken, o = orders + share * terms.orders, after = seconds + share * terms.duration;
    const cut = option.open === true || after >= horizon;
    let worth = 0, chances = 0;
    for (const outcome of terms.outcomes) {
      const leaves = outcome.leaves;
      worth += outcome.chance * (cut ? price(d, t, o, after, unchanged(leaves) ? at : child(at, leaves, terms.duration))
        : left > 1 ? best(child(at, leaves, terms.duration), left - 1, d, t, o, after) : leaf(child(at, leaves, terms.duration), left === 1, d, t, o, after));
      chances += outcome.chance;
    }
    if (Math.abs(chances - 1) > 1e-9) throw new Error(`${option.name}'s outcomes' chances sum to ${chances}`);
    return worth;
  };
  /** The best line from `at` of any Option on offer there, `left` deep; the path as it is where none is. */
  const best = (at: Situation, left: number, dealt: number, taken: number, orders: number, seconds: number): number => {
    let top = -Infinity;
    for (const { option, target } of pairsAt(at)) top = Math.max(top, line(option, target, at, left, dealt, taken, orders, seconds));
    return top > -Infinity ? top : price(dealt, taken, orders, seconds, at);
  };
  /**
   * **Where a line ends**, at `at`, `seconds` s into the horizon: the best, to the horizon, of each
   * Option on offer there that leaves the body where it began, run again and again (an open
   * Option, `Option.open`, held, the case of none; where `whole`, any other, `again`), and, where
   * `whole`, of each open Option reached at its site (`Option.site`: a walk to it, then the best
   * held where that ends); the path as it is where none is.
   */
  const leaf = (at: Situation, whole: boolean, dealt: number, taken: number, orders: number, seconds: number): number => {
    let top = -Infinity;
    for (const { option, target } of pairsAt(at)) {
      if (option.open) top = Math.max(top, line(option, target, at, 1, dealt, taken, orders, seconds));
      else if (!whole) continue;
      else if (option.targets && sites.has(option.targets[target]!)) top = Math.max(top, line(option, target, at, 0, dealt, taken, orders, seconds));
      else top = Math.max(top, again(option, target, at, dealt, taken, orders, seconds));
    }
    return top > -Infinity ? top : price(dealt, taken, orders, seconds, at);
  };
  /**
   * **`option` at `target` run again and again from `at` to the horizon**, where a try of it leaves
   * the body where it began (`stays`, its staying outcome, by the chance it stays): the life each try
   * deals and takes, the tries as many as fit in the time left, and the orders it carries out once
   * (`Terms.orders`: an order carried out is carried out, and a try that leaves the state as it found
   * it carries out nothing more of it); each the chance of leaving compounding, the body leaving after
   * as many tries as it is expected to, then held where it went (`leaf`, an open Option). -Infinity
   * where no outcome stays, or a try takes no time.
   */
  const again = (option: Option, target: number, at: Situation, dealt: number, taken: number, orders: number, seconds: number): number => {
    const terms = modelAt(option, target, at)!, duration = terms.duration;
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
        worth += left * outcome.chance / (1 - stay) * leaf(end, false, d, t, o, after);
      }
    }
    return worth;
  };
  const lines = new Map<Option, (Line | null)[]>();
  return (option, target) => {
    let byTarget = lines.get(option);
    if (!byTarget) lines.set(option, byTarget = []);
    let priced = byTarget[target];
    if (priced === undefined) {
      const terms = modelAt(option, target, root);
      byTarget[target] = priced = terms ? { worth: line(option, target, root, depth, 0, 0, 0, 0), terms: termsOf(option, target, root, 0) } : null;
    }
    return priced;
  };
}

/**
 * **The valued chooser's search**, at each state it decides at (`search`), made once a decision for
 * each state: a running choice's price, its line, its model's terms with what it is expected to
 * leave as a readout shows it (`OfferTerms`: the range and the chance of being down, by the
 * chances of the ways it ends), how much its line is worth beyond what its own model brings
 * (`moves`), and what letting it go costs (`letGo`: the life it loses while it comes back beyond
 * what holding as long costs, `threatened`, none below nothing).
 */
function searching(options: readonly Option[], objective: Objective, obedience: Obedience, depth: number, horizon: number): Appraise<Situation, OfferTerms, Option> {
  const searches = new Map<Situation, ReturnType<typeof search>>();
  let time = NaN;
  return (option, _i, now, target) => {
    if (now.time !== time) { searches.clear(); time = now.time; }
    let lines = searches.get(now);
    if (!lines) searches.set(now, lines = search(now, options, objective, obedience, depth, horizon));
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
 * **The valued chooser's config**: its depth (`VALUED_DEPTHS`), how far ahead it looks, s
 * (`horizon`; `HORIZON` unless given), what a metre walked as ordered is worth, life
 * (`obedience`, a level of `OBEDIENCE`; steady, `STEADY`, unless given), the margin of worth, life,
 * within which it chooses by chance (`Chance`), none unless given, and the objective it prices
 * options by (`objective`, a part of role `objective`; the few terms, `FEW_TERMS`, unless given).
 */
interface ValuedConfig { readonly kind: "valued"; readonly depth: number; readonly horizon?: number; readonly obedience?: ObedienceLevel; readonly margin?: number; readonly objective?: PartConfig | null }

/**
 * The valued chooser's obedience (`OBEDIENCE`): a choice written as its level's value, the steady
 * level written as none, so a config at steady equals the preset.
 */
const OBEDIENCE_FIELD: PartField<ValuedConfig> = {
  kind: "choice", key: "obedience", label: "Obedience", options: OBEDIENCE.map(([value, name]) => [value, name] as const),
  read: (config) => config.obedience ?? "steady",
  write: (config, text) => {
    const level = OBEDIENCE.find(([value]) => value === text);
    if (!level) return null;
    const { obedience: _, ...rest } = config;
    return level[2] === STEADY ? rest : { ...rest, obedience: level[0] };
  },
};

/**
 * **Valued**: each option worth its lines in life, searched to its depth over its horizon (`searching`), each path
 * priced by its objective (`Objective.worth`), its orders at its obedience; a running option with
 * targets keeps the one it runs at `KEEP` s.
 */
export const VALUED_CHOOSER: OptionChooserPart<ValuedConfig> = deepFreeze({
  role: "chooser", label: "By worth", stage: "game", fields: [OBEDIENCE_FIELD], slots: [slotOne("objective", "Objective", "objective", true, FEW_TERMS_PART.defaults)],
  defaults: { kind: "valued", depth: 2 }, keys: { kind: true, depth: true, horizon: true, obedience: true, margin: true, objective: true }, fits: anyBody,
  faults: (config: ValuedConfig) => [...depthFaults(VALUED_DEPTHS)(config),
    ...config.horizon === undefined || Number.isFinite(config.horizon) && config.horizon > 0 ? [] : ["horizon: a finite time, more than none"],
    ...config.margin === undefined || Number.isFinite(config.margin) && config.margin >= 0 ? [] : ["margin: a finite worth, not negative"],
    ...config.obedience === undefined || OBEDIENCE.some(([value]) => value === config.obedience) ? [] : [`obedience: one of ${OBEDIENCE.map(([value]) => value).join(", ")}`]],
  make: (config: ValuedConfig, options: readonly Option[], seed: number, parts: PartLookup, phase = 0) => {
    const obedience = OBEDIENCE.find(([value]) => value === config.obedience)?.[2] ?? STEADY, given = config.objective ?? FEW_TERMS_PART.defaults;
    const objective = parts.of("objective", given).make(given) as Objective;
    return chooser(options, searching(options, objective, obedience, config.depth, config.horizon ?? HORIZON), { ...DECIDING, phase, keep: KEEP }, { margin: config.margin ?? 0, seed }, objective, FOE_HOLDING);
  },
});

/** The ranked chooser's config: its depth (`RANKED_DEPTH`). */
interface RankedConfig { readonly kind: "ranked"; readonly depth: number }

/** **Ranked**: each option worth its place, the first the most. */
export const RANKED_CHOOSER: OptionChooserPart<RankedConfig> = deepFreeze({
  role: "chooser", label: "By rank", stage: "game", fields: [], slots: [], defaults: { kind: "ranked", depth: RANKED_DEPTH },
  keys: { kind: true, depth: true }, fits: anyBody, faults: depthFaults([RANKED_DEPTH]),
  make: (_config: RankedConfig, options: readonly Option[], _seed: number, _parts: PartLookup, phase = 0) =>
    chooser(options, (option, i) => ({ name: option.name, worth: options.length - i, terms: null, moves: null, letGo: 0 }), { ...DECIDING, phase }),
});
