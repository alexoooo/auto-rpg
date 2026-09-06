import { mulberry32 } from "../rng.ts";
import { DUEL_OPTIONS, type DuelOption } from "./duel-model.ts";

/**
 * A multilayer perceptron with nothing under it: flat weights, tanh hidden layers, a linear
 * head read through a masked softmax. Session 08 of the matchup set.
 *
 * Dependency-free on purpose. The network is a few thousand numbers and two matrix products,
 * and a library for that would be the largest thing in the tree; what a library would give --
 * autograd -- is forty lines below, `backward`, checked against finite differences in
 * `tests/neural.test.mjs`. Everything is `Float64Array` so a forward pass allocates nothing
 * once its scratch is made, and everything is deterministic: the same seed makes the same
 * initial weights, the same weights and input make the same logits, on any host.
 *
 * **Layout.** `weights` holds each layer's matrix row-major, `outputs × inputs`, followed by
 * that layer's bias, layer after layer. `netSize` says how long that is for a layout, and the
 * weights module checks it: a table of the wrong length is a table for another shape.
 */
export interface NetLayout {
  readonly inputs: number;
  readonly hidden: readonly number[];
  readonly outputs: number;
}

/** The widths of every layer boundary, input first. */
const widths = (layout: NetLayout): number[] => [layout.inputs, ...layout.hidden, layout.outputs];

/** How many weights a layout has. */
export function netSize(layout: NetLayout): number {
  const w = widths(layout);
  let size = 0;
  for (let l = 0; l + 1 < w.length; l += 1) size += w[l + 1] * (w[l] + 1);
  return size;
}

/**
 * Seeded initial weights: each layer uniform in ±sqrt(6 / (fanIn + fanOut)), the Glorot
 * width, biases zero. Small enough that the head starts near uniform and the search starts
 * from indifference rather than from a habit.
 */
export function initWeights(layout: NetLayout, seed: number): Float64Array {
  const random = mulberry32(seed >>> 0);
  const w = widths(layout);
  const out = new Float64Array(netSize(layout));
  let at = 0;
  for (let l = 0; l + 1 < w.length; l += 1) {
    const fanIn = w[l];
    const fanOut = w[l + 1];
    const width = Math.sqrt(6 / (fanIn + fanOut));
    for (let k = 0; k < fanOut * fanIn; k += 1) out[at++] = (random() * 2 - 1) * width;
    at += fanOut;
  }
  return out;
}

/** One activation array per layer boundary after the input, the last being the logits. */
export function netScratch(layout: NetLayout): Float64Array[] {
  return widths(layout).slice(1).map((n) => new Float64Array(n));
}

/** The forward pass; returns the logits, which are the last scratch array. */
export function forward(
  layout: NetLayout, weights: Float64Array, input: Float64Array, scratch: Float64Array[],
): Float64Array {
  const w = widths(layout);
  if (input.length !== layout.inputs) throw new Error(`the network reads ${layout.inputs} inputs; given ${input.length}`);
  if (weights.length !== netSize(layout)) throw new Error(`the layout wants ${netSize(layout)} weights; given ${weights.length}`);
  let at = 0;
  let x = input;
  for (let l = 0; l + 1 < w.length; l += 1) {
    const n = w[l];
    const m = w[l + 1];
    const y = scratch[l];
    const last = l + 2 === w.length;
    for (let j = 0; j < m; j += 1) {
      let sum = weights[at + m * n + j];
      const row = at + j * n;
      for (let k = 0; k < n; k += 1) sum += weights[row + k] * x[k];
      y[j] = last ? sum : Math.tanh(sum);
    }
    at += m * (n + 1);
    x = y;
  }
  return x;
}

/**
 * The softmax of the logits over the options that are open, written into `out` in
 * `DUEL_OPTIONS` order with zero for a closed option. The mask is what keeps a network from
 * being trained to want a strike it cannot make: the head only ever competes among what the
 * body can do this step.
 */
export function maskedSoftmax(logits: Float64Array, open: readonly boolean[], out: Float64Array): Float64Array {
  let max = Number.NEGATIVE_INFINITY;
  for (let j = 0; j < logits.length; j += 1) if (open[j] && logits[j] > max) max = logits[j];
  let sum = 0;
  for (let j = 0; j < logits.length; j += 1) {
    out[j] = open[j] ? Math.exp(logits[j] - max) : 0;
    sum += out[j];
  }
  if (sum <= 0) throw new Error("no option is open");
  for (let j = 0; j < logits.length; j += 1) out[j] /= sum;
  return out;
}

/** The open option with the highest logit. Deterministic: ties go to the first in `DUEL_OPTIONS` order. */
export function pickOpen(logits: Float64Array, available: readonly DuelOption[]): DuelOption {
  let best: DuelOption | null = null;
  let bestLogit = Number.NEGATIVE_INFINITY;
  for (let j = 0; j < DUEL_OPTIONS.length; j += 1) {
    const option = DUEL_OPTIONS[j];
    if (!available.includes(option)) continue;
    if (best === null || logits[j] > bestLogit) { best = option; bestLogit = logits[j]; }
  }
  if (best === null) throw new Error("no option is open");
  return best;
}

/**
 * Backpropagation of the masked cross-entropy loss for one sample, after `forward` has left
 * its activations in `scratch`: the gradient is *added* into `grad` (so a batch accumulates),
 * and the sample's loss is returned. `target` is the index in `DUEL_OPTIONS` of the option the
 * teacher took, which must be open.
 */
export function backward(
  layout: NetLayout, weights: Float64Array, input: Float64Array, scratch: Float64Array[],
  open: readonly boolean[], target: number, grad: Float64Array, probabilities: Float64Array,
): number {
  const w = widths(layout);
  const layers = w.length - 1;
  const logits = scratch[layers - 1];
  maskedSoftmax(logits, open, probabilities);
  if (!open[target]) throw new Error(`the target option ${DUEL_OPTIONS[target]} is not open`);
  const loss = -Math.log(Math.max(probabilities[target], 1e-12));
  // dL/dlogit = p - onehot(target), zero on a closed option.
  let delta = new Float64Array(logits.length);
  for (let j = 0; j < logits.length; j += 1) delta[j] = open[j] ? probabilities[j] - (j === target ? 1 : 0) : 0;
  // Offsets of each layer's block, computed once from the front.
  const offsets: number[] = [];
  let at = 0;
  for (let l = 0; l < layers; l += 1) { offsets.push(at); at += w[l + 1] * (w[l] + 1); }
  for (let l = layers - 1; l >= 0; l -= 1) {
    const n = w[l];
    const m = w[l + 1];
    const x = l === 0 ? input : scratch[l - 1];
    const base = offsets[l];
    const next = l === 0 ? null : new Float64Array(n);
    for (let j = 0; j < m; j += 1) {
      const d = delta[j];
      if (d === 0) continue;
      const row = base + j * n;
      for (let k = 0; k < n; k += 1) {
        grad[row + k] += d * x[k];
        if (next !== null) next[k] += d * weights[row + k];
      }
      grad[base + m * n + j] += d;
    }
    if (next !== null) {
      // Through the tanh of the layer below.
      for (let k = 0; k < n; k += 1) next[k] *= 1 - x[k] * x[k];
      delta = next;
    }
  }
  return loss;
}
