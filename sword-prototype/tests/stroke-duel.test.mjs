import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";

import { LIVE_STROKE_ROWS } from "../src/golem/stroke-rows.ts";
import { cell as duelCell, readArms } from "../scripts/stroke-duel.mjs";
import { cell as sweepCell } from "../scripts/stroke-sweep.mjs";

test("importing_a_bench_for_its_helpers_does_not_make_it_answer_a_child_call", () => {
  // The bug this pins cost a table of NaN. `stroke-duel.mjs` imports `mean`, `sd` and `verdict`
  // from `stroke-sweep.mjs`; that import runs the sweep's top level, and the sweep's `--child`
  // branch fired on the *duel's* child argv, printed its own |CELL| line first, and handed the
  // parent a cell with alignment on it where a paired score should have been. Both files now
  // dispatch only when they are the script that was run.
  const probe = "process.argv.push('--child', '{}');"
    + " import('./scripts/stroke-sweep.mjs')"
    + ".then(() => console.log('IMPORTED_QUIETLY'));";
  const out = execFileSync(process.execPath, ["-e", probe], { encoding: "utf8" });
  assert.match(out, /IMPORTED_QUIETLY/);
  assert.doesNotMatch(out, /\|CELL\|/, "the sweep answered a child call it was only imported for");
});

test("the_two_benches_are_different_cells_and_neither_is_the_other", () => {
  // They have the same name, the same child protocol and adjacent jobs, which is exactly why the
  // failure above was invisible: both cells end in `seconds`, so the wrong one looked plausible.
  assert.notEqual(duelCell, sweepCell);
  assert.equal(typeof duelCell, "function");
  assert.equal(typeof sweepCell, "function");
});

test("the_duel_sweeps_only_rows_a_fencer_can_actually_override", () => {
  // `stroke-duel.mjs` validates `--row` against `LIVE_STROKE_ROWS` rather than its own list, so a
  // row that stops being live stops being offered here too.
  assert.ok(LIVE_STROKE_ROWS.includes("chamberReach"));
  assert.equal(LIVE_STROKE_ROWS.includes("standOffFraction"), false);
});

test("both_spellings_of_an_arm_list_produce_the_same_arms", () => {
  assert.deepEqual(readArms("chamberReach", "-0.2,0", null), readArms(null, null,
    "chamberReach:-0.2,chamberReach:0"));
});

test("an_arm_list_refuses_everything_it_cannot_vouch_for", () => {
  const cases = [
    [["chamberReach", "0", "cutRoll:0"], /two spellings of one thing/],
    [[null, null, "chamberReach"], /wants name:value/],
    [[null, null, "chamberReach:zz"], /non-number/],
    [[null, null, "standOffFraction:1"], /is not one of/],
    [[null, null, ""], /nothing to run/],
    [[null, null, null], /nothing to run/],
  ];
  for (const [args, why] of cases) {
    assert.throws(() => readArms(...args), why, `${JSON.stringify(args)} was accepted`);
  }
});

test("every_arm_carries_a_key_the_plan_and_the_table_can_both_use", () => {
  // The control shares this namespace as the literal "control", so an arm must never collide with
  // it and two arms on the same row at different values must never collide with each other.
  const arms = readArms(null, null, "chamberReach:0,chamberReach:0.15,cutRoll:0");
  const keys = arms.map((a) => a.key);
  assert.equal(new Set(keys).size, keys.length, "two arms share a key");
  assert.equal(keys.includes("control"), false, "an arm collided with the control");
});
