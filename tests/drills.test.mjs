// The drills (skill ceiling session 03, `docs/plans/2026-09-25-skill-ceiling-03-drills-and-league.md`),
// on the odd morphology: a three-legged, one-armed body against a wheeled head-rammer with no hands.
//
// What is held here:
// - **A drill declares capabilities, never a body.** A pair without what the drill needs is skipped
//   with the reason, and a skip is never scored; beside it, the same checker admitting a pair that
//   has them.
// - **The odd pair reaches its starts, and the ladder is ordered on them.** Idle fails and the
//   walker passes where the drill can tell them apart.
// - **Every rung plays one start.** A rung's result is the same whether it is played alone or after
//   another rung, which is what pairs the rungs by start.
// - **A start its control does not admit is void.** Reported with the reason, never scored.
// - **Breaking the duelist's guard fails `survive-cut`.** The plan's mutation check, on the high
//   line, where the default golem's guard is.
//
// Harness: the Node bout runner and the fork harness (`tests/harness/drills.mjs`); every world in a
// Havok instance of its own.
import test from "node:test";
import assert from "node:assert/strict";
import { Logger } from "@babylonjs/core/Misc/logger.js";

import { DRILLS, GUARDLESS, runDrill, summarizeDrill } from "./harness/drills.mjs";
import { summarize, table } from "../research/drills.mjs";
import { attributesRefusal } from "../src/golem/attributes.ts";
import { defaultGolemSetup } from "../src/golem/build.ts";
import { namedBuild } from "../src/golem/roster.ts";

Logger.LogLevels = Logger.ErrorLogLevel;

const golem = (locomotion, torso, head, [pc, pt], [sc, st]) => ({ family: "golem", locomotion, torso, head,
  primary: { chain: pc, terminal: pt }, secondary: { chain: sc, terminal: st } });
/** Three legs and one bladed arm (as in `tests/fork.test.mjs` and `tests/walker.test.mjs`). */
const TRI = golem("locomotion.multileg", "torso.plain", "head.plain", ["reach", "blade"], ["none", "none"]);
/** A wheeled head-rammer with no hands. */
const RAM = golem("locomotion.wheel", "torso.plain", "head.ram", ["none", "none"], ["none", "none"]);

const drill = (name, subjectSetup, opponentSetup, seed, rungs, fix) =>
  runDrill({ drill: name, subjectSetup, opponentSetup, seed, rungs, fix });

test("a_drill_declares_capabilities_and_a_pair_without_them_is_skipped_with_the_reason", async () => {
  const cases = [
    ["land-clean-blow", RAM, TRI, /subject lacks an edged effector/],
    ["finish", RAM, TRI, /subject lacks a striker that reaches the ground/],
    ["hold-range", RAM, TRI, /subject lacks a hand that strikes/],
    ["punish-miss", TRI, RAM, /opponent lacks a hand that strikes/],
  ];
  const runs = [];
  for (const [name, subject, opponent, reason] of cases) {
    const run = await drill(name, subject, opponent, 500);
    assert.match(run.skipped ?? "", reason, `${name}: ${JSON.stringify(run.skipped)}`);
    assert.equal(run.rungs, undefined, `${name}: a skip plays no rung`);
    runs.push(run);
  }
  // Control: the same checker admits the pair the other way round, which has an edged arm.
  const admitted = await drill("land-clean-blow", TRI, RAM, 500, ["idle"]);
  assert.equal(admitted.skipped, undefined);
  assert.ok(admitted.rungs.idle, "an admitted pair plays its rungs");
  runs.push(admitted);

  const summary = summarizeDrill(runs, ["idle"]);
  assert.equal(summary.skipped, 4);
  assert.equal(summary.scored, 1);
  assert.equal(summary.rungs.idle.n, 1, "a skip is never scored");
  assert.equal(Object.values(summary.reasons.skipped).reduce((a, b) => a + b, 0), 4);
});

test("the_odd_pair_reaches_its_starts_and_the_ladder_is_ordered_on_them", async () => {
  for (const [name, seed] of [["land-clean-blow", 500], ["land-clean-blow", 501], ["finish", 500]]) {
    const run = await drill(name, TRI, RAM, seed, ["idle", "golem-walker"]);
    assert.ok(run.rungs, `${name} ${seed}: ${run.refused ?? run.void ?? run.skipped}`);
    assert.equal(run.start.preludeDamage, 0, `${name} ${seed}: nothing is struck on the way to the start`);
    assert.equal(run.rungs.idle.pass, false, `${name} ${seed}: idle does not pass`);
    assert.equal(run.rungs["golem-walker"].pass, true, `${name} ${seed}: the walker does`);
  }
  // The wheel, as the subject, is placed and cut at by the multileg's one arm.
  const cut = await drill("survive-cut", RAM, TRI, 500, ["idle"]);
  assert.ok(cut.rungs, `survive-cut: ${cut.refused ?? cut.void}`);
  assert.ok(cut.rungs.idle.margin >= 0.03, "the multileg's cut wounds the idle wheel");
});

test("every_rung_plays_the_same_start_and_no_rung_leaks_into_the_next", async () => {
  const both = await drill("land-clean-blow", TRI, RAM, 501, ["golem-walker", "idle", "golem-duelist"]);
  const idle = await drill("land-clean-blow", TRI, RAM, 501, ["idle"]);
  const duelist = await drill("land-clean-blow", TRI, RAM, 501, ["golem-duelist"]);
  assert.deepEqual(both.start, idle.start, "the start does not depend on the rungs played from it");
  assert.deepEqual(both.rungs.idle, idle.rungs.idle, "idle after the walker is idle alone");
  assert.deepEqual(both.rungs["golem-duelist"], duelist.rungs["golem-duelist"], "and so is the duelist");
  // Control: the rungs do differ, so the equality above is not two blank results agreeing.
  assert.notDeepEqual(both.rungs.idle, both.rungs["golem-walker"]);
});

test("a_start_its_control_does_not_admit_is_void_and_never_scored", async () => {
  // A wheel closing on a long-armed multileg stops at the carriers' contact distance, which is
  // inside the band, so an idle body holds it and the start is not a closing opponent at all.
  const run = await drill("hold-range", TRI, RAM, 500, ["golem-duelist"]);
  assert.match(run.void ?? "", /did not drive an idle body out of the band/);
  assert.equal(run.control.pass, true, "the control is what voided it");
  assert.equal(run.rungs, undefined, "no rung is played from a void start");
  const summary = summarizeDrill([run], ["golem-duelist"]);
  assert.equal(summary.void, 1);
  assert.equal(summary.scored, 0);
  assert.equal(summary.rungs["golem-duelist"].n, 0);
});

test("breaking_the_duelists_guard_fails_survive_the_cut_on_the_high_line", async () => {
  const setup = namedBuild("default").setup;
  let guarded = 0;
  let broken = 0;
  let guardedWound = 0;
  let brokenWound = 0;
  for (let seed = 3000; seed < 3008; seed += 1) {
    const run = await drill("survive-cut", setup, setup, seed, ["golem-duelist", GUARDLESS], { line: "high" });
    assert.ok(run.rungs, `seed ${seed}: ${run.void ?? run.refused}`);
    guarded += Number(run.rungs["golem-duelist"].pass);
    broken += Number(run.rungs[GUARDLESS].pass);
    guardedWound += run.rungs["golem-duelist"].margin;
    brokenWound += run.rungs[GUARDLESS].margin;
  }
  assert.ok(guarded >= 2, `the duelist survives some high cuts (${guarded} of 8)`);
  assert.ok(broken < guarded, `and fewer with its guard broken (${broken} against ${guarded})`);
  assert.ok(brokenWound > guardedWound, `and takes more from them (${brokenWound.toFixed(3)} against ${guardedWound.toFixed(3)})`);
});

test("every_drill_builds_its_opponent_inside_the_attribute_rows_and_a_failed_run_is_counted", async () => {
  // get-inside wrote its longer-armed opponent as size 1.25, the ceiling when it was written. The size
  // law moved the ceiling to 1.1 on 2026-09-25, and every one of 1,000 runs then failed to build while
  // the drill table printed the other five drills and no line for this one (drill runner,
  // `research/runs/drills-release1`). So each drill's opponent is checked against the rows the body
  // is built from, on the default body and on the odd pair, and a failed run is a counted row.
  for (const base of [defaultGolemSetup(), TRI, RAM]) {
    for (const d of DRILLS) {
      if (!d.opponentSetup) continue;
      const refusal = attributesRefusal(d.opponentSetup(base).attributes);
      assert.equal(refusal, null, `${d.name}'s opponent: ${refusal}`);
    }
  }
  const ok = { status: "ok", drill: "finish", run: { drill: "finish", subject: "left", skipped: "no striker" } };
  const failed = { status: "failed", drill: "get-inside", error: "Error: Size x1.25 is outside x0.8 to x1.1\n    at build" };
  const summary = summarize([ok, failed, failed]);
  assert.equal(summary["get-inside"].failed, 2, "a drill whose every run failed still has a row");
  assert.equal(summary["get-inside"].firstError, "Error: Size x1.25 is outside x0.8 to x1.1");
  assert.equal(summary.finish.failed, 0);
  assert.match(table(summary), /get-inside: .* 2 failed\n  FAILED 2: Error: Size x1\.25/);
});
