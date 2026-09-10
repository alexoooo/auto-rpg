// What a step of a bout is worth. Session 13 of the style set.
//
// One claim carries this file and the rest are shape. The claim is the **telescoping** one: the
// first term of the reward is the bar margin, differenced ask by ask, so its undiscounted sum over
// a side is that side's final margin exactly. Everything Session 13 fits is fitted to that sum,
// and if it ever stops being the score then the policy is being paid for something the league
// table does not measure -- which is the one failure that would show up as nothing but a slightly
// worse mind. Session 08 asserted it for the third executor's decision log; this asserts it for
// the fourth's command log, which is a different recorder over the same identity.
//
// **Five mutations were watched red on 2026-09-08**, each applied alone and then restored:
//
// | mutation | what went red |
// |---|---|
// | `stepReward` pays the win term on every window instead of the one marked `done` | the win-term test and the telescoping test |
// | `stepReward` adds the two penalties rather than subtracting them | the penalty test |
// | `pilotRecorder`'s `shut` reads `live.mine - mine` for `dealt` (the two swapped) | the telescoping test |
// | `pilotRecorder`'s `shut` writes the absolute clock into `seconds` rather than the difference | the telescoping test |
// | `pilotRecorder.close` shuts the last window without marking it `done` | the telescoping test |
//
// One mutation that was tried and is **not** in the table: charging `spend` to the window that
// opens *next* rather than to the one that is live. It changes nothing this file can see, because
// the totals it moves are the same totals a window later, and the obvious invariant that would
// catch it -- a window charged no more clinch than it lasted -- is false in the real harness: the
// view's clock advances a rendered frame at a time while the sample loop runs four times a frame,
// so two asks in one frame are zero seconds apart and still have samples between them. It is
// recorded here rather than left out so that the next reader does not go looking for the test.
import test from "node:test";
import assert from "node:assert/strict";

import { BARE_REWARD, GOLEM_REWARD, stepReward } from "../src/golem/reward.ts";
import { ACTION_WIDTH } from "../src/golem/policy.ts";
import { PILOT_FEATURE_COUNT } from "../src/golem/pilot.ts";
import { buildPool, runJobs, scheduleJobs } from "../scripts/tournament.mjs";

const SEED = 20260913;

/** A window with nothing in it, so a case can name only the field it is about. */
const window = (over) => ({
  dealt: 0, taken: 0, seconds: 0, clinchSeconds: 0, idleMetres: 0,
  closingMetres: 0, stallSeconds: 0, outsideSeconds: 0, emptyStrokes: 0,
  done: false, outcome: 0, ...over,
});

/**
 * A table with nothing in it, so a case can name only the row it is about.
 *
 * A *partial* table is not a thing this file will write, and the reason is arithmetic rather than
 * taste: a missing coefficient is `undefined`, `undefined` times a quantity is `NaN`, and one
 * `NaN` reward poisons every advantage in its episode. `RewardTable` declares all eight rows
 * required for that reason and a test that quietly wrote four of them would be a test asserting
 * something the type system has already refused.
 */
const table = (over) => ({
  win: 0, clinch: 0, idle: 0, tick: 0, closing: 0, stall: 0, outside: 0, swing: 0, ...over,
});

/** Every row of the table, and the window field each one is a coefficient on. */
const ROWS = Object.freeze([
  { row: "clinch", quantity: "clinchSeconds", sign: -1 },
  { row: "idle", quantity: "idleMetres", sign: -1 },
  { row: "tick", quantity: "seconds", sign: -1 },
  { row: "closing", quantity: "closingMetres", sign: +1 },
  { row: "stall", quantity: "stallSeconds", sign: -1 },
  { row: "outside", quantity: "outsideSeconds", sign: -1 },
  { row: "swing", quantity: "emptyStrokes", sign: -1 },
]);

// ---------------------------------------------------------------------------------------
// The table.
// ---------------------------------------------------------------------------------------

/**
 * The shipped coefficients, pinned.
 *
 * Not a regression floor -- these are meant to be swept -- but a policy fitted under one table and
 * run under another is a different policy, and the table rides in the artifact's header for that
 * reason. A change here that is not a change there is the bug this catches.
 */
test("the_shipped_reward_table_is_the_one_the_module_documents", () => {
  assert.equal(GOLEM_REWARD.win, 0.5);
  assert.equal(GOLEM_REWARD.clinch, 0.004);
  assert.equal(GOLEM_REWARD.idle, 0.004);
  assert.equal(GOLEM_REWARD.tick, 0, "the clock is a measurement artifact and is not charged for");
  // Session 06 of the learn set wrote the rows and ran the arms; the shipped table did not move,
  // and a coefficient that appeared here without the run that chose it is what this catches.
  for (const row of ["closing", "stall", "outside", "swing"]) {
    assert.equal(GOLEM_REWARD[row], 0, `${row} ships non-zero without an arm named beside it`);
  }
  for (const key of ROWS.map((r) => r.row).concat("win")) {
    assert.equal(BARE_REWARD[key], 0, `the bare table charges ${key}`);
    assert.ok(Object.hasOwn(GOLEM_REWARD, key), `the shipped table has no ${key} row`);
  }
  assert.throws(() => { BARE_REWARD.win = 1; }, "the bare table is not frozen");
});

/** With the bare table the reward is the differenced margin and nothing else, in both signs. */
test("the_bare_reward_is_exactly_what_the_two_bars_did", () => {
  assert.equal(stepReward(window({ dealt: 0.25, taken: 0.1 }), BARE_REWARD), 0.15);
  assert.equal(stepReward(window({ dealt: 0, taken: 0.4 }), BARE_REWARD), -0.4);
  assert.equal(stepReward(window({ dealt: 0.3, taken: 0.3 }), BARE_REWARD), 0);
  // And the terms the bare table zeroes really are the ones it is zeroing -- every quantity the
  // window carries at once, so a row added to the table without a zero in `BARE_REWARD` is caught
  // here rather than by a rollout whose identity has quietly stopped holding.
  assert.equal(stepReward(window({
    seconds: 9, clinchSeconds: 9, idleMetres: 9,
    closingMetres: 9, stallSeconds: 9, outsideSeconds: 9, emptyStrokes: 9,
    done: true, outcome: 1,
  }), BARE_REWARD), 0);
});

/**
 * Every row is a coefficient on one quantity, at the sign the table publishes.
 *
 * Six of the seven are charges and `closing` is a credit, which is the whole of what makes it the
 * interesting row: it is the only term in this file that can pay a body for walking towards
 * another one. Each case sets one quantity on an otherwise empty window under a table with one
 * non-zero row, so a coefficient wired to the wrong field cannot pass by cancelling against a
 * neighbour.
 */
test("each_row_pays_its_own_coefficient_times_its_own_quantity_and_no_other", () => {
  for (const { row, quantity, sign } of ROWS) {
    const T = table({ [row]: 0.03 });
    const paid = stepReward(window({ [quantity]: 4 }), T);
    assert.ok(Math.abs(paid - sign * 0.12) < 1e-12, `${row} over ${quantity} paid ${paid}`);
    // And it is deaf to every other quantity: the same table over a window with all the others
    // set and its own at zero pays nothing at all.
    const others = window(Object.fromEntries(
      ROWS.filter((r) => r.quantity !== quantity).map((r) => [r.quantity, 7])));
    assert.equal(stepReward(others, T), 0, `${row} was charged for something that is not ${quantity}`);
  }
});

/**
 * The one row that can lift a *mirrored* return off zero by fighting, which is why it exists.
 *
 * Session 14's calibration is the finding this is written against: in a mirrored bout the two
 * sides' bar margins are exactly negated and so are their win terms, so the only part of the
 * return that survives averaging over the pair is the part that charges for engaging -- and every
 * such part was a subtraction. A mind paid under that objective is paid to stand out of range,
 * and `docs/measurements.md` has the census of one doing exactly that.
 *
 * `closing` is the first row that *pays* in the symmetric part, and both sides of a mirror can
 * collect it at once, because two bodies walking into each other both close. So: the symmetric
 * part of a mirrored pair is strictly positive when both close and exactly zero when neither
 * does. The antisymmetric part is asserted alongside, because "positive" would be satisfied by a
 * term that had also broken the telescoping identity.
 */
test("the_symmetric_part_of_a_mirrored_pair_is_positive_when_both_close_and_zero_when_neither_does", () => {
  const T = table({ win: 0.5, closing: 0.02 });
  /** One side of a mirrored bout: what it dealt is what the other took, and the outcome flips. */
  const episode = (dealt, taken, outcome, closingMetres) => [
    window({ dealt: dealt[0], taken: taken[0], closingMetres: closingMetres[0] }),
    window({ dealt: dealt[1], taken: taken[1], closingMetres: closingMetres[1], done: true, outcome }),
  ];
  const ret = (windows) => windows.reduce((sum, w) => sum + stepReward(w, T), 0);
  const dealt = [0.3, 0.25];
  const taken = [0.1, 0.05];

  const closed = [0.8, 1.4];
  const mine = ret(episode(dealt, taken, 1, closed));
  const theirs = ret(episode(taken, dealt, -1, closed));
  const symmetric = (mine + theirs) / 2;
  assert.ok(symmetric > 0, `both sides closed and the symmetric part is ${symmetric}`);
  assert.ok(Math.abs(symmetric - T.closing * (closed[0] + closed[1])) < 1e-12, `${symmetric}`);
  // The antisymmetric half is untouched: it is still the bar margin plus the win term, which is
  // the identity the whole file is laid over.
  const margin = (dealt[0] - taken[0]) + (dealt[1] - taken[1]);
  assert.ok(Math.abs((mine - theirs) / 2 - (margin + T.win)) < 1e-12, `${(mine - theirs) / 2}`);

  const still = [0, 0];
  const a = ret(episode(dealt, taken, 1, still));
  const b = ret(episode(taken, dealt, -1, still));
  assert.equal((a + b) / 2, 0, "a mirrored pair that never closed was paid something");
});

/** The win term is paid once, on the window marked `done`, and takes the loser's sign. */
test("the_win_term_is_paid_on_the_last_window_and_only_there", () => {
  const T = GOLEM_REWARD;
  assert.equal(stepReward(window({ outcome: 1 }), T), 0, "a win was paid on a window that is not the last");
  assert.equal(stepReward(window({ done: true, outcome: 1 }), T), T.win);
  assert.equal(stepReward(window({ done: true, outcome: -1 }), T), -T.win);
  assert.equal(stepReward(window({ done: true, outcome: 0 }), T), 0, "a draw was paid");
});

/** Both penalties are charges and not credits, at the rate the table publishes. */
test("the_two_penalties_are_subtracted_at_the_rate_the_table_names", () => {
  const T = GOLEM_REWARD;
  assert.ok(Math.abs(stepReward(window({ clinchSeconds: 2 }), T) - -2 * T.clinch) < 1e-12);
  assert.ok(Math.abs(stepReward(window({ idleMetres: 3 }), T) - -3 * T.idle) < 1e-12);
  // Together with a margin, and in the order the module states: the margin, less the charges.
  const both = stepReward(window({ dealt: 0.5, taken: 0.2, clinchSeconds: 1, idleMetres: 2 }), T);
  assert.ok(Math.abs(both - (0.3 - T.clinch - 2 * T.idle)) < 1e-12, `${both}`);
  // A bout spent entirely in the pathology is a real charge and not a rounding one: the module's
  // own sizing is that it should come to about a tenth of a bar over a whole bout.
  const whole = 60 * T.clinch + 30 * T.idle;
  assert.ok(whole > 0.05 && whole < 0.5, `a bout of nothing but pathology costs ${whole} of a bar`);
});

/** A custom table is read rather than the shipped one, which is what a sweep depends on. */
test("a_reward_table_given_is_the_table_used", () => {
  const T = table({
    win: 2, clinch: 0.1, idle: 0.2, tick: 0.01, closing: 0.05, stall: 0.3, outside: 0.4, swing: 0.6,
  });
  const r = stepReward(window({
    dealt: 1, taken: 0, seconds: 4, clinchSeconds: 1, idleMetres: 2,
    closingMetres: 3, stallSeconds: 0.5, outsideSeconds: 0.25, emptyStrokes: 2,
    done: true, outcome: -1,
  }), T);
  const expected = 1 - 0.1 - 0.4 - 0.04 + 0.15 - 0.15 - 0.1 - 1.2 - 2;
  assert.ok(Math.abs(r - expected) < 1e-12, `${r} against ${expected}`);
});

// ---------------------------------------------------------------------------------------
// The identity, on a real run.
// ---------------------------------------------------------------------------------------

/**
 * The command log of a real two-worker run, and the identity that makes it a reward.
 *
 * What is being measured here is the *recorder*, not the mind: whatever `golem-policy`'s shipped
 * table happens to be -- the zeros a first build loads, or a fitted table that fights -- a bout
 * has a margin and the windows have to telescope to it. That is why this file names the policy
 * rather than a fixture, and why nothing below asserts anything about how well it did. The
 * three-second cap is what keeps this a test rather than a run.
 *
 * The second claim is the one that makes the reward's penalties honest: the clinch and idle
 * charges are the tournament's own instruments poured into whichever window was open, so what the
 * windows carry has to add up to what the row reports. It can be a little short -- a sample before
 * the first ask belongs to no window -- and it can never be more.
 */
test("a_recorded_policy_logs_one_command_an_ask_and_its_rewards_telescope_to_the_bar_margin",
  { timeout: 300_000 }, async () => {
    const pool = buildPool({ seed: SEED, random: 0 })
      .filter((build) => build.name === "default" || build.name === "mace");
    assert.equal(pool.length, 2);
    const jobs = scheduleJobs({
      pool, policies: ["golem-policy", "golem-fencer"], pairings: 2, seed: SEED, cap: 3, mirror: true,
    });
    const rows = await runJobs(jobs, { workers: 2, record: ["golem-policy"] });
    assert.equal(rows.length, 4);
    let asks = 0;
    for (const row of rows) {
      for (const [me, them] of [["left", "right"], ["right", "left"]]) {
        const pack = row.samples[me];
        if (row[me].policy !== "golem-policy") {
          assert.equal(pack, null, "an unrecorded side wrote a log");
          continue;
        }
        assert.equal(pack.kind, "pilot");
        const count = pack.logp.length;
        assert.ok(count > 8, `${count} asks in a three-second bout`);
        assert.equal(pack.x.length, count * PILOT_FEATURE_COUNT);
        assert.equal(pack.a.length, count * ACTION_WIDTH);
        for (const column of ["dealt", "taken", "seconds", "clinch", "idle",
          "closing", "stall", "outside", "swing", "done"]) {
          assert.equal(pack[column].length, count, `${column} is not one an ask`);
        }
        let sum = 0;
        let ended = 0;
        let elapsed = 0;
        let clinch = 0;
        let idle = 0;
        let closing = 0;
        let stall = 0;
        let outside = 0;
        let swing = 0;
        const outcome = row.winner === null ? 0 : row.winner === me ? 1 : -1;
        for (let i = 0; i < count; i += 1) {
          assert.ok(pack.seconds[i] >= 0, `ask ${i} ran ${pack.seconds[i]} s`);
          assert.ok(pack.clinch[i] >= 0 && pack.idle[i] >= 0, `ask ${i} was charged a negative pathology`);
          assert.ok(pack.closing[i] >= 0 && pack.stall[i] >= 0 && pack.outside[i] >= 0 && pack.swing[i] >= 0,
            `ask ${i} was charged a negative engagement quantity`);
          assert.ok(Number.isFinite(pack.logp[i]), `ask ${i} recorded a log-probability of ${pack.logp[i]}`);
          sum += stepReward({
            dealt: pack.dealt[i], taken: pack.taken[i], seconds: pack.seconds[i],
            clinchSeconds: pack.clinch[i], idleMetres: pack.idle[i],
            closingMetres: pack.closing[i], stallSeconds: pack.stall[i],
            outsideSeconds: pack.outside[i], emptyStrokes: pack.swing[i],
            done: pack.done[i] === 1, outcome,
          }, BARE_REWARD);
          elapsed += pack.seconds[i];
          clinch += pack.clinch[i];
          idle += pack.idle[i];
          closing += pack.closing[i];
          stall += pack.stall[i];
          outside += pack.outside[i];
          swing += pack.swing[i];
          ended += pack.done[i];
        }
        assert.equal(ended, 1, `${ended} asks were marked the side's last`);
        assert.equal(pack.done[count - 1], 1, "the last ask is not the one marked done");
        assert.ok(Math.abs(sum - pack.margin) < 1e-9,
          `the rewards sum to ${sum} and the side's margin is ${pack.margin}`);
        assert.ok(Math.abs(pack.margin - (row[me].vitality - row[them].vitality)) < 1e-9,
          "the pack's margin is not the row's");
        assert.equal(pack.winner, row.winner);
        assert.ok(Math.abs(elapsed - row.seconds) < 0.1,
          `the windows cover ${elapsed} s of a ${row.seconds} s bout`);
        // The penalties are the row's own instruments, charged to the windows they fell in.
        assert.ok(clinch <= row[me].clinchSeconds + 1e-9,
          `the windows carry ${clinch} s of clinch and the row reports ${row[me].clinchSeconds}`);
        assert.ok(idle <= row[me].idleTravelMetres + 1e-9,
          `the windows carry ${idle} m of idle travel and the row reports ${row[me].idleTravelMetres}`);
        assert.ok(row[me].clinchSeconds - clinch < 0.2,
          `${row[me].clinchSeconds - clinch} s of clinch fell outside every window`);
        // The three engagement quantities are the same claim over the same bout: they are the
        // tracker's own accumulators differenced ask to ask, so what the windows carry has to add
        // up to what the row prints -- a little short is a sample before the first ask, and more
        // would mean the difference is being taken against the wrong reading.
        for (const [carried, column] of [[closing, "radialClosingMetres"],
          [stall, "nearRangeStallSeconds"], [outside, "retreatOutsideReachSeconds"]]) {
          assert.ok(carried <= row[me][column] + 1e-9,
            `the windows carry ${carried} of ${column} and the row reports ${row[me][column]}`);
          assert.ok(row[me][column] - carried < 0.2,
            `${row[me][column] - carried} of ${column} fell outside every window`);
        }
        // Empty strokes are counted, not accumulated, so the identity is an equality: every
        // stroke that closed empty closed inside some window, and the row's own column says how
        // many there were.
        assert.equal(swing, row[me].emptyStrokes,
          `the windows carry ${swing} empty strokes and the row reports ${row[me].emptyStrokes}`);
        assert.ok(row[me].emptyStrokes <= row[me].strokesStarted - row[me].aborts,
          `${row[me].emptyStrokes} empty strokes out of ${row[me].strokesStarted - row[me].aborts} that finished`);
        asks += count;
      }
    }
    assert.ok(asks > 48, `${asks} asks over four three-second bouts`);
    // And the whole term the win pays is a constant an episode, which is the arithmetic reason
    // it can be laid over a telescoping sum without breaking it: it moves the return by exactly
    // `win` and moves no difference between two windows of the same episode.
    const mine = rows[0].left.policy === "golem-policy" ? "left" : "right";
    const pack = rows[0].samples[mine];
    let bare = 0;
    let full = 0;
    const outcome = rows[0].winner === null ? 0 : rows[0].winner === mine ? 1 : -1;
    for (let i = 0; i < pack.logp.length; i += 1) {
      const w = {
        dealt: pack.dealt[i], taken: pack.taken[i], seconds: pack.seconds[i],
        clinchSeconds: 0, idleMetres: 0, closingMetres: 0, stallSeconds: 0,
        outsideSeconds: 0, emptyStrokes: 0, done: pack.done[i] === 1, outcome,
      };
      bare += stepReward(w, BARE_REWARD);
      full += stepReward(w, { ...GOLEM_REWARD, clinch: 0, idle: 0 });
    }
    assert.ok(Math.abs((full - bare) - GOLEM_REWARD.win * outcome) < 1e-9,
      `the win term moved the return by ${full - bare}`);
  });
