import type { StrokePhase } from "./tactics-v2.ts";
import {
  GAP_BANDS, MY_PHASES, THEIR_PHASES, HEAVY_PAIRS, observe,
  type DuelModelTables, type GapBand, type HeavyPair, type ModelVocabulary, type MyPhase,
} from "./duel-model.ts";
import { STYLE_OPTIONS, type StyleOption, type StyleReading } from "./tactics-v3.ts";

/**
 * The duel model of the matchup set, re-keyed for the third executor. Session 09 of the style set.
 *
 * The model itself -- the shrinkage, the successor counts, the finite-horizon expectimax -- is
 * `src/golem/duel-model.ts` and is not copied here. What is here is the *vocabulary*: the state the third
 * executor's reading discretises to, the fifteen options, and the two keys the tables are written
 * under. `duel-model.ts` takes those four as an argument, so the arithmetic below the fit is one
 * implementation and this file is data, which is the only reason there is a second model at all
 * rather than a second copy of the first one.
 *
 * **What the state gains over the duel model's, and why.** One dimension: whether my arm is
 * longer than theirs, shorter, or neither, at the same `reachEdge` the fencer and every style
 * already read. The matchup set's model had four gap bands, four phases of theirs, three of mine
 * and the heavy pair -- forty-eight states a weapon pair -- and the whole style set has since
 * turned on reach asymmetry: the skirmisher's two branches are the long arm's and the short arm's,
 * the form's stand-off is a multiple of *their* reach, and Session 05's entry recorded that the
 * skirmisher converts a reach advantage better than any mind that ships. A model that could not
 * see which of the two it was would fit those apart bouts together.
 *
 * **The reach pair is in the key's prefix and not in its coarse part**, beside the weapon pair,
 * for a reason that matters to the dynamic program: neither reach nor weapon changes inside a
 * bout, so a successor list never leaves the family, and the search runs over the same
 * forty-eight states the duel model's did. A hundred and forty-four states a weapon pair is what
 * the *tables* hold; forty-eight is what a replan visits.
 */
export const STYLE_MODEL_VERSION = 1;

export const REACH_PAIRS = ["shorter", "equal", "longer"] as const;
export type ReachPair = (typeof REACH_PAIRS)[number];

export interface StyleState {
  heavy: HeavyPair;
  reach: ReachPair;
  gap: GapBand;
  theirs: StrokePhase;
  mine: MyPhase;
}

/** The state as the tables key it: `heavy/reach/gap/theirs/mine`. */
export function styleStateKey(s: StyleState): string {
  return `${s.heavy}/${s.reach}/${s.gap}/${s.theirs}/${s.mine}`;
}

/** The two segments that name the family a bout never leaves. */
export function styleFamilyKey(s: StyleState): string {
  return `${s.heavy}/${s.reach}`;
}

export function parseStyleStateKey(key: string): StyleState {
  const [heavy, reach, gap, theirs, mine] = key.split("/");
  return {
    heavy: heavy as HeavyPair, reach: reach as ReachPair, gap: gap as GapBand,
    theirs: theirs as StrokePhase, mine: mine as MyPhase,
  };
}

/** Every state of one weapon-and-reach pair, in a fixed order: forty-eight of them. */
export function styleStatesOf(heavy: HeavyPair, reach: ReachPair): StyleState[] {
  const out: StyleState[] = [];
  for (const gap of GAP_BANDS) {
    for (const theirs of THEIR_PHASES) {
      for (const mine of MY_PHASES) out.push({ heavy, reach, gap, theirs, mine });
    }
  }
  return out;
}

/** Every state the tables may hold: a hundred and forty-four a weapon pair, five hundred and
 * seventy-six in all. Used by a test and by the calibration's coverage report. */
export function allStyleStates(): StyleState[] {
  const out: StyleState[] = [];
  for (const heavy of HEAVY_PAIRS) for (const reach of REACH_PAIRS) out.push(...styleStatesOf(heavy, reach));
  return out;
}

/**
 * Discretise a style reading into a state.
 *
 * The gap band and the heavy pair are the duel model's own read of the same four fields, called
 * rather than repeated; `longer` and `shorter` are the reading's, which the executor sets from
 * `reachEdge` once a step, so a state and the style rules that fire in it agree by construction.
 */
export function styleObserve(reading: StyleReading, theirReach: number): StyleState {
  const base = observe(reading, theirReach);
  const reach: ReachPair = reading.longer ? "longer" : reading.shorter ? "shorter" : "equal";
  return { heavy: base.heavy, reach, gap: base.gap, theirs: base.theirs, mine: base.mine };
}

/** The vocabulary of the third executor: fifteen options, forty-eight states a family. */
export const STYLE_VOCABULARY: ModelVocabulary<StyleState, StyleOption> = Object.freeze({
  name: "style",
  version: STYLE_MODEL_VERSION,
  options: STYLE_OPTIONS,
  prefixDepth: 2,
  prefix: styleFamilyKey,
  key: styleStateKey,
  family: (state: StyleState): readonly StyleState[] => styleStatesOf(state.heavy, state.reach),
});

/** The style model's tables are the duel model's shape read under the style vocabulary. */
export type StyleModelTables = DuelModelTables;

/** Refuse tables of another version. The message names both numbers, as every other artifact does. */
export function checkStyleModel(tables: StyleModelTables): StyleModelTables {
  if (tables.version !== STYLE_MODEL_VERSION) {
    throw new Error(
      `style model tables are version ${tables.version}; this build reads version ${STYLE_MODEL_VERSION}`);
  }
  return tables;
}
