import { canonicalIntegrityJson, integrityDigest, type IntegrityValue } from "../integrity.ts";
import { CONSTRUCT_ACTION_VERSION } from "../actions.ts";
import { CONSTRUCT_GRAPH_CONTRACT_DIGEST, CONSTRUCT_OBSERVATION_VERSION } from "./contract.ts";
import { CONSTRUCT_NETWORK_WEIGHT_COUNT, CONSTRUCT_POLICY_VERSION, type ConstructNetworkWeights } from "./network.ts";

export const CONSTRUCT_CHECKPOINT_VERSION = 2 as const;

export interface ConstructTrainingIdentity {
  readonly graphDigest: string;
  readonly actionDigest: string;
  readonly programDigest: string;
  readonly teacherDigest: string;
  readonly configDigest: string;
}
export interface ConstructOptimizerState {
  readonly update: number;
  readonly firstMoment: readonly number[];
  readonly secondMoment: readonly number[];
}
export interface ConstructCheckpoint {
  readonly checkpointVersion: 2;
  readonly observationVersion: 2;
  readonly actionVersion: 1;
  readonly policyVersion: 2;
  readonly identity: ConstructTrainingIdentity;
  readonly weights: ConstructNetworkWeights;
  readonly optimizer: ConstructOptimizerState;
  readonly nextJobIndex: number;
  readonly completedShards: readonly number[];
  readonly morphologySplit: Readonly<{ train: readonly string[]; validation: readonly string[]; test: readonly string[] }>;
}

const keys = (value: Record<string, unknown>, expected: readonly string[], context: string): void => {
  const unknown = Object.keys(value).find((key) => !expected.includes(key));
  if (unknown) throw new Error(`${context} has unknown field "${unknown}"`);
  const missing = expected.find((key) => !Object.prototype.hasOwnProperty.call(value, key));
  if (missing) throw new Error(`${context} is missing field "${missing}"`);
};
const object = (value: unknown, context: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${context} must be an object`);
  return value as Record<string, unknown>;
};
const finiteArray = (value: unknown, length: number, context: string): readonly number[] => {
  if (!Array.isArray(value) || value.length !== length || value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))) {
    throw new Error(`${context} must contain ${length} finite numbers`);
  }
  return Object.freeze([...value] as number[]);
};
const index = (value: unknown, context: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${context} must be a non-negative safe integer`);
  return value as number;
};
const strings = (value: unknown, context: string): readonly string[] => {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string") || new Set(value).size !== value.length) {
    throw new Error(`${context} must contain unique strings`);
  }
  return Object.freeze([...value].sort());
};

export function validateConstructCheckpoint(value: unknown): ConstructCheckpoint {
  const source = object(value, "construct checkpoint");
  keys(source, ["checkpointVersion", "observationVersion", "actionVersion", "policyVersion", "identity", "weights",
    "optimizer", "nextJobIndex", "completedShards", "morphologySplit"], "construct checkpoint");
  if (source.checkpointVersion !== CONSTRUCT_CHECKPOINT_VERSION || source.observationVersion !== CONSTRUCT_OBSERVATION_VERSION ||
      source.actionVersion !== CONSTRUCT_ACTION_VERSION || source.policyVersion !== CONSTRUCT_POLICY_VERSION) {
    throw new Error("construct checkpoint version identity is stale");
  }
  const identitySource = object(source.identity, "construct checkpoint identity");
  keys(identitySource, ["graphDigest", "actionDigest", "programDigest", "teacherDigest", "configDigest"],
    "construct checkpoint identity");
  const identity = Object.freeze(Object.fromEntries(Object.entries(identitySource).map(([key, entry]) => {
    if (typeof entry !== "string" || !/^[0-9a-f]{8,64}$/.test(entry)) throw new Error(`construct checkpoint identity "${key}" is invalid`);
    return [key, entry];
  }))) as unknown as ConstructTrainingIdentity;
  const weightsSource = object(source.weights, "construct checkpoint weights");
  keys(weightsSource, ["values"], "construct checkpoint weights");
  const weights = Object.freeze({ values: finiteArray(weightsSource.values, CONSTRUCT_NETWORK_WEIGHT_COUNT,
    "construct checkpoint weights") });
  const optimizerSource = object(source.optimizer, "construct checkpoint optimizer");
  keys(optimizerSource, ["update", "firstMoment", "secondMoment"], "construct checkpoint optimizer");
  const optimizer = Object.freeze({ update: index(optimizerSource.update, "construct checkpoint optimizer update"),
    firstMoment: finiteArray(optimizerSource.firstMoment, CONSTRUCT_NETWORK_WEIGHT_COUNT, "construct checkpoint first moment"),
    secondMoment: finiteArray(optimizerSource.secondMoment, CONSTRUCT_NETWORK_WEIGHT_COUNT, "construct checkpoint second moment") });
  const completedShards = Array.isArray(source.completedShards)
    ? source.completedShards.map((entry) => index(entry, "construct checkpoint completed shard")) : [];
  if (!Array.isArray(source.completedShards) || new Set(completedShards).size !== completedShards.length) {
    throw new Error("construct checkpoint completed shards must be unique indices");
  }
  completedShards.sort((left, right) => left - right);
  const splitSource = object(source.morphologySplit, "construct checkpoint morphology split");
  keys(splitSource, ["train", "validation", "test"], "construct checkpoint morphology split");
  const checkpoint = Object.freeze({ checkpointVersion: CONSTRUCT_CHECKPOINT_VERSION,
    observationVersion: CONSTRUCT_OBSERVATION_VERSION, actionVersion: CONSTRUCT_ACTION_VERSION,
    policyVersion: CONSTRUCT_POLICY_VERSION, identity, weights, optimizer,
    nextJobIndex: index(source.nextJobIndex, "construct checkpoint next job index"),
    completedShards: Object.freeze(completedShards), morphologySplit: Object.freeze({
      train: strings(splitSource.train, "construct checkpoint train morphologies"),
      validation: strings(splitSource.validation, "construct checkpoint validation morphologies"),
      test: strings(splitSource.test, "construct checkpoint test morphologies"),
    }) });
  return checkpoint;
}

export function encodeConstructCheckpoint(checkpoint: ConstructCheckpoint): Uint8Array {
  const checked = validateConstructCheckpoint(checkpoint);
  return new TextEncoder().encode(canonicalIntegrityJson(checked as unknown as IntegrityValue));
}

export function decodeConstructCheckpoint(bytes: Uint8Array): ConstructCheckpoint {
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch (error) { throw new Error("construct checkpoint is not valid UTF-8", { cause: error }); }
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch (error) { throw new Error("construct checkpoint is not valid JSON", { cause: error }); }
  return validateConstructCheckpoint(parsed);
}

export const constructCheckpointDigest = (checkpoint: ConstructCheckpoint): string =>
  integrityDigest(new TextDecoder().decode(encodeConstructCheckpoint(checkpoint)));

export function defaultConstructTrainingIdentity(overrides: Partial<ConstructTrainingIdentity> = {}): ConstructTrainingIdentity {
  return Object.freeze({ graphDigest: CONSTRUCT_GRAPH_CONTRACT_DIGEST, actionDigest: "00000001",
    programDigest: "00000000", teacherDigest: "00000000", configDigest: "00000000", ...overrides });
}

export function assertConstructCheckpointIdentity(checkpoint: ConstructCheckpoint, expected: ConstructTrainingIdentity): void {
  for (const key of ["graphDigest", "actionDigest", "programDigest", "teacherDigest", "configDigest"] as const) {
    if (checkpoint.identity[key] !== expected[key]) {
      throw new Error(`construct checkpoint resume refused: ${key} changed`);
    }
  }
}

export function firstMissingConstructShard(checkpoint: ConstructCheckpoint, shardCount: number): number | null {
  const completed = new Set(checkpoint.completedShards);
  for (let index = 0; index < shardCount; index += 1) if (!completed.has(index)) return index;
  return null;
}
