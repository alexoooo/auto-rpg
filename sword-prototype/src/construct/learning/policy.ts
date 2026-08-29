import type { ConstructCommand, ConstructControlGraph, ScheduledActionRequest } from "../actions.ts";
import type { ActionCapability } from "../capabilities.ts";
import { canonicalIntegrityJson, integrityDigest, type IntegrityValue } from "../integrity.ts";
import { actionCandidates } from "./candidates.ts";
import type { ConstructGraphObservation } from "./observation.ts";
import { evaluateConstructNetwork, type CandidateNetworkOutput, type ConstructNetworkWeights } from "./network.ts";

export interface ConstructPolicyRandom { next(): number }
export interface PolicyCandidateDiagnostic {
  readonly action: string;
  readonly group: string;
  readonly logit: number;
  readonly probability: number;
  readonly included: boolean;
  readonly parameterHeads: Readonly<Record<string, number | readonly number[]>>;
}
export interface ConstructPolicyDecision {
  readonly command: ConstructCommand;
  readonly logProbability: number;
  readonly value: number;
  readonly diagnostics: readonly PolicyCandidateDiagnostic[];
}
export interface ConstructPolicyScore { readonly logProbability: number; readonly value: number }

/** Pin for the six-part v1 fixture in construct-learning.test.mjs, shared by browser and trainer decoders. */
export const FROZEN_CONSTRUCT_INFERENCE_DIGEST = "81362f20" as const;

export const constructPolicyDecisionDigest = (decision: ConstructPolicyDecision): string => integrityDigest(
  canonicalIntegrityJson({ command: decision.command, diagnostics: decision.diagnostics,
    logProbability: decision.logProbability, value: decision.value } as unknown as IntegrityValue),
);

export function seededConstructRandom(seed: number): ConstructPolicyRandom {
  if (!Number.isSafeInteger(seed)) throw new Error("construct policy random seed must be a safe integer");
  let state = seed >>> 0;
  return Object.freeze({ next(): number {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state + 0.5) / 0x1_0000_0000;
  } });
}

export const sigmoid = (value: number): number => value >= 0
  ? 1 / (1 + Math.exp(-Math.min(value, 40)))
  : Math.exp(Math.max(value, -40)) / (1 + Math.exp(Math.max(value, -40)));

const OPEN_UNIT = Number.EPSILON;
export const boundedPolicyUnit = (unconstrained: number): readonly [number, number] => {
  if (!Number.isFinite(unconstrained)) throw new Error("construct bounded parameter input must be finite");
  const unit = Math.max(OPEN_UNIT, Math.min(1 - OPEN_UNIT, sigmoid(unconstrained)));
  return Object.freeze([unit, Math.log(unit / (1 - unit))]);
};

export function bernoulliLogProbability(logit: number, included: boolean): number {
  if (!Number.isFinite(logit)) throw new Error("construct Bernoulli logit must be finite");
  return included ? -Math.log1p(Math.exp(-Math.abs(logit))) - Math.max(-logit, 0)
    : -Math.log1p(Math.exp(-Math.abs(logit))) - Math.max(logit, 0);
}

function normal(random: ConstructPolicyRandom): number {
  const left = Math.max(Number.EPSILON, random.next());
  const right = random.next();
  return Math.sqrt(-2 * Math.log(left)) * Math.cos(2 * Math.PI * right);
}

function parameterValue(row: CandidateNetworkOutput, name: string, stochastic: boolean,
  random: ConstructPolicyRandom): readonly [number, number] {
  const bounds = row.candidate.parameterBounds[name];
  const head = row.parameters[name];
  if (!bounds || !head || head.kind !== "number") throw new Error(`candidate "${row.candidate.action}" has no numeric parameter "${name}"`);
  const raw = stochastic ? head.mean + Math.exp(head.logStd) * normal(random) : head.mean;
  const [unit, unconstrained] = boundedPolicyUnit(raw);
  const value = bounds[0] + unit * (bounds[1] - bounds[0]);
  const variance = Math.exp(2 * head.logStd);
  const normalLogProbability = -0.5 * ((unconstrained - head.mean) ** 2 / variance +
    2 * head.logStd + Math.log(2 * Math.PI));
  const width = bounds[1] - bounds[0];
  const jacobian = width === 0 ? 0 : Math.log(width) + Math.log(Math.max(Number.MIN_VALUE, unit * (1 - unit)));
  const logProbability = width === 0 ? 0 : normalLogProbability - jacobian;
  if (!Number.isFinite(value) || !Number.isFinite(logProbability)) {
    throw new Error(`candidate "${row.candidate.action}" parameter "${name}" decoded non-finitely`);
  }
  return [value, logProbability];
}

const categorical = (logits: readonly number[], stochastic: boolean, random: ConstructPolicyRandom):
  Readonly<{ selected: number; probability: number; logProbability: number; probabilities: readonly number[] }> => {
  const maximum = Math.max(...logits); const weights = logits.map((logit) => Math.exp(logit - maximum));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let selected = 0;
  if (stochastic) {
    let draw = random.next() * total;
    while (selected < weights.length - 1 && draw >= weights[selected]) { draw -= weights[selected]; selected += 1; }
  } else for (let index = 1; index < logits.length; index += 1) if (logits[index] > logits[selected]) selected = index;
  return Object.freeze({ selected, probability: weights[selected] / total,
    logProbability: logits[selected] - maximum - Math.log(total),
    probabilities: Object.freeze(weights.map((weight) => weight / total)) });
};

const categoricalLog = (logits: readonly number[], selected: number): number => {
  const maximum = Math.max(...logits);
  return logits[selected] - maximum - Math.log(logits.reduce((sum, logit) => sum + Math.exp(logit - maximum), 0));
};

const scoreNumber = (mean: number, logStd: number, value: number, min: number, max: number): number => {
  if (min === max) return value === min ? 0 : Number.NEGATIVE_INFINITY;
  if (!Number.isFinite(value) || value < min || value > max) return Number.NEGATIVE_INFINITY;
  const [unit, unconstrained] = boundedPolicyUnit((value - min) / (max - min) <= 0 ? -Number.MAX_VALUE :
    (value - min) / (max - min) >= 1 ? Number.MAX_VALUE : Math.log(((value - min) / (max - min)) /
      (1 - (value - min) / (max - min))));
  const variance = Math.exp(2 * logStd);
  const normalLogProbability = -0.5 * ((unconstrained - mean) ** 2 / variance +
    2 * logStd + Math.log(2 * Math.PI));
  return normalLogProbability - Math.log(max - min) - Math.log(unit * (1 - unit));
};

/** Recompute the exact autoregressive request-set likelihood used by PPO and BC. */
export function scoreConstructPolicyCommand(
  observation: ConstructGraphObservation,
  graph: ConstructControlGraph,
  capabilities: readonly ActionCapability[],
  weights: ConstructNetworkWeights,
  command: ConstructCommand,
): ConstructPolicyScore {
  const candidates = actionCandidates(graph, capabilities);
  const output = evaluateConstructNetwork(observation, candidates, weights);
  const remaining = new Set(output.candidates.map((_, index) => index));
  const held = new Set<string>();
  let logProbability = 0;
  const ordered = [...command.requests].sort((left, right) => left.sourceIndex - right.sourceIndex);
  if (ordered.some((request, index) => request.sourceIndex !== index || request.priority !== 0)) {
    throw new Error("construct learned command must use priority 0 and contiguous autoregressive source indices");
  }
  for (const scheduled of ordered) {
    const eligible = [...remaining].filter((index) => output.candidates[index].candidate.claims.every((claim) => !held.has(claim)));
    const selected = eligible.findIndex((index) => output.candidates[index].candidate.action === scheduled.request.action);
    if (selected < 0) return Object.freeze({ logProbability: Number.NEGATIVE_INFINITY, value: output.value });
    logProbability += categoricalLog([...eligible.map((index) => output.candidates[index].logit), output.stopLogit], selected);
    const rowIndex = eligible[selected];
    const row = output.candidates[rowIndex];
    remaining.delete(rowIndex);
    for (const claim of row.candidate.claims) held.add(claim);
    const action = graph.actions.find((candidate) => candidate.id === row.candidate.action && candidate.group === row.candidate.group);
    if (!action) throw new Error(`construct learned command action "${row.candidate.action}" became stale`);
    for (const [name, descriptor] of Object.entries(action.parameters).sort(([a], [b]) => a.localeCompare(b))) {
      const value = scheduled.request.parameters[name];
      const head = row.parameters[name];
      if (descriptor.kind === "number" && head?.kind === "number" && typeof value === "number") {
        logProbability += scoreNumber(head.mean, head.logStd, value, descriptor.min, descriptor.max);
      } else if (descriptor.kind === "boolean" && head?.kind === "boolean" && typeof value === "boolean") {
        logProbability += bernoulliLogProbability(head.logit, value);
      } else if (descriptor.kind === "enum" && head?.kind === "enum" && typeof value === "string") {
        const choice = [...descriptor.values].sort().indexOf(value);
        if (choice < 0) return Object.freeze({ logProbability: Number.NEGATIVE_INFINITY, value: output.value });
        logProbability += categoricalLog(head.logits, choice);
      } else return Object.freeze({ logProbability: Number.NEGATIVE_INFINITY, value: output.value });
    }
  }
  if (remaining.size > 0) {
    const eligible = [...remaining].filter((index) => output.candidates[index].candidate.claims.every((claim) => !held.has(claim)));
    logProbability += categoricalLog([...eligible.map((index) => output.candidates[index].logit), output.stopLogit], eligible.length);
  }
  return Object.freeze({ logProbability, value: output.value });
}

/** Canonical autoregressive candidate/STOP draws mask resolved claims after every selected row. */
export function decideConstructPolicy(
  observation: ConstructGraphObservation,
  graph: ConstructControlGraph,
  capabilities: readonly ActionCapability[],
  weights: ConstructNetworkWeights,
  options: Readonly<{ stochastic?: boolean; random?: ConstructPolicyRandom }> = {},
): ConstructPolicyDecision {
  const candidates = actionCandidates(graph, capabilities);
  const output = evaluateConstructNetwork(observation, candidates, weights);
  const stochastic = options.stochastic ?? false;
  const random = options.random ?? seededConstructRandom(0);
  const requests: ScheduledActionRequest[] = [];
  const diagnosticProbability = new Map<number, number>();
  const selectedRows: { row: CandidateNetworkOutput; slot: number }[] = [];
  let logProbability = 0;
  const held = new Set<string>();
  const remaining = new Set(output.candidates.map((_, index) => index));
  for (let slot = 0; remaining.size > 0; slot += 1) {
    const eligible = [...remaining].filter((index) => output.candidates[index].candidate.claims.every((claim) => !held.has(claim)));
    const draw = categorical([...eligible.map((index) => output.candidates[index].logit), output.stopLogit], stochastic, random);
    eligible.forEach((index, at) => { if (!diagnosticProbability.has(index)) diagnosticProbability.set(index, draw.probabilities[at]); });
    logProbability += draw.logProbability;
    if (draw.selected === eligible.length) break;
    const selectedIndex = eligible[draw.selected]; const row = output.candidates[selectedIndex];
    selectedRows.push({ row, slot }); remaining.delete(selectedIndex);
    for (const claim of row.candidate.claims) held.add(claim);
  }
  for (const { row, slot } of selectedRows) {
    const action = graph.actions.find((candidate) => candidate.id === row.candidate.action && candidate.group === row.candidate.group);
    if (!action) throw new Error(`construct policy candidate "${row.candidate.action}/${row.candidate.group}" became stale`);
    const parameters: Record<string, number | string | boolean> = {};
    for (const [name, spec] of Object.entries(action.parameters).sort(([left], [right]) => left.localeCompare(right))) {
      if (spec.kind === "number") {
        const [value, parameterLogProbability] = parameterValue(row, name, stochastic, random);
        parameters[name] = value;
        logProbability += parameterLogProbability;
      } else if (spec.kind === "boolean") {
        const head = row.parameters[name];
        if (!head || head.kind !== "boolean") throw new Error(`candidate "${row.candidate.action}" boolean head is missing`);
        const selected = stochastic ? random.next() < sigmoid(head.logit) : head.logit >= 0;
        parameters[name] = selected;
        logProbability += bernoulliLogProbability(head.logit, selected);
      } else {
        const head = row.parameters[name];
        const descriptor = row.candidate.parameterDescriptors[name];
        if (!head || head.kind !== "enum" || !descriptor || descriptor.kind !== "enum" ||
            head.logits.length !== descriptor.values.length) {
          throw new Error(`candidate "${row.candidate.action}" enum head is missing`);
        }
        const draw = categorical(head.logits, stochastic, random);
        parameters[name] = descriptor.values[draw.selected];
        logProbability += draw.logProbability;
      }
    }
    requests.push(Object.freeze({ request: Object.freeze({ action: row.candidate.action,
      parameters: Object.freeze(parameters) }), priority: 0, sourceIndex: slot }));
  }
  const selectedSet = new Set(selectedRows.map(({ row }) => row.candidate.action + "/" + row.candidate.group));
  const diagnostics = output.candidates.map((row, index): PolicyCandidateDiagnostic => {
    const parameterHeads = Object.freeze(Object.fromEntries(Object.entries(row.parameters).map(([name, head]) =>
      [name, head.kind === "number" ? head.mean : head.kind === "boolean" ? head.logit : head.logits])));
    return Object.freeze({ action: row.candidate.action, group: row.candidate.group, logit: row.logit,
      probability: diagnosticProbability.get(index) ?? 0,
      included: selectedSet.has(row.candidate.action + "/" + row.candidate.group), parameterHeads });
  });
  if (!Number.isFinite(logProbability)) throw new Error("construct policy produced a non-finite set log probability");
  return Object.freeze({ command: Object.freeze({ version: 1, requests: Object.freeze(requests) }),
    logProbability, value: output.value, diagnostics: Object.freeze(diagnostics) });
}
