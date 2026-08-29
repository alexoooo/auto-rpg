import type { ActionCandidate } from "./candidates.ts";
import { validateConstructObservation, type ConstructEdgeType, type ConstructGraphObservation,
  type ConstructNodeType } from "./observation.ts";

export const CONSTRUCT_POLICY_VERSION = 2 as const;
export const CONSTRUCT_EMBEDDING_WIDTH = 8 as const;
export const CONSTRUCT_MESSAGE_ROUNDS = 2 as const;

export const CONSTRUCT_NODE_FEATURE_WIDTHS: Readonly<Record<ConstructNodeType, number>> = Object.freeze({
  part: 20, joint: 25, module: 8, sensor: 5, group: 2, action: 3,
});

const NODE_TYPES: readonly ConstructNodeType[] = ["part", "joint", "module", "sensor", "group", "action"];
const EDGE_TYPES: readonly ConstructEdgeType[] = ["physical", "socket", "group-member", "action-group", "sensor-source", "resource"];

export interface ConstructNetworkWeights { readonly values: readonly number[] }
export type ParameterHead = Readonly<{ kind: "number"; mean: number; logStd: number }> |
  Readonly<{ kind: "boolean"; logit: number }> |
  Readonly<{ kind: "enum"; logits: readonly number[] }>;
export interface CandidateNetworkOutput {
  readonly candidate: ActionCandidate;
  readonly logit: number;
  readonly parameters: Readonly<Record<string, ParameterHead>>;
}
export interface ConstructNetworkOutput {
  readonly candidates: readonly CandidateNetworkOutput[];
  readonly stopLogit: number;
  readonly value: number;
  readonly selfEmbedding: readonly number[];
  readonly opponentEmbedding: readonly number[];
}

const layerSize = (input: number): number => input * CONSTRUCT_EMBEDDING_WIDTH + CONSTRUCT_EMBEDDING_WIDTH;
export const CONSTRUCT_NETWORK_WEIGHT_COUNT = NODE_TYPES.reduce((sum, type) =>
  sum + layerSize(CONSTRUCT_NODE_FEATURE_WIDTHS[type]), 0) +
  CONSTRUCT_MESSAGE_ROUNDS * EDGE_TYPES.length * layerSize(CONSTRUCT_EMBEDDING_WIDTH) +
  CONSTRUCT_MESSAGE_ROUNDS * layerSize(CONSTRUCT_EMBEDDING_WIDTH) +
  (4 * CONSTRUCT_EMBEDDING_WIDTH + 1) +
  2 * (4 * CONSTRUCT_EMBEDDING_WIDTH + 1) +
  3 * (4 * CONSTRUCT_EMBEDDING_WIDTH + 1) +
  (2 * CONSTRUCT_EMBEDDING_WIDTH + 1) +
  (2 * CONSTRUCT_EMBEDDING_WIDTH + 1);

function finiteWeights(weights: ConstructNetworkWeights): void {
  if (weights.values.length !== CONSTRUCT_NETWORK_WEIGHT_COUNT) {
    throw new Error(`construct policy has ${weights.values.length} weights; expected ${CONSTRUCT_NETWORK_WEIGHT_COUNT}`);
  }
  if (weights.values.some((value) => !Number.isFinite(value))) throw new Error("construct policy weights must all be finite");
}

/** Small deterministic initializer used by smoke tests and reproducible indexed jobs. */
export function initializeConstructNetwork(seed: number): ConstructNetworkWeights {
  if (!Number.isSafeInteger(seed)) throw new Error("construct policy seed must be a safe integer");
  let state = seed >>> 0;
  const values = Array.from({ length: CONSTRUCT_NETWORK_WEIGHT_COUNT }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return ((state / 0x1_0000_0000) * 2 - 1) * 0.08;
  });
  return Object.freeze({ values: Object.freeze(values) });
}

const tanh = (value: number): number => Math.tanh(Math.max(-20, Math.min(20, value)));

function linear(values: readonly number[], input: readonly number[], offset: number): readonly [readonly number[], number] {
  const output: number[] = [];
  const width = CONSTRUCT_EMBEDDING_WIDTH;
  for (let row = 0; row < width; row += 1) {
    let value = values[offset + input.length * width + row];
    for (let column = 0; column < input.length; column += 1) {
      value += input[column] * values[offset + column * width + row];
    }
    output.push(value);
  }
  return [output, offset + layerSize(input.length)];
}

function dotHead(values: readonly number[], input: readonly number[], offset: number): readonly [number, number] {
  let result = values[offset + input.length];
  for (let index = 0; index < input.length; index += 1) result += input[index] * values[offset + index];
  return [result, offset + input.length + 1];
}

const mean = (rows: readonly (readonly number[])[]): readonly number[] => {
  if (!rows.length) return Object.freeze(Array(CONSTRUCT_EMBEDDING_WIDTH).fill(0));
  const result = Array(CONSTRUCT_EMBEDDING_WIDTH).fill(0) as number[];
  for (const row of rows) for (let index = 0; index < result.length; index += 1) result[index] += row[index];
  return Object.freeze(result.map((value) => value / rows.length));
};

/** Exactly two typed, bidirectional gather rounds over each canonical edge row. */
export function evaluateConstructNetwork(
  observation: ConstructGraphObservation,
  candidates: readonly ActionCandidate[],
  weights: ConstructNetworkWeights,
): ConstructNetworkOutput {
  validateConstructObservation(observation);
  finiteWeights(weights);
  const values = weights.values;
  let offset = 0;
  const nodeLayers = new Map<ConstructNodeType, number>();
  for (const type of NODE_TYPES) {
    nodeLayers.set(type, offset);
    offset += layerSize(CONSTRUCT_NODE_FEATURE_WIDTHS[type]);
  }
  let embeddings = observation.nodes.map((node) => {
    const expected = CONSTRUCT_NODE_FEATURE_WIDTHS[node.type];
    if (node.features.length !== expected || node.features.some((value) => !Number.isFinite(value))) {
      throw new Error(`construct ${node.type} node "${node.id}" must have ${expected} finite features`);
    }
    const [encoded] = linear(values, node.features, nodeLayers.get(node.type) as number);
    return Object.freeze(encoded.map(tanh));
  });

  for (let round = 0; round < CONSTRUCT_MESSAGE_ROUNDS; round += 1) {
    const edgeLayers = new Map<ConstructEdgeType, number>();
    for (const type of EDGE_TYPES) {
      edgeLayers.set(type, offset);
      offset += layerSize(CONSTRUCT_EMBEDDING_WIDTH);
    }
    const selfLayer = offset;
    offset += layerSize(CONSTRUCT_EMBEDDING_WIDTH);
    const gathered = observation.nodes.map(() => Array(CONSTRUCT_EMBEDDING_WIDTH).fill(0) as number[]);
    for (const edge of observation.edges) {
      if (!embeddings[edge.from] || !embeddings[edge.to]) throw new Error("construct graph edge endpoint is out of range");
      const layer = edgeLayers.get(edge.type) as number;
      const [toMessage] = linear(values, embeddings[edge.from], layer);
      const [fromMessage] = linear(values, embeddings[edge.to], layer);
      for (let at = 0; at < CONSTRUCT_EMBEDDING_WIDTH; at += 1) {
        gathered[edge.to][at] += toMessage[at];
        gathered[edge.from][at] += fromMessage[at];
      }
    }
    embeddings = embeddings.map((embedding, index) => {
      const [self] = linear(values, embedding, selfLayer);
      return Object.freeze(self.map((value, at) => tanh(value + gathered[index][at])));
    });
  }

  const opponentRows = observation.nodes.flatMap((node, index) =>
    node.type === "sensor" && node.features[4] === 1 && node.features[0] === 1 ? [embeddings[index]] : []);
  const selfRows = observation.nodes.flatMap((node, index) =>
    node.type === "sensor" && node.features[4] === 1 ? [] : [embeddings[index]]);
  const selfEmbedding = mean(selfRows);
  const opponentEmbedding = mean(opponentRows);
  const nodeIndex = new Map(observation.nodes.map((node, index) => [`${node.type}:${node.id}`, index]));
  const scorerOffset = offset;
  offset += 4 * CONSTRUCT_EMBEDDING_WIDTH + 1;
  const parameterMeanOffset = offset;
  offset += 4 * CONSTRUCT_EMBEDDING_WIDTH + 1;
  const parameterStdOffset = offset;
  offset += 4 * CONSTRUCT_EMBEDDING_WIDTH + 1;
  const booleanOffset = offset;
  offset += 4 * CONSTRUCT_EMBEDDING_WIDTH + 1;
  const choiceBaseOffset = offset;
  offset += 4 * CONSTRUCT_EMBEDDING_WIDTH + 1;
  const choiceStepOffset = offset;
  offset += 4 * CONSTRUCT_EMBEDDING_WIDTH + 1;
  const rows = candidates.map((candidate): CandidateNetworkOutput => {
    const action = nodeIndex.get(`action:${candidate.action}`); const group = nodeIndex.get(`group:${candidate.group}`);
    if (action === undefined || group === undefined) throw new Error(`candidate "${candidate.action}/${candidate.group}" is absent from graph`);
    const input = [...selfEmbedding, ...opponentEmbedding, ...embeddings[action], ...embeddings[group]];
    const [logit] = dotHead(values, input, scorerOffset);
    const [parameterMean] = dotHead(values, input, parameterMeanOffset);
    const [rawLogStd] = dotHead(values, input, parameterStdOffset);
    const logStd = Math.max(-5, Math.min(2, rawLogStd));
    const [booleanLogit] = dotHead(values, input, booleanOffset);
    const [choiceBase] = dotHead(values, input, choiceBaseOffset);
    const [choiceStep] = dotHead(values, input, choiceStepOffset);
    const parameters = Object.freeze(Object.fromEntries(Object.entries(candidate.parameterDescriptors)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([name, descriptor]) =>
        [name, descriptor.kind === "number" ? Object.freeze({ kind: descriptor.kind, mean: parameterMean, logStd })
          : descriptor.kind === "boolean" ? Object.freeze({ kind: descriptor.kind, logit: booleanLogit })
            : Object.freeze({ kind: descriptor.kind, logits: Object.freeze(descriptor.values.map((_, index) =>
              choiceBase + index * choiceStep)) })])));
    return Object.freeze({ candidate, logit, parameters });
  });
  const valueInput = [...selfEmbedding, ...opponentEmbedding];
  const [stopLogit, valueOffset] = dotHead(values, valueInput, offset);
  const [value, finalOffset] = dotHead(values, valueInput, valueOffset);
  if (finalOffset !== values.length) throw new Error("construct policy internal weight layout mismatch");
  if (![value, stopLogit, ...rows.flatMap((row) => [row.logit, ...Object.values(row.parameters).flatMap((head) =>
    head.kind === "number" ? [head.mean, head.logStd] : head.kind === "boolean" ? [head.logit] : [...head.logits])])]
      .every(Number.isFinite)) throw new Error("construct policy produced a non-finite output");
  return Object.freeze({ candidates: Object.freeze(rows), stopLogit, value,
    selfEmbedding: Object.freeze(selfEmbedding), opponentEmbedding: Object.freeze(opponentEmbedding) });
}
