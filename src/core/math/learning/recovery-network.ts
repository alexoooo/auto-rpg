import { exp } from "../real.ts";

/** A ReLU actor's weights: each layer's rows of weights, one a unit, and biases; its first `actions` outputs are its actions. */
export interface Network {
  readonly actions: number;
  readonly layers: readonly { readonly weights: readonly (readonly number[])[]; readonly bias: readonly number[] }[];
  /** Training's observation transform, before the actor: clip((raw - mean) * scale, -clip, clip). */
  readonly normalization?: { readonly mean: readonly number[]; readonly scale: readonly number[]; readonly clip: number };
  /** Clamp the actor's mean before tanh, matching the environment's action preprocessing. */
  readonly actionLimit?: number;
}

/** Each network read, what `networkFaults` found in it: a network is data, never changed once read. */
const checked = new WeakMap<object, { readonly faults: readonly string[]; readonly inputs: number }>();

/** What is wrong with `network`, each a sentence, and how many inputs it reads where nothing is; each network is read once. */
export function networkFaults(network: unknown): { readonly faults: readonly string[]; readonly inputs: number } {
  if (typeof network !== "object" || network === null) return readFaults(network);
  let found = checked.get(network);
  if (!found) checked.set(network, found = Object.freeze(readFaults(network)));
  return found;
}

function readFaults(value: unknown): { readonly faults: readonly string[]; readonly inputs: number } {
  const network = value as Partial<Network> | null;
  const layers: unknown = network?.layers;
  if (!Number.isSafeInteger(network?.actions) || !(network!.actions! > 0) || !Array.isArray(layers) || layers.length === 0) return { faults: ["a network names its actions and has a layer"], inputs: 0 };
  const first = layers[0];
  let width = first && Array.isArray(first.weights) && Array.isArray(first.weights[0]) ? first.weights[0].length : 0;
  const inputs = width;
  for (const [k, layer] of layers.entries()) {
    if (!width || typeof layer !== "object" || layer === null || !Array.isArray(layer.bias) || !Array.isArray(layer.weights) || !layer.bias.length || layer.weights.length !== layer.bias.length
      || !Array.from(layer.bias).every(Number.isFinite) || Array.from(layer.weights).some((row: unknown) => !Array.isArray(row) || row.length !== width || !Array.from(row).every(Number.isFinite)))
      return { faults: [`the network's layer ${k} is not ${width} inputs to finite rows of weights and biases`], inputs };
    width = layer.bias.length;
  }
  const normalized = network!.normalization;
  if (normalized !== undefined && (typeof normalized !== "object" || normalized === null
    || !Array.isArray(normalized.mean) || !Array.isArray(normalized.scale) || normalized.mean.length !== inputs || normalized.scale.length !== inputs
    || !Array.from(normalized.mean).every(Number.isFinite) || !Array.from(normalized.scale).every(v => Number.isFinite(v) && v > 0)
    || !Number.isFinite(normalized.clip) || normalized.clip <= 0)) return { faults: ["invalid network observation normalization"], inputs };
  if (network!.actionLimit !== undefined && (!Number.isFinite(network!.actionLimit) || network!.actionLimit <= 0)) return { faults: ["invalid network action limit"], inputs };
  return { faults: width < network!.actions! ? ["the network has fewer outputs than actions"] : [], inputs };
}

/** Deterministic double-precision inference for a ReLU actor with tanh action means. */
export function recoveryNetwork(network: Network): (observation: readonly number[]) => number[] {
  const { faults, inputs: input } = networkFaults(network);
  if (faults.length) throw new Error(`invalid network: ${faults.join("; ")}`);
  const work = network.layers.map(layer => new Array<number>(layer.bias.length).fill(0));
  const normalized = network.normalization, observationWork = normalized ? new Array<number>(input).fill(0) : null;
  return observation => {
    if (observation.length !== input || !observation.every(Number.isFinite)) throw new Error("invalid recovery network observation");
    let previous = observation;
    if (normalized && observationWork) {
      for (let i = 0; i < input; i++) observationWork[i] = Math.max(-normalized.clip, Math.min(normalized.clip, (observation[i]! - normalized.mean[i]!) * normalized.scale[i]!));
      previous = observationWork;
    }
    network.layers.forEach((layer, k) => {
      const values = work[k]!;
      for (let i = 0; i < values.length; i++) {
        let value = layer.bias[i]!;
        for (let j = 0; j < previous.length; j++) value += layer.weights[i]![j]! * previous[j]!;
        values[i] = k + 1 === network.layers.length ? value : Math.max(0, value);
      }
      previous = values;
    });
    return previous.slice(0, network.actions).map(value => {
      if (network.actionLimit !== undefined) value = Math.max(-network.actionLimit, Math.min(network.actionLimit, value));
      const t = exp(-2 * Math.abs(value));
      return (value < 0 ? -1 : 1) * (1 - t) / (1 + t);
    });
  };
}
