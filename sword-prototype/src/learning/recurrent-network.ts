import { EFFECTOR_NAMES, HAND_ACTION_NAMES, MOVEMENT_NAMES, STANCE_NAMES, TARGET_NAMES } from "../options.ts";
import { PERSISTENCE_SECONDS } from "./meta.ts";

export const GRU_UNITS = 32;

export interface DenseLayer {
  readonly rows: number;
  readonly columns: number;
  readonly weights: readonly number[];
  readonly bias: readonly number[];
}

/**
 * The six categorical heads and the row count each one owes the runtime.
 *
 * Written as a table rather than as five arguments because `finiteLayer` used to
 * be handed `weights.movement.rows` as the row count it was checking
 * `weights.movement` against, which is a check that cannot fail: a head of any
 * size validated against its own size. The value head one line below passed a
 * literal `1` and was the only one that meant anything. So a PPO artifact with a
 * six-row action head over a seven-name table decoded, deployed, and answered
 * whatever `dense` produced for the six rows it had -- with `HAND_ACTION_NAMES[6]`
 * unreachable. `tests/ppo.test.mjs`'s own fixture was that artifact, and had been
 * since the file was written.
 *
 * **`persistence` is the one row count that is not a name table's length**, and
 * that is the seam the sixth head introduces everywhere it touches: five heads
 * own one contract output per logit, and the persistence head owns eight logits
 * over one contract output. `PERSISTENCE_SECONDS` is the grid, `meta.ts` carries
 * why it is eight, and `train-ppo.mjs` keeps the logit count and the contract
 * slot count as two named tables because a single one was 25 of 26 by
 * coincidence and would silently have become 33 of 26.
 */
const HEAD_ROWS = Object.freeze([
  ["movement", MOVEMENT_NAMES.length], ["action", HAND_ACTION_NAMES.length], ["effector", EFFECTOR_NAMES.length],
  ["target", TARGET_NAMES.length], ["stance", STANCE_NAMES.length], ["persistence", PERSISTENCE_SECONDS.length],
] as const);
export type RecurrentHeadName = typeof HEAD_ROWS[number][0];

export interface RecurrentPolicyWeights extends Readonly<Record<RecurrentHeadName, DenseLayer>> {
  readonly inputSize: number;
  readonly units: number;
  readonly update: DenseLayer;
  readonly reset: DenseLayer;
  readonly candidate: DenseLayer;
  readonly value: DenseLayer;
}

export interface RecurrentStep {
  readonly movementLogits: readonly number[];
  readonly actionLogits: readonly number[];
  readonly effectorLogits: readonly number[];
  readonly targetLogits: readonly number[];
  readonly stanceLogits: readonly number[];
  /** Over `PERSISTENCE_SECONDS`, not over seconds: `recurrentTactic` is what turns an index into a dwell. */
  readonly persistenceLogits: readonly number[];
  readonly value: number;
  readonly hidden: readonly number[];
}

const finiteLayer = (layer: DenseLayer | undefined, rows: number, columns: number, label: string): void => {
  if (!layer) throw new Error(`${label} layer must be a finite ${rows}x${columns} matrix with ${rows} biases`);
  if (layer.rows !== rows || layer.columns !== columns || layer.weights.length !== rows * columns || layer.bias.length !== rows ||
      layer.weights.some((value) => !Number.isFinite(value)) || layer.bias.some((value) => !Number.isFinite(value))) {
    throw new Error(`${label} layer must be a finite ${rows}x${columns} matrix with ${rows} biases`);
  }
};

const dense = (layer: DenseLayer, input: readonly number[]): number[] => Array.from({ length: layer.rows }, (_, row) => {
  let sum = layer.bias[row] as number;
  for (let column = 0; column < layer.columns; column += 1) sum +=
    (layer.weights[row * layer.columns + column] as number) * (input[column] as number);
  return sum;
});

const sigmoid = (value: number): number => 1 / (1 + Math.exp(-Math.max(-60, Math.min(60, value))));

export function maskedArgmax(logits: readonly number[], supported: ReadonlySet<number>, label: string): number {
  let selected = -1; let score = -Infinity;
  for (let index = 0; index < logits.length; index += 1) {
    const value = logits[index] as number;
    if (!Number.isFinite(value)) throw new Error(`${label} logits contain a non-finite value`);
    if (supported.has(index) && value > score) { score = value; selected = index; }
  }
  if (selected < 0) throw new Error(`${label} has no supported tactic`);
  return selected;
}

/** Seeded training sampler. Unsupported logits are excluded before normalisation. */
export function maskedCategorical(logits: readonly number[], supported: ReadonlySet<number>, randomUnit: number,
  label: string): Readonly<{ index: number; probability: number }> {
  if (!Number.isFinite(randomUnit) || randomUnit < 0 || randomUnit >= 1) throw new Error(`${label} random sample must be within [0, 1)`);
  const legal = [...supported].filter((index) => Number.isInteger(index) && index >= 0 && index < logits.length).sort((a, b) => a - b);
  if (!legal.length) throw new Error(`${label} has no supported tactic`);
  if (logits.some((value) => !Number.isFinite(value))) throw new Error(`${label} logits contain a non-finite value`);
  const peak = Math.max(...legal.map((index) => logits[index] as number));
  const masses = legal.map((index) => Math.exp((logits[index] as number) - peak));
  const total = masses.reduce((sum, mass) => sum + mass, 0); let cursor = randomUnit * total;
  for (let offset = 0; offset < legal.length; offset += 1) {
    cursor -= masses[offset] as number;
    if (cursor < 0 || offset === legal.length - 1) return Object.freeze({ index: legal[offset] as number,
      probability: (masses[offset] as number) / total });
  }
  throw new Error(`${label} categorical sampler failed`);
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0x1_0000_0000; };
}

export class RecurrentPolicy {
  readonly weights: RecurrentPolicyWeights;
  private state: number[];
  constructor(weights: RecurrentPolicyWeights) {
    if (!Number.isInteger(weights.inputSize) || weights.inputSize <= 0 || weights.units !== GRU_UNITS) {
      throw new Error(`recurrent policy requires a positive input and exactly ${GRU_UNITS} GRU units`);
    }
    const combined = weights.inputSize + weights.units;
    finiteLayer(weights.update, weights.units, combined, "GRU update");
    finiteLayer(weights.reset, weights.units, combined, "GRU reset");
    finiteLayer(weights.candidate, weights.units, combined, "GRU candidate");
    for (const [name, rows] of HEAD_ROWS) finiteLayer(weights[name], rows, weights.units, `${name} head`);
    finiteLayer(weights.value, 1, weights.units, "value head");
    this.weights = weights; this.state = Array(weights.units).fill(0);
  }
  step(input: readonly number[]): RecurrentStep {
    if (input.length !== this.weights.inputSize || input.some((value) => !Number.isFinite(value))) {
      throw new Error(`recurrent input must contain ${this.weights.inputSize} finite values`);
    }
    const joined = [...input, ...this.state];
    const update = dense(this.weights.update, joined).map(sigmoid);
    const reset = dense(this.weights.reset, joined).map(sigmoid);
    const candidateInput = [...input, ...this.state.map((value, index) => value * (reset[index] as number))];
    const candidate = dense(this.weights.candidate, candidateInput).map(Math.tanh);
    this.state = this.state.map((value, index) => (1 - (update[index] as number)) * value +
      (update[index] as number) * (candidate[index] as number));
    return Object.freeze({ movementLogits: Object.freeze(dense(this.weights.movement, this.state)),
      actionLogits: Object.freeze(dense(this.weights.action, this.state)),
      effectorLogits: Object.freeze(dense(this.weights.effector, this.state)),
      targetLogits: Object.freeze(dense(this.weights.target, this.state)),
      stanceLogits: Object.freeze(dense(this.weights.stance, this.state)),
      persistenceLogits: Object.freeze(dense(this.weights.persistence, this.state)),
      value: dense(this.weights.value, this.state)[0] as number, hidden: Object.freeze([...this.state]) });
  }
  snapshot(): readonly number[] { return Object.freeze([...this.state]); }
  restore(hidden: readonly number[]): void {
    if (hidden.length !== this.weights.units || hidden.some((value) => !Number.isFinite(value))) {
      throw new Error(`recurrent snapshot must contain ${this.weights.units} finite values`);
    }
    this.state = [...hidden];
  }
  reset(): void { this.state.fill(0); }
}
