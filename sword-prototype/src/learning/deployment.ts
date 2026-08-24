import type { FighterView, Mind } from "../mind.ts";
import { HAND_ACTION_NAMES, MOVEMENT_NAMES } from "../options.ts";
import { ResearchArtifact, type ResearchArtifactContract } from "./artifact.ts";
import { predictDagger, type DaggerModel } from "./dagger.ts";
import { FEATURE_COLUMNS, FEATURE_VERSION } from "./features.ts";
import { lookaheadMind, LOOKAHEAD_DEPTH, LOOKAHEAD_WIDTH } from "./lookahead.ts";
import { supportedOptions } from "./meta.ts";
import { RecurrentNeatNetwork } from "./recurrent-neat.ts";
import { RecurrentPolicy, maskedArgmax, type RecurrentPolicyWeights } from "./recurrent-network.ts";
import { researchLabelMind, type ResearchLabeler } from "./research-policy.ts";
import { TACTICAL_MODEL_VERSION, TACTICAL_STATE_COLUMNS, type TacticalModel } from "./tactical-model.ts";

export const RESEARCH_ARTIFACT_CONTRACT: ResearchArtifactContract = Object.freeze({ featureVersion: FEATURE_VERSION,
  featureNames: FEATURE_COLUMNS, movementNames: MOVEMENT_NAMES, actionNames: HAND_ACTION_NAMES });
export const LOOKAHEAD_CALIBRATION_LIMITS = Object.freeze({ signedReachError: 0.25, contactBrier: 0.25, vitalityDeltaError: 0.25 });

const payloadJson = (artifact: ResearchArtifact): unknown => {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(artifact.data.payload))); }
  catch (error) { throw new Error(`${artifact.data.algorithm} research artifact has invalid model payload`, { cause: error }); }
};
const recordObject = (value: unknown, algorithm: string): Record<string, unknown> => {
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error(`${algorithm} research artifact model payload must be an object`);
  return value as Record<string, unknown>;
};
const exactNames = (actual: unknown, expected: readonly string[], label: string): void => {
  if (!Array.isArray(actual) || actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${label} output table does not match the frozen runtime table`);
  }
};
const supportedActionIndices = (view: FighterView): Set<number> => {
  const allowed = new Set(supportedOptions(view)); if (!Object.values(view.self.hands).some((hand) => !hand.lost)) allowed.delete("cover");
  return new Set(HAND_ACTION_NAMES.map((name, index) => allowed.has(name) ? index : -1).filter((index) => index >= 0));
};

/** Decode the shared envelope before any algorithm-specific payload is trusted. */
export function decodeResearchArtifact(bytes: Uint8Array): ResearchArtifact {
  return ResearchArtifact.fromBytes(bytes, RESEARCH_ARTIFACT_CONTRACT);
}

/** The sole deployment dispatcher used by the blind tournament and learned league entries. */
export function deployedResearchMind(artifact: ResearchArtifact, bodyLoadout: string,
  onDecision?: Parameters<typeof researchLabelMind>[2]): Mind {
  const decoded = recordObject(payloadJson(artifact), artifact.data.algorithm);
  if (artifact.data.algorithm === "dagger") {
    const model = decoded as unknown as DaggerModel;
    if (model.featureCount !== FEATURE_COLUMNS.length) throw new Error("dagger artifact has the wrong feature count");
    exactNames(model.movement?.labels, MOVEMENT_NAMES, "dagger movement"); exactNames(model.action?.labels, HAND_ACTION_NAMES, "dagger action");
    const probe = predictDagger(model, FEATURE_COLUMNS.map(() => 0));
    if (!MOVEMENT_NAMES.includes(probe.movement as never) || !HAND_ACTION_NAMES.includes(probe.action as never) || !Number.isFinite(probe.persistence)) {
      throw new Error("dagger artifact produced an invalid deployment probe");
    }
    return researchLabelMind("dagger", (_view, features) => predictDagger(model, features), onDecision);
  }
  if (artifact.data.algorithm === "ppo") {
    const weights = decoded.weights as unknown as RecurrentPolicyWeights;
    if (!weights || weights.inputSize !== FEATURE_COLUMNS.length || weights.movement?.rows !== MOVEMENT_NAMES.length ||
        weights.action?.rows !== HAND_ACTION_NAMES.length) throw new Error("ppo artifact has the wrong recurrent feature/action shape");
    const policy = new RecurrentPolicy(weights); policy.step(FEATURE_COLUMNS.map(() => 0)); policy.reset();
    const labeler: ResearchLabeler = (view, features) => { const step = policy.step(features);
      return { movement: MOVEMENT_NAMES[maskedArgmax(step.movementLogits, new Set(MOVEMENT_NAMES.map((_, index) => index)), "movement")]!,
        action: HAND_ACTION_NAMES[maskedArgmax(step.actionLogits, supportedActionIndices(view), "action")]!, persistence: 0.4 }; };
    return researchLabelMind("ppo", labeler, onDecision);
  }
  if (artifact.data.algorithm === "neat-qd") {
    const probe = new RecurrentNeatNetwork(decoded as never); const output = probe.run(FEATURE_COLUMNS.map(() => 0));
    if (output.length !== MOVEMENT_NAMES.length + HAND_ACTION_NAMES.length + 1 || output.some((value) => !Number.isFinite(value))) {
      throw new Error("neat-qd artifact has the wrong finite feature/action shape");
    }
    const network = new RecurrentNeatNetwork(decoded as never);
    const labeler: ResearchLabeler = (view, features) => { const values = network.run(features);
      const movement = MOVEMENT_NAMES[maskedArgmax(values.slice(0, MOVEMENT_NAMES.length), new Set(MOVEMENT_NAMES.map((_, index) => index)), "movement")]!;
      const action = HAND_ACTION_NAMES[maskedArgmax(values.slice(MOVEMENT_NAMES.length, -1), supportedActionIndices(view), "action")]!;
      const raw = values.at(-1)!; return { movement, action, persistence: 0.10 + (Math.max(-1, Math.min(1, raw)) + 1) * 0.35 }; };
    return researchLabelMind("neat-qd", labeler, onDecision);
  }
  if (artifact.data.algorithm === "lookahead") {
    const model = decoded as unknown as TacticalModel;
    if (model.version !== TACTICAL_MODEL_VERSION) throw new Error(`lookahead artifact model version ${model.version} is unsupported`);
    exactNames(model.featureNames, TACTICAL_STATE_COLUMNS, "lookahead tactical feature");
    return lookaheadMind(model, bodyLoadout, LOOKAHEAD_CALIBRATION_LIMITS, LOOKAHEAD_DEPTH, LOOKAHEAD_WIDTH, onDecision);
  }
  throw new Error(`research artifact algorithm "${artifact.data.algorithm}" has no deployment runtime`);
}
