// The compact mind CT evolves, and the two pieces of arithmetic it is built out of.
//
// Nothing here touches physics. That is deliberate rather than convenient: `compactPilot` is
// `pilotFeatures` followed by `compactDecoder`, the first half is already pinned in
// `tactics-v4.test.mjs`, and the half that is new is a loop with two indices in it. **A wrong index
// in that loop trains, rates and ships**: an evolution run over a transposed weight layout is a
// perfectly well-behaved search over a different function, and no score it reports would look
// wrong. So the layout is asserted directly, by a genome written by hand.
import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPACT_OUTPUTS, CORE_COLUMNS, columnsOf, compactDecoder, compactFromTable, compactSize,
  compactTable,
} from "../scripts/compact-policy.mjs";
import { solve } from "../scripts/evolve-policy.mjs";
import { COMMAND_AXES, COMMAND_GATES, COMMAND_RANGES } from "../src/golem/tactics-v4.ts";
import { PILOT_FEATURE_NAMES, pilotFeatureCount } from "../src/golem/pilot.ts";

const STRAFE = COMMAND_AXES.indexOf("strafe");
const COMMIT = COMMAND_AXES.length + COMMAND_GATES.indexOf("commit");
const centreOf = (axis) => (COMMAND_RANGES[axis][0] + COMMAND_RANGES[axis][1]) / 2;

/** Two columns, already standardised, so a raw row is the normalised row and reads as one. */
const twoColumns = (over = {}) => ({
  columns: [0, 1], norm: { mean: [0, 0], sd: [1, 1] }, ...over,
});
const genome = (n) => new Float64Array(compactSize(n));

test("a_zero_genome_asks_for_every_axis_neutral_and_raises_no_gate", () => {
  // The start of an evolution run, and the thing a broken decode is most likely to get wrong: a
  // neutral is the **midpoint of each axis's own range**, not zero, and `standOff` is the witness
  // because its range is 0..2 and a shared zero would park the mind on top of its opponent.
  const decode = compactDecoder(genome(2), twoColumns());
  const command = decode(Float64Array.from([3, -7]));
  for (const axis of COMMAND_AXES) {
    assert.equal(command[axis], centreOf(axis), `${axis} is not its own midpoint`);
  }
  assert.equal(command.standOff, 1, "a zero genome stands off by a whole reach, not by nothing");
  for (const gate of COMMAND_GATES) assert.equal(command[gate], 0, gate);
});

test("the_genome_is_column_major_over_outputs_so_a_transpose_reads_a_different_mind", () => {
  // Weight `k * 12 + j` is column k's contribution to output j. Under the transpose the single
  // raised weight below would be column 1's contribution to `standOff`, and a row that is all of
  // column 0 would move nothing at all -- which is exactly what is asserted second.
  const weights = genome(2);
  weights[0 * COMPACT_OUTPUTS + STRAFE] = 1;
  const decode = compactDecoder(weights, twoColumns());

  const driven = decode(Float64Array.from([1, 0]));
  assert.equal(driven.strafe, 1, "column zero does not reach its own output");
  assert.equal(driven.standOff, 1, "column zero leaked into another output");

  const quiet = decode(Float64Array.from([0, 1]));
  assert.equal(quiet.strafe, 0, "column one moved an output that is not its own");
});

test("a_gate_is_thresholded_at_zero_where_the_head_reads_it_and_not_at_a_half", () => {
  // `meanAction` turns a gaussian head's logit into a bit at **zero**; `commandFromAction` then
  // reads an already-decoded field at a half. A compact mind that copied the half would ask for
  // barely a third of the commits the same numbers mean, and the run would simply be quieter.
  const at = (bias) => {
    const weights = genome(2);
    weights[2 * COMPACT_OUTPUTS + COMMIT] = bias;
    return compactDecoder(weights, twoColumns())(Float64Array.from([0, 0])).commit;
  };
  assert.equal(at(0.4), 1, "a logit of 0.4 is a raised gate");
  assert.equal(at(0.0001), 1);
  assert.equal(at(0), 0, "the boundary belongs to the lowered side");
  assert.equal(at(-0.4), 0);
});

test("a_column_that_never_moved_is_dropped_and_a_wild_one_is_clipped_before_it_is_weighted", () => {
  // Five of the driver's nine axes are literally constant, so a constant column in a fitted
  // normalisation is the normal case here rather than the pathological one. Dividing by its zero
  // spread would put an infinity into the first weight and NaN every output for the rest of the
  // bout -- the same failure the pilot's own finiteness test exists to catch upstream.
  const dead = genome(2);
  dead[0 * COMPACT_OUTPUTS + STRAFE] = 1;
  const flat = compactDecoder(dead, twoColumns({ norm: { mean: [0, 0], sd: [0, 1] } }));
  const command = flat(Float64Array.from([1e6, 0]));
  assert.equal(command.strafe, 0, "a column with no spread still reached an output");

  // The clip is five standard deviations, applied to the normalised column and *before* the
  // weight, so a state far outside anything the fit saw bends an output rather than saturating it.
  const gentle = genome(2);
  gentle[0 * COMPACT_OUTPUTS + STRAFE] = 0.1;
  const seen = compactDecoder(gentle, twoColumns())(Float64Array.from([100, 0]));
  assert.ok(Math.abs(seen.strafe - 0.5) < 1e-12, `strafe is ${seen.strafe}, not the clipped 0.5`);
});

test("a_column_set_is_refused_when_a_name_is_not_one_the_pilot_publishes", () => {
  // The defect this stops is a genome quietly built over eighteen columns because one name was
  // misspelled: it would train, rate and ship, and the missing column would never be looked for.
  // Five of `CORE_COLUMNS` were caught this way while the set was being written.
  assert.throws(() => columnsOf("gap,notAColumn,near", 1), /"notAColumn" is not a pilot column/);
  assert.throws(() => columnsOf("trace:gap@0.5", 1), /not a pilot column/,
    "a version-2 column is not silently available to a version-1 genome");
  assert.deepEqual(columnsOf("all", 1),
    Array.from({ length: PILOT_FEATURE_NAMES.length }, (_, i) => i));
  assert.equal(columnsOf("all", 2).length, pilotFeatureCount(2));

  const core = columnsOf("core", 1);
  assert.equal(core.length, CORE_COLUMNS.length);
  assert.equal(new Set(core).size, core.length, "a column is selected twice");
  for (const [at, index] of core.entries()) {
    assert.equal(PILOT_FEATURE_NAMES[index], CORE_COLUMNS[at]);
  }
});

test("a_genome_is_a_weight_a_column_an_output_plus_one_bias_row", () => {
  assert.equal(COMPACT_OUTPUTS, COMMAND_AXES.length + COMMAND_GATES.length);
  assert.equal(COMPACT_OUTPUTS, 12, "nine axes and three gates, in head order");
  assert.equal(compactSize(0), 12, "a genome over no columns is still a bias for every output");
  assert.equal(compactSize(19), 240, "the core set, which is what CT's first run evolves");
  assert.equal(compactSize(71), 864, "every column the pilot publishes");
});

test("a_written_genome_rebuilds_its_own_mind_and_refuses_a_table_that_is_not_one", () => {
  const spec = {
    columns: columnsOf("gap,near,armed", 1), norm: { mean: [1, 0, 0], sd: [1, 1, 1] },
    features: 1, note: "a fixture",
  };
  const weights = genome(3);
  weights[0 * COMPACT_OUTPUTS + STRAFE] = 0.5;
  const written = JSON.parse(JSON.stringify(compactTable(weights, spec)));

  assert.deepEqual(written.names, ["gap", "near", "armed"],
    "a table carries the names, because a bare index means nothing to the next reader");
  assert.equal(written.weights.length, compactSize(3));
  assert.equal(typeof compactFromTable(written), "function");

  // Refused rather than padded: a genome and a column set that disagree is a fit and a rating
  // that have come apart, and the numbers would still decode into a command.
  assert.throws(() => compactFromTable({ ...written, weights: written.weights.slice(0, -1) }),
    /wants 48 numbers; this one holds 47/);
  assert.throws(() => compactFromTable({ kind: "gaussian", columns: [], weights: [] }),
    /that table is "gaussian", not a compact genome/);
  assert.throws(() => compactFromTable({ columns: [], weights: [] }), /"a policy"/);
});

test("the_ridge_solve_answers_a_small_dense_system_and_survives_a_dead_column", () => {
  // `distil` builds one normal-equation system per output and this is what inverts it, so a wrong
  // answer here is a seed genome that is not the least-squares fit of anything and a CT run that
  // starts somewhere arbitrary while reporting that it started at the driver.
  const x = solve(Float64Array.from([2, 1, 1, 3]), Float64Array.from([5, 10]), 2);
  assert.ok(Math.abs(x[0] - 1) < 1e-12, `${x[0]}`);
  assert.ok(Math.abs(x[1] - 3) < 1e-12, `${x[1]}`);

  // Pivoting is the point of the partial-pivot loop: the same system with its rows the other way
  // up has a zero in the first pivot position and a naive elimination divides by it.
  const swapped = solve(Float64Array.from([0, 1, 1, 3]), Float64Array.from([3, 10]), 2);
  assert.ok(Math.abs(swapped[0] - 1) < 1e-12, `${swapped[0]}`);
  assert.ok(Math.abs(swapped[1] - 3) < 1e-12, `${swapped[1]}`);

  // A column no row constrains is answered with a zero rather than an infinity. The ridge term
  // normally makes this unreachable, which is exactly why it is asserted: a run at `--ridge 0`
  // over a constant feature would otherwise put NaN into every weight of that output.
  const dead = solve(Float64Array.from([0, 0, 0, 1]), Float64Array.from([1, 2]), 2);
  assert.equal(dead[0], 0);
  assert.equal(dead[1], 2);
});
