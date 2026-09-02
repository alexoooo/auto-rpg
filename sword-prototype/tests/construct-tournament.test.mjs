import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { initializeConstructNetwork } from "../src/construct/learning/network.ts";
import { CONSTRUCT_LEARNING_SCHEDULE_DIGEST } from "../src/construct/learning/schedule.ts";
import { recomputeConstructTournamentVerdict, selectConstructValidationCandidate } from
  "../src/construct/learning/ladder.ts";
import { productionConstructTrainerConfig, runConstructTrainer, smokeConstructShard,
  smokeConstructTrainerConfig } from "../scripts/train-construct.mjs";

const row = (candidate, split, morphology, score, overrides = {}) => Object.freeze({
  candidate, split, morphology, score, stage: split === "test" ? "held-out" : "ppo",
  morphologyCells: 1, deadMorphologyCells: 0, actionGroupsSeen: 2, unsupportedRate: 0,
  refusalRate: 0, finiteCommandRate: 1, lifecycleFailureCount: 0, stuckRate: 0,
  meanDamage: 1, timeCapRate: 0, imitationAgreement: 1, motorSaturationRate: 0,
  selfCollisionCount: 0, victoryRate: 0, ...overrides,
});

const wiredTournamentConfig = () => {
  const stages = ["behavior-cloning", "ppo", "validation", "validation", "held-out", "held-out", "held-out"];
  const candidates = ["evolving", "evolving", "bc-final", "ppo-final", "selected", "prior-frozen", "authored"];
  const base = smokeConstructTrainerConfig();
  return Object.freeze({ ...base, mode: "production", enforceStageGates: true, entryQualified: true,
    scheduleDigest: CONSTRUCT_LEARNING_SCHEDULE_DIGEST,
    qualificationProtocolDigest: CONSTRUCT_LEARNING_SCHEDULE_DIGEST, qualificationSourceDigest: "test-source",
    totalShards: stages.length, shardsPerUpdate: 1,
    jobSpecs: Object.freeze(stages.map((stage, index) => Object.freeze({ stage,
      morphology: stage === "held-out" ? "held-cell" : stage === "validation" ? "validation-cell" : `cell-${index}`,
      opponent: "crossbow-standard", mirrored: false, steps: 1, candidate: candidates[index],
      ...(stage === "held-out" ? { scenarioKey: "held-cell", scenarioSeed: 9 } :
        stage === "validation" ? { scenarioKey: "validation-cell", scenarioSeed: 9 } : {}),
      controller: candidates[index] === "authored" ? "authored" : "policy" }))) });
};

const runSyntheticTournament = async (runDirectory, mutateMetrics = () => ({})) => runConstructTrainer({
  runDirectory, config: wiredTournamentConfig(), workerCount: 2,
  qualificationSourceFingerprint: async () => "test-source",
  runShardBundle: async (jobs, _weights, _workers, commit) => {
    for (const job of jobs) {
      const value = smokeConstructShard(job);
      await commit(job.index, Object.freeze({ ...value,
        metrics: Object.freeze({ ...value.metrics, ...mutateMetrics(job) }) }));
    }
  },
});

test("validation_selects_without_reading_any_test_row", () => {
  const candidates = [{ id: "candidate-a", weights: initializeConstructNetwork(1) }];
  assert.throws(() => selectConstructValidationCandidate(candidates, [
    row("candidate-a", "validation", "four-limb", 1),
    row("candidate-a", "test", "sealed-six-limb", 1000),
  ]), /cannot read test row/);
});

test("a_candidate_with_a_dead_morphology_or_action_group_cannot_win_on_mean_score", () => {
  const candidates = [
    { id: "unsafe", weights: initializeConstructNetwork(1) },
    { id: "qualified", weights: initializeConstructNetwork(2) },
  ];
  const selected = selectConstructValidationCandidate(candidates, [
    row("unsafe", "validation", "dead-four", 100, { deadMorphologyCells: 1 }),
    row("unsafe", "validation", "no-attack", 100, { actionGroupsSeen: 1 }),
    row("qualified", "validation", "four", 2),
    row("qualified", "validation", "six", 1),
  ]);
  assert.equal(selected.id, "qualified");
  assert.equal(selected.validationScore, 1);
});

test("the_tournament_recomputes_its_verdict_from_raw_rows_and_frozen_thresholds", () => {
  const losing = [row("frozen", "test", "four", 0.8), row("frozen", "test", "asymmetric", 0.4)];
  const failed = recomputeConstructTournamentVerdict("frozen", losing, 0.5);
  assert.equal(failed.pass, false);
  assert.equal(failed.worstMorphologyScore, 0.4);
  assert.match(failed.reasons.join("; "), /worst held-out morphology score/);
  const passed = recomputeConstructTournamentVerdict("frozen",
    [losing[0], row("frozen", "test", "asymmetric", 0.6)], 0.5);
  assert.equal(passed.pass, true);
});

test("no_passing_candidate_writes_no_promoted_artifact", async () => {
  const runDirectory = await mkdtemp(join(tmpdir(), "construct-negative-"));
  try {
    const config = productionConstructTrainerConfig();
    assert.equal(config.entryQualified, false);
    assert.equal(config.qualificationSourceDigest, "f82bc3d3");
    assert.equal(config.qualificationProtocolDigest, "8253502c");
    assert.equal(config.entryReason,
      "1/8 bilateral physical-damage rows; 7/8 rows missing brace and fire; 8/8 bouts reached the time cap");
    let shards = 0;
    const result = await runConstructTrainer({ runDirectory, config, runShard: (job) => {
      shards += 1;
      return smokeConstructShard(job);
    } });
    assert.equal(result.status, "rejected");
    assert.equal(result.promotedArtifact, null);
    assert.equal(result.completedShards, 0);
    assert.equal(result.reason, config.entryReason);
    assert.equal(shards, 0);
    assert.equal(JSON.parse(await readFile(join(runDirectory, "construct-learning-result.json"), "utf8")).promotedArtifact, null);
  } finally { await rm(runDirectory, { recursive: true, force: true }); }
});

test("production_path_freezes_validation_selection_and_recomputes_a_three_competitor_tournament_manifest", async () => {
  const runDirectory = await mkdtemp(join(tmpdir(), "construct-wired-tournament-"));
  try {
    const result = await runSyntheticTournament(runDirectory);
    assert.equal(result.status, "promoted");
    const manifest = JSON.parse(await readFile(join(runDirectory, "construct-tournament-manifest.json"), "utf8"));
    assert.deepEqual(manifest.competitors, [manifest.selected, "authored", "prior-frozen"]);
    assert.deepEqual(new Set(manifest.rows.map(({ candidate }) => candidate)),
      new Set(["selected", "prior-frozen", "authored"]));
    assert.equal(manifest.verdict.pass, true);
  } finally { await rm(runDirectory, { recursive: true, force: true }); }
});

test("bad_nonselected_validation_and_baseline_rows_do_not_veto_the_selected_candidate", async () => {
  const runDirectory = await mkdtemp(join(tmpdir(), "construct-candidate-gates-"));
  try {
    const result = await runSyntheticTournament(runDirectory, (job) => {
      if (job.spec.stage === "validation" && job.spec.candidate === "bc-final") {
        return { lifecycleFailureCount: 1, score: -1 };
      }
      if (job.spec.stage === "held-out" && job.spec.candidate !== "selected") {
        return { lifecycleFailureCount: 1, score: 0 };
      }
      return job.spec.stage === "validation" || job.spec.stage === "held-out" ? { score: 1 } : {};
    });
    assert.equal(result.status, "promoted");
    assert.equal(result.gates.validation.decision, "advance");
    assert.equal(result.gates["held-out"].decision, "advance");
  } finally { await rm(runDirectory, { recursive: true, force: true }); }
});

test("a_bad_selected_held_out_row_vetoes_promotion", async () => {
  const runDirectory = await mkdtemp(join(tmpdir(), "construct-selected-gate-"));
  try {
    const result = await runSyntheticTournament(runDirectory, (job) =>
      job.spec.stage === "held-out" && job.spec.candidate === "selected"
        ? { lifecycleFailureCount: 1, score: 1 }
        : job.spec.stage === "held-out" ? { score: 0 } : { score: 1 });
    assert.equal(result.status, "rejected");
    assert.equal(result.gates["held-out"].decision, "kill");
    assert.match(result.reason, /lifecycle failure/);
  } finally { await rm(runDirectory, { recursive: true, force: true }); }
});

test("held_out_specs_pair_every_competitor_on_identical_declared_scenario_cells", () => {
  const held = productionConstructTrainerConfig().jobSpecs.filter(({ stage }) => stage === "held-out");
  const grouped = Map.groupBy(held, ({ scenarioKey }) => scenarioKey);
  assert.equal(grouped.size, 8);
  for (const [scenarioKey, rows] of grouped) {
    assert.match(scenarioKey, /^test-0\/opponent-[0-3]\/seed-(9|17|29|43)\/mirror-[01]$/);
    assert.deepEqual(rows.map(({ candidate }) => candidate).sort(), ["authored", "prior-frozen", "selected"]);
    assert.equal(new Set(rows.map(({ morphologySlot }) => morphologySlot)).size, 1);
    assert.equal(new Set(rows.map(({ opponentSlot }) => opponentSlot)).size, 1);
    assert.equal(new Set(rows.map(({ scenarioSeed }) => scenarioSeed)).size, 1);
    assert.equal(new Set(rows.map(({ mirrored }) => mirrored)).size, 1);
  }
});

test("validation_specs_pair_both_frozen_candidates_on_identical_scenario_cells", () => {
  const validation = productionConstructTrainerConfig().jobSpecs.filter(({ stage }) => stage === "validation");
  const grouped = Map.groupBy(validation, ({ scenarioKey }) => scenarioKey);
  assert.equal(grouped.size, 4);
  for (const rows of grouped.values()) {
    assert.deepEqual(rows.map(({ candidate }) => candidate).sort(), ["bc-final", "ppo-final"]);
    for (const field of ["morphologySlot", "opponentSlot", "scenarioSeed", "mirrored"]) {
      assert.equal(new Set(rows.map((row) => row[field])).size, 1, `${field} must be paired`);
    }
  }
});

test("unpaired_validation_coverage_refuses_before_candidate_selection", async () => {
  const runDirectory = await mkdtemp(join(tmpdir(), "construct-unpaired-validation-"));
  try {
    const base = wiredTournamentConfig();
    const jobSpecs = base.jobSpecs.map((spec) => spec.stage === "validation" ?
      Object.freeze({ ...spec, candidate: "bc-final" }) : spec);
    let heldOutStarted = false;
    await assert.rejects(runConstructTrainer({ runDirectory,
      config: Object.freeze({ ...base, jobSpecs: Object.freeze(jobSpecs) }),
      qualificationSourceFingerprint: async () => "test-source",
      runShardBundle: async (jobs, _weights, _workers, commit) => {
        for (const job of jobs) {
          if (job.spec.stage === "held-out") heldOutStarted = true;
          await commit(job.index, smokeConstructShard(job));
        }
      } }), /does not contain exactly one (?:bc-final|ppo-final) row/);
    assert.equal(heldOutStarted, false);
  } finally { await rm(runDirectory, { recursive: true, force: true }); }
});

test("a_stale_qualified_source_fingerprint_starts_zero_rollouts_and_promotes_nothing", async () => {
  const runDirectory = await mkdtemp(join(tmpdir(), "construct-stale-qualified-source-"));
  let bundles = 0;
  try {
    const result = await runConstructTrainer({ runDirectory, config: wiredTournamentConfig(),
      qualificationSourceFingerprint: async () => "changed-source", runShardBundle: async () => { bundles += 1; } });
    assert.equal(result.status, "rejected");
    assert.equal(result.promotedArtifact, null);
    assert.equal(result.completedShards, 0);
    assert.equal(bundles, 0);
    assert.match(result.reason, /source\/environment fingerprint is stale/);
  } finally { await rm(runDirectory, { recursive: true, force: true }); }
});

test("terminal_recovery_rechecks_the_live_entry_gate_before_returning_an_old_promotion", async () => {
  const runDirectory = await mkdtemp(join(tmpdir(), "construct-terminal-gate-"));
  try {
    assert.equal((await runSyntheticTournament(runDirectory)).status, "promoted");
    let bundles = 0;
    const rejected = await runConstructTrainer({ runDirectory,
      config: Object.freeze({ ...wiredTournamentConfig(), entryQualified: false, entryReason: "fresh gate is closed" }),
      qualificationSourceFingerprint: async () => "test-source",
      runShardBundle: async () => { bundles += 1; } });
    assert.equal(rejected.status, "rejected");
    assert.equal(rejected.promotedArtifact, null);
    assert.equal(rejected.recovered, undefined);
    assert.equal(bundles, 0);
  } finally { await rm(runDirectory, { recursive: true, force: true }); }
});

test("terminal_recovery_rechecks_the_source_fingerprint_before_returning_an_old_promotion", async () => {
  const runDirectory = await mkdtemp(join(tmpdir(), "construct-terminal-source-"));
  try {
    assert.equal((await runSyntheticTournament(runDirectory)).status, "promoted");
    let bundles = 0;
    const rejected = await runConstructTrainer({ runDirectory, config: wiredTournamentConfig(),
      qualificationSourceFingerprint: async () => "changed-after-promotion",
      runShardBundle: async () => { bundles += 1; } });
    assert.equal(rejected.status, "rejected");
    assert.equal(rejected.promotedArtifact, null);
    assert.equal(rejected.recovered, undefined);
    assert.equal(bundles, 0);
    assert.match(rejected.reason, /source\/environment fingerprint is stale/);
  } finally { await rm(runDirectory, { recursive: true, force: true }); }
});

test("terminal_recovery_refuses_forged_schema_and_tampered_promoted_bytes", async () => {
  const runDirectory = await mkdtemp(join(tmpdir(), "construct-terminal-forgery-"));
  try {
    assert.equal((await runSyntheticTournament(runDirectory)).status, "promoted");
    const resultPath = join(runDirectory, "construct-learning-result.json");
    const terminal = JSON.parse(await readFile(resultPath, "utf8"));
    terminal.untrusted = true;
    await writeFile(resultPath, JSON.stringify(terminal));
    await assert.rejects(runConstructTrainer({ runDirectory, config: wiredTournamentConfig(),
      qualificationSourceFingerprint: async () => "test-source", runShardBundle: async () => {} }),
    /terminal schema or qualification identity is stale/);
    delete terminal.untrusted;
    await writeFile(resultPath, JSON.stringify(terminal));
    const artifactPath = join(runDirectory, "promoted-construct-policy.json");
    const artifact = JSON.parse(await readFile(artifactPath, "utf8")); artifact.weights.values[0] += 1;
    await writeFile(artifactPath, JSON.stringify(artifact));
    await assert.rejects(runConstructTrainer({ runDirectory, config: wiredTournamentConfig(),
      qualificationSourceFingerprint: async () => "test-source", runShardBundle: async () => {} }),
    /artifact or manifest digest changed/);
  } finally { await rm(runDirectory, { recursive: true, force: true }); }
});

test("coupled_promoted_terminal_artifact_and_boundary_forgery_refuses_against_committed_updates", async () => {
  const runDirectory = await mkdtemp(join(tmpdir(), "construct-terminal-coupled-forgery-"));
  try {
    assert.equal((await runSyntheticTournament(runDirectory)).status, "promoted");
    const terminalPath = join(runDirectory, "construct-learning-result.json");
    const artifactPath = join(runDirectory, "promoted-construct-policy.json");
    const terminal = JSON.parse(await readFile(terminalPath, "utf8"));
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
    const candidatePath = join(runDirectory, `candidate-${artifact.candidate}.json`);
    const boundaryPath = join(runDirectory, `candidate-boundary-${artifact.candidate}.json`);
    const candidate = JSON.parse(await readFile(candidatePath, "utf8"));
    const boundary = JSON.parse(await readFile(boundaryPath, "utf8"));
    const { canonicalIntegrityJson, integrityDigest } = await import("../src/construct/integrity.ts");
    const { constructCheckpointDigest } = await import("../src/construct/learning/checkpoint.ts");
    const forged = artifact.weights.values[0] + 1;
    artifact.weights.values[0] = forged;
    candidate.weights.values[0] = forged;
    boundary.checkpoint.weights.values[0] = forged;
    const forgedWeightsDigest = integrityDigest(canonicalIntegrityJson(artifact.weights));
    const forgedBoundaryDigest = constructCheckpointDigest(boundary.checkpoint);
    artifact.candidateWeightsDigest = forgedWeightsDigest;
    artifact.candidateOrigin.checkpointDigest = forgedBoundaryDigest;
    candidate.weightsDigest = forgedWeightsDigest;
    candidate.origin.checkpointDigest = forgedBoundaryDigest;
    boundary.weightsDigest = forgedWeightsDigest;
    boundary.checkpointDigest = forgedBoundaryDigest;
    await writeFile(candidatePath, canonicalIntegrityJson(candidate));
    await writeFile(boundaryPath, canonicalIntegrityJson(boundary));
    const artifactText = canonicalIntegrityJson(artifact);
    await writeFile(artifactPath, artifactText);
    terminal.artifactDigest = integrityDigest(artifactText);
    await writeFile(terminalPath, canonicalIntegrityJson(terminal));
    let bundles = 0;
    await assert.rejects(runConstructTrainer({ runDirectory, config: wiredTournamentConfig(),
      qualificationSourceFingerprint: async () => "test-source",
      runShardBundle: async () => { bundles += 1; } }), /candidate\/checkpoint provenance is stale/);
    assert.equal(bundles, 0);
  } finally { await rm(runDirectory, { recursive: true, force: true }); }
});

test("a_renamed_or_tampered_frozen_candidate_refuses_before_the_next_rollout", async () => {
  const runDirectory = await mkdtemp(join(tmpdir(), "construct-tampered-candidate-"));
  const config = wiredTournamentConfig();
  const bundle = async (jobs, _weights, _workers, commit) => {
    for (const job of jobs) await commit(job.index, smokeConstructShard(job));
  };
  try {
    const interrupted = await runConstructTrainer({ runDirectory, config, stopAfterShards: 1,
      qualificationSourceFingerprint: async () => "test-source", runShardBundle: bundle });
    assert.equal(interrupted.status, "interrupted");
    const path = join(runDirectory, "candidate-bc-final.json");
    const candidate = JSON.parse(await readFile(path, "utf8")); candidate.id = "renamed-candidate";
    await writeFile(path, JSON.stringify(candidate));
    let nextBundles = 0;
    await assert.rejects(runConstructTrainer({ runDirectory, config,
      qualificationSourceFingerprint: async () => "test-source",
      runShardBundle: async (...args) => { nextBundles += 1; return bundle(...args); } }), /candidate bc-final is invalid or stale/);
    assert.equal(nextBundles, 0);
  } finally { await rm(runDirectory, { recursive: true, force: true }); }
});

test("a_self_consistent_forged_candidate_still_refuses_against_the_boundary_checkpoint", async () => {
  const runDirectory = await mkdtemp(join(tmpdir(), "construct-forged-candidate-"));
  const config = wiredTournamentConfig();
  const bundle = async (jobs, _weights, _workers, commit) => {
    for (const job of jobs) await commit(job.index, smokeConstructShard(job));
  };
  try {
    await runConstructTrainer({ runDirectory, config, stopAfterShards: 1,
      qualificationSourceFingerprint: async () => "test-source", runShardBundle: bundle });
    const path = join(runDirectory, "candidate-bc-final.json");
    const candidate = JSON.parse(await readFile(path, "utf8"));
    candidate.weights.values[0] += 1;
    const { canonicalIntegrityJson, integrityDigest } = await import("../src/construct/integrity.ts");
    candidate.weightsDigest = integrityDigest(canonicalIntegrityJson(candidate.weights));
    await writeFile(path, JSON.stringify(candidate));
    let bundles = 0;
    await assert.rejects(runConstructTrainer({ runDirectory, config,
      qualificationSourceFingerprint: async () => "test-source",
      runShardBundle: async (...args) => { bundles += 1; return bundle(...args); } }), /candidate bc-final is invalid or stale/);
    assert.equal(bundles, 0);
  } finally { await rm(runDirectory, { recursive: true, force: true }); }
});

test("coupled_candidate_and_boundary_checkpoint_forgery_refuses_against_committed_indexed_updates", async () => {
  const runDirectory = await mkdtemp(join(tmpdir(), "construct-coupled-candidate-forgery-"));
  const config = wiredTournamentConfig();
  const bundle = async (jobs, _weights, _workers, commit) => {
    for (const job of jobs) await commit(job.index, smokeConstructShard(job));
  };
  try {
    await runConstructTrainer({ runDirectory, config, stopAfterShards: 1,
      qualificationSourceFingerprint: async () => "test-source", runShardBundle: bundle });
    const candidatePath = join(runDirectory, "candidate-bc-final.json");
    const boundaryPath = join(runDirectory, "candidate-boundary-bc-final.json");
    const candidate = JSON.parse(await readFile(candidatePath, "utf8"));
    const boundary = JSON.parse(await readFile(boundaryPath, "utf8"));
    candidate.weights.values[0] += 1;
    boundary.checkpoint.weights.values[0] = candidate.weights.values[0];
    const { canonicalIntegrityJson, integrityDigest } = await import("../src/construct/integrity.ts");
    const { constructCheckpointDigest } = await import("../src/construct/learning/checkpoint.ts");
    candidate.weightsDigest = integrityDigest(canonicalIntegrityJson(candidate.weights));
    boundary.weightsDigest = candidate.weightsDigest;
    boundary.checkpointDigest = constructCheckpointDigest(boundary.checkpoint);
    candidate.origin.checkpointDigest = boundary.checkpointDigest;
    await writeFile(candidatePath, JSON.stringify(candidate));
    await writeFile(boundaryPath, JSON.stringify(boundary));
    let bundles = 0;
    await assert.rejects(runConstructTrainer({ runDirectory, config,
      qualificationSourceFingerprint: async () => "test-source",
      runShardBundle: async (...args) => { bundles += 1; return bundle(...args); } }),
    /candidate bc-final boundary is invalid or stale/);
    assert.equal(bundles, 0);
  } finally { await rm(runDirectory, { recursive: true, force: true }); }
});
