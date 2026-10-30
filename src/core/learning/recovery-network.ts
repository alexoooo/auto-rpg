import { exp } from "../math/real.ts";

/** A ReLU actor's weights: each layer's rows of weights, one a unit, and biases; its first `actions` outputs are its actions. */
export interface Network {
  readonly actions: number;
  readonly layers: readonly { readonly weights: readonly (readonly number[])[]; readonly bias: readonly number[] }[];
}

/** What is wrong with `network`, each a sentence, and how many inputs it reads where nothing is. */
export function networkFaults(network: Network): { readonly faults: readonly string[]; readonly inputs: number } {
  const layers: unknown = network?.layers;
  if (!Number.isSafeInteger(network?.actions) || network.actions < 1 || !Array.isArray(layers) || layers.length === 0) return { faults: ["a network names its actions and has a layer"], inputs: 0 };
  let width = network.layers[0]!.weights?.[0]?.length ?? 0;
  const inputs = width;
  for (const [k, layer] of network.layers.entries()) {
    if (!width || !Array.isArray(layer.bias) || !Array.isArray(layer.weights) || !layer.bias.length || layer.weights.length !== layer.bias.length
      || !layer.bias.every(Number.isFinite) || layer.weights.some(row => !Array.isArray(row) || row.length !== width || !row.every(Number.isFinite)))
      return { faults: [`the network's layer ${k} is not ${width} inputs to finite rows of weights and biases`], inputs };
    width = layer.bias.length;
  }
  return { faults: width < network.actions ? ["the network has fewer outputs than actions"] : [], inputs };
}

/** Deterministic double-precision inference for a ReLU actor with tanh action means. */
export function recoveryNetwork(network: Network): (observation: readonly number[]) => number[] {
  const { faults, inputs: input } = networkFaults(network);
  if (faults.length) throw new Error(`invalid network: ${faults.join("; ")}`);
  const work = network.layers.map(layer => new Array<number>(layer.bias.length).fill(0));
  return observation => {
    if (observation.length !== input || !observation.every(Number.isFinite)) throw new Error("invalid recovery network observation");
    let previous = observation;
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
      const t = exp(-2 * Math.abs(value));
      return (value < 0 ? -1 : 1) * (1 - t) / (1 + t);
    });
  };
}
