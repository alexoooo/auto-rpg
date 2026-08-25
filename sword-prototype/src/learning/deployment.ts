import type { FighterView, Mind } from "../mind.ts";
import { EFFECTOR_NAMES, HAND_ACTION_NAMES, MOVEMENT_NAMES, STANCE_NAMES, TACTIC_VERSION, TARGET_NAMES } from "../options.ts";
import { ResearchArtifact, type ResearchArtifactContract } from "./artifact.ts";
import { predictDagger, type DaggerModel } from "./dagger.ts";
import { FEATURE_COLUMNS, FEATURE_VERSION } from "./features.ts";
import { lookaheadMind, LOOKAHEAD_DEPTH, LOOKAHEAD_WIDTH } from "./lookahead.ts";
import { META_OUTPUT_LAYOUT, deployableActions, readMetaOutput } from "./meta.ts";
import { RecurrentNeatNetwork } from "./recurrent-neat.ts";
import { RecurrentPolicy, maskedArgmax, type RecurrentPolicyWeights } from "./recurrent-network.ts";
import { researchLabelMind, type ResearchLabeler } from "./research-policy.ts";
import { TACTICAL_MODEL_VERSION, TACTICAL_STATE_COLUMNS, type TacticalModel } from "./tactical-model.ts";

/**
 * The one artifact header, and every producer in the tree spreads *this*.
 *
 * It was five inline copies -- `collect-dagger.mjs`,
 * `train-lookahead.mjs`, `train-neat-qd.mjs` and `train-ppo.mjs` twice, each of
 * them writing the same four fields out by hand at both the data end and the
 * contract end of the same `new ResearchArtifact(...)` call. **This said "plus a
 * test fixture" and no test fixture was converted**: `ai-contract.test.mjs`
 * keeps a deliberately synthetic header, because that file is about the envelope
 * and would go red every time a name entered a real vocabulary, and
 * `tournament-executor.test.mjs`'s `staleContract` spells all seven fields out
 * on purpose so that only the input half is stale. A copied header is
 * a header that grows in one place: the widening from thirteen outputs to
 * twenty-six adds `tacticVersion` and three name tables, and a producer that
 * kept its own literal would have written an artifact this runtime refuses
 * while validating perfectly against itself.
 *
 * `tacticVersion` is the field the refusal actually rests on. `ResearchArtifact`
 * does no unknown-key rejection, so an artifact written against the
 * thirteen-output header is not caught by having too few keys -- it arrives with
 * `tacticVersion: undefined` and is refused by name in `artifact.ts` beside the
 * `featureVersion` check, before a network is built from it.
 */
export const RESEARCH_ARTIFACT_CONTRACT: ResearchArtifactContract = Object.freeze({ featureVersion: FEATURE_VERSION,
  featureNames: FEATURE_COLUMNS, tacticVersion: TACTIC_VERSION, movementNames: MOVEMENT_NAMES, actionNames: HAND_ACTION_NAMES,
  effectorNames: EFFECTOR_NAMES, targetNames: TARGET_NAMES, stanceNames: STANCE_NAMES });
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
/** `deployableActions` projected onto the action table's indices, which is what `maskedArgmax` takes; the rule itself has one copy, in `meta.ts`. */
export const supportedActionIndices = (view: FighterView): Set<number> => {
  const allowed = deployableActions(view);
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
    // This probe **shadows `readMetaOutput`'s width refusal** rather than being
    // covered by it: a NEAT genome's output count is a property of the genome,
    // not of the input, so a width caught here is a width that could never have
    // reached the labeler below. `readMetaOutput` earns its width check at
    // `research-rollout-worker.mjs`, which decodes a live genome mid-search with
    // no probe in front of it.
    //
    // The finiteness half is the other way round. This runs on an all-zero
    // feature vector and is silent about a network that overflows on real ones,
    // which is exactly how a `persistence: NaN` used to reach
    // `researchLabelMind` and delete its persistence window; `readMetaOutput`
    // refuses that one by name, every step.
    const probe = new RecurrentNeatNetwork(decoded as never); const output = probe.run(FEATURE_COLUMNS.map(() => 0));
    if (output.length !== META_OUTPUT_LAYOUT.width || output.some((value) => !Number.isFinite(value))) {
      throw new Error("neat-qd artifact has the wrong finite feature/action shape");
    }
    const network = new RecurrentNeatNetwork(decoded as never);
    const labeler: ResearchLabeler = (view, features) => { const values = readMetaOutput(network.run(features));
      const movement = MOVEMENT_NAMES[maskedArgmax(values.movementLogits, new Set(MOVEMENT_NAMES.map((_, index) => index)), "movement")]!;
      const action = HAND_ACTION_NAMES[maskedArgmax(values.actionLogits, supportedActionIndices(view), "action")]!;
      return { movement, action, persistence: values.persistence }; };
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
