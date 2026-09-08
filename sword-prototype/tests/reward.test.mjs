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
  dealt: 0, taken: 0, seconds: 0, clinchSeconds: 0, idleMetres: 0, done: false, outcome: 0, ...over,
});

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
  for (const key of ["win", "clinch", "idle", "tick"]) {
    assert.equal(BARE_REWARD[key], 0, `the bare table charges ${key}`);
  }
  assert.throws(() => { BARE_REWARD.win = 1; }, "the bare table is not frozen");
});

/** With the bare table the reward is the differenced margin and nothing else, in both signs. */
test("the_bare_reward_is_exactly_what_the_two_bars_did", () => {
  assert.equal(stepReward(window({ dealt: 0.25, taken: 0.1 }), BARE_REWARD), 0.15);
  assert.equal(stepReward(window({ dealt: 0, taken: 0.4 }), BARE_REWARD), -0.4);
  assert.equal(stepReward(window({ dealt: 0.3, taken: 0.3 }), BARE_REWARD), 0);
  // And the terms the bare table zeroes really are the ones it is zeroing.
  assert.equal(stepReward(window({
    seconds: 9, clinchSeconds: 9, idleMetres: 9, done: true, outcome: 1,
  }), BARE_REWARD), 0);
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
  const T = { win: 2, clinch: 0.1, idle: 0.2, tick: 0.01 };
  const r = stepReward(window({
    dealt: 1, taken: 0, seconds: 4, clinchSeconds: 1, idleMetres: 2, done: true, outcome: -1,
  }), T);
  assert.ok(Math.abs(r - (1 - 0.1 - 0.4 - 0.04 - 2)) < 1e-12, `${r}`);
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
        for (const column of ["dealt", "taken", "seconds", "clinch", "idle", "done"]) {
          assert.equal(pack[column].length, count, `${column} is not one an ask`);
        }
        let sum = 0;
        let ended = 0;
        let elapsed = 0;
        let clinch = 0;
        let idle = 0;
        const outcome = row.winner === null ? 0 : row.winner === me ? 1 : -1;
        for (let i = 0; i < count; i += 1) {
          assert.ok(pack.seconds[i] >= 0, `ask ${i} ran ${pack.seconds[i]} s`);
          assert.ok(pack.clinch[i] >= 0 && pack.idle[i] >= 0, `ask ${i} was charged a negative pathology`);
          assert.ok(Number.isFinite(pack.logp[i]), `ask ${i} recorded a log-probability of ${pack.logp[i]}`);
          sum += stepReward({
            dealt: pack.dealt[i], taken: pack.taken[i], seconds: pack.seconds[i],
            clinchSeconds: pack.clinch[i], idleMetres: pack.idle[i],
            done: pack.done[i] === 1, outcome,
          }, BARE_REWARD);
          elapsed += pack.seconds[i];
          clinch += pack.clinch[i];
          idle += pack.idle[i];
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
        clinchSeconds: 0, idleMetres: 0, done: pack.done[i] === 1, outcome,
      };
      bare += stepReward(w, BARE_REWARD);
      full += stepReward(w, { ...GOLEM_REWARD, clinch: 0, idle: 0 });
    }
    assert.ok(Math.abs((full - bare) - GOLEM_REWARD.win * outcome) < 1e-9,
      `the win term moved the return by ${full - bare}`);
  });
