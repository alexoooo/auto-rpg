import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { LOOKAHEAD_DEPTH, LOOKAHEAD_WIDTH, LookaheadController, boundedLookahead, exactLookaheadNodeBudget,
  lookaheadMind, plannedTacticKey, shouldReplan, supportedPlannedTactics } from "../src/learning/lookahead.ts";
import { TACTICAL_MODEL_VERSION, TACTICAL_STATE_COLUMNS, fitTacticalModel, requireCalibration } from "../src/learning/tactical-model.ts";
import { actionsFor, collectTacticalTrace, lookaheadTacticCellSchedule, tacticsFor,
  trainLookahead } from "../scripts/train-lookahead.mjs";
import { runResearchBout } from "../scripts/research-havok.mjs";
import { EngagementTracker, attackOpportunity, opportunityKeyForContact } from "../src/learning/engagement.ts";
import { UNLEARNED_PERSISTENCE, UNLEARNED_STANCE, deployableActions, deployableTactics } from "../src/learning/meta.ts";
import { researchMatrix } from "../src/learning/research-matrix.ts";
import { researchLabelMind } from "../src/learning/research-policy.ts";
import { HAND_ACTION_NAMES, MOVEMENT_NAMES, composeTactic, handActionOption, movementIntent } from "../src/options.ts";
import { freshIntent } from "../src/action-primitives.ts";
import { probeLabel } from "./fixtures/label.mjs";
import { RESEARCH_LABEL_FIELDS } from "./fixtures/label.mjs";
import { assertCompleteView, publishedFixture } from "./fixtures/view.mjs";

const state = (overrides = {}) => ({ reachMargin: -0.5, facingError: 0.2, threatAlignment: 0.1,
  contactProbability: 0.05, vitalityPotential: 0, ...overrides });
const row = (tactic, delta, contact = false) => { const before = state(); return { tactic, before,
  after: Object.fromEntries(TACTICAL_STATE_COLUMNS.map((name) => [name, before[name] + (delta[name] ?? 0)])), contact }; };
const cell = (movement, action, effector, target) => Object.freeze({ movement, action, effector, target });
const LOADOUTS = ["sword+empty", "sword+shield", "sword+buckler", "axe+empty", "bow+empty", "empty+empty", "natural:bite"];

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
  assert.equal(new Set(train.map((task) => task.cell)).size, 13);
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
  assert.equal(train.length, 775);
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
    "axe+empty": { tuples: 13, cells: 65, nodesPerReplan: 2795 },
    "bow+empty": { tuples: 7, cells: 35, nodesPerReplan: 1505 },
    "empty+empty": { tuples: 12, cells: 60, nodesPerReplan: 2580 },
    "natural:bite": { tuples: 3, cells: 15, nodesPerReplan: 645 },
  });
  // The trainer's own arithmetic rather than this test's: `groups` is
  // `3 x train + validation` and the floor is 48 steps a group. It refuses
  // before it runs a single bout, which is why this costs no Havok.
  assert.rejects(() => trainLookahead({ seed: 310013, solverSteps: 148_796 }),
    /lookahead budget 148796 cannot cover 3100 indexed tactic-cell jobs; minimum is 148800/);
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
  assert.equal(cells.length, 13);
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
  const LIMITS = { signedReachError: 1, contactBrier: 1, vitalityDeltaError: 1 };
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
  const LIMITS = { signedReachError: 1, contactBrier: 1, vitalityDeltaError: 1 };
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
  const LIMITS = { signedReachError: 1, contactBrier: 1, vitalityDeltaError: 1 };
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

test("calibration_failure_refuses_the_exact_body_and_loadout", () => {
  const model = fitTacticalModel([row("hold+cut+primary+vital", { reachMargin: 0.4, contactProbability: 0.1 })]);
  assert.throws(() => requireCalibration(model, "hold+cut+primary+vital", "centipede/sword", {
    signedReachError: 0.01, contactBrier: 0.01, vitalityDeltaError: 0.01,
  }), /lookahead refuses centipede\/sword: tactic "hold\+cut\+primary\+vital" has no calibrated model/);
});

test("the_runtime_mind_refuses_an_uncalibrated_exact_body_before_planning", () => {
  // The other side of the filter above. Declining one untrained cell is the
  // search stating its own competence; declining *every* cell the body can
  // perform is a model that cannot fly this body at all, and that is a request
  // the control cannot honour -- so it is refused by name, naming the actions it
  // could not predict rather than whichever one it happened to ask about first.
  const model = fitTacticalModel([{ ...row("hold+cut+primary+vital", {}), bodyLoadout: "warrior/sword+empty" }]);
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
