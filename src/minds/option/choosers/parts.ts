import { deepFreeze } from "../../../core/state.ts";
import { handSet } from "../../../core/hand-set.ts";
import { number, optionalChoice, type PartField } from "../../../parts/fields.ts";
import type { ConfigFor, PartLookup } from "../../../parts/lookup.ts";
import type { ChooserPart } from "../contract/parts.ts";
import { anyBody, slotOne, type PartConfig, type Supplied } from "../../../parts/parts.ts";
import { whenEmpty } from "../../../parts/tree.ts";
import { FEW_TERMS_PART } from "./objectives.ts";
import type { Objective, Obedience, ObedienceLevel } from "../contract/objective.ts";
import type { Situation } from "../contract/situation.ts";
import { randomStream } from "../../../core/math/random.ts";
import { OBEDIENCE, STEADY } from "./obedience.ts";
import type { Holding } from "./select-set.ts";
import { chooser, searching } from "./chooser.ts";
import { LEAVES, type LeafName } from "./leaves.ts";
import { pricedLines, COLD, warmStart } from "./tree-search.ts";
import { search } from "./search.ts";
import { repliedSearch, DIRECTIONS, AGAINST, type AgainstName } from "./replies.ts";

/**
 * How long a searching chooser keeps the target an option runs at (`Deciding.keep`) unless its
 * config says (`SearchConfig.keep`), s: one left sooner, for another near alike, was chosen for a
 * worth it was never given the time to earn, and two such are walked toward by turns.
 */
const KEEP = handSet({
  name: "KEEP", sort: "preference", field: "keep",
  says: "How long a chooser keeps the target an Option runs at before it may take another, s.",
  value: 1,
});

/**
 * How long the valued chooser holds its price of a foe other than its focus (`Holding`): until
 * that foe has moved `moved` m about the body, gone down or got up, or `rethink` s have passed.
 */
const HELD_FOE = handSet({
  name: "HELD_FOE", sort: "own",
  says: "How long a chooser holds its price of a foe other than its focus: until that foe has moved this far, m, or this long has passed, s.",
  value: { moved: .3, rethink: .6 },
});

/** The valued chooser's hold of each other foe's situation (`HELD_FOE`), by the foe. */
const FOE_HOLDING: Holding = Object.freeze({
  rethink: HELD_FOE.rethink,
  key: (other: Situation) => other.focus?.id ?? "",
  drift: (other: Situation) => {
    const foe = other.focus, centre = other.sight.view.stance.centre;
    return foe ? [{ at: [foe.centre.x - centre.x, foe.centre.z - centre.z], within: HELD_FOE.moved }, { at: [foe.down ? 1 : 0], within: 1 / 2 }] : [];
  },
});

/** How many options deep the valued chooser searches: the one it takes, or that and the best from where it leaves the body (`searching`). */
const VALUED_DEPTHS: readonly number[] = Object.freeze([1, 2]);

/**
 * How far ahead the valued chooser looks unless its config says (`ValuedConfig.horizon`), s: set
 * so that from every posture the body lies in, a way up's standing falls within it.
 */
export const HORIZON = handSet({
  name: "HORIZON", sort: "preference", field: "horizon",
  says: "How far ahead a searching chooser looks, s.",
  value: 20,
});

/** A depth other than those the valued chooser looks (`VALUED_DEPTHS`), as a fault. */
const depthFaults = (depth: number): readonly string[] =>
  VALUED_DEPTHS.includes(depth) ? [] : [`depth: ${VALUED_DEPTHS.join(" or ")}`];

/**
 * **What a chooser that prices by a search is given**: how far ahead it looks, s (`horizon`;
 * `HORIZON` unless given), what a metre walked as ordered is worth, life (`obedience`, a level of
 * `OBEDIENCE`; steady, `STEADY`, unless given), the margin of worth, life, within which it chooses
 * by chance (`Chance`), none unless given, the objective it prices options by (`objective`, a
 * part of role `objective`; the few terms, `FEW_TERMS_PART`, unless given).
 */
interface SearchConfig { readonly horizon?: number; readonly carry?: number; readonly keep?: number; readonly obedience?: ObedienceLevel; readonly margin?: number; readonly objective?: ConfigFor<"objective"> | null }

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

/** How long a running Option's target is kept before another may be taken (`SearchConfig.keep`), s: `KEEP` unless given. */
function keepField<C extends SearchConfig>(): PartField<C> { return number<C, "keep">("keep", "Keeps the target it runs at", 0, 2, .1, "s", KEEP); }

/** What is wrong with what a searching chooser is given (`SearchConfig`), each a sentence. */
const searchFaults = (config: SearchConfig): readonly string[] => [
  ...config.horizon === undefined || Number.isFinite(config.horizon) && config.horizon > 0 ? [] : ["horizon: a finite time, more than none"],
  ...config.carry === undefined || Number.isFinite(config.carry) && config.carry >= 0 ? [] : ["carry: a finite time, not negative"],
  ...config.keep === undefined || Number.isFinite(config.keep) && config.keep >= 0 ? [] : ["keep: a finite time, not negative"],
  ...config.margin === undefined || Number.isFinite(config.margin) && config.margin >= 0 ? [] : ["margin: a finite worth, not negative"],
  ...config.obedience === undefined || OBEDIENCE.some(([value]) => value === config.obedience) ? [] : [`obedience: one of ${OBEDIENCE.map(([value]) => value).join(", ")}`]];

/** A searching chooser's slots: the objective it prices a path by, the few terms (`FEW_TERMS_PART`) where empty. */
const OBJECTIVE_SLOTS = Object.freeze([slotOne("objective", "Objective", "objective", true)]);
const objectiveSupplied = (config: PartConfig): readonly Supplied[] => whenEmpty(OBJECTIVE_SLOTS, config, { objective: FEW_TERMS_PART.defaults });

/** A searching chooser's obedience, as `config` names it, and its objective, made by `parts`. */
function pricing(config: SearchConfig, parts: PartLookup): { readonly obedience: Obedience; readonly objective: Objective } {
  const given = config.objective ?? FEW_TERMS_PART.defaults;
  return { obedience: OBEDIENCE.find(([value]) => value === config.obedience)?.[2] ?? STEADY, objective: parts.of("objective", given).make(given) };
}

/**
 * **Valued**: each option worth its lines in life, searched to its depth over its horizon (`searching`), each path
 * priced by its objective (`Objective.worth`), its orders at its obedience; a running option with
 * targets keeps the one it runs at as long as its config says (`keep`), `KEEP` s unless given.
 */
export const VALUED_CHOOSER = deepFreeze<ChooserPart<ValuedConfig>>({
  role: "chooser", label: "By worth", fields: [obedienceField<ValuedConfig>(), horizonField<ValuedConfig>(), carryField<ValuedConfig>(), keepField<ValuedConfig>()], slots: OBJECTIVE_SLOTS, supplies: objectiveSupplied,
  defaults: { kind: "valued", depth: 2 }, keys: { kind: true, depth: true, horizon: true, carry: true, keep: true, obedience: true, margin: true, objective: true }, fits: anyBody,
  faults: (config: ValuedConfig) => [...depthFaults(config.depth), ...searchFaults(config)],
  make: ({ config, options, seed, parts, exchange, rethink }) => {
    const { obedience, objective } = pricing(config, parts), horizon = config.horizon ?? HORIZON;
    const searched = { options, objective, obedience, horizon, exchange, carry: config.carry ?? 0, depth: config.depth };
    return chooser({ options, appraise: searching((now) => search(now, searched)), deciding: { rethink, keep: config.keep ?? KEEP },
      chance: { margin: config.margin ?? 0, seed }, objective, holding: FOE_HOLDING, own: {} });
  },
});

/** How many runs the tree chooser makes a decision unless its config says (`TreeConfig.runs`). */
const RUNS = handSet({
  name: "RUNS", sort: "preference", field: "runs",
  says: "How many runs the tree chooser makes a decision.",
  value: 50,
});

/**
 * How far the tree chooser looks beyond an Option's worth unless its config says
 * (`TreeConfig.exploration`), in spreads of its siblings' worths.
 */
const EXPLORATION = handSet({
  name: "EXPLORATION", sort: "preference", field: "exploration",
  says: "How far the tree chooser looks beyond an Option's worth, in spreads of its siblings' worths.",
  value: 1,
});

/**
 * **The tree chooser's config**: its runs a search (`RUNS` unless given), how far it explores
 * (`EXPLORATION` unless given), what its leaves are worth (`LEAVES`, the tail unless
 * given), whether it keeps its work (`keeps`, s: each Option's worth at its last search's root,
 * as evidence of as many runs as it stood on, fading by half each so long; none kept unless given;
 * with `warm` "lift", what its search found past its first step instead, `liftOf`),
 * how much a state is worth its best line against the mean of its lines (`best`, its best alone
 * unless given), how many of the foe's replies it prices each line against (`replies`, `repliedSearch`;
 * none unless given) and how (`against`, `AGAINST`; its worst unless given), and what every
 * search is given (`SearchConfig`).
 */
interface TreeConfig extends SearchConfig { readonly kind: "tree"; readonly runs?: number; readonly exploration?: number; readonly leaf?: LeafName; readonly holds?: HoldsName; readonly keeps?: number; readonly best?: number; readonly replies?: number; readonly against?: AgainstName; readonly alike?: "one"; readonly warm?: "lift" }

/**
 * **How long the tree holds an open Option** (`Option.open`: a hold, a guard) on a line
 * (`TreeConfig.holds`): `horizon`, to the horizon, where the line ends, priced where the hold
 * leaves the body; `decision`, until the chooser decides again (`Deciding.rethink`), as the game
 * runs it, the line going on from where it leaves the body as from any other Option's end.
 */
const HOLDS = Object.freeze({
  horizon: Object.freeze({ label: "To the horizon", held: ({ horizon }: { readonly horizon: number; readonly rethink: number }) => horizon }),
  decision: Object.freeze({ label: "Until it decides again", held: ({ rethink }: { readonly horizon: number; readonly rethink: number }) => rethink }),
});
type HoldsName = keyof typeof HOLDS;

/** The tree's runs a search (`TreeConfig.runs`), `RUNS` written as none. */
const RUNS_FIELD = number<TreeConfig, "runs">("runs", "Runs", 1, 1000, 1, "", RUNS);

/** How far the tree looks beyond an Option's worth (`TreeConfig.exploration`), `EXPLORATION` written as none. */
const EXPLORATION_FIELD = number<TreeConfig, "exploration">("exploration", "Exploration", 0, 10, .1, "", EXPLORATION);

/** How much a state in the tree is worth its best line against the mean of its lines (`TreeConfig.best`, `backedUp`), its best alone written as none. */
const BEST_FIELD = number<TreeConfig, "best">("best", "Best line's weight", 0, 1, .1, "", 1);

/** The tree's warm start (`TreeConfig.keeps`), the seconds its kept worths fade by half in: none kept written as none (0). */
const KEEPS_FIELD = number<TreeConfig, "keeps">("keeps", "Warm start (half-life)", 0, 5, .1, "s", 0);

/**
 * What the tree's warm start keeps of each line at its root (`TreeConfig.warm`, `warmStart`): its
 * worth, or what its search found past its first step (`lift`), its first step priced afresh.
 */
const WARM_FIELD = optionalChoice<TreeConfig, "warm">("warm", "A warm start keeps", "Each line's worth", () => [["lift", "What its search found past its first step"]]);

/** Whether `name` names a kind of leaf (`LEAVES`). */
const isLeaf = (name: unknown): name is LeafName => typeof name === "string" && Object.hasOwn(LEAVES, name);

/** Whether `name` names how long the tree holds an open Option (`HOLDS`). */
const isHolds = (name: unknown): name is HoldsName => typeof name === "string" && Object.hasOwn(HOLDS, name);

/** Whether `name` names how a line is worth against the foe's replies (`AGAINST`). */
const isAgainst = (name: unknown): name is AgainstName => typeof name === "string" && Object.hasOwn(AGAINST, name);

/** A choice of the tree's among `kinds` (`LEAVES`, `AGAINST`) at `key`: `none` written as none, so a config on it equals the preset. */
function kindField(key: "leaf" | "holds" | "against", label: string, kinds: Readonly<Record<string, { readonly label: string }>>, none: string): PartField<TreeConfig> {
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

/**
 * Whether the tree searches Options made on one model (`Option.model`: a walk by each navigator) as
 * one line (`alike` "one", `treeSearch`), each priced as it, or each as its own (none).
 */
const ALIKE_FIELD = optionalChoice<TreeConfig, "alike">("alike", "Options made on one model are searched", "Each as its own line", () => [["one", "As one line"]]);

/** How long the tree holds an open Option (`HOLDS`), to the horizon written as none. */
const HOLDS_FIELD = kindField("holds", "Holds an open Option", HOLDS, "horizon");

/** How many of the foe's replies the tree prices each line against (`TreeConfig.replies`), none written as none. */
const REPLIES_FIELD = number<TreeConfig, "replies">("replies", "Foe's replies", 0, DIRECTIONS.length, 1, "", 0);

/** How a line is worth against the foe's replies (`AGAINST`), its worst written as none. */
const AGAINST_FIELD = kindField("against", "Against its replies", AGAINST, "worst");

/**
 * **By tree**: each option worth the mean of its runs in a Monte Carlo tree search over its
 * horizon (`treeSearch`), each path priced by its objective (`Objective.worth`), its orders at its
 * obedience; its draws from one stream begun at its seed, kept in its state; a running option with
 * targets keeps the one it runs at as long as its config says (`keep`), `KEEP` s unless given.
 */
export const TREE_CHOOSER = deepFreeze<ChooserPart<TreeConfig>>({
  role: "chooser", label: "By tree", fields: [obedienceField<TreeConfig>(), horizonField<TreeConfig>(), carryField<TreeConfig>(), keepField<TreeConfig>(), ...Object.keys(LEAVES).length > 1 ? [LEAF_FIELD] : [], HOLDS_FIELD, REPLIES_FIELD, AGAINST_FIELD, RUNS_FIELD, EXPLORATION_FIELD, BEST_FIELD, KEEPS_FIELD, WARM_FIELD, ALIKE_FIELD], slots: OBJECTIVE_SLOTS, supplies: objectiveSupplied,
  defaults: { kind: "tree" }, reads: (config) => LEAVES[config.leaf ?? "tail"].reads, keys: { kind: true, runs: true, exploration: true, leaf: true, holds: true, replies: true, against: true, keeps: true, warm: true, best: true, alike: true, horizon: true, carry: true, keep: true, obedience: true, margin: true, objective: true }, fits: anyBody,
  faults: (config: TreeConfig) => [...searchFaults(config),
    ...config.runs === undefined || Number.isSafeInteger(config.runs) && config.runs > 0 ? [] : ["runs: a whole number, more than none"],
    ...config.exploration === undefined || Number.isFinite(config.exploration) && config.exploration >= 0 ? [] : ["exploration: a finite number, not negative"],
    ...config.leaf === undefined || isLeaf(config.leaf) ? [] : [`leaf: one of ${Object.keys(LEAVES).join(", ")}`],
    ...config.holds === undefined || isHolds(config.holds) ? [] : [`holds: one of ${Object.keys(HOLDS).join(", ")}`],
    ...config.replies === undefined || Number.isSafeInteger(config.replies) && config.replies >= 0 && config.replies <= DIRECTIONS.length ? [] : [`replies: a whole number from 0 to ${DIRECTIONS.length}`],
    ...config.against === undefined || isAgainst(config.against) ? [] : [`against: one of ${Object.keys(AGAINST).join(", ")}`],
    ...config.keeps === undefined || Number.isFinite(config.keeps) && config.keeps > 0 ? [] : ["keeps: a finite time, more than none"],
    ...config.warm === undefined || config.warm === "lift" && config.keeps !== undefined ? [] : ["warm: lift, with keeps"],
    ...config.best === undefined || Number.isFinite(config.best) && config.best >= 0 && config.best <= 1 ? [] : ["best: a number from 0 to 1"],
    ...config.alike === undefined || config.alike === "one" ? [] : ["alike: one or none"]],
  make: ({ config, options, seed, parts, body, exchange, rethink }) => {
    const { obedience, objective } = pricing(config, parts), horizon = config.horizon ?? HORIZON, runs = config.runs ?? RUNS, exploration = config.exploration ?? EXPLORATION;
    const stream = randomStream(seed), warm = config.keeps === undefined ? null : warmStart(options, config.keeps, config.warm === "lift");
    const searched = { options, objective, obedience, horizon, exchange, carry: config.carry ?? 0, body, runs, exploration, best: config.best ?? 1, held: HOLDS[config.holds ?? "horizon"].held({ horizon, rethink }), stream, leaf: LEAVES[config.leaf ?? "tail"].make(body), replies: config.replies ?? 0, against: config.against ?? "worst", start: warm?.start ?? COLD, alike: config.alike === "one" };
    return chooser({ options, appraise: searching((now) => pricedLines(repliedSearch(now, searched))), deciding: { rethink, keep: config.keep ?? KEEP },
      chance: { margin: config.margin ?? 0, seed }, objective, holding: FOE_HOLDING, own: { tree: stream.state, ...(warm ? { warm: warm.state } : {}) } });
  },
});

/** **The ranked chooser's config**: its kind alone. */
interface RankedConfig { readonly kind: "ranked" }

/**
 * **Ranked**, the drills' chooser: each option worth its place in its mind's options, the first the
 * most, at its first target. Firm orders are carried out first (`Option.bound`); else the first
 * option on offer runs, then the first of the rest whose claims are still free. Nothing is priced,
 * searched or drawn, so a drill drives its skills by a fixed order, fast and the same each time;
 * which option a fight should choose is the valued and tree choosers' question. Not offered.
 */
export const RANKED_CHOOSER = deepFreeze<ChooserPart<RankedConfig>>({
  role: "chooser", label: "By rank", offered: false, fields: [], slots: [],
  defaults: { kind: "ranked" }, keys: { kind: true }, fits: anyBody, faults: () => [],
  make: ({ options, seed, rethink }) =>
    chooser({ options, appraise: (option, i) => ({ name: option.name, kind: option.kind, worth: options.length - i, terms: null, moves: null, letGo: 0 }),
      deciding: { rethink, keep: 0 }, chance: { margin: 0, seed }, objective: null, holding: null, own: {} }),
});

declare module "../contract/parts.ts" {
  interface ChooserConfigs {
    readonly valued: ValuedConfig;
    readonly tree: TreeConfig;
    readonly ranked: RankedConfig;
  }
}
