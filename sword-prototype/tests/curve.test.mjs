// The curve page's readers. Session 02 of the learn set.
//
// **Every fixture here is real output, and that is the whole design of this file.** A reader that
// takes `sem` where the file writes `barSem`, or that fills a missing `retSem` with a zero, draws
// a line that looks exactly like a correct one -- so the only fixture that can catch it is one
// this repository's own scripts wrote. The four under `tests/fixtures/` were made this way on
// 2026-09-09 and their provenance is worth stating, because a fixture whose origin nobody
// remembers becomes a fixture somebody "tidies":
//
// | fixture | where it came from |
// | --- | --- |
// | `tests/fixtures/train-ppo-excerpt.jsonl` | the header, the iteration-0 rating and the first three iteration rows of ppo-run1.jsonl, a 30-iteration `scripts/train-ppo.mjs` run at seed 20260913 |
// | `tests/fixtures/league-excerpt.jsonl` | the header, the iteration-0 rating and iterations 1, 8 and 9 of the shipped league arm's league.jsonl -- iteration 8 is the one that took a snapshot |
// | `tests/fixtures/rate-curve-excerpt.jsonl` | `scripts/rate-snapshots.mjs --dir tournaments/league-anchored --only 8 --bouts 10`, run to make this fixture |
// | `tests/fixtures/probe-curve-excerpt.jsonl` | `scripts/probe-snapshots.mjs --dir tournaments/league-anchored --only 8 --bouts 2`, the same |
//
// The two log excerpts have their `structural` block dropped -- several kilobytes a row of
// per-opponent tournament columns that no reader here touches -- and are otherwise the bytes the
// harness wrote. The two curve excerpts are whole. `tournaments/` is gitignored, so an excerpt
// under `tests/fixtures/` is the only form of this evidence that survives a clone.
//
// **Three mutations were watched red on 2026-09-09**, each applied to `src/curve/runs.ts` alone
// and then restored:
//
// | mutation | what went red |
// |---|---|
// | `readRows` skips an unparseable line wherever it is rather than only at the end | the truncation test |
// | `poolLabel` drops the seed from its parts | the pool-label test, the overlay refusal and the sweep's mismatched arm -- three, because the seed is what tells two arms of one shape apart |
// | `series` keeps a band built from fewer points than it has | the band test |
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  columnsOf, onePool, readCurve, readLeagueLog, readRun, readSweep, readTrainLog, reachMoved,
  reachOf, series, snapshotLink,
} from "../src/curve/runs.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => fs.readFileSync(path.join(HERE, "fixtures", name), "utf8");

const TRAIN = fixture("train-ppo-excerpt.jsonl");
const LEAGUE = fixture("league-excerpt.jsonl");
const RATE = fixture("rate-curve-excerpt.jsonl");
const PROBE = fixture("probe-curve-excerpt.jsonl");

const close = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual} is not ${expected}`);

test("a_train_ppo_log_reads_its_header_its_iterations_and_its_rating", () => {
  const run = readTrainLog(TRAIN, "ppo-run1.jsonl");
  assert.equal(run.kind, "train");
  assert.equal(run.header.seed, 20260913);
  assert.equal(run.header.date, "2026-09-08");
  assert.deepEqual([...run.header.league], [
    "golem-driver", "golem-form", "golem-brawler", "golem-duelist", "golem-fencer",
  ]);
  assert.equal(run.header.reward.win, 0.5);
  assert.equal(run.header.reward.tick, 0);

  assert.deepEqual(run.iterations.map((entry) => entry.iteration), [1, 2, 3]);
  const first = run.iterations[0];
  close(first.ret, -0.07056, "ret");
  close(first.retSem, 0.04143, "retSem");
  close(first.decided, 0.0938, "decided");
  close(first.kl, 0.02257, "kl");
  close(first.clipFraction, 0.1145, "clipFraction");
  close(first.explained, -1.6182, "explained");
  close(first.collectSeconds, 27.128, "collectSeconds");
  close(first.penaltyShare, 0.3728, "penaltyShare");
  assert.equal(first.logSigma.length, 9);
  // The trainer writes none of the league's columns, and a reader that filled them with zeroes
  // would draw a flat line where the run recorded nothing at all.
  assert.deepEqual(first.byOpponent, {});
  assert.equal(first.snapshot, null);

  assert.equal(run.ratings.length, 1);
  const rating = run.ratings[0];
  assert.equal(rating.at, "0");
  assert.equal(rating.per, 100);
  close(rating.differences.uniform.bar, 0.0145, "uniform bar");
  close(rating.differences.uniform.barSem, 0.0312, "uniform barSem");
  close(rating.differences.driver.d, -0.1397, "driver d");
});

test("a_league_log_carries_its_margin_against_each_side_it_played", () => {
  const run = readLeagueLog(LEAGUE, "league-anchored/league.jsonl");
  assert.equal(run.kind, "league");
  assert.equal(run.header.anchor, "golem-driver");
  assert.equal(run.header.policy, 2);
  assert.deepEqual(run.iterations.map((entry) => entry.iteration), [1, 8, 9]);

  const [first, snapshotted, after] = run.iterations;
  assert.deepEqual(Object.keys(first.byOpponent), [
    "self", "exploiter-0", "exploiter-1", "golem-driver",
  ]);
  close(first.byOpponent["golem-driver"], -0.08331603095983292, "margin against the anchor");
  close(first.shares.self, 0.25, "self share");
  // The pool grows by a snapshot at iteration 8, and iteration 9 plays the snapshot it took.
  assert.equal(first.snapshot, null);
  assert.equal(snapshotted.snapshot, 8);
  assert.deepEqual([...after.pool], [8]);
  assert.ok(Object.keys(after.byOpponent).includes("pool-8"));
  // The league writes no per-iteration standard error and no collection clock; both stay null
  // rather than becoming a band of zero width or a flat second.
  assert.equal(first.retSem, null);
  assert.equal(first.collectSeconds, null);
});

test("a_rate_snapshots_curve_keeps_the_pool_it_was_measured_on", () => {
  const run = readCurve(RATE, "league-anchored/rate.jsonl");
  assert.equal(run.kind, "curve");
  assert.equal(run.pool.builds, 52);
  assert.deepEqual([...run.pool.terminals], []);
  assert.equal(run.pool.label, "whole pool, 52 builds");
  assert.deepEqual(run.ratings.map((entry) => entry.at), ["8", "main"]);
  const [eight, main] = run.ratings;
  close(eight.differences.uniform.bar, 0.24789886419397042, "uniform bar");
  // The curve script prints its standard error as `sem` where a log's rating row prints `barSem`.
  close(eight.differences.uniform.barSem, 0.15310584842485517, "uniform sem read as barSem");
  close(eight.differences.driver.d, -0.011099367575373126, "driver d");
  // The decided fraction is recovered from the row's own w/d/l and is not a column the script has.
  close(eight.decided, 0.7, "decided at 4/3/3");
  close(main.decided, 0.8, "decided at 2/2/6");
});

test("a_probe_snapshots_curve_recovers_its_pool_from_the_classes_it_rolled_up", () => {
  const run = readCurve(PROBE, "league-anchored/probe.jsonl");
  // A probe row records no pool at all, so the build count is summed out of `byTerminal` rather
  // than assumed. Fifty-two is the whole pool, which is what the probe always runs on.
  assert.equal(run.pool.builds, 52);
  assert.equal(run.pool.label, "whole pool, 52 builds");
  const [eight, main] = run.ratings;
  close(eight.probe.killRate, 0.07692307692307693, "kill rate");
  close(eight.probe.maul, 0.5714285714285714, "maul rate");
  close(main.probe.mace, 0.125, "mace rate at main");
  assert.equal(eight.probe.mace, 0);
  // Both rows were probed without a `--baseline`, so `p` is null in the file. A row that was never
  // tested says so by having no column rather than by carrying a p of 1.
  assert.ok(!("p" in eight.probe), "an untested row must not carry a p");
  assert.ok(!columnsOf(run).includes("probe:p"), "and must not offer one as a column");
});

test("a_half_written_last_line_is_skipped_and_a_broken_middle_line_is_refused", () => {
  // Exactly what the page sees when it fetches a log the trainer is appending to.
  const truncated = `${LEAGUE.trimEnd().slice(0, -400)}`;
  const run = readLeagueLog(truncated, "league.jsonl");
  assert.equal(run.skipped, 1);
  assert.deepEqual(run.iterations.map((entry) => entry.iteration), [1, 8]);

  const lines = LEAGUE.trimEnd().split("\n");
  lines[2] = lines[2].slice(0, 120);
  assert.throws(
    () => readLeagueLog(`${lines.join("\n")}\n`, "league.jsonl"),
    /row 3 of 5 is not JSON/,
  );
});

test("a_row_whose_version_is_not_one_is_refused_by_name_and_by_number", () => {
  const lines = LEAGUE.trimEnd().split("\n");
  lines[0] = JSON.stringify({ ...JSON.parse(lines[0]), version: 2 });
  assert.throws(
    () => readLeagueLog(`${lines.join("\n")}\n`, "league-anchored/league.jsonl"),
    /league-anchored\/league\.jsonl: the header says version 2, and this page reads version 1/,
  );
  // An absent version is the shape this reader was written against and is not a refusal: no curve
  // row carries one today, and both curve fixtures read clean above.
  assert.equal(readCurve(RATE, "rate.jsonl").ratings.length, 2);
});

test("every_series_carries_the_pool_label_of_the_run_it_came_from", () => {
  const league = readLeagueLog(LEAGUE, "league-anchored/league.jsonl");
  const decided = series(league, "decided");
  assert.equal(decided.pool.label, "whole pool, random 40, seed 20260914");
  assert.deepEqual([...decided.x], [1, 8, 9]);
  close(decided.y[0], 0.35938, "decided at iteration 1");
  assert.equal(decided.opponent, "");

  const anchor = series(league, "versus:golem-driver");
  assert.equal(anchor.opponent, "golem-driver");
  assert.equal(anchor.pool.label, decided.pool.label);
  close(anchor.y[0], -0.08331603095983292, "margin against the anchor");

  const train = readTrainLog(TRAIN, "ppo-run1.jsonl");
  assert.equal(series(train, "ret").pool.label, "whole pool, random 40, seed 20260913");
  assert.throws(() => series(train, "versus:nobody"), /no column/);
});

test("two_pools_on_one_axis_are_refused_and_the_refusal_names_them", () => {
  const league = readLeagueLog(LEAGUE, "league-anchored/league.jsonl");
  const train = readTrainLog(TRAIN, "ppo-run1.jsonl");
  const curve = readCurve(RATE, "league-anchored/rate.jsonl");

  // Two series off one run always agree, which is the case the rule must not refuse.
  assert.equal(
    onePool([series(league, "decided"), series(league, "margin")]).label,
    "whole pool, random 40, seed 20260914",
  );
  // Two arms at two seeds are two evaluation pools, whatever else they have in common.
  assert.throws(
    () => onePool([series(league, "bar:uniform"), series(train, "bar:uniform")]),
    /two pools on one axis: league-anchored\/league\.jsonl on whole pool, random 40, seed 20260914; ppo-run1\.jsonl on whole pool, random 40, seed 20260913/,
  );
  // And a log's rating against a curve's, which are the same numbers on pools neither file can be
  // shown to share.
  assert.throws(
    () => onePool([series(league, "bar:uniform"), series(curve, "bar:uniform")]),
    /A rating is only comparable to another rating on the same pool\./,
  );
});

test("the_band_is_the_interval_the_scripts_print_and_a_partial_one_is_dropped", () => {
  const train = readTrainLog(TRAIN, "ppo-run1.jsonl");
  const ret = series(train, "ret");
  close(ret.lo[0], -0.07056 - 1.96 * 0.04143, "the low edge of the return band");
  close(ret.hi[0], -0.07056 + 1.96 * 0.04143, "the high edge of the return band");
  assert.equal(ret.lo.length, ret.y.length);
  // `decided` prints no standard error, so it draws a line and no band rather than a band of
  // nothing.
  assert.deepEqual([...series(train, "decided").lo], []);

  // A run whose rows disagree about whether they carry an error gets no band at all: a band drawn
  // point by point over fewer points than the line has is drawn against the wrong points.
  const lines = TRAIN.trimEnd().split("\n");
  const third = JSON.parse(lines[3]);
  delete third.retSem;
  lines[3] = JSON.stringify(third);
  const patchy = readTrainLog(`${lines.join("\n")}\n`, "ppo-run1.jsonl");
  const partial = series(patchy, "ret");
  assert.equal(partial.y.length, 3);
  assert.deepEqual([...partial.lo], []);
});

test("a_league_snapshot_point_links_to_the_file_that_holds_it", () => {
  const league = readLeagueLog(LEAGUE, "league-anchored/league.jsonl");
  assert.equal(snapshotLink(league, "8"), "index.html?snapshot=league-anchored/pool-8.json");
  // Iterations 1 and 9 took no snapshot, so there is no file to watch and no link.
  assert.equal(snapshotLink(league, "1"), null);
  assert.equal(snapshotLink(league, "9"), null);
  assert.deepEqual(
    [...series(league, "decided").link],
    [null, "index.html?snapshot=league-anchored/pool-8.json", null],
  );

  // A `train-ppo` run overwrites one checkpoint, so only its newest row has anything to open.
  const train = readTrainLog(TRAIN, "ppo-run1.jsonl");
  assert.deepEqual(
    [...series(train, "ret").link],
    [null, null, "index.html?snapshot=ppo-run1-checkpoint.json"],
  );
});

test("main_is_placed_past_the_last_numbered_snapshot_and_keeps_its_name", () => {
  const curve = readCurve(RATE, "rate.jsonl");
  const bar = series(curve, "bar:uniform");
  assert.deepEqual([...bar.at], ["8", "main"]);
  assert.deepEqual([...bar.x], [8, 9]);
  close(bar.y[1], 0.19493283100292808, "the live weights' bar margin");
  close(bar.lo[1], 0.19493283100292808 - 1.96 * 0.21022323306786692, "its band");
});

test("which_reader_a_file_wants_is_decided_by_what_is_in_it_and_not_by_its_name", () => {
  // Every name below is deliberately the wrong one for its contents. `tournaments/` follows no
  // convention -- the record's own arms are ppo-run1.jsonl, sweep-k.jsonl and v2-pool.jsonl -- so
  // a page that guessed from a name would be wrong on any run named after its question.
  assert.equal(readRun(TRAIN, "league.jsonl").kind, "train");
  assert.equal(readRun(LEAGUE, "ppo-run1.jsonl").kind, "league");
  assert.equal(readRun(RATE, "league.jsonl").kind, "curve");
  assert.equal(readRun(PROBE, "sweep-k.jsonl").kind, "curve");
  // And the columns each one offers are its own kind's, which is what the panels are built from.
  assert.ok(columnsOf(readRun(LEAGUE, "x.jsonl")).includes("versus:golem-driver"));
  assert.ok(!columnsOf(readRun(TRAIN, "x.jsonl")).includes("versus:golem-driver"));
  assert.ok(columnsOf(readRun(TRAIN, "x.jsonl")).includes("collectSeconds"));
});

test("a_sweep_manifest_reads_its_arms_and_refuses_what_it_cannot_compare", () => {
  const manifest = {
    name: "reward-shaping", seed: 20260914, script: "league",
    pool: { random: 40, terminals: [] },
    arms: [{ name: "control" }, { name: "closing" }, { name: "unstarted" }],
  };
  const sweep = readSweep(JSON.stringify(manifest), { control: LEAGUE, closing: LEAGUE });
  assert.equal(sweep.pool.label, "whole pool, random 40, seed 20260914");
  assert.deepEqual(sweep.arms.map((arm) => arm.name), [
    "reward-shaping/control", "reward-shaping/closing",
  ]);
  // An arm that has not written a row yet is named rather than silently dropped: a sweep is opened
  // while it is running, and three lines where the manifest asked for four is a lie by omission.
  assert.deepEqual([...sweep.missing], ["unstarted"]);

  // The arms' own headers say seed 20260914, so a manifest claiming 20260915 is claiming a pool
  // its arms did not run on -- which is the one thing a sweep exists to guarantee, and the one
  // case where a page can know two runs are comparable before reading either.
  assert.throws(
    () => readSweep(JSON.stringify({ ...manifest, seed: 20260915 }), { control: LEAGUE }),
    /the arm control ran on whole pool, random 40, seed 20260914 where the manifest says whole pool, random 40, seed 20260915/,
  );

  assert.throws(
    () => readSweep(JSON.stringify({ ...manifest, script: "train-neural" }), {}),
    /names the script train-neural, and this page reads train-ppo and league/,
  );
});

test("a_re_read_is_drawn_only_when_it_has_something_the_drawn_one_did_not", () => {
  // Session 11 of the learn set: the page re-reads a ticked run every ten seconds for the whole
  // of a twelve-hour league, and a redraw rebuilds every panel's SVG under whoever is reading it.
  // So the timer asks this before it draws, and these are the three shapes a re-read comes in.
  const whole = readLeagueLog(LEAGUE, "league.jsonl");
  const lines = LEAGUE.split("\n").filter((line) => line.trim() !== "");
  const shorter = readLeagueLog(lines.slice(0, 4).join("\n") + "\n", "league.jsonl");

  // Nothing read before is movement, or the first reading of a file would never be drawn.
  assert.equal(reachMoved(null, reachOf(shorter)), true);
  // The same file again is not. This is the case that happens on almost every tick, and it is the
  // one the whole function exists for: twelve hours of ten-second ticks is four thousand redraws
  // the page must not do.
  assert.equal(reachMoved(reachOf(whole), reachOf(whole)), false);
  assert.deepEqual(reachOf(whole), reachOf(readLeagueLog(LEAGUE, "league.jsonl")));
  // An appended row is, which is a league that has finished another iteration.
  assert.equal(reachMoved(reachOf(shorter), reachOf(whole)), true);
  assert.equal(whole.iterations.length, shorter.iterations.length + 1);
  // And so is a file that got *shorter*, because `scripts/rate-snapshots.mjs` writes a curve whole
  // rather than appending to it: a page that only drew growth would sit on the previous take of a
  // curve until something appended to it, which for a curve file is never.
  assert.equal(reachMoved(reachOf(whole), reachOf(shorter)), true);

  // The half-written last line rides in the reach for the same reason it is counted at all: a
  // fragment that becomes a whole row is the page's only sign that the harness is still writing.
  const mid = readLeagueLog(LEAGUE.slice(0, LEAGUE.length - 40), "league.jsonl");
  assert.equal(mid.skipped, 1);
  assert.equal(reachMoved(reachOf(mid), reachOf(whole)), true);
});

// ------------------- Session 02 of the signal set: the third baseline, and where it stops

/**
 * A log's rating row carries whichever baselines the rating took, and `golem-fencer` is now one.
 *
 * `readDifferences` walks `Object.entries(differences)` and names nothing, so a row that gained a
 * key gains a series -- which is the whole reason `ratePolicy` could take a third contender without
 * anything on the page being told about it. The fixture row is patched rather than replaced so that
 * what is asserted is the *addition*: the two series that were there are still there, with the
 * numbers they had.
 */
test("a_rating_row_carries_whichever_baselines_it_was_taken_against", () => {
  const rows = TRAIN.trim().split("\n").map((line) => JSON.parse(line));
  for (const row of rows) {
    if (row.type !== "rating") continue;
    row.differences.fencer = { bar: -0.0421, barSem: 0.0295, d: -0.1103, points: -0.021, pointsSem: 0.03 };
  }
  const run = readTrainLog(`${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "ppo-run1.jsonl");
  const rating = run.ratings[0];
  assert.deepEqual(Object.keys(rating.differences).sort(), ["driver", "fencer", "uniform"]);
  close(rating.differences.fencer.bar, -0.0421, "fencer bar");
  close(rating.differences.fencer.barSem, 0.0295, "fencer barSem");
  close(rating.differences.fencer.d, -0.1103, "fencer d");
  close(rating.differences.uniform.bar, 0.0145, "the baselines that were there are unmoved");
  assert.ok(columnsOf(run).includes("bar:fencer"), "a column the page can be asked to draw");
  assert.ok(columnsOf(run).includes("d:fencer"));
});

/**
 * And the one path that does not carry it, recorded rather than wished away.
 *
 * The session's plan says the curve page "reads whatever keys the row carries, so the page needs no
 * change". That is true of a *log*, through `readDifferences`. It is not true of a **rate-snapshots
 * curve file**: `readCurve` in `src/curve/runs.ts` walks the literal list `["uniform", "driver"]`,
 * so a `fencer` block written into a curve row is read by nothing and drawn as nothing. The block
 * is still written -- `rateSnapshots` puts it there and the file on disk is the record -- and the
 * page simply does not offer the series until that list is widened.
 *
 * This is asserted as the behaviour rather than fixed here because `src/curve/runs.ts` is not this
 * session's to edit. A later session widening the list will break this test, which is the correct
 * way for it to find out that this is the line.
 */
test("a_curve_files_third_baseline_is_written_to_disk_and_not_yet_read_by_the_page", () => {
  const rows = RATE.trim().split("\n").map((line) => JSON.parse(line));
  for (const row of rows) row.fencer = { bar: -0.0421, sem: 0.0295, d: -0.1103 };
  const run = readCurve(`${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "rate.jsonl");
  assert.deepEqual(Object.keys(run.ratings[0].differences).sort(), ["driver", "uniform"],
    "readCurve names its two opponents literally, so the third is dropped in the reader");
  assert.ok(!columnsOf(run).includes("bar:fencer"),
    "and the page therefore offers no fencer series off a curve file, however the file was written");
});
