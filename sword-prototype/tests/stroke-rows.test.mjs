import assert from "node:assert/strict";
import test from "node:test";

import { INERT_ROWS } from "../scripts/tune.mjs";
import { SHAPE_ROWS } from "../scripts/stroke-sweep.mjs";
import { GOLEM_TACTICS, STROKE_SHAPES } from "../src/golem/tactics.ts";
import {
  LIVE_STROKE_ROWS, isLiveStrokeRow, parseStrokeOverrides, setLiveStrokeRow,
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
