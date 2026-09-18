import type { FighterView, Intent } from "../mind.ts";
import { DUEL_OPTIONS, type DuelOption } from "./duel-model.ts";
import { FEATURE_COUNT, NEURAL_FEATURES_VERSION, neuralFeatures } from "./neural-features.ts";
import { forward, netScratch, netSize, pickOpen, type NetLayout } from "./neural-net.ts";
import { NEURAL_WEIGHTS } from "./neural-weights.ts";
import {
  GOLEM_TACTICS_V2, golemFencer, type AskHook, type FencerTactics, type GolemFencer,
} from "./tactics-v2.ts";

/**
 * The golem's fifth mind, `golem-neural`: the fencer's executor under a director that is a
 * network. Session 08 of the matchup set.
 *
 * Nothing here is a new tactic and nothing here writes a hand command. The fencer of Session
 * 05 publishes, between exchanges, what it can do this step and what it reads, and the
 * planner of Session 06 answers by searching a duel model; this mind answers by reading the
 * same three things into `neuralFeatures`, running the checked-in weights forward, and naming
 * the open option with the highest logit. The fencer runs it until the next ask, on its own
 * `replanSeconds` cadence, or until it starts an exchange, which then runs to its end. That is
 * the plan's "the network picks one of the executor's options at about eight hertz; the
 * executor runs the exchange", and it is the same semi-Markov shape the planner has: a
 * decision carries its own duration, which is however long the fencer takes to ask again.
 *
 * **Where the weights come from.** `scripts/train-neural.mjs`: first the network is fitted to
 * the champion's own choices on a logged run (which options it took, from which features),
 * so it starts where the strongest director stands rather than at indifference; then an
 * evolution strategy over the weights, rated on the tournament harness against the frozen
 * league exactly as the tuner rates a vector. The result is `NEURAL_WEIGHTS` in
 * `src/golem/neural-weights.ts`, with the versions, seed and date it was made under, refused
 * on load by `checkNeuralWeights` when a version differs or the table is the wrong length.
 *
 * **Deterministic.** The choice is the argmax and not a draw, so a bout under a seed is the
 * bout; the fencer's own rolls (feints, patience) are the fencer's, under its seed as ever.
 */
export const NEURAL_VERSION = 1;

/** The shape every table this build reads has to have. */
export const NEURAL_LAYOUT: NetLayout = Object.freeze({
  inputs: FEATURE_COUNT, hidden: Object.freeze([64, 64]), outputs: DUEL_OPTIONS.length,
});

export interface NeuralWeights {
  /** `NEURAL_VERSION` of the build that wrote the table. */
  readonly version: number;
  /** `NEURAL_FEATURES_VERSION` the table was trained on. */
  readonly features: number;
  readonly layout: NetLayout;
  readonly seed: number;
  readonly date: string;
  /** Who the network was first fitted to imitate, and how well, before the search. */
  readonly teacher: string;
  readonly imitation: { readonly samples: number; readonly accuracy: number };
  /** The search that followed: generations, bouts, and the confirmation against the champion. */
  readonly generations: number;
  readonly bouts: number;
  readonly score: number;
  readonly baseline: number;
  readonly league: readonly string[];
  readonly weights: readonly number[];
}

/** Refuse a table this build cannot read, by name; return it otherwise. */
export function checkNeuralWeights(table: NeuralWeights): NeuralWeights {
  if (table.version !== NEURAL_VERSION) {
    throw new Error(`neural weights are version ${table.version}; this build reads version ${NEURAL_VERSION}`);
  }
  if (table.features !== NEURAL_FEATURES_VERSION) {
    throw new Error(`neural weights read feature version ${table.features}; this build publishes version ${NEURAL_FEATURES_VERSION}`);
  }
  const layout = table.layout;
  if (layout.inputs !== NEURAL_LAYOUT.inputs || layout.outputs !== NEURAL_LAYOUT.outputs
    || layout.hidden.length !== NEURAL_LAYOUT.hidden.length || layout.hidden.some((n, i) => n !== NEURAL_LAYOUT.hidden[i])) {
    throw new Error(`neural weights are laid out ${JSON.stringify(layout)}; this build reads ${JSON.stringify(NEURAL_LAYOUT)}`);
  }
  if (table.weights.length !== netSize(layout)) {
    throw new Error(`neural weights hold ${table.weights.length} numbers; the layout wants ${netSize(layout)}`);
  }
  return table;
}

export interface GolemNeural {
  readonly fencer: GolemFencer;
  /** How many asks the network answered. */
  readonly asks: number;
  /** The logits of the last ask, in `DUEL_OPTIONS` order, for a test and the readout. */
  readonly lastLogits: Float64Array;
  decide(view: FighterView, dt: number): Intent;
}

/**
 * The fencer under the network. `weights` may be any table this build reads -- the trainer's
 * contenders are built here over their own -- and the fencer's table is the tuner's to
 * override as ever.
 */
export function golemNeural(
  seed: number, table: NeuralWeights = NEURAL_WEIGHTS, T: FencerTactics = GOLEM_TACTICS_V2, onAsk: AskHook | null = null,
): GolemNeural {
  checkNeuralWeights(table);
  const weights = Float64Array.from(table.weights);
  const input = new Float64Array(FEATURE_COUNT);
  const scratch = netScratch(table.layout);
  let asks = 0;
  const fencer = golemFencer(seed, T, (available, reading, view): DuelOption => {
    neuralFeatures(reading, available, view, input);
    const logits = forward(table.layout, weights, input, scratch);
    const option = pickOpen(logits, available);
    asks += 1;
    onAsk?.(available, reading, view, option);
    return option;
  });
  return {
    fencer,
    get asks(): number { return asks; },
    get lastLogits(): Float64Array { return scratch[scratch.length - 1]; },
    decide: (view, dt) => fencer.decide(view, dt),
  };
}
