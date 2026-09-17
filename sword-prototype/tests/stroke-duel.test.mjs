import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";

import { LIVE_STROKE_ROWS } from "../src/golem/stroke-rows.ts";
import { cell as duelCell } from "../scripts/stroke-duel.mjs";
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
