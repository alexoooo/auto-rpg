import { exp } from "../math/real.ts";

interface Network {
  readonly actions: number;
  readonly layers: readonly { readonly weights: readonly (readonly number[])[]; readonly bias: readonly number[] }[];
}

/** Deterministic double-precision inference for a ReLU actor with tanh action means. */
export function recoveryNetwork(network: Network): (observation: readonly number[]) => number[] {
  if (!Number.isSafeInteger(network.actions) || network.actions < 1 || !network.layers.length) throw new Error("invalid recovery network");
  let width = network.layers[0]!.weights[0]?.length ?? 0;
  const input = width;
  for (const layer of network.layers) {
    if (!width || !layer.bias.length || layer.weights.length !== layer.bias.length
      || !layer.bias.every(Number.isFinite) || layer.weights.some(row => row.length !== width || !row.every(Number.isFinite)))
      throw new Error("invalid recovery network layer");
    width = layer.bias.length;
  }
  if (width < network.actions) throw new Error("recovery network has too few outputs");
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
