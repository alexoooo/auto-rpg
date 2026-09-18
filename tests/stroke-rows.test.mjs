import assert from "node:assert/strict";
import test from "node:test";

import { INERT_ROWS } from "../scripts/tune.mjs";
import { SHAPE_ROWS } from "../scripts/stroke-sweep.mjs";
import { GOLEM_TACTICS, STROKE_SHAPES } from "../src/golem/tactics.ts";
import { GOLEM_TACTICS_V2 } from "../src/golem/tactics-v2.ts";
import {
  LIVE_STROKE_ROWS, isLiveStrokeRow, parseStrokeOverrides, setLiveStrokeRow, strokeOverrideFor,
} from "../src/golem/stroke-rows.ts";

test("the_live_rows_are_exactly_the_ones_the_sword_shape_reads_through_a_getter", () => {
  // The claim the whole file rests on, checked against the object rather than against a comment.
  // `CUT` exposes `cutRoll` twice, as `windRoll` and `roll`, so the shape's own key list is not the
  // list of table rows; what makes a row live is that writing the table moves the shape.
  const before = Object.fromEntries(LIVE_STROKE_ROWS.map((r) => [r, GOLEM_TACTICS[r]]));
  try {
    for (const row of LIVE_STROKE_ROWS) {
      const probe = GOLEM_TACTICS[row] + 1.25;
      setLiveStrokeRow(GOLEM_TACTICS, row, probe);
      const shape = STROKE_SHAPES.sword;
      const moved = row === "cutRoll"
        ? shape.roll === probe && shape.windRoll === probe
        : shape[row] === probe;
      assert.ok(moved, `${row} is listed as live and the sword's shape did not follow it`);
    }
  } finally {
    for (const row of LIVE_STROKE_ROWS) setLiveStrokeRow(GOLEM_TACTICS, row, before[row]);
  }
  assert.deepEqual(
    Object.fromEntries(LIVE_STROKE_ROWS.map((r) => [r, GOLEM_TACTICS[r]])), before,
    "the probe above did not put the shipped table back",
  );
});

test("the_three_lists_that_have_to_agree_do_agree", () => {
  // `INERT_ROWS` is the tuner's, `SHAPE_ROWS` is the sweep's and `LIVE_STROKE_ROWS` is the page's.
  // They are three copies of one fact -- these rows are read live -- kept in three files because
  // one is a build script, one is a bench and one ships in the bundle. A row dropped from any of
  // them silently stops being swept, or silently starts being offered as a dial that does nothing.
  assert.deepEqual([...LIVE_STROKE_ROWS].sort(), [...SHAPE_ROWS].sort());
  assert.deepEqual(
    [...LIVE_STROKE_ROWS].sort(), [...INERT_ROWS].filter((r) => r !== "guardReach").sort(),
  );
  // `guardReach` is inert for a second reason and is not a field of the sword's shape at all.
  assert.ok(INERT_ROWS.has("guardReach"));
  assert.equal(isLiveStrokeRow("guardReach"), false);
  assert.equal(STROKE_SHAPES.sword.guardReach, undefined);
});

test("a_link_names_its_refusal_rather_than_falling_back_to_a_number", () => {
  const cases = [
    ["standOffFraction:1.2", /is not one of/],
    ["cutRoll", /is not name:value/],
    ["cutRoll:banana", /non-number/],
    ["strokeSeconds:0", /is a duration/],
    ["chamberSeconds:-0.1", /is a duration/],
  ];
  for (const [raw, why] of cases) {
    const [first] = parseStrokeOverrides(raw);
    assert.equal(first.ok, false, `${raw} was accepted`);
    assert.match(first.why, why);
  }
});

test("a_good_link_parses_every_pair_and_tolerates_the_spacing_a_person_types", () => {
  const parsed = parseStrokeOverrides(" chamberReach: -0.15 ,cutRoll:0, strokeSeconds:0.35 ");
  assert.equal(parsed.length, 3);
  assert.deepEqual(parsed.map((p) => p.ok), [true, true, true]);
  assert.deepEqual(parsed.map((p) => [p.row, p.value]),
    [["chamberReach", -0.15], ["cutRoll", 0], ["strokeSeconds", 0.35]]);
  // A negative roll and a zero roll are both legitimate -- BY swept -0.60 to 0.90 -- so the only
  // rows with a sign rule are the two durations.
  assert.equal(parseStrokeOverrides("cutRoll:-0.6")[0].ok, true);
  assert.equal(parseStrokeOverrides("chamberReach:-0.7")[0].ok, true);
  assert.deepEqual(parseStrokeOverrides(""), []);
  assert.deepEqual(parseStrokeOverrides(",, ,"), []);
});

test("one_bad_pair_is_visible_to_the_caller_beside_the_good_ones", () => {
  // `main.ts` refuses the whole link if any pair refuses, and it can only do that because the
  // parser reports per pair rather than throwing on the first bad one.
  const parsed = parseStrokeOverrides("cutRoll:0,nonsense:1,strokeSeconds:0.2");
  assert.equal(parsed.length, 3);
  assert.deepEqual(parsed.map((p) => p.ok), [true, false, true]);
});

test("every_live_row_drives_a_field_the_shape_actually_reads", () => {
  // The bug this pins: `cutRoll` is the one live row whose name is not a `StrokeShape` field, so
  // `{ [row]: value }` produced an override nothing read and the arm silently ran the shipped
  // stroke. A perfect null on one row of a table is indistinguishable from a real null, which is
  // why this is asserted structurally rather than left to a bench to notice.
  const fields = Object.keys(STROKE_SHAPES.sword);
  for (const row of LIVE_STROKE_ROWS) {
    const over = strokeOverrideFor(row, 0.37);
    const keys = Object.keys(over);
    assert.ok(keys.length > 0, `${row} maps to no field at all`);
    for (const k of keys) {
      assert.ok(fields.includes(k), `${row} maps to "${k}", which is not a field of the shape`);
      assert.equal(over[k], 0.37, `${row} -> ${k} did not carry the value`);
    }
  }
});

test("cutRoll_drives_both_halves_of_the_turn_and_nothing_else", () => {
  // Two getters, one row: an edge is turned the same amount winding up as coming through. An
  // override that moved only one of them would be a stroke that rolls in and does not roll out.
  assert.deepEqual(strokeOverrideFor("cutRoll", 0.5), { roll: 0.5, windRoll: 0.5 });
  assert.deepEqual(strokeOverrideFor("chamberReach", -0.2), { chamberReach: -0.2 });
});

test("an_override_built_from_a_row_actually_moves_the_merged_shape", () => {
  // Driven through the merge the bench performs, because the defect was invisible at the row and
  // only showed up in what came out the other side.
  for (const row of LIVE_STROKE_ROWS) {
    const merged = Object.freeze({ ...STROKE_SHAPES.sword, ...strokeOverrideFor(row, 0.37) });
    const moved = Object.keys(merged).filter((k) => merged[k] !== STROKE_SHAPES.sword[k]);
    assert.ok(moved.length > 0, `${row} produced a merged shape identical to the shipped one`);
  }
});

test("a_live_stroke_row_is_a_dead_copy_on_every_later_executor_table", () => {
  // The fact that makes the tournament worker's lookup order load-bearing. `FENCER` and the two
  // executors after it spread `GOLEM_TACTICS` at module load, so each stroke row exists on their
  // tables and assigning to one of those copies moves no stroke at all. A lookup chain that
  // reaches them before the live table silently does nothing -- which is what
  // `--override chamberReach=0` did until `isLiveStrokeRow` was put in front of them.
  for (const row of LIVE_STROKE_ROWS) {
    assert.ok(row in GOLEM_TACTICS_V2, `${row} is not on the fencer's table at all`);
    const field = row === "cutRoll" ? "roll" : row;
    const before = STROKE_SHAPES.sword[field];
    const had = GOLEM_TACTICS_V2[row];
    try {
      GOLEM_TACTICS_V2[row] = had + 0.4242;
      assert.equal(STROKE_SHAPES.sword[field], before,
        `${row} on the fencer's table moved the sword, so it is not a dead copy after all`);
    } finally {
      GOLEM_TACTICS_V2[row] = had;
    }
  }
});

test("the_live_table_is_the_one_that_moves_the_sword", () => {
  // The other half of the pair above: the same write, on the table the getters actually read.
  for (const row of LIVE_STROKE_ROWS) {
    const field = row === "cutRoll" ? "roll" : row;
    const had = GOLEM_TACTICS[row];
    try {
      setLiveStrokeRow(GOLEM_TACTICS, row, had + 0.4242);
      assert.equal(STROKE_SHAPES.sword[field], had + 0.4242, `${row} did not reach the sword`);
    } finally {
      setLiveStrokeRow(GOLEM_TACTICS, row, had);
    }
  }
});
