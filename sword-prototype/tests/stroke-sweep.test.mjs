import assert from "node:assert/strict";
import test from "node:test";

import { INERT_ROWS } from "../scripts/tune.mjs";
import { GOLEM_TACTICS } from "../src/golem/tactics.ts";
import { SHAPE_ROWS, mean, median, sd, verdict } from "../scripts/stroke-sweep.mjs";

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
