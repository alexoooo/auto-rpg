/**
 * The side-mirror gate (`research/side-mirror.mjs`), in the suite at a small n.
 *
 * The full-n row is the research script's (`docs/analysis/2026-09-25-side-mirror.md`). What runs
 * here is the instrument's arithmetic on fixtures, and then real mirrors: a shipped mind whose
 * mirror is inside its band, beside a control the gate must fail -- a mirror the side decides.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  CHECKPOINTS, SIDE_DECIDED, fairBand, leftScore, mirrorJobs, mirrorVerdict, refuseSideDecided,
} from "../research/side-mirror.mjs";
import { PROTOCOL } from "../research/schedule.mjs";
import { PROBE_MINDS } from "../research/stat-sweep.mjs";
import { LADDER } from "./harness/drills.mjs";
import { policyMind } from "../src/mind.ts";

/**
 * Seed pairs in the fair real mirror below: 4 bouts, a band of 49 points, so only a mirror the side
 * decides outright fails. That is what a suite run on a loaded box can afford; the full-n gate is the
 * research script's.
 */
const SMALL_BLOCKS = 2;

/** A finished bout for a job, on a trajectory of its own unless one is named. */
const row = (job, winner, trajectory = `${job.id}`) => ({
  ...job, status: "ok", winner, ending: winner === null ? "time" : "exhausted", seconds: 20,
  vitality: [winner === "left" ? 0.5 : 0, winner === "right" ? 0.5 : 0], damage: [1, 1], hits: [3, 3],
  trajectory, prefixes: Object.fromEntries(CHECKPOINTS.map((t) => [t, `${trajectory}@${t}`])),
});

test("a mirror block is one seed pair played both ways round, each side seeded from its own seed", () => {
  const jobs = mirrorJobs({ minds: ["golem-duelist", "golem-reaper"], blocks: 5, runSeed: 7 });
  assert.equal(jobs.length, 2 * 5 * 2);
  const blocks = Map.groupBy(jobs, (job) => job.block);
  assert.equal(blocks.size, 10);
  for (const [key, [ab, ba]] of blocks) {
    assert.equal(ab.left, ab.right, `${key} is a mirror`);
    assert.notEqual(ab.seeds[0], ab.seeds[1], `${key}: the two sides must not share a stream`);
    assert.deepEqual(ba.seeds, [ab.seeds[1], ab.seeds[0]], `${key}: the second half swaps the seeds between the sides`);
  }
  assert.equal(new Set(jobs.flatMap((job) => job.seeds)).size, 2 * 10, "no seed repeats across blocks or minds");
  assert.deepEqual(mirrorJobs({ minds: ["golem-duelist"], blocks: 2, runSeed: 7 }),
    jobs.filter((job) => job.mind === "golem-duelist" && Number(job.block.split("/")[1]) < 2).map((job) => ({ ...job })),
    "a mind's seeds do not depend on which other minds ran");
  assert.throws(() => mirrorJobs({ minds: ["idle", "idle"], blocks: 1, runSeed: 7 }), /twice/);
});

test("the gate passes a mirror the seeds decide and fails one the side decides", () => {
  const jobs = mirrorJobs({ minds: ["m"], blocks: 64, runSeed: 3 });
  // The seed decides: the mind seeded `a` wins on whichever side it stands.
  const bySeed = mirrorVerdict(jobs.map((job) => row(job, job.half === "ab" ? "left" : "right")));
  assert.equal(bySeed.distinct, 128);
  assert.equal(bySeed.share, 0.5);
  assert.equal(bySeed.verdict, "pass");
  assert.deepEqual(bySeed.byBlock, { side: 0, seed: 64, drawn: 0 });
  // The side decides three bouts in four: 75 % is 25 points off, against a band of 8.7.
  const bySide = mirrorVerdict(jobs.map((job, i) => row(job, i % 4 === 3 ? "right" : "left")));
  assert.equal(bySide.share, 0.75);
  assert.ok(Math.abs(bySide.band - fairBand(128)) < 1e-12 && bySide.band < 0.09);
  assert.equal(bySide.verdict, "fail");
  assert.deepEqual(bySide.byBlock, { side: 32, seed: 32, drawn: 0 });
  // Just inside and just outside the band at 128 distinct bouts, on the right side as well.
  const near = (k) => mirrorVerdict(jobs.map((job, i) => row(job, i < k ? "left" : "right")));
  assert.equal(near(64 - 11).verdict, "pass", "8.6 points off");
  assert.equal(near(64 - 12).verdict, "fail", "9.4 points off");
  assert.equal(near(64 + 11).verdict, "pass");
  assert.equal(near(64 + 12).verdict, "fail");
});

test("a mirror's band comes from its distinct bouts, not from how many times they were played", () => {
  const jobs = mirrorJobs({ minds: ["m"], blocks: 64, runSeed: 3 });
  // Sixteen distinct bouts, each played eight times; 11 of the 16 go left (68.8 %).
  const clustered = jobs.map((job, i) => row(job, i % 16 < 11 ? "left" : "right", `t${i % 16}`));
  const verdict = mirrorVerdict(clustered);
  assert.equal(verdict.bouts, 128);
  assert.equal(verdict.distinct, 16);
  assert.equal(verdict.band, fairBand(16));
  assert.equal(verdict.verdict, "pass", "18.8 points off is inside a 16-bout band of 24.5");
  // The same shares counted as 128 independent bouts would have failed: the collapse is load-bearing.
  const inflated = mirrorVerdict(jobs.map((job, i) => row(job, i % 16 < 11 ? "left" : "right")));
  assert.equal(inflated.distinct, 128);
  assert.equal(inflated.verdict, "fail");
  // Every checkpoint counts sixteen openings.
  for (const t of CHECKPOINTS) assert.equal(verdict.openings[t], 16);

  // One decisive bout, played 128 times: the seeds reach nothing, so the side is all that decides it.
  const one = mirrorVerdict(jobs.map((job) => row(job, "right", "only")));
  assert.equal(one.distinct, 1);
  assert.equal(one.verdict, "fail");
  // One drawn bout, played 128 times: nothing is decided, so there is nothing for a side to decide.
  const idle = mirrorVerdict(jobs.map((job) => row(job, null, "only")));
  assert.equal(idle.distinct, 1);
  assert.equal(idle.share, 0.5);
  assert.equal(idle.verdict, "pass");
  assert.equal(leftScore({ winner: null }), 0.5);
});

// ---------------------------------------------------------------------------------------------
// Real mirrors, at a small n. Node bout runner, research PROTOCOL, default build on both sides.

const RUN_SEED = 20260925;

/** A mind's mirror over `blocks` seed pairs, one bout after another in this realm. */
async function smallMirror(mind, blocks, options = {}) {
  const { playMirror } = await import("../research/side-mirror-worker.mjs");
  const rows = [];
  for (const job of mirrorJobs({ minds: [mind], blocks, runSeed: RUN_SEED })) {
    rows.push(await playMirror(job, { protocol: PROTOCOL }, options));
  }
  return mirrorVerdict(rows);
}

/**
 * The registered mind, except that on `side` it reacts a quarter of a second late: it decides every
 * thirtieth control step (120 Hz) and holds that command in between. Each side keeps its own seed.
 * The miser's own mirror leans left (59.7 and 59.2 % on two full-n runs), so the late side here is
 * the left: the control has to beat that lean to fail the gate. On these seeds the late left lost
 * all eight of four blocks, in 7 to 17 s (Node bout runner, 2026-09-25); the duelist late on the
 * right also lost all eight, but its bouts run 19 to 66 s.
 *
 * Clearing the `thrust` buttons on one side is not a handicap and was tried first: over eight seed
 * pairs the duelist's mirror with them cleared played the same sixteen bouts, winners and lengths,
 * as with them untouched. The duelist does not strike through them.
 */
const lateOn = (side) => (name, seed, at) => {
  const mind = policyMind(name, seed);
  if (at !== side) return mind;
  let held = null, calls = 0;
  return { name: mind.name, decide(view, dt) {
    if (calls++ % 30 === 0) held = mind.decide(view, dt);
    return held;
  } };
};

test("a shipped mind's mirror is not decided by side, and a mirror with one side late is", async () => {
  const fair = await smallMirror("golem-champion", SMALL_BLOCKS);
  assert.equal(fair.distinct, 2 * SMALL_BLOCKS, "every bout its own trajectory: the seeds reach the bout");
  assert.equal(fair.verdict, "pass", `left ${fair.share} against a band of ${fair.band}`);
  // The control: the detector finding a side on real bouts at this n. Six bouts, a band of 40 points,
  // so all six to one side is needed.
  const handicapped = await smallMirror("golem-miser", 3, { makeMind: lateOn("left") });
  assert.equal(handicapped.distinct, 6);
  assert.equal(handicapped.verdict, "fail", `left ${handicapped.share} against a band of ${handicapped.band}`);
  assert.ok(handicapped.share < 0.5, "and it is the late side that loses");
});

test("a mind listed as side-decided still is, and nothing that measures minds measures against one", async () => {
  for (const name of Object.keys(SIDE_DECIDED)) {
    // Each side's mind is built from its own side's seed; recorded here, on the bouts that run anyway.
    const built = [];
    const recorded = (mind, seed, side) => { built.push({ side, seed }); return policyMind(mind, seed); };
    const verdict = await smallMirror(name, 1, { makeMind: recorded });
    assert.equal(verdict.verdict, "fail", `${name} is listed as side-decided and its mirror no longer is: re-measure it and take it off the list`);
    const jobs = mirrorJobs({ minds: [name], blocks: 1, runSeed: RUN_SEED });
    assert.deepEqual(built, jobs.flatMap((job) => [{ side: "left", seed: job.seeds[0] }, { side: "right", seed: job.seeds[1] }]));
  }
  for (const name of [...PROBE_MINDS, ...LADDER]) assert.ok(!Object.hasOwn(SIDE_DECIDED, name), `${name} is side-decided`);
  assert.throws(() => refuseSideDecided(["golem-duelist", "golem-guardian"]), /golem-guardian/);
  assert.doesNotThrow(() => refuseSideDecided([...PROBE_MINDS, ...LADDER]));
  // The two scripts that compare minds refuse a listed one in their `main`, which no test runs.
  for (const [file, call] of [["stat-sweep.mjs", /refuseSideDecided\(minds, /], ["league.mjs", /refuseSideDecided\(\[a, b\], /]]) {
    const text = await readFile(new URL(`../research/${file}`, import.meta.url), "utf8");
    assert.match(text, call, `research/${file} no longer refuses a side-decided mind`);
  }
});
