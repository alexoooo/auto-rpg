import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { LOOKAHEAD_DEPTH, LOOKAHEAD_WIDTH, LookaheadController, boundedLookahead, lookaheadMind,
  shouldReplan, supportedTacticPairs } from "../src/learning/lookahead.ts";
import { TACTICAL_STATE_COLUMNS, fitTacticalModel, requireCalibration } from "../src/learning/tactical-model.ts";
import { actionsFor, collectTacticalTrace, lookaheadTacticCellSchedule } from "../scripts/train-lookahead.mjs";
import { runResearchBout } from "../scripts/research-havok.mjs";
import { deployableActions } from "../src/learning/meta.ts";
import { researchMatrix } from "../src/learning/research-matrix.ts";
import { researchLabelMind } from "../src/learning/research-policy.ts";
import { HAND_ACTION_NAMES, MOVEMENT_NAMES } from "../src/options.ts";
import { freshIntent } from "../src/action-primitives.ts";
import { assertCompleteView, publishedFixture } from "./fixtures/view.mjs";

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
  // The refusal, which nothing asserted: replacing the throw with
  // `return LOADOUT_ACTIONS["sword+empty"]` -- the exact silent default the
  // table replaced a `startsWith` chain to kill -- left the whole suite green,
  // so the argument for the table was untested and the defect could come back
  // as a one-line "fix" for a missing row. `club+empty` is the loadout the
  // reasoning points at and no harness builds; `toString` is here because the
  // row lookup is `Object.hasOwn` and an `in` would answer the prototype.
  assert.throws(() => actionsFor("club+empty"), /lookahead schedule has no tactic row for loadout "club\+empty"/);
  assert.throws(() => actionsFor("toString"), /lookahead schedule has no tactic row for loadout "toString"/);
});

test("the_training_schedule_offers_exactly_what_the_runtime_mask_offers", async () => {
  // The mask is read off a **real published body**, one short Havok bout per
  // cell, rather than off a hand-rolled view. A synthetic fixture would be a
  // second claim about what a body publishes, and the divergence this test
  // exists for is exactly a claim about a body that was wrong: the schedule
  // said an axe hand and a free empty hand could not punch, and the fighter it
  // was describing could.
  //
  // `lookaheadMind` plans over this mask and calls `requireCalibration` on every
  // pair it plans, so a name here the schedule never spends budget on is a throw
  // on the first replan, not a missing row.
  const seen = new Set(); const cells = [];
  researchMatrix("train", 310013).forEach((job, jobIndex) => { const cell = `${job.unit}/${job.loadout}`;
    if (!seen.has(cell)) { seen.add(cell); cells.push({ cell, job, jobIndex }); } });
  assert.equal(cells.length, 13);
  const runtime = {}; const scheduled = {};
  for (const { cell, job, jobIndex } of cells) {
    // Every distinct mask the body publishes across the window, not the first
    // one: a set with two members would mean the capability moved mid-probe and
    // that a per-loadout schedule row cannot describe it.
    const masks = new Set();
    await runResearchBout({ ...job, index: jobIndex }, () => researchLabelMind("schedule-mask-probe",
      () => ({ movement: "hold", action: "recover", persistence: 0.4 })), 48, null, {
        onSample({ view }) { masks.add(HAND_ACTION_NAMES.filter((name) => deployableActions(view).has(name)).join("+")); },
      });
    runtime[cell] = [...masks];
    scheduled[cell] = [actionsFor(job.loadout).join("+")];
  }
  assert.deepEqual(runtime, scheduled);
});

/** One short Havok bout per loadout, kept as a fixture a test can sever a hand on. */
const publishedBody = async (loadout) => {
  const jobs = researchMatrix("train", 310013);
  const at = jobs.findIndex((job) => job.unit === "warrior" && job.loadout === loadout);
  let captured = null;
  await runResearchBout({ ...jobs[at], index: at }, () => researchLabelMind("severance-fixture",
    () => ({ movement: "hold", action: "recover", persistence: 0.4 })), 48, null, {
      onSample({ view }) { captured ??= publishedFixture(view, `${loadout} view`); },
    });
  return captured;
};

test("a_severed_hand_moves_the_mask_and_the_lookahead_plans_over_what_it_can_predict", async () => {
  // The schedule keys on the **starting** loadout; the mask keys on what is
  // still attached. They agree on an intact body and come apart the moment a
  // hand comes off, which is why the schedule/mask test above -- 48 solver steps
  // on intact bodies -- cannot see this and why adding a row would not fix it:
  // rows chase loadouts and this chases states, of which there are more.
  //
  // A severed bow hand is the sharp case. `bow` is two-handed, so the empty hand
  // is welded to the stave and cannot punch; cut the bow hand off and the weld
  // goes with it, the empty hand is free, and `punch` appears in a mask whose
  // schedule row is `cover, shoot, recover`. `lookaheadMind` used to ask
  // `requireCalibration` for every pair it could name and throw
  // `tactic "close+punch" has no calibrated model` mid-bout. Severance is
  // routine: the null control reports 10 severs in 120 bouts.
  //
  // Distinguishable per action, so the plan is a choice rather than a tie-break:
  // wherever `punch` is both offered and trained it must win, and where it is
  // offered and untrained the search must land on `recover` rather than throw.
  const DELTAS = { punch: { vitalityPotential: 0.30 }, recover: { vitalityPotential: 0.10 } };
  const LIMITS = { signedReachError: 1, contactBrier: 1, vitalityDeltaError: 1 };
  const model = (loadout) => fitTacticalModel(MOVEMENT_NAMES.flatMap((movement) =>
    actionsFor(loadout).map((action) => ({ ...row(`${movement}+${action}`, DELTAS[action] ?? {}),
      bodyLoadout: `warrior/${loadout}` }))));
  const sever = (view, ...hands) => { const next = structuredClone(view);
    for (const name of hands) next.self.hands[name].lost = true; return assertCompleteView(next); };

  const bow = await publishedBody("bow+empty"); const sword = await publishedBody("sword+empty");
  const cases = {
    "bow+empty, bow hand gone": ["bow+empty", sever(bow, "primary")],
    "sword+empty, sword hand gone": ["sword+empty", sever(sword, "primary")],
    "sword+empty, both hands gone": ["sword+empty", sever(sword, "primary", "secondary")],
  };
  const record = {}; let inert = null;
  for (const [label, [loadout, view]] of Object.entries(cases)) {
    let planned = null;
    const mind = lookaheadMind(model(loadout), `warrior/${loadout}`, LIMITS, LOOKAHEAD_DEPTH, LOOKAHEAD_WIDTH,
      (_view, _features, decision) => { planned = `${decision.movement}+${decision.action}`; });
    const command = mind.decide(view, 1 / 240);
    if (label.includes("both")) inert = command;
    record[label] = { mask: HAND_ACTION_NAMES.filter((name) => deployableActions(view).has(name)).join("+"),
      scheduled: actionsFor(loadout).join("+"), planned };
  }
  assert.deepEqual(record, {
    "bow+empty, bow hand gone": { mask: "cover+punch+recover", scheduled: "cover+shoot+recover", planned: "close+recover" },
    "sword+empty, sword hand gone": { mask: "cover+punch+recover", scheduled: "cover+cut+thrust+punch+recover", planned: "close+punch" },
    "sword+empty, both hands gone": { mask: "", scheduled: "cover+cut+thrust+punch+recover", planned: null },
  });
  // The bow cell really has no `punch` model -- the plan declined to search it
  // rather than the schedule having quietly grown one.
  assert.throws(() => requireCalibration(model("bow+empty"), "close+punch", "warrior/bow+empty", LIMITS),
    /tactic "close\+punch" has no calibrated model/);
  // A body that can do nothing at all is inert rather than a refusal, which is
  // what `researchLabelMind` answers on the same mask; the whole command against
  // a fresh one, because two leaves of nineteen is how "goes inert" passed for a
  // command that thrust.
  assert.deepEqual(inert, freshIntent());
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
  // The other side of the filter above. Declining one untrained cell is the
  // search stating its own competence; declining *every* cell the body can
  // perform is a model that cannot fly this body at all, and that is a request
  // the control cannot honour -- so it is refused by name, naming the actions it
  // could not predict rather than whichever one it happened to ask about first.
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
    /lookahead refuses centipede\/bite: no calibrated model for any tactic on \[bite, recover\]/);
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
