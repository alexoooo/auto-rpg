import assert from "node:assert/strict";
import test from "node:test";

import { INERT_ROWS } from "../scripts/tune.mjs";
import { GOLEM_TACTICS } from "../src/golem/tactics.ts";
import {
  SHAPE_ROWS, STATISTICS, mean, median, sd, statsFor, summarise, verdict,
} from "../scripts/stroke-sweep.mjs";

test("the_sweep_covers_exactly_the_rows_the_tuner_cannot_move", () => {
  // The reason this file exists is that `INERT_ROWS` is outside `tune.mjs`'s genome, so the two
  // lists have to be the same list or a row can be dropped from the tuner and picked up by
  // nothing. `guardReach` is the one deliberate difference: it is inert for a second reason --
  // `guardByTheirs` is on -- so a sweep of it would measure nothing, and that exclusion is pinned
  // here rather than left as a coincidence.
  assert.deepEqual([...SHAPE_ROWS].sort(), [...INERT_ROWS].filter((r) => r !== "guardReach").sort());
  assert.ok(INERT_ROWS.has("guardReach"), "guardReach left INERT_ROWS; the exclusion above is stale");
});

test("every_row_the_sweep_offers_is_a_number_on_the_table_it_sweeps", () => {
  // A row named here but absent from `GOLEM_TACTICS` would sweep `undefined` into the table and
  // report a column of noise without ever failing.
  for (const row of SHAPE_ROWS) {
    assert.equal(typeof GOLEM_TACTICS[row], "number", `${row} is not a number on GOLEM_TACTICS`);
  }
});

test("a_width_nobody_measured_is_zero_rather_than_a_guess", () => {
  assert.equal(sd([]), 0);
  assert.equal(sd([0.5]), 0, "one sample cannot estimate a spread");
  assert.ok(Math.abs(sd([1, 2, 3]) - 1) < 1e-12);
  assert.equal(mean([]), 0);
  assert.ok(Math.abs(mean([1, 2, 3, 4]) - 2.5) < 1e-12);
  assert.equal(median([]), 0);
  assert.equal(median([3, 1, 2]), 2);
});

test("a_margin_without_a_noise_estimate_is_refused_rather_than_divided", () => {
  // The failure this guards is the one CC found: a comparison quoted against a denominator nobody
  // measured. Zero noise is not infinite confidence, it is no reading at all.
  const none = verdict(0.9, 0.1, 0, 2);
  assert.equal(none.better, false);
  assert.equal(none.why, "no noise estimate");
  assert.equal(verdict(0.9, 0.1, Number.NaN, 2).better, false);
});

test("a_value_is_only_better_when_it_clears_the_noise_by_the_asked_for_sigmas", () => {
  // 0.510 against 0.481 on CC's measured sd of 0.016 is 1.8 sd -- the shape of every row CB
  // reported and CC withdrew, and it has to come back refused.
  const thin = verdict(0.510, 0.481, 0.016, 2);
  assert.equal(thin.better, false);
  assert.match(thin.why, /inside the noise/);

  // BY's `cutRoll` margin on the same sd is 4.6, which is the one that survived.
  const real = verdict(0.554, 0.481, 0.016, 2);
  assert.equal(real.better, true);
  assert.ok(real.sigmas > 4 && real.sigmas < 5, `expected about 4.6 sd, got ${real.sigmas}`);

  // A value that is worse is never better, however wide the noise.
  assert.equal(verdict(0.400, 0.481, 0.016, 2).better, false);
  assert.ok(verdict(0.400, 0.481, 0.016, 2).gap < 0);
});

/** A value's replicates, as `statsFor` wants them: one object a cell with both statistics on it. */
const cellsOf = (table) => (value) => table[value] ?? [];

test("both_statistics_are_measured_against_their_own_noise_not_a_shared_one", () => {
  // The alignment replicates are tight and the rate replicates are wide, on the same cells. A
  // single pooled width would flatter one of them and crush the other.
  const table = {
    0.3: [{ align: 0.50, rate: 1.4 }, { align: 0.51, rate: 1.0 }],
    0: [{ align: 0.58, rate: 1.5 }, { align: 0.57, rate: 1.1 }],
  };
  const stats = statsFor({ wanted: [0.3, 0], shipped: 0.3, sigmas: 2, cells: cellsOf(table) });
  assert.ok(stats.align.noise < stats.rate.noise, "the two widths were not measured separately");
  assert.equal(stats.align.verdicts.get(0.3).why, "shipped");
  assert.equal(stats.align.verdicts.get(0).better, true, "a 10 sd alignment gap came back refused");
  assert.equal(stats.rate.verdicts.get(0).better, false, "a 0.7 sd rate gap came back accepted");
});

test("the_summary_says_so_when_the_proxy_and_the_objective_disagree", () => {
  // CD's `strokeSeconds`: 3.9 sd better aligned, and 30 % less damage a second. The whole reason
  // this function exists is that the run which found that printed a clean win.
  const table = {
    0.15: [{ align: 0.500, rate: 1.42 }, { align: 0.504, rate: 1.42 }],
    0.35: [{ align: 0.564, rate: 0.99 }, { align: 0.568, rate: 0.99 }],
  };
  const stats = statsFor({ wanted: [0.15, 0.35], shipped: 0.15, sigmas: 2, cells: cellsOf(table) });
  const said = summarise("strokeSeconds", 0.15, stats, 2).join(" ");
  assert.match(said, /On alignment, strokeSeconds 0\.35 beats/);
  assert.match(said, /Better turned, no more dangerous/);
  assert.doesNotMatch(said, /On damage\/second, strokeSeconds 0\.35 beats/);
});

test("a_row_that_improves_both_is_not_warned_about", () => {
  const table = {
    0.3: [{ align: 0.500, rate: 1.40 }, { align: 0.504, rate: 1.42 }],
    0: [{ align: 0.570, rate: 1.72 }, { align: 0.574, rate: 1.74 }],
  };
  const stats = statsFor({ wanted: [0.3, 0], shipped: 0.3, sigmas: 2, cells: cellsOf(table) });
  const said = summarise("chamberReach", 0.3, stats, 2).join(" ");
  assert.match(said, /On alignment, chamberReach 0 beats/);
  assert.match(said, /On damage\/second, chamberReach 0 beats/);
  assert.doesNotMatch(said, /disagree|different values|no more dangerous/);
  // The ruling caveat is never dropped, however good the row looks.
  assert.match(said, /A measurement, not a ruling/);
});

test("nothing_clearing_either_statistic_is_reported_as_a_result", () => {
  const table = {
    0.3: [{ align: 0.500, rate: 1.40 }, { align: 0.504, rate: 1.42 }],
    0: [{ align: 0.502, rate: 1.41 }, { align: 0.506, rate: 1.43 }],
  };
  const stats = statsFor({ wanted: [0.3, 0], shipped: 0.3, sigmas: 2, cells: cellsOf(table) });
  const said = summarise("cutRoll", 0.3, stats, 2).join(" ");
  assert.match(said, /That is a result rather than a blank/);
  // "Nothing beats the shipped" is the refusal itself; what must not appear is a named winner.
  assert.doesNotMatch(said, /cutRoll 0 beats/);
  assert.doesNotMatch(said, /A measurement, not a ruling/, "there is no measurement to caveat");
  assert.equal(STATISTICS.length, 2);
});
