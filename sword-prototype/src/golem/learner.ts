import type { FighterView, Intent } from "../mind.ts";
import { mulberry32 } from "../rng.ts";
import { forward, netScratch, netSize, pickOpenIn, type NetLayout } from "./neural-net.ts";
import { STYLE_FEATURE_COUNT, STYLE_FEATURES_VERSION, styleFeatures } from "./style-features.ts";
import { LEARNER_WEIGHTS } from "./learner-weights.ts";
import {
  GOLEM_TACTICS_V3, STYLE_OPTIONS, golemStyled,
  type GolemStyled, type StyleAskHook, type StyleOption, type StyleTactics,
} from "./tactics-v3.ts";

/**
 * The golem's learned mind over the third executor: `golem-learner`. Session 10 of the style set.
 *
 * The head is read as a *value* an option -- what naming this option in this state is worth from
 * here on, in bar units -- and the mind plays the best open one. Nothing else about it differs
 * from `golem-neural`: the same two hidden layers of sixty-four, the same greedy read, the same
 * refusal by version and shape. What differs is entirely in how the weights were made, and that
 * is `scripts/train-learner.mjs`.
 *
 * **Why a value and not a probability.** The matchup set's neural mind was fitted to imitate the
 * champion's choices and then searched by an evolution strategy on one scalar a bout, and its
 * entry records the wall it hit: sigma 0.032 points a bout at 384 bouts, one number per bout, and
 * a search that could not move a confident imitation. Session 08 of this set replaced that signal
 * -- every ask now carries the damage the two bars took until the next one, 253 of them a bout a
 * side, telescoping to the bar margin exactly. A value function is what that signal is *for*: it
 * is fitted off-policy from any behaviour at all, it is fitted per decision rather than per bout,
 * and it has no ceiling at the teacher because it was never shown a teacher.
 *
 * **What the mind may not do.** It reads only `styleFeatures` -- the reading, the open mask, the
 * view -- and names an open option. No hand command, no capability the executor does not publish,
 * no learning inside a bout, no memory across one. A bout under a seed is the bout.
 */
export const LEARNER_VERSION = 1;

/** The shape every table this build reads has to have. */
export const LEARNER_LAYOUT: NetLayout = Object.freeze({
  inputs: STYLE_FEATURE_COUNT, hidden: Object.freeze([64, 64]), outputs: STYLE_OPTIONS.length,
});

export interface LearnerWeights {
  /** `LEARNER_VERSION` of the build that wrote the table. */
  readonly version: number;
  /** `STYLE_FEATURES_VERSION` the table was fitted on. */
  readonly features: number;
  readonly layout: NetLayout;
  readonly seed: number;
  readonly date: string;
  /** How the fit was run: rounds of collect-and-refit, iterations a fit, and what it saw. */
  readonly rounds: number;
  readonly iterations: number;
  readonly decisions: number;
  readonly bouts: number;
  /** The two knobs of the target, in the header because a table fitted under others is a
   *  different table and a reader has no other way to tell. */
  readonly halfLife: number;
  readonly winBonus: number;
  /** The epsilon the collecting rounds explored at; the shipped mind plays greedy. */
  readonly explore: number;
  /** The confirmation on the held-out seed, and what it was measured against. */
  readonly score: number;
  readonly baselines: Readonly<Record<string, number>>;
  readonly weights: readonly number[];
}

/**
 * Refuse a table this build cannot read, by name; return it otherwise.
 *
 * Four refusals and not one, because four different things can have moved since a table was
 * written and three of them would otherwise be silent: a column added to `style-features.ts`
 * shifts every input, a hidden layer resized changes what the numbers mean, and a length that
 * happens to match a different shape is the one that would run and be wrong.
 */
export function checkLearnerWeights(table: LearnerWeights): LearnerWeights {
  if (table.version !== LEARNER_VERSION) {
    throw new Error(`learner weights are version ${table.version}; this build reads version ${LEARNER_VERSION}`);
  }
  if (table.features !== STYLE_FEATURES_VERSION) {
    throw new Error(`learner weights read feature version ${table.features}; this build publishes version ${STYLE_FEATURES_VERSION}`);
  }
  const layout = table.layout;
  if (layout.inputs !== LEARNER_LAYOUT.inputs || layout.outputs !== LEARNER_LAYOUT.outputs
    || layout.hidden.length !== LEARNER_LAYOUT.hidden.length
    || layout.hidden.some((n, i) => n !== LEARNER_LAYOUT.hidden[i])) {
    throw new Error(`learner weights are laid out ${JSON.stringify(layout)}; this build reads ${JSON.stringify(LEARNER_LAYOUT)}`);
  }
  if (table.weights.length !== netSize(layout)) {
    throw new Error(`learner weights hold ${table.weights.length} numbers; the layout wants ${netSize(layout)}`);
  }
  return table;
}

export interface GolemLearner {
  readonly styled: GolemStyled;
  /** How many asks the network answered, and how many of those were the epsilon draw. */
  readonly asks: number;
  readonly explored: number;
  /** The values of the last ask, in `STYLE_OPTIONS` order, for a test and the readout. */
  readonly lastValues: Float64Array;
  decide(view: FighterView, dt: number): Intent;
}

/**
 * The third executor under the value network.
 *
 * `explore` above zero answers that fraction of asks with a uniform draw from what is open, out
 * of a stream of its own -- the collecting rounds of the trainer run at 0.1, and the shipped
 * mind at zero. Drawn apart from the executor's stream for the reason the tactician's is: at
 * `explore` zero nothing is drawn at all, so a bout under a seed is byte for byte the bout it
 * would have been if this argument did not exist.
 */
export function golemLearner(
  seed: number, table: LearnerWeights = LEARNER_WEIGHTS, T: StyleTactics = GOLEM_TACTICS_V3,
  onAsk: StyleAskHook | null = null, explore = 0,
): GolemLearner {
  checkLearnerWeights(table);
  const weights = Float64Array.from(table.weights);
  const input = new Float64Array(STYLE_FEATURE_COUNT);
  const scratch = netScratch(table.layout);
  const random = mulberry32((seed ^ 0x1ea27e10) >>> 0);
  let asks = 0;
  let explored = 0;
  const styled = golemStyled(seed, T, (available, reading, view): StyleOption => {
    styleFeatures(reading, available, view, input);
    const values = forward(table.layout, weights, input, scratch);
    let option = pickOpenIn(STYLE_OPTIONS, values, available);
    asks += 1;
    if (explore > 0 && random() < explore) {
      explored += 1;
      option = available[Math.floor(random() * available.length)] ?? option;
    }
    onAsk?.(available, reading, view, option);
    return option;
  });
  return {
    styled,
    get asks(): number { return asks; },
    get explored(): number { return explored; },
    get lastValues(): Float64Array { return scratch[scratch.length - 1]; },
    decide: (view, dt) => styled.decide(view, dt),
  };
}
