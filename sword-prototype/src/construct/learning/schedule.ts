import { canonicalIntegrityJson, integrityDigest, type IntegrityValue } from "../integrity.ts";
import { CONSTRUCT_LEARNING_CORPUS_DIGEST, CONSTRUCT_LEARNING_SPLIT } from "./corpus.ts";
import { combatValueToLegacyRewardWeight } from "../../config.ts";

export const CONSTRUCT_LEARNING_SCHEDULE_VERSION = 3 as const;
export type ConstructLearningStage = "authored" | "behavior-cloning" | "ppo" | "validation" | "held-out";

export interface ConstructStageMetrics {
  readonly morphologyCells: number;
  readonly deadMorphologyCells: number;
  readonly actionGroupsSeen: number;
  readonly unsupportedRate: number;
  readonly refusalRate: number;
  readonly finiteCommandRate: number;
  readonly lifecycleFailureCount: number;
  readonly stuckRate: number;
  readonly meanDamage: number;
  readonly timeCapRate: number;
  readonly imitationAgreement: number;
  readonly motorSaturationRate: number;
  readonly selfCollisionCount: number;
  readonly victoryRate: number;
}

export interface ConstructStageDecision {
  readonly decision: "advance" | "continue" | "kill";
  readonly reasons: readonly string[];
}

export const CONSTRUCT_LEARNING_PROTOCOL = Object.freeze({
  version: CONSTRUCT_LEARNING_SCHEDULE_VERSION,
  authoredQualification: Object.freeze({ seeds: Object.freeze([9, 17, 29, 43]), mirrored: true,
    requiredActions: Object.freeze(["move", "brace", "fire", "cover"]),
    separationM: 7,
    boutCapSteps: 14_400, bracket: Object.freeze(["control-1", "subject-2", "control-1", "subject-4",
      "control-1", "subject-8", "control-1", "subject-default", "control-1"]) }),
  durability: Object.freeze({ measuredOneWorkerShardUpperBoundSeconds: 40.411, maximumShardSeconds: 300,
    checkpointEveryUpdates: 8, maximumUpdatesPerSeed: 64 }),
  topology: Object.freeze({ rolloutWorkers: 8, concurrentSeeds: 1,
    reason: "eight workers used 8.72 aggregate CPU cores at 7.280 seconds; 32 requested workers ran the same eight live jobs and added no concurrency" }),
  validationSelection: Object.freeze({ seeds: Object.freeze([9, 17]), mirrors: Object.freeze([false, true]),
    candidates: Object.freeze(["bc-final", "ppo-final"]) }),
  heldOutTournament: Object.freeze({ seeds: Object.freeze([9, 17, 29, 43]), mirrors: Object.freeze([false, true]),
    competitors: Object.freeze(["selected", "prior-frozen", "authored"]) }),
  stageShards: Object.freeze({ "behavior-cloning": 8, ppo: 16, validation: 8, "held-out": 24 }),
  plateau: Object.freeze({ windowUpdates: 32, minimumImprovement: 0.005 }),
  thresholds: Object.freeze({ imitationAgreement: 0.95, maximumUnsupportedRate: 0,
    maximumRefusalRate: 0.005, minimumFiniteCommandRate: 1, maximumStuckRate: 0.1,
    maximumTimeCapRate: 0.5, minimumActionGroupsSeen: 2, minimumDamage: 0.0005 }),
  morphologySplit: Object.freeze({ train: CONSTRUCT_LEARNING_SPLIT.train,
    validation: CONSTRUCT_LEARNING_SPLIT.validation, test: CONSTRUCT_LEARNING_SPLIT.test,
    sealed: true, digest: CONSTRUCT_LEARNING_CORPUS_DIGEST,
    reason: "frozen before policy rollout; train varies limb count, mount, mass distribution and authored opponent" }),
});

export const CONSTRUCT_LEARNING_SCHEDULE = Object.freeze({
  ...CONSTRUCT_LEARNING_PROTOCOL,
  entryGate: Object.freeze({
    qualified: false,
    evidence: "construct-entry-run-97a634ab-source-f82bc3d3-2026-09-01",
    runDigest: "97a634ab",
    sourceDigest: "f82bc3d3",
    runtimeStatus: "current combat-value-v2 assisted Warden runtime; qualification rejected",
    reason: "1/8 bilateral physical-damage rows; 7/8 rows missing brace and fire; 8/8 bouts reached the time cap",
  }),
});

export const CONSTRUCT_LEARNING_SCHEDULE_DIGEST = integrityDigest(
  canonicalIntegrityJson(CONSTRUCT_LEARNING_PROTOCOL as unknown as IntegrityValue),
);

export function evaluateConstructLearningStage(
  stage: ConstructLearningStage,
  metrics: ConstructStageMetrics,
): ConstructStageDecision {
  const T = CONSTRUCT_LEARNING_SCHEDULE.thresholds;
  const reasons: string[] = [];
  if (metrics.morphologyCells <= 0) reasons.push("no morphology cells were measured");
  if (metrics.deadMorphologyCells > 0) reasons.push(`${metrics.deadMorphologyCells} morphology cell(s) are dead`);
  if (metrics.lifecycleFailureCount > 0) reasons.push(`${metrics.lifecycleFailureCount} lifecycle failure(s)`);
  if (metrics.finiteCommandRate < T.minimumFiniteCommandRate) reasons.push("a command was non-finite");
  if (metrics.unsupportedRate > T.maximumUnsupportedRate) reasons.push("unsupported action rate exceeds zero");
  if (metrics.selfCollisionCount > 0) reasons.push("self-collision was observed");
  if (metrics.motorSaturationRate > 0.5) reasons.push("motor saturation rate exceeds 0.5");
  if (metrics.refusalRate > T.maximumRefusalRate) reasons.push("scheduler refusal rate is too high");
  if (metrics.actionGroupsSeen < T.minimumActionGroupsSeen) reasons.push("action diversity is below the frozen minimum");
  if (stage === "behavior-cloning" && metrics.imitationAgreement < T.imitationAgreement) {
    reasons.push("behavior cloning agreement is below the frozen threshold");
  }
  if (stage === "ppo" || stage === "validation" || stage === "held-out") {
    if (metrics.stuckRate > T.maximumStuckRate) reasons.push("stuck-action rate is too high");
    if (metrics.timeCapRate > T.maximumTimeCapRate) reasons.push("time-cap rate is too high");
    if (metrics.meanDamage < T.minimumDamage) reasons.push("damage is below the engagement floor");
  }
  return Object.freeze({ decision: reasons.length > 0 ? "kill" : "advance", reasons: Object.freeze(reasons) });
}

/** A passive time cap is always worse than a damaging loss; survival itself earns nothing. */
export function constructEngagementReward(input: Readonly<{
  victory: boolean;
  draw: boolean;
  timeCap: boolean;
  damageDealt: number;
  damageTaken: number;
}>): number {
  if (![input.damageDealt, input.damageTaken].every(Number.isFinite) || input.damageDealt < 0 || input.damageTaken < 0) {
    throw new Error("construct reward damage must be finite and non-negative");
  }
  return (input.victory ? 100 : 0) + combatValueToLegacyRewardWeight(input.damageDealt) -
    combatValueToLegacyRewardWeight(input.damageTaken) * 0.25 -
    (input.draw ? 10 : 0) - (input.timeCap ? 25 : 0);
}
