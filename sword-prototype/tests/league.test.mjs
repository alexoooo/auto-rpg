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
// **Twelve mutations were watched red on 2026-09-08**, each applied alone and then restored.
// The first eight are in `scripts/league.mjs` and the last four in `scripts/rate-snapshots.mjs`:
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
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  LEAGUE_VALUE_LAYOUT, MAIN_NAME, SELF_NAME, contenderFor, copyRole, emphasisedPool,
  exploiterName, exploiterStalled, freshRole, leagueMatrix, leaguePairs, loadLeague, matrixBreaks,
  poolLoader, poolName, poolPath, roleFromCheckpoint, roleFromJson, roleToJson, saveLeague,
  shareOf, spreadSlots,
  statePath, thinPool, trainRole,
} from "../scripts/league.mjs";
import { armedTerminal, buildPool } from "../scripts/tournament.mjs";
import { formatIdleProbe, idleProbe } from "../scripts/idle-probe.mjs";
import {
  boutsPerOpponent, chosenSnapshots, formatRow, snapshotIterations,
} from "../scripts/rate-snapshots.mjs";
import { POLICY_LAYOUT, POLICY_VERSION } from "../src/golem/policy.ts";
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
  // A silent filter here is a morning spent rating nothing, so a missing iteration is an error
  // rather than an empty list, and the message names the iteration that is missing.
  assert.throws(() => chosenSnapshots([8, 16, 24], "8,12"), /no snapshot for iteration 12/);

  // The budget is stated a contender and spent over the five hand-coded opponents, mirrored -- so
  // the per-opponent count is the fifth rounded up to an even number, and never below one pair.
  assert.equal(boutsPerOpponent(200, ["a", "b", "c", "d", "e"]), 40);
  assert.equal(boutsPerOpponent(201, ["a", "b", "c", "d", "e"]), 42, "a budget that does not divide rounds up");
  assert.equal(boutsPerOpponent(1, ["a", "b", "c", "d", "e"]), 2, "a rating is mirrored, so two is the floor");
});

test("a rating row prints both baselines with their intervals and the fit's record", () => {
  const line = formatRow({
    iteration: 16, bouts: 40, per: [],
    uniform: { bar: 0.1254, sem: 0.0416 / 1.96, d: 0.302 },
    driver: { bar: -0.0847, sem: 0.0409 / 1.96, d: -0.207 },
    fit: { wins: 57, draws: 279, losses: 54 },
  });
  assert.match(line, /^ {5}16: uniform \+0\.1254 ±0\.0416 d \+0\.302/, "the iteration, the margin and its interval");
  assert.match(line, /driver −0\.0847 ±0\.0409 d −0\.207/, "a negative margin prints a minus sign and not a hyphen");
  assert.match(line, /w\/d\/l 57\/279\/54$/, "the record the margin came from");
});
