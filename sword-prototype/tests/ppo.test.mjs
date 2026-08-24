import test from "node:test";
import assert from "node:assert/strict";

import { GRU_UNITS, RecurrentPolicy, maskedArgmax, maskedCategorical } from "../src/learning/recurrent-network.ts";
import { clippedPolicyTerm, clippedValueLoss, deterministicMinibatchOrder, generalizedAdvantages,
  tacticalBoundaryReward, encodePpoResume, equalBudgetPpoArms, freezeOpponentLeague, indexedLeagueOpponent,
  ppoHeadUpdate, selectPpoArm } from "../src/learning/ppo.ts";
import { opponentRoute, trainPpo } from "../scripts/train-ppo.mjs";

const layer = (rows, columns, bias = 0) => ({ rows, columns, weights: Array(rows * columns).fill(0), bias: Array(rows).fill(bias) });
const weights = () => ({ inputSize: 3, units: GRU_UNITS,
  update: layer(GRU_UNITS, GRU_UNITS + 3), reset: layer(GRU_UNITS, GRU_UNITS + 3),
  candidate: layer(GRU_UNITS, GRU_UNITS + 3), movement: layer(5, GRU_UNITS),
  action: layer(6, GRU_UNITS), value: layer(1, GRU_UNITS) });

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

test("an_indexed_arm_boundary_resume_is_byte_identical_to_an_uninterrupted_havok_run", async () => {
  const config = { seed: 310013, solverSteps: 8, workers: 1 };
  const uninterrupted = await trainPpo(config); const interrupted = await trainPpo({ ...config, stopAfterJobs: 1 });
  assert.equal(interrupted.complete, false);
  const resumed = await trainPpo({ ...config, resumeBytes: interrupted.resume });
  for (const name of ["artifact", "report", "resume"]) assert.deepEqual(resumed[name], uninterrupted[name]);
});

test("random_and_dagger_initializations_receive_the_same_solver_step_budget", () => {
  const arms = equalBudgetPpoArms(310013, 1800);
  assert.deepEqual(arms.map((arm) => arm.initialization), ["random", "dagger"]);
  assert.deepEqual(arms.map((arm) => arm.solverSteps), [1800, 1800]);
  assert.throws(() => selectPpoArm([{ split: "test", arm: "random", macro: 1, worstCell: 1 }]), /cannot read test rows/);
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

test("ppo_clipping_and_advantages_match_the_pinned_hand_calculation", () => {
  assert.equal(clippedPolicyTerm(0.5, 0.75, 2, 0.2), 2.4);
  assert.equal(clippedPolicyTerm(0.5, 0.25, -2, 0.2), -1.6);
  assert.equal(clippedValueLoss(1, 2, 0, 0.2), 2);
  const advantages = generalizedAdvantages([
    { reward: 1, value: 0.5, nextValue: 0.4, terminal: false },
    { reward: 2, value: 0.4, nextValue: 0, terminal: true },
  ], 0.9, 0.8);
  assert.ok(Math.abs(advantages[1] - 1.6) < 1e-12);
  assert.ok(Math.abs(advantages[0] - 2.012) < 1e-12);
});

test("ppo_updates_policy_weights_value_head_and_reports_clipping_and_entropy", () => {
  const heads = { movement: layer(2, 2), action: layer(2, 2), value: layer(1, 2) };
  const report = ppoHeadUpdate(heads, [{ hidden: [1, -0.5], movement: 0, action: 1,
    movementSupported: [0, 1], actionSupported: [0, 1], oldMovementProbability: 0.5,
    oldActionProbability: 0.5, oldValue: 0, target: 1, advantage: 1 }], 310013);
  assert.notDeepEqual(heads.movement.weights, [0, 0, 0, 0]);
  assert.notDeepEqual(heads.action.weights, [0, 0, 0, 0]);
  assert.notDeepEqual(heads.value.weights, [0, 0]);
  assert.ok(report.entropy > 0); assert.ok(report.valueLoss > 0);
  assert.ok(report.clippedGradientNorm <= 0.5 + 1e-12);
});

test("truncated_bptt_moves_all_three_gru_gate_matrices_under_the_same_clip", () => {
  const recurrent = () => ({ ...layer(2, 3), weights: Array(6).fill(0.03) });
  const output = (rows) => ({ ...layer(rows, 2), weights: Array(rows * 2).fill(0.08) });
  const network = { update: recurrent(), reset: recurrent(), candidate: recurrent(),
    movement: output(2), action: output(2), value: output(1) };
  const before = [network.update, network.reset, network.candidate].map((gate) => [...gate.weights]);
  const boundary = (input, previousHidden, hidden, movement, action) => ({ input, previousHidden, hidden, movement, action,
    movementSupported: [0, 1], actionSupported: [0, 1], oldMovementProbability: 0.5,
    oldActionProbability: 0.5, oldValue: 0, target: 1, advantage: 1 });
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
