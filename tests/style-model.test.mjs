// The style model and the tactician over it. Session 09 of the style set.
//
// The model is the matchup set's duel model under a second vocabulary: the same shrinkage, the
// same successor counts and the same finite-horizon dynamic program, over a state that also knows
// whose arm is longer and over the third executor's fifteen options. So what is tested here is
// exactly what is new -- the state, the vocabulary, and that a search over synthetic tables in
// which a commit punishes a cut and rewards a parry says parry and then cut -- plus the two
// things a shipped artifact owes: a refusal by version, and a replan inside its budget.
//
// That the *first* vocabulary still fits what it fitted before is `tests/duel-model.test.mjs`,
// which pins the shrunk numbers of a synthetic log to nine decimal places and is unchanged by the
// refactor; the checked-in `duel-model-tables.ts` was re-rendered from its own sources under the
// parametrised fit and came out byte-identical.
import test from "node:test";
import assert from "node:assert/strict";

import { DUEL_VOCABULARY, coarseOf, fitDuelModel, planIn } from "../src/golem/duel-model.ts";
import {
  REACH_PAIRS, STYLE_MODEL_VERSION, STYLE_VOCABULARY, allStyleStates, checkStyleModel,
  parseStyleStateKey, styleFamilyKey, styleObserve, styleStateKey, styleStatesOf,
} from "../src/golem/style-model.ts";
import { STYLE_MODEL_TABLES } from "../src/golem/style-model-tables.ts";
import { GOLEM_TACTICIAN, golemTactician } from "../src/golem/tactician.ts";
import { STYLE_OPTIONS } from "../src/golem/tactics-v3.ts";

const reading = (over) => ({
  gap: 1.0, strike: 1.2, slack: 0.1, gapRate: 0,
  theirWeapon: "sword", myWeapon: "sword", theirs: "idle", mine: "free",
  longer: false, shorter: false,
  ...over,
});

test("a_style_state_is_the_duel_state_with_the_reach_pair_in_front_of_the_coarse_part", () => {
  assert.equal(styleObserve(reading({}), 0.8).reach, "equal");
  assert.equal(styleObserve(reading({ longer: true }), 0.8).reach, "longer");
  assert.equal(styleObserve(reading({ shorter: true }), 0.8).reach, "shorter");
  // The gap band and the weapon pair are the duel model's own read, called and not repeated.
  assert.equal(styleObserve(reading({}), 0.8).gap, "mine");
  assert.equal(styleObserve(reading({ gap: 2.0 }), 0.8).gap, "out");
  assert.equal(styleObserve(reading({ myWeapon: "club" }), 0.8).heavy, "hn");
  const state = styleObserve(reading({ shorter: true, theirs: "commit", mine: "recover" }), 0.8);
  assert.equal(styleStateKey(state), "nn/shorter/mine/commit/recover");
  assert.deepEqual(parseStyleStateKey(styleStateKey(state)), state);
  // The prefix is the two segments a bout never leaves, and `coarseOf` cuts exactly them.
  assert.equal(styleFamilyKey(state), "nn/shorter");
  assert.equal(coarseOf(STYLE_VOCABULARY, styleStateKey(state)), "mine/commit/recover");
  assert.equal(coarseOf(DUEL_VOCABULARY, "nn/mine/commit/recover"), "mine/commit/recover");
  assert.equal(styleStatesOf("nn", "equal").length, 48, "four bands, four phases of theirs, three of mine");
  assert.equal(allStyleStates().length, 48 * 4 * REACH_PAIRS.length);
  assert.equal(new Set(allStyleStates().map(styleStateKey)).size, 576);
  assert.equal(STYLE_VOCABULARY.options.length, 15);
  assert.equal(STYLE_VOCABULARY.prefixDepth, 2);
  assert.equal(STYLE_VOCABULARY.version, STYLE_MODEL_VERSION);
});

/** A model in which a commit punishes a cut and rewards a parry, and a recover the reverse. */
const A = "nn/equal/both/commit/free";
const B = "nn/equal/both/recover/free";
const C = "nn/equal/both/idle/free";
const record = (state, option, dealt, taken, next, n = 20) =>
  Array.from({ length: n }, () => ({ state, option, dealt, taken, seconds: 0.4, next }));
const synthetic = () => fitDuelModel([
  ...record(A, "cut", 1, 3, A),
  ...record(A, "parry", 0, 0.1, B),
  ...record(A, "hold", 0, 0.5, A),
  ...record(B, "cut", 3, 0, C),
  ...record(B, "parry", 0, 0.2, C),
  ...record(B, "hold", 0, 0.1, C),
  ...record(C, "hold", 0, 0, C),
  ...record(C, "cut", 0.5, 0.5, A),
  // The same three windows on a shorter arm, thin, so the family below the pair must back off.
  ...record("nn/shorter/both/commit/free", "parry", 0, 0.3, "nn/shorter/both/recover/free", 2),
], { seed: 1, date: "2026-09-07", bouts: 1, windowSeconds: 0.5, shrink: 4 }, STYLE_VOCABULARY);

test("the_search_parries_a_read_commit_and_cuts_into_the_recover_behind_it", () => {
  const tables = synthetic();
  assert.equal(tables.version, STYLE_MODEL_VERSION, "the fit stamps the vocabulary's version");
  const params = { horizon: GOLEM_TACTICIAN.horizon, discount: GOLEM_TACTICIAN.discount };
  const weights = { dealt: 1, taken: 1 };
  const all = [...STYLE_OPTIONS];
  const plan = (key, open = all) =>
    planIn(STYLE_VOCABULARY, tables, parseStyleStateKey(key), open, weights, params);
  const commit = plan(A);
  assert.equal(commit.option, "parry",
    `into a commit the search chose ${commit.option}: ${commit.values.map((v) => v.toFixed(2)).join(" ")}`);
  assert.equal(plan(B).option, "cut", "into a recover the search chose something other than a cut");
  // The family is forty-eight states whatever the tables hold, because reach and weapon are
  // fixed inside a bout: the search visits a quarter of the five hundred and seventy-six.
  assert.equal(commit.evaluated, 48 * STYLE_OPTIONS.length);
  assert.equal(commit.values.length, STYLE_OPTIONS.length);
  assert.equal(plan(A, ["hold", "cut"]).option, "hold", "with the parry closed, a hold beats a cut into a commit");
  // An option the log never recorded reads NaN and is never chosen, even where the recorded
  // ones all cost something.
  assert.ok(Number.isNaN(commit.values[STYLE_OPTIONS.indexOf("shove")]));
  assert.equal(plan(A, ["hold", "shove", "duck"]).option, "hold");
  // A short arm has two records of its own, under the shrinkage count, so it reads the family
  // above it: the same answer, arrived at by backing off rather than by evidence.
  assert.equal(plan("nn/shorter/both/commit/free").option, "parry");
});

test("tables_of_another_version_are_refused_by_name_and_the_tactician_refuses_them_too", () => {
  const tables = synthetic();
  assert.equal(checkStyleModel(tables), tables);
  assert.throws(() => checkStyleModel({ ...tables, version: 99 }), /version 99; this build reads version 1/);
  assert.throws(() => golemTactician(7, { ...tables, version: 0 }), /style model tables are version 0/);
  assert.equal(checkStyleModel(STYLE_MODEL_TABLES).version, STYLE_MODEL_VERSION);
  assert.equal(GOLEM_TACTICIAN.explore, 0, "a shipped tactician answers no ask at random");
});

/**
 * The plan's budget is five milliseconds a replan and the executor asks six times a second. As
 * with the planner's, the number is printed so the entry reads it off the run, and the assertion
 * is placed well above the cost so a loaded test host does not fail the gate on its own account.
 *
 * The family is the same forty-eight states the duel model searched, so the only thing that grew
 * is the option count: fifteen columns instead of eight.
 */
test("a_replan_on_the_checked_in_tables_is_well_inside_its_budget", () => {
  const roots = allStyleStates();
  const params = { horizon: GOLEM_TACTICIAN.horizon, discount: GOLEM_TACTICIAN.discount };
  const weights = { dealt: 1 + GOLEM_TACTICIAN.aggression, taken: 1 };
  // The first search on a family reads the tables out; that is paid once a family per process
  // and is not the replan.
  for (let i = 0; i < 24; i += 1) {
    planIn(STYLE_VOCABULARY, STYLE_MODEL_TABLES, roots[i], STYLE_OPTIONS, weights, params);
  }
  const started = performance.now();
  const runs = 400;
  for (let i = 0; i < runs; i += 1) {
    const plan = planIn(STYLE_VOCABULARY, STYLE_MODEL_TABLES, roots[i % roots.length], STYLE_OPTIONS, weights, params);
    assert.ok(STYLE_OPTIONS.includes(plan.option));
  }
  const ms = (performance.now() - started) / runs;
  console.log(`replan cost: ${ms.toFixed(3)} ms per search over ${roots.length} roots`);
  assert.ok(ms < 5, `a replan cost ${ms.toFixed(2)} ms, over the plan's 5 ms budget`);
});
