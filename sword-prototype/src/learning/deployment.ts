import type { FighterView, Mind } from "../mind.ts";
import { EFFECTOR_NAMES, HAND_ACTION_NAMES, MOVEMENT_NAMES, STANCE_NAMES, TACTIC_VERSION, TARGET_NAMES,
  tacticEffectors, tacticTargets, type EffectorName, type HandActionName, type MovementName, type StanceName,
  type TargetName } from "../options.ts";
import { ResearchArtifact, type ResearchArtifactContract } from "./artifact.ts";
import { DAGGER_HEAD_NAMES, predictDagger, type DaggerLabel, type DaggerModel } from "./dagger.ts";
import { FEATURE_COLUMNS, FEATURE_VERSION } from "./features.ts";
import { lookaheadMind, LOOKAHEAD_DEPTH, LOOKAHEAD_WIDTH } from "./lookahead.ts";
import { META_OUTPUT_LAYOUT, deployableActions, readMetaOutput,
  selectDeployableTactic } from "./meta.ts";
import { PERSISTENCE_SECONDS, type PersistenceHead } from "./persistence.ts";
import type { StanceHead } from "./stance.ts";
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
/**
 * How wrong a cell's constant delta may be before the beam refuses to search it,
 * one number per column and **each in that column's own unit** -- and two for
 * the reach column, because `close` is not the same question as the other four.
 *
 * It was three copies of `0.25` measuring a signed distance in metres, a squared
 * probability and a fraction of a health bar. Two of the three could not fire at
 * all -- `TacticalCalibration` carries why -- and the third was four times above
 * anything ever observed. Every number here is read off the held-out
 * distribution of the schedule the gate judges, at the 8x budget where 772 of
 * 775 splits are real (`.review/calgate/p11-sweep2.mjs`, recomputed from its raw
 * ingredients at `.review/rem20/an1.mjs`; 1,190,400 solver steps, seed 310013).
 * **That was a 775-key, thirteen-cell schedule and the gate now judges 945 keys
 * over fifteen**, because `sword+axe` joined the strata. The limits are not
 * renumbered and must not be: they are quantiles of a measured distribution over
 * particular bouts, not a function of how many keys there were. What is owed is
 * a re-take covering `sword+axe`'s **170** new (cell, tactic) keys, 15 of which
 * spell a tactic no cell of the old schedule could --
 * `cut+secondary+{high,low,vital}` on each of the five movements. The loadout is
 * the only one whose `cut` names two hands, so those are a new *kind* of key
 * rather than more of the same, and no quantile here has seen one. That is a
 * compute decision: 1,451,520 solver steps at the 8x budget.
 * The record itself is checked in at `tests/fixtures/calibration-record.mjs` and
 * every claim below is computed from it by
 * `each_deployed_limit_is_bounded_by_what_it_does_to_the_measured_record`.
 *
 * **Two caveats first, because both were missing and both change what these
 * numbers mean.**
 *
 * This distribution is **not converged**, and this said it was. 384 solver steps
 * per job is a **1.6 second** bout, and 1.6 s is the *peak* of the reach-error
 * curve rather than its limit. On identical keys
 * (`.review/rem20/converge.mjs`), `warrior/sword+empty
 * close+thrust+primary+vital` reads 0.2906 at 0.8 s, 0.3133 at 1.6 s and
 * **0.1187** at 20 s; `centipede/natural:bite close+bite+natural+vital` reads
 * 0.3433 at 1.6 s against **0.1614** at 20 s. The three non-approach keys the
 * probe covers peak at 1.6 s too and fall by 1.2x to 1.5x rather than 2.6x. Every limit here is read
 * off a peak, which is the conservative direction for a bound and the wrong
 * direction for a quantile.
 *
 * And **no shipped budget reaches any of them.** At 148,800 solver steps -- the
 * schedule minimum then, 181,440 now -- every column of all 775 keys is exactly
 * zero; at 297,600 the reach column tops out at 0.114. Any reach limit from 0.12
 * upwards refuses nothing at either, so the reach number below is a decision
 * about budgets nobody currently runs. The "thirteen bodies lose their approach"
 * catastrophe is real, is a count of the bodies in *that* record rather than of
 * the strata, and belongs to the 4x and 8x budgets alone.
 *
 * | column | mean | p90 | p99 | max | limit | refuses at 8x |
 * | --- | ---: | ---: | ---: | ---: | ---: | ---: |
 * | `reachError`, the four ordinary movements | 0.1279 | 0.1444 | 0.1588 | 0.2259 | **0.20** | 1 / 620 |
 * | `approachReachError`, `close` | 0.2915 | 0.3268 | 0.3561 | 0.3594 | **0.35** | 2 / 155 |
 * | `contactRateError` | 0.0368 | 0.1333 | 0.2000 | 0.4667 | **0.25** | 5 / 775 |
 * | `vitalityDeltaError` | 0.0237 | 0.0492 | 0.0832 | 0.1012 | **0.10** | 1 / 775 |
 *
 * **Why the reach column is two numbers, which is the substantive change.** A
 * single scalar here cannot be a threshold on error, and the sentence this
 * docstring used to carry -- 0.30 "sits above the `close` mode and at twice the
 * other four, so it refuses outliers *within* each movement class instead of
 * removing one" -- is false. Measured composition of what a scalar refuses:
 *
 * | scalar | refused | composition | of `close` | of everything else |
 * | ---: | ---: | --- | ---: | ---: |
 * | 0.15 | 168 | close 155, circle-left 6, hold 4, circle-right 3 | 100 % | 2.1 % |
 * | 0.20 | 156 | close 155, circle-right 1 | 100 % | 0.2 % |
 * | 0.25 | 142 | close 142 | 92 % | 0 % |
 * | 0.30 | 66 | close 66 | 43 % | 0 % |
 * | 0.35 | 2 | close 2 | 1 % | 0 % |
 *
 * Non-`close` `reachError` maxes at **0.2259**, so every scalar from 0.23 to
 * 0.40 refuses zero non-`close` keys and the only thing that varies across
 * 0.25 -> 0.30 -> 0.35 is how much of `close` survives. 0.30 is the same
 * `close`-only threshold it condemned 0.15--0.20 for being, taken at a different
 * quantile: it sits at that mode's own median (p50 0.2934) and keeps 57 % of it,
 * and it costs `centipede/natural:bite` its approach outright.
 *
 * **The cause is structural, not a population of outliers.** `close` is the one
 * movement whose reach change *terminates* -- a fighter closing decelerates as
 * it arrives and stops when it contacts -- so the residual about the mean
 * closure is large by construction and shrinks with the bout window rather than
 * with the quality of the fit. `disengage` also moves the reach margin every
 * step and is the *best*-fitting movement of the five (0.0902), which is what
 * rules out "the reach changes" as the explanation. A single scalar therefore
 * has only two settings, remove approach planning or admit a mode the column
 * cannot judge, and no value fixes that. Three ways out were weighed:
 *
 * - **gate `close` on a different quantity.** Declined: there is nothing in a
 *   constant-delta record to gate it on that is not this residual, and inventing
 *   a statistic to make a threshold work is how the Brier got here.
 * - **leave `close` ungated on reach.** Declined: a cell whose approach model
 *   has gone wrong in kind -- a fitted delta that moves the wrong way -- would
 *   then be admitted, and the other two columns do not see it.
 * - **one limit per class**, which is what ships. The four movements a constant
 *   delta can describe get a real outlier threshold at **0.20**, which refuses
 *   exactly one key of 620 (a `circle-right` at 0.2259) and empties no class --
 *   0.15 would refuse 13, and 0.12 would take `circle-left`, `circle-right` and
 *   `hold` away entirely. `close` gets **0.35**, which refuses 2 of 155 and
 *   costs no body its approach, against 0.30 refusing 66 and costing the
 *   centipede all three of its.
 *
 * **Say the honest thing about what `approachReachError` is.** It is not an
 * outlier filter on model quality; it is a ceiling on how wrong an approach
 * prediction may be before planning on it is worse than not planning. A constant
 * delta cannot describe an approach, the record cannot tell a hard movement from
 * a bad fit, and 0.35 is therefore a bound on gross failure rather than a
 * standard. What it buys over a scalar is that it can no longer be tightened
 * "a little" and silently take approach planning away from every body at once.
 *
 * `contactRateError` at 0.25 is a probability, and it reads like the old number
 * by coincidence rather than by inheritance -- a different quantity on a
 * different scale, chosen a little above a p99 of 0.2000. A cell whose fitted
 * contact rate is within a quarter of the held-out rate is one the beam's
 * `attackLikelihood` can still rank; past that the 0.8 weight it carries points
 * the search at contact that does not happen.
 *
 * `vitalityDeltaError` at 0.10 is a tenth of a health bar per 0.10 s step, just
 * over a p99 of 0.0832 and under a max of 0.1012. It was the only column that
 * could ever fire and 0.25 was 35x the mean per-step vitality movement, which is
 * not a bound.
 */
export const LOOKAHEAD_CALIBRATION_LIMITS = Object.freeze({ reachError: 0.20, approachReachError: 0.35,
  contactRateError: 0.25, vitalityDeltaError: 0.10 });

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
  /**
   * Already in seconds, and already a member of `PERSISTENCE_SECONDS`.
   *
   * The five names above are decoded from their frozen tables here so that no
   * caller indexes one, and this is the same rule for the sixth head: a caller
   * holding `indices.persistence` and its own copy of the grid is a caller that
   * can disagree with the grid the sample was drawn from. `indices.persistence`
   * remains beside it because that -- and not the dwell -- is what the update's
   * categorical log-probability is taken at.
   */
  readonly persistenceSeconds: number;
  readonly indices: Readonly<Record<typeof PPO_POLICY_HEADS[number], number>>;
  readonly supported: Readonly<Record<typeof PPO_POLICY_HEADS[number], readonly number[]>>;
  readonly probabilities: Readonly<Record<typeof PPO_POLICY_HEADS[number], number>>;
}

/**
 * A recurrent policy's six heads read as one legal tactic and one dwell, with
 * the masks **conditioned in contract order**.
 *
 * This is the shape PPO needs and `selectDeployableTactic`'s joint sum is not,
 * and the difference is about the algorithm rather than about taste. PPO's
 * policy is a product of six categorical conditionals: the importance ratio,
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
 * flags on each hand, with and without a bite, plus the centipede, 393 bodies
 * (`.review/sa27/tuplespace.mjs`) -- `|deployableTactics|` peaks at **21**, on
 * `sword+sword+bite`; the union over every body is 33 and the union over the
 * fifteen research cells is **27**. So the argmax this paragraph declines is at
 * most 21 wide.
 *
 * **The cell union was 24 and the widest research cell was `sword+empty` at 16
 * until `sword+axe` joined the strata**, which added `cut+secondary+{high,
 * low,vital}` and nothing else, and made `sword+axe` the widest row at 17. The
 * whole-body figures did not move and could not have: that space already
 * contained every ordered weapon pair, `sword+axe` included. Re-measured on real
 * Havok as well as synthetically -- `.review/sa27/cells.mjs` accumulates the
 * published mask at every physics sample of 45 bouts and reaches the same 27. The argument does not rest
 * on the number: a categorical over 21 joint outcomes still has a different
 * log-probability from a product of per-head conditionals, and it is that, not the
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
 *
 * **So is the persistence, and for a different reason worth keeping separate.**
 * The stance is unmasked because every stance is legal on every body; the dwell
 * is unmasked because `PERSISTENCE_SECONDS` is inside `[MIN_PERSISTENCE,
 * MAX_PERSISTENCE]` by construction, so the clamp `researchLabelMind` applies to
 * a label cannot move a bin. Were a bin ever outside that window, this head
 * would go on reporting a log-probability for a dwell the runtime silently
 * replaced -- an importance ratio evaluated at an action that was not taken --
 * which is why the grid's endpoints are pinned to the window rather than merely
 * chosen inside it.
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
  const persistenceSupported = new Set(PERSISTENCE_SECONDS.map((_, index) => index));
  const persistence = pick(step.persistenceLogits, persistenceSupported, "persistence");
  const picks = { movement, action, effector, target, stance, persistence };
  const supported = { movement: [...MOVEMENT_NAMES.keys()], action: [...actionSupported],
    effector: [...effectorSupported], target: [...targetSupported], stance: [...stanceSupported],
    persistence: [...persistenceSupported] };
  return Object.freeze({
    movement: MOVEMENT_NAMES[movement.index] as MovementName, action: actionName,
    effector: EFFECTOR_NAMES[effector.index] as EffectorName, target: TARGET_NAMES[target.index] as TargetName,
    stance: STANCE_NAMES[stance.index] as StanceName,
    persistenceSeconds: PERSISTENCE_SECONDS[persistence.index] as number,
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

/** A complete controller that is reloadable during training but is not a promotion candidate. */
export function inProgressResearchArtifact(artifact: ResearchArtifact, runId: string): ResearchArtifact {
  if (!runId) throw new Error("an in-progress research artifact must name its run id");
  return new ResearchArtifact({ ...artifact.data,
    provenance: { ...artifact.data.provenance, status: "in-progress", runId } }, RESEARCH_ARTIFACT_CONTRACT);
}

/** The page may deploy this for a fight; policy/tournament registration may not. */
export function refuseInProgressResearchRegistration(artifact: ResearchArtifact): void {
  if (artifact.data.provenance.status === "in-progress") {
    throw new Error("in-progress research artifact cannot be registered as a policy or tournament candidate");
  }
}

export function requireLiveResearchBout(phase: "select" | "fight" | "over"): void {
  if (phase !== "fight") throw new Error(`research champion load refused during ${phase}; start or restart the bout first`);
}

export function decodeChampionSoFar(bytes: Uint8Array): ResearchArtifact {
  const artifact = decodeResearchArtifact(bytes);
  if (artifact.data.provenance.status !== "in-progress") {
    throw new Error("champion-so-far loader requires an in-progress research artifact");
  }
  return artifact;
}

export type ChampionSource = Blob | ArrayBuffer | Uint8Array;
export async function loadChampionSoFarMind(source: ChampionSource, bodyLoadout: string):
Promise<Readonly<{ artifact: ResearchArtifact; mind: Mind & PersistenceHead & StanceHead; digest: string }>> {
  const bytes = source instanceof Uint8Array ? source
    : source instanceof ArrayBuffer ? new Uint8Array(source) : new Uint8Array(await source.arrayBuffer());
  const artifact = decodeChampionSoFar(bytes);
  const digestInput = Uint8Array.from(bytes).buffer;
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", digestInput))]
    .map((value) => value.toString(16).padStart(2, "0")).join("");
  return Object.freeze({ artifact, mind: deployedResearchMind(artifact, bodyLoadout), digest });
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
  onDecision?: (view: FighterView, features: readonly number[], label: DaggerLabel) => void): Mind & PersistenceHead & StanceHead {
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
    // A continuous head declared at the width of the grid the record bins it
    // into, which is the honest reading of "how many dwells can it name": the
    // dwell is a sigmoid on `persistenceWeights`, so it reaches every bin and
    // lands on one only by accident. `PersistenceHead` in `learning/persistence.ts`
    // carries why this is declared here rather than inferred from a bout.
    return researchLabelMind("dagger", (_view, features) => predictDagger(model, features), onDecision,
      PERSISTENCE_SECONDS.length, STANCE_NAMES.length);
  }
  if (artifact.data.algorithm === "ppo") {
    const weights = decoded.weights as unknown as RecurrentPolicyWeights;
    // The sixth entry is `PERSISTENCE_SECONDS.length` and not a name table's,
    // which is the one place this shape guard stops reading like the other five.
    const rows = { movement: MOVEMENT_NAMES.length, action: HAND_ACTION_NAMES.length, effector: EFFECTOR_NAMES.length,
      target: TARGET_NAMES.length, stance: STANCE_NAMES.length, persistence: PERSISTENCE_SECONDS.length } as const;
    if (!weights || weights.inputSize !== FEATURE_COLUMNS.length ||
        PPO_POLICY_HEADS.some((name) => weights[name]?.rows !== rows[name])) {
      throw new Error("ppo artifact has the wrong recurrent feature/action shape");
    }
    const policy = new RecurrentPolicy(weights); policy.step(FEATURE_COLUMNS.map(() => 0)); policy.reset();
    const labeler: ResearchLabeler = (view, features) => {
      const tactic = recurrentTactic(view, policy.step(features), argmaxHeadPick);
      return { movement: tactic.movement, action: tactic.action, effector: tactic.effector,
        target: tactic.target, stance: tactic.stance, persistence: tactic.persistenceSeconds };
    };
    // **The head's own row count, off the decoded artifact** -- the one branch
    // where the dwell width is evidence rather than a claim. It is checked equal
    // to `PERSISTENCE_SECONDS.length` four lines up; reading it from the weights
    // anyway is what makes a future artifact with a narrower dwell head report
    // the width it actually has instead of the width this file expected.
    return researchLabelMind("ppo", labeler, onDecision, weights.persistence.rows, weights.stance.rows);
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
    // Continuous, like `dagger`: `decodeMetaPersistence` maps one trailing scalar
    // onto `[MIN_PERSISTENCE, MAX_PERSISTENCE]`, so the grid width is again how
    // many dwells this record can distinguish it naming.
    return researchLabelMind("neat-qd", labeler, onDecision, PERSISTENCE_SECONDS.length, STANCE_NAMES.length);
  }
  if (artifact.data.algorithm === "lookahead") {
    const model = decoded as unknown as TacticalModel;
    if (model.version !== TACTICAL_MODEL_VERSION) throw new Error(`lookahead artifact model version ${model.version} is unsupported`);
    exactNames(model.featureNames, TACTICAL_STATE_COLUMNS, "lookahead tactical feature");
    return lookaheadMind(model, bodyLoadout, LOOKAHEAD_CALIBRATION_LIMITS, LOOKAHEAD_DEPTH, LOOKAHEAD_WIDTH, onDecision);
  }
  throw new Error(`research artifact algorithm "${artifact.data.algorithm}" has no deployment runtime`);
}
