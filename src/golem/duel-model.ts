import type { FighterView } from "../mind.ts";
import type { StrokePhase } from "./tactics-v2.ts";

/**
 * The duel model: an abstract, calibrated picture of a golem exchange that a mind can search
 * over, because the physics cannot be. Session 06 of the matchup set.
 *
 * **Why a table and not a rollout.** There is no snapshot or restore of a Havok world in this
 * tree, and the header of `scripts/measure.mjs` records that allocator and solver history are
 * not part of body state and can flip a winner; a restored world would be approximately the
 * world left behind, and a planner over an approximation of the wrong kind is worse than a
 * table. So the model is a discrete Markov decision process whose states are what the fencer
 * can already read off the view and whose actions are the options the fencer already executes,
 * and its numbers are *fitted* from bouts the tournament harness logged rather than guessed.
 *
 * ## The state, four small factors
 *
 * | factor | values | read from |
 * |---|---|---|
 * | `gap` | `out`, `theirs`, `mine`, `both` | the gap against my strike range and their reach |
 * | `theirs` | `idle`, `chamber`, `commit`, `recover` | the fencer's stroke reader |
 * | `mine` | `free`, `exchange`, `recover` | the fencer's own stance |
 * | `heavy` | `nn`, `hn`, `nh`, `hh` | whether my armed hand, theirs, hold a club |
 *
 * `gap` is the pair of booleans "I can reach them" and "they can reach me", which is the
 * whole of what reach asymmetry comes to once the ranges are computed; `heavy` is in the state
 * because a mace bout is over in eight seconds and a blade bout in thirty, and the same option
 * in the same band is worth different things in each. The closing rate of their point is not
 * a factor of its own: the reader's `commit` already carries it, and a factor that tripled the
 * states tripled the table checked in for them. That is 4 x 4 x 3 = 48 states for a given
 * weapon pair, few enough that a six-step finite-horizon dynamic program over all of them is
 * a fraction of a millisecond.
 *
 * ## The options
 *
 * `hold`, `close`, `withdraw`, `circle`, `strike`, `wait`, `feint`, `ram` -- the things the
 * fencer between exchanges can do, as it does them. `wait` is the counter: hold the guard and
 * strike only into their recover. Each option runs for a *window*, until the fencer changes
 * its mind or `windowSeconds` runs out, and a record of the log is one window: the state it
 * began in, the option, the damage dealt and taken while it ran, and the state it ended in.
 *
 * ## The tables
 *
 * From the records, an outcome table (expected damage dealt and taken per state and option)
 * and a transition table (where a state and option lead), each at three levels of detail --
 * the full state, the state without the weapon pair, and the option alone -- so that a cell
 * the log saw four times shrinks toward the cell that saw four hundred. The shrinkage is one
 * pseudo-count constant, `shrink`, and it is in the tables' own header so a reader of the
 * checked-in file knows what was done to it. The tables are versioned; a mismatch is refused
 * on load and never silently reinterpreted.
 */

// ---------------------------------------------------------------------------------- the version

/** Bumped when the state factors, the options, or the record shape change meaning. */
export const DUEL_MODEL_VERSION = 1;

// ------------------------------------------------------------------------------------ the state

export const DUEL_OPTIONS = [
  "hold", "close", "withdraw", "circle", "strike", "wait", "feint", "ram",
] as const;
export type DuelOption = (typeof DUEL_OPTIONS)[number];

export const GAP_BANDS = ["out", "theirs", "mine", "both"] as const;
export type GapBand = (typeof GAP_BANDS)[number];
export const THEIR_PHASES = ["idle", "chamber", "commit", "recover"] as const;
export const MY_PHASES = ["free", "exchange", "recover"] as const;
export type MyPhase = (typeof MY_PHASES)[number];
export const HEAVY_PAIRS = ["nn", "hn", "nh", "hh"] as const;
export type HeavyPair = (typeof HEAVY_PAIRS)[number];

export interface DuelState {
  gap: GapBand;
  theirs: StrokePhase;
  mine: MyPhase;
  heavy: HeavyPair;
}

/** The state as the tables key it: `heavy/gap/theirs/mine`. */
export function stateKey(s: DuelState): string {
  return `${s.heavy}/${s.gap}/${s.theirs}/${s.mine}`;
}

/** The state without its weapon pair, which is the middle level of the tables. */
export function coarseKey(s: DuelState): string {
  return `${s.gap}/${s.theirs}/${s.mine}`;
}

export function parseStateKey(key: string): DuelState {
  const [heavy, gap, theirs, mine] = key.split("/");
  return {
    heavy: heavy as HeavyPair, gap: gap as GapBand,
    theirs: theirs as StrokePhase, mine: mine as MyPhase,
  };
}

/** Every state of one weapon pair, in a fixed order. */
export function statesOf(heavy: HeavyPair): DuelState[] {
  const out: DuelState[] = [];
  for (const gap of GAP_BANDS) {
    for (const theirs of THEIR_PHASES) {
      for (const mine of MY_PHASES) out.push({ heavy, gap, theirs, mine });
    }
  }
  return out;
}

/**
 * How a model reads its own state space and option list, so that one dynamic program serves two
 * executors. Session 09 of the style set.
 *
 * Everything below this line -- the fit, the shrinkage, the successor lists, the expectimax --
 * only ever needs four things of a state: the key the tables are written under, how many leading
 * segments of that key name the *family* the model keeps apart (the weapon pair here, the weapon
 * pair and the reach pair in `style-model.ts`), the family's members in a fixed order, and the
 * options that may be named. So those four are an argument, and the two vocabularies are data.
 *
 * The alternative was a second copy of the dynamic program keyed to fifteen options and a
 * hundred and forty-four states, which is the same hundred lines with two constants changed and
 * a place for them to drift apart.
 *
 * **`prefixDepth` and `prefix` have to agree**: `key(state)` is `prefix(state)` followed by the
 * coarse part, and `coarseOf` cuts exactly `prefixDepth` segments off the front. A vocabulary
 * that gets that wrong shrinks a cell toward the wrong parent and nothing throws.
 */
export interface ModelVocabulary<S, O extends string = string> {
  /** Names the vocabulary in a cache key; two vocabularies never share a tables object. */
  readonly name: string;
  /** Stamped into the tables the fit writes, and checked by the module that loads them. */
  readonly version: number;
  readonly options: readonly O[];
  /** Leading segments of a key that name the family. */
  readonly prefixDepth: number;
  prefix(state: S): string;
  key(state: S): string;
  /** Every state sharing this one's prefix, in a fixed order. */
  family(state: S): readonly S[];
}

/** The vocabulary of the second executor: eight options, forty-eight states a weapon pair. */
export const DUEL_VOCABULARY: ModelVocabulary<DuelState, DuelOption> = Object.freeze({
  name: "duel",
  version: DUEL_MODEL_VERSION,
  options: DUEL_OPTIONS,
  prefixDepth: 1,
  prefix: (state: DuelState): string => state.heavy,
  key: stateKey,
  family: (state: DuelState): readonly DuelState[] => statesOf(state.heavy),
});

/** A key with its family prefix cut off: the middle level of the tables. */
export function coarseOf(vocabulary: { readonly prefixDepth: number }, key: string): string {
  return key.split("/").slice(vocabulary.prefixDepth).join("/");
}

/** What a state is read from: the fencer's own reading of the view, published for the model. */
export interface DuelReading {
  /** Socket-to-shoulder gap, or body gap when fighting headfirst. */
  gap: number;
  /** My strike range this step. */
  strike: number;
  /** The range slack this step. */
  slack: number;
  /** The low-passed rate at which their point closes on my socket, m/s, negative closing. */
  gapRate: number;
  /** Their armed hand's weapon, as watched. */
  theirWeapon: string;
  /** My acting hand's weapon. */
  myWeapon: string;
  /** Their arm's phase, as read. */
  theirs: StrokePhase;
  /** Whether I am in an exchange, recovering from one, or free. */
  mine: MyPhase;
}

/** A club is heavy; everything else, a shield included, is not. */
export const isHeavy = (weapon: string): boolean => weapon === "club";

/** Discretise a reading into a state. */
export function observe(reading: DuelReading, theirReach: number): DuelState {
  const iReach = reading.gap <= reading.strike;
  const theyReach = reading.gap <= theirReach + reading.slack;
  const gap: GapBand = iReach && theyReach ? "both" : iReach ? "mine" : theyReach ? "theirs" : "out";
  const heavy = `${isHeavy(reading.myWeapon) ? "h" : "n"}${isHeavy(reading.theirWeapon) ? "h" : "n"}` as HeavyPair;
  return { gap, theirs: reading.theirs, mine: reading.mine, heavy };
}

/** Their reach off the view, the way the fencer reads it: the body's published reach. */
export function theirReachOf(view: FighterView): number {
  return view.opponent.reach;
}

// ---------------------------------------------------------------------------------- the records

/** One window of the exchange log. */
export interface ExchangeRecord {
  /** `stateKey` of the state the window began in. */
  state: string;
  /** One of the executor's options; which fifteen or which eight is the run's policy names. */
  option: string;
  /** Damage dealt and taken while the option ran. */
  dealt: number;
  taken: number;
  /** How long it ran. */
  seconds: number;
  /** `stateKey` of the state it ended in. */
  next: string;
}

// ----------------------------------------------------------------------------------- the tables

export interface OutcomeCell {
  n: number;
  dealt: number;
  taken: number;
}

export interface DuelModelTables {
  version: number;
  /** The run the tables were fitted from. */
  seed: number;
  date: string;
  bouts: number;
  records: number;
  /** The window cap the records were cut at. */
  windowSeconds: number;
  /** The pseudo-count each level shrinks toward the one above by. */
  shrink: number;
  /** Sums, not means: `dealt / n` is the mean, and the sums add across levels. */
  outcomes: Record<string, OutcomeCell>;
  outcomesCoarse: Record<string, OutcomeCell>;
  outcomesOption: Record<string, OutcomeCell>;
  /** Counts of next-state keys per `state|option`. */
  transitions: Record<string, Record<string, number>>;
  /** The same without the weapon pair on either side. */
  transitionsCoarse: Record<string, Record<string, number>>;
}

/** Refuse tables of another version. The message names both numbers. */
export function checkDuelModel(tables: DuelModelTables): DuelModelTables {
  if (tables.version !== DUEL_MODEL_VERSION) {
    throw new Error(
      `duel model tables are version ${tables.version}; this build reads version ${DUEL_MODEL_VERSION}`);
  }
  return tables;
}

const cell = (into: Record<string, OutcomeCell>, key: string, dealt: number, taken: number): void => {
  const c = into[key] ?? (into[key] = { n: 0, dealt: 0, taken: 0 });
  c.n += 1;
  c.dealt += dealt;
  c.taken += taken;
};

const count = (into: Record<string, Record<string, number>>, key: string, next: string): void => {
  const row = into[key] ?? (into[key] = {});
  row[next] = (row[next] ?? 0) + 1;
};

/**
 * Fit the tables from records. Pure, so a test can fit a handful and read them back.
 *
 * The vocabulary is only read for `prefixDepth` and `version`, because a record already carries
 * its state as a key; at the duel model's depth of one this cuts exactly what `stripHeavy` cut
 * before it, so the checked-in tables re-render to the byte.
 */
export function fitDuelModel(
  records: readonly ExchangeRecord[],
  meta: { seed: number; date: string; bouts: number; windowSeconds: number; shrink?: number },
  vocabulary: { readonly prefixDepth: number; readonly version: number } = DUEL_VOCABULARY,
): DuelModelTables {
  const tables: DuelModelTables = {
    version: vocabulary.version,
    seed: meta.seed, date: meta.date, bouts: meta.bouts, records: records.length,
    windowSeconds: meta.windowSeconds, shrink: meta.shrink ?? 4,
    outcomes: {}, outcomesCoarse: {}, outcomesOption: {},
    transitions: {}, transitionsCoarse: {},
  };
  for (const r of records) {
    cell(tables.outcomes, `${r.state}|${r.option}`, r.dealt, r.taken);
    cell(tables.outcomesCoarse, `${coarseOf(vocabulary, r.state)}|${r.option}`, r.dealt, r.taken);
    cell(tables.outcomesOption, r.option, r.dealt, r.taken);
    count(tables.transitions, `${r.state}|${r.option}`, r.next);
    count(tables.transitionsCoarse,
      `${coarseOf(vocabulary, r.state)}|${r.option}`, coarseOf(vocabulary, r.next));
  }
  return tables;
}

// ------------------------------------------------------------------------------ reading the tables

export interface Outcome {
  dealt: number;
  taken: number;
  /** How many records the full cell had, before shrinkage. */
  n: number;
}

/** Expected damage dealt and taken for a state and option, shrunk level by level. */
export function outcomeIn<S, O extends string>(
  vocabulary: ModelVocabulary<S, O>, tables: DuelModelTables, state: S, option: O,
): Outcome {
  const k = tables.shrink;
  const key = vocabulary.key(state);
  const top = tables.outcomesOption[option];
  const topDealt = top && top.n > 0 ? top.dealt / top.n : 0;
  const topTaken = top && top.n > 0 ? top.taken / top.n : 0;
  const mid = tables.outcomesCoarse[`${coarseOf(vocabulary, key)}|${option}`];
  const midN = mid ? mid.n : 0;
  const midDealt = ((mid ? mid.dealt : 0) + k * topDealt) / (midN + k);
  const midTaken = ((mid ? mid.taken : 0) + k * topTaken) / (midN + k);
  const full = tables.outcomes[`${key}|${option}`];
  const n = full ? full.n : 0;
  return {
    dealt: ((full ? full.dealt : 0) + k * midDealt) / (n + k),
    taken: ((full ? full.taken : 0) + k * midTaken) / (n + k),
    n,
  };
}

/** The same over the second executor's vocabulary, which is what the planner and its tests call. */
export function outcomeOf(tables: DuelModelTables, state: DuelState, option: DuelOption): Outcome {
  return outcomeIn(DUEL_VOCABULARY, tables, state, option);
}

/**
 * Where a state and option lead: a distribution over next-state keys of the same weapon pair.
 * The full row when it has `shrink` records or more, else the coarse row re-prefixed with this
 * pair, else the state itself (an option the log never saw is assumed to change nothing).
 */
export function transitionsIn<S, O extends string>(
  vocabulary: ModelVocabulary<S, O>, tables: DuelModelTables, state: S, option: O,
): Array<[string, number]> {
  const key = vocabulary.key(state);
  const full = tables.transitions[`${key}|${option}`];
  let total = 0;
  if (full) for (const n of Object.values(full)) total += n;
  if (full && total >= tables.shrink) {
    return Object.entries(full).map(([next, n]) => [next, n / total]);
  }
  const coarse = tables.transitionsCoarse[`${coarseOf(vocabulary, key)}|${option}`];
  total = 0;
  if (coarse) for (const n of Object.values(coarse)) total += n;
  if (coarse && total > 0) {
    return Object.entries(coarse).map(([next, n]) => [`${vocabulary.prefix(state)}/${next}`, n / total]);
  }
  return [[key, 1]];
}

/** The same over the second executor's vocabulary. */
export function transitionsOf(
  tables: DuelModelTables, state: DuelState, option: DuelOption,
): Array<[string, number]> {
  return transitionsIn(DUEL_VOCABULARY, tables, state, option);
}

// -------------------------------------------------------------------------------------- the plan

export interface PlanWeights {
  /** What a unit of damage dealt is worth. */
  dealt: number;
  /** What a unit of damage taken costs. */
  taken: number;
}

export interface PlanParameters {
  /** Windows deep. */
  horizon: number;
  /** Per-window discount. */
  discount: number;
}

export interface Plan<O extends string = DuelOption> {
  option: O;
  /** The root's action values, in the vocabulary's option order, `NaN` where unavailable. */
  values: number[];
  /** How many state-option cells were evaluated. */
  evaluated: number;
}

/**
 * The tables read out once per weapon pair -- every cell's expected dealt and taken, and its
 * successor list as indices -- so a replan is the dynamic program and nothing else. Keyed by
 * the tables object, so a test that fits its own tables gets its own reading, and the checked-in
 * tables are read exactly once per process.
 */
interface FamilyReading<S> {
  states: readonly S[];
  index: Map<string, number>;
  /** Whether the log ever saw the option at all; one it never saw cannot be valued. */
  known: boolean[];
  dealt: number[][];
  taken: number[][];
  succ: Array<Array<Array<[number, number]>>>;
}
const readings = new WeakMap<DuelModelTables, Map<string, unknown>>();

function readFamily<S, O extends string>(
  vocabulary: ModelVocabulary<S, O>, tables: DuelModelTables, root: S,
): FamilyReading<S> {
  let byFamily = readings.get(tables);
  if (byFamily === undefined) readings.set(tables, byFamily = new Map());
  const cacheKey = `${vocabulary.name}/${vocabulary.prefix(root)}`;
  const cached = byFamily.get(cacheKey);
  if (cached !== undefined) return cached as FamilyReading<S>;
  const states = vocabulary.family(root);
  const index = new Map<string, number>();
  states.forEach((s, i) => index.set(vocabulary.key(s), i));
  const dealt: number[][] = [];
  const taken: number[][] = [];
  const succ: Array<Array<Array<[number, number]>>> = [];
  for (let i = 0; i < states.length; i += 1) {
    dealt.push([]);
    taken.push([]);
    succ.push([]);
    for (const option of vocabulary.options) {
      const o = outcomeIn(vocabulary, tables, states[i], option);
      dealt[i].push(o.dealt);
      taken[i].push(o.taken);
      const list: Array<[number, number]> = [];
      for (const [key, p] of transitionsIn(vocabulary, tables, states[i], option)) {
        const j = index.get(key);
        if (j !== undefined) list.push([j, p]);
      }
      succ[i].push(list);
    }
  }
  const known = vocabulary.options.map((option) => (tables.outcomesOption[option]?.n ?? 0) > 0);
  const reading: FamilyReading<S> = { states, index, known, dealt, taken, succ };
  byFamily.set(cacheKey, reading);
  return reading;
}

/**
 * Finite-horizon expectimax over the model: `V_h(s) = max_o [ r(s, o) + discount * sum_s'
 * P(s' | s, o) V_{h-1}(s') ]`, `V_0 = 0`, over every state of the root's weapon pair, with
 * the root restricted to `available`. Exact for the model, because the model is small; the
 * whole thing is `horizon x 48 x 8 x successors` multiply-adds.
 *
 * An option the log never recorded is not valued at zero, which would make it look free: it is
 * left out of the search at every depth and reads `NaN` at the root. The fencer alone never
 * names a `circle`, so the tables fitted from its bouts say nothing about one, and a planner
 * that circled on that silence would be circling for no reason the model could give.
 */
export function planIn<S, O extends string>(
  vocabulary: ModelVocabulary<S, O>, tables: DuelModelTables, root: S, available: readonly O[],
  weights: PlanWeights, params: PlanParameters,
): Plan<O> {
  const { states, index, known, dealt, taken, succ } = readFamily(vocabulary, tables, root);
  const options = vocabulary.options;
  const evaluated = states.length * options.length;
  const horizon = Math.max(1, params.horizon);
  let previous = new Array<number>(states.length).fill(0);
  let rootValues: number[] = [];
  const rootIndex = index.get(vocabulary.key(root)) ?? 0;
  for (let h = 1; h <= horizon; h += 1) {
    const next = new Array<number>(states.length).fill(0);
    for (let i = 0; i < states.length; i += 1) {
      let best = Number.NEGATIVE_INFINITY;
      const values: number[] = [];
      for (let k = 0; k < options.length; k += 1) {
        if (!known[k]) { values.push(Number.NEGATIVE_INFINITY); continue; }
        let value = weights.dealt * dealt[i][k] - weights.taken * taken[i][k];
        for (const [j, p] of succ[i][k]) value += params.discount * p * previous[j];
        values.push(value);
        if (value > best) best = value;
      }
      next[i] = best;
      if (i === rootIndex && h === horizon) rootValues = values;
    }
    previous = next;
  }
  let option: O = available[0] ?? options[0];
  let best = Number.NEGATIVE_INFINITY;
  const values = options.map((name, k) => {
    if (!available.includes(name) || !known[k]) return Number.NaN;
    const value = rootValues[k];
    if (value > best) { best = value; option = name; }
    return value;
  });
  return { option, values, evaluated };
}

/** The same over the second executor's vocabulary, which is what the planner calls. */
export function planOption(
  tables: DuelModelTables, root: DuelState, available: readonly DuelOption[],
  weights: PlanWeights, params: PlanParameters,
): Plan {
  return planIn(DUEL_VOCABULARY, tables, root, available, weights, params);
}
