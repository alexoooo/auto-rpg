import { bernoulliLogProbability, boundedPolicyUnit } from "./policy.ts";

export const CONSTRUCT_PPO_VERSION = 1 as const;

export interface BoundedParameterSample {
  readonly mean: number;
  readonly logStd: number;
  readonly unconstrained: number;
  readonly min: number;
  readonly max: number;
}
export interface BooleanParameterSample { readonly kind: "boolean"; readonly logit: number; readonly value: boolean }
export interface EnumParameterSample {
  readonly kind: "enum";
  readonly logits: readonly number[];
  readonly selected: number;
}
export type ConstructParameterSample = BoundedParameterSample | BooleanParameterSample | EnumParameterSample;
export interface ConstructSetSample {
  readonly steps: readonly Readonly<{ logits: readonly number[]; selected: number }>[];
  readonly parameters: readonly ConstructParameterSample[];
}

export function categoricalLogProbability(logits: readonly number[], selected: number): number {
  if (!logits.length || logits.some((logit) => !Number.isFinite(logit)) ||
      !Number.isSafeInteger(selected) || selected < 0 || selected >= logits.length) {
    throw new Error("construct PPO categorical sample is invalid");
  }
  const maximum = Math.max(...logits);
  return logits[selected] - maximum - Math.log(logits.reduce((sum, logit) => sum + Math.exp(logit - maximum), 0));
}

export function discreteParameterLogProbability(sample: BooleanParameterSample | EnumParameterSample): number {
  if (sample.kind === "boolean") return bernoulliLogProbability(sample.logit, sample.value);
  return categoricalLogProbability(sample.logits, sample.selected);
}

export function boundedParameterLogProbability(sample: BoundedParameterSample): number {
  const { mean, logStd, unconstrained, min, max } = sample;
  if (![mean, logStd, unconstrained, min, max].every(Number.isFinite) || min > max || logStd < -5 || logStd > 2) {
    throw new Error("construct PPO bounded parameter sample is invalid");
  }
  if (min === max) return 0;
  const variance = Math.exp(2 * logStd);
  const [unit, represented] = boundedPolicyUnit(unconstrained);
  const normal = -0.5 * ((represented - mean) ** 2 / variance + 2 * logStd + Math.log(2 * Math.PI));
  const jacobian = Math.log(max - min) + Math.log(Math.max(Number.MIN_VALUE, unit * (1 - unit)));
  const result = normal - jacobian;
  if (!Number.isFinite(result)) throw new Error("construct PPO bounded parameter likelihood is non-finite");
  return result;
}

/** Candidate/STOP categorical draws and selected parameter terms form one request-set probability. */
export function constructSetLogProbability(sample: ConstructSetSample): number {
  const result = sample.steps.reduce((sum, step) => sum + categoricalLogProbability(step.logits, step.selected), 0) +
    sample.parameters.reduce((sum, parameter) => sum + ("kind" in parameter
      ? discreteParameterLogProbability(parameter) : boundedParameterLogProbability(parameter)), 0);
  if (!Number.isFinite(result)) throw new Error("construct PPO set likelihood is non-finite");
  return result;
}

export function fixedStepReturns(rewards: readonly number[], bootstrap: number, discount: number): readonly number[] {
  if (!Number.isFinite(bootstrap) || !Number.isFinite(discount) || discount < 0 || discount > 1 ||
      rewards.some((reward) => !Number.isFinite(reward))) throw new Error("construct PPO return inputs are invalid");
  const returns = Array(rewards.length).fill(0) as number[];
  let next = bootstrap;
  for (let index = rewards.length - 1; index >= 0; index -= 1) {
    next = rewards[index] + discount * next;
    returns[index] = next;
  }
  return Object.freeze(returns);
}

export function clippedPpoSurrogate(oldLogProbability: number, newLogProbability: number,
  advantage: number, clipRatio = 0.2): number {
  if (![oldLogProbability, newLogProbability, advantage, clipRatio].every(Number.isFinite) || clipRatio <= 0 || clipRatio >= 1) {
    throw new Error("construct PPO surrogate inputs are invalid");
  }
  const ratio = Math.exp(Math.max(-40, Math.min(40, newLogProbability - oldLogProbability)));
  const clipped = Math.max(1 - clipRatio, Math.min(1 + clipRatio, ratio));
  return Math.min(ratio * advantage, clipped * advantage);
}

export function constructValueLoss(predicted: number, target: number): number {
  if (!Number.isFinite(predicted) || !Number.isFinite(target)) throw new Error("construct PPO value inputs are invalid");
  return 0.5 * (predicted - target) ** 2;
}

export interface ConstructIndexedJob { readonly index: number; readonly seed: number }
export interface ConstructIndexedResult<T> { readonly index: number; readonly value: T }

export function constructIndexedJobs(count: number, seed: number): readonly ConstructIndexedJob[] {
  if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(seed)) throw new Error("invalid construct indexed job range");
  return Object.freeze(Array.from({ length: count }, (_, index) => Object.freeze({ index,
    seed: (Math.imul((seed >>> 0) ^ index, 2246822519) + 3266489917) >>> 0 })));
}

/**
 * Worker assignment may finish in any order; only the immutable job index determines the returned
 * ledger. This synchronous adapter is also the parity oracle for browser Worker implementations.
 */
export function executeConstructJobs<T>(jobs: readonly ConstructIndexedJob[], workers: number,
  run: (job: ConstructIndexedJob) => T): readonly ConstructIndexedResult<T>[] {
  if (!Number.isSafeInteger(workers) || workers <= 0) throw new Error("construct worker count must be positive");
  const completion: ConstructIndexedResult<T>[] = [];
  for (let worker = 0; worker < workers; worker += 1) {
    for (let at = worker; at < jobs.length; at += workers) {
      const job = jobs[at];
      completion.push(Object.freeze({ index: job.index, value: run(job) }));
    }
  }
  completion.sort((left, right) => left.index - right.index);
  if (new Set(completion.map((row) => row.index)).size !== completion.length) {
    throw new Error("construct indexed job ledger has duplicate indices");
  }
  return Object.freeze(completion);
}

export function resumeConstructJobs<T>(jobs: readonly ConstructIndexedJob[],
  completed: readonly ConstructIndexedResult<T>[]): readonly ConstructIndexedJob[] {
  const indices = new Set<number>();
  for (const row of completed) {
    if (!Number.isSafeInteger(row.index) || row.index < 0 || indices.has(row.index) || !jobs.some((job) => job.index === row.index)) {
      throw new Error(`construct resume has invalid or duplicate shard ${row.index}`);
    }
    indices.add(row.index);
  }
  return Object.freeze(jobs.filter((job) => !indices.has(job.index)));
}

/** Canonical-index reduction makes update bytes independent of worker completion order. */
export function reduceConstructUpdates(initial: readonly number[], rows: readonly ConstructIndexedResult<readonly number[]>[],
  learningRate: number): readonly number[] {
  if (!Number.isFinite(learningRate) || learningRate <= 0 || initial.some((value) => !Number.isFinite(value))) {
    throw new Error("construct indexed update inputs are invalid");
  }
  const weights = [...initial];
  const ordered = [...rows].sort((left, right) => left.index - right.index);
  for (const row of ordered) {
    if (row.value.length !== weights.length || row.value.some((value) => !Number.isFinite(value))) {
      throw new Error(`construct shard ${row.index} gradient shape is invalid`);
    }
    for (let index = 0; index < weights.length; index += 1) weights[index] -= learningRate * row.value[index];
  }
  return Object.freeze(weights);
}
