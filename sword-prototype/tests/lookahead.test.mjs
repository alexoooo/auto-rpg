import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { LOOKAHEAD_DEPTH, LOOKAHEAD_WIDTH, LookaheadController, boundedLookahead, lookaheadMind,
  shouldReplan, supportedTacticPairs } from "../src/learning/lookahead.ts";
import { TACTICAL_STATE_COLUMNS, fitTacticalModel, requireCalibration } from "../src/learning/tactical-model.ts";
import { collectTacticalTrace, lookaheadTacticCellSchedule } from "../scripts/train-lookahead.mjs";
import { MOVEMENT_NAMES } from "../src/options.ts";
import { assertCompleteView } from "./fixtures/view.mjs";

const state = (overrides = {}) => ({ reachMargin: -0.5, facingError: 0.2, threatAlignment: 0.1,
  contactProbability: 0.05, vitalityPotential: 0, ...overrides });
const row = (tactic, delta, contact = false) => { const before = state(); return { tactic, before,
  after: Object.fromEntries(TACTICAL_STATE_COLUMNS.map((name) => [name, before[name] + (delta[name] ?? 0)])), contact }; };

test("the_tactical_model_uses_only_published_versioned_features", () => {
  const model = fitTacticalModel([row("close+cover", { reachMargin: 0.1 })]);
  assert.equal(model.version, 1); assert.deepEqual(model.featureNames, TACTICAL_STATE_COLUMNS);
  assert.deepEqual(Object.keys(model.tactics["close+cover"].delta), TACTICAL_STATE_COLUMNS);
  assert.match(model.digest, /^[0-9a-f]{8}$/);
  const source = readFileSync(new URL("../src/learning/lookahead.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from "\.\.\/(fighter|combat|arena|scene)\.ts"/);
  assert.throws(() => fitTacticalModel([{ ...row("close+cover", {}), split: "validation" }]), /cannot read validation rows/);
});

test("lookahead_expands_every_supported_pair_in_fixed_order", () => {
  assert.deepEqual(supportedTacticPairs(["close", "hold"], ["cover", "cut"], (pair) => pair.action !== "cut" || pair.movement === "hold"), [
    { movement: "close", action: "cover" }, { movement: "hold", action: "cover" }, { movement: "hold", action: "cut" },
  ]);
});

test("the_training_schedule_covers_every_body_loadout_and_only_compatible_natural_attacks", () => {
  const train = lookaheadTacticCellSchedule("train", 310013); const validation = lookaheadTacticCellSchedule("validation", 310013);
  assert.deepEqual(train.map(({ cell, movement, action }) => [cell, movement, action]),
    validation.map(({ cell, movement, action }) => [cell, movement, action]));
  assert.equal(new Set(train.map((task) => task.cell)).size, 13);
  const units = new Set(train.map((task) => task.unit)); assert.deepEqual([...units], ["warrior", "broot", "centipede"]);
  const centipede = train.filter((task) => task.unit === "centipede");
  assert.deepEqual([...new Set(centipede.map((task) => task.action))], ["bite", "recover"]);
  assert.equal(centipede.length, MOVEMENT_NAMES.length * 2);
});

test("every_scheduled_centipede_tactic_runs_a_complete_havok_trace_window", async () => {
  const tasks = lookaheadTacticCellSchedule("train", 310013).filter((task) => task.unit === "centipede");
  assert.equal(tasks.length, 10);
  for (const task of tasks) {
    const trace = await collectTacticalTrace({ seed: 310013, solverSteps: 48, split: "train", jobIndex: task.jobIndex,
      forcedPair: { movement: task.movement, action: task.action } });
    assert.equal(trace.solverSteps, 48); assert.ok(trace.rows.length >= 1, `${task.movement}+${task.action}`);
    assert.ok(trace.rows.every((row) => row.bodyLoadout === "centipede/natural:bite" &&
      row.tactic === `${task.movement}+${task.action}`));
  }
});

test("lookahead_respects_the_exact_depth_width_and_node_budget", () => {
  const pairs = [{ movement: "close", action: "cover" }, { movement: "hold", action: "cut" }];
  const model = fitTacticalModel(pairs.map((pair) => row(`${pair.movement}+${pair.action}`, {})));
  const result = boundedLookahead(model, state(), pairs);
  assert.equal(result.sequence.length, LOOKAHEAD_DEPTH); assert.equal(LOOKAHEAD_WIDTH, 6);
  assert.equal(result.expandedNodes, 74);
});

test("lookahead_prefers_close_over_disengage_when_no_attack_can_land", () => {
  const pairs = [{ movement: "disengage", action: "cover" }, { movement: "close", action: "cover" }];
  const model = fitTacticalModel([
    row("disengage+cover", { reachMargin: -0.2, vitalityPotential: -0.01 }),
    row("close+cover", { reachMargin: 0.2, facingError: -0.02 }),
  ]);
  assert.equal(boundedLookahead(model, state(), pairs).pair.movement, "close");
});

test("lookahead_prefers_a_legal_attack_over_orbiting_in_range", () => {
  const pairs = [{ movement: "circle-left", action: "cover" }, { movement: "hold", action: "cut" }];
  const model = fitTacticalModel([
    row("circle-left+cover", { facingError: 0.01 }),
    row("hold+cut", { contactProbability: 0.4, vitalityPotential: 0.1 }, true),
  ]);
  assert.equal(boundedLookahead(model, state({ reachMargin: 0.1 }), pairs).pair.action, "cut");
});

test("a_committed_attack_is_not_reaimed_by_the_next_prediction", () => {
  assert.equal(shouldReplan(false, false, false), false);
  assert.equal(shouldReplan(true, false, false), true);
  assert.equal(shouldReplan(false, true, false), true);
  const pair = { movement: "hold", action: "cut" }; const model = fitTacticalModel([row("hold+cut", { contactProbability: 0.2 })]);
  const controller = new LookaheadController(); const first = controller.choose(model, state(), [pair],
    { tacticComplete: true, capabilityChanged: false, predictionGuardFired: false });
  assert.deepEqual(first.pair, pair);
  assert.equal(controller.choose(model, state({ facingError: -1 }), [pair],
    { tacticComplete: false, capabilityChanged: false, predictionGuardFired: false }), null);
  assert.deepEqual(controller.current(), pair);
});

test("calibration_failure_refuses_the_exact_body_and_loadout", () => {
  const model = fitTacticalModel([row("hold+cut", { reachMargin: 0.4, contactProbability: 0.1 })]);
  assert.throws(() => requireCalibration(model, "hold+cut", "centipede/sword", {
    signedReachError: 0.01, contactBrier: 0.01, vitalityDeltaError: 0.01,
  }), /lookahead refuses centipede\/sword: tactic "hold\+cut" has no calibrated model/);
});

test("the_runtime_mind_refuses_an_uncalibrated_exact_body_before_planning", () => {
  const model = fitTacticalModel([{ ...row("hold+cut", {}), bodyLoadout: "warrior/sword+empty" }]);
  const mind = lookaheadMind(model, "centipede/bite", { signedReachError: 1, contactBrier: 1, vitalityDeltaError: 1 }, 1, 1);
  // A whole view rather than the seven fields the refusal happens to read. The
  // point of this test is that nothing is planned, and a fixture trimmed to the
  // reading path cannot tell "it refused first" from "it read past the end of a
  // half-built object and got `undefined`". `assertCompleteView` is what says
  // this is a body a `describe` could have written.
  const hand = (outboard) => ({ lost: true, weapon: "empty", tipSpeed: 0, tipVelocity: { x: 0, y: 0, z: 0 },
    reach: 0, shoulder: { x: 0, y: 1, z: 0 }, tip: { x: 0, y: 1, z: 0 }, outboard });
  const body = (z) => ({ unit: "centipede", ground: { x: 0, y: 0, z }, shoulder: { x: 0, y: 1, z }, facing: 0,
    tip: { x: 0, y: 1, z }, tipSpeed: 0, reach: 1, crownHeight: 0.5, vitalHeight: 0.28, collisionRadius: 0.2,
    crouch: 0, trunkLean: 0, trunkTwist: 0, vitality: 1, health: {},
    naturalAttacks: { bite: { reach: 0.62, ready: true, active: false } },
    hands: { primary: hand(1), secondary: hand(-1) } });
  const view = assertCompleteView({ self: body(0), opponent: body(1), projectiles: [], measure: 1, clock: 0 });
  assert.throws(() => mind.decide(view, 1 / 240),
    /lookahead refuses centipede\/bite: tactic "close\+bite" has no calibrated model/);
});

test("the_same_trace_replays_the_same_tactics_and_diagnostic_scores", () => {
  const pairs = [{ movement: "close", action: "cover" }, { movement: "hold", action: "cut" }];
  const rows = [row("close+cover", { reachMargin: 0.1 }), row("hold+cut", { contactProbability: 0.2, vitalityPotential: 0.05 })];
  const a = boundedLookahead(fitTacticalModel(rows), state(), pairs); const b = boundedLookahead(fitTacticalModel(rows), state(), pairs);
  assert.deepEqual(a.sequence, b.sequence); assert.deepEqual(a.diagnostics, b.diagnostics); assert.equal(a.score, b.score);
});

test("reordering_object_properties_does_not_change_the_selected_sequence", () => {
  const pairs = [{ movement: "close", action: "cover" }, { movement: "hold", action: "cut" }];
  const model = fitTacticalModel([row("close+cover", { reachMargin: 0.1 }), row("hold+cut", { contactProbability: 0.1 })]);
  const reordered = { vitalityPotential: 0, contactProbability: 0.05, threatAlignment: 0.1,
    facingError: 0.2, reachMargin: -0.5 };
  assert.deepEqual(boundedLookahead(model, state(), pairs).sequence, boundedLookahead(model, reordered, pairs).sequence);
  const tied = fitTacticalModel(pairs.map((pair) => row(`${pair.movement}+${pair.action}`, {})));
  assert.deepEqual(boundedLookahead(tied, state(), pairs).pair, pairs[0]);
});
