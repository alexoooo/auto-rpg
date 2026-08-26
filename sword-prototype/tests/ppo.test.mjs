import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GRU_UNITS, RecurrentPolicy, maskedArgmax, maskedCategorical } from "../src/learning/recurrent-network.ts";
import { CONFIG } from "../src/config.ts";
import { clippedPolicyTerm, clippedValueLoss, deterministicMinibatchOrder, generalizedAdvantages,
  tacticalBoundaryReward, decodePpoResume, encodePpoResume, equalBudgetPpoArms, freezeOpponentLeague, indexedLeagueOpponent,
  ppoHeadUpdate, PPO_GAMMA_PER_SECOND, PPO_POLICY_HEADS, PPO_TRACE_LAMBDA, selectPpoArm } from "../src/learning/ppo.ts";
import { EFFECTOR_NAMES, HAND_ACTION_NAMES, MOVEMENT_NAMES, STANCE_NAMES, TARGET_NAMES,
  handActionOption, tacticTargets } from "../src/options.ts";
import { ResearchArtifact, canonicalJson } from "../src/learning/artifact.ts";
import { argmaxHeadPick, decodeResearchArtifact, inProgressResearchArtifact, recurrentTactic,
  RESEARCH_ARTIFACT_CONTRACT } from "../src/learning/deployment.ts";
import { MAX_PERSISTENCE, META_OUTPUT_LAYOUT, MIN_PERSISTENCE, PERSISTENCE_SECONDS, UNLEARNED_PERSISTENCE,
  deployableTactics } from "../src/learning/meta.ts";
import { assertPpoLedgerPrefix, assertPpoStoppingContract, collectPpoTrajectory, flattenHeads, initialPpoWeights, loadLeagueArtifacts, opponentRoute,
  ppoPendingAction,
  ppoIterationBudget, ppoUpdateRows, trainPpo, PPO_PRODUCED_LOGITS, PPO_PRODUCED_OUTPUTS,
  PPO_TRAJECTORY_SOLVER_STEP_CAP } from "../scripts/train-ppo.mjs";
import { researchMatrix } from "../src/learning/research-matrix.ts";
import { assertCompleteView } from "./fixtures/view.mjs";

const layer = (rows, columns, bias = 0) => ({ rows, columns, weights: Array(rows * columns).fill(0), bias: Array(rows).fill(bias) });
/**
 * A recurrent policy's weights, with every head sized from the frozen table it
 * indexes.
 *
 * **It said `action: layer(6, GRU_UNITS)` against a seven-name table, and had
 * since the file was written.** Nothing caught it: `finiteLayer` was handed
 * `weights.action.rows` as the row count to check `weights.action` against,
 * which is a check that cannot fail. So this fixture was a policy whose seventh
 * action -- `recover`, the one name in every legal mask -- had no row at all,
 * and `dense` answered six logits where the decoder reads seven.
 *
 * The sixth entry is the one table here that is not a table of *names*:
 * `PERSISTENCE_SECONDS` is eight dwell times and the head is a categorical over
 * its indices. It belongs in this map anyway, because what the map is for is the
 * row count a head owes `finiteLayer`.
 */
const HEAD_TABLES = { movement: MOVEMENT_NAMES, action: HAND_ACTION_NAMES, effector: EFFECTOR_NAMES,
  target: TARGET_NAMES, stance: STANCE_NAMES, persistence: PERSISTENCE_SECONDS };
const weights = () => ({ inputSize: 3, units: GRU_UNITS,
  update: layer(GRU_UNITS, GRU_UNITS + 3), reset: layer(GRU_UNITS, GRU_UNITS + 3),
  candidate: layer(GRU_UNITS, GRU_UNITS + 3),
  ...Object.fromEntries(Object.entries(HEAD_TABLES).map(([name, table]) => [name, layer(table.length, GRU_UNITS)])),
  value: layer(1, GRU_UNITS) });

const syntheticPpoRuntime = (calls = [], consume = () => 4,
  reward = (request) => request.weights.movement.bias[0]) => ({
  async collectTrajectory(request) {
    calls.push({ split: request.split, jobIndex: request.jobIndex, initialization: request.initialization,
      requested: request.solverSteps, learned: request.weights.movement.bias[0] });
    const boundary = { oldValue: 0, terminal: 0, startVitalityPotential: 0, endVitalityPotential: 0,
      nearRangeProgress: 0 };
    return { result: { solverSteps: consume(request), result: { seconds: 0.5 }, engagement: { viableOpportunities: 2,
      attacksInWindow: 1, damagingContactsInWindow: 1, nearRangeStallSeconds: 0.25, firstAttackSeconds: null } },
      weights: request.weights, boundaries: [boundary], rewards: [reward(request)],
      advantages: [0], opponent: { id: "synthetic", kind: "specialist", digest: "synthetic-v1" } };
  },
  updateHeads(heads) {
    heads.movement.bias[0] += 1;
    return { policyLoss: 0, valueLoss: 0, entropy: 0,
      headEntropies: Object.fromEntries(PPO_POLICY_HEADS.map((name) => [name, 0])), recurrentGradientNorm: 0,
      unclippedGradientNorm: 0, clippedGradientNorm: 0 };
  },
});

test("masked_policy_heads_never_sample_or_argmax_an_unsupported_tactic", () => {
  assert.equal(maskedArgmax([100, 4, 3], new Set([1, 2]), "movement"), 1);
  assert.equal(maskedCategorical([100, 4, 3], new Set([1, 2]), 0, "movement").index, 1);
  assert.throws(() => maskedArgmax([1, 2], new Set(), "action"), /action has no supported tactic/);
});

test("the_frozen_league_cannot_be_rewritten_by_the_current_training_worker", () => {
  const source = [{ id: "control", kind: "specialist", digest: "fixed" }]; const league = freezeOpponentLeague(source);
  source[0].digest = "live-worker-write";
  assert.equal(league[0].digest, "fixed"); assert.ok(Object.isFrozen(league)); assert.ok(Object.isFrozen(league[0]));
  assert.equal(indexedLeagueOpponent(league, 310013, 4).digest, "fixed");
});

test("a_learned_league_entry_without_its_decoded_champion_is_refused", () => {
  const champion = { id: "dagger:real", kind: "dagger", digest: "abc" };
  assert.throws(() => opponentRoute(champion), /has no decoded champion artifact/);
  const factory = () => ({ name: "decoded" });
  assert.equal(opponentRoute(champion, new Map([[champion.id, factory]])).controller, factory);
});

/**
 * A frozen champion fights as the thing that was deployed, **dwell included**.
 *
 * `loadLeagueArtifacts` builds its own labeler rather than going through
 * `deployedResearchMind`, and its own comment is about exactly this: it was a
 * sixth copy of the legality rule, and C2b pointed it at `recurrentTactic` so a
 * league opponent decides what the deployment branch decides. The persistence
 * was the one field still named by hand there -- `UNLEARNED_PERSISTENCE`, a
 * constant belonging to a different algorithm -- and it survived the sixth head
 * landing until a mutation battery asked. **Replacing it with `0.4` left the
 * whole suite green**, which is the shape this directory calls the worst defect
 * available, so the test exists rather than the note.
 *
 * The champion is built with its persistence head zeroed except for one bias, so
 * the argmax is index 6 whatever the hidden state is and the assertion is a
 * dwell rather than "some number in the grid". 0.70 is deliberately **not**
 * `UNLEARNED_PERSISTENCE` and not `PERSISTENCE_SECONDS[0]`, which are the two
 * values a broken decode lands on.
 */
test("a_frozen_league_champion_holds_the_dwell_its_own_head_chose", async () => {
  const weights = initialPpoWeights(310013, "random");
  weights.persistence = { rows: PERSISTENCE_SECONDS.length, columns: GRU_UNITS,
    weights: Array(PERSISTENCE_SECONDS.length * GRU_UNITS).fill(0),
    bias: PERSISTENCE_SECONDS.map((_, index) => index === 6 ? 1 : 0) };
  const bytes = new ResearchArtifact({ algorithm: "ppo", ...RESEARCH_ARTIFACT_CONTRACT,
    payload: [...new TextEncoder().encode(canonicalJson({ initialization: "random", weights }))],
    provenance: { seed: 7, solverSteps: 4, trainingSplit: "train", validationSplit: "validation",
      configDigest: "synthetic" } }, RESEARCH_ARTIFACT_CONTRACT).toBytes();
  const path = join(mkdtempSync(join(tmpdir(), "ppo-league-")), "champion.bin");
  writeFileSync(path, bytes);
  const loaded = await loadLeagueArtifacts([path]);
  const entry = loaded.league.find((row) => row.kind === "ppo");
  assert.ok(entry, "the artifact did not enter the league as a ppo champion");
  const mind = loaded.controllers.get(entry.id)();
  mind.decide(handedView("sword", "empty"), 1 / 240);
  assert.equal(mind.diagnostic().persistenceSeconds, 0.70);
  assert.notEqual(mind.diagnostic().persistenceSeconds, UNLEARNED_PERSISTENCE);
});

test("an_in_progress_champion_cannot_enter_the_frozen_ppo_league", async () => {
  const base = new ResearchArtifact({ algorithm: "dagger", ...RESEARCH_ARTIFACT_CONTRACT,
    payload: [...new TextEncoder().encode("{}")], provenance: { seed: 7, solverSteps: 4,
      trainingSplit: "train", validationSplit: "validation", configDigest: "synthetic" } },
  RESEARCH_ARTIFACT_CONTRACT);
  const path = join(mkdtempSync(join(tmpdir(), "ppo-league-progress-")), "champion.bin");
  writeFileSync(path, inProgressResearchArtifact(base, "still-running").toBytes());
  await assert.rejects(loadLeagueArtifacts([path]), /in-progress research artifact cannot be registered/);
});

test("an_indexed_arm_boundary_resume_is_byte_identical_to_an_uninterrupted_havok_run", async () => {
  const config = { seed: 310013, solverSteps: 8, workers: 1 };
  const uninterrupted = await trainPpo(config); const interrupted = await trainPpo({ ...config, stopAfterJobs: 1 });
  assert.equal(interrupted.complete, false);
  const resumed = await trainPpo({ ...config, resumeBytes: interrupted.resume });
  for (const name of ["artifact", "report", "resume"]) assert.deepEqual(resumed[name], uninterrupted[name]);
});

test("larger_solver_step_ceilings_buy_more_indexed_ppo_updates_for_both_arms", async () => {
  const shortCalls = []; const longCalls = [];
  const short = await trainPpo({ seed: 310013, solverSteps: 24, workers: 1 }, syntheticPpoRuntime(shortCalls));
  const long = await trainPpo({ seed: 310013, solverSteps: 40, workers: 1 }, syntheticPpoRuntime(longCalls));
  const shortReport = JSON.parse(new TextDecoder().decode(short.report));
  const longReport = JSON.parse(new TextDecoder().decode(long.report));
  const updatesFor = (report, initialization) => report.rows
    .filter((row) => row.initialization === initialization && row.update !== null).length;
  for (const initialization of ["random", "dagger"]) {
    assert.equal(updatesFor(shortReport, initialization), 3);
    assert.equal(updatesFor(longReport, initialization), 5);
    assert.equal(longReport.rows.filter((row) => row.initialization === initialization)
      .reduce((sum, row) => sum + row.solverSteps, 0), 40,
    `${initialization} received its own complete per-arm ceiling`);
  }
  assert.equal(longCalls.length, 20, "five train/validation pairs were run for each arm");
  for (let at = 0; at < longCalls.length; at += 2) {
    assert.deepEqual(longCalls.slice(at, at + 2).map((call) => call.split), ["train", "validation"]);
    assert.equal(longCalls[at].jobIndex, at / 2);
    assert.equal(longCalls[at + 1].jobIndex, at / 2);
  }
  assert.ok(longReport.rows.every((row, index) => row.index === index), "checkpoint boundaries are an indexed prefix");
  assert.ok(longReport.rows.every((row) => row.requestedTrainSolverSteps >= row.trainSolverSteps));
  assert.ok(longReport.rows.every((row) => !("worstCell" in row)), "PPO has no cell objective to duplicate its macro into");
});

test("ppo_job_index_checkpoint_cadence_does_not_change_search_outputs", async () => {
  const run = async (cadence) => { const checkpoints = []; const runtime = syntheticPpoRuntime();
    runtime.onCheckpoint = ({ progress }) => { if (progress.completedJobs % cadence === 0) checkpoints.push(progress.completedJobs); return null; };
    const output = await trainPpo({ seed: 310013, solverSteps: 40, workers: 1 }, runtime);
    return { checkpoints, artifact: output.artifact, report: output.report, resume: output.resume }; };
  const every = await run(1); const sparse = await run(3);
  assert.notDeepEqual(every.checkpoints, sparse.checkpoints);
  for (const name of ["artifact", "report", "resume"]) assert.deepEqual(every[name], sparse[name]);
});

test("a_cap_surviving_bout_cannot_swallow_a_large_ceiling_before_it_buys_another_update", async () => {
  const calls = []; const report = JSON.parse(new TextDecoder().decode((await trainPpo(
    { seed: 310013, solverSteps: 64_800, workers: 1 }, syntheticPpoRuntime(calls, (request) => request.solverSteps))).report));
  for (const initialization of ["random", "dagger"]) {
    const rows = report.rows.filter((row) => row.initialization === initialization);
    assert.equal(rows.length, 3, `${initialization} got one update for each 21,600-step collect/validation pair`);
    assert.equal(rows.reduce((sum, row) => sum + row.solverSteps, 0), 64_800);
  }
  assert.ok(calls.every((call) => call.requested <= 10_800), "one trajectory never asks beyond the physical 45-second bout cap");
});

test("a_resume_inside_one_ppo_arm_restores_the_learned_weights_and_indexed_update_prefix", async () => {
  const config = { seed: 310013, solverSteps: 24, workers: 1, runId: "resume-proof" };
  const uninterrupted = await trainPpo(config, syntheticPpoRuntime());
  const interrupted = await trainPpo({ ...config, stopAfterJobs: 1 }, syntheticPpoRuntime());
  assert.equal(interrupted.complete, false);
  const state = decodePpoResume(interrupted.resume);
  assert.ok(state.rows.every((row) => !("weights" in row) && !("fullWeights" in row)),
    "history stays weight-free instead of growing by a network snapshot per update");
  assert.equal(state.training.champions.length, 1, "the one arm seen so far has one best snapshot");
  assert.deepEqual(state.training.armWeights.map((entry) => entry.armIndex), [0, 1]);
  const resumed = await trainPpo({ ...config, resumeBytes: interrupted.resume }, syntheticPpoRuntime());
  for (const name of ["artifact", "report", "resume"]) assert.deepEqual(resumed[name], uninterrupted[name]);
  const report = JSON.parse(new TextDecoder().decode(resumed.report));
  assert.equal(report.runId, "resume-proof");
  assert.deepEqual(report.rows.filter((row) => row.initialization === "random")
    .map((row) => row.iteration), [0, 1, 2]);
  assert.deepEqual(report.rows.filter((row) => row.initialization === "random")
    .map((row) => row.update === null ? null : row.update.policyLoss), [0, 0, 0]);
});

test("terminal_ppo_recovery_rebuilds_final_outputs_without_spending_another_job", async () => {
  const config = { seed: 310013, solverSteps: 24, workers: 1 };
  const interrupted = await trainPpo({ ...config, stopAfterJobs: 2 }, syntheticPpoRuntime());
  const calls = [];
  const recovered = await trainPpo({ ...config, resumeBytes: interrupted.resume }, {
    ...syntheticPpoRuntime(calls), terminalStop: "stopped: plateau",
  });
  assert.equal(recovered.complete, true); assert.deepEqual(calls, []);
  const report = JSON.parse(new TextDecoder().decode(recovered.report));
  assert.equal(report.stopped, "stopped: plateau"); assert.equal(report.ledgerFile, "ledger.jsonl");
});

test("a_stale_ppo_state_is_refused_against_a_newer_run_ledger", async () => {
  const config = { seed: 310013, solverSteps: 24, workers: 1 };
  const older = await trainPpo({ ...config, stopAfterJobs: 1 }, syntheticPpoRuntime());
  const newer = await trainPpo({ ...config, stopAfterJobs: 2 }, syntheticPpoRuntime());
  const newerState = decodePpoResume(newer.resume);
  assert.throws(() => assertPpoLedgerPrefix(older.resume, [{ jobIndex: newerState.rows.at(-1).index,
    stepsConsumed: newerState.optimizer.consumedSolverSteps }]), /does not match the run ledger prefix/);
});

test("a_changed_ppo_plateau_contract_is_refused_before_a_collector_can_run", () => {
  let collectorCalls = 0; const ledger = [{ stopping: { plateauEpsilon: 0.01, plateauRows: 6 } }];
  assert.throws(() => assertPpoStoppingContract(ledger, 0.02, 6), /PPO resume refused: plateau contract changed/);
  assert.equal(collectorCalls, 0);
});

test("a_due_ppo_row_persisted_as_pending_is_replayed_exactly_once", () => {
  const row = { row: 1, jobIndex: 5 }; const pending = { row, champion: new Uint8Array([1]) };
  const prefix = [{ row: 0, jobIndex: 2 }];
  assert.equal(ppoPendingAction(pending, prefix), "append");
  prefix.push(row);
  assert.equal(ppoPendingAction(pending, prefix), "already-appended");
});

test("a_four_step_tail_is_validation_only_instead_of_claiming_an_update_it_cannot_fit", () => {
  assert.deepEqual(ppoIterationBudget(4), { train: 0, validation: 4 });
  assert.deepEqual(ppoIterationBudget(12), { train: 4, validation: 8 });
  assert.deepEqual(ppoIterationBudget(21_600), { train: 10_800, validation: 10_800 });
  assert.deepEqual(ppoIterationBudget(21_604), { train: 10_800, validation: 10_800 });
  assert.throws(() => ppoIterationBudget(6), /invalid PPO remaining arm budget 6/);
});

test("the_ppo_trajectory_cap_is_derived_from_the_largest_frozen_matrix_bout", () => {
  const seconds = Math.max(...["train", "validation"].flatMap((split) =>
    researchMatrix(split, 0).map((job) => job.boutCapSeconds)));
  assert.equal(seconds, 45);
  assert.equal(CONFIG.world.physicsHz, 240);
  assert.equal(PPO_TRAJECTORY_SOLVER_STEP_CAP, seconds * CONFIG.world.physicsHz);
  assert.equal(PPO_TRAJECTORY_SOLVER_STEP_CAP, 10_800);
});

test("ppo_interleaves_arms_and_defers_a_plateau_stop_until_the_round_is_fair", async () => {
  const checkpoints = []; const runtime = syntheticPpoRuntime();
  runtime.onCheckpoint = async (checkpoint) => {
    checkpoints.push(checkpoint);
    return checkpoint.row.index === 0 ? "stopped: plateau" : undefined;
  };
  const trained = await trainPpo({ seed: 310013, solverSteps: 24, workers: 1 }, runtime);
  const report = JSON.parse(new TextDecoder().decode(trained.report));
  assert.equal(report.stopped, "stopped: plateau");
  assert.deepEqual(report.rows.map((row) => [row.armIndex, row.iteration]), [[0, 0], [1, 0]]);
  assert.deepEqual(checkpoints.map((checkpoint) => checkpoint.progress.fairRound), [false, true]);
  assert.deepEqual(checkpoints.at(-1).progress.armSolverSteps, { random: 8, dagger: 8 });
  assert.ok(checkpoints.every((checkpoint) => checkpoint.resume instanceof Uint8Array));
  assert.ok(checkpoints.every((checkpoint) => checkpoint.championArtifact instanceof Uint8Array));
});

test("an_unchanged_early_ppo_champion_keeps_its_artifact_and_provenance_prefix", async () => {
  const artifacts = []; const runtime = syntheticPpoRuntime([], (request) => request.solverSteps,
    (request) => -request.weights.movement.bias[0]);
  runtime.onCheckpoint = ({ championArtifact }) => { artifacts.push(championArtifact); };
  const trained = await trainPpo({ seed: 310013, solverSteps: 64_800, workers: 1 }, runtime);
  const report = JSON.parse(new TextDecoder().decode(trained.report));
  assert.equal(report.selected, "random"); assert.equal(report.selectedIteration, 0);
  assert.equal(report.stopped, "stopped: ceiling");
  assert.ok(artifacts.slice(1).every((artifact) => Buffer.from(artifact).equals(Buffer.from(artifacts[0]))),
    "later worse rows do not rewrite an unchanged champion artifact");
  const { provenance } = decodeResearchArtifact(trained.artifact).data;
  assert.equal(provenance.selectedIteration, 0);
  assert.equal(provenance.solverSteps, 21_600, "the champion claims only its own arm prefix, not later training");
  assert.deepEqual(report.rows[0].engagement, { opportunities: 2, attacksInWindow: 1, contactsInWindow: 1,
    nearRangeStallSeconds: 0.25, seconds: 0.5, firstAttackSeconds: [null] });
  assert.deepEqual(report.rows.filter((row) => row.armIndex === 0).map((row) => row.armSolverSteps),
    [21_600, 43_200, 64_800]);
});

test("random_and_dagger_initializations_receive_the_same_solver_step_budget", () => {
  const arms = equalBudgetPpoArms(310013, 1800);
  assert.deepEqual(arms.map((arm) => arm.initialization), ["random", "dagger"]);
  assert.deepEqual(arms.map((arm) => arm.solverSteps), [1800, 1800]);
  assert.equal(selectPpoArm([{ split: "validation", arm: "random", macro: 1 },
    { split: "validation", arm: "dagger", macro: 2 }]), "dagger");
  assert.throws(() => selectPpoArm([{ split: "test", arm: "random", macro: 1 }]), /cannot read test rows/);
});

test("ppo_resume_reproduces_weights_optimizer_state_and_report_bytes", () => {
  const state = { update: 7, firstMoment: [0.1, 0.2], secondMoment: [0.3, 0.4], consumedSolverSteps: 960 };
  const uninterrupted = encodePpoResume([1, 2], state, [{ index: 0 }, { index: 1 }]);
  const resumed = encodePpoResume([1, 2], { ...state }, [{ index: 0 }, { index: 1 }]);
  assert.deepEqual(resumed, uninterrupted);
});

test("a_tactic_produces_one_return_across_its_complete_temporal_boundary", () => {
  const reward = tacticalBoundaryReward({ startVitalityPotential: 0.2, endVitalityPotential: 0.5,
    nearRangeProgress: 0.1, terminal: 1 });
  assert.ok(Math.abs(reward - 4.4) < 1e-12);
});

test("telescoping_progress_cannot_be_farmed_by_crossing_one_range_boundary_repeatedly", () => {
  const forward = tacticalBoundaryReward({ startVitalityPotential: 0, endVitalityPotential: 0,
    nearRangeProgress: 100, terminal: 0 });
  const back = tacticalBoundaryReward({ startVitalityPotential: 0, endVitalityPotential: 0,
    nearRangeProgress: -100, terminal: 0 });
  assert.equal(forward + back, 0);
  assert.equal(forward, 0.2);
});

test("a_healthy_time_limit_retreat_earns_less_than_a_damaging_exchange", () => {
  const retreat = tacticalBoundaryReward({ startVitalityPotential: 0.8, endVitalityPotential: 0.8,
    nearRangeProgress: -0.2, terminal: 0, durationSeconds: 600 });
  const exchange = tacticalBoundaryReward({ startVitalityPotential: 0.2, endVitalityPotential: 0.7,
    nearRangeProgress: 0, terminal: 0 });
  assert.ok(retreat < exchange);
});

/**
 * The old pin, at unit duration, and **it does not move.**
 *
 * The semi-MDP change was expected to move these two numbers and it cannot:
 * `gamma ** 1` is `gamma` and `(gamma * lambda) ** 1` is `gamma * lambda`, so at
 * one second a step the recursion is character-for-character the flat one it
 * replaced. Re-derived rather than re-recorded: the terminal step is
 * `2 + 0 - 0.4 = 1.6`; the step before it is `1 + 0.9 * 0.4 - 0.5 = 0.86` plus
 * `0.9 * 0.8 * 1.6 = 1.152`, which is 2.012.
 *
 * That makes this a control rather than a test of the change, which is why the
 * one below it exists: a duration of 1 is precisely the case that cannot tell
 * the two schemes apart.
 */
test("ppo_clipping_and_advantages_match_the_pinned_hand_calculation", () => {
  assert.equal(clippedPolicyTerm(0.5, 0.75, 2, 0.2), 2.4);
  assert.equal(clippedPolicyTerm(0.5, 0.25, -2, 0.2), -1.6);
  assert.equal(clippedValueLoss(1, 2, 0, 0.2), 2);
  const advantages = generalizedAdvantages([
    { reward: 1, value: 0.5, nextValue: 0.4, terminal: false, durationSeconds: 1 },
    { reward: 2, value: 0.4, nextValue: 0, terminal: true, durationSeconds: 1 },
  ], 0.9, 0.8);
  assert.ok(Math.abs(advantages[1] - 1.6) < 1e-12);
  assert.ok(Math.abs(advantages[0] - 2.012) < 1e-12);
  // A duration is required rather than defaulted, so a caller that forgets one
  // is refused by name instead of getting the flat discount back.
  assert.throws(() => generalizedAdvantages([{ reward: 1, value: 0, nextValue: 0, terminal: true }], 0.9, 0.8),
    /GAE step 0 has a duration of undefined seconds/);
  assert.throws(() => generalizedAdvantages([{ reward: 1, value: 0, nextValue: 0, terminal: true, durationSeconds: -1 }], 0.9, 0.8),
    /GAE step 0 has a duration of -1 seconds/);
});

/**
 * The defect a learned persistence introduces, in the arithmetic that removes
 * it: **elapsed time and not boundary count sets the discount.**
 *
 * One boundary of one second and two boundaries of half a second each are the
 * same second of bout, so the value at the far end of both must arrive
 * discounted by the same factor. Under the flat per-boundary recursion they do
 * not, and the gap is the whole artifact: fewer boundaries to the same place is
 * a larger number, for reasons that have nothing to do with what was decided.
 *
 * **Chosen so every quantity is exact in binary and the pin can be `equal`
 * rather than a tolerance.** `gamma = 0.25` and `dt = 0.5` give
 * `0.25 ** 0.5 === 0.5` exactly, and `lambda = 1` makes the trace factor the
 * same `gamma ** dt`, so the two-step chain is `0.5 * (0.5 * 8) = 2` and the
 * one-step is `0.25 * 8 = 2`. Hand-derived; nothing here was read off the code.
 *
 * The three answers it is not are written out, because a single equality can be
 * satisfied by more than one wrong recursion:
 *
 * - flat `gamma` per boundary gives the two-step chain `0.25 * (0.25 * 8) = 0.5`;
 * - `gamma * dt` instead of `gamma ** dt` gives `0.125 * (0.125 * 8) = 0.125`;
 * - `gamma ** dt` in the delta but a flat `gamma * lambda` in the trace gives
 *   `0.25 * 4 = 1`.
 *
 * The one-step trajectory answers 2 under the first of those as well, which is
 * why the pin is on the split one and the unsplit one is the control beside it.
 */
test("elapsed_time_and_not_boundary_count_sets_the_gae_discount", () => {
  const whole = generalizedAdvantages([
    { reward: 0, value: 0, nextValue: 8, terminal: false, durationSeconds: 1 },
  ], 0.25, 1);
  const split = generalizedAdvantages([
    { reward: 0, value: 0, nextValue: 0, terminal: false, durationSeconds: 0.5 },
    { reward: 0, value: 0, nextValue: 8, terminal: false, durationSeconds: 0.5 },
  ], 0.25, 1);
  assert.equal(whole[0], 2, "one boundary of a second");
  assert.equal(split[0], 2, "two boundaries of half a second reach the same value equally discounted");
  assert.equal(split[1], 4, "and the second of them is half a second nearer");
  for (const wrong of [0.5, 0.125, 1]) {
    assert.notEqual(split[0], wrong, `${wrong} is one of the three recursions this is not`);
  }
  // A terminal step's duration cannot matter -- its continuation is zero, so
  // neither factor is reached -- and that is asserted rather than assumed,
  // because a bout whose last decision lands on its last published sample
  // really does produce a zero-length final boundary.
  const terminal = (durationSeconds) => generalizedAdvantages([
    { reward: 3, value: 0.5, nextValue: 99, terminal: true, durationSeconds }], 0.25, 1)[0];
  assert.equal(terminal(0), 2.5); assert.equal(terminal(600), 2.5);
});

/**
 * Which of the two semi-MDP spellings this is, tested where they differ.
 *
 * `gamma ** dt * lambda` and `(gamma * lambda) ** dt` are both valid GAE
 * families and the test above **cannot tell them apart by construction**: it
 * uses `lambda = 1`, where they are the same expression, and its control uses
 * `dt = 1`, where they are too. So the "three wrong recursions" it enumerates
 * omit the one a reader would seriously consider, and mutating the trace to the
 * other spelling left the whole suite green.
 *
 * `generalizedAdvantages` carries the argument for the choice -- gamma is a rate
 * per second because reward arriving later is a physical fact, lambda is a knob
 * per decision because n-step returns are counted in decisions. This is the
 * arithmetic that pins it, at `lambda = 0.5` and `dt = 0.5`, where the trace
 * factors are `0.25 ** 0.5 * 0.5 = 0.25` and `(0.25 * 0.5) ** 0.5 = 0.3535...`.
 * Both numbers are written out.
 */
test("the_trace_decays_per_decision_and_the_discount_per_second", () => {
  const advantages = generalizedAdvantages([
    { reward: 0, value: 0, nextValue: 0, terminal: false, durationSeconds: 0.5 },
    { reward: 0, value: 0, nextValue: 8, terminal: false, durationSeconds: 0.5 },
  ], 0.25, 0.5);
  assert.equal(advantages[1], 4, "gamma ** 0.5 * 8");
  assert.equal(advantages[0], 1, "gamma ** 0.5 * lambda * 4, lambda per decision");
  const rateSpelling = (0.25 * 0.5) ** 0.5 * 4;
  assert.ok(Math.abs(rateSpelling - 1.4142135623730951) < 1e-12, rateSpelling);
  assert.notEqual(advantages[0], rateSpelling, "lambda is not raised to the duration");
  // And the reason the pin above cannot see this: at lambda 1 the two spellings
  // are one expression, which is asserted rather than left as a claim.
  const atOne = (durationSeconds) => generalizedAdvantages([
    { reward: 0, value: 0, nextValue: 0, terminal: false, durationSeconds },
    { reward: 0, value: 0, nextValue: 8, terminal: false, durationSeconds },
  ], 0.25, 1)[0];
  assert.equal(atOne(0.5), 0.25 ** 0.5 * (0.25 ** 0.5 * 8));
  assert.equal(atOne(0.5), (0.25 * 1) ** 0.5 * (0.25 ** 0.5 * 8));
});

/**
 * The one converted constant, bounded from both sides, and the exactness checked
 * rather than attributed.
 *
 * The choice is "the per-second rate that comes to the old per-boundary 0.99
 * over one `UNLEARNED_PERSISTENCE`", so the round trip is the assertion and it
 * holds **exactly** rather than within a tolerance. **This comment used to say
 * that followed from `1 / 0.4 === 2.5`, and it does not.** The round trip is
 * exact at 0.3, 0.6 and 0.7 too, where `1 / p` has no exact double, so the
 * sweep below is the check: what actually does it is the exponent being at or
 * below one, which contracts the first power's relative error instead of
 * amplifying it. Above one it stops holding, and that is asserted as well so the
 * sweep is two-sided rather than a list of successes.
 *
 * The bracket catches the constant being re-derived against some other
 * reference: 0.307 s, the measured mean dwell at this bin, would put gamma at
 * 0.9678, outside it.
 */
test("the_per_second_rate_reproduces_the_flat_discount_at_the_unlearned_persistence", () => {
  assert.equal(PPO_GAMMA_PER_SECOND ** UNLEARNED_PERSISTENCE, 0.99);
  assert.equal(PPO_GAMMA_PER_SECOND ** UNLEARNED_PERSISTENCE * PPO_TRACE_LAMBDA, 0.99 * 0.95);
  assert.ok(PPO_GAMMA_PER_SECOND > 0.9750 && PPO_GAMMA_PER_SECOND < 0.9754, PPO_GAMMA_PER_SECOND);
  // Lambda is not converted at all, which is `generalizedAdvantages`' argument
  // made checkable: a session that turns it back into a rate moves this.
  assert.equal(PPO_TRACE_LAMBDA, 0.95);
  // A rate per second is only a rate per second if a longer step discounts
  // more, and a rate at all only if it is under one.
  assert.ok(PPO_GAMMA_PER_SECOND ** 1 < PPO_GAMMA_PER_SECOND ** UNLEARNED_PERSISTENCE);
  assert.ok(PPO_GAMMA_PER_SECOND < 1);
  // The exactness, swept rather than attributed to 0.4. Every grid value round
  // trips; every exponent above one sampled here does not, which is the half
  // that makes this a property rather than a coincidence.
  for (const seconds of PERSISTENCE_SECONDS) {
    assert.equal((0.99 ** (1 / seconds)) ** seconds, 0.99, `round trip at ${seconds}`);
  }
  // Swept both sides of one, deterministically, and stated as rates because it
  // is a rate: below one it essentially always holds, above one it essentially
  // never does. Not "never" -- 2 and 8 round trip, being powers of two -- and a
  // test asserting zero would have been false for that reason.
  const roundTrips = (seconds) => (0.99 ** (1 / seconds)) ** seconds === 0.99;
  const below = Array.from({ length: 4000 }, (_, index) => (index + 1) / 4000).filter(roundTrips).length;
  const above = Array.from({ length: 4000 }, (_, index) => 1 + (index + 1) / 100).filter(roundTrips).length;
  assert.equal(below, 3999, "the round trip should be near-universal for exponents at or below one");
  assert.equal(above, 376, "and rare above one, which is what makes this a property rather than luck");
  assert.deepEqual([2, 3, 5, 8, 9].filter(roundTrips), [2, 8], "the exceptions above one are the powers of two");
  // And the product spelling this deliberately does not use: `(g * l) ** p` is
  // exact at five of the eight grid values and not at 0.20, 0.30 or 0.60, which
  // is the seam multiplying by a plain lambda removes.
  const product = (seconds) => ((0.99 ** (1 / seconds)) * (0.95 ** (1 / seconds))) ** seconds === 0.9405;
  assert.deepEqual(PERSISTENCE_SECONDS.map(product), [true, false, false, true, true, false, true, true]);
});

/**
 * One boundary over six heads, with a different number of supported outputs on
 * each, so the entropy divisor is pinned rather than merely positive.
 *
 * The supported counts are 2, 2, 3, 4, 6 and 8 -- deliberately not all equal.
 * With all-zero weights every head is uniform over its own legal set, so the
 * per-head entropies are `ln 2`, `ln 2`, `ln 3`, `ln 4`, `ln 6` and `ln 8`, and
 * the reported mean over one row is their sum over six. The old divisor was the
 * head count spelled as a literal `2`, which now reports 3x that number; a
 * divisor of `rows.length` alone reports 6x it. The only assertion on this
 * field anywhere in the tree was `report.entropy > 0`, which every one of those
 * satisfies.
 *
 * **Both guards were re-derived when the sixth head landed, not carried over.**
 * They read `expected * 2.5` and `expected * 5` at five heads, and both of those
 * are now *wrong in the safe direction* -- 2.5x and 5x are neither the true
 * value nor either wrong divisor, so a test keeping them would go on passing
 * while asserting nothing about the two divisors it names.
 *
 * `persistence` at 8 is the whole grid, because that head is unmasked: every
 * dwell in `PERSISTENCE_SECONDS` is inside the clamp on every body, so `log 8`
 * is its entropy ceiling and the ceiling is reached here.
 */
const supportedCounts = { movement: 2, action: 2, effector: 3, target: 4, stance: 6,
  persistence: PERSISTENCE_SECONDS.length };
const headBoundary = (hidden, extra = {}) => ({ hidden, oldValue: 0, valueTarget: 1, advantage: 1,
  ...Object.fromEntries(PPO_POLICY_HEADS.flatMap((name) => [[name, 0],
    [`${name}Supported`, Array.from({ length: supportedCounts[name] }, (_, index) => index)],
    [`old${name[0].toUpperCase()}${name.slice(1)}Probability`, 0.5]])), ...extra });

test("ppo_updates_policy_weights_value_head_and_reports_clipping_and_entropy", () => {
  const heads = { ...Object.fromEntries(PPO_POLICY_HEADS.map((name) =>
    [name, layer(supportedCounts[name], 2)])), value: layer(1, 2) };
  const report = ppoHeadUpdate(heads, [headBoundary([1, -0.5], { action: 1 })], 310013);
  for (const name of PPO_POLICY_HEADS) {
    assert.notDeepEqual(heads[name].weights, Array(supportedCounts[name] * 2).fill(0), name);
  }
  assert.notDeepEqual(heads.value.weights, [0, 0]);
  assert.ok(report.valueLoss > 0);
  assert.ok(report.clippedGradientNorm <= 0.5 + 1e-12);
  // The pinned value: the mean per-head entropy of one row, to the last bit the
  // sum happens to land on. A wrong divisor is a wrong number here, not a wrong
  // sign.
  const expected = (2 * Math.log(2) + Math.log(3) + Math.log(4) + Math.log(6) + Math.log(8)) / PPO_POLICY_HEADS.length;
  assert.ok(Math.abs(report.entropy - expected) < 1e-12,
    `entropy ${report.entropy} against ${expected}`);
  assert.deepEqual(Object.keys(report.headEntropies), [...PPO_POLICY_HEADS]);
  for (const name of PPO_POLICY_HEADS) {
    assert.ok(Math.abs(report.headEntropies[name] - Math.log(supportedCounts[name])) < 1e-12,
      `${name} entropy ${report.headEntropies[name]} against log(${supportedCounts[name]})`);
  }
  // And the two divisors it is not, written out so this cannot be satisfied by
  // an accident of arithmetic. Re-derived at six heads: `rows.length * 2` is a
  // divisor of 2 against the true 6, so it reports 3x; `rows.length` alone is a
  // divisor of 1, so it reports 6x. They were 2.5x and 5x at five heads.
  assert.ok(Math.abs(report.entropy - expected * 3) > 1e-3, "not the literal 2 it used to divide by");
  assert.ok(Math.abs(report.entropy - expected * 6) > 1e-3, "not rows.length alone");
  // The categorical entropy bound the binned persistence head keeps and a
  // Gaussian would not: `log k`, reached exactly here because that head is
  // uniform over the whole grid, and never negative -- which is what a
  // differential entropy can be, and is why this pin would have stopped being a
  // number about anything under a continuous head.
  assert.ok(report.entropy > 0 && report.entropy <= Math.log(PERSISTENCE_SECONDS.length) + 1e-12);
});

test("the_reported_entropy_is_a_mean_over_rows_as_well_as_over_heads", () => {
  const heads = () => ({ ...Object.fromEntries(PPO_POLICY_HEADS.map((name) =>
    [name, layer(supportedCounts[name], 2)])), value: layer(1, 2) });
  const one = ppoHeadUpdate(heads(), [headBoundary([1, -0.5])], 310013);
  // Two identical rows, so the sum doubles and the mean does not. A divisor that
  // had grown a head count but lost `rows.length` passes the test above.
  const two = ppoHeadUpdate(heads(), [headBoundary([1, -0.5]), headBoundary([1, -0.5])], 310013);
  assert.ok(Math.abs(one.entropy - two.entropy) < 1e-9, `${one.entropy} against ${two.entropy}`);
});

test("truncated_bptt_moves_all_three_gru_gate_matrices_under_the_same_clip", () => {
  const recurrent = () => ({ ...layer(2, 3), weights: Array(6).fill(0.03) });
  const output = (rows) => ({ ...layer(rows, 2), weights: Array(rows * 2).fill(0.08) });
  const network = { update: recurrent(), reset: recurrent(), candidate: recurrent(),
    ...Object.fromEntries(PPO_POLICY_HEADS.map((name) => [name, output(2)])), value: output(1) };
  const before = [network.update, network.reset, network.candidate].map((gate) => [...gate.weights]);
  const boundary = (input, previousHidden, hidden, movement, action) => ({ ...headBoundary(hidden, { movement, action }),
    input, previousHidden,
    ...Object.fromEntries(PPO_POLICY_HEADS.map((name) => [`${name}Supported`, [0, 1]])) });
  const report = ppoHeadUpdate(network, [boundary([0.4], [0, 0], [0.1, -0.05], 0, 1),
    boundary([-0.2], [0.1, -0.05], [0.04, 0.02], 1, 0)], 310013);
  for (const [index, gate] of [network.update, network.reset, network.candidate].entries())
    assert.notDeepEqual(gate.weights, before[index]);
  assert.ok(report.recurrentGradientNorm > 0); assert.ok(report.clippedGradientNorm <= 0.5 + 1e-12);
});

test("seeded_minibatches_and_league_jobs_are_worker_count_independent", () => {
  const a = deterministicMinibatchOrder(100, 310013); const b = deterministicMinibatchOrder(100, 310013);
  assert.deepEqual(a, b); assert.notDeepEqual(a, deterministicMinibatchOrder(100, 310019));
  assert.deepEqual([...a].sort((x, y) => x - y), Array.from({ length: 100 }, (_, index) => index));
});

test("deterministic_inference_replays_the_same_tactic_sequence", () => {
  const a = new RecurrentPolicy(weights()); const b = new RecurrentPolicy(weights());
  const traceA = []; const traceB = [];
  for (const input of [[0, 0, 0], [1, -1, 0.5], [0.1, 0.2, 0.3]]) {
    traceA.push(a.step(input)); traceB.push(b.step(input));
  }
  assert.deepEqual(traceA, traceB);
  a.reset(); assert.deepEqual(a.snapshot(), Array(GRU_UNITS).fill(0));
});

/**
 * The PPO half of the training/deployment seam, which had no guard at all.
 *
 * NEAT has `the_training_decoder_and_the_deployment_decoder_answer_the_same_label`
 * and it genuinely goes red under a one-sided move. PPO's only end-to-end test
 * was the Havok resume, which compares a run against itself -- so **two
 * mutations to `collectPpoTrajectory` left the whole suite green**: swapping
 * `maskedCategorical` for `argmaxHeadPick`, which deletes exploration from an
 * on-policy algorithm and makes every `oldXProbability` exactly 1 so the
 * importance ratio is 1 for every sample forever; and storing each head's full
 * index range in place of `tactic.supported[name]`, which is the precise
 * property `deployment.ts`'s `recurrentTactic` and the record claim correctness
 * for.
 *
 * Both are caught by rebuilding what the update will do from what the collector
 * stored. Every boundary carries its own `input` and `previousHidden`, so the
 * five logit vectors are recomputable exactly -- and the probability
 * `ppoHeadUpdate` renormalizes over the stored support is then a number this
 * test can compute independently and compare. A widened support renormalizes
 * over the wrong denominator; an argmax reports 1 where the softmax says 0.2.
 *
 * The third assertion is the one that says *sampled*: on at least one head of
 * one boundary the collector must have taken something other than its largest
 * legal logit. Under `argmaxHeadPick` that count is zero by construction.
 *
 * `tacticTargets` is a pure function of the action, so the aim head's stored
 * conditional is checked for **exact equality** rather than mere narrowness,
 * with no need for the live body.
 */
test("the_ppo_trajectory_stores_the_conditionals_it_sampled_under_rather_than_the_whole_table", async () => {
  const trajectory = await collectPpoTrajectory({ seed: 310013, initialization: "random", solverSteps: 240 });
  assert.ok(trajectory.boundaries.length >= 2, `${trajectory.boundaries.length} boundaries is not a trajectory`);
  const policy = new RecurrentPolicy(trajectory.weights);
  const capitalised = (name) => `old${name[0].toUpperCase()}${name.slice(1)}Probability`;
  let explored = 0; let narrowed = 0;
  for (const [row, boundary] of trajectory.boundaries.entries()) {
    policy.restore(boundary.previousHidden);
    const step = policy.step(boundary.input);
    for (const name of PPO_POLICY_HEADS) {
      const logits = step[`${name}Logits`];
      const supported = boundary[`${name}Supported`];
      const chosen = boundary[name]; const stored = boundary[capitalised(name)];
      assert.ok(supported.includes(chosen), `${row}/${name}: index ${chosen} is outside its own stored support`);
      if (supported.length < logits.length) narrowed += 1;
      // The renormalisation `ppoHeadUpdate` performs, rebuilt from the stored
      // support alone: a support that is not the one the sample was drawn under
      // gives a different denominator, and an argmax reports 1.
      const peak = Math.max(...supported.map((index) => logits[index]));
      const total = supported.reduce((sum, index) => sum + Math.exp(logits[index] - peak), 0);
      const expected = Math.exp(logits[chosen] - peak) / total;
      assert.ok(Math.abs(stored - expected) < 1e-12,
        `${row}/${name}: stored probability ${stored} against ${expected} over the stored support`);
      if (supported.length > 1) {
        assert.ok(stored < 1 - 1e-9,
          `${row}/${name}: probability 1 over ${supported.length} legal outputs is an argmax, not a sample`);
        if (chosen !== maskedArgmax(logits, new Set(supported), name)) explored += 1;
      }
    }
    const action = HAND_ACTION_NAMES[boundary.action];
    assert.deepEqual([...boundary.targetSupported].sort((a, b) => a - b),
      tacticTargets(action).map((target) => TARGET_NAMES.indexOf(target)).sort((a, b) => a - b),
      `${row}: the aim support is not ${action}'s conditional`);
    assert.ok(boundary.targetSupported.length < TARGET_NAMES.length, `${row}: the aim head was not masked at all`);
    assert.ok(boundary.actionSupported.length < HAND_ACTION_NAMES.length, `${row}: the action head was not masked at all`);
  }
  assert.ok(narrowed > 0, "no head was masked on any boundary, so the comparison above proves nothing");
  assert.ok(explored > 0,
    "every head took its largest legal logit on every boundary -- the collector argmaxed rather than sampled");
});

/**
 * `TacticalBoundary.durationSeconds` has a producer, and this is it.
 *
 * The field was declared with the note "diagnostic only", was written by
 * nothing, and appeared exactly once in the tree -- in a reward test passing
 * `durationSeconds: 600` to prove the reward ignores it. A declared optional
 * that nothing writes is the mirror of a field nothing reads, and it stayed
 * invisible for the same reason: `undefined` is a legal value of an optional.
 *
 * What is asserted is the property the discount depends on, not the field's
 * presence: the durations are the bout's own clock, cut at the decisions, so
 * they are non-negative and they sum to that clock.
 *
 * **This used to say "they are not all equal -- a trajectory whose boundaries
 * all lasted the same time is one where the sixth head decided nothing", and
 * that was a test whose setup already satisfied it.** Durations vary under a
 * *constant* dwell too, because the skill ends a boundary as often as the timer
 * does -- measured, only 36 % of boundaries at the 0.40 bin reach the request.
 * So `new Set(durations).size > 1` says nothing about the head at all. What does
 * is the pairing below: every boundary's realised dwell is bounded by the bin
 * **its own recorded index names**, one decision step of slack for the timer
 * being read on the step after it expires. Under a collector that requested a
 * constant, a boundary recording bin 0 would routinely outlive 0.10 s.
 *
 * The requested dwell is a ceiling and not the value: a boundary ends at
 * `min(persistence, the skill finishing)`, so the bound is one-sided, and the
 * count of boundaries that did reach their own bin is asserted non-zero so the
 * bound is not vacuously satisfied by a policy that always ends early.
 */
test("every_boundary_a_ppo_trajectory_records_carries_the_time_it_actually_lasted", async () => {
  const trajectory = await collectPpoTrajectory({ seed: 310013, initialization: "random", solverSteps: 480 });
  assert.ok(trajectory.boundaries.length >= 4, `${trajectory.boundaries.length} boundaries is not a trajectory`);
  const durations = trajectory.boundaries.map((row) => row.durationSeconds);
  for (const [index, seconds] of durations.entries()) {
    assert.ok(Number.isFinite(seconds) && seconds >= 0, `boundary ${index} lasted ${seconds}`);
    assert.ok(seconds <= MAX_PERSISTENCE + 0.02,
      `boundary ${index} lasted ${seconds}, past the ${MAX_PERSISTENCE} s ceiling and a decision step`);
  }
  // The clock is cut into the boundaries with nothing left over: the sum is the
  // span from the first decision to the last published sample, so a producer
  // that wrote the *requested* dwell instead would not add up.
  //
  // **Against `result.lastClock`, which is the bout's own reading, and not
  // against the last boundary's `startClock + durationSeconds`.** The second
  // spelling was here first and is self-satisfying: forcing the final duration
  // to zero shrinks both sides of it by the same amount, so a mutation battery
  // found it green. That is the "reads the reporter rather than the thing
  // reported" shape, in the one place this test could take it.
  const span = durations.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(span - (trajectory.result.lastClock - trajectory.boundaries[0].startClock)) < 1e-9,
    `${span} of boundary time against ${trajectory.result.lastClock - trajectory.boundaries[0].startClock} of bout clock`);
  // **The bout ran at the dwell the sixth head sampled**, boundary by boundary,
  // and this is the only assertion in the tree that says so for the collector.
  // The other two decode sites have their own -- `deployment.ts` under M13,
  // `loadLeagueArtifacts` under its own test -- and this third one, the one that
  // decides what the *training data* was collected under, had none: replacing
  // `tactic.persistenceSeconds` with a constant here left the whole suite green.
  // Broken, the head samples a bin, stores its index and `oldPersistenceProbability`,
  // and is then trained on advantages from a bout that ran at some other dwell:
  // an importance ratio evaluated at an action nobody took.
  let reachedOwnBin = 0;
  for (const [index, boundary] of trajectory.boundaries.entries()) {
    const asked = PERSISTENCE_SECONDS[boundary.persistence];
    assert.ok(Number.isFinite(asked), `boundary ${index} recorded persistence index ${boundary.persistence}`);
    assert.ok(boundary.durationSeconds <= asked + 0.02,
      `boundary ${index} recorded bin ${asked} s and lasted ${boundary.durationSeconds} s`);
    if (boundary.durationSeconds >= asked - 1e-9) reachedOwnBin += 1;
  }
  assert.ok(reachedOwnBin > 0,
    "no boundary ever reached its own bin, so the bound above is satisfied by a policy that always ends early");
  assert.ok(new Set(trajectory.boundaries.map((row) => row.persistence)).size > 1,
    "the sixth head recorded one bin on every boundary, so this trajectory cannot separate the bins");
  // And the advantages were taken at those durations rather than flat, which is
  // the reader that would otherwise be absent: recomputing the same GAE with
  // every duration forced to one must not reproduce them.
  const rows = trajectory.boundaries.map((row, index) => ({ reward: trajectory.rewards[index], value: row.value,
    nextValue: trajectory.boundaries[index + 1]?.value ?? 0, terminal: index === trajectory.boundaries.length - 1,
    durationSeconds: row.durationSeconds }));
  assert.deepEqual(generalizedAdvantages(rows, PPO_GAMMA_PER_SECOND, PPO_TRACE_LAMBDA), trajectory.advantages);
  assert.notDeepEqual(generalizedAdvantages(rows.map((row) => ({ ...row, durationSeconds: 1 })),
    PPO_GAMMA_PER_SECOND, PPO_TRACE_LAMBDA), trajectory.advantages);
  // The value target the update descends on, which was inline in `trainPpo` and
  // unasserted: replacing it with `row.oldValue` -- a value head told to predict
  // what it already predicts -- left the whole suite green.
  const updateRows = ppoUpdateRows(trajectory);
  for (const [index, row] of updateRows.entries()) {
    assert.equal(row.valueTarget, trajectory.boundaries[index].oldValue + trajectory.advantages[index]);
    assert.equal(row.advantage, trajectory.advantages[index]);
  }
  assert.ok(updateRows.some((row) => Math.abs(row.valueTarget - row.oldValue) > 1e-9),
    "every value target equals its own prediction, so the value head is being told to learn nothing");
});

/**
 * A body whose two hands hold different things, so the effector mask decides
 * something -- and, since the remediation pass, one that can also have lost a
 * hand or been given jaws.
 *
 * The three options exist because the `["natural"]` branch of `tacticEffectors`
 * was unreachable from every fixture here: it fires only when **no** hand is
 * attached, and four intact humanoids never get near it. A fixture that cannot
 * exhibit the defect is the shape `AGENTS.md` records twice.
 */
const BITE = Object.freeze({ bite: Object.freeze({ reach: 0.9, ready: true, active: false }) });
const handedView = (primary = "sword", secondary = "empty",
  { lostPrimary = false, lostSecondary = false, bite = false, handless = false } = {}) => {
  const hand = (weapon, outboard, lost = false) => ({ weapon, lost, reach: weapon === "bow" ? 0.8 : 1.4, tipSpeed: 0,
    tipVelocity: { x: 0, y: 0, z: 0 }, outboard, shoulder: { x: outboard * 0.2, y: 1.4, z: 0 },
    tip: { x: outboard * 0.2, y: 1.4, z: 1 } });
  const body = (a, b, z, facing, hands, natural, unit) => ({ unit, reach: 1.4, crownHeight: 1.8, vitalHeight: 1.1,
    collisionRadius: 0.3, naturalAttacks: natural, ground: { x: 0, y: 0, z }, facing, shoulder: a.shoulder, tip: a.tip,
    tipSpeed: 0, hands, crouch: 0, trunkLean: 0, trunkTwist: 0, vitality: 1, health: {} });
  const own = hand(primary, 1, lostPrimary); const off = hand(secondary, -1, lostSecondary);
  const theirs = hand("sword", 1); const theirOff = hand("empty", -1);
  return assertCompleteView({
    self: body(own, off, 0, 0, handless ? {} : { primary: own, secondary: off },
      bite ? BITE : {}, handless ? "centipede" : "warrior"),
    opponent: body(theirs, theirOff, 1.4, Math.PI, { primary: theirs, secondary: theirOff }, {}, "warrior"),
    projectiles: [], measure: 1.2, clock: 0 });
};

/**
 * PPO's six heads are sampled independently, and the masks are what stop the
 * five that name a tuple producing one the executor refuses.
 *
 * The masks are conditioned in contract order -- the effector's on the action
 * that was just picked, the aim's on the same -- which are exactly the three
 * loops `deployableTactics` builds its set from. So the triple is a member of
 * that set **by construction** rather than by a refusal after the fact, which is
 * what a factorized policy needs: three independent argmaxes over the full tables
 * answer `punch+primary+low` on a sword+empty body, and there is nothing honest
 * to do with that afterwards.
 *
 * Swept over every logit ordering rather than sampled: the picker below takes the
 * `k`th legal index of each head, so every combination of per-head preferences is
 * exercised on every fixture.
 *
 * **The executor is driven, and until the remediation pass it was not.** This
 * asserted membership in `deployableTactics(view)` and nothing else -- a set
 * built from the same `tacticEffectors` and `tacticTargets` that
 * `recurrentTactic` masks with, so it was a mask compared against itself and
 * would have gone green on any joint error the two shared. `handActionOption`
 * is what actually refuses a tuple at run time, three hundred solver steps into
 * a worker, so `.enter(view)` is called on the real option for the real tuple
 * and for **all six stances**, which the tuple set does not enumerate.
 *
 * The fixture set gained the two bodies it could not previously describe: one
 * with a severed hand, and two with a natural attack -- a warrior that has lost
 * both arms and a centipede that never had any. Those are the only bodies where
 * `tacticEffectors` answers `["natural"]`, so the branch that decodes it was
 * never entered here at all.
 */
test("every_conditionally_masked_pick_is_a_tuple_the_executor_accepts", () => {
  const fixtures = {
    "sword+empty": handedView("sword", "empty"),
    "sword+axe": handedView("sword", "axe"),
    "bow+empty": handedView("bow", "empty"),
    "empty+empty": handedView("empty", "empty"),
    "sword(lost)+empty": handedView("sword", "empty", { lostPrimary: true }),
    "sword+axe(lost)": handedView("sword", "axe", { lostSecondary: true }),
    "both lost+bite": handedView("sword", "empty", { lostPrimary: true, lostSecondary: true, bite: true }),
    "centipede+bite": handedView("empty", "empty", { handless: true, bite: true }),
  };
  let checked = 0; let entered = 0; const effectors = new Set(); const dwells = new Set();
  for (const [loadout, view] of Object.entries(fixtures)) {
    const legal = new Set(deployableTactics(view).map((row) => `${row.action}|${row.effector}|${row.target}`));
    assert.ok(legal.size > 0, `${loadout} has no legal tuple at all`);
    for (let k = 0; k < 8; k += 1) {
      const kth = (logits, supported) => { const list = [...supported].sort((a, b) => a - b);
        return Object.freeze({ index: list[k % list.length], probability: 1 / list.length }); };
      const step = { movementLogits: Array(5).fill(0), actionLogits: Array(7).fill(0), effectorLogits: Array(3).fill(0),
        targetLogits: Array(4).fill(0), stanceLogits: Array(6).fill(0), persistenceLogits: Array(8).fill(0),
        value: 0, hidden: [] };
      const tactic = recurrentTactic(view, step, kth);
      // The dwell is decoded here and not by the caller, so a `k` that names the
      // sixth bin has to come back as 0.60 s rather than as a 5. Eight bins and
      // eight values of `k`, so the sweep names every one of them on every body.
      assert.equal(tactic.persistenceSeconds, PERSISTENCE_SECONDS[k], `${loadout} k=${k} dwell`);
      dwells.add(tactic.persistenceSeconds);
      assert.ok(legal.has(`${tactic.action}|${tactic.effector}|${tactic.target}`),
        `${loadout} k=${k}: ${tactic.action}+${tactic.effector}+${tactic.target}`);
      // The recorded supports are the conditionals the update renormalizes over,
      // not marginals: the effector list is this action's, so a two-handed bow
      // offers one hand and a sword+axe offers two for `cut`.
      assert.deepEqual([...tactic.supported.effector].sort((a, b) => a - b),
        [...new Set(deployableTactics(view).filter((row) => row.action === tactic.action)
          .map((row) => EFFECTOR_NAMES.indexOf(row.effector)))].sort((a, b) => a - b));
      effectors.add(tactic.effector);
      checked += 1;
    }
    // The executor itself, over every legal tuple this body has and every stance
    // -- the stance is on the decision and not in the tuple set, so a tuple
    // sweep alone leaves five sixths of the decision space unentered.
    for (const row of deployableTactics(view)) for (const stance of STANCE_NAMES) {
      const option = handActionOption(row.action, { effector: row.effector, target: row.target, stance });
      option.enter(view); entered += 1;
    }
  }
  assert.equal(checked, 64);
  // 16 + 17 + 7 + 12 + 6 + 10 + 3 + 3 = 74 legal tuples over the eight bodies,
  // each entered at all six stances. Asserted as a literal so a sweep that
  // quietly stopped iterating is a failure rather than a fast pass -- and note
  // that **no body here reaches 21**, which is the widest `deployableTactics`
  // any body has; `docs/measurements.md` carries that count and where it lives.
  assert.equal(entered, 74 * STANCE_NAMES.length);
  assert.equal(entered, 444);
  // All three effectors were produced, so the `natural` decode is exercised
  // rather than merely available.
  assert.deepEqual([...effectors].sort(), ["natural", "primary", "secondary"]);
  // And every dwell, which is the same statement about the sixth head: the grid
  // is unmasked on every body, so a body that could not reach one of these bins
  // would be a mask nobody wrote.
  assert.deepEqual([...dwells].sort((a, b) => a - b), [...PERSISTENCE_SECONDS]);
});

/**
 * The independent argmax the conditional mask replaces, on the one body where it
 * is wrong -- so the test above is checking something rather than restating a
 * mask that could not fail.
 */
test("three_independent_argmaxes_would_have_produced_an_illegal_tuple", () => {
  const view = handedView("sword", "empty");
  const step = { movementLogits: [0, 0, 0, 0, 0], actionLogits: [0, 0.30, 0.20, 1.00, 0, 0, 0],
    effectorLogits: [1.00, 0.10, 0], targetLogits: [0.20, 0.30, 1.00, 0], stanceLogits: Array(6).fill(0),
    persistenceLogits: [0, 0, 0, 0, 0, 1, 0, 0], value: 0, hidden: [] };
  const independent = (logits, names) => names[logits.reduce((best, value, index) => value > logits[best] ? index : best, 0)];
  assert.deepEqual([independent(step.actionLogits, HAND_ACTION_NAMES), independent(step.effectorLogits, EFFECTOR_NAMES),
    independent(step.targetLogits, TARGET_NAMES)], ["punch", "primary", "low"]);
  assert.equal(deployableTactics(view).some((row) => row.action === "punch" && row.effector === "primary" && row.target === "low"),
    false, "the independently-argmaxed triple is not a legal tuple");
  // What the conditional mask answers instead: `punch` still wins the action
  // head, and the effector and aim are then argmaxed over what a punch can
  // actually do -- the empty hand, and vital or high.
  const tactic = recurrentTactic(view, step, argmaxHeadPick);
  assert.deepEqual({ action: tactic.action, effector: tactic.effector, target: tactic.target },
    { action: "punch", effector: "secondary", target: "high" });
  // The sixth head takes no part in any of that -- it is unmasked, so its argmax
  // is its own index and nothing the action mask did can move it. Index 5 is
  // 0.60 s, spelled as the number a controller acts on rather than as the index.
  assert.equal(tactic.persistenceSeconds, 0.60);
  assert.equal(tactic.indices.persistence, 5);
});

/**
 * The grid itself: the three properties the sixth head's correctness rests on,
 * each bounded from both sides.
 *
 * A grid missing `UNLEARNED_PERSISTENCE` makes a learned dwell incomparable with
 * every artifact trained before it. A grid reaching past `MIN_PERSISTENCE` or
 * `MAX_PERSISTENCE` names a dwell `researchLabelMind`'s clamp then replaces,
 * which is an importance ratio evaluated at an action that was not taken. A grid
 * short of them cannot ask for the window's own ends. And a non-uniform grid
 * spends a flat entropy bonus unequally per second of dwell.
 *
 * **The literals are checked against the derivation that looks equivalent**, and
 * the arithmetic is not what the sketch for this change predicted: `0.1 + 3 * 0.1`
 * *is* exactly `0.4`. It is `0.30000000000000004` and `0.7000000000000001` that
 * a generated grid gets wrong, at `i = 2` and `i = 6`, and `(i + 1) / 10`
 * reproduces all eight. Both are asserted, so the literal table cannot be
 * "tidied" into either spelling without being told which values move.
 */
test("the_persistence_grid_pins_the_window_the_unlearned_constant_and_a_uniform_step", () => {
  assert.equal(PERSISTENCE_SECONDS.length, 8);
  assert.equal(PERSISTENCE_SECONDS[0], MIN_PERSISTENCE);
  assert.equal(PERSISTENCE_SECONDS.at(-1), MAX_PERSISTENCE);
  assert.ok(PERSISTENCE_SECONDS.includes(UNLEARNED_PERSISTENCE),
    `${UNLEARNED_PERSISTENCE} is not one of ${PERSISTENCE_SECONDS}`);
  assert.equal(PERSISTENCE_SECONDS.indexOf(UNLEARNED_PERSISTENCE), 3);
  // Strictly ascending, and every step the same 0.10 to within the last bits a
  // decimal tenth costs. The upper bound is what a non-uniform grid trips.
  for (let index = 1; index < PERSISTENCE_SECONDS.length; index += 1) {
    const step = PERSISTENCE_SECONDS[index] - PERSISTENCE_SECONDS[index - 1];
    assert.ok(step > 0.0999999 && step < 0.1000001, `step ${index} is ${step}`);
  }
  // Both ends inside the clamp `research-policy.ts` applies, so no bin can be
  // silently replaced -- asserted from each side rather than by membership.
  for (const seconds of PERSISTENCE_SECONDS) {
    assert.equal(Math.max(MIN_PERSISTENCE, Math.min(MAX_PERSISTENCE, seconds)), seconds);
  }
  const generated = Array.from({ length: 8 }, (_, index) => 0.10 + index * 0.10);
  assert.deepEqual(generated.map((value, index) => value === PERSISTENCE_SECONDS[index]),
    [true, true, false, true, true, true, false, true],
    "a generated grid misses 0.30 and 0.70, and does not miss 0.40");
  assert.deepEqual(Array.from({ length: 8 }, (_, index) => (index + 1) / 10), [...PERSISTENCE_SECONDS]);
});

/**
 * The artifact's two counts, which were one number by coincidence.
 *
 * `producedOutputs` answered 25 against a contract of 26 by summing each head's
 * *logits*, and that was right only because a categorical over n names occupies
 * n contract slots. The persistence head is eight logits over one slot, so the
 * same sum answers 33 -- more than the contract it is compared against, and no
 * less derived-looking for it.
 *
 * **The provenance block is read off a real artifact and not off the two
 * exports**, because the exports agreeing with each other is not the claim. A
 * mutation battery found this: replacing the whole provenance line with
 * `producedOutputs: 99, producedLogits: 99` left the entire suite green, so
 * every number a reader of a PPO artifact sees was, until this line, unasserted.
 * `gammaPerSecond` and `persistenceSeconds` are in the same position and are
 * checked here for the same reason.
 */
test("an_artifact_counts_contract_slots_rather_than_logits", async () => {
  assert.equal(PPO_PRODUCED_OUTPUTS, 26);
  assert.equal(PPO_PRODUCED_LOGITS, 33);
  assert.equal(PPO_PRODUCED_LOGITS - PPO_PRODUCED_OUTPUTS, PERSISTENCE_SECONDS.length - 1);
  // The number the artifact is compared against, so "produced all of them" is a
  // statement rather than two constants that happen to agree.
  assert.equal(PPO_PRODUCED_OUTPUTS, META_OUTPUT_LAYOUT.width);
  assert.notEqual(PPO_PRODUCED_LOGITS, META_OUTPUT_LAYOUT.width);
  const trained = await trainPpo({ seed: 310013, solverSteps: 8, workers: 1 });
  const { provenance } = decodeResearchArtifact(trained.artifact).data;
  assert.equal(provenance.producedOutputs, 26);
  assert.equal(provenance.producedLogits, 33);
  assert.equal(provenance.contractOutputs, META_OUTPUT_LAYOUT.width);
  assert.equal(provenance.producedOutputs, provenance.contractOutputs,
    "a PPO artifact produces the whole contract now, and this is where a reader finds that");
  assert.deepEqual(provenance.persistenceSeconds, [...PERSISTENCE_SECONDS]);
  assert.equal(provenance.gammaPerSecond, PPO_GAMMA_PER_SECOND);
  assert.equal(provenance.traceLambda, PPO_TRACE_LAMBDA);
  // `unlearnedPersistence` was the field that said which number PPO wrote
  // instead of learning one. There is no such number now, so the field is gone
  // rather than left recording a constant nothing reads.
  assert.equal("unlearnedPersistence" in provenance, false);
});

/**
 * `PPO_POLICY_HEADS` says "in output-contract order", and the order is
 * load-bearing in a way nothing checked.
 *
 * Reversing the array left the whole suite green while silently changing the
 * flat weight layout that `flattenHeads`, `encodePpoResume` and the artifact
 * payload all depend on -- a resume written by one order and read by another is
 * a champion whose heads have swapped matrices, with every shape still valid
 * because several heads are near each other in size.
 *
 * Order is asserted **against `META_OUTPUT_LAYOUT`** rather than as a literal
 * list, because "output-contract order" is a claim about that table and a
 * literal here would be a second copy of it. The offsets are ascending exactly
 * when the head array is in contract order.
 */
test("the_policy_heads_are_in_output_contract_order_and_the_flat_layout_follows_it", () => {
  const offsetOf = { movement: META_OUTPUT_LAYOUT.movementAt, action: META_OUTPUT_LAYOUT.actionAt,
    effector: META_OUTPUT_LAYOUT.effectorAt, target: META_OUTPUT_LAYOUT.targetAt,
    stance: META_OUTPUT_LAYOUT.stanceAt, persistence: META_OUTPUT_LAYOUT.persistenceAt };
  assert.deepEqual([...PPO_POLICY_HEADS], Object.keys(offsetOf),
    "the head array and the output layout name the same heads");
  assert.deepEqual([...PPO_POLICY_HEADS],
    [...PPO_POLICY_HEADS].sort((a, b) => offsetOf[a] - offsetOf[b]),
    "the heads are not in ascending contract-offset order");
  // And the flat vector the resume and the payload are written from starts with
  // the first head in that order, which is what a reversal actually breaks.
  const built = initialPpoWeights(310013, "random");
  const flat = flattenHeads(built);
  assert.deepEqual(flat.slice(0, built.movement.weights.length), built.movement.weights);
  assert.deepEqual(flat.slice(-built.value.bias.length), built.value.bias);
  assert.equal(flat.length, [...PPO_POLICY_HEADS, "value"]
    .reduce((sum, name) => sum + built[name].weights.length + built[name].bias.length, 0));
  assert.notDeepEqual(flat.slice(0, built.persistence.weights.length), built.persistence.weights);
});

/**
 * `finiteLayer` validated each head's row count **against that same head**, so a
 * head of any size passed.
 *
 * `finiteLayer(weights.movement, weights.movement.rows, ...)` cannot fail; the
 * value head one line below passed a literal `1` and was the only one that meant
 * anything. The row counts come from the runtime name tables now, so a policy
 * with six action rows over a seven-name table is refused rather than deployed
 * with `recover` -- the one name in every legal mask -- off the end of its own
 * matrix.
 */
test("a_head_whose_row_count_is_not_its_runtime_table_is_refused_by_name", () => {
  assert.doesNotThrow(() => new RecurrentPolicy(weights()));
  for (const [name, table] of Object.entries(HEAD_TABLES)) {
    const short = weights(); short[name] = layer(table.length - 1, GRU_UNITS);
    assert.throws(() => new RecurrentPolicy(short),
      new RegExp(`${name} head layer must be a finite ${table.length}x${GRU_UNITS} matrix`), name);
    const missing = weights(); delete missing[name];
    assert.throws(() => new RecurrentPolicy(missing), new RegExp(`${name} head layer must be`), `${name} absent`);
  }
  // The initializer the trainer actually uses agrees with the runtime tables,
  // which is the pairing that would otherwise be checked only by a bout.
  assert.doesNotThrow(() => new RecurrentPolicy(initialPpoWeights(310013, "random")));
  assert.doesNotThrow(() => new RecurrentPolicy(initialPpoWeights(310013, "dagger")));
});
