import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { LOOKAHEAD_DEPTH, LOOKAHEAD_WIDTH, LookaheadController, boundedLookahead, exactLookaheadNodeBudget,
  lookaheadMind, plannedTacticKey, shouldReplan, supportedPlannedTactics } from "../src/learning/lookahead.ts";
import { APPROACH_MOVEMENTS, TACTICAL_MODEL_VERSION, TACTICAL_STATE_COLUMNS, calibrateTacticalModel, calibrationRefusal,
  calibrationSeverity, fitTacticalModel, reachLimitFor, requireCalibration } from "../src/learning/tactical-model.ts";
import { MIN_SPLIT_STEPS_PER_JOB, actionsFor, collectTacticalTrace, identicalSampleKeys,
  assertLookaheadLedgerPrefix, decodeLookaheadResume, finalLookaheadReport, lookaheadNotices, lookaheadReport, lookaheadRunConfig,
  lookaheadTacticCellSchedule, makeLookaheadPartialLedgerRow, modelCalibrationScore, reconcileLookaheadCheckpoint,
  selectCalibratedCandidate, splitWarningFor, tacticsFor, trainLookahead,
  writeLookaheadOutput } from "../scripts/train-lookahead.mjs";
import { runResearchBout } from "../scripts/research-havok.mjs";
import { canonicalJson } from "../src/learning/artifact.ts";
import { EngagementTracker, attackOpportunity, opportunityKeyForContact } from "../src/learning/engagement.ts";
import { UNLEARNED_PERSISTENCE, UNLEARNED_STANCE, deployableActions, deployableTactics } from "../src/learning/meta.ts";
import { researchMatrix } from "../src/learning/research-matrix.ts";
import { researchLabelMind } from "../src/learning/research-policy.ts";
import { HAND_ACTION_NAMES, MOVEMENT_NAMES, composeTactic, handActionOption, movementIntent } from "../src/options.ts";
import { freshIntent } from "../src/action-primitives.ts";
import { probeLabel } from "./fixtures/label.mjs";
import { RESEARCH_LABEL_FIELDS } from "./fixtures/label.mjs";
import { assertCompleteView, publishedFixture } from "./fixtures/view.mjs";
import { CALIBRATION_BUDGETS, CALIBRATION_RECORD_8X, admittedByLimits,
  calibrationRecordRows } from "./fixtures/calibration-record.mjs";
import { decodeResearchArtifact, LOOKAHEAD_CALIBRATION_LIMITS } from "../src/learning/deployment.ts";

const state = (overrides = {}) => ({ reachMargin: -0.5, facingError: 0.2, threatAlignment: 0.1,
  contactProbability: 0.05, vitalityPotential: 0, ...overrides });
const row = (tactic, delta, contact = false) => { const before = state(); return { tactic, before,
  after: Object.fromEntries(TACTICAL_STATE_COLUMNS.map((name) => [name, before[name] + (delta[name] ?? 0)])), contact }; };
const cell = (movement, action, effector, target) => Object.freeze({ movement, action, effector, target });
const LOADOUTS = ["sword+empty", "sword+shield", "sword+buckler", "sword+axe", "axe+empty", "bow+empty",
  "empty+empty", "natural:bite"];

test("the_tactical_model_uses_only_published_versioned_features", () => {
  const model = fitTacticalModel([row("close+cover+primary+threat", { reachMargin: 0.1 })]);
  // 2, not 1: the cell key grammar is part of this contract, and stage C2c
  // widened it from `movement+action` to `movement+action+effector+target`. A
  // model fitted under the old grammar decodes cleanly and then matches no cell
  // the beam asks for, so the version is what makes `deployedResearchMind` say
  // which artifact it is looking at instead of reporting an empty search.
  assert.equal(model.version, 2); assert.equal(TACTICAL_MODEL_VERSION, 2);
  assert.deepEqual(model.featureNames, TACTICAL_STATE_COLUMNS);
  assert.deepEqual(Object.keys(model.tactics["close+cover+primary+threat"].delta), TACTICAL_STATE_COLUMNS);
  assert.match(model.digest, /^[0-9a-f]{8}$/);
  const source = readFileSync(new URL("../src/learning/lookahead.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from "\.\.\/(fighter|combat|arena|scene)\.ts"/);
  assert.throws(() => fitTacticalModel([{ ...row("close+cover+primary+threat", {}), split: "validation" }]), /cannot read validation rows/);
});

test("one_key_grammar_is_spelled_once_and_the_beam_and_the_schedule_both_read_it", () => {
  // The whole record, not the action half: a key that dropped the effector would
  // still be a legal-looking string and would collide two cells the schedule
  // spends separate budgets on.
  assert.equal(plannedTacticKey(cell("close", "cover", "secondary", "vital")), "close+cover+secondary+vital");
  const source = readFileSync(new URL("../src/learning/lookahead.ts", import.meta.url), "utf8");
  const trainer = readFileSync(new URL("../scripts/train-lookahead.mjs", import.meta.url), "utf8");
  // The grammar as a template literal must appear exactly once in the tree, and
  // in the file that exports the function. Three sites spelled it before C2c and
  // lengthening two of three is a search that refuses every cell it plans.
  const template = /`\$\{[a-zA-Z.]+\.movement\}\+\$\{/g;
  assert.equal([...source.matchAll(template)].length, 1);
  assert.equal([...trainer.matchAll(template)].length, 0);
});

test("the_trace_and_the_runtime_hold_one_stance_and_one_persistence_by_name", () => {
  // **The gap `docs/measurements.md` named "a real gap" and left open.** A trace
  // collected at one stance and executed at another is a model calibrated for a
  // body that never fights, and the two sides are `scripts/train-lookahead.mjs`
  // and `src/learning/lookahead.ts`.
  //
  // The record said *nothing* would catch it, and that was half wrong. Measured
  // over the whole suite: the trainer collecting at `stance: "compact"` is 530
  // pass, and at `persistence: 0.8` is 530 pass -- the trainer half really is
  // invisible -- while the runtime *executing* at `stance: "compact"` takes
  // `the_plan_executes_the_effector_and_the_aim_it_searched` red. Half of it was
  // already caught.
  //
  // The behavioural test is genuinely unavailable: `researchLabelMind` re-decides
  // on a persistence timer and `lookaheadMind` on skill boundaries, so the two
  // seams produce different bouts by design even when they agree about the tuple.
  // What is available is the same construct as the key-grammar pin above -- every
  // place either file names a stance or a persistence, it names the constant, so
  // neither can hold one of its own. A prose mention of `stance: "compact"` in
  // either file would fail this too, which is the right answer: a comment claiming
  // a stance the code does not hold is the defect one file up.
  const sources = {
    "src/learning/lookahead.ts": readFileSync(new URL("../src/learning/lookahead.ts", import.meta.url), "utf8"),
    "scripts/train-lookahead.mjs": readFileSync(new URL("../scripts/train-lookahead.mjs", import.meta.url), "utf8"),
  };
  const named = (text, field) => [...new Set([...text.matchAll(new RegExp(`${field}:\\s*(\\S+?)[,;)\\s]`, "g"))].map((m) => m[1]))];
  assert.deepEqual(Object.fromEntries(Object.entries(sources).map(([name, text]) =>
    [name, { stance: named(text, "stance"), persistence: named(text, "persistence") }])), {
    "src/learning/lookahead.ts": { stance: ["UNLEARNED_STANCE"], persistence: ["UNLEARNED_PERSISTENCE"] },
    "scripts/train-lookahead.mjs": { stance: ["UNLEARNED_STANCE"], persistence: ["UNLEARNED_PERSISTENCE"] },
  });
  // And the constants themselves as literals, because a pin that compares two
  // files through one symbol cannot see the symbol move.
  assert.equal(UNLEARNED_STANCE, "action-default");
  assert.equal(UNLEARNED_PERSISTENCE, 0.4);
});

test("lookahead_expands_every_legal_tuple_in_fixed_order", () => {
  const legal = [{ action: "cover", effector: "primary", target: "threat" },
    { action: "cut", effector: "primary", target: "vital" }];
  // The whole cross product against a freshly built one, movement outermost.
  // The `supported` predicate this used to take is gone: legality arrives from
  // `deployableTactics` already applied, so what is left to assert is the order
  // and that nothing but the four planned fields survives the copy.
  assert.deepEqual(supportedPlannedTactics(["close", "hold"], legal), [
    cell("close", "cover", "primary", "threat"), cell("close", "cut", "primary", "vital"),
    cell("hold", "cover", "primary", "threat"), cell("hold", "cut", "primary", "vital"),
  ]);
});

test("the_training_schedule_covers_every_body_loadout_and_only_compatible_natural_attacks", () => {
  const train = lookaheadTacticCellSchedule("train", 310013); const validation = lookaheadTacticCellSchedule("validation", 310013);
  assert.deepEqual(train.map((task) => [task.cell, plannedTacticKey(task)]),
    validation.map((task) => [task.cell, plannedTacticKey(task)]));
  assert.equal(new Set(train.map((task) => task.cell)).size, 15);
  const units = new Set(train.map((task) => task.unit)); assert.deepEqual([...units], ["warrior", "broot", "centipede"]);
  const centipede = train.filter((task) => task.unit === "centipede");
  // The whole tuple list, because "only compatible natural attacks" is now a
  // claim about the effector as well: a centipede's `recover` runs on the
  // natural effector and its `bite` may only be aimed at the vitals.
  assert.deepEqual([...new Set(centipede.map((task) => `${task.action}|${task.effector}|${task.target}`))],
    ["bite|natural|vital", "recover|natural|threat", "recover|natural|vital"]);
  assert.equal(centipede.length, MOVEMENT_NAMES.length * 3);
  // The refusal, which nothing asserted: replacing the throw with
  // `return LOADOUT_TACTICS["sword+empty"]` -- the exact silent default the
  // table replaced a `startsWith` chain to kill -- left the whole suite green,
  // so the argument for the table was untested and the defect could come back
  // as a one-line "fix" for a missing row. `club+empty` is the loadout the
  // reasoning points at and no harness builds; `toString` is here because the
  // row lookup is `Object.hasOwn` and an `in` would answer the prototype. Both
  // readers of the row are checked, because C2c split one function into two and
  // a guard on only the one a test happened to call is a guard that fails open.
  for (const missing of ["club+empty", "toString"]) {
    assert.throws(() => actionsFor(missing), new RegExp(`lookahead schedule has no tactic row for loadout "${missing.replace("+", "\\+")}"`));
    assert.throws(() => tacticsFor(missing), new RegExp(`lookahead schedule has no tactic row for loadout "${missing.replace("+", "\\+")}"`));
  }
});

test("the_widened_schedule_costs_exactly_what_sessions_20_and_21_will_budget_from", () => {
  // **The numbers session 20 derives its ceilings from, pinned rather than
  // written down.** Nothing pinned the old 240 and the plan's own copy of it
  // went stale twice. The widening is `(movement, action)` to
  // `(movement, action, effector, target)`: 3.23x, not the ~19x the plan priced,
  // because the stance is measured out of the key -- `UNLEARNED_STANCE` carries
  // that measurement, and this test is what would notice it being put back,
  // because every figure here would be multiplied by six.
  const train = lookaheadTacticCellSchedule("train", 310013);
  assert.equal(train.length, 945);
  assert.ok(train.every((task) => !("stance" in task)), "the schedule enumerates no stance");
  // The two fields the plan does not decide, as literals rather than as the
  // symbols the rest of this file compares through: a test that reads the same
  // constant on both sides of an equality cannot see the constant move, and both
  // of these were chosen by a measurement rather than defaulted.
  assert.equal(UNLEARNED_STANCE, "action-default");
  assert.equal(UNLEARNED_PERSISTENCE, 0.4);
  assert.deepEqual(Object.fromEntries(LOADOUTS.map((loadout) => {
    const cells = tacticsFor(loadout).length * MOVEMENT_NAMES.length;
    return [loadout, { tuples: tacticsFor(loadout).length, cells, nodesPerReplan: exactLookaheadNodeBudget(cells) }];
  })), {
    "sword+empty": { tuples: 16, cells: 80, nodesPerReplan: 3440 },
    "sword+shield": { tuples: 14, cells: 70, nodesPerReplan: 3010 },
    "sword+buckler": { tuples: 14, cells: 70, nodesPerReplan: 3010 },
    // The widest row in the table, and the reason it is: `cut` names both hands
    // here and one everywhere else, so it is three tuples above `sword+empty`
    // despite having one fewer action (`punch` needs an empty hand and both are
    // full). A cell-count multiplier gets this row wrong in both directions --
    // ordinary in the action column, widest in the tuple column.
    "sword+axe": { tuples: 17, cells: 85, nodesPerReplan: 3655 },
    "axe+empty": { tuples: 13, cells: 65, nodesPerReplan: 2795 },
    "bow+empty": { tuples: 7, cells: 35, nodesPerReplan: 1505 },
    "empty+empty": { tuples: 12, cells: 60, nodesPerReplan: 2580 },
    "natural:bite": { tuples: 3, cells: 15, nodesPerReplan: 645 },
  });
  // The trainer's own arithmetic rather than this test's: `groups` is
  // `3 x train + validation` and the floor is 48 steps a group. It refuses
  // before it runs a single bout, which is why this costs no Havok.
  //
  // 3,100 groups and 148,800 steps until `sword+axe` joined the strata. Both
  // moved by 1.219x rather than by the 15 % the cell count alone predicts,
  // because the new row is the widest one.
  assert.rejects(() => trainLookahead({ seed: 310013, solverSteps: 181_436 }),
    /lookahead budget 181436 cannot cover 3780 indexed tactic-cell jobs; minimum is 181440/);
});

test("the_training_schedule_offers_exactly_what_the_runtime_mask_offers", async () => {
  // The mask is read off a **real published body**, one short Havok bout per
  // cell, rather than off a hand-rolled view. A synthetic fixture would be a
  // second claim about what a body publishes, and the divergence this test
  // exists for is exactly a claim about a body that was wrong: the schedule
  // said an axe hand and a free empty hand could not punch, and the fighter it
  // was describing could.
  //
  // Since stage C2c it compares the whole `(action, effector, target)` list
  // rather than the action names. That is a strictly stronger claim and it is
  // the one the planner needs: `lookaheadMind` searches tuples, so a row that
  // named the right actions with the wrong hand would spend its whole budget on
  // cells no body ever offers and leave the search empty.
  const seen = new Set(); const cells = [];
  researchMatrix("train", 310013).forEach((job, jobIndex) => { const key = `${job.unit}/${job.loadout}`;
    if (!seen.has(key)) { seen.add(key); cells.push({ cell: key, job, jobIndex }); } });
  assert.equal(cells.length, 15);
  const runtime = {}; const scheduled = {};
  for (const { cell: key, job, jobIndex } of cells) {
    // Every distinct mask the body publishes across the window, not the first
    // one: a set with two members would mean the capability moved mid-probe and
    // that a per-loadout schedule row cannot describe it.
    const masks = new Set();
    await runResearchBout({ ...job, index: jobIndex }, () => researchLabelMind("schedule-mask-probe",
      (view) => probeLabel(view, "hold", "recover")), 48, null, {
        onSample({ view }) { masks.add(deployableTactics(view).map((t) => `${t.action}|${t.effector}|${t.target}`).join(" ")); },
      });
    runtime[key] = [...masks];
    scheduled[key] = [tacticsFor(job.loadout).map((t) => `${t.action}|${t.effector}|${t.target}`).join(" ")];
  }
  assert.deepEqual(runtime, scheduled);
});

/** One short Havok bout per loadout, kept as a fixture a test can sever a hand on. */
const publishedBody = async (loadout) => {
  const jobs = researchMatrix("train", 310013);
  const at = jobs.findIndex((job) => job.unit === "warrior" && job.loadout === loadout);
  let captured = null;
  await runResearchBout({ ...jobs[at], index: at }, () => researchLabelMind("severance-fixture",
    (view) => probeLabel(view, "hold", "recover")), 48, null, {
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
  // **Stage C2c made this sharper in both directions, and the second one is a
  // cost rather than a gain.** A severed hand now removes *effectors* as well as
  // actions, so the filter has more to do -- and on a loadout whose whole row is
  // trained on one hand there is nothing left at all. A `bow+empty` trains
  // `cover`, `shoot` and `recover` on the primary, because the stave welds the
  // other hand; cut the bow hand off and every tuple the body can still perform
  // names the *secondary*, which no budget was ever spent on. The plan refuses
  // by name instead of executing a `recover` calibrated for the other arm, which
  // is what the two-field key did silently. Session 20 has to budget for that:
  // the null control reports 10 severs in 120 bouts.
  const DELTAS = { punch: { vitalityPotential: 0.30 }, recover: { vitalityPotential: 0.10 } };
  const LIMITS = { reachError: 1, approachReachError: 1, contactRateError: 1, vitalityDeltaError: 1 };
  const model = (loadout) => fitTacticalModel(MOVEMENT_NAMES.flatMap((movement) =>
    tacticsFor(loadout).map((tactic) => ({ ...row(plannedTacticKey({ movement, ...tactic }), DELTAS[tactic.action] ?? {}),
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
      (_view, _features, decision) => { planned = plannedTacticKey(decision); });
    let command = null;
    try { command = mind.decide(view, 1 / 240); } catch (error) { planned = error.message; }
    if (label.includes("both")) inert = command;
    record[label] = { mask: deployableTactics(view).map((t) => `${t.action}|${t.effector}|${t.target}`).join(" "),
      scheduled: tacticsFor(loadout).map((t) => `${t.action}|${t.effector}|${t.target}`).join(" "), planned };
  }
  assert.deepEqual(record, {
    "bow+empty, bow hand gone": {
      mask: "cover|secondary|threat cover|secondary|vital punch|secondary|vital punch|secondary|high " +
        "recover|secondary|threat recover|secondary|vital",
      scheduled: "cover|primary|threat cover|primary|vital shoot|primary|vital shoot|primary|high shoot|primary|low " +
        "recover|primary|threat recover|primary|vital",
      planned: "lookahead refuses warrior/bow+empty: no calibrated model for any tactic on [cover, punch, recover]",
    },
    "sword+empty, sword hand gone": {
      mask: "cover|secondary|threat cover|secondary|vital punch|secondary|vital punch|secondary|high " +
        "recover|secondary|threat recover|secondary|vital",
      scheduled: "cover|primary|threat cover|primary|vital cover|secondary|threat cover|secondary|vital " +
        "cut|primary|vital cut|primary|high cut|primary|low thrust|primary|vital thrust|primary|high thrust|primary|low " +
        "punch|secondary|vital punch|secondary|high recover|primary|threat recover|primary|vital " +
        "recover|secondary|threat recover|secondary|vital",
      planned: "close+punch+secondary+vital",
    },
    "sword+empty, both hands gone": {
      mask: "",
      scheduled: "cover|primary|threat cover|primary|vital cover|secondary|threat cover|secondary|vital " +
        "cut|primary|vital cut|primary|high cut|primary|low thrust|primary|vital thrust|primary|high thrust|primary|low " +
        "punch|secondary|vital punch|secondary|high recover|primary|threat recover|primary|vital " +
        "recover|secondary|threat recover|secondary|vital",
      planned: null,
    },
  });
  // The bow cell really has no model for the hand that is left -- the plan
  // declined to search it rather than the schedule having quietly grown one.
  assert.throws(() => requireCalibration(model("bow+empty"), "close+recover+secondary+vital", "warrior/bow+empty", LIMITS),
    /tactic "close\+recover\+secondary\+vital" has no calibrated model/);
  // A body that can do nothing at all is inert rather than a refusal, which is
  // what `researchLabelMind` answers on the same mask; the whole command against
  // a fresh one, because two leaves of nineteen is how "goes inert" passed for a
  // command that thrust.
  assert.deepEqual(inert, freshIntent());
});

test("the_plan_executes_the_effector_and_the_aim_it_searched", async () => {
  // The whole point of carrying the tuple: the option is handed the hand and the
  // height the beam chose, and never re-searches for one. `chooseEffector`
  // prefers the primary, so a seam that quietly called it again would execute
  // this `cover` on the sword hand while reporting the empty one -- which is
  // `requireHand`'s old silent redirection, arriving one layer higher up.
  const view = await publishedBody("sword+empty");
  const CHOSEN = { movement: "hold", action: "cover", effector: "secondary", target: "vital" };
  const LIMITS = { reachError: 1, approachReachError: 1, contactRateError: 1, vitalityDeltaError: 1 };
  const model = fitTacticalModel(MOVEMENT_NAMES.flatMap((movement) => tacticsFor("sword+empty").map((tactic) => {
    const key = plannedTacticKey({ movement, ...tactic });
    return { ...row(key, key === plannedTacticKey(CHOSEN) ? { vitalityPotential: 0.5 } : {}),
      bodyLoadout: "warrior/sword+empty" };
  })));
  let label = null;
  const mind = lookaheadMind(model, "warrior/sword+empty", LIMITS, LOOKAHEAD_DEPTH, LOOKAHEAD_WIDTH,
    (_view, _features, decision) => { label = decision; });
  const command = mind.decide(view, 1 / 240);
  // All six fields against a freshly built record: the four the plan decided and
  // the two it names by constant. A hook that dropped the effector would still
  // have produced a runnable command.
  assert.deepEqual(label, { ...CHOSEN, stance: UNLEARNED_STANCE, persistence: UNLEARNED_PERSISTENCE });
  assert.deepEqual([...Object.keys(label)].sort(), RESEARCH_LABEL_FIELDS);
  // And the command itself against one built by entering exactly that tuple.
  // The whole intent, because `actingHand` alone was satisfied by a `cover` at
  // the wrong height and this fixture can tell the two heights apart.
  const option = handActionOption(CHOSEN.action, { effector: CHOSEN.effector, target: CHOSEN.target, stance: UNLEARNED_STANCE });
  option.enter(view);
  assert.deepEqual(command, composeTactic(view, CHOSEN.movement, CHOSEN.action,
    movementIntent(CHOSEN.movement, view), option.decide(view, 1 / 240)));
  assert.equal(command.actingHand, "secondary");
});

test("a_lost_effector_is_a_capability_change_even_when_every_action_survives", async () => {
  // The case an action-level capability signature cannot see, and the reason
  // stage C2c had to widen one: a `sword+shield` that loses its shield hand
  // still offers `cover`, `cut`, `thrust` and `recover` -- the action set is
  // unchanged, to the name -- while four of its fourteen tuples have gone with
  // the hand. The committed tuple here is `cut|primary|vital`, which survives,
  // so nothing else in the replan condition fires: the skill is mid-stroke, so
  // `done` is false, and the plan is still legal, so the membership check is
  // false. Only the signature is left, and on the action set it is equal.
  const view = await publishedBody("sword+shield");
  const CHOSEN = { movement: "close", action: "cut", effector: "primary", target: "vital" };
  const LIMITS = { reachError: 1, approachReachError: 1, contactRateError: 1, vitalityDeltaError: 1 };
  const model = fitTacticalModel(MOVEMENT_NAMES.flatMap((movement) => tacticsFor("sword+shield").map((tactic) => {
    const key = plannedTacticKey({ movement, ...tactic });
    return { ...row(key, key === plannedTacticKey(CHOSEN) ? { vitalityPotential: 0.5 } : {}), bodyLoadout: "warrior/sword+shield" };
  })));
  const sever = (from, ...hands) => { const next = structuredClone(from);
    for (const name of hands) next.self.hands[name].lost = true; return assertCompleteView(next); };
  const severed = sever(view, "secondary");
  const plans = [];
  const mind = lookaheadMind(model, "warrior/sword+shield", LIMITS, LOOKAHEAD_DEPTH, LOOKAHEAD_WIDTH,
    (_view, _features, decision) => { plans.push(plannedTacticKey(decision)); });
  mind.decide(view, 1 / 240);
  mind.decide(view, 1 / 240);
  const before = { plans: [...plans],
    actions: HAND_ACTION_NAMES.filter((name) => deployableActions(view).has(name)).join("+"),
    tuples: deployableTactics(view).length };
  mind.decide(severed, 1 / 240);
  assert.deepEqual({ before, after: { plans: [...plans],
    actions: HAND_ACTION_NAMES.filter((name) => deployableActions(severed).has(name)).join("+"),
    tuples: deployableTactics(severed).length } }, {
    // One plan for the first decide, none for the second -- the skill is still
    // running -- and a second plan the instant the hand comes off.
    before: { plans: ["close+cut+primary+vital"], actions: "cover+cut+thrust+recover", tuples: 14 },
    after: { plans: ["close+cut+primary+vital", "close+cut+primary+vital"], actions: "cover+cut+thrust+recover", tuples: 10 },
  });
});

test("a_bout_credits_a_window_to_the_hand_the_decision_named", async () => {
  // **The row-writing path, driven for real, against a record built beside it by
  // a different rule.** `scripts/research-havok.mjs` attributed every attack with
  // `opportunitiesForAction(view, label.action)[0]`, which filtered on the weapon
  // and never on the hand, so a `punch|secondary` opened its window on the primary
  // fist -- and the secondary's damaging contact, arriving keyed
  // `hand:secondary:empty`, hit an opportunity with a null `attackedAt` and was
  // dropped. `attacksInWindow` and `damagingContactsInWindow` feed NEAT-QD's
  // feasibility gate, DAgger's engagement floor and the frozen tournament row.
  //
  // The C2c beam is what made it reachable: `chooseEffector` answers `primary` for
  // `punch` on `empty+empty`, which is the same hand `[0]` named, so every earlier
  // producer agreed with the bug by accident. The schedule now trains
  // `punch+secondary+*` on that loadout, so the beam can win with it.
  //
  // The comparison record is built from the same bout by a rule written the other
  // way round -- the key composed from the named hand and what it holds, checked
  // for viability -- so this is not the picker asserting itself. The whole record,
  // ten leaves, because two of them is how the defect survived the suite it lived
  // in for two stages.
  const jobs = researchMatrix("train", 310013);
  const at = jobs.findIndex((job) => job.unit === "warrior" && job.loadout === "empty+empty");
  const namedKey = (view, label) => {
    const hand = view.self.hands[label.effector];
    if (!hand) return null;
    const key = `hand:${label.effector}:${hand.weapon}`;
    return attackOpportunity(view).some((row) => row.key === key && row.viable) ? key : null;
  };
  const fresh = new EngagementTracker();
  const seen = { punchViable: 0, bothFists: 0, contacts: {} };
  // 0.10 s is `MIN_PERSISTENCE`, and it is what makes the fixture able to exhibit
  // the defect at all: at the 0.4 s the planner holds, a decision almost never
  // lands inside one of the 98 samples where a fist is in range, and the harness
  // and the comparison agree at nought all the way down.
  const result = await runResearchBout({ ...jobs[at], index: at },
    (harnessHook) => researchLabelMind("named-hand-probe",
      () => ({ movement: "close", action: "punch", effector: "secondary", target: "vital",
        stance: UNLEARNED_STANCE, persistence: 0.1 }),
      (view, features, label) => { harnessHook(view, features, label);
        const key = namedKey(view, label); if (key) fresh.attack(key, view.clock); }),
    2400, null, {
      onSample({ view, dt }) { fresh.sample(view, dt);
        const fists = attackOpportunity(view).filter((row) => row.viable && row.striker === "empty");
        if (fists.length) seen.punchViable += 1;
        if (fists.length === 2) seen.bothFists += 1; },
      onEvent({ actorEvent, event }) { if (!actorEvent) return;
        const key = opportunityKeyForContact(event.hand, event.report.weapon);
        seen.contacts[key] = (seen.contacts[key] ?? 0) + 1;
        fresh.contact(key, event.report.at, event.report.damage); },
    });
  // The fixture can show the defect: both fists are viable together every time
  // either is, so `[0]` really does have a wrong answer available, and both fists
  // really do land damaging contacts.
  assert.equal(seen.bothFists, seen.punchViable);
  assert.ok(seen.punchViable > 0, "no punch was ever in range");
  assert.ok(seen.contacts["hand:primary:empty"] > 0 && seen.contacts["hand:secondary:empty"] > 0,
    `both fists must land contacts: ${JSON.stringify(seen.contacts)}`);
  assert.ok(result.engagement.attacksInWindow > 0, "no decision landed inside an open window");
  assert.deepEqual(result.engagement, fresh.record);
});

test("every_scheduled_centipede_tactic_runs_a_complete_havok_trace_window", async () => {
  const tasks = lookaheadTacticCellSchedule("train", 310013).filter((task) => task.unit === "centipede");
  assert.equal(tasks.length, 15);
  for (const task of tasks) {
    const trace = await collectTacticalTrace({ seed: 310013, solverSteps: 48, split: "train", jobIndex: task.jobIndex,
      forcedTactic: { movement: task.movement, action: task.action, effector: task.effector, target: task.target } });
    assert.equal(trace.solverSteps, 48); assert.ok(trace.rows.length >= 1, plannedTacticKey(task));
    // The row's key against the schedule's own, which is the one place the beam
    // and the trace can be seen agreeing on the grammar. A trace keyed two
    // fields wide against a beam keyed four is not an error anywhere -- it is a
    // model that matches nothing.
    assert.ok(trace.rows.every((traceRow) => traceRow.bodyLoadout === "centipede/natural:bite" &&
      traceRow.tactic === plannedTacticKey(task)), plannedTacticKey(task));
  }
});

test("lookahead_respects_the_exact_depth_width_and_node_budget", () => {
  const tactics = [cell("close", "cover", "primary", "threat"), cell("hold", "cut", "primary", "vital")];
  const model = fitTacticalModel(tactics.map((tactic) => row(plannedTacticKey(tactic), {})));
  const result = boundedLookahead(model, state(), tactics);
  assert.equal(result.sequence.length, LOOKAHEAD_DEPTH); assert.equal(LOOKAHEAD_WIDTH, 6);
  assert.equal(result.expandedNodes, 74);
  // The beam saturates at the width on the first level, so the budget is exactly
  // `43 * cells` for anything a real body offers and the cost of the widening is
  // linear with no pruning relief. Both sides of the saturation, because a
  // budget checked only above it is satisfied by `43P` for every P.
  assert.deepEqual([1, 2, 3, 5, 6, 7, 16, 80].map((count) => exactLookaheadNodeBudget(count)),
    [8, 74, 120, 210, 258, 301, 688, 3440]);
  assert.throws(() => exactLookaheadNodeBudget(0), /positive integers/);
});

test("lookahead_prefers_close_over_disengage_when_no_attack_can_land", () => {
  const tactics = [cell("disengage", "cover", "primary", "threat"), cell("close", "cover", "primary", "threat")];
  const model = fitTacticalModel([
    row("disengage+cover+primary+threat", { reachMargin: -0.2, vitalityPotential: -0.01 }),
    row("close+cover+primary+threat", { reachMargin: 0.2, facingError: -0.02 }),
  ]);
  assert.equal(boundedLookahead(model, state(), tactics).tactic.movement, "close");
});

test("lookahead_prefers_a_legal_attack_over_orbiting_in_range", () => {
  const tactics = [cell("circle-left", "cover", "primary", "threat"), cell("hold", "cut", "primary", "vital")];
  const model = fitTacticalModel([
    row("circle-left+cover+primary+threat", { facingError: 0.01 }),
    row("hold+cut+primary+vital", { contactProbability: 0.4, vitalityPotential: 0.1 }, true),
  ]);
  assert.equal(boundedLookahead(model, state({ reachMargin: 0.1 }), tactics).tactic.action, "cut");
});

test("a_committed_attack_is_not_reaimed_by_the_next_prediction", () => {
  assert.equal(shouldReplan(false, false, false), false);
  assert.equal(shouldReplan(true, false, false), true);
  assert.equal(shouldReplan(false, true, false), true);
  const tactic = cell("hold", "cut", "primary", "vital");
  const model = fitTacticalModel([row("hold+cut+primary+vital", { contactProbability: 0.2 })]);
  const controller = new LookaheadController(); const first = controller.choose(model, state(), [tactic],
    { tacticComplete: true, capabilityChanged: false, predictionGuardFired: false });
  assert.deepEqual(first.tactic, tactic);
  assert.equal(controller.choose(model, state({ facingError: -1 }), [tactic],
    { tacticComplete: false, capabilityChanged: false, predictionGuardFired: false }), null);
  assert.deepEqual(controller.current(), tactic);
});

test("a_cell_no_budget_was_spent_on_is_refused_before_any_limit_is_read", () => {
  // **This was named for the threshold branch and asserts the one above it.** The
  // model is fitted with no `bodyLoadout`, so the only cell it holds is `default`
  // and `centipede/sword` matches nothing -- the limits never get read at all,
  // which is why the same message comes back from limits that refuse everything
  // and limits that refuse nothing. The threshold branch it was standing in for
  // had no test until the two below it, and this asserts the inertness on purpose
  // now rather than by accident.
  const model = fitTacticalModel([row("hold+cut+primary+vital", { reachMargin: 0.4, contactProbability: 0.1 })]);
  const missing = /lookahead refuses centipede\/sword: tactic "hold\+cut\+primary\+vital" has no calibrated model/;
  assert.throws(() => requireCalibration(model, "hold+cut+primary+vital", "centipede/sword", {
    reachError: 0.01, approachReachError: 0.01, contactRateError: 0.01, vitalityDeltaError: 0.01,
  }), missing);
  assert.throws(() => requireCalibration(model, "hold+cut+primary+vital", "centipede/sword", {
    reachError: Infinity, approachReachError: Infinity, contactRateError: Infinity, vitalityDeltaError: Infinity,
  }), missing);
});

// A trace row as `collectTacticalTrace` actually writes one: `before` carries no
// contact probability at all and `after` carries the outcome as a 0 or a 1. The
// generic `row` helper above sets `before.contactProbability` to 0.05, which no
// real row has, and that difference is the whole subject of the contact column
// below -- a fixture that cannot exhibit the defect is this directory's named
// failure mode, so these are built the way the trainer builds them.
const traceRow = (tactic, loadout, split, contact, delta = {}) => {
  const before = { reachMargin: -0.5, facingError: 0.2, threatAlignment: 0.1, contactProbability: 0, vitalityPotential: 0 };
  return { tactic, bodyLoadout: loadout, split, contact, before,
    after: { ...Object.fromEntries(TACTICAL_STATE_COLUMNS.map((name) => [name, before[name] + (delta[name] ?? 0)])),
      contactProbability: contact ? 1 : 0 } };
};
const round = (record) => Object.fromEntries(Object.entries(record).map(([key, value]) => [key, Number(value.toFixed(12))]));

test("an_indexed_lookahead_job_resume_is_byte_identical_and_never_deploys_a_partial_controller", async () => {
  // One deterministic row per real scheduled task keeps this a test of the
  // 3,780-boundary orchestration rather than a second Havok endurance run. The
  // task, split, fit seed and assigned budget all enter the row or accounting,
  // so skipping or replaying any boundary changes the final bytes.
  const calls = [];
  const collectBudget = async (task, fitSeed, budget, split, { jobIndex }) => {
    calls.push({ task: `${task.cell} ${plannedTacticKey(task)}`, fitSeed, budget, split, jobIndex });
    return { solverSteps: budget, rows: [traceRow(plannedTacticKey(task), task.cell, split,
      (jobIndex + (fitSeed >>> 0)) % 7 === 0, { reachMargin: ((fitSeed >>> 0) % 5) / 100 })] };
  };
  const config = { seed: 310013, solverSteps: 181_440, runId: "resume-proof", collectBudget };
  const uninterrupted = await trainLookahead(config);
  const uninterruptedCalls = calls.splice(0);
  const checkpoints = [];
  const interrupted = await trainLookahead({ ...config, stopAfterJobs: 947, checkpointEveryJobs: 701,
    onCheckpoint(bytes, progress) { checkpoints.push({ bytes, progress }); } });
  const interruptedCalls = calls.splice(0);
  assert.equal(interrupted.complete, false);
  assert.equal(interrupted.jobsCompleted, 947);
  assert.deepEqual({ champion: interrupted.champion, artifact: interrupted.artifact,
    objective: interrupted.objective }, { champion: null, artifact: null,
    objective: { name: "calibrationSeverity", direction: "lower", value: null } });
  assert.equal("model" in interrupted, false, "a resumable prefix is not a narrowed model");
  const frozen = lookaheadRunConfig(config);
  const saved = decodeLookaheadResume(interrupted.resume, frozen);
  assert.equal(saved.nextJobIndex, 947);
  assert.equal(frozen.schedule.groups, 3_780);
  assert.equal(saved.candidates.reduce((sum, candidate) => sum + candidate.rows.length, 0), 947);
  assert.equal(saved.validation.rows.length, 0, "the state preserves the later validation schedule instead of fitting early");
  assert.deepEqual(checkpoints.map(({ progress }) => progress.jobsCompleted), [701, 947]);
  assert.ok(checkpoints.every(({ progress }) => progress.champion === null && progress.artifact === null &&
    progress.cellsFitted === 0 && progress.collectedKeys > 0));

  const resumed = await trainLookahead({ ...config, resumeBytes: interrupted.resume });
  const resumedCalls = calls.splice(0);
  assert.equal(resumed.complete, true);
  assert.equal(interruptedCalls.length + resumedCalls.length, 3_780);
  assert.deepEqual([...interruptedCalls, ...resumedCalls], uninterruptedCalls);
  for (const name of ["artifact", "report", "resume"]) assert.deepEqual(resumed[name], uninterrupted[name], name);
  assert.equal(resumed.record.runId, "resume-proof");
  assert.equal(decodeResearchArtifact(resumed.artifact).data.provenance.runId, "resume-proof");
  const completeState = decodeLookaheadResume(resumed.resume, frozen);
  const ceilingRow = makeLookaheadPartialLedgerRow({ config: frozen, state: completeState, ledgerRows: [],
    contractDigest: "0".repeat(64), wallSeconds: 1, stepsPerSecond: 181_440, plateauEpsilon: 0.01, plateauRows: 6 });
  const durable = finalLookaheadReport(resumed.record, [ceilingRow]);
  assert.equal(durable.stopped, "stopped: ceiling");
  assert.equal(durable.ledgerFile, "ledger.jsonl");
  assert.equal("ledger" in durable, false);
});

test("lookahead_resume_refuses_a_different_run_identity_before_spending_another_job", async () => {
  let calls = 0;
  const collectBudget = async (task, fitSeed, budget, split) => { calls += 1;
    return { solverSteps: budget, rows: [traceRow(plannedTacticKey(task), task.cell, split, false)] }; };
  const stopped = await trainLookahead({ seed: 310013, solverSteps: 181_440, runId: "first-run",
    stopAfterJobs: 1, collectBudget });
  assert.equal(calls, 1);
  await assert.rejects(() => trainLookahead({ seed: 310013, solverSteps: 181_440, runId: "other-run",
    resumeBytes: stopped.resume, collectBudget }),
  /lookahead resume refused: run id, seed, budget, or indexed schedule changed/);
  assert.equal(calls, 1, "a mismatched resume is refused before another bout");
  const corrupt = JSON.parse(new TextDecoder().decode(stopped.resume)); corrupt.state.consumedSolverSteps += 4;
  await assert.rejects(() => trainLookahead({ seed: 310013, solverSteps: 181_440, runId: "first-run",
    resumeBytes: new TextEncoder().encode(canonicalJson(corrupt)), collectBudget }),
  /lookahead resume has invalid progress state/);
  assert.equal(calls, 1, "corrupt prefix accounting is refused before another bout");
  assert.throws(() => lookaheadRunConfig({ seed: 310013, solverSteps: 181_440, runId: "not/a/run" }), /invalid --run-id/);
  assert.equal(lookaheadRunConfig({ seed: 310013, solverSteps: 181_440, runId: "first-run" }).configDigest,
    lookaheadRunConfig({ seed: 310013, solverSteps: 181_440, runId: "other-run" }).configDigest,
  "a directory label is not part of the search config digest");
});

test("a_lookahead_job_must_spend_exactly_its_assigned_solver_steps", async () => {
  let assigned = 0;
  await assert.rejects(() => trainLookahead({ seed: 310013, solverSteps: 181_440, stopAfterJobs: 1,
    collectBudget: async (task, fitSeed, budget, split) => { assigned = budget;
      return { solverSteps: budget + 4, rows: [traceRow(plannedTacticKey(task), task.cell, split, false)] }; } }),
  /lookahead indexed job 0 must consume exactly its assigned 48 solver steps and return rows/);
  assert.equal(assigned, 48);
});

test("a_state_checkpoint_that_landed_before_its_ledger_row_is_replayed_once", async () => {
  let persisted = null;
  await assert.rejects(() => trainLookahead({ seed: 310013, solverSteps: 181_440, runId: "crash-proof",
    checkpointEveryJobs: 1, collectBudget: async (task, fitSeed, budget, split) => ({ solverSteps: budget,
      rows: [traceRow(plannedTacticKey(task), task.cell, split, false)] }),
    onCheckpoint(bytes) { persisted = bytes; throw new Error("killed after state rename"); } }), /killed after state rename/);
  const config = lookaheadRunConfig({ seed: 310013, solverSteps: 181_440, runId: "crash-proof" });
  const state = decodeLookaheadResume(persisted, config);
  assert.deepEqual(state.pendingCheckpoint, { jobIndex: 0, stepsConsumed: 48 });
  const recovered = reconcileLookaheadCheckpoint({ config, state, ledgerRows: [], contractDigest: "0".repeat(64),
    plateauEpsilon: 0.01, plateauRows: 6 });
  assert.equal(recovered.jobIndex, 0);
  assert.equal(recovered.stepsConsumed, 48);
  assert.deepEqual({ cellsFitted: recovered.directionData.cellsFitted,
    collectedKeys: recovered.directionData.collectedKeys }, { cellsFitted: 0, collectedKeys: 1 });
  assert.equal(reconcileLookaheadCheckpoint({ config, state, ledgerRows: [recovered], contractDigest: "0".repeat(64),
    plateauEpsilon: 0.01, plateauRows: 6 }), null, "an appended recovery row is not duplicated");
});

test("a_stale_lookahead_state_is_refused_against_a_newer_run_ledger", () => {
  assert.throws(() => assertLookaheadLedgerPrefix({ nextJobIndex: 3, consumedSolverSteps: 12 },
    [{ jobIndex: 3, stepsConsumed: 16 }]), /does not match the run ledger prefix/);
});

test("terminal_lookahead_publication_keeps_pending_state_until_the_final_row", () => {
  const state = { nextJobIndex: 3_780, consumedSolverSteps: 181_440,
    pendingCheckpoint: { jobIndex: 3_779, stepsConsumed: 181_440 } };
  const prefix = [{ jobIndex: 3_778, stepsConsumed: 181_392 }];
  assert.doesNotThrow(() => assertLookaheadLedgerPrefix(state, prefix));
  assert.throws(() => assertLookaheadLedgerPrefix({ ...state, pendingCheckpoint: null }, prefix),
    /does not match the run ledger prefix/);
});

// The gate fixture, and every part of it is load-bearing.
//
// **The version this replaces could not tell which limit was applied to which
// column.** It built a reach error of 0.4 and a vitality error of 0.4 against
// limits of 0.15 and 0.10, so both errors exceeded both limits and swapping the
// two keys in `calibrationRefusal` left the whole suite at 542 pass -- while
// dropping real 8x survival from 706/775 to 140/775 and costing
// `centipede/natural:bite` every cell it has, which makes `lookaheadMind` throw
// "no calibrated model for any tactic" mid-bout. The separating pair is a reach
// error of 0.12 and a vitality error of 0.12: each is admitted by its own limit
// and refused by the other one, so only the correct pairing is green.
//
// It also exercised **two** of the three gated columns -- no cell ever breached
// `contactRateError` -- and every key lived on one loadout, so replacing
// `fitGroups(cellRows)` with `fitGroups(rows)` in `fitTacticalModel` was
// invisible: with one cell a per-cell fit and a pooled fit are the same fit.
// Every key here is carried by two bodies with different deltas.
const GATE_LOADOUT = "warrior/sword+empty";
const GATE_OTHER = "broot/axe+empty";
const GATE_LIMITS = { reachError: 0.15, approachReachError: 0.35, contactRateError: 0.25, vitalityDeltaError: 0.10 };
// [key, the amplitude the cell under test swings, the offset the other body carries]
const GATE_KEYS = [
  // The fitted delta is the mean of the pair, so a +d/-d swing is d of per-row
  // error with a *signed* mean of exactly zero -- the defect the reach column
  // used to have, kept as the fixture that proves it is gone.
  ["hold+cut+primary+vital", { reachMargin: 0.4 }, { reachMargin: 1.0 }],
  ["hold+thrust+primary+vital", { vitalityPotential: 0.4 }, { vitalityPotential: 1.0 }],
  ["hold+cover+primary+threat", {}, { reachMargin: 0.9 }],
  ["circle-left+cut+primary+vital", { reachMargin: 0.12 }, { reachMargin: 0.8 }],
  ["circle-right+cut+primary+vital", { vitalityPotential: 0.12 }, { vitalityPotential: 0.8 }],
  ["close+cut+primary+vital", { reachMargin: 0.25 }, { reachMargin: 0.7 }],
  ["close+thrust+primary+vital", { reachMargin: 0.40 }, { reachMargin: 0.6 }],
];
const gateModel = () => {
  const scaled = (delta, by) => Object.fromEntries(Object.entries(delta).map(([name, value]) => [name, value * by]));
  return fitTacticalModel(GATE_KEYS.flatMap(([key, swing, offset]) => [
    traceRow(key, GATE_LOADOUT, "train", false, { reachMargin: 0.1, ...swing }),
    traceRow(key, GATE_LOADOUT, "train", false, { reachMargin: 0.1, ...scaled(swing, -1) }),
    traceRow(key, GATE_OTHER, "train", false, offset), traceRow(key, GATE_OTHER, "train", false, offset),
  ]));
};

test("each_calibration_limit_refuses_the_cell_that_breaches_it_and_admits_the_one_that_does_not", () => {
  // The threshold branch of `calibrationRefusal`, which had no test: the only one
  // named for it passes {0.01, 0.01, 0.01} at a cell that does not exist, so it
  // asserts the *missing-cell* message one line above, and replacing its limits
  // with {Infinity, Infinity, Infinity} produces that message unchanged.
  const model = gateModel();
  // The whole calibration record of the whole cell against a freshly stated one,
  // not the single column each case is about: a statistic that silently stopped
  // reading a column, or a fit that pooled the two bodies, would leave every
  // one-column assertion green.
  const record = (cell) => Object.fromEntries(Object.entries(model.cells[cell])
    .map(([key, fitted]) => [key, round(fitted.calibration)]));
  assert.deepEqual(record(GATE_LOADOUT), {
    "circle-left+cut+primary+vital": { reachError: 0.12, contactRate: 0, contactRateError: 0, vitalityDeltaError: 0 },
    "circle-right+cut+primary+vital": { reachError: 0, contactRate: 0, contactRateError: 0, vitalityDeltaError: 0.12 },
    "close+cut+primary+vital": { reachError: 0.25, contactRate: 0, contactRateError: 0, vitalityDeltaError: 0 },
    "close+thrust+primary+vital": { reachError: 0.4, contactRate: 0, contactRateError: 0, vitalityDeltaError: 0 },
    "hold+cover+primary+threat": { reachError: 0, contactRate: 0, contactRateError: 0, vitalityDeltaError: 0 },
    "hold+cut+primary+vital": { reachError: 0.4, contactRate: 0, contactRateError: 0, vitalityDeltaError: 0 },
    "hold+thrust+primary+vital": { reachError: 0, contactRate: 0, contactRateError: 0, vitalityDeltaError: 0.4 },
  });
  // The second body, whose rows carry a constant offset and therefore fit
  // perfectly. Pooling the two cells moves every one of these off zero, which is
  // what makes the per-cell fit assertable at all.
  assert.deepEqual(record(GATE_OTHER), Object.fromEntries(GATE_KEYS.map(([key]) =>
    [key, { reachError: 0, contactRate: 0, contactRateError: 0, vitalityDeltaError: 0 }])));
  const refusal = (key) => calibrationRefusal(model, key, GATE_LOADOUT, GATE_LIMITS);
  const failed = (key) => new RegExp(`^Error: lookahead refuses warrior/sword\\+empty: calibration failed for tactic "${key.replaceAll("+", "\\+")}"$`);
  // Over its own limit on each of the three gated columns, one column at a time.
  for (const key of ["hold+cut+primary+vital", "hold+thrust+primary+vital", "close+thrust+primary+vital"]) {
    assert.throws(() => requireCalibration(model, key, GATE_LOADOUT, GATE_LIMITS), failed(key), key);
  }
  // The separating pair. 0.12 of reach error is under the 0.15 reach limit and
  // over the 0.10 vitality one; 0.12 of vitality error is the other way round.
  // Swap the two keys in `calibrationRefusal` and both of these invert.
  assert.equal(refusal("circle-left+cut+primary+vital"), null);
  assert.throws(() => requireCalibration(model, "circle-right+cut+primary+vital", GATE_LOADOUT, GATE_LIMITS),
    failed("circle-right+cut+primary+vital"));
  // And the movement half of the reach rule: 0.25 m of reach error is over the
  // 0.15 the four ordinary movements get and under the 0.35 an approach gets, so
  // it is admitted only because the key says `close`.
  assert.equal(refusal("close+cut+primary+vital"), null);
  assert.equal(refusal("hold+cover+primary+threat"), null);
  // A limits record from before the reach column split in two is refused by name
  // rather than admitting everything: `undefined` loses every `>` comparison.
  assert.throws(() => calibrationRefusal(model, "close+cut+primary+vital", GATE_LOADOUT,
    { reachError: 0.15, contactRateError: 0.25, vitalityDeltaError: 0.10 }),
    /^Error: calibration limits are missing a reach tolerance for tactic "close\+cut\+primary\+vital"$/);
});

test("the_contact_column_refuses_a_breach_the_other_two_columns_cannot_see", () => {
  // The third gated column, which the fixture above cannot reach: `contactRate`
  // and `contactRateError` are both identically zero for a cell with no
  // validation rows, so a gate that had stopped reading the column entirely
  // would pass every assertion in it.
  const key = "hold+punch+secondary+vital";
  const rows = (split, contacts, total) => Array.from({ length: total }, (_, index) =>
    traceRow(key, GATE_LOADOUT, split, index < contacts));
  // Fitted 3/5 against a held-out 5/10: a tenth of a probability, under the limit.
  const near = calibrateTacticalModel(fitTacticalModel(rows("train", 3, 5)), rows("validation", 5, 10));
  assert.deepEqual(round(near.cells[GATE_LOADOUT][key].calibration),
    { reachError: 0, contactRate: 0.5, contactRateError: 0.1, vitalityDeltaError: 0 });
  assert.equal(calibrationRefusal(near, key, GATE_LOADOUT, GATE_LIMITS), null);
  // Fitted 4/5 against a held-out 1/4: 0.55 of a probability, over it -- and the
  // reach and vitality columns are exactly zero on the same rows, so nothing but
  // the contact column can produce this refusal.
  const wrong = calibrateTacticalModel(fitTacticalModel(rows("train", 4, 5)), rows("validation", 1, 4));
  assert.deepEqual(round(wrong.cells[GATE_LOADOUT][key].calibration),
    { reachError: 0, contactRate: 0.25, contactRateError: 0.55, vitalityDeltaError: 0 });
  assert.throws(() => requireCalibration(wrong, key, GATE_LOADOUT, GATE_LIMITS),
    /^Error: lookahead refuses warrior\/sword\+empty: calibration failed for tactic "hold\+punch\+secondary\+vital"$/);
});

test("the_contact_column_clamps_the_negative_excess_a_perfect_fit_produces", () => {
  // `contactRateError` is `sqrt(brier - q(1-q))`, and the excess is non-negative
  // for a constant predictor **in exact arithmetic only**. Where `p === q` it is
  // algebraically zero and computed as a row-summed Brier minus a separately
  // computed `q(1-q)`, so it lands a few ulps either side: on the 1,190,400-step
  // sweep 497 of 2,325 records come back negative, all 497 with `p === q`.
  //
  // Without the `Math.max(0, ...)` the column is `Math.sqrt(-8.3e-17)`, which is
  // `NaN`, and `NaN > limit` is `false` -- so the gate admits the cell without
  // reading the column at all. A fail-open guard on the cells the model gets
  // exactly right, under a comment saying it could not fire.
  const key = "hold+cut+primary+vital";
  const rows = (split, contacts, total) => Array.from({ length: total }, (_, index) =>
    traceRow(key, GATE_LOADOUT, split, index < contacts));
  // p = 1/3 and q = 7/21 are the same number and are not the same double.
  const held = rows("validation", 7, 21);
  const model = calibrateTacticalModel(fitTacticalModel(rows("train", 1, 3)), held);
  const fitted = model.cells[GATE_LOADOUT][key];
  assert.equal(fitted.delta.contactProbability, 1 / 3);
  assert.deepEqual(round(fitted.calibration),
    { reachError: 0, contactRate: Number((1 / 3).toFixed(12)), contactRateError: 0, vitalityDeltaError: 0 });
  // The unrounded number as well, because the claim is that it is *exactly* zero
  // rather than nearly zero: a clamp replaced by `Math.abs` answers 9.1e-9 here,
  // which is small enough to read as a rounding artifact and is a real refusal
  // budget being spent on a cell that fits perfectly.
  assert.equal(fitted.calibration.contactRateError, 0);
  // And the excess it is standing on really is negative, spelled the way
  // `calibrationFor` spells it, so this cannot quietly stop being about the clamp.
  const brier = held.reduce((sum, held_) => sum +
    (Math.max(0, Math.min(1, held_.before.contactProbability + 1 / 3)) - (held_.contact ? 1 : 0)) ** 2, 0) / held.length;
  const excess = brier - (7 / 21) * (1 - 7 / 21);
  assert.ok(excess < 0 && excess > -1e-15, `the fixture no longer produces a small negative excess: ${excess}`);
  assert.ok(Number.isNaN(Math.sqrt(excess)), "an unclamped excess is NaN");
  assert.equal(NaN > GATE_LIMITS.contactRateError, false, "and NaN is refused by nothing");
});

test("a_default_loadout_falls_back_to_the_pooled_fit_and_no_other_loadout_does", () => {
  // The `bodyLoadout === "default"` arm of `calibrationRefusal`'s lookup, which
  // had no test: every fixture that reaches it fits rows with no `bodyLoadout`
  // at all, and those land in a cell literally named `default`, so the fallback
  // is never the thing answering.
  const key = "hold+cut+primary+vital";
  const model = fitTacticalModel([traceRow(key, GATE_LOADOUT, "train", false, { reachMargin: 0.4 }),
    traceRow(key, GATE_LOADOUT, "train", false, { reachMargin: -0.4 })]);
  assert.deepEqual(Object.keys(model.cells), [GATE_LOADOUT]);
  // `default` has no cell of its own and is answered from `model.tactics`, which
  // for this model is the same rows and therefore the same 0.4 m of reach error.
  assert.deepEqual(round(model.tactics[key].calibration),
    { reachError: 0.4, contactRate: 0, contactRateError: 0, vitalityDeltaError: 0 });
  assert.match(calibrationRefusal(model, key, "default", GATE_LIMITS),
    /^lookahead refuses default: calibration failed for tactic "hold\+cut\+primary\+vital"$/);
  assert.equal(calibrationRefusal(model, key, "default",
    { ...GATE_LIMITS, reachError: 1 }), null);
  // Any other absent loadout is refused for having no model, never from the
  // pooled fit -- which is the whole point of the arm being keyed on one name.
  assert.match(calibrationRefusal(model, key, "centipede/natural:bite", { ...GATE_LIMITS, reachError: 1 }),
    /^lookahead refuses centipede\/natural:bite: tactic "hold\+cut\+primary\+vital" has no calibrated model$/);
});

test("the_minimum_budget_is_shipped_with_a_warning_because_its_split_is_not_a_split", () => {
  // **The shipped minimum produces one row per key and a split that is not one.**
  // The two bouts start from unrelated seeds -- `trainLookahead` collects
  // validation rows under `seed ^ 0x7f4a7c15`, which is 12,613 to 180,739 away
  // from the train seed across the 78 jobs -- and the rows come back identical
  // anyway, because **the opening of a bout is seed-insensitive**: two fighters
  // start from the same pose at the same separation and 48 steps is 0.2 s. So at
  // 48 steps per job all 775 keys come back with held-out rows bit-identical to
  // their own training rows, and `calibrateTacticalModel` then rescores a model
  // against itself and calls the answer held-out. (The sentence used to say the
  // splits "differ only by +100000 on the seed", which is true of `researchMatrix`
  // at a fixed base seed and not of what runs -- right measurement, wrong
  // mechanism, and it matters because widening an offset would not fix this.)
  //
  // A warning and not a floor, because the *model* fitted at the minimum budget
  // is fine -- it is the evidence about it that is not evidence. Returned rather
  // than printed so this can assert the sentence, which is the rule the whole
  // repository has about a control that cannot honour a request.
  assert.equal(MIN_SPLIT_STEPS_PER_JOB, 192);
  assert.equal(splitWarningFor(1_190_400, 384), null);
  assert.equal(splitWarningFor(595_200, 192), null);
  // **192 is not where the split becomes a split, and the sentence used to say it
  // was.** 164 of 775 keys are still bit-identical there against 3 at 384, so the
  // claim the warning can honestly make is about *most* of the split -- and the
  // measured count is what `lookaheadNotices` emits at a budget this stays quiet
  // about.
  assert.match(splitWarningFor(148_800, 48), /under the 192 at which most of the validation split becomes real/);
  assert.doesNotMatch(splitWarningFor(148_800, 48), /at which the validation split becomes a split/);
  // Both sides of the bracket, and the measured counts inside the sentence: a
  // warning that named no numbers would be satisfied by any threshold at all.
  for (const [steps, perJob] of [[148_800, 48], [297_600, 96]]) {
    const warning = splitWarningFor(steps, perJob);
    assert.match(warning, new RegExp(`^lookahead budget ${steps} gives ${perJob} solver steps per job, under the 192 `));
    assert.match(warning, /bit-identical at 48 steps per job, 651 at 96, 164 at 192 and 3 at 384\./);
    assert.match(warning, /read identicalCalibrationKeys in the report rather than trusting the label$/);
  }
  // And the fact the warning is a proxy for, which the report carries measured.
  // Whole rows against freshly built ones: `split` and `traceIndex` differ
  // between the two sides by construction, so a comparison that read them would
  // report every key as distinct and the counter would be a constant zero.
  const sample = (loadout, tactic, split, after) => ({ bodyLoadout: loadout, tactic, split, contact: false,
    before: { reachMargin: 0, facingError: 0, threatAlignment: 0, contactProbability: 0, vitalityPotential: 0 },
    after: { reachMargin: after, facingError: 0, threatAlignment: 0, contactProbability: 0, vitalityPotential: 0 },
    traceIndex: split === "train" ? 0 : 7 });
  const train = [sample("a/b", "hold+cut+primary+vital", "train", 0.3), sample("a/b", "hold+cover+primary+threat", "train", 0.1)];
  assert.equal(identicalSampleKeys(train, [sample("a/b", "hold+cut+primary+vital", "validation", 0.3),
    sample("a/b", "hold+cover+primary+threat", "validation", 0.1)]), 2);
  assert.equal(identicalSampleKeys(train, [sample("a/b", "hold+cut+primary+vital", "validation", 0.3),
    sample("a/b", "hold+cover+primary+threat", "validation", 0.9)]), 1);
  assert.equal(identicalSampleKeys(train, [sample("a/b", "hold+cut+primary+vital", "validation", 0.9),
    sample("a/b", "hold+cover+primary+threat", "validation", 0.9)]), 0);
  // A key the training split never spent a budget on is not "identical to
  // nothing"; it is a key with no training rows, and comparing it against an
  // empty list is what keeps it out of the count.
  assert.equal(identicalSampleKeys(train, [sample("c/d", "hold+cut+primary+vital", "validation", 0.3)]), 0);
});

// One model, one cell, one key, with a stated calibration -- enough to assert a
// report and a champion choice without spending 148,800 solver steps to reach
// the lines that build them.
const oneKeyModel = (loadout, key, delta) => fitTacticalModel([
  traceRow(key, loadout, "train", false, delta),
  traceRow(key, loadout, "train", false, Object.fromEntries(Object.entries(delta).map(([name, value]) => [name, -value]))),
]);

test("the_lookahead_report_carries_the_whole_record_a_run_is_judged_by", () => {
  // **Three fields of this record survived deletion in silence**, because the
  // only thing that built one spent a budget first:
  // `identicalCalibrationKeys` and `splitWarning` could both be dropped, and
  // `splitWarningFor` could be handed a constant 384 instead of the run's own
  // steps-per-job, with the whole suite still green. The test that reads like it
  // covers this -- `the_minimum_budget_is_shipped_with_a_warning...` -- asserts
  // the pure function and never that anything ships it.
  //
  // The whole record against a freshly stated one, so a field added here has to
  // be stated here, which a list of field names does not give you.
  const model = oneKeyModel("warrior/sword+empty", "hold+cut+primary+vital", { reachMargin: 0.4 });
  const calibration = { reachError: 0.4, contactRate: 0, contactRateError: 0, vitalityDeltaError: 0 };
  const arguments_ = { configDigest: "0badf00d", requestedSolverSteps: 148_800, solverSteps: 148_796,
    traceRows: 3_100, model, selectedSeed: -1_640_774_844, stepsPerJob: 48, calibrationKeys: 775,
    identicalCalibrationKeys: 775 };
  const report = lookaheadReport(arguments_);
  assert.deepEqual({ ...report, splitWarning: null }, { algorithm: "lookahead", configDigest: "0badf00d",
    requestedSolverSteps: 148_800, solverSteps: 148_796, unspentSolverSteps: 4, traceRows: 3_100,
    modelDigest: model.digest, selectedSeed: -1_640_774_844, solverStepsPerJob: 48, calibrationKeys: 775,
    identicalCalibrationKeys: 775, splitWarning: null,
    calibration: { "warrior/sword+empty": { "hold+cut+primary+vital": calibration } } });
  // The warning is built from *this run's* budget and steps per job, which is
  // what a constant in its place would break. Both sides of the floor, from one
  // record that differs in nothing else.
  assert.equal(report.splitWarning, splitWarningFor(148_800, 48));
  assert.match(report.splitWarning, /^lookahead budget 148800 gives 48 solver steps per job/);
  assert.equal(lookaheadReport({ ...arguments_, stepsPerJob: 384 }).splitWarning, null);
  assert.equal(lookaheadReport({ ...arguments_, requestedSolverSteps: 297_600, solverSteps: 297_600 }).splitWarning,
    splitWarningFor(297_600, 48));
  assert.notEqual(lookaheadReport({ ...arguments_, requestedSolverSteps: 297_600 }).splitWarning, report.splitWarning);
});

test("a_lookahead_run_puts_its_notices_on_stderr_and_only_the_report_on_stdout", () => {
  // Disabling the stderr write left the suite green, and so did deleting the
  // field it reads. It is a stream a caller hands over for exactly that reason.
  //
  // Two sentences, because the budget proxy is not the fact. A run at exactly 192
  // steps per job gets no warning at all while 164 of its 775 keys are still
  // bit-identical to their own training rows -- 21 % of the calibration record
  // in-sample, under a held-out name -- so the measured count is emitted beside
  // the warning rather than left in the report for somebody to look up.
  const model = oneKeyModel("warrior/sword+empty", "hold+cut+primary+vital", { reachMargin: 0.4 });
  const base = { configDigest: "0badf00d", requestedSolverSteps: 595_200, solverSteps: 595_200, traceRows: 3_100,
    model, selectedSeed: 310_013, stepsPerJob: 192, calibrationKeys: 775, identicalCalibrationKeys: 164 };
  const atFloor = lookaheadReport(base);
  assert.equal(atFloor.splitWarning, null);
  assert.deepEqual(lookaheadNotices(atFloor), ["lookahead calibration: 164 of 775 keys got a validation sample " +
    "bit-identical to their own training sample, so that much of the calibration record is in-sample"]);
  // Below the floor, both sentences, warning first.
  const minimum = lookaheadReport({ ...base, requestedSolverSteps: 148_800, solverSteps: 148_800,
    stepsPerJob: 48, identicalCalibrationKeys: 775 });
  assert.deepEqual(lookaheadNotices(minimum), [minimum.splitWarning,
    "lookahead calibration: 775 of 775 keys got a validation sample bit-identical to their own training sample, " +
    "so that much of the calibration record is in-sample"]);
  // A real split at a real budget says nothing, so a quiet run means something.
  assert.deepEqual(lookaheadNotices({ ...base, splitWarning: null, identicalCalibrationKeys: 0 }), []);
  // And the streams. Whole streams against freshly built ones: a write that had
  // moved to the wrong stream would satisfy any assertion that read only one.
  const written = { stdout: [], stderr: [] };
  const stream = (name) => ({ write: (text) => written[name].push(text) });
  writeLookaheadOutput(minimum, { stdout: stream("stdout"), stderr: stream("stderr") });
  assert.deepEqual(written.stderr, lookaheadNotices(minimum).map((notice) => `${notice}\n`));
  assert.deepEqual(written.stdout, [`${canonicalJson(minimum)}\n`]);
  assert.deepEqual(JSON.parse(written.stdout[0]), minimum);
});

test("the_champion_is_chosen_by_severity_rather_than_by_a_sum_of_three_units", () => {
  // Reverting `calibrationScore` to a raw sum of the three new columns left the
  // whole suite green, and the champion is the same seed under both scores at all
  // four budgets -- so a full revert would have produced no failing test and no
  // changed artifact. The inputs did move, which the record under-sold: at
  // 595,200 the old score's winning margin was 0.003 % against 1.393 % under
  // severity, and at 1,190,400 the ranking of the two also-rans swaps.
  //
  // So the pair here is one the two scores order differently, which is the only
  // fixture that can tell them apart.
  const L = LOOKAHEAD_CALIBRATION_LIMITS;
  const key = "hold+cut+primary+vital"; const loadout = "warrior/sword+empty";
  const vitality = { seed: 1, model: oneKeyModel(loadout, key, { vitalityPotential: 0.08 }) };
  const reach = { seed: 2, model: oneKeyModel(loadout, key, { reachMargin: 0.10 }) };
  const rawSum = (model) => Object.values(model.cells).flatMap(Object.values).reduce((sum, fitted) =>
    sum + fitted.calibration.reachError + fitted.calibration.contactRateError + fitted.calibration.vitalityDeltaError, 0);
  // 0.08 of a health bar is a smaller number than 0.10 m and a larger fraction of
  // the tolerance the gate gives it: 0.8 of the vitality limit against 0.5 of the
  // reach one.
  assert.equal(rawSum(vitality.model).toFixed(12), (0.08).toFixed(12));
  assert.equal(rawSum(reach.model).toFixed(12), (0.10).toFixed(12));
  assert.ok(rawSum(vitality.model) < rawSum(reach.model), "the raw sum prefers the vitality candidate");
  assert.equal(modelCalibrationScore(vitality.model, L).toFixed(12), (0.8).toFixed(12));
  assert.equal(modelCalibrationScore(reach.model, L).toFixed(12), (0.5).toFixed(12));
  assert.equal(selectCalibratedCandidate([vitality, reach], L).seed, reach.seed);
  assert.equal(selectCalibratedCandidate([reach, vitality], L).seed, reach.seed);
  // The reach scale is the movement's own, so the same two candidates keyed on an
  // approach swap places: 0.10 m is 0.29 of an approach's tolerance, not 0.5.
  const approach = (candidate, seed) => ({ seed,
    model: oneKeyModel(loadout, "close+cut+primary+vital", candidate) });
  assert.equal(selectCalibratedCandidate([approach({ vitalityPotential: 0.08 }, 1),
    approach({ reachMargin: 0.10 }, 2)], L).seed, 2);
  assert.equal(modelCalibrationScore(approach({ reachMargin: 0.10 }, 2).model, L).toFixed(12),
    (0.10 / L.approachReachError).toFixed(12));
  // Ties go to the lower seed, so the choice is a function of the candidates and
  // not of the order they were collected in.
  const tied = (seed) => ({ seed, model: oneKeyModel(loadout, key, { reachMargin: 0.10 }) });
  assert.equal(selectCalibratedCandidate([tied(7), tied(3)], L).seed, 3);
  assert.equal(selectCalibratedCandidate([tied(3), tied(7)], L).seed, 3);
});

// Every limit judged by what it does to the checked-in record, one column at a
// time, with the other three at `Infinity` so the count belongs to the column
// being asked about. `calibrationRefusal` is the reader, not a second copy of
// the three comparisons.
const ONLY = (over) => ({ reachError: Infinity, approachReachError: Infinity,
  contactRateError: Infinity, vitalityDeltaError: Infinity, ...over });
const refusedBy = (limits) => calibrationRecordRows().filter((row) => calibrationRefusal(
  { cells: { [row.cell]: { [row.tactic]: { calibration: row.calibration } } }, tactics: {} },
  row.tactic, row.cell, limits) !== null);
const refusedComposition = (limits) => refusedBy(limits).reduce((counts, row) =>
  ({ ...counts, [row.movement]: (counts[row.movement] ?? 0) + 1 }), {});

test("each_deployed_limit_is_bounded_by_what_it_does_to_the_measured_record", () => {
  // **A limit bounded by an interval around its own value is not bounded.** This
  // asserted `0.20 < reachError < 0.35`, `0.20 < contactRateError < 0.45` and
  // `0.08 < vitalityDeltaError < 0.11`, and every one of the three bands admitted
  // the exact failure its own comment named: a `reachError` of 0.21 refused 156
  // of 775 keys and cost all thirteen bodies their approach, 0.105 of vitality
  // refused nothing at all, 0.44 of contact refused one key. All three left 542
  // green. So the record is checked in and the assertions are computed from it.
  const L = LOOKAHEAD_CALIBRATION_LIMITS;
  assert.deepEqual(Object.keys(L).sort(),
    ["approachReachError", "contactRateError", "reachError", "vitalityDeltaError"]);
  // Four different numbers in three units, which is the thing that was wrong with
  // them: one value spelled three times reads as a decision taken three times and
  // was a decision taken none.
  assert.equal(new Set(Object.values(L)).size, 4);
  assert.equal(calibrationRecordRows().length, CALIBRATION_RECORD_8X.keys);

  // Each column at its deployed value: the tail and not the body. Every one of
  // these counts moves if its limit moves, which is the two-sided bound.
  assert.deepEqual(refusedComposition(ONLY({ reachError: L.reachError })), { "circle-right": 1 });
  assert.deepEqual(refusedComposition(ONLY({ approachReachError: L.approachReachError })), { close: 2 });
  assert.equal(refusedBy(ONLY({ contactRateError: L.contactRateError })).length, 5);
  assert.equal(refusedBy(ONLY({ vitalityDeltaError: L.vitalityDeltaError })).length, 1);

  // The loose side. One notch out on each column and the column is a no-op --
  // which is what all three of the old bands permitted.
  for (const [column, noop] of [["reachError", 0.23], ["approachReachError", 0.36],
    ["contactRateError", 0.47], ["vitalityDeltaError", 0.105]]) {
    assert.equal(refusedBy(ONLY({ [column]: noop })).length, 0, `${column} at ${noop} refuses nothing`);
    assert.ok(L[column] < noop, `${column} ${L[column]} is at or past the value that makes it a no-op`);
  }
  // The tight side. Each of these is a class filter rather than a threshold on
  // error, and the reach one is the whole reason the column is two numbers.
  assert.deepEqual(refusedComposition(ONLY({ reachError: 0.15 })), { "circle-left": 6, "circle-right": 3, hold: 4 });
  assert.deepEqual(refusedComposition(ONLY({ reachError: 0.12 })),
    { "circle-left": 155, "circle-right": 155, hold: 155 });
  assert.deepEqual(refusedComposition(ONLY({ approachReachError: 0.30 })), { close: 66 });
  assert.deepEqual(refusedComposition(ONLY({ approachReachError: 0.25 })), { close: 142 });

  // And the whole gate, which is the number a run actually gets: 766 of 775, no
  // body without an approach, no cell with nothing plannable at all.
  const admitted = admittedByLimits(calibrationRefusal, L);
  assert.equal(admitted.length, 766);
  const cells = [...new Set(calibrationRecordRows().map((row) => row.cell))];
  // 13 is a property of the checked-in record and **not** of the strata, which
  // are 15 cells since `sword+axe`. Every "all thirteen bodies" below counts
  // this record's bodies. Renumbering it to 15 would be asserting that a dump
  // taken before the loadout existed contains it.
  assert.equal(cells.length, 13);
  assert.deepEqual(cells.filter((cell) => !admitted.some((row) => row.cell === cell)), []);
  assert.deepEqual(cells.filter((cell) => !admitted.some((row) => row.cell === cell && row.movement === "close")), []);

  // **Why the reach column is two numbers**, stated as the thing that happens if
  // it is one: the deployed non-approach value used as a single scalar refuses
  // every `close` key on the record and takes approach planning away from all
  // thirteen bodies. `reachLimitFor` keying on the movement is the only line
  // between those two outcomes.
  const scalar = (value) => admittedByLimits(calibrationRefusal,
    { ...L, reachError: value, approachReachError: value });
  const bodiesWithoutApproach = (rows) =>
    cells.filter((cell) => !rows.some((row) => row.cell === cell && row.movement === "close")).length;
  assert.equal(bodiesWithoutApproach(scalar(L.reachError)), 13);
  assert.equal(scalar(L.reachError).length, 617);
  // 0.30 -- the scalar this shipped with -- is the same close-only threshold at a
  // different quantile: 706 of 775, and the centipede has no approach left.
  assert.equal(scalar(0.30).length, 706);
  assert.equal(bodiesWithoutApproach(scalar(0.30)), 1);

  // No shipped budget reaches any of this. At 148,800 solver steps every column
  // of every key is exactly zero; at 297,600 the reach column tops out at 0.114,
  // under every reach limit above. The catastrophe is real and belongs to the
  // budgets nobody runs.
  const budget = (steps) => CALIBRATION_BUDGETS.find((row) => row.budget === steps);
  assert.deepEqual([budget(148800).maxReachError, budget(148800).maxContactRateError, budget(148800).maxVitalityDeltaError],
    [0, 0, 0]);
  for (const steps of [148800, 297600]) {
    assert.ok(budget(steps).maxReachError < Math.min(L.reachError, L.approachReachError),
      `the reach column refuses nothing at ${steps}`);
  }
});

test("the_champion_score_scales_every_column_by_the_tolerance_the_gate_gives_it", () => {
  // The champion score is the deployed limits used as scales, so a column sitting
  // exactly on its own limit contributes exactly 1. Without the division the
  // Brier term carried 94 % of the score at every budget and the seed was chosen
  // by it; with it, each column can contribute at most 1.0 before the gate would
  // have refused the cell outright.
  const L = LOOKAHEAD_CALIBRATION_LIMITS;
  const at = (key, fraction) => ({ reachError: (key.startsWith("close+") ? L.approachReachError : L.reachError) * fraction,
    contactRate: 0.5, contactRateError: L.contactRateError * fraction, vitalityDeltaError: L.vitalityDeltaError * fraction });
  for (const key of ["hold+cut+primary+vital", "close+cut+primary+vital"]) {
    assert.equal(calibrationSeverity(key, at(key, 0), L), 0, key);
    assert.equal(calibrationSeverity(key, at(key, 1), L).toFixed(12), (3).toFixed(12), key);
    assert.equal(calibrationSeverity(key, at(key, 0.5), L).toFixed(12), (1.5).toFixed(12), key);
    // One column moved on its own must move the score on its own, or a scale that
    // silently dropped a term would still satisfy the two totals above.
    for (const column of ["reachError", "contactRateError", "vitalityDeltaError"]) {
      assert.equal(calibrationSeverity(key, { ...at(key, 0), [column]: at(key, 1)[column] }, L).toFixed(12),
        (1).toFixed(12), `${key} ${column}`);
    }
  }
  // And the reach scale is the movement's own, so one calibration record scores
  // differently under two keys -- which is what stops the score ranking candidates
  // by a threshold the gate does not enforce.
  const calibration = { reachError: L.reachError, contactRate: 0, contactRateError: 0, vitalityDeltaError: 0 };
  assert.equal(calibrationSeverity("hold+cut+primary+vital", calibration, L), 1);
  assert.equal(calibrationSeverity("close+cut+primary+vital", calibration, L).toFixed(12),
    (L.reachError / L.approachReachError).toFixed(12));
});

test("the_approach_set_names_movements_the_option_table_actually_has", () => {
  // `APPROACH_MOVEMENTS` is spelled in `tactical-model.ts` rather than imported
  // from `options.ts`, because the cell key grammar is that module's contract.
  // The cost of spelling it twice is that a rename could leave it naming a
  // movement nothing produces, and the gate would then apply the strict limit to
  // every key while looking exactly like a gate with nothing to loosen.
  assert.deepEqual(APPROACH_MOVEMENTS, ["close"]);
  for (const movement of APPROACH_MOVEMENTS) assert.ok(MOVEMENT_NAMES.includes(movement), movement);
  // Every movement the record carries is one of the option table's, and every one
  // of the option table's is in the record -- so "the four ordinary movements" is
  // a count of something rather than a phrase.
  const movements = [...new Set(calibrationRecordRows().map((row) => row.movement))].sort();
  assert.deepEqual(movements, [...MOVEMENT_NAMES].sort());
  assert.equal(movements.filter((movement) => !APPROACH_MOVEMENTS.includes(movement)).length, 4);
  // A key outside the grammar gets the strict limit, which is the safe half.
  assert.equal(reachLimitFor("hold+cut+primary+vital", LOOKAHEAD_CALIBRATION_LIMITS), LOOKAHEAD_CALIBRATION_LIMITS.reachError);
  assert.equal(reachLimitFor("close+cut+primary+vital", LOOKAHEAD_CALIBRATION_LIMITS), LOOKAHEAD_CALIBRATION_LIMITS.approachReachError);
  assert.equal(reachLimitFor("nonsense", LOOKAHEAD_CALIBRATION_LIMITS), LOOKAHEAD_CALIBRATION_LIMITS.reachError);
});

test("the_contact_column_refuses_a_miscalibrated_rate_and_admits_an_uncertain_outcome", () => {
  // The contact column is the one that cannot be exercised in-sample at all. The
  // model has no covariates, so its contact prediction is the group's own rate p;
  // against outcomes of rate q a constant predictor scores q(1-q) + (p-q)^2, and
  // in-sample p == q leaves exactly the irreducible q(1-q). A raw Brier limit of
  // 0.25 is therefore the in-sample ceiling itself, and out of sample it refuses
  // cells whose *outcome* is uncertain rather than cells whose *model* is wrong.
  const LOADOUT = "warrior/sword+empty";
  const LIMITS = { reachError: 0.15, approachReachError: 0.35, contactRateError: 0.25, vitalityDeltaError: 0.10 };
  const key = "hold+cut+primary+vital";
  const rows = (split, contacts, total) => Array.from({ length: total }, (_, index) =>
    traceRow(key, LOADOUT, split, index < contacts));
  // Well calibrated and genuinely uncertain: fitted rate 0.6 against a held-out
  // rate of 0.5. The raw Brier is 0.25 + 0.01 = 0.26 -- over the shipped limit --
  // while the model is wrong about the rate by one tenth. This is the cell a
  // look-ahead most needs to search, and the shipped gate throws it away.
  const uncertain = calibrateTacticalModel(fitTacticalModel(rows("train", 6, 10)), rows("validation", 5, 10));
  assert.deepEqual(round(uncertain.cells[LOADOUT][key].calibration),
    { reachError: 0, contactRate: 0.5, contactRateError: 0.1, vitalityDeltaError: 0 });
  assert.equal(calibrationRefusal(uncertain, key, LOADOUT, LIMITS), null);
  // Genuinely miscalibrated: every training row contacted and no held-out row did.
  const wrong = calibrateTacticalModel(fitTacticalModel(rows("train", 10, 10)), rows("validation", 0, 10));
  assert.deepEqual(round(wrong.cells[LOADOUT][key].calibration),
    { reachError: 0, contactRate: 0, contactRateError: 1, vitalityDeltaError: 0 });
  assert.throws(() => requireCalibration(wrong, key, LOADOUT, LIMITS),
    /^Error: lookahead refuses warrior\/sword\+empty: calibration failed for tactic "hold\+cut\+primary\+vital"$/);
});

test("the_runtime_mind_refuses_an_uncalibrated_exact_body_before_planning", () => {
  // The other side of the filter above. Declining one untrained cell is the
  // search stating its own competence; declining *every* cell the body can
  // perform is a model that cannot fly this body at all, and that is a request
  // the control cannot honour -- so it is refused by name, naming the actions it
  // could not predict rather than whichever one it happened to ask about first.
  const model = fitTacticalModel([{ ...row("hold+cut+primary+vital", {}), bodyLoadout: "warrior/sword+empty" }]);
  const mind = lookaheadMind(model, "centipede/bite", { reachError: 1, approachReachError: 1, contactRateError: 1, vitalityDeltaError: 1 }, 1, 1);
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
  assert.deepEqual(HAND_ACTION_NAMES.filter((name) => deployableActions(view).has(name)), ["bite", "recover"]);
  assert.throws(() => mind.decide(view, 1 / 240),
    /lookahead refuses centipede\/bite: no calibrated model for any tactic on \[bite, recover\]/);
});

test("the_same_trace_replays_the_same_tactics_and_diagnostic_scores", () => {
  const tactics = [cell("close", "cover", "primary", "threat"), cell("hold", "cut", "primary", "vital")];
  const rows = [row("close+cover+primary+threat", { reachMargin: 0.1 }),
    row("hold+cut+primary+vital", { contactProbability: 0.2, vitalityPotential: 0.05 })];
  const a = boundedLookahead(fitTacticalModel(rows), state(), tactics); const b = boundedLookahead(fitTacticalModel(rows), state(), tactics);
  assert.deepEqual(a.sequence, b.sequence); assert.deepEqual(a.diagnostics, b.diagnostics); assert.equal(a.score, b.score);
});

test("reordering_object_properties_does_not_change_the_selected_sequence", () => {
  const tactics = [cell("close", "cover", "primary", "threat"), cell("hold", "cut", "primary", "vital")];
  const model = fitTacticalModel([row("close+cover+primary+threat", { reachMargin: 0.1 }),
    row("hold+cut+primary+vital", { contactProbability: 0.1 })]);
  const reordered = { vitalityPotential: 0, contactProbability: 0.05, threatAlignment: 0.1,
    facingError: 0.2, reachMargin: -0.5 };
  assert.deepEqual(boundedLookahead(model, state(), tactics).sequence, boundedLookahead(model, reordered, tactics).sequence);
  const tied = fitTacticalModel(tactics.map((tactic) => row(plannedTacticKey(tactic), {})));
  assert.deepEqual(boundedLookahead(tied, state(), tactics).tactic, tactics[0]);
});
