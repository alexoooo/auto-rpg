import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { combatValueToLegacyRewardWeight } from "../src/config.ts";

import { ActionScheduler } from "../src/construct/scheduler.ts";
import { CONSTRUCT_GRAPH_CONTRACT_DIGEST } from "../src/construct/learning/contract.ts";
import { decodeConstructCheckpoint, encodeConstructCheckpoint, firstMissingConstructShard,
  assertConstructCheckpointIdentity } from "../src/construct/learning/checkpoint.ts";
import { CONSTRUCT_EMBEDDING_WIDTH, CONSTRUCT_NETWORK_WEIGHT_COUNT, CONSTRUCT_MESSAGE_ROUNDS,
  CONSTRUCT_NODE_FEATURE_WIDTHS, initializeConstructNetwork } from
  "../src/construct/learning/network.ts";
import { bernoulliLogProbability, constructPolicyDecisionDigest, decideConstructPolicy,
  FROZEN_CONSTRUCT_INFERENCE_DIGEST, scoreConstructPolicyCommand } from
  "../src/construct/learning/policy.ts";
import { boundedParameterLogProbability, categoricalLogProbability, constructIndexedJobs, constructSetLogProbability, executeConstructJobs, fixedStepReturns,
  reduceConstructUpdates, resumeConstructJobs } from "../src/construct/learning/ppo.ts";
import { ConstructTeacherRecorder, constructTeacherDigest } from "../src/construct/learning/teacher.ts";
import { CONSTRUCT_LEARNING_PROTOCOL, CONSTRUCT_LEARNING_SCHEDULE, CONSTRUCT_LEARNING_SCHEDULE_DIGEST,
  constructEngagementReward } from "../src/construct/learning/schedule.ts";
import { readCurrentConstructCheckpointBundle } from "../scripts/construct-checkpoint-bundle.mjs";
import { advanceConstructBundle, constructProductionRunConfigDigest, productionConstructTrainerConfig, runConstructTrainer, runPhysicalConstructShardBundle,
  smokeConstructShard, smokeConstructTrainerConfig } from "../scripts/train-construct.mjs";
import { constructPpoLoss } from "../src/construct/learning/rollout.ts";
import { runConstructRolloutJob } from "../scripts/construct-rollout-engine.mjs";
import { constructLearningCorpusDigest, constructLearningMaterializationOrder, constructLearningMorphologies,
  constructLearningMorphology, CONSTRUCT_LEARNING_SPLIT } from
  "../src/construct/learning/corpus.ts";
import { authoredQualificationActionFailures, authoredQualificationCapabilityFailures,
  assertConstructQualificationExpectation, parseConstructQualificationArgs,
  constructQualificationSourceFingerprint,
  constructQualificationSourcePaths, runConstructQualificationCli } from
  "../scripts/qualify-construct-learning-entry.mjs";

const control = Object.freeze({ version: 1, groups: Object.freeze([
  Object.freeze({ id: "body", joints: Object.freeze([]), modules: Object.freeze([]), bindings: Object.freeze({}) }),
]), actions: Object.freeze([
  Object.freeze({ id: "alpha", controller: "alpha-controller", group: "body",
    claims: Object.freeze(["resource:shared"]), parameters: Object.freeze({
      amount: Object.freeze({ kind: "number", min: -2, max: 2, unit: "scalar" }),
      enabled: Object.freeze({ kind: "boolean" }),
      mode: Object.freeze({ kind: "enum", values: Object.freeze(["low", "high"]) }),
    }) }),
  Object.freeze({ id: "beta", controller: "beta-controller", group: "body",
    claims: Object.freeze(["resource:shared"]), parameters: Object.freeze({}) }),
  Object.freeze({ id: "gamma", controller: "gamma-controller", group: "body",
    claims: Object.freeze(["resource:other"]), parameters: Object.freeze({}) }),
]) });

const capabilities = Object.freeze(control.actions.map((action) => Object.freeze({ action: action.id, group: action.group,
  available: true, reason: null, parameterBounds: Object.freeze(action.id === "alpha" ? { amount: Object.freeze([-2, 2]) } : {}) })));

const graph = (limbs = 4) => Object.freeze({ version: 2, nodes: Object.freeze([
  ...Array.from({ length: limbs }, (_, index) => Object.freeze({ type: "part", id: `limb-${index}`,
    features: Object.freeze([1, 1, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0]) })),
  Object.freeze({ type: "sensor", id: "opponent-range", features: Object.freeze([1, 3, 0, 0, 1]) }),
  Object.freeze({ type: "group", id: "body", features: Object.freeze([0, 0]) }),
  Object.freeze({ type: "action", id: "alpha", features: Object.freeze([1, 0, 0]) }),
  Object.freeze({ type: "action", id: "beta", features: Object.freeze([1, 0, 0]) }),
  Object.freeze({ type: "action", id: "gamma", features: Object.freeze([1, 0, 0]) }),
]), edges: Object.freeze([]) });

const identity = Object.freeze({ graphDigest: CONSTRUCT_GRAPH_CONTRACT_DIGEST, actionDigest: "11111111",
  programDigest: "22222222", teacherDigest: "33333333", configDigest: "44444444" });
const checkpoint = (weights = initializeConstructNetwork(71)) => Object.freeze({ checkpointVersion: 2,
  observationVersion: 2, actionVersion: 1, policyVersion: 2, identity, weights,
  optimizer: Object.freeze({ update: 3, firstMoment: Object.freeze(Array(CONSTRUCT_NETWORK_WEIGHT_COUNT).fill(0)),
    secondMoment: Object.freeze(Array(CONSTRUCT_NETWORK_WEIGHT_COUNT).fill(0)) }), nextJobIndex: 4,
  completedShards: Object.freeze([0, 1, 3]), morphologySplit: Object.freeze({ train: Object.freeze(["four", "two"]),
    validation: Object.freeze(["six"]), test: Object.freeze(["asymmetric"]) }) });

test("one_checkpoint_runs_two_four_and_six_limb_graphs_with_finite_supported_actions", () => {
  const restored = decodeConstructCheckpoint(encodeConstructCheckpoint(checkpoint()));
  for (const limbs of [2, 4, 6]) {
    const decision = decideConstructPolicy(graph(limbs), control, capabilities, restored.weights);
    assert.ok(Number.isFinite(decision.value) && Number.isFinite(decision.logProbability));
    assert.deepEqual(decision.diagnostics.map((row) => row.action), ["alpha", "beta", "gamma"]);
    assert.ok(decision.diagnostics.every((row) => Number.isFinite(row.logit) && row.probability > 0 && row.probability < 1));
  }
  assert.equal(CONSTRUCT_MESSAGE_ROUNDS, 2);
});

test("candidate_softmax_is_over_the_live_set_and_never_over_a_missing_action", () => {
  const zeroWeights = Object.freeze({ values: Object.freeze(Array(CONSTRUCT_NETWORK_WEIGHT_COUNT).fill(0)) });
  const live = decideConstructPolicy(graph(), control, capabilities, zeroWeights);
  const onlyBeta = decideConstructPolicy(graph(), control, capabilities.map((row) =>
    row.action === "alpha" ? { ...row, available: false, reason: "gone" } : row), zeroWeights);
  assert.deepEqual(live.diagnostics.map((row) => row.action), ["alpha", "beta", "gamma"]);
  assert.deepEqual(onlyBeta.diagnostics.map((row) => row.action), ["beta", "gamma"]);
  assert.deepEqual(live.diagnostics.map((row) => row.probability), [0.25, 0.25, 0.25]);
  assert.deepEqual(onlyBeta.diagnostics.map((row) => row.probability), [1 / 3, 1 / 3]);
});

test("autoregressive_STOP_and_claim_masks_define_one_finite_concurrent_set_probability", () => {
  const parameter = { mean: 0.2, logStd: -0.4, unconstrained: 0.1, min: -2, max: 2 };
  const sample = { steps: [{ logits: [1.25, -0.75, 0.1], selected: 0 },
    { logits: [-0.75, 0.1], selected: 1 }], parameters: [parameter] };
  const probability = constructSetLogProbability(sample);
  assert.ok(Number.isFinite(probability));
  const parameterOnly = constructSetLogProbability({ steps: [], parameters: [parameter] });
  assert.ok(Math.abs(probability - (categoricalLogProbability(sample.steps[0].logits, 0) +
    categoricalLogProbability(sample.steps[1].logits, 1) + parameterOnly)) < 1e-12);
  assert.notEqual(probability, constructSetLogProbability({ steps: [sample.steps[0]], parameters: [parameter] }));
});

test("numeric_boolean_and_enum_parameter_heads_have_one_recomputable_joint_probability", () => {
  const numeric = { mean: 0.2, logStd: -0.4, unconstrained: 0.1, min: -2, max: 2 };
  const boolean = { kind: "boolean", logit: 0.7, value: true };
  const choice = { kind: "enum", logits: [0.1, 0.6, -0.2], selected: 1 };
  const together = constructSetLogProbability({ steps: [{ logits: [0], selected: 0 }],
    parameters: [numeric, boolean, choice] });
  const separate = constructSetLogProbability({ steps: [], parameters: [numeric] }) +
    bernoulliLogProbability(boolean.logit, boolean.value) +
    choice.logits[choice.selected] - Math.log(choice.logits.reduce((sum, logit) => sum + Math.exp(logit), 0));
  assert.ok(Number.isFinite(together));
  assert.ok(Math.abs(together - separate) < 1e-12);
});

test("extreme_finite_bounded_means_use_one_open_interval_likelihood", () => {
  for (const mean of [-1e6, 1e6]) {
    const probability = boundedParameterLogProbability({ mean, logStd: -1, unconstrained: mean, min: -2, max: 2 });
    assert.ok(Number.isFinite(probability), `${mean} must remain finite after the shared representable clamp`);
  }
});

test("extreme_numeric_policy_heads_round_trip_the_emitted_command_with_finite_exact_likelihood", () => {
  const layer = (width) => width * CONSTRUCT_EMBEDDING_WIDTH + CONSTRUCT_EMBEDDING_WIDTH;
  const encoderWeights = Object.values(CONSTRUCT_NODE_FEATURE_WIDTHS).reduce((sum, width) => sum + layer(width), 0);
  const messageWeights = CONSTRUCT_MESSAGE_ROUNDS * 6 * layer(CONSTRUCT_EMBEDDING_WIDTH) +
    CONSTRUCT_MESSAGE_ROUNDS * layer(CONSTRUCT_EMBEDDING_WIDTH);
  const parameterMeanBias = encoderWeights + messageWeights + (4 * CONSTRUCT_EMBEDDING_WIDTH + 1) +
    4 * CONSTRUCT_EMBEDDING_WIDTH;
  for (const mean of [-1e6, 1e6]) {
    const values = Array(CONSTRUCT_NETWORK_WEIGHT_COUNT).fill(0); values[parameterMeanBias] = mean;
    const weights = Object.freeze({ values: Object.freeze(values) });
    const decision = decideConstructPolicy(graph(), control, capabilities, weights);
    const rescored = scoreConstructPolicyCommand(graph(), control, capabilities, weights, decision.command);
    assert.ok(Number.isFinite(decision.logProbability));
    assert.equal(rescored.logProbability, decision.logProbability);
    const amount = decision.command.requests.find(({ request }) => request.action === "alpha").request.parameters.amount;
    assert.ok(amount >= -2 && amount <= 2);
  }
});

test("a_value_only_weight_changes_PPO_loss_without_changing_the_sampled_command", () => {
  const weights = initializeConstructNetwork(941);
  const decision = decideConstructPolicy(graph(), control, capabilities, weights);
  const changed = Object.freeze({ values: Object.freeze(weights.values.map((value, index) =>
    index === weights.values.length - 1 ? value + 0.75 : value)) });
  const rescored = decideConstructPolicy(graph(), control, capabilities, changed);
  assert.deepEqual(rescored.command, decision.command);
  assert.equal(rescored.logProbability, decision.logProbability);
  const rows = [{ observation: graph(), capabilities, decision }];
  assert.notEqual(constructPpoLoss(rows, control, weights, [1]), constructPpoLoss(rows, control, changed, [1]));
});

test("a_sampled_public_command_has_one_recomputable_policy_probability", () => {
  const weights = initializeConstructNetwork(9182);
  const decision = decideConstructPolicy(graph(), control, capabilities, weights,
    { stochastic: true, random: { next: () => 0.37 } });
  const rescored = scoreConstructPolicyCommand(graph(), control, capabilities, weights, decision.command);
  assert.ok(Math.abs(rescored.logProbability - decision.logProbability) < 1e-10);
  const mutated = { ...decision.command, requests: decision.command.requests.slice(0, -1) };
  assert.notEqual(scoreConstructPolicyCommand(graph(), control, capabilities, weights, mutated).logProbability,
    decision.logProbability, "removing one selected row must also move the terminal STOP likelihood");
});

test("schedule_identity_does_not_materialize_a_sealed_corpus_save", () => {
  assert.deepEqual(constructLearningMaterializationOrder(), []);
  assert.match(constructLearningCorpusDigest(), /^[0-9a-f]{8}$/);
  assert.deepEqual(constructLearningMaterializationOrder(), [],
    "metadata identity must not pre-open validation or held-out saves");
  constructLearningMorphology("crossbow-standard", "train");
  assert.deepEqual(constructLearningMaterializationOrder(), ["crossbow-standard"]);
});

test("pinning_entry_evidence_does_not_move_the_immutable_learning_protocol_digest", () => {
  assert.equal(Object.prototype.hasOwnProperty.call(CONSTRUCT_LEARNING_PROTOCOL, "entryGate"), false);
  const repinned = { ...CONSTRUCT_LEARNING_SCHEDULE, entryGate: { ...CONSTRUCT_LEARNING_SCHEDULE.entryGate,
    evidence: "different-evidence", sourceDigest: "different-source" } };
  assert.notDeepEqual(repinned.entryGate, CONSTRUCT_LEARNING_SCHEDULE.entryGate);
  assert.equal(smokeConstructTrainerConfig().qualificationProtocolDigest, undefined);
  assert.equal(CONSTRUCT_LEARNING_SCHEDULE_DIGEST, productionConstructTrainerConfig().qualificationProtocolDigest);
  assert.notEqual(constructProductionRunConfigDigest(CONSTRUCT_LEARNING_SCHEDULE.entryGate),
    constructProductionRunConfigDigest({ ...CONSTRUCT_LEARNING_SCHEDULE.entryGate, sourceDigest: "12345678" }),
    "the immutable protocol stays fixed while a requalified run still gets a new row/checkpoint identity");
});

test("the_live_learning_entry_fails_closed_when_the_runtime_moves_past_its_rejected_receipt", () => {
  // The protocol folds the exact frozen Warden corpus bytes. Blueprint v5 plus the later measured
  // Warden/Arbalest physical corrections change this protocol identity, while this remains the old
  // rejected entry rather than a back-door admission to learning.
  assert.equal(CONSTRUCT_LEARNING_SCHEDULE_DIGEST, "99ca7ed3");
  assert.deepEqual(CONSTRUCT_LEARNING_SCHEDULE.entryGate, {
    qualified: false,
    evidence: "construct-entry-run-97a634ab-source-f82bc3d3-2026-09-01",
    runDigest: "97a634ab",
    sourceDigest: "f82bc3d3",
    runtimeStatus: "historical combat-value-v2 Warden receipt; current source 44cde241 is unqualified",
    reason: "current source 44cde241 has no entry receipt; prior f82bc3d3 receipt was rejected",
  });
});

test("the_frozen_learning_corpus_varies_limb_mount_mass_and_program_before_selection", () => {
  const corpus = constructLearningMorphologies();
  const all = [...CONSTRUCT_LEARNING_SPLIT.train, ...CONSTRUCT_LEARNING_SPLIT.validation, ...CONSTRUCT_LEARNING_SPLIT.test]
    .map((id) => corpus[id]);
  assert.deepEqual([...new Set(all.map(({ blueprint }) => blueprint.parts.filter(({ id }) => id.endsWith("-foot")).length))], [4, 3]);
  assert.equal(new Set(all.flatMap(({ blueprint }) => blueprint.modules.map(({ kind }) => kind))).has("sword"), true);
  assert.ok(new Set(all.map(({ blueprint }) => blueprint.parts.find(({ id }) => id === "core").massKg)).size > 1);
  assert.ok(new Set(all.map(({ digests }) => digests.program)).size > 1);
  assert.equal(CONSTRUCT_LEARNING_SPLIT.test.some((id) => CONSTRUCT_LEARNING_SPLIT.train.includes(id)), false);
});

test("training_and_validation_cannot_materialize_the_sealed_held_out_save", async () => {
  const weights = initializeConstructNetwork(19);
  await assert.rejects(runConstructRolloutJob({ index: 0, seed: 19, spec: { stage: "ppo",
    morphology: CONSTRUCT_LEARNING_SPLIT.test[0], opponent: CONSTRUCT_LEARNING_SPLIT.train[0],
    mirrored: false, steps: 1 } }, weights), /train stage cannot open sealed morphology/);
  await assert.rejects(runConstructRolloutJob({ index: 0, seed: 19, spec: { stage: "validation",
    morphology: CONSTRUCT_LEARNING_SPLIT.test[0], opponent: CONSTRUCT_LEARNING_SPLIT.train[0],
    mirrored: false, steps: 1 } }, weights), /validation stage cannot open sealed morphology/);
});

test("qualification_fingerprint_covers_the_broad_runtime_and_fails_closed_when_any_source_moves", async () => {
  const paths = await constructQualificationSourcePaths();
  for (const required of ["src/construct/learning/rollout.ts", "src/construct/scheduler.ts", "src/combat.ts",
    "scripts/run-construct-bouts.mjs", "package.json", "package-lock.json"]) assert.ok(paths.includes(required), required);
  const stable = await constructQualificationSourceFingerprint(async (url) => url.pathname);
  const changed = await constructQualificationSourceFingerprint(async (url) =>
    url.pathname.endsWith("/src/construct/scheduler.ts") ? url.pathname + "-mutated" : url.pathname);
  assert.notEqual(changed, stable);
});

test("authored_qualification_requires_move_brace_fire_and_cover_in_every_row_not_the_union", () => {
  assert.equal(CONSTRUCT_LEARNING_PROTOCOL.authoredQualification.separationM, 7,
    "the authored ranged Mind must begin outside its six-metre close-distance boundary");
  const row = (job, actions) => ({ job, seed: job + 1, mirrored: job % 2 === 1,
    actionTrace: actions.map((action) => `${job}:left:started/group/${action}`) });
  const failures = authoredQualificationActionFailures([
    row(0, ["move", "brace"]), row(1, ["fire", "cover"]),
  ]);
  assert.deepEqual(failures.map(({ job, missing }) => [job, missing]), [
    [0, ["fire", "cover"]], [1, ["move", "brace"]],
  ]);
});

test("authored_qualification_distinguishes_named_resource_transitions_from_missing_capability_rows", () => {
  const row = (job, capabilityLosses) => ({ job, seed: job + 11, mirrored: job % 2 === 1,
    capabilityLosses });
  const failures = authoredQualificationCapabilityFailures([
    row(0, [
      { id: "left/dorsal/fire", reason: "ammunition \"dorsal-bolt\" is reloading" },
      { id: "right/dorsal/fire", reason: "ammunition \"dorsal-bolt\" is exhausted" },
    ]),
    row(1, [{ id: "left/body/move", reason: "capability row disappeared from the runtime snapshot" }]),
  ]);
  assert.deepEqual(failures, [{ job: 1, seed: 12, mirrored: true, id: "left/body/move",
    reason: "capability row disappeared from the runtime snapshot" }]);
  assert.deepEqual(authoredQualificationCapabilityFailures([
    row(0, [{ id: "left/dorsal/fire", reason: "ammunition \"dorsal-bolt\" is reloading" }]),
  ]), [], "a named resource lifecycle transition must not fail the structural integrity gate");
});

test("qualification_expectation_returns_success_only_for_the_named_terminal_status", async () => {
  const parsed = parseConstructQualificationArgs(["--out", "evidence", "--workers", "8", "--expect", "rejected"]);
  assert.deepEqual(parsed, { outDirectory: "evidence", workers: 8, expectation: "rejected" });
  assert.deepEqual(parseConstructQualificationArgs(["--out", "evidence"]),
    { outDirectory: "evidence", workers: undefined, expectation: undefined });
  assert.doesNotThrow(() => assertConstructQualificationExpectation(undefined, "rejected"),
    "an omitted expectation preserves the existing caller-controlled rejection exit path");
  assert.doesNotThrow(() => assertConstructQualificationExpectation("rejected", "rejected"));
  assert.doesNotThrow(() => assertConstructQualificationExpectation("qualified", "qualified"));
  assert.doesNotThrow(() => assertConstructQualificationExpectation("recorded", "rejected"));
  assert.doesNotThrow(() => assertConstructQualificationExpectation("recorded", "qualified"));
  assert.throws(() => assertConstructQualificationExpectation("rejected", "qualified"),
    /expected rejected but actual status was qualified/);
  assert.throws(() => assertConstructQualificationExpectation("qualified", "rejected"),
    /expected qualified but actual status was rejected/);
  const run = (status, expectation) => runConstructQualificationCli([
    "--out", "evidence", ...(expectation === undefined ? [] : ["--expect", expectation]),
  ], async () => ({ status }), { write() {} });
  assert.equal(await run("rejected", "rejected"), 0);
  assert.equal(await run("qualified", "qualified"), 0);
  assert.equal(await run("rejected", "recorded"), 0);
  assert.equal(await run("qualified", "recorded"), 0);
  assert.equal(await run("rejected", undefined), 2, "omission preserves the old rejected exit code");
  await assert.rejects(run("qualified", "rejected"), /expected rejected but actual status was qualified/);
});

test("qualification_expectation_refuses_unknown_missing_duplicate_and_invalid_terminal_values", () => {
  assert.throws(() => parseConstructQualificationArgs(["--out", "evidence", "--expect"]),
    /--expect requires rejected, qualified or recorded/);
  assert.throws(() => parseConstructQualificationArgs(["--out", "evidence", "--expect", "--workers", "8"]),
    /--expect requires rejected, qualified or recorded/);
  assert.throws(() => parseConstructQualificationArgs(["--out", "evidence", "--expect", "maybe"]),
    /does not accept "maybe"; expected rejected, qualified or recorded/);
  assert.throws(() => parseConstructQualificationArgs(["--out", "evidence", "--expect", "rejected",
    "--expect", "qualified"]), /accepts --expect only once/);
  assert.throws(() => assertConstructQualificationExpectation("recorded", "running"),
    /invalid terminal status "running"/);
});

test("physical_smoke_uses_graph_policy_commands_the_public_scheduler_admits_and_moves_loss", async () => {
  const weights = initializeConstructNetwork(20260828);
  const row = await runConstructRolloutJob({ index: 0, seed: 20260828, spec: {
    stage: "ppo", morphology: "crossbow-standard", opponent: "crossbow-standard", mirrored: false, steps: 120,
  } }, weights);
  assert.equal(row.metrics.finiteCommandRate, 1);
  assert.ok(row.metrics.decisions > 0);
  assert.ok(row.metrics.schedulerAdmissions > 0);
  assert.ok(Number.isFinite(row.metrics.loss));
  assert.ok(Number.isFinite(row.metrics.motorSaturationRate));
  assert.ok(Number.isSafeInteger(row.metrics.selfCollisionCount));
  assert.ok(row.metrics.victoryRate === 0 || row.metrics.victoryRate === 1);
  assert.ok(Number.isFinite(row.metrics.unsupportedRate));
  assert.ok(Number.isSafeInteger(row.metrics.lifecycleFailureCount));
  assert.ok(row.gradient.some((value) => value !== 0), "a zero physical gradient would leave every weight unchanged");
});

test("physical_behavior_cloning_observes_only_sensors_installed_on_the_three_limb_morphology", async () => {
  const row = await runConstructRolloutJob({ index: 0, seed: 20260829, spec: {
    stage: "behavior-cloning", morphology: "crossbow-three-limb", opponent: "crossbow-standard",
    mirrored: false, steps: 2,
  } }, initializeConstructNetwork(20260829));
  assert.equal(row.metrics.morphology, "crossbow-three-limb");
  assert.equal(row.metrics.finiteCommandRate, 1);
  assert.ok(row.metrics.decisions > 0);
});

test("mirrored_physical_PPO_rollout_uses_mirrored_observations_and_unmirrored_public_commands", async () => {
  const weights = initializeConstructNetwork(8128);
  const base = { index: 0, seed: 8128, spec: { stage: "ppo", morphology: "crossbow-standard",
    opponent: "crossbow-standard", steps: 48 } };
  const ordinary = await runConstructRolloutJob({ ...base, spec: { ...base.spec, mirrored: false } }, weights);
  const mirrored = await runConstructRolloutJob({ ...base, spec: { ...base.spec, mirrored: true } }, weights);
  assert.equal(ordinary.metrics.mirrorApplications, 0);
  assert.equal(mirrored.metrics.mirrorApplications, mirrored.metrics.decisions * 2);
  assert.ok(mirrored.metrics.schedulerAdmissions > 0,
    "the command returned from the mirrored policy frame must be accepted in the physical frame");
});

test("real_physical_shards_reduce_to_identical_checkpoint_bytes_at_one_and_four_workers", async () => {
  const left = await temporaryRun(); const right = await temporaryRun();
  const base = smokeConstructTrainerConfig();
  const specs = Object.freeze(Array.from({ length: 4 }, (_, index) => Object.freeze({
    stage: "ppo", morphology: "crossbow-standard", opponent: "crossbow-standard",
    mirrored: index % 2 === 1, steps: 60,
  })));
  const config = Object.freeze({ ...base, totalShards: 4, shardsPerUpdate: 4, jobSpecs: specs });
  try {
    await runConstructTrainer({ runDirectory: left, config, workerCount: 1,
      runShardBundle: runPhysicalConstructShardBundle });
    await runConstructTrainer({ runDirectory: right, config, workerCount: 4,
      runShardBundle: runPhysicalConstructShardBundle });
    const [one, four, oneResult, fourResult] = await Promise.all([
      readCurrentConstructCheckpointBundle(left), readCurrentConstructCheckpointBundle(right),
      readFile(join(left, "construct-learning-result.json")), readFile(join(right, "construct-learning-result.json")),
    ]);
    assert.deepEqual(encodeConstructCheckpoint(one.checkpoint), encodeConstructCheckpoint(four.checkpoint));
    assert.deepEqual(oneResult, fourResult);
  } finally {
    await rm(left, { recursive: true, force: true });
    await rm(right, { recursive: true, force: true });
  }
});

test("a_failed_physical_shard_commit_terminates_its_slow_learning_peer", async () => {
  const workers = [];
  class FixtureWorker {
    handlers = new Map();
    timers = [];
    terminated = false;
    exited = false;
    constructor(batch) {
      this.batch = batch;
      workers.push(this);
      queueMicrotask(() => {
        const delay = batch[0].index === 0 ? 0 : 80;
        this.timers.push(setTimeout(() => {
          if (this.terminated) return;
          this.handlers.get("message")?.({ type: "row", index: batch[0].index,
            result: { gradient: [], metrics: {} } });
          this.exit(0);
        }, delay));
      });
    }
    on(type, handler) { this.handlers.set(type, handler); return this; }
    exit(code) {
      if (this.exited) return;
      this.exited = true;
      this.handlers.get("exit")?.(code);
    }
    terminate() {
      this.terminated = true;
      for (const timer of this.timers) clearTimeout(timer);
      this.exit(1);
      return Promise.resolve(1);
    }
  }
  const committed = [];
  await assert.rejects(runPhysicalConstructShardBundle(
    [{ index: 0 }, { index: 1 }], {}, 2,
    async (index) => {
      if (index === 0) throw new Error("fixture commit failure");
      committed.push(index);
    },
    { workerFactory: (batch) => new FixtureWorker(batch) },
  ), /fixture commit failure/);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(committed, []);
  assert.equal(workers.length, 2);
  assert.equal(workers.find(({ batch }) => batch[0].index === 1).terminated, true,
    "the slow peer must stop as soon as the coordinator commit fails");
});

test("worker_creation_rejection_and_unexpected_exit_terminate_already_started_learning_peers", async () => {
  const slow = () => {
    const handlers = new Map();
    return { terminated: false, on(type, handler) { handlers.set(type, handler); return this; },
      terminate() { this.terminated = true; handlers.get("exit")?.(1); return Promise.resolve(1); } };
  };
  const created = slow(); let calls = 0;
  await assert.rejects(runPhysicalConstructShardBundle([{ index: 0 }, { index: 1 }], {}, 2, async () => {}, {
    workerFactory() { calls += 1; if (calls === 2) throw new Error("fixture creation rejection"); return created; },
  }), /fixture creation rejection/);
  assert.equal(created.terminated, true);

  const firstHandlers = new Map(); const peer = slow(); calls = 0;
  const failed = { on(type, handler) { firstHandlers.set(type, handler); if (type === "exit") {
    queueMicrotask(() => handler(7));
  } return this; }, terminate() { return Promise.resolve(1); } };
  await assert.rejects(runPhysicalConstructShardBundle([{ index: 0 }, { index: 1 }], {}, 2, async () => {}, {
    workerFactory() { calls += 1; return calls === 1 ? failed : peer; },
  }), /exited 7/);
  assert.equal(peer.terminated, true);
});

test("duplicate_or_omitted_physical_worker_rows_refuse_without_a_terminal_report", async () => {
  class FaultWorker {
    handlers = new Map();
    constructor(batch, mode) {
      queueMicrotask(() => {
        if (mode === "duplicate") {
          const message = { type: "row", index: batch[0].index, result: smokeConstructShard(batch[0]) };
          this.handlers.get("message")?.(message);
          this.handlers.get("message")?.(message);
        }
        this.handlers.get("exit")?.(0);
      });
    }
    on(type, handler) { this.handlers.set(type, handler); return this; }
    terminate() { this.handlers.get("exit")?.(1); return Promise.resolve(1); }
  }
  for (const mode of ["duplicate", "omission"]) {
    const runDirectory = await mkdtemp(join(tmpdir(), `construct-${mode}-row-`));
    const base = smokeConstructTrainerConfig();
    const config = Object.freeze({ ...base, totalShards: 1, shardsPerUpdate: 1,
      jobSpecs: Object.freeze([base.jobSpecs[0]]) });
    try {
      await assert.rejects(runConstructTrainer({ runDirectory, config, workerCount: 1,
        runShardBundle: (jobs, weights, workers, commit) => runPhysicalConstructShardBundle(
          jobs, weights, workers, commit, { workerFactory: (batch) => new FaultWorker(batch, mode) }),
      }), mode === "duplicate" ? /duplicate shard 0/ : /omitted shard\(s\) 0/);
      await assert.rejects(readFile(join(runDirectory, "construct-learning-result.json")), { code: "ENOENT" });
    } finally { await rm(runDirectory, { recursive: true, force: true }); }
  }
});

test("concurrent_requests_from_the_policy_still_pass_through_the_public_scheduler", () => {
  const zeroWeights = Object.freeze({ values: Object.freeze(Array(CONSTRUCT_NETWORK_WEIGHT_COUNT).fill(0)) });
  const decision = decideConstructPolicy(graph(), control, capabilities, zeroWeights);
  assert.equal(decision.command.requests.length, 2, "zero logits include both rows by canonical tie break");
  assert.deepEqual(decision.command.requests.map(({ request }) => request.action), ["alpha", "gamma"],
    "selecting alpha masks beta's resolved resource claim before the next categorical draw");
  assert.deepEqual(decision.command.requests.map(({ sourceIndex }) => sourceIndex), [0, 1]);
  assert.equal(decision.command.requests[0].request.parameters.mode, "high",
    "deterministic enum ties use canonical descriptor order, not source insertion order");
  const factory = (name) => ({ name, create() { return { enter() {}, step() {}, done() { return false; }, cancel() {},
    diagnostic() { return { phase: "active", detail: "test" }; } }; } });
  const scheduler = new ActionScheduler(control, [factory("alpha-controller"), factory("beta-controller"),
    factory("gamma-controller")], { write() {} });
  const events = scheduler.step(decision.command, { joints: {}, facts: {} }, 1 / 60);
  assert.equal(events.filter((event) => event.kind === "admitted").length, 2);
  assert.equal(events.filter((event) => event.kind === "refused").length, 0);
});

test("teacher_rows_are_action_boundaries_and_use_no_private_program_state", () => {
  const recorder = new ConstructTeacherRecorder();
  const empty = Object.freeze({ version: 1, requests: Object.freeze([]) });
  const active = Object.freeze({ version: 1, requests: Object.freeze([{ request: Object.freeze({
    action: "beta", parameters: Object.freeze({}),
  }), priority: 0, sourceIndex: 0 }]) });
  assert.ok(recorder.observe(graph(), empty));
  assert.equal(recorder.observe(graph(), empty), null);
  assert.ok(recorder.observe(graph(), active));
  assert.deepEqual(Object.keys(recorder.rows[1]).sort(), ["boundaryIndex", "observation", "requests", "version"]);
  assert.match(constructTeacherDigest(recorder.rows), /^[0-9a-f]{8}$/);
});

test("one_two_and_four_workers_produce_identical_rollouts_updates_checkpoints_and_reports", () => {
  const jobs = constructIndexedJobs(12, 310013);
  const run = (job) => Object.freeze([((job.seed & 255) - 127) / 1000, job.index / 1000]);
  const traces = [1, 2, 4].map((workers) => executeConstructJobs(jobs, workers, run));
  assert.deepEqual(traces[1], traces[0]); assert.deepEqual(traces[2], traces[0]);
  const initial = Object.freeze([0.5, -0.25]);
  assert.deepEqual(reduceConstructUpdates(initial, traces[0], 0.01), reduceConstructUpdates(initial, traces[2], 0.01));
  assert.deepEqual(fixedStepReturns([1, 0.5, -0.25], 0.2, 0.9), [1.3933, 0.437, -0.06999999999999998]);
});

test("resume_restores_weights_optimizer_and_the_first_missing_indexed_shard_exactly", () => {
  const before = checkpoint(); const restored = decodeConstructCheckpoint(encodeConstructCheckpoint(before));
  assert.deepEqual(restored, before);
  assert.equal(firstMissingConstructShard(restored, 5), 2);
  const jobs = constructIndexedJobs(5, 4); const done = executeConstructJobs([jobs[0], jobs[1], jobs[3]], 2, ({ seed }) => seed);
  assert.deepEqual(resumeConstructJobs(jobs, done).map(({ index }) => index), [2, 4]);
});

test("optimizer_moments_are_consumed_by_the_next_canonical_update_without_an_ornamental_RNG_field", () => {
  const base = checkpoint();
  const row = { index: 4, seed: 77, gradient: Array(CONSTRUCT_NETWORK_WEIGHT_COUNT).fill(0.02) };
  const config = { learningRate: 0.001 };
  const ordinary = advanceConstructBundle(base, [row], config);
  const movedMoment = advanceConstructBundle({ ...base, optimizer: { ...base.optimizer,
    firstMoment: base.optimizer.firstMoment.map(() => 0.5) } }, [row], config);
  assert.notDeepEqual(movedMoment.weights, ordinary.weights);
  assert.equal(Object.prototype.hasOwnProperty.call(ordinary, "rngState"), false);
});

test("stale_graph_action_program_teacher_or_config_identity_refuses_before_a_worker_starts", () => {
  const restored = decodeConstructCheckpoint(encodeConstructCheckpoint(checkpoint()));
  for (const field of ["graphDigest", "actionDigest", "programDigest", "teacherDigest", "configDigest"]) {
    let workers = 0;
    assert.throws(() => {
      assertConstructCheckpointIdentity(restored, { ...identity, [field]: "aaaaaaaa" });
      workers += 1;
    }, new RegExp(`${field} changed`));
    assert.equal(workers, 0);
  }
});

test("sparse_or_nonfinite_forged_durable_metrics_refuse_before_worker_or_promotion", async () => {
  for (const mutate of [
    (metrics) => ({ stage: metrics.stage, morphology: metrics.morphology }),
    (metrics) => ({ ...metrics, meanDamage: null }),
  ]) {
    const runDirectory = await temporaryRun(); const config = smokeConstructTrainerConfig();
    try {
      await mkdir(join(runDirectory, "shards"), { recursive: true });
      const raw = config.jobSpecs[0];
      const job = { ...constructIndexedJobs(config.totalShards, config.seed)[0], spec: { ...raw,
        morphology: config.morphologySplit.train[0], opponent: config.morphologySplit.train[1] } };
      const value = smokeConstructShard(job);
      await writeFile(join(runDirectory, "shards", "00000000.json"), JSON.stringify({ version: 1, index: 0,
        seed: job.seed, configDigest: config.identity.configDigest, gradient: value.gradient,
        metrics: mutate(value.metrics) }));
      let workers = 0;
      await assert.rejects(runConstructTrainer({ runDirectory, config, workerCount: 1,
        runShardBundle: async () => { workers += 1; } }), /metrics|metric "meanDamage"/);
      assert.equal(workers, 0);
      await assert.rejects(readFile(join(runDirectory, "promoted-construct-policy.json"), "utf8"),
        (error) => error?.code === "ENOENT");
    } finally { await rm(runDirectory, { recursive: true, force: true }); }
  }
});

test("the_browser_decoder_and_headless_trainer_agree_on_one_frozen_inference_digest", () => {
  const trained = checkpoint(initializeConstructNetwork(20260828));
  const headless = decideConstructPolicy(graph(6), control, capabilities, trained.weights);
  const browser = decideConstructPolicy(graph(6), control, capabilities,
    decodeConstructCheckpoint(encodeConstructCheckpoint(trained)).weights);
  assert.equal(constructPolicyDecisionDigest(browser), constructPolicyDecisionDigest(headless));
  assert.equal(constructPolicyDecisionDigest(browser), FROZEN_CONSTRUCT_INFERENCE_DIGEST);
});

const temporaryRun = () => mkdtemp(join(tmpdir(), "construct-trainer-"));

test("time_cap_survival_cannot_outscore_a_damaging_loss", () => {
  const passive = constructEngagementReward({ victory: false, draw: true, timeCap: true,
    damageDealt: 0, damageTaken: 0 });
  const damagingLoss = constructEngagementReward({ victory: false, draw: false, timeCap: false,
    damageDealt: 2, damageTaken: 10 });
  assert.ok(damagingLoss > passive, `${damagingLoss} must beat passive ${passive}`);
});

test("learning_reward_order_is_preserved_across_the_combat_unit_migration", () => {
  const legacyReward = ({ victory, draw, timeCap, damageDealt, damageTaken }) =>
    (victory ? 100 : 0) + damageDealt - damageTaken * 0.25 - (draw ? 10 : 0) - (timeCap ? 25 : 0);
  const candidates = [
    { victory: true, draw: false, timeCap: false, damageDealt: 44, damageTaken: 80 },
    { victory: false, draw: false, timeCap: false, damageDealt: 90, damageTaken: 30 },
    { victory: false, draw: true, timeCap: true, damageDealt: 20, damageTaken: 10 },
  ];
  const legacyOrder = candidates.map(legacyReward).map((score, index) => ({ score, index }))
    .sort((a, b) => b.score - a.score).map(({ index }) => index);
  const migratedScores = candidates.map((row) => constructEngagementReward({ ...row,
    damageDealt: row.damageDealt / 20, damageTaken: row.damageTaken / 20 }));
  assert.deepEqual(migratedScores, candidates.map(legacyReward));
  const migratedOrder = migratedScores
    .map((score, index) => ({ score, index })).sort((a, b) => b.score - a.score).map(({ index }) => index);
  assert.deepEqual(migratedOrder, legacyOrder);
  assert.equal(combatValueToLegacyRewardWeight(2.25), 45);
});

test("terminal_checkpoint_recovery_finalizes_without_spending_another_rollout", async () => {
  const runDirectory = await temporaryRun();
  try {
    const config = smokeConstructTrainerConfig();
    await runConstructTrainer({ runDirectory, config, runShard: smokeConstructShard });
    let rollouts = 0;
    const recovered = await runConstructTrainer({ runDirectory, config, runShard: () => {
      rollouts += 1;
      throw new Error("terminal recovery started a rollout");
    } });
    assert.equal(recovered.recovered, true);
    assert.equal(recovered.rolloutsStarted, 0);
    assert.equal(rollouts, 0);
  } finally { await rm(runDirectory, { recursive: true, force: true }); }
});

test("a_worker_count_change_or_five_minute_interruption_reproduces_final_bytes", async () => {
  const uninterrupted = await temporaryRun();
  const resumed = await temporaryRun();
  const config = Object.freeze({ ...smokeConstructTrainerConfig(), totalShards: 8, shardsPerUpdate: 4 });
  try {
    await runConstructTrainer({ runDirectory: uninterrupted, config, workerCount: 1, runShard: smokeConstructShard });
    const stopped = await runConstructTrainer({ runDirectory: resumed, config, workerCount: 2,
      stopAfterShards: 2, runShard: smokeConstructShard });
    assert.equal(stopped.status, "interrupted");
    assert.equal(JSON.parse(await readFile(join(resumed, "shards", "00000002.json"), "utf8")).index, 2,
      "the interruption leaves an earlier missing index and a higher completed shard");
    await runConstructTrainer({ runDirectory: resumed, config, workerCount: 4, runShard: smokeConstructShard });
    const [leftBundle, rightBundle, leftResult, rightResult] = await Promise.all([
      readCurrentConstructCheckpointBundle(uninterrupted), readCurrentConstructCheckpointBundle(resumed),
      readFile(join(uninterrupted, "construct-learning-result.json")), readFile(join(resumed, "construct-learning-result.json")),
    ]);
    assert.deepEqual(encodeConstructCheckpoint(leftBundle.checkpoint), encodeConstructCheckpoint(rightBundle.checkpoint));
    assert.deepEqual(leftResult, rightResult);
  } finally {
    await rm(uninterrupted, { recursive: true, force: true });
    await rm(resumed, { recursive: true, force: true });
  }
});

test("each_completed_sub_five_minute_shard_is_durable_before_the_next_starts", async () => {
  const runDirectory = await temporaryRun();
  try {
    let committed = 0;
    await assert.rejects(runConstructTrainer({ runDirectory, config: smokeConstructTrainerConfig(),
      runShard: smokeConstructShard, onCommitted: async () => {
        committed += 1;
        if (committed === 2) throw new Error("synthetic power loss");
      } }), /synthetic power loss/);
    const [first, second] = await Promise.all([
      readFile(join(runDirectory, "shards", "00000000.json"), "utf8"),
      readFile(join(runDirectory, "shards", "00000001.json"), "utf8"),
    ]);
    assert.equal(JSON.parse(first).index, 0);
    assert.equal(JSON.parse(second).index, 1);
  } finally { await rm(runDirectory, { recursive: true, force: true }); }
});

test("a_stale_committed_shard_refuses_before_another_worker_starts", async () => {
  const runDirectory = await temporaryRun();
  try {
    const config = smokeConstructTrainerConfig();
    await mkdir(join(runDirectory, "shards"), { recursive: true });
    await writeFile(join(runDirectory, "shards", "00000000.json"), JSON.stringify({
      version: 1, index: 0, seed: 1, configDigest: "aaaaaaaa",
      gradient: Array(CONSTRUCT_NETWORK_WEIGHT_COUNT).fill(0), metrics: {},
    }));
    let workers = 0;
    await assert.rejects(runConstructTrainer({ runDirectory, config, runShard: () => {
      workers += 1;
      return smokeConstructShard({ index: 0, seed: 1 });
    } }), /stale config/);
    assert.equal(workers, 0);
  } finally { await rm(runDirectory, { recursive: true, force: true }); }
});

test("a_partial_checkpoint_bundle_never_replaces_the_last_decodable_checkpoint", async () => {
  const runDirectory = await temporaryRun();
  try {
    await runConstructTrainer({ runDirectory, config: smokeConstructTrainerConfig(), runShard: smokeConstructShard });
    const before = await readCurrentConstructCheckpointBundle(runDirectory);
    const partial = join(runDirectory, "checkpoints", "checkpoint-99999999-terminal.tmp-synthetic");
    await mkdir(partial, { recursive: true });
    await writeFile(join(partial, "checkpoint.json"), "incomplete");
    const after = await readCurrentConstructCheckpointBundle(runDirectory);
    assert.deepEqual(encodeConstructCheckpoint(after.checkpoint), encodeConstructCheckpoint(before.checkpoint));
    assert.equal(after.manifest.checkpointDigest, before.manifest.checkpointDigest);
  } finally { await rm(runDirectory, { recursive: true, force: true }); }
});

test("training_telemetry_cannot_change_rollout_update_checkpoint_or_report_bytes", async () => {
  const left = await temporaryRun(); const right = await temporaryRun();
  try {
    const config = smokeConstructTrainerConfig();
    await runConstructTrainer({ runDirectory: left, config, runShard: smokeConstructShard,
      telemetry: { pid: 1, wallTimeMs: 5 } });
    await runConstructTrainer({ runDirectory: right, config, runShard: smokeConstructShard,
      telemetry: { pid: 999, wallTimeMs: 5000 } });
    const [leftBundle, rightBundle, leftReport, rightReport] = await Promise.all([
      readCurrentConstructCheckpointBundle(left), readCurrentConstructCheckpointBundle(right),
      readFile(join(left, "construct-learning-result.json")), readFile(join(right, "construct-learning-result.json")),
    ]);
    assert.deepEqual(encodeConstructCheckpoint(leftBundle.checkpoint), encodeConstructCheckpoint(rightBundle.checkpoint));
    assert.deepEqual(leftReport, rightReport);
  } finally { await rm(left, { recursive: true, force: true }); await rm(right, { recursive: true, force: true }); }
});
