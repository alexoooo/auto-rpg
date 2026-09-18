// The duel model and the planner over it. Session 06 of the matchup set.
//
// The model is a table of what each option did from each state of a small discrete duel, and
// the planner is a finite-horizon dynamic program over it. Both are pure, so the tests here fit
// a handful of synthetic records and read back exactly what the rules say they should: how a
// reading falls into a band, how a thin cell shrinks toward its parents, where an unseen row
// backs off to, that a search over a model in which a commit punishes a strike and a recover
// rewards one says wait and then strike. The last test times the search on the checked-in
// tables, because the plan's budget for a replan is a number and not an adjective.
import test from "node:test";
import assert from "node:assert/strict";

import {
  DUEL_MODEL_VERSION,
  DUEL_OPTIONS,
  checkDuelModel,
  fitDuelModel,
  observe,
  outcomeOf,
  parseStateKey,
  planOption,
  stateKey,
  statesOf,
  transitionsOf,
} from "../src/golem/duel-model.ts";
import { DUEL_MODEL_TABLES } from "../src/golem/duel-model-tables.ts";
import { GOLEM_PLANNER, golemPlanner } from "../src/golem/planner.ts";

const reading = (over) => ({
  gap: 1.0, strike: 1.2, slack: 0.1, gapRate: 0,
  theirWeapon: "sword", myWeapon: "sword", theirs: "idle", mine: "free",
  ...over,
});

test("a_reading_falls_into_a_gap_band_by_the_two_reaches_and_a_weapon_pair_by_the_clubs", () => {
  // I reach them (1.0 <= 1.2); they do not (1.0 > 0.8 + 0.1).
  assert.equal(observe(reading({}), 0.8).gap, "mine");
  assert.equal(observe(reading({ gap: 2.0 }), 0.8).gap, "out");
  assert.equal(observe(reading({ gap: 0.85 }), 0.8).gap, "both");
  assert.equal(observe(reading({ gap: 1.5 }), 1.5).gap, "theirs");
  assert.equal(observe(reading({ myWeapon: "club" }), 0.8).heavy, "hn");
  assert.equal(observe(reading({ theirWeapon: "club" }), 0.8).heavy, "nh");
  assert.equal(observe(reading({ myWeapon: "club", theirWeapon: "club" }), 0.8).heavy, "hh");
  const state = observe(reading({ theirs: "commit", mine: "recover" }), 0.8);
  assert.equal(stateKey(state), "nn/mine/commit/recover");
  assert.deepEqual(parseStateKey(stateKey(state)), state);
  assert.equal(statesOf("nn").length, 48, "four bands, four phases of theirs, three of mine");
  assert.equal(new Set(statesOf("hh").map(stateKey)).size, 48);
});

/** A model in which a commit punishes a strike and rewards a wait, and a recover the reverse. */
const A = "nn/both/commit/free";
const B = "nn/both/recover/free";
const C = "nn/both/idle/free";
const record = (state, option, dealt, taken, next, n = 20) =>
  Array.from({ length: n }, () => ({ state, option, dealt, taken, seconds: 0.4, next }));
const synthetic = () => fitDuelModel([
  ...record(A, "strike", 1, 3, A),
  ...record(A, "wait", 0, 0.2, B),
  ...record(A, "hold", 0, 0.5, A),
  ...record(B, "strike", 3, 0, C),
  ...record(B, "wait", 0, 0, C),
  ...record(B, "hold", 0, 0.1, C),
  ...record(C, "hold", 0, 0, C),
  ...record(C, "strike", 0.5, 0.5, A),
  // A thin row on the heavy pair, under the shrinkage count, that must back off.
  ...record("hn/both/commit/free", "wait", 0, 0.3, "hn/both/recover/free", 2),
], { seed: 1, date: "2026-09-06", bouts: 1, windowSeconds: 0.5, shrink: 4 });

test("a_cell_shrinks_toward_its_coarse_and_option_parents_by_the_pseudo_count", () => {
  const tables = synthetic();
  assert.equal(tables.version, DUEL_MODEL_VERSION);
  assert.equal(tables.records, 162);
  // Strike across the whole log: (20 x 1 + 20 x 3 + 20 x 0.5) / 60 dealt, (60 + 10) / 60 taken.
  const unseen = outcomeOf(tables, parseStateKey("hh/out/idle/free"), "strike");
  assert.equal(unseen.n, 0);
  assert.ok(Math.abs(unseen.dealt - 1.5) < 1e-9 && Math.abs(unseen.taken - 70 / 60) < 1e-9,
    `an unseen cell reads the option mean, not ${unseen.dealt} / ${unseen.taken}`);
  const seen = outcomeOf(tables, parseStateKey(A), "strike");
  assert.equal(seen.n, 20);
  assert.ok(seen.dealt > 1 && seen.dealt < 1.1, `twenty records at 1 pulled toward 1.5 by four: ${seen.dealt}`);
  assert.ok(seen.taken > 2.85 && seen.taken < 3, `twenty records at 3 pulled toward 1.17 by four: ${seen.taken}`);
  // The heavy pair never saw a strike from A, so it reads the coarse cell shrunk once more.
  const coarse = outcomeOf(tables, parseStateKey("hn/both/commit/free"), "strike");
  assert.equal(coarse.n, 0);
  assert.ok(coarse.dealt > 1 && coarse.dealt < seen.dealt + 0.1);
  const never = outcomeOf(tables, parseStateKey(A), "ram");
  assert.equal(never.dealt, 0);
  assert.equal(never.taken, 0);
});

test("a_transition_row_is_used_whole_backs_off_to_the_coarse_row_and_then_to_the_state_itself", () => {
  const tables = synthetic();
  assert.deepEqual(transitionsOf(tables, parseStateKey(A), "wait"), [[B, 1]]);
  // Two records are under the shrinkage count of four: the coarse row, re-prefixed with hn.
  assert.deepEqual(transitionsOf(tables, parseStateKey("hn/both/commit/free"), "wait"),
    [["hn/both/recover/free", 1]]);
  // A cell nothing was ever logged for stays where it is.
  const nowhere = parseStateKey("hh/out/chamber/exchange");
  assert.deepEqual(transitionsOf(tables, nowhere, "circle"), [[stateKey(nowhere), 1]]);
});

test("the_search_waits_out_a_commit_and_strikes_into_the_recover_behind_it", () => {
  const tables = synthetic();
  const params = { horizon: GOLEM_PLANNER.horizon, discount: GOLEM_PLANNER.discount };
  const weights = { dealt: 1, taken: 1 };
  const all = [...DUEL_OPTIONS];
  const commit = planOption(tables, parseStateKey(A), all, weights, params);
  assert.equal(commit.option, "wait", `into a commit the search chose ${commit.option}: ${commit.values.map((v) => v.toFixed(2)).join(" ")}`);
  const recover = planOption(tables, parseStateKey(B), all, weights, params);
  assert.equal(recover.option, "strike", `into a recover the search chose ${recover.option}`);
  // Values are in DUEL_OPTIONS order, NaN where an option was not open, and the choice is
  // among the open ones only.
  assert.equal(commit.values.length, DUEL_OPTIONS.length);
  const noWait = planOption(tables, parseStateKey(A), ["hold", "strike"], weights, params);
  assert.equal(noWait.option, "hold", "with wait closed, a hold beats a strike into a commit");
  assert.ok(Number.isNaN(noWait.values[DUEL_OPTIONS.indexOf("wait")]));
  assert.equal(commit.evaluated, 48 * DUEL_OPTIONS.length);
  // A one-window horizon is myopic: from A a strike deals 1 and takes ~3, a wait takes 0.2, so
  // it still waits; but with taking made free, the strike is the best window in isolation.
  const greedy = planOption(tables, parseStateKey(A), all, { dealt: 1, taken: 0 }, { horizon: 1, discount: 0 });
  assert.equal(greedy.option, "strike");
  // An option the log never saw is not free: it reads NaN and is never the choice, even where
  // every recorded option costs something.
  assert.ok(Number.isNaN(commit.values[DUEL_OPTIONS.indexOf("circle")]));
  const costly = planOption(tables, parseStateKey(A), ["hold", "circle", "ram"], { dealt: 1, taken: 1 }, params);
  assert.equal(costly.option, "hold", `an unrecorded option was chosen: ${costly.option}`);
});

test("tables_of_another_version_are_refused_by_name_and_the_planner_refuses_them_too", () => {
  const tables = synthetic();
  assert.equal(checkDuelModel(tables), tables);
  assert.throws(() => checkDuelModel({ ...tables, version: 99 }), /version 99; this build reads version 1/);
  assert.throws(() => golemPlanner(7, { ...tables, version: 0 }), /version 0/);
  assert.equal(checkDuelModel(DUEL_MODEL_TABLES).version, DUEL_MODEL_VERSION);
  assert.equal(GOLEM_PLANNER.explore, 0, "a shipped planner answers no ask at random");
});

/**
 * The plan's budget is five milliseconds a replan, and the fencer asks six times a second. The
 * number is printed as a diagnostic so the measurements entry reads it off the run, and the
 * assertion is placed well above what the search costs so that a slow test host does not fail
 * the gate on its own account.
 */
test("a_replan_on_the_checked_in_tables_is_well_inside_its_budget", () => {
  const roots = [];
  for (const heavy of ["nn", "hn", "nh", "hh"]) roots.push(...statesOf(heavy));
  const params = { horizon: GOLEM_PLANNER.horizon, discount: GOLEM_PLANNER.discount };
  const weights = { dealt: 1 + GOLEM_PLANNER.aggression, taken: 1 };
  // The first search on a pair reads the tables out; that is paid once per process and is
  // not the replan.
  for (let i = 0; i < 20; i += 1) planOption(DUEL_MODEL_TABLES, roots[i], DUEL_OPTIONS, weights, params);
  const started = performance.now();
  const runs = 400;
  for (let i = 0; i < runs; i += 1) {
    const plan = planOption(DUEL_MODEL_TABLES, roots[i % roots.length], DUEL_OPTIONS, weights, params);
    assert.ok(DUEL_OPTIONS.includes(plan.option));
  }
  const ms = (performance.now() - started) / runs;
  console.log(`replan cost: ${ms.toFixed(3)} ms per search over ${roots.length} roots`);
  assert.ok(ms < 5, `a replan cost ${ms.toFixed(2)} ms, over the plan's 5 ms budget`);
});
