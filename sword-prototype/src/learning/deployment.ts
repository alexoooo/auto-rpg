import type { FighterView, Mind } from "../mind.ts";
import { EFFECTOR_NAMES, HAND_ACTION_NAMES, MOVEMENT_NAMES, STANCE_NAMES, TACTIC_VERSION, TARGET_NAMES,
  tacticEffectors, tacticTargets, type EffectorName, type HandActionName, type MovementName, type StanceName,
  type TargetName } from "../options.ts";
import { ResearchArtifact, type ResearchArtifactContract } from "./artifact.ts";
import { DAGGER_HEAD_NAMES, predictDagger, type DaggerLabel, type DaggerModel } from "./dagger.ts";
import { FEATURE_COLUMNS, FEATURE_VERSION } from "./features.ts";
import { lookaheadMind, LOOKAHEAD_DEPTH, LOOKAHEAD_WIDTH } from "./lookahead.ts";
import { META_OUTPUT_LAYOUT, UNLEARNED_PERSISTENCE, deployableActions, readMetaOutput,
  selectDeployableTactic } from "./meta.ts";
import { RecurrentNeatNetwork } from "./recurrent-neat.ts";
import { PPO_POLICY_HEADS } from "./ppo.ts";
import { RecurrentPolicy, maskedArgmax, type RecurrentPolicyWeights, type RecurrentStep } from "./recurrent-network.ts";
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
const indicesOf = <T extends string>(table: readonly T[], allowed: readonly T[]): Set<number> =>
  new Set(allowed.map((name) => table.indexOf(name)).filter((index) => index >= 0));

/** How one masked head answers: an index and the probability the sampler gave it. */
export type TacticHeadPick = (logits: readonly number[], supported: ReadonlySet<number>, label: string) =>
Readonly<{ index: number; probability: number }>;
export interface RecurrentTactic {
  readonly movement: MovementName; readonly action: HandActionName; readonly effector: EffectorName;
  readonly target: TargetName; readonly stance: StanceName;
  readonly indices: Readonly<Record<typeof PPO_POLICY_HEADS[number], number>>;
  readonly supported: Readonly<Record<typeof PPO_POLICY_HEADS[number], readonly number[]>>;
  readonly probabilities: Readonly<Record<typeof PPO_POLICY_HEADS[number], number>>;
}

/**
 * A recurrent policy's five heads read as one legal tactic, with the masks
 * **conditioned in contract order**.
 *
 * This is the shape PPO needs and `selectDeployableTactic`'s joint sum is not,
 * and the difference is about the algorithm rather than about taste. PPO's
 * policy is a product of five categorical conditionals: the importance ratio,
 * the entropy term and the clipped surrogate are all per head, so each head has
 * to be sampled from a distribution the update can *rebuild*. A joint argmax over
 * the legal tuples is a single categorical over a different support and would need
 * a different log-probability -- an algorithm change, not a decoding one. NEAT
 * writes a raw 26-vector with no log-probabilities at all, which is why it uses
 * the joint sum and this does not.
 *
 * **That sentence said "over 72 tuples" and 72 is not a count of anything here.**
 * It is `3 x 4 x 6`, the nominal per-action multiplier, which `dagger.ts` uses
 * correctly for "grew about seventy-twofold" and which is wrong as a width.
 * Measured over the whole body space -- every ordered weapon pair, both loss
 * flags on each hand, with and without a bite, plus the centipede --
 * `|deployableTactics|` peaks at **21**, on `sword+sword+bite`; the union over
 * every body is 33 and the union over the thirteen research cells is 24. So the
 * argmax this paragraph declines is at most 21 wide. The argument does not rest
 * on the number: a categorical over 21 joint outcomes still has a different
 * log-probability from a product of five conditionals, and it is that, not the
 * width, that makes it an algorithm change.
 *
 * **Legality is by construction rather than by refusal.** The action mask is
 * `deployableActions`, the effector mask is `tacticEffectors(view, action)` for
 * the action that was just chosen, and the aim mask is `tacticTargets(action)` --
 * which are precisely the three loops `deployableTactics` builds its set from, so
 * every triple this can answer is in that set. Conditioning on the *sampled*
 * action rather than on a marginal is also what makes the stored `supported`
 * lists correct for the update: PPO's ratio is evaluated at the old actions, so
 * the conditional the effector head is renormalized over must be the one it was
 * sampled under.
 *
 * The stance is unmasked. Every stance is legal on every body.
 */
export function recurrentTactic(view: FighterView, step: RecurrentStep, pick: TacticHeadPick): RecurrentTactic {
  const movement = pick(step.movementLogits, new Set(MOVEMENT_NAMES.map((_, index) => index)), "movement");
  const actionSupported = supportedActionIndices(view);
  const action = pick(step.actionLogits, actionSupported, "action");
  const actionName = HAND_ACTION_NAMES[action.index] as HandActionName;
  const effectorSupported = indicesOf(EFFECTOR_NAMES, tacticEffectors(view, actionName));
  const effector = pick(step.effectorLogits, effectorSupported, "effector");
  const targetSupported = indicesOf(TARGET_NAMES, tacticTargets(actionName));
  const target = pick(step.targetLogits, targetSupported, "target");
  const stanceSupported = new Set(STANCE_NAMES.map((_, index) => index));
  const stance = pick(step.stanceLogits, stanceSupported, "stance");
  const picks = { movement, action, effector, target, stance };
  const supported = { movement: [...MOVEMENT_NAMES.keys()], action: [...actionSupported],
    effector: [...effectorSupported], target: [...targetSupported], stance: [...stanceSupported] };
  return Object.freeze({
    movement: MOVEMENT_NAMES[movement.index] as MovementName, action: actionName,
    effector: EFFECTOR_NAMES[effector.index] as EffectorName, target: TARGET_NAMES[target.index] as TargetName,
    stance: STANCE_NAMES[stance.index] as StanceName,
    indices: Object.freeze(Object.fromEntries(PPO_POLICY_HEADS.map((name) => [name, picks[name].index]))) as RecurrentTactic["indices"],
    supported: Object.freeze(Object.fromEntries(PPO_POLICY_HEADS.map((name) => [name, Object.freeze(supported[name])]))) as RecurrentTactic["supported"],
    probabilities: Object.freeze(Object.fromEntries(PPO_POLICY_HEADS.map((name) => [name, picks[name].probability]))) as RecurrentTactic["probabilities"],
  });
}

/** The deterministic reader of the above: every head takes its largest legal logit. */
export const argmaxHeadPick: TacticHeadPick = (logits, supported, label) =>
  Object.freeze({ index: maskedArgmax(logits, supported, label), probability: 1 });

/** Decode the shared envelope before any algorithm-specific payload is trusted. */
export function decodeResearchArtifact(bytes: Uint8Array): ResearchArtifact {
  return ResearchArtifact.fromBytes(bytes, RESEARCH_ARTIFACT_CONTRACT);
}

/**
 * The sole deployment dispatcher used by the blind tournament and learned league
 * entries.
 *
 * **The hook's label is `DaggerLabel`, all six fields, from every one of the four
 * algorithms** -- and it was three for exactly one stage. The narrowing was a
 * statement about look-ahead rather than about the contract: `lookaheadMind`
 * declared its own hook over `{ movement, action, persistence }`, and a hook
 * demanding six fields cannot be handed to a producer that supplies three, because
 * function parameters are contravariant. Look-ahead decides four of the six itself
 * now and names the other two by constant (`UNLEARNED_STANCE`,
 * `UNLEARNED_PERSISTENCE`), so the intersection is the whole label.
 *
 * **It said that through a `DeployedDecisionLabel` alias, and the alias is gone.**
 * Once look-ahead widened it was `DaggerLabel` spelled twice with no importer, so
 * the assignment it was meant to guard could not fail and the contravariance
 * argument it carried was vacuous -- a name with no reader, which this directory
 * has a rule about. The argument survives here, where it is about a signature
 * somebody reads.
 *
 * Spelled as `DaggerLabel` and not a fresh literal because that is the record
 * `researchLabelMind`'s own hook takes, and two spellings of one label is how the
 * `.mjs` readers of `label.effector` -- which `tsconfig.json`'s `include` does not
 * cover -- would have gone unnoticed if a field moved. **Counted rather than
 * remembered, twice wrong before this**: `grep -ro "label\.effector" --include=*.mjs`
 * answers **nine occurrences on eight lines in four files** --
 * `scripts/research-havok.mjs`, `tests/dagger.test.mjs`, `tests/learning.test.mjs`
 * and `tests/lookahead.test.mjs`. Re-count it rather than quoting this.
 *
 * **The label is uniform across the four algorithms and the feature vector is
 * not.** Three of the four reach the hook through `researchLabelMind`, which passes
 * a real `FeatureWriter` vector; the look-ahead branch passes `[]`, because that
 * seam owns no writer. `lookaheadMind`'s own note carries it.
 */
export function deployedResearchMind(artifact: ResearchArtifact, bodyLoadout: string,
  onDecision?: (view: FighterView, features: readonly number[], label: DaggerLabel) => void): Mind {
  const decoded = recordObject(payloadJson(artifact), artifact.data.algorithm);
  if (artifact.data.algorithm === "dagger") {
    const model = decoded as unknown as DaggerModel;
    if (model.featureCount !== FEATURE_COLUMNS.length) throw new Error("dagger artifact has the wrong feature count");
    // All five heads, because all five decide something now. `exactNames` reads
    // `labels`, which is what a stale artifact gets wrong; `predictDagger`'s own
    // per-head size check is what catches an artifact whose labels are right and
    // whose matrix is short, and it is checked on the probe below rather than
    // only in a bout.
    const tables = { movement: MOVEMENT_NAMES, action: HAND_ACTION_NAMES, effector: EFFECTOR_NAMES,
      target: TARGET_NAMES, stance: STANCE_NAMES } as const;
    for (const name of DAGGER_HEAD_NAMES) exactNames(model[name]?.labels, tables[name], `dagger ${name}`);
    const probe = predictDagger(model, FEATURE_COLUMNS.map(() => 0));
    if (!MOVEMENT_NAMES.includes(probe.movement as never) || !HAND_ACTION_NAMES.includes(probe.action as never) ||
        !EFFECTOR_NAMES.includes(probe.effector as never) || !TARGET_NAMES.includes(probe.target as never) ||
        !STANCE_NAMES.includes(probe.stance as never) || !Number.isFinite(probe.persistence)) {
      throw new Error("dagger artifact produced an invalid deployment probe");
    }
    return researchLabelMind("dagger", (_view, features) => predictDagger(model, features), onDecision);
  }
  if (artifact.data.algorithm === "ppo") {
    const weights = decoded.weights as unknown as RecurrentPolicyWeights;
    const rows = { movement: MOVEMENT_NAMES.length, action: HAND_ACTION_NAMES.length, effector: EFFECTOR_NAMES.length,
      target: TARGET_NAMES.length, stance: STANCE_NAMES.length } as const;
    if (!weights || weights.inputSize !== FEATURE_COLUMNS.length ||
        PPO_POLICY_HEADS.some((name) => weights[name]?.rows !== rows[name])) {
      throw new Error("ppo artifact has the wrong recurrent feature/action shape");
    }
    const policy = new RecurrentPolicy(weights); policy.step(FEATURE_COLUMNS.map(() => 0)); policy.reset();
    const labeler: ResearchLabeler = (view, features) => {
      const tactic = recurrentTactic(view, policy.step(features), argmaxHeadPick);
      return { movement: tactic.movement, action: tactic.action, effector: tactic.effector,
        target: tactic.target, stance: tactic.stance, persistence: UNLEARNED_PERSISTENCE };
    };
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
    // The joint legal tuple, and this half of the seam moved in the same commit
    // as `neatLabeler` in `scripts/research-rollout-worker.mjs`. Moving one alone
    // is the training/deployment divergence stage C1 closed --
    // `the_training_decoder_and_the_deployment_decoder_answer_the_same_label`
    // was watched going red under exactly that before either side was touched.
    const labeler: ResearchLabeler = (view, features) => { const values = readMetaOutput(network.run(features));
      const movement = MOVEMENT_NAMES[maskedArgmax(values.movementLogits, new Set(MOVEMENT_NAMES.map((_, index) => index)), "movement")]!;
      const tactic = selectDeployableTactic(view, values);
      return { movement, action: tactic.action, effector: tactic.effector, target: tactic.target,
        stance: tactic.stance, persistence: values.persistence }; };
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
