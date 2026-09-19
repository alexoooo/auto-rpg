import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";

import {
  LIVE_STROKE_ROWS, TABLE_INERT_STROKE_ROWS, isTableInertRow,
} from "../src/golem/stroke-rows.ts";
import { GOLEM_TACTICS, STROKE_SHAPES } from "../src/golem/tactics.ts";
import { GOLEM_TACTICS_V2, fencerStroke, golemFencer } from "../src/golem/tactics-v2.ts";

test("no_override_hands_back_the_module_global_itself_and_not_a_copy", () => {
  // `assert.equal` and not `deepEqual`, on purpose. A copy would pass a deep comparison and would
  // still have silently turned off `?tactic=` and `scripts/stroke-sweep.mjs`, both of which work
  // by writing `GOLEM_TACTICS` and relying on `STROKE_SHAPES.sword`'s getters to carry it.
  assert.equal(fencerStroke("sword", null), STROKE_SHAPES.sword);
  assert.equal(fencerStroke("club", null), STROKE_SHAPES.club);
});

test("the_live_read_still_reaches_a_default_fencer_after_the_change", () => {
  // The property the whole null path exists to preserve, driven through a built mind rather than
  // through the helper, because the mind is what memoises and a memo is how this would break.
  const fencer = golemFencer(20260917);
  const before = GOLEM_TACTICS.cutRoll;
  try {
    GOLEM_TACTICS.cutRoll = before + 0.37;
    assert.equal(fencer.strokeFor("sword").roll, before + 0.37);
    assert.equal(fencer.strokeFor("sword").windRoll, before + 0.37);
  } finally {
    GOLEM_TACTICS.cutRoll = before;
  }
  assert.equal(fencer.strokeFor("sword").roll, before, "the probe did not put the table back");
});

test("an_override_lays_over_the_shipped_shape_and_leaves_the_rest_of_it_alone", () => {
  const over = fencerStroke("sword", { chamberReach: 0.15 });
  assert.equal(over.chamberReach, 0.15);
  // Everything not named comes from the shipped shape, read at the moment of the merge.
  assert.equal(over.strokeSeconds, STROKE_SHAPES.sword.strokeSeconds);
  assert.equal(over.chamberSwing, STROKE_SHAPES.sword.chamberSwing);
  assert.equal(over.roll, STROKE_SHAPES.sword.roll);
  assert.ok(Object.isFrozen(over), "an override a stroke could change mid-arc is not survivable");
  // And the global is untouched, which is the difference between an override and a write.
  assert.equal(STROKE_SHAPES.sword.chamberReach, GOLEM_TACTICS.chamberReach);
  assert.notEqual(GOLEM_TACTICS.chamberReach, 0.15);
});

test("an_override_moves_one_fencer_and_not_the_other", () => {
  // The contract CG exists for. Without this the paired bench's central claim -- that the margin
  // it measured came from one side's stroke -- could only be made by watching damage and hoping.
  const shipped = golemFencer(20260917);
  const changed = golemFencer(20260917, { ...GOLEM_TACTICS_V2, strokeOver: { chamberReach: 0.15 } });

  assert.equal(shipped.strokeFor("sword"), STROKE_SHAPES.sword);
  assert.equal(shipped.strokeFor("sword").chamberReach, GOLEM_TACTICS.chamberReach);
  assert.equal(changed.strokeFor("sword").chamberReach, 0.15);
  assert.notEqual(changed.strokeFor("sword"), STROKE_SHAPES.sword);

  // Memoised per kind, so the same mind hands back the same object rather than a fresh merge.
  assert.equal(changed.strokeFor("sword"), changed.strokeFor("sword"));
  // And the override is per weapon kind, not a single shape smeared across all of them.
  assert.equal(changed.strokeFor("club").chamberReach, 0.15);
  assert.equal(changed.strokeFor("club").chamberLift, STROKE_SHAPES.club.chamberLift);
});

test("nothing_that_ships_sets_an_override", () => {
  // A default fencer has to be the fencer that shipped, and the cheapest way to keep that true is
  // that the field is null on the shipped table and no other table in the tree sets it.
  assert.equal(GOLEM_TACTICS_V2.strokeOver, null);
  assert.equal(golemFencer(1).strokeFor("sword"), STROKE_SHAPES.sword);
});

test("no_executor_reads_a_table_inert_row_off_a_per_mind_table", () => {
  // The guard `scripts/tune.mjs`'s `INERT_ROWS` used to be, restored to the tree that outlived it.
  //
  // Source-level and not behavioural, deliberately. The behavioural form of this claim is vacuous:
  // the way you show `blendArc` ignores `T.strokeSeconds` is that `blendArc` has no `T` parameter,
  // and a test that a function does not take an argument asserts nothing a compiler did not. What
  // is worth pinning is what actually changes under maintenance -- that no executor *grows* such a
  // read without the fitters being told -- and that is a fact about the text.
  //
  // Failing this test is not necessarily a bug. It means someone wired one of these rows to a
  // per-mind table, which is a reasonable thing to do; the fix is to take that row out of the
  // inert reading and tell whatever is fitting a genome that it has a new dimension. What must not
  // happen is the wiring landing silently, because then the fitters go on refusing a live row.
  const files = readdirSync(new URL("../src/golem/", import.meta.url))
    .filter((name) => name.startsWith("tactics") && name.endsWith(".ts"));
  assert.ok(files.length >= 4, `expected the four executors, found ${files.join(", ")}`);
  const read = (name) => readFileSync(new URL(`../src/golem/${name}`, import.meta.url), "utf8")
    // Comments quote these names constantly -- this very list is discussed in three of the four
    // files -- so strip block and line comments before looking, or the test reads its own prose.
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const reads = (code, row) => new RegExp(String.raw`\bT\.` + row + String.raw`\b`).test(code);

  // **The positive control, and why it is not optional.** The first draft of this test built that
  // regexp from a string literal whose backslashes were eaten one layer down, leaving a pattern
  // that was a literal backspace followed by any character. It matched nothing, in any file, for
  // any row -- and the test passed green while asserting precisely nothing. That is the same
  // failure this file already records for `cutRoll`'s 506-0-518 one level down, and it is the
  // failure mode of every test whose pass condition is an empty result: "found none" and "cannot
  // find any" are indistinguishable from the outside. So the detector is made to find a row that
  // is genuinely there before its silence about the others is allowed to mean anything.
  assert.equal(reads(read("tactics-v4.ts"), "cutSeconds"), true,
    "the detector found no `T.cutSeconds` in v4, which reads it when it sizes a committed cut -- "
    + "the detector is broken, and every absence it reports below is worthless");
  assert.equal(reads(read("tactics-v4.ts"), "cutSecondsNotAThing"), false);

  const found = [];
  for (const name of files) {
    const code = read(name);
    for (const row of TABLE_INERT_STROKE_ROWS) {
      if (reads(code, row)) found.push(`${name}: T.${row}`);
    }
  }
  assert.deepEqual(found, [], `a table-inert row grew a per-mind read: ${found.join(", ")}`);
});

test("the_inert_predicate_covers_every_row_the_live_list_names", () => {
  // The two exports must not drift apart, since the whole point of the second name is that a
  // fitter can consult it without having to know it is the same set as the first.
  for (const row of LIVE_STROKE_ROWS) assert.equal(isTableInertRow(row), true, row);
  assert.equal(isTableInertRow("patience"), false);
  assert.equal(isTableInertRow("cutSeconds"), false);
});
