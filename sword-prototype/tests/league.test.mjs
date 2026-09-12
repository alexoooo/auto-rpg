// The league: the opponent mix, the stored past, the exploiters' reset rule, and one real turn.
// Session 14 of the style set.
//
// **What a test of a league can and cannot claim.** It cannot claim the run improves anything --
// that is what the overnight and the checkpoint matrix are for, and no test running in seconds is
// evidence about it. What it can claim is that the arrangement is the one written down: that an
// iteration spends its bouts in the declared proportion rather than approximately, that a mind
// taken out of the sparring pool is still on disk, that an exploiter which has stopped gaining is
// re-seeded, that a killed run resumes from what it saved, and that a turn of the loop moves
// weights and produces a log line with the fields a reader needs. Those are the five things this
// file asserts, and it asserts them against independent arithmetic where there is any.
//
// **A sixth was added on 2026-09-09: the arithmetic a session's own numbers are quoted from.** The
// decisiveness curve's rows are tested against a fixed baseline with Fisher's exact test, and a p
// value in a measurements entry whose calculator lives in a scratch directory is not reproducible.
// So the test lives beside the curve, and it is checked here against the same two-sided sum done
// in exact integers -- arithmetic that shares no code with the log gamma the script uses.
//
// **Twenty-six mutations were watched red on 2026-09-08 and 2026-09-09**, each applied alone and
// then restored. Twelve are in `scripts/league.mjs`, four in `scripts/rate-snapshots.mjs`, seven
// in `scripts/probe-snapshots.mjs` and three in `scripts/idle-probe.mjs`:
//
// | mutation | what went red |
// |---|---|
// | `leaguePairs` pushes one slot an opponent and ignores the weight | both mix tests |
// | `collectLeague` schedules `ceil(bouts / 2)` pairings without rounding to a whole cycle | the real turn's realised mix |
// | `thinPool` keeps the newest `cap` entries instead of widening the gaps | both thinning tests and the real turn |
// | `exploiterStalled` compares the last two entries rather than best against best | the reset test |
// | `spreadSlots` hands the remainder to the same members every iteration | the rotation test |
// | `saveLeague` writes the playing pool as `taken` | the round trip and the real turn |
// | `leagueMatrix` rolls the tripwire's columns off the left corner only | the tripwire test |
// | `idleProbe` runs one corner of every pairing instead of both | the tripwire test |
// | `snapshotIterations` sorts the file names rather than the numbers | the curve's snapshot list |
// | `chosenSnapshots` filters a missing iteration away instead of refusing it | the curve's snapshot list |
// | `boutsPerOpponent` does not round up to an even count | the curve's snapshot list |
// | `formatRow` prints a hyphen for a negative margin | the curve's printed row |
// | `classRate` returns 0 for a class the pool does not carry | the probe curve's row |
// | `formatProbeRow` prints the kill count where the rate belongs | the probe curve's row |
// | `shippedIteration` takes any number rather than one the run snapshotted | the refusal test |
// | `spentBy` sums every iteration row rather than those up to the snapshot | the spend test |
// | `opponentSentence` drops the emphasis clause's trailing comma | the provenance test |
// | `opponentSentence` counts the pool the arm has now rather than the one the snapshot met | the provenance test |
// | `shipTable` passes the fit knobs through, as the end-of-run path did | the field test |
// | `rollupByTerminal` counts the builds that always kill rather than the bouts they won | the class rollup |
// | `rollupByTerminal` orders the classes by name rather than by how decisive they are | the class rollup |
// | `classCount` hands back the mean of the per-build rates | the rollup, the table and the row |
// | `probeRow` stores the maul rate where its table belongs | the curve row |
// | `parseBaseline` defaults to the row this session happens to use | the baseline test |
// | `fisher` keeps only the tables stricter than the observed one | the exact-arithmetic test |
// | `fisher` sums the upper tail alone | the exact-arithmetic test |
//
// **Three more on 2026-09-09, with Session 04 of the learn set:**
//
// | mutation | what went red |
// |---|---|
// | `emphasisedPool` checks its classes only once it has decided the weighting is worth doing | the emphasis refusal |
// | `saveLeague` writes one Adam block and gives every exploiter the main's | the moments round trip |
// | `momentsFromLeague` reports a state file with no `adam` as though it had one | the moments round trip |
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  LEAGUE_SHAPE, LEAGUE_VALUE_LAYOUT, MAIN_NAME, SELF_NAME, anchorList, bestSnapshot, collectLeague,
  contenderFor,
  copyRole, emphasisedPool, exploiterName, exploiterStalled, freshRole, leagueMatrix, leaguePairs,
  loadLeague, matrixBreaks, momentsFromLeague, opponentSentence, poolLoader, poolName, poolPath,
  ratingOn, readLog, roleFromCheckpoint, roleFromJson, roleToJson, saveLeague, shareOf, shipTable,
  shippedIteration, spentBy, spreadSlots, statePath, thinPool, trainRole,
} from "../scripts/league.mjs";
import { armedTerminal, buildPool } from "../scripts/tournament.mjs";
import { formatIdleProbe, idleProbe, rollupByTerminal } from "../scripts/idle-probe.mjs";
import {
  boutsPerOpponent, chosenSnapshots, formatRow, parseTerminals, snapshotIterations,
} from "../scripts/rate-snapshots.mjs";
import { keepViable, mixedSchedule, policyShapeOf, poolFor } from "../scripts/train-ppo.mjs";
import {
  VIABLE_MIRRORS, VIABLE_TERMINALS, viableBuild, viableMirror, viablePair,
} from "../src/golem/viability.ts";
import {
  classCount, classRate, fisher, formatProbeRow, parseBaseline, probeRow,
} from "../scripts/probe-snapshots.mjs";
import { POLICY_LAYOUT, POLICY_VERSION, freshPolicyTable } from "../src/golem/policy.ts";
import { netSize } from "../src/golem/neural-net.ts";

const SEED = 20260914;
const scratch = () => mkdtempSync(join(tmpdir(), "league-"));

// ---------------------------------------------------------------------------- the opponent mix

test("a declared opponent table becomes a cycle whose realised shares are the declaration", () => {
  const opponents = [
    { name: SELF_NAME, weight: 1 },
    { name: poolName(4), weight: 2 },
    { name: exploiterName(0), weight: 1 },
  ];
  const pairs = leaguePairs(opponents);
  assert.equal(pairs.length, 4, "the cycle is as long as the slots, not as the entries");
  assert.ok(pairs.every(([left]) => left === MAIN_NAME), "the trained side is the left of every pair");
  assert.equal(shareOf(pairs, SELF_NAME), 0.25);
  assert.equal(shareOf(pairs, poolName(4)), 0.5);
  assert.equal(shareOf(pairs, exploiterName(0)), 0.25);
  assert.equal(shareOf(pairs, "nobody"), 0);
});

test("an exploiter's cycle names the exploiter as the trained side", () => {
  const pairs = leaguePairs([{ name: SELF_NAME, weight: 1 }], exploiterName(1));
  assert.deepEqual(pairs, [[exploiterName(1), SELF_NAME]]);
});

test("a weight that is not a whole number of slots is refused, and so is an empty cycle", () => {
  assert.throws(() => leaguePairs([{ name: SELF_NAME, weight: 0.5 }]), /whole numbers/);
  assert.throws(() => leaguePairs([{ name: SELF_NAME, weight: -1 }]), /whole numbers/);
  assert.throws(() => leaguePairs([{ name: SELF_NAME, weight: 0 }]), /at least one opponent/);
  assert.throws(() => leaguePairs([]), /at least one opponent/);
});

test("the trained side may not also be its own opponent, because that is the mirror", () => {
  assert.throws(() => leaguePairs([{ name: MAIN_NAME, weight: 1 }]), /cannot also be its own opponent/);
});

test("a group's slots are spread evenly and the remainder rotates with the offset", () => {
  assert.deepEqual(spreadSlots(3, 6, 0), [2, 2, 2]);
  assert.deepEqual(spreadSlots(3, 7, 0), [3, 2, 2]);
  assert.deepEqual(spreadSlots(3, 7, 1), [2, 3, 2]);
  assert.deepEqual(spreadSlots(3, 7, 2), [2, 2, 3]);
  // More members than slots: some sit an iteration out, and a different some each time.
  assert.deepEqual(spreadSlots(4, 2, 0), [1, 1, 0, 0]);
  assert.deepEqual(spreadSlots(4, 2, 3), [1, 0, 0, 1]);
  assert.deepEqual(spreadSlots(0, 5, 0), []);
  for (let offset = 0; offset < 9; offset += 1) {
    assert.equal(spreadSlots(4, 7, offset).reduce((a, b) => a + b, 0), 7, "the slots always sum to the share");
  }
});

// ------------------------------------------------------------------------------ the stored past

test("thinning the pool keeps both ends and widens the gaps in the middle", () => {
  const entries = [0, 4, 8, 12, 16, 20].map((iteration) => ({ iteration }));
  const kept = thinPool(entries, 4).map((e) => e.iteration);
  assert.equal(kept.length, 4);
  assert.equal(kept[0], 0, "the oldest is the baseline and is never dropped");
  assert.equal(kept[kept.length - 1], 20, "the newest is the present and is never dropped");
  // Evenly spaced entries: the two dropped are middles, and what is left is wider spacing.
  assert.deepEqual(kept, [0, 8, 16, 20]);
  // A window that slid forward would have kept the newest four, which is the mutation this catches.
  assert.notDeepEqual(kept, [8, 12, 16, 20]);
  assert.deepEqual(thinPool(entries, 6).map((e) => e.iteration), [0, 4, 8, 12, 16, 20]);
  assert.deepEqual(thinPool(entries, 2).map((e) => e.iteration), [0, 20]);
  assert.throws(() => thinPool(entries, 1), /cannot keep both ends/);
});

test("thinning drops the entry closest to its predecessor, so a dense run thins where it is dense", () => {
  const entries = [0, 1, 2, 3, 40].map((iteration) => ({ iteration }));
  // Every gap in the cluster is one, so the first pass takes the earliest of them and the second
  // takes whatever is then closest to its predecessor: 1 goes, then 3, and the lone far entry is
  // never touched. The spacing that comes out widens with age, which is the point of the rule.
  assert.deepEqual(thinPool(entries, 3).map((e) => e.iteration), [0, 2, 40]);
});

// ------------------------------------------------------------------------- the exploiters' reset

test("an exploiter that has not been asked the question yet has not stalled", () => {
  assert.equal(exploiterStalled([], { patience: 3 }), false);
  assert.equal(exploiterStalled([0.1, 0.2, 0.3], { patience: 3 }), false, "patience + 1 entries are needed");
});

test("an exploiter still gaining is left alone, and one that has stopped is reset", () => {
  const knobs = { gain: 0.02, patience: 3 };
  assert.equal(exploiterStalled([0.0, 0.05, 0.10, 0.15], knobs), false);
  assert.equal(exploiterStalled([0.10, 0.10, 0.10, 0.10], knobs), true);
  // Best against best rather than last against last: a single bad rollout after a good one is
  // noise, and a rule on the last value alone would reset a healthy exploiter for it.
  assert.equal(exploiterStalled([0.0, 0.0, 0.30, 0.01], knobs), false, "a dip after a gain is not a stall");
  assert.equal(exploiterStalled([0.30, 0.0, 0.0, 0.01], knobs), true, "a gain that is all in the past is a stall");
  // The gain is a threshold and not a sign: creeping up by a thousandth a turn is stalled.
  assert.equal(exploiterStalled([0.10, 0.101, 0.102, 0.103], knobs), true);
  assert.equal(exploiterStalled([0.10, 0.11, 0.12, 0.13], knobs), false);
  assert.equal(exploiterStalled([0.10, 0.101, 0.102, 0.103], { gain: 0.001, patience: 3 }), false,
    "a smaller bar is a longer leash");
});

// ------------------------------------------------------------------------------- the checkpoint

test("a role round-trips through JSON, and a copy is a copy rather than a reference", () => {
  const role = freshRole(SEED);
  role.history.push(0.25);
  role.norm = { count: 7, mean: role.norm.mean.map(() => 0.5), variance: role.norm.variance.map(() => 2) };
  const back = roleFromJson(JSON.parse(JSON.stringify(roleToJson(role))));
  assert.equal(back.weights.length, netSize(POLICY_LAYOUT));
  assert.equal(back.valueWeights.length, netSize(LEAGUE_VALUE_LAYOUT));
  assert.deepEqual(Array.from(back.logSigma), Array.from(role.logSigma));
  assert.deepEqual(back.norm, role.norm);
  assert.deepEqual(back.history, [0.25]);
  // Five places, which is what the file stores; the weights are not asserted equal to the bit.
  for (let i = 0; i < role.weights.length; i += 1) {
    assert.ok(Math.abs(back.weights[i] - role.weights[i]) <= 5e-6, `weight ${i} did not survive`);
  }
  const copy = copyRole(role, 5, 3);
  copy.weights[0] += 1;
  copy.norm.mean[0] += 1;
  assert.notEqual(copy.weights[0], role.weights[0], "a copy shares no buffer with its source");
  assert.notEqual(copy.norm.mean[0], role.norm.mean[0]);
  assert.deepEqual(copy.history, [], "a re-seeded exploiter starts its history over");
  assert.equal(copy.bornAt, 3);
});

test("a league state round-trips, keeps every snapshot ever taken, and refuses a foreign version", () => {
  const dir = scratch();
  const state = {
    seed: SEED, date: "2026-09-08", iteration: 12, bouts: 768, steps: 90_000,
    main: freshRole(SEED),
    exploiters: [freshRole(SEED ^ 1), freshRole(SEED ^ 2)],
    pool: [{ iteration: 4 }, { iteration: 12 }],
    taken: [4, 8, 12],
  };
  saveLeague(dir, state);
  const back = loadLeague(dir);
  assert.equal(back.iteration, 12);
  assert.equal(back.bouts, 768);
  assert.equal(back.exploiters.length, 2);
  assert.deepEqual(back.pool.map((e) => e.iteration), [4, 12]);
  assert.deepEqual(back.taken, [4, 8, 12], "a mind thinned out of the sparring pool is still a row of the matrix");
  assert.equal(existsSync(statePath(dir) + ".tmp"), false,
    "the state is written aside and renamed into place, and the aside does not survive it");
  const raw = JSON.parse(readFileSync(statePath(dir), "utf8"));
  writeFileSync(statePath(dir), JSON.stringify({ ...raw, policy: POLICY_VERSION + 1 }));
  assert.throws(() => loadLeague(dir), /policy version/);
  writeFileSync(statePath(dir), JSON.stringify({ ...raw, version: 99 }));
  assert.throws(() => loadLeague(dir), /league version 99/);
});

test("a pool file is written once and read through a cache", () => {
  const dir = scratch();
  const role = freshRole(SEED);
  writeFileSync(poolPath(dir, 8), JSON.stringify(roleToJson(role)));
  const load = poolLoader(dir);
  const first = load(8);
  assert.equal(load(8), first, "a second read of one snapshot is the same object");
  assert.equal(first.weights.length, netSize(POLICY_LAYOUT));
  assert.ok(existsSync(poolPath(dir, 8)));
});

// ------------------------------------------------------------------------------- the matrix

test("a matrix of margins reads as progress or names the pairs that break it", () => {
  const names = ["pool-1", "pool-2", "pool-3"];
  const cell = (margin) => ({ bouts: 8, margin });
  const climbing = {
    names,
    matrix: {
      "pool-1": { "pool-1": null, "pool-2": cell(-0.2), "pool-3": cell(-0.3) },
      "pool-2": { "pool-1": cell(+0.2), "pool-2": null, "pool-3": cell(-0.1) },
      "pool-3": { "pool-1": cell(+0.3), "pool-2": cell(+0.1), "pool-3": null },
    },
  };
  assert.deepEqual(matrixBreaks(climbing), []);
  const cycling = JSON.parse(JSON.stringify(climbing));
  cycling.matrix["pool-3"]["pool-1"] = cell(-0.4);
  cycling.matrix["pool-1"]["pool-3"] = cell(+0.4);
  const breaks = matrixBreaks(cycling);
  assert.equal(breaks.length, 1);
  assert.deepEqual(breaks[0], { newer: "pool-3", older: "pool-1", margin: -0.4 });
  // A lag of two asks only about minds two places apart, which is the reading for a run whose
  // adjacent snapshots are inside their own noise.
  assert.deepEqual(matrixBreaks(cycling, { lag: 2 }), breaks);
  cycling.matrix["pool-2"]["pool-1"] = cell(-0.05);
  assert.equal(matrixBreaks(cycling, { lag: 2 }).length, 1, "a lag of two does not look at neighbours");
  assert.equal(matrixBreaks(cycling, { lag: 1 }).length, 2);
});

// ------------------------------------------------------------------- one real turn of the loop

/**
 * Three iterations of a two-role league on two workers, driving the same exported pieces the
 * script's loop drives and in the same order: freeze the present, collect the main against the
 * declared mix, fit, hunt with the exploiter against that same frozen copy, snapshot, thin, save.
 *
 * The claim is the arrangement and not the outcome. Three iterations of two bouts on two bodies
 * with a three second cap says nothing about whether anything improved, and the assertions are
 * accordingly about what a turn produced: that the realised bout counts are the declared ones,
 * that the fit moved the weights, that the exploiter's margin against the frozen main is a
 * number, and that the state written after the third iteration reads back as the state that was
 * in memory. What the run cannot say is checked nowhere in this file.
 */
test("three_iterations_of_a_two_role_league_on_two_workers", { timeout: 600_000 }, async () => {
  const dir = scratch();
  const builds = buildPool({ seed: SEED, random: 0 }).filter((b) => b.name === "default" || b.name === "fists");
  assert.equal(builds.length, 2);
  const state = {
    seed: SEED, date: "2026-09-08", iteration: 0, bouts: 0, steps: 0,
    main: freshRole(SEED), exploiters: [freshRole((SEED ^ 0xe0) >>> 0)], pool: [], taken: [],
  };
  const moments = { main: { actor: null, spread: null, critic: null }, hunter: { actor: null, spread: null, critic: null } };
  const before = Float64Array.from(state.main.weights);
  const lines = [];
  for (let iteration = 1; iteration <= 3; iteration += 1) {
    const frozen = copyRole(state.main, (SEED ^ iteration) >>> 0, iteration);
    const opponents = [{ name: SELF_NAME, weight: 1, contender: contenderFor(frozen) }];
    const slots = spreadSlots(state.pool.length, 1, iteration);
    state.pool.forEach((entry, i) => {
      if (slots[i] > 0) opponents.push({ name: poolName(entry.iteration), weight: slots[i], contender: contenderFor(state.main) });
    });
    opponents.push({ name: exploiterName(0), weight: 1, contender: contenderFor(state.exploiters[0]) });
    // An opponent with no contender is a shipped policy by name, which is how a hand-coded mind
    // can be an anchor in the mix. It goes through the same cycle and takes the same share.
    opponents.push({ name: "golem-driver", weight: 1 });
    const turn = await trainRole({
      builds, role: state.main, opponents, moments: moments.main,
      seed: (SEED + iteration * 7919) >>> 0, bouts: 4, workers: 2, cap: 3,
      // The trust region is off here and only here. Session 13 measured why a fit from cold Adam
      // moments spends its whole budget on the first minibatch -- `m/sqrt(v)` is exactly one, so
      // every weight moves by the learning rate in a direction one batch chose -- and a rollout
      // of four three-second bouts is nothing but that first minibatch. With the region on this
      // turn applies no step at all and the test would be asserting the shape of a fit that did
      // not happen. What the region does is `tests/ppo.test.mjs`'s claim, not this file's.
      fit: { batch: 64, epochs: 1, targetKl: 0 },
    });
    // The mix an iteration ran, against the mix it declared: the cycle is a whole number of
    // cycles long and every pairing is played from both corners, so these are equalities and
    // not approximations. This is the assertion the rounding in `collectLeague` exists for.
    const pairs = leaguePairs(opponents);
    for (const opponent of opponents) {
      assert.equal(turn.rollout.boutsByOpponent[opponent.name], shareOf(pairs, opponent.name) * turn.rollout.bouts,
        `${opponent.name} did not get the share it was promised in iteration ${iteration}`);
    }
    assert.equal(Object.keys(turn.rollout.byOpponent).length, opponents.length, "an opponent never played");
    assert.ok(Number.isFinite(turn.rollout.byOpponent["golem-driver"]), "the shipped anchor played and was scored");
    assert.ok(turn.rollout.count > 0 && Number.isFinite(turn.rollout.margin));
    assert.ok(Number.isFinite(turn.fit.kl) && turn.fit.updates >= 1, "the fit applied no step");
    assert.equal(state.main.norm.count, turn.rollout.count + state.steps,
      "the normalisation is extended by exactly the asks the rollout held");
    const hunt = await trainRole({
      builds, role: state.exploiters[0], moments: moments.hunter, name: exploiterName(0),
      opponents: [{ name: SELF_NAME, weight: 1, contender: contenderFor(frozen) }],
      seed: (SEED + iteration * 104_729) >>> 0, bouts: 4, workers: 2, cap: 3,
      fit: { batch: 64, epochs: 1, targetKl: 0 },
    });
    assert.deepEqual(Object.keys(hunt.rollout.byOpponent), [SELF_NAME], "an exploiter hunts the frozen main and nothing else");
    state.exploiters[0].history.push(hunt.rollout.byOpponent[SELF_NAME]);
    state.steps += turn.rollout.count;
    state.bouts += turn.rollout.bouts + hunt.rollout.bouts;
    writeFileSync(poolPath(dir, iteration), JSON.stringify(roleToJson(state.main)));
    state.taken.push(iteration);
    state.pool = thinPool([...state.pool, { iteration }], 2);
    state.iteration = iteration;
    saveLeague(dir, state);
    lines.push({ iteration, margin: turn.rollout.margin, gain: hunt.rollout.byOpponent[SELF_NAME] });
  }
  assert.equal(lines.length, 3);
  assert.ok(lines.every((l) => Number.isFinite(l.margin) && Number.isFinite(l.gain)));
  assert.ok(state.main.weights.some((w, i) => w !== before[i]), "three fits moved nothing");
  assert.equal(state.exploiters[0].history.length, 3);
  assert.equal(exploiterStalled(state.exploiters[0].history), false, "three entries is not yet the question");
  // The pool is capped at two and three snapshots were taken, so the middle one left the cycle
  // and stayed on disk.
  assert.deepEqual(state.pool.map((e) => e.iteration), [1, 3]);
  assert.deepEqual(state.taken, [1, 2, 3]);
  assert.ok(existsSync(poolPath(dir, 2)), "a thinned snapshot is not deleted");
  const back = loadLeague(dir);
  assert.equal(back.iteration, 3);
  assert.equal(back.bouts, state.bouts);
  assert.deepEqual(back.taken, [1, 2, 3]);
  assert.deepEqual(Array.from(back.main.logSigma, (x) => Math.round(x * 1e5)),
    Array.from(state.main.logSigma, (x) => Math.round(x * 1e5)), "the saved spread is the one in memory");
  assert.equal(back.exploiters.length, 1);
  assert.deepEqual(back.exploiters[0].history.map((x) => Math.round(x * 1e5)),
    state.exploiters[0].history.map((x) => Math.round(x * 1e5)));
  // And the matrix runs over what was stored, both corners of every pair, nothing recorded.
  const load = poolLoader(dir);
  const result = await leagueMatrix({
    builds, entries: [1, 2, 3].map((i) => ({ name: poolName(i), role: load(i) })),
    seed: (SEED ^ 0xc0f1c0f1) >>> 0, bouts: 2, workers: 2, cap: 3,
  });
  assert.deepEqual(result.names, ["pool-1", "pool-2", "pool-3"]);
  assert.equal(result.bouts, 3 * 2, "three pairs, one pairing each, both corners");
  for (const a of result.names) {
    for (const b of result.names) {
      if (a === b) { assert.equal(result.matrix[a][b], null); continue; }
      assert.equal(result.matrix[a][b].bouts, 2);
      // The matrix is antisymmetric by construction: a bout is one number read from both sides.
      assert.ok(Math.abs(result.matrix[a][b].margin + result.matrix[b][a].margin) < 1e-9);
    }
  }
  assert.ok(Array.isArray(matrixBreaks(result)));
});

/**
 * The tripwire's columns, off the matrix's own rows and off a probe against a motionless dummy.
 *
 * `docs/plans/style-14-league.md` puts these beside the matrix rather than in the training loop
 * for a reason the calibration measured: a league that gets better at not fighting climbs its own
 * matrix, and the matrix is blind to it. The claim here is only that the columns are computed
 * from the rows they say they are -- a ratio of two sums and not a mean of ratios -- and that a
 * probe of one build against itself is the build's own kill rate.
 */
test("the_matrix_and_the_idle_probe_carry_the_tripwires_columns", { timeout: 600_000 }, async () => {
  const dir = scratch();
  const builds = buildPool({ seed: SEED, random: 0 }).filter((b) => b.name === "default" || b.name === "maul");
  assert.equal(builds.length, 2);
  const roles = [freshRole(SEED), freshRole((SEED ^ 0xabc) >>> 0)];
  roles.forEach((role, i) => writeFileSync(poolPath(dir, i + 1), JSON.stringify(roleToJson(role))));
  const load = poolLoader(dir);
  const result = await leagueMatrix({
    builds, entries: [1, 2].map((i) => ({ name: poolName(i), role: load(i) })),
    seed: SEED, bouts: 4, workers: 2, cap: 6,
  });
  for (const name of result.names) {
    const c = result.structural[name];
    assert.equal(c.bouts, result.bouts, "every mind played every bout of a two-mind matrix");
    assert.ok(c.decided >= 0 && c.decided <= 1);
    assert.ok(c.abortFraction >= 0 && c.abortFraction <= 1, "an abort fraction outside [0, 1] is not a fraction");
    assert.ok(c.strokesStarted >= 0 && c.strokes >= 0 && c.damage >= 0);
    // A stroke the executor started and never landed is counted by one column and not the other,
    // which is the whole reason both are here.
    assert.ok(Number.isFinite(c.blows));
  }
  // Both minds are in every bout, so the decided fractions are the same number seen twice.
  assert.equal(result.structural[result.names[0]].decided, result.structural[result.names[1]].decided);

  const probe = await idleProbe({
    pool: builds, name: MAIN_NAME, contender: contenderFor(roles[0], false),
    bouts: 2, workers: 2, cap: 6, seed: SEED,
  });
  assert.equal(probe.bouts, builds.length * 2, "every build, both corners");
  assert.equal(probe.builds.length, builds.length);
  assert.deepEqual(probe.builds.map((b) => b.terminal).sort(), ["blade", "maul"]);
  assert.equal(probe.byTerminal.reduce((sum, g) => sum + g.builds, 0), builds.length);
  // The class carries its table as well as its mean, because the session's one test is a 2x2 on a
  // class and a mean of per-build rates cannot be handed to a hypergeometric. Every bout belongs
  // to exactly one class, so the two columns sum to the pool's own.
  assert.equal(probe.byTerminal.reduce((sum, g) => sum + g.kills, 0), probe.kills);
  assert.equal(probe.byTerminal.reduce((sum, g) => sum + g.bouts, 0), probe.bouts);
  for (const g of probe.byTerminal) {
    assert.deepEqual(classCount(probe.byTerminal, g.terminal), { kills: g.kills, bouts: g.bouts });
    assert.ok(Number.isInteger(g.kills) && Number.isInteger(g.bouts), "a table is counted, not averaged");
  }
  assert.equal(probe.kills, probe.builds.reduce((sum, b) => sum + b.won, 0));
  assert.ok(Math.abs(probe.killRate - probe.kills / probe.bouts) < 1e-9);
  assert.ok(probe.alwaysBuilds <= probe.everBuilds && probe.everBuilds <= probe.totalBuilds);
  for (const b of probe.builds) {
    assert.ok(b.theirBar >= 0 && b.theirBar <= 1, "the dummy's bar is a fraction");
    assert.ok(b.killSeconds === null || b.killSeconds > 0);
    assert.equal(b.always, b.won === b.bouts);
  }
  assert.match(formatIdleProbe(probe), /killed the dummy in \d+\/4 =/);
});

test("a league starts from a trainer's checkpoint, and says when the critic will not fit", () => {
  const role = freshRole(SEED);
  const checkpoint = {
    iteration: 30, seed: SEED, weights: Array.from(role.weights),
    valueWeights: Array.from(role.valueWeights), logSigma: Array.from(role.logSigma),
    normalisation: { count: 1000, mean: role.norm.mean, variance: role.norm.variance },
  };
  const started = roleFromCheckpoint(checkpoint, SEED);
  assert.equal(started.critic, true, "a checkpoint at the league's own value width brings its critic");
  assert.equal(started.role.norm.count, 1000, "the frozen normalisation comes with the weights");
  assert.deepEqual(Array.from(started.role.weights), Array.from(role.weights));
  assert.deepEqual(started.role.history, [], "a checkpoint carries no league history");
  // A checkpoint written under a wider critic keeps its actor and starts its critic over, which
  // is the only honest thing to do with value weights of the wrong shape.
  const wide = roleFromCheckpoint({ ...checkpoint, valueWeights: [1, 2, 3] }, SEED);
  assert.equal(wide.critic, false);
  assert.equal(wide.role.valueWeights.length, started.role.valueWeights.length);
  assert.ok(wide.role.valueWeights.some((w) => w !== 0), "a started-over critic is drawn, not zeroed");
  assert.deepEqual(Array.from(wide.role.weights), Array.from(role.weights), "the actor is untouched");
});

test("emphasising a weapon class repeats its builds in the draw list and drops nothing", () => {
  const pool = buildPool({ seed: SEED, random: 8 });
  assert.equal(emphasisedPool(pool, [], 3), pool, "no class named is the list itself");
  assert.equal(emphasisedPool(pool, ["maul"], 1), pool, "a weight of one is the list itself");
  const weighted = emphasisedPool(pool, ["maul", "mace"], 3);
  const count = (list, name) => list.filter((b) => b.name === name).length;
  for (const build of pool) {
    const kind = armedTerminal(build.setup);
    assert.equal(count(weighted, build.name), kind === "maul" || kind === "mace" ? 3 : 1,
      `${build.name} (${kind}) appears the wrong number of times`);
  }
  // A weighting is not a filter: every body the unweighted pool had is still drawable.
  assert.equal(new Set(weighted.map((b) => b.name)).size, new Set(pool.map((b) => b.name)).size);
  assert.ok(weighted.length > pool.length, "the emphasis did nothing at all");
});

// The offline rating curve. Everything expensive in `scripts/rate-snapshots.mjs` is `ratePolicy`,
// which the trainer's own tests cover; what is worth a test here is the three decisions it makes
// before spending a bout -- which snapshots exist, which of them were asked for, and how a budget
// stated a contender becomes bouts an opponent. All three are cheap to get wrong and expensive to
// notice, because the noticing happens after the bouts have been played.
test("the rating curve reads the snapshots off disk, refuses one that is not there, and rounds its budget", () => {
  const dir = mkdtempSync(join(tmpdir(), "curve-"));
  writeFileSync(join(dir, "league.json"), "{}");
  for (const iteration of [24, 8, 16]) writeFileSync(poolPath(dir, iteration), "{}");
  writeFileSync(join(dir, "pool-notanumber.json"), "{}");
  assert.deepEqual(snapshotIterations(dir), [8, 16, 24],
    "the snapshots are the pool files, in the order they were taken, and nothing else in the directory");

  assert.deepEqual(chosenSnapshots([8, 16, 24], null), [8, 16, 24], "no --only rates them all");
  assert.deepEqual(chosenSnapshots([8, 16, 24], "24, 8"), [24, 8], "--only keeps the order it was asked in");
  // Both curves append the live main after this list, so the empty list is how a caller asks for
  // that row alone -- an endpoint reading, which is what an arm not worth a full curve gets.
  assert.deepEqual(chosenSnapshots([8, 16, 24], "none"), [], "none is the empty list and not an error");
  // A silent filter here is a morning spent rating nothing, so a missing iteration is an error
  // rather than an empty list, and the message names the iteration that is missing.
  assert.throws(() => chosenSnapshots([8, 16, 24], "8,12"), /no snapshot for iteration 12/);

  // The budget is stated a contender and spent over the five hand-coded opponents, mirrored -- so
  // the per-opponent count is the fifth rounded up to an even number, and never below one pair.
  assert.equal(boutsPerOpponent(200, ["a", "b", "c", "d", "e"]), 40);
  assert.equal(boutsPerOpponent(201, ["a", "b", "c", "d", "e"]), 42, "a budget that does not divide rounds up");
  assert.equal(boutsPerOpponent(1, ["a", "b", "c", "d", "e"]), 2, "a rating is mirrored, so two is the floor");
});

// The pool the criterion is measured on. Thirty seven of the fifty two draws carry no weapon that
// has ever finished a fight, so a rating averaged over all of them is mostly chip damage between
// two minds that both fail to kill -- which is what `--terminals` exists to stop paying for.
test("the rating pool can be cut to the classes where a fight can end, and a typo cannot cut it silently", () => {
  assert.deepEqual(parseTerminals("maul,mace"), ["maul", "mace"]);
  assert.deepEqual(parseTerminals(" maul , Mace "), ["maul", "mace"], "a shell hands it spaces and a class is a name");
  assert.deepEqual(parseTerminals(null), [...VIABLE_TERMINALS],
    "no flag is the viable set since Session 01 of the learn set, and `all` is the way back");
  assert.deepEqual(parseTerminals("all"), ["all"]);
  // Empty is a refusal and not the whole pool: `--terminals ""` is a caller who meant to filter.
  assert.throws(() => parseTerminals(" , "), /--terminals wants weapon classes/);
  assert.throws(() => parseTerminals("maul,maul"), /repeats a class/);

  // The rating's pool is the run's own -- the state seed exclusive-ored with the same constant
  // `scripts/league.mjs` uses -- and it is a *different* draw from the probe's, so its class counts
  // are its own. This is the pool a shipped number is measured on.
  const seed = (SEED ^ 0xc0f1c0f1) >>> 0;
  const whole = poolFor({ seed, random: 40, terminals: parseTerminals("all") });
  const decisive = poolFor({ seed, random: 40, terminals: ["maul", "mace"] });
  assert.equal(whole.length, 52, "the evaluation pool is the twelve designed builds and forty draws");
  assert.equal(decisive.length, 20, "nine mauls and eleven maces are where a bout can be finished");
  const unarmed = whole.filter((b) => armedTerminal(b.setup) === "none").length;
  assert.equal(unarmed, 5, "five of the fifty two carry no weapon at all, and the rating averages them in");
  for (const build of decisive) {
    assert.ok(["maul", "mace"].includes(armedTerminal(build.setup)), "every kept build carries a kept weapon");
  }
  // The filter names a weapon class and not a draw index, so it survives a change of seed -- and a
  // class no build carries is an error rather than an empty pool and an hour of rating nothing.
  assert.throws(() => poolFor({ seed, random: 40, terminals: ["halberd"] }), /no build in the pool is armed with halberd/);
  // And the default, which is what every script in the set now draws through. On the table
  // Session 01 measured the *class* half of it is the whole fifty-two, because every class is
  // viable -- a maul decides against all seven, so the second admission rule admitted all seven.
  const viable = poolFor({ seed, random: 40 });
  assert.equal(viable.length, whole.length, `${viable.length} of ${whole.length}`);
  for (const build of viable) assert.ok(viableBuild(build.setup), build.caption);

  // The league's pools are mirrored -- `collectLeague`, `leagueMatrix`, the rating and the idle
  // probe all schedule one build into both corners -- so what they draw is the mirror pool, which
  // is the maul and mace builds and nothing else. This is the cut the class filter could not make.
  const mirrored = poolFor({ seed, random: 40, mirror: true });
  assert.deepEqual(mirrored.map((b) => b.name), whole.filter((b) => viableMirror(b.setup)).map((b) => b.name),
    "exactly the builds whose mirror is viable, and nothing else");
  assert.equal(mirrored.length, 20, "the nine mauls and eleven maces are the ones that mirror");
  for (const build of mirrored) assert.ok(VIABLE_MIRRORS.has(armedTerminal(build.setup)), build.caption);
  // `all` is still the one word back to the whole pool, in the mirrored arrangement as in the plain
  // one -- the close-out owes a table on the fifty-two and it is a mirrored table.
  assert.deepEqual(poolFor({ seed, random: 40, terminals: parseTerminals("all"), mirror: true }).map((b) => b.name),
    whole.map((b) => b.name));
  // A rating is mirrored by default, so it runs the same filter on whatever pool it is handed: the
  // two instruments cannot come apart by a caller passing the pool drawn for the other arrangement.
  assert.deepEqual(keepViable(whole, [...VIABLE_TERMINALS], true).map((b) => b.name), mirrored.map((b) => b.name));
  assert.throws(() => poolFor({ seed, random: 40, terminals: ["whip"], mirror: true }),
    /no build armed with whip can finish a copy of itself/);
});

test("a rating row prints both baselines with their intervals and the fit's record", () => {
  const line = formatRow({
    iteration: 16, bouts: 40, per: [],
    uniform: { bar: 0.1254, sem: 0.0416 / 1.96, d: 0.302 },
    driver: { bar: -0.0847, sem: 0.0409 / 1.96, d: -0.207 },
    fit: { wins: 57, draws: 279, losses: 54 },
  });
  // `mirr` is the arrangement, which a row carries since Session 10 of the learn set and which a
  // row written before it does not: two rows a snapshot scroll past one after the other now, and a
  // reader watching them go by has to be able to tell which is which. A row with neither
  // `pool.mirror` nor `mirror` reads as the mirror, because that is what every earlier row was.
  assert.match(line, /^ {5}16 mirr: uniform \+0\.1254 ±0\.0416 d \+0\.302/, "the iteration, the margin and its interval");
  assert.match(formatRow({
    iteration: 16, bouts: 40, per: [], pool: { builds: 52, terminals: [], mirror: false },
    uniform: { bar: 0.1254, sem: 0.0416 / 1.96, d: 0.302 },
    driver: { bar: -0.0847, sem: 0.0409 / 1.96, d: -0.207 },
    fit: { wins: 57, draws: 279, losses: 54 },
  }), /^ {5}16 rand: /, "and a random-pairs row says so");
  assert.match(line, /driver −0\.0847 ±0\.0409 d −0\.207/, "a negative margin prints a minus sign and not a hyphen");
  // The decided fraction is the rating's own decisiveness, and on the unfiltered pool it is the
  // number that says why the margin is insensitive: 279 of 390 bouts ended with both minds alive.
  assert.match(line, /w\/d\/l 57\/279\/54 decided 28%$/, "the record the margin came from, and how much of it was a fight");
});

// The decisiveness curve. `idleProbe` itself is covered where it lives; what is worth a test here
// is the two places a row is *read* rather than measured -- an armed class the pool does not carry,
// which must not read as a class that carries it and never kills, and the printed row, which is
// the only form most of these numbers are ever seen in.
test("a probe row distinguishes a class with no kills from a class with no builds", () => {
  const byTerminal = [
    { terminal: "maul", builds: 7, always: 5, killRate: 6 / 7, theirBar: 0.109, damage: 47.7 },
    { terminal: "mace", builds: 8, always: 0, killRate: 0, theirBar: 0.825, damage: 11.2 },
  ];
  assert.equal(classRate(byTerminal, "maul"), 6 / 7, "the class the pool carries reads its rate");
  assert.equal(classRate(byTerminal, "mace"), 0, "a class that carries builds and kills none reads zero");
  // Not zero: a pool with no whip build says nothing about the whip, and a curve that prints 0 %
  // there invites a reader to conclude the mind cannot finish one.
  assert.equal(classRate(byTerminal, "whip"), null, "a class the pool does not carry reads null");

  const line = formatProbeRow({
    iteration: 32, kills: 12, bouts: 104, killRate: 12 / 104, always: 5, ever: 7,
    maul: 6 / 7, mace: 0,
  }, 52);
  assert.match(line, /^ {5}32 mirr: {3}12\/104 = {2}11\.5%/, "the count, the denominator and the rate");
  assert.match(line, /maul {2}86% {3}mace {3}0%/, "a class with no kills prints 0 % and not a dash");
  assert.match(line, /always {2}5\/52 {3}ever {2}7\/52$/, "the two build counts the rollup turns on");
  assert.match(formatProbeRow({ iteration: "main", kills: 0, bouts: 8, killRate: 0, always: 0,
    ever: 0, maul: null, mace: null }, 4), /maul {3}-- {3}mace {3}--/, "an absent class prints a dash");
});

// The test the session's one pre-registered comparison is made with. `fisher` is a Lanczos log
// gamma and a loop over a hypergeometric, so the assertion worth making is against arithmetic that
// shares none of that: the same two-sided sum in exact integers, where a table is a ratio of
// binomial coefficients and nothing is approximated at all.
const choose = (n, k) => {
  if (k < 0 || k > n) return 0n;
  let r = 1n;
  for (let i = 0n; i < BigInt(k); i += 1n) r = (r * (BigInt(n) - i)) / (i + 1n);
  return r;
};
const exactFisher = (killsA, boutsA, killsB, boutsB) => {
  const kills = killsA + killsB;
  const at = (a) => choose(boutsA, a) * choose(boutsB, kills - a);
  const observed = at(killsA);
  let p = 0n;
  for (let a = Math.max(0, kills - boutsB); a <= Math.min(boutsA, kills); a += 1) {
    if (at(a) <= observed) p += at(a);
  }
  return Number(p) / Number(choose(boutsA + boutsB, kills));
};

// The rollup on a table with kills in it. The tripwire's own probe runs at a six-second cap and
// finishes nothing, so a mutation to the kill column survives every assertion made against it --
// which is why the rollup is a function of its own and this fixture has a class that kills, a
// class that does not, and a class of one build.
test("a weapon class carries both the mean of its builds' rates and its own table", () => {
  const build = (terminal, won, bouts) => ({
    terminal, won, bouts, killRate: won / bouts, always: won === bouts,
    theirBar: 1 - won / bouts, meanDamage: 10 * won,
  });
  const classes = rollupByTerminal([
    build("maul", 4, 4), build("maul", 2, 4), build("maul", 0, 4),
    build("blade", 0, 4), build("blade", 0, 4),
    build("whip", 1, 4),
  ]);
  assert.deepEqual(classes.map((g) => g.terminal), ["maul", "whip", "blade"],
    "the classes are ordered by how decisive they are, which is the order the tripwire is read in");
  const maul = classes[0];
  assert.equal(maul.builds, 3);
  assert.equal(maul.always, 1, "one of the three finished every bout");
  assert.equal(maul.kills, 6, "the class's kills are its builds' kills and not its builds that kill");
  assert.equal(maul.bouts, 12);
  // The two are different numbers here on purpose: the mean of 1, 0.5 and 0 is 0.5, and the pooled
  // rate is 6 of 12. They agree when every build played the same number of bouts, and this class
  // did -- so a fixture where they differ would not tell the two apart, and one where they agree
  // says the printed rate is the mean and the table is the count.
  assert.equal(maul.killRate, 0.5);
  assert.equal(maul.kills / maul.bouts, 0.5);
  assert.equal(classes[2].kills, 0, "a class that kills nothing carries a zero and not an absence");
  assert.equal(classes[2].bouts, 8);
  assert.deepEqual(classCount(classes, "whip"), { kills: 1, bouts: 4 }, "a class of one build is a class");
});

test("the two-sided p is the exact hypergeometric sum, and not a normal approximation of it", () => {
  // The tables this session actually quotes, and two textbook ones. 12/14 is the anchored arm's
  // maul class at 2 bouts a build, 9/28 the shipped fit's at 4, 3/4 against 1/4 the tea tasting.
  for (const [ka, na, kb, nb] of [
    [12, 14, 5, 14], [12, 14, 2, 14], [12, 14, 9, 28], [3, 4, 1, 4], [1, 10, 11, 14],
    [0, 28, 0, 28], [28, 28, 0, 28], [9, 28, 9, 28], [1, 3, 20, 40], [7, 7, 2, 21],
  ]) {
    const got = fisher(ka, na, kb, nb);
    assert.ok(Math.abs(got - exactFisher(ka, na, kb, nb)) < 1e-12,
      `${ka}/${na} vs ${kb}/${nb}: ${got} is not the exact sum ${exactFisher(ka, na, kb, nb)}`);
    // A 2x2 does not know which row was measured first, and a p that changed under a swap would
    // mean the arm compared against a baseline is not the same claim as the baseline compared
    // against the arm.
    assert.ok(Math.abs(got - fisher(kb, nb, ka, na)) < 1e-12, "the table transposes");
  }
  // The tea tasting in closed form: the tables at least as unlikely as three of four are a = 0, 1,
  // 3 and 4, which is (1 + 16 + 16 + 1) of the 70 ways to choose four of eight.
  assert.ok(Math.abs(fisher(3, 4, 1, 4) - 34 / 70) < 1e-12, "the two-sided sum is both tails");
  // Two rows that are the same fraction of the same denominator cannot be evidence of anything.
  assert.equal(fisher(9, 28, 9, 28), 1, "identical rows read p = 1");
  // The half of the sum that a one-sided test would drop. Quoted two-sided everywhere, so a
  // reading that halves it is reading a different test than the one pre-registered.
  assert.ok(fisher(12, 14, 9, 28) > 0.002 && fisher(12, 14, 9, 28) < 0.0026,
    "the anchored arm's maul class against the shipped fit's, as the entry quotes it");
});

test("a class carries the table its test needs, and a baseline is parsed or refused", () => {
  const byTerminal = [
    { terminal: "maul", builds: 7, always: 5, kills: 24, bouts: 28, killRate: 6 / 7 },
    { terminal: "mace", builds: 8, always: 0, kills: 0, bouts: 32, killRate: 0 },
  ];
  // The counts and not the rate: seven builds of four bouts, and the mean of the per-build rates
  // is a different number from kills over bouts as soon as one bout is lost to a dead worker.
  assert.deepEqual(classCount(byTerminal, "maul"), { kills: 24, bouts: 28 });
  assert.deepEqual(classCount(byTerminal, "mace"), { kills: 0, bouts: 32 });
  assert.equal(classCount(byTerminal, "whip"), null, "a class the pool does not carry has no table");

  assert.deepEqual(parseBaseline("9/28"), { kills: 9, bouts: 28 });
  assert.deepEqual(parseBaseline(" 9 / 28 "), { kills: 9, bouts: 28 }, "a shell may hand it spaces");
  assert.equal(parseBaseline(null), null, "no baseline is no test, and not a default one");
  // A default baseline is the failure this refusal exists for: the pre-registration names 9/28 on
  // the command line so that the row it is tested against is in the shell history beside the p.
  assert.throws(() => parseBaseline("9"), /--baseline wants kills\/bouts/);
  assert.throws(() => parseBaseline("29/28"), /--baseline wants kills\/bouts/, "more kills than bouts");
  assert.throws(() => parseBaseline("9/0"), /--baseline wants kills\/bouts/, "no bouts is no baseline");
  assert.throws(() => parseBaseline("4.5/28"), /--baseline wants kills\/bouts/, "a kill is a whole bout");

  const row = { iteration: 88, kills: 12, bouts: 104, killRate: 12 / 104, always: 5, ever: 7,
    maul: 6 / 7, mace: 0, p: fisher(24, 28, 9, 28) };
  assert.match(formatProbeRow(row, 52), /maul {2}86% p 0\.0001 {3}mace/,
    "the p sits against the class it is a claim about");
  assert.match(formatProbeRow({ ...row, p: null }, 52), /maul {2}86% {3}mace/,
    "a row probed without a baseline prints the line it always printed");
});

// The row is what survives the run: the printed curve scrolls away and the log file is what the
// entry is written from, so a field the row does not carry is a probe that has to be run again.
test("a curve row carries the class table it was tested on, and says so when it was not tested", () => {
  const probe = {
    kills: 23, bouts: 208, killRate: 23 / 208, alwaysBuilds: 0, everBuilds: 12,
    byTerminal: [
      { terminal: "maul", builds: 7, always: 0, kills: 17, bouts: 28, killRate: 17 / 28 },
      { terminal: "mace", builds: 8, always: 0, kills: 3, bouts: 32, killRate: 3 / 32 },
    ],
  };
  const row = probeRow(88, probe, { kills: 9, bouts: 28 });
  assert.equal(row.maulKills, 17, "the table and not the rate, so the row can be re-tested later");
  assert.equal(row.maulBouts, 28);
  assert.ok(Math.abs(row.p - fisher(17, 28, 9, 28)) < 1e-12, "against the baseline it was given");
  assert.equal(row.iteration, 88);
  assert.equal(row.ever, 12, "the probe's own names are flattened into the ones the curve prints");

  // No baseline is null and not 1: a row that was never tested and a row that tested identical to
  // its baseline are different facts, and a curve read months later cannot tell them apart if the
  // untested row carries a p at all.
  assert.equal(probeRow(88, probe).p, null);
  // A pool with no maul build carries no table rather than a zero, for the reason `classRate` does.
  const blades = { ...probe, byTerminal: [{ terminal: "blade", builds: 14, always: 0, kills: 0, bouts: 56, killRate: 0 }] };
  assert.equal(probeRow(8, blades, { kills: 9, bouts: 28 }).maulKills, null);
  assert.equal(probeRow(8, blades, { kills: 9, bouts: 28 }).p, null, "a class that is not there is not a p of 1");
});

// ---------------------------------------------------------------------------- shipping a mind

test("shipping refuses an iteration the run never snapshotted, and names the ones it has", () => {
  const state = { iteration: 34, taken: [8, 16, 24, 32], exploiters: [] };
  assert.equal(shippedIteration(state, MAIN_NAME), 34, "the live main is the arm's current iteration");
  assert.equal(shippedIteration(state, null), 34, "and is what a ship with no iteration means");
  assert.equal(shippedIteration(state, "16"), 16, "a stored snapshot arrives from the command line as a string");
  // The refusal, and why it earns a branch: without it the next thing to happen is an ENOENT
  // inside a `readFileSync` on a pool file nobody wrote, which reads as a corrupt arm.
  assert.throws(() => shippedIteration(state, "17"), /not a snapshot of this league; it took 8, 16, 24, 32/);
  assert.throws(() => shippedIteration({ iteration: 3, taken: [], exploiters: [] }, "0"), /it took none/);
});

test("a snapshot is credited with the training it saw and not with the run's total", () => {
  const rows = [
    { type: "header", seed: 1 },
    { type: "iteration", iteration: 1, bouts: 132, steps: 100_000 },
    { type: "iteration", iteration: 2, bouts: 130, steps: 90_000 },
    { type: "rating", iteration: 2, per: 20 },
    { type: "iteration", iteration: 3, bouts: 128, steps: 80_000 },
  ];
  assert.deepEqual(spentBy(rows, 2), { bouts: 262, steps: 190_000 }, "the rows up to the snapshot and no others");
  assert.deepEqual(spentBy(rows, 3), { bouts: 390, steps: 270_000 });
  assert.deepEqual(spentBy(rows, 0), { bouts: 0, steps: 0 }, "a snapshot at iteration 0 saw no training");
});

test("a killed run's log is still readable, because only its last line can be half-written", () => {
  const dir = scratch();
  const path = join(dir, "league.jsonl");
  const whole = JSON.stringify({ type: "header", seed: SEED, anchor: null }) + "\n"
    + JSON.stringify({ type: "iteration", iteration: 1, bouts: 4, steps: 10 }) + "\n";
  writeFileSync(path, whole);
  assert.equal(readLog(dir).length, 2);
  writeFileSync(path, whole + '{"type":"iteration","iteration":2,"bo');
  const rows = readLog(dir);
  assert.equal(rows.length, 2, "the truncated append is dropped and the rest of the night is kept");
  assert.equal(rows[1].iteration, 1);
  // A broken line that is not the last one is a different fault -- the file is not what it claims
  // to be -- and reading past it would quietly under-count whatever it held.
  writeFileSync(path, '{"type":"header"' + "\n" + whole);
  assert.throws(() => readLog(dir), /JSON/);
});

test("the shipped provenance names the anchor and the emphasis, and reads before the pool", () => {
  const state = { taken: [8, 16, 24], exploiters: [freshRole(SEED), freshRole(SEED ^ 1)] };
  const head = { anchor: "golem-driver", emphasise: ["maul", "mace"], emphasis: 3 };
  // `renderPolicyModule` writes "on the whole pool" straight after this sentence, so the assertion
  // is on the whole clause and not on the fragment: a comma in the wrong place is the failure.
  assert.equal(`against ${opponentSentence(state, head)} on the whole pool`,
    "against a league of 3 of its own past selves, 2 exploiters and golem-driver, with maul and "
    + "mace builds drawn 3 times as often, on the whole pool");
  assert.equal(opponentSentence(state, { anchor: null, emphasise: [], emphasis: 3 }),
    "a league of 3 of its own past selves and 2 exploiters",
    "an arm with neither says neither, rather than claiming it had them at a share of zero");
  assert.equal(
    opponentSentence({ taken: [4], exploiters: [freshRole(SEED)] }, { anchor: "golem-driver", emphasise: [] }),
    "a league of 1 of its own past selves, 1 exploiter and golem-driver");
  // The pool a snapshot met is the pool as it stood before it, not the one the arm has now. At
  // iteration 8 of this run nothing had been stored yet, and the clause goes rather than reading
  // "0 of its own past selves".
  assert.equal(opponentSentence(state, head, 8),
    "a league of 2 exploiters and golem-driver, with maul and mace builds drawn 3 times as often,");
  assert.equal(opponentSentence(state, head, 24), "a league of 2 of its own past selves, 2 exploiters "
    + "and golem-driver, with maul and mace builds drawn 3 times as often,");
  assert.equal(opponentSentence({ taken: [], exploiters: [] }, { anchor: null, emphasise: [] }), "itself",
    "a league with an empty pool, no exploiters and no anchor is the mirror, and says so");
});

test("a shipped table carries exactly the fields the policy type declares", () => {
  const role = freshRole(SEED);
  const rated = {
    names: ["fit", "uniform", "driver"],
    results: { fit: { score: 0.51 }, uniform: { score: 0.43 }, driver: { score: 0.49 } },
  };
  const head = {
    halfLife: 4, lambda: 0.95, clip: 0.2, entropy: 0.0003, rate: 1e-4, valueRate: 1e-3,
    epochs: 4, batch: 4096, targetKl: 0.03, sigmaFloor: -3, sigmaRoof: 0.5,
    anchor: "golem-driver", emphasise: ["maul"], emphasis: 3, terminals: [], reward: null,
  };
  const table = shipTable(role, {
    state: { seed: SEED, taken: [8, 16], exploiters: [] }, head, iteration: 16,
    spent: { bouts: 2112, steps: 1_600_000 }, rated, date: "2026-09-09",
  });
  assert.equal(table.iterations, 16);
  assert.equal(table.bouts, 2112, "the spend up to the snapshot, not the arm's running total");
  assert.equal(table.opponent, "a league of 1 of its own past selves and golem-driver, with maul "
    + "builds drawn 3 times as often,", "the pool as it stood before iteration 16, which was one mind");
  assert.deepEqual(table.baselines, { uniform: 0.43, driver: 0.49 }, "every contender but the fit is a baseline");
  assert.equal(table.score, 0.51);
  // The one that matters. The generated module assigns this object to `PolicyWeights`, so a knob
  // that is not a field of that type is an excess property and `npm run check` refuses the file
  // the ship just wrote -- which is what the end-of-run path would have done with eleven of them.
  assert.deepEqual(Object.keys(table).sort(), Object.keys(freshPolicyTable([], [])).sort(),
    "the shipped table's fields are the type's fields, no more and no fewer");
});

// ------------------------------------------------------- what Session 04 of the learn set added

/**
 * A weapon class the draw list does not carry is refused, and the refusal says what it does carry.
 *
 * `--emphasise` went quietly inert in Session 01 of the learn set and nobody noticed until Session
 * 04 went looking: every training pool in `scripts/league.mjs` now draws through `viableMirror`,
 * which keeps the two classes that can finish a copy of themselves and drops the other five, so
 * `--emphasise blade` weighted a list the mirror filter had already emptied of blades. It did
 * nothing, it said nothing, and the run looked exactly like the run that had been asked for. What
 * makes the refusal useful rather than merely correct is the second half of the message: a caller
 * who has just been told their class is not there wants to know which classes are, and on a
 * mirrored pool the answer is a surprise worth printing.
 */
test("emphasising_a_class_the_mirrored_pool_cannot_carry_is_refused_by_name", () => {
  const pool = poolFor({ seed: SEED, random: 24, terminals: [...VIABLE_TERMINALS], mirror: true });
  assert.ok(pool.length > 0);
  assert.deepEqual([...new Set(pool.map((b) => armedTerminal(b.setup)))].sort(), ["mace", "maul"],
    "a mirrored pool is a maul-and-mace pool, which is the fact the refusal exists to state");
  assert.throws(() => emphasisedPool(pool, ["blade"], 3),
    /--emphasise names blade, which no build in this pool carries; it draws mace, maul/);
  // A weight of one is already inert by design, and that is not a reason to accept a class that is
  // not there: the run would still be the run nobody asked for if the weight were later raised.
  assert.throws(() => emphasisedPool(pool, ["blade"], 1), /no build in this pool carries/);
  // Every class named has to be there, not merely one of them.
  assert.throws(() => emphasisedPool(pool, ["maul", "whip"], 3), /names whip/);
  // And the classes that are there still weight, which is the behaviour the refusal must not cost.
  assert.equal(emphasisedPool(pool, ["maul"], 3).length > pool.length, true);
});

/**
 * Adam's moments ride in `league.json`, one block a role, and a state without them starts cold.
 *
 * The eighth frozen choice is that an overnight run expects to die and Session 04's runner
 * restarts it; what makes the restarted arm the same run rather than a warm start is this. The
 * cost of getting it wrong is not an error but a number: a role that comes back cold spends its
 * next fit taking the largest steps its rate allows, in whatever direction one minibatch chose,
 * and the log shows a step somebody would later read as learning.
 *
 * The absence case is asserted as loudly as the presence one, because every league written before
 * this session has no `adam` at all and must still load -- the league version is about what a
 * reader would *misread*, and a missing block cannot be misread.
 */
test("a_leagues_adam_moments_round_trip_and_a_state_without_them_starts_cold", () => {
  const dir = scratch();
  const state = {
    seed: SEED, date: "2026-09-09", iteration: 3, bouts: 10, steps: 100,
    main: freshRole(SEED), exploiters: [freshRole(SEED + 1)], pool: [], taken: [],
  };
  const block = (size, step) => ({
    m: Float64Array.from({ length: size }, (_, i) => (i + 1) * 1e-9),
    v: Float64Array.from({ length: size }, (_, i) => (i + 1) * 1e-12),
    step,
  });
  const moments = {
    [MAIN_NAME]: {
      actor: block(netSize(POLICY_LAYOUT), 12), spread: block(9, 12),
      critic: block(netSize(LEAGUE_VALUE_LAYOUT), 12),
    },
    [exploiterName(0)]: {
      actor: block(netSize(POLICY_LAYOUT), 4), spread: block(9, 4),
      critic: block(netSize(LEAGUE_VALUE_LAYOUT), 4),
    },
  };
  saveLeague(dir, state, moments);
  const back = momentsFromLeague(loadLeague(dir), 1);
  assert.equal(back.saved, true);
  assert.deepEqual(back.warnings, [], "every block came back at the width it went in at");
  assert.equal(back.moments[MAIN_NAME].actor.step, 12);
  assert.equal(back.moments[exploiterName(0)].actor.step, 4, "an exploiter keeps its own optimiser");
  // Full precision, where the weights beside them are rounded to five places: a second moment of
  // 1e-12 rounded that way is zero, which is the same as not having saved it.
  assert.equal(back.moments[MAIN_NAME].critic.v[0], 1e-12);
  assert.deepEqual(Array.from(back.moments[MAIN_NAME].spread.m), Array.from(moments[MAIN_NAME].spread.m));

  // A state written without them -- which is every league this repository has on disk -- loads,
  // and says once that its roles are starting cold rather than three times a role.
  saveLeague(dir, state);
  const cold = momentsFromLeague(loadLeague(dir), 1);
  assert.equal(cold.saved, false);
  assert.deepEqual(cold.warnings, []);
  assert.deepEqual(Object.keys(cold.moments), [MAIN_NAME, exploiterName(0)]);
  assert.deepEqual(Object.values(cold.moments[MAIN_NAME]), [null, null, null]);
});

// ------------------------------------------------ Session 10 of the learn set: the other arrangement

/**
 * The share table survives the second axis, which is the one property that made it safe to add.
 *
 * A league's declared mix is a cycle of opponents and `mixedSchedule` walks that cycle twice --
 * once over mirrored pairings and once over random viable ones -- so the arrangement and the
 * opponent are independent. If they were not, an arm at half a mirror would be an arm at a
 * different opponent mix as well, and every difference this session measures would be two changes
 * wearing one flag.
 */
test("the_share_table_sums_the_same_when_half_the_bouts_are_not_a_mirror", () => {
  const pool = poolFor({ seed: SEED, random: 40, terminals: ["maul", "mace"], mirror: true });
  const random = poolFor({ seed: SEED, random: 40, terminals: ["maul", "mace"], mirror: false });
  const opponents = [
    { name: SELF_NAME, weight: 1 }, { name: "golem-driver", weight: 1 },
    { name: "golem-fencer", weight: 1 },
  ];
  const pairs = leaguePairs(opponents, MAIN_NAME);
  const shares = (mirrorShare) => {
    const { jobs, split } = mixedSchedule({
      pool, randomPool: random, policies: [MAIN_NAME, ...opponents.map((o) => o.name)],
      pairings: 24, seed: SEED, cap: 60, contenders: { [MAIN_NAME]: {}, [SELF_NAME]: {} },
      pairs, mirrorShare,
    });
    const count = new Map();
    for (const job of jobs) {
      if (job.swapped) continue;
      const them = job.left.policy === MAIN_NAME ? job.right.policy : job.left.policy;
      count.set(them, (count.get(them) ?? 0) + 1);
    }
    return { count, split, jobs };
  };
  const whole = shares(1);
  const half = shares(0.5);
  assert.deepEqual([...whole.count.entries()].sort(), [...half.count.entries()].sort(),
    "the same opponents at the same counts, whichever arrangement the bouts were run in");
  for (const opponent of opponents) {
    assert.equal(half.count.get(opponent.name), 8, "three opponents over 24 pairings is eight each");
    assert.equal(shareOf(pairs, opponent.name), 1 / 3);
  }
  assert.deepEqual(whole.split, { mirror: 24, random: 0 }, "a share of one schedules no random half");
  assert.deepEqual(half.split, { mirror: 12, random: 12 });
  // The indices are renumbered across the two schedules, because `runJobs` places a finished row
  // at `row.index` in an array of `jobs.length`: two concatenated schedules that both started at
  // zero would overwrite each other's first half and lose it silently.
  assert.deepEqual(half.jobs.map((job) => job.index), half.jobs.map((_, i) => i));
});

/**
 * The claim the plan asks for in as many words: a random-share pairing is never a mirror and is
 * always one `viablePair` accepts.
 *
 * Both halves matter and they fail in opposite directions. A pairing that turned out to be a
 * mirror would mean the flag bought nothing and an arm measured its control twice; a pairing
 * `viablePair` refuses would mean a share of every iteration was spent on two bodies that cannot
 * finish each other, which is the pool the set spent Session 01 getting away from.
 */
test("a_random_share_pairing_is_never_a_mirror_and_is_always_viable", () => {
  const pool = poolFor({ seed: SEED, random: 40, terminals: [...VIABLE_TERMINALS], mirror: true });
  const random = poolFor({ seed: SEED, random: 40, terminals: [...VIABLE_TERMINALS], mirror: false });
  const pairs = [[MAIN_NAME, SELF_NAME]];
  const { jobs, split } = mixedSchedule({
    pool, randomPool: random, policies: [MAIN_NAME, SELF_NAME], pairings: 64, seed: SEED, cap: 60,
    contenders: { [MAIN_NAME]: {}, [SELF_NAME]: {} }, pairs, mirrorShare: 0.5,
  });
  assert.deepEqual(split, { mirror: 32, random: 32 });
  let mirrored = 0;
  let drawn = 0;
  for (const job of jobs) {
    if (job.swapped) continue;
    if (job.left.build === job.right.build) { mirrored += 1; continue; }
    drawn += 1;
    assert.equal(viablePair(job.left.setup, job.right.setup), true,
      `${job.left.build} against ${job.right.build} is a pairing viablePair refuses`);
  }
  assert.equal(mirrored, 32, "the mirrored half is still one build in both corners");
  assert.equal(drawn, 32, "and the random half drew two different bodies every time");
  // Not merely "usually two different bodies": the mirrored half is drawn from the builds that can
  // finish a copy of themselves and the random half from the whole class-filtered pool, so a
  // schedule that had quietly used one list for both would show up here as a build count rather
  // than as a repeated pair.
  assert.ok(random.length > pool.length,
    `the random half draws ${random.length} builds and the mirrored one ${pool.length}`);
});

/**
 * Rated on both, selected on one: `--select` picks the snapshot the named pool ranks first, on a
 * fixture where the two pools disagree about which snapshot that is.
 *
 * The disagreement is the whole test. Two pools that agreed would make any selection rule look
 * correct, and the failure this guards against is a ship step that reads the mirror while the
 * session's bar is stated on random pairs -- a mind picked by a number that never looked at the
 * bodies the game draws.
 */
test("select_picks_the_snapshot_the_named_pool_ranks_first_where_the_two_disagree", () => {
  const rating = (iteration, mirror, random) => ({
    type: "rating", iteration, select: "random",
    differences: { driver: { bar: random } },
    byPool: {
      random: { pool: "random", mirror: false, differences: { driver: { bar: random } } },
      mirror: { pool: "mirror", mirror: true, differences: { driver: { bar: mirror } } },
    },
  });
  const rows = [
    { type: "header", seed: SEED },
    rating(8, 0.05, 0.11),
    rating(16, 0.22, 0.04),
    rating(24, 0.18, 0.09),
  ];
  const state = { iteration: 27, taken: [8, 16, 24], exploiters: [] };
  assert.equal(bestSnapshot(rows, "mirror", state.taken).iteration, 16);
  assert.equal(bestSnapshot(rows, "random", state.taken).iteration, 8,
    "the mirror's best is the random pool's worst, which is the specialist this rule exists to catch");
  assert.equal(shippedIteration(state, "best", { rows, select: "random" }), 8);
  assert.equal(shippedIteration(state, "best", { rows, select: "mirror" }), 16);
  // A rating of a mind that is no longer in the pool is not a candidate: `--ship` writes a module
  // from a pool file, and a snapshot the run thinned away has no file to write from.
  assert.equal(bestSnapshot(rows, "random", [16, 24]).iteration, 24);
  // A row written before this session carries `differences` and no `byPool`, and what it measured
  // was the mirror. Asked for its random-pairs number it has none, and inventing the mirrored one
  // would be the nearly-right control this directory keeps paying for.
  const old = [{ type: "rating", iteration: 8, differences: { driver: { bar: 0.4 } } }];
  assert.equal(ratingOn(old[0], "mirror"), 0.4);
  assert.equal(ratingOn(old[0], "random"), null);
  assert.equal(bestSnapshot(old, "random", [8]), null);
  assert.throws(() => shippedIteration({ iteration: 9, taken: [8], exploiters: [] }, "best",
    { rows: old, select: "random" }), /no rating row of this league carries one/);
});

/**
 * Two anchors, and both of them in `byOpponent` with bouts against each.
 *
 * The count beside the mean is the half that matters here. A second anchor that was declared and
 * never met would leave a mean of zero over zero bouts and a share table that still looked right,
 * which is exactly how a share flag becomes a flag that does nothing.
 */
test("two_anchors_are_both_met_and_both_reported", { timeout: 600_000 }, async () => {
  const builds = poolFor({ seed: SEED, random: 0, terminals: ["maul"], mirror: true });
  const random = poolFor({ seed: SEED, random: 0, terminals: ["maul"], mirror: false });
  const opponents = [
    { name: "golem-driver", weight: 1 },
    { name: "golem-fencer", weight: 1 },
  ];
  const rollout = await collectLeague({
    builds, randomBuilds: random, role: freshRole(SEED), opponents, seed: SEED, bouts: 8,
    workers: 2, cap: 8, mirrorShare: 0.5,
  });
  assert.deepEqual(Object.keys(rollout.byOpponent).sort(), ["golem-driver", "golem-fencer"]);
  assert.equal(rollout.boutsByOpponent["golem-driver"], rollout.boutsByOpponent["golem-fencer"],
    "each anchor gets its own slot in the cycle rather than half of one");
  assert.ok(rollout.boutsByOpponent["golem-fencer"] > 0);
  assert.equal(rollout.mirrorBouts + rollout.randomBouts, rollout.bouts);
  assert.ok(rollout.randomBouts > 0, "and half of them were not a mirror");
});

/** The anchor field is one name or a list of them, and a repeat is a typo rather than two slots. */
test("an_anchor_field_reads_as_a_list_however_many_names_it_holds", () => {
  assert.deepEqual(anchorList(null), []);
  assert.deepEqual(anchorList("golem-driver"), ["golem-driver"]);
  assert.deepEqual(anchorList("golem-driver,golem-fencer"), ["golem-driver", "golem-fencer"]);
  assert.deepEqual(anchorList(" golem-driver , golem-fencer "), ["golem-driver", "golem-fencer"]);
  assert.throws(() => anchorList("golem-driver,golem-driver"), /names golem-driver twice/);
  // The sentence the shipped module gets names every anchor the mind actually met, because a
  // reader told "golem-driver" about a mind that also sparred a fencer has been told something
  // false about what the weights in front of them were fitted against.
  assert.equal(
    opponentSentence({ taken: [8], exploiters: [] },
      { anchor: "golem-driver,golem-fencer", emphasise: [] }),
    "a league of 1 of its own past selves, golem-driver and golem-fencer");
});

// ------------------------ Session 02 of the signal set: the shape flags reach a league

/**
 * A league that names none of the shape flags builds the bytes it has always built.
 *
 * This is the half of the session that must not move anything. Five flags arrived here at once and
 * every one of them threads through `freshRole`, `contenderFor`, `trainRole` and the rating -- so
 * the claim that a league given none of them is the league it was is a claim about initial weights
 * and about the object a worker is handed, and both are checked here rather than inferred from a
 * run that happened to reproduce. `shape` being **null** at the shipped default is the mechanism:
 * a contender is the four fields it was, not a fifth one spelling out the shape everybody already
 * assumed.
 */
test("a_league_naming_no_shape_flag_builds_the_bytes_it_always_built", () => {
  assert.equal(LEAGUE_SHAPE.shape, null, "the shipped shape is carried by saying nothing about it");
  assert.deepEqual(LEAGUE_SHAPE.layout, POLICY_LAYOUT);
  assert.deepEqual(LEAGUE_SHAPE.valueLayout, LEAGUE_VALUE_LAYOUT);
  assert.equal(LEAGUE_SHAPE.features, 1, "version-1 columns, which is what every league here observed");
  assert.equal(LEAGUE_SHAPE.central, false);
  const role = freshRole(SEED);
  const shaped = freshRole(SEED, LEAGUE_SHAPE);
  assert.deepEqual(Array.from(shaped.weights), Array.from(role.weights), "the same draw from the same seed");
  assert.deepEqual(Array.from(shaped.valueWeights), Array.from(role.valueWeights));
  assert.deepEqual(contenderFor(role, false, null, LEAGUE_SHAPE), contenderFor(role, false, null),
    "a contender at the shipped shape carries no shape fields at all");
  assert.deepEqual(Object.keys(contenderFor(role)), ["pi", "logSigma", "normalisation", "sample"]);

  // And a shape that is not the shipped one moves all three, which is what says the threading is
  // real rather than a parameter nothing reads.
  const wide = policyShapeOf({ features: 2, head: "mixed", critic: "central", valueHidden: [32, 32] });
  assert.equal(wide.layout.inputs, 80);
  assert.equal(wide.valueLayout.inputs, 160, "a central critic reads this side's columns and then the other's");
  assert.deepEqual(wide.valueLayout.hidden, [32, 32]);
  assert.equal(freshRole(SEED, wide).weights.length, netSize(wide.layout));
  assert.equal(freshRole(SEED, wide).norm.mean.length, 80);
  assert.equal(contenderFor(freshRole(SEED, wide), false, null, wide).features, 2);
  assert.deepEqual(contenderFor(freshRole(SEED, wide), false, null, wide).layout, wide.layout);
});

/**
 * Each of the eight flags, given to the CLI once, read back off the header it wrote.
 *
 * A league had none of these and the sweep runner's whole premise is that a manifest's `common`
 * block reads across both scripts -- so before this session an arm whose `--head mixed` went to a
 * league ran a Gaussian head and said nothing about it. The run is one iteration of four bouts
 * because what is being tested is the parse and the record, not the fit.
 *
 * `features` is the field that was wrong rather than missing: it was written as
 * `PILOT_FEATURES_VERSION` -- the newest version this build publishes, 2 -- on every league ever
 * run, while `freshRole` built the main at `POLICY_LAYOUT`, which is version 1's width. The header
 * said 2 and the mind read 71 columns, which is a defect `scripts/sweep.mjs` already carries a
 * paragraph and a test about. It now says what the run ran.
 */
test("every_shape_flag_a_league_now_takes_is_recorded_in_its_header", { timeout: 600_000 }, () => {
  const dir = scratch();
  execFileSync(process.execPath, [
    "scripts/league.mjs", "--dir", join(dir, "flags"), "--iterations", "1", "--bouts", "4",
    "--exploiters", "0", "--evaluate", "0", "--shards", "1", "--cap", "3", "--workers", "2",
    "--features", "2", "--head", "mixed", "--sigma", "constant", "--critic", "central",
    "--value-hidden", "32,32", "--entropy-target", "1", "--entropy-rate", "0.1",
    "--opponent", "uniform",
  ], { stdio: "pipe" });
  const header = readLog(join(dir, "flags")).find((row) => row.type === "header");
  assert.equal(header.features, 2);
  assert.equal(header.head, "mixed");
  assert.equal(header.sigma, "constant");
  assert.equal(header.critic, "central");
  assert.equal(header.layout.inputs, 80, "version-2 columns reached the actor");
  assert.deepEqual(header.valueLayout, { inputs: 160, hidden: [32, 32], outputs: 1 },
    "--value-hidden reached the critic and --critic central doubled what it reads");
  assert.equal(header.entropyTarget, 1);
  assert.equal(header.entropyRate, 0.1);
  assert.deepEqual(header.opponentSchedule, [{ from: 0, value: "uniform" }],
    "--opponent is a one-stage --opponent-schedule, spelled as the trainer spells it");
  // And the default this session moved, which is in the same header and is the one number here
  // that changes what a run does.
  assert.deepEqual(header.entropySchedule, [{ from: 0, value: 0.0003 }]);
});

/**
 * The refusals a league now carries, each named for the run it would have saved.
 *
 * `--opponent` beside `--opponent-schedule` is this file's own rule twice over -- `--entropy` and
 * `--separation` already refuse their schedules -- and the reason is the same one: a header
 * carrying a scalar and a schedule cannot say which of them the iteration obeyed.
 */
test("a_league_refuses_a_scalar_opponent_beside_a_schedule_and_a_target_outside_the_band", () => {
  const dir = scratch();
  const run = (...flags) => execFileSync(process.execPath, [
    "scripts/league.mjs", "--dir", join(dir, "no"), "--iterations", "1", "--bouts", "4", ...flags,
  ], { stdio: "pipe" });
  assert.throws(() => run("--opponent", "uniform", "--opponent-schedule", "uniform:0"),
    /--opponent is a one-stage --opponent-schedule/);
  assert.throws(() => run("--entropy-target", "-3"), /which is\s+the entropy a Gaussian axis can hold/);
  assert.throws(() => run("--entropy-target", "1", "--entropy-anneal", "0.01:0"),
    /--entropy-target sets the coefficient and --entropy-anneal schedules it/);
  assert.throws(() => run("--entropy-target", "1", "--sigma", "state"),
    /--entropy-target reads the spread off logSigma/);
  assert.throws(() => run("--head", "softmax"), /--head softmax; this build reads gaussian, mixed and beta/);
  assert.throws(() => run("--features", "3"), /--features 3; this build reads 1 and 2/);
});
