import test from "node:test";
import assert from "node:assert/strict";

import {
  PROBE_MINDS,
  blocksOf,
  cohensD,
  modifiedMargin,
  modifiedScore,
  summarizeSweep,
  sweepJobs,
  sweepLevels,
} from "../research/stat-sweep.mjs";

const BASE = Object.freeze({ locomotion: "locomotion.biped", torso: "torso.plain", head: "head.plain",
  primary: { chain: "wrist", terminal: "blade" }, secondary: { chain: "wrist", terminal: "plate" } });

/** A finished bout for a job: who won, and each side's final bar. */
const row = (job, winner, vitality, extra = {}) => ({
  ...job, status: "ok", winner, ending: winner === null ? "time" : "exhausted", seconds: 40,
  vitality, sides: { left: { damage: 1 }, right: { damage: 2 } }, ...extra,
});

test("a stat sweep's levels carry the stat explicitly, x1 included, and x1 is the control", () => {
  const levels = sweepLevels({ kind: "stat", stat: "movement" }, BASE, [0.9, 1, 1.25]);
  assert.deepEqual(levels.map((l) => [l.key, l.control]), [["x0.90", false], ["x1.00", true], ["x1.25", false]]);
  assert.deepEqual(levels[1].setup.attributes, { movement: 1 }, "the null row runs the same setup path");
  assert.equal(BASE.attributes, undefined, "the base build was not written into");
  assert.throws(() => sweepLevels({ kind: "stat", stat: "reach" }, BASE, [1]), /no attribute "reach"/);
  assert.throws(() => sweepLevels({ kind: "stat", stat: "movement" }, BASE, [1, 1]), /twice/);
  assert.throws(() => sweepLevels({ kind: "stat", stat: "movement" }, BASE, [0]), /positive/);

  const edge = sweepLevels({ kind: "edge", build: "wheel" }, BASE, [], () => ({ ...BASE, locomotion: "locomotion.wheel" }));
  assert.deepEqual(edge.map((l) => [l.key, l.control]), [["control", true], ["edge:wheel", false]]);
  assert.equal(edge[0].setup, BASE);
});

test("each block is one mind pair on one seed pair, played with the modified corner on each side", () => {
  const levels = sweepLevels({ kind: "stat", stat: "movement" }, BASE, [1, 1.25]);
  const jobs = sweepJobs({ levels, blocks: 20, minds: PROBE_MINDS, runSeed: 7 });
  assert.equal(jobs.length, 2 * 20 * 2);
  assert.equal(new Set(jobs.map((j) => j.id)).size, jobs.length);

  for (const job of jobs) {
    const [modifiedMind, otherMind] = job.minds;
    assert.equal(job[job.modified], modifiedMind, "the modified mind plays the modified side");
    assert.equal(job[job.modified === "left" ? "right" : "left"], otherMind);
    assert.equal(job[`${job.modified}Build`], job.level, "and drives the modified body");
    assert.equal(job[`${job.modified === "left" ? "right" : "left"}Build`], "base");
  }
  const halves = new Map();
  for (const job of jobs) halves.set(job.block, [...(halves.get(job.block) ?? []), job]);
  for (const [block, [a, b]] of halves) {
    assert.deepEqual([a.modified, b.modified].sort(), ["left", "right"], block);
    assert.deepEqual(a.seeds, [...b.seeds].reverse(), "each corner keeps its own seed across the swap");
    assert.notEqual(a.seeds[0], a.seeds[1], "the two minds never share a stream");
  }
  const at = (level) => jobs.filter((j) => j.level === level).map(({ pair, modified, seeds, left, right }) =>
    ({ pair, modified, seeds, left, right }));
  assert.deepEqual(at("x1.25"), at("x1.00"), "every level plays the same blocks, so it can pair with the control");
  assert.equal(new Set(jobs.filter((j) => j.level === "x1.00").map((j) => j.minds.join())).size, 16,
    "sixteen blocks reach every ordered pair of the four minds");
});

test("the modified corner's score and margin read the side it was on", () => {
  const job = { modified: "right" };
  assert.equal(modifiedScore({ ...job, winner: "right" }), 1);
  assert.equal(modifiedScore({ ...job, winner: "left" }), 0);
  assert.equal(modifiedScore({ ...job, winner: null }), 0.5);
  assert.equal(modifiedMargin({ ...job, vitality: [0.25, 0.75] }), 0.5);
  assert.equal(modifiedMargin({ modified: "left", vitality: [0.25, 0.75] }), -0.5);
});

test("Cohen's d is the mean over the sample standard deviation", () => {
  // mean 0.2, deviations -0.1 0 0.1 0.2 -0.2, sum of squares 0.1, over n-1 = 4: sd 0.158113883
  assert.ok(Math.abs(cohensD([0.1, 0.2, 0.3, 0.4, 0]) - 0.2 / Math.sqrt(0.1 / 4)) < 1e-12);
  assert.ok(Math.abs(cohensD([0.1, 0.2, 0.3, 0.4, 0]) - 1.2649110640673518) < 1e-12);
  assert.equal(cohensD([0.3]), null, "one block has no spread");
  assert.equal(cohensD([0.3, 0.3]), null, "no spread, no d");
});

test("a block's margin cancels side, its win rate counts draws as half, and it pairs with its control", () => {
  const levels = sweepLevels({ kind: "stat", stat: "movement" }, BASE, [1, 1.25]);
  const jobs = sweepJobs({ levels, blocks: 2, minds: ["a", "b"], runSeed: 1 });
  const find = (level, pair, modified) => jobs.find((j) => j.level === level && j.pair === pair && j.modified === modified);
  const [p0, p1] = [...new Set(jobs.map((j) => j.pair))];
  const rows = [
    // Control, block p0: the left side wins both halves -- pure side bias, a margin of 0.
    row(find("x1.00", p0, "left"), "left", [0.8, 0.2]),
    row(find("x1.00", p0, "right"), "left", [0.8, 0.2]),
    // Control, block p1: a draw and a loss.
    row(find("x1.00", p1, "left"), null, [0.5, 0.5]),
    row(find("x1.00", p1, "right"), "left", [0.6, 0.4]),
    // x1.25, block p0: the modified corner wins on both sides.
    row(find("x1.25", p0, "left"), "left", [0.9, 0.3]),
    row(find("x1.25", p0, "right"), "right", [0.1, 0.7]),
    // x1.25, block p1: it wins on the right, loses on the left.
    row(find("x1.25", p1, "left"), "right", [0.2, 0.4]),
    row(find("x1.25", p1, "right"), "right", [0.3, 0.5]),
  ];
  const [control, raised] = summarizeSweep(rows, levels);

  assert.equal(control.bouts, 4);
  assert.equal(control.winRate.mean, (0.5 + (0.5 + 0) / 2) / 2);
  assert.deepEqual(control.bySide, { left: (1 + 0.5) / 2, right: 0 });
  assert.equal(control.draws, 1);
  // p0: (0.6 + -0.6) / 2 = 0; p1: (0 + -0.2) / 2 = -0.1
  assert.ok(Math.abs(control.margin.mean - -0.05) < 1e-12);
  assert.equal(control.vsControl, undefined, "the control is not paired with itself");

  assert.equal(raised.winRate.mean, (1 + 0.5) / 2);
  // p0: (0.6 + 0.6) / 2 = 0.6; p1: (-0.2 + 0.2) / 2 = 0
  assert.ok(Math.abs(raised.margin.mean - 0.3) < 1e-12);
  // Paired against the control block by block: 0.6 - 0 and 0 - -0.1.
  assert.ok(Math.abs(raised.vsControl.mean - 0.35) < 1e-12);
  assert.ok(Math.abs(raised.vsControl.d - cohensD([0.6, 0.1])) < 1e-12);
  assert.ok(Math.abs(raised.margin.d - cohensD([0.6, 0])) < 1e-12);
  assert.equal(raised.dealt, (2 + 1 + 2 + 1) / 4, "damage dealt is the modified side's own");
  assert.deepEqual(Object.keys(raised.byMinds).sort(), ["a vs a", "a vs b"]);
});

test("knockdowns, time down and severs are each corner's own, and a corpus without them reports none", () => {
  const levels = sweepLevels({ kind: "stat", stat: "stability" }, BASE, [1]);
  const jobs = sweepJobs({ levels, blocks: 1, minds: ["a"], runSeed: 5 });
  const sides = (left, right) => ({
    left: { damage: 1, knockdowns: left[0], downSeconds: left[1], severs: left[2] },
    right: { damage: 2, knockdowns: right[0], downSeconds: right[1], severs: right[2] },
  });
  // The modified corner goes down 3 times for 8 s on the left and once for 4 s on the right; the
  // other corner 0 and 2 times. Each bout is 40 s. The modified corner loses 2 modules and then 0,
  // the other 1 and then 3.
  const rows = [
    row(jobs.find((j) => j.modified === "left"), "right", [0.2, 0.6], { sides: sides([3, 8, 2], [0, 0, 1]) }),
    row(jobs.find((j) => j.modified === "right"), "left", [0.7, 0.1], { sides: sides([2, 6, 3], [1, 4, 0]) }),
  ];
  const [level] = summarizeSweep(rows, levels);
  assert.deepEqual(level.down, {
    knockdowns: (3 + 1) / 2, otherKnockdowns: (0 + 2) / 2,
    share: (8 / 40 + 4 / 40) / 2, otherShare: (0 / 40 + 6 / 40) / 2,
  });
  assert.deepEqual(level.severs, { mine: (2 + 0) / 2, other: (1 + 3) / 2 });
  const old = rows.map((r, i) => i === 0 ? { ...r, sides: { left: { damage: 1 }, right: { damage: 2 } } } : r);
  assert.equal(summarizeSweep(old, levels)[0].down, undefined, "one row without the count and the level has none");
  assert.equal(summarizeSweep(old, levels)[0].severs, undefined, "and the same for severs");
});

test("swapping which corner is marked modified mirrors the win rate and the margin", () => {
  const levels = sweepLevels({ kind: "stat", stat: "movement" }, BASE, [1]);
  const jobs = sweepJobs({ levels, blocks: 3, minds: ["a", "b"], runSeed: 3 });
  const outcomes = [["left", [0.9, 0.1]], ["right", [0.3, 0.6]], [null, [0.4, 0.4]], ["left", [0.7, 0.0]],
    ["left", [0.5, 0.2]], ["right", [0.1, 0.8]]];
  const rows = jobs.map((job, i) => row(job, ...outcomes[i]));
  const flipped = rows.map((r) => ({ ...r, modified: r.modified === "left" ? "right" : "left" }));
  const [a] = summarizeSweep(rows, levels), [b] = summarizeSweep(flipped, levels);
  assert.ok(Math.abs(a.winRate.mean + b.winRate.mean - 1) < 1e-12);
  assert.ok(Math.abs(a.margin.mean + b.margin.mean) < 1e-12);
  assert.notEqual(a.margin.mean, 0, "the fixture has a margin to mirror");
});

test("a half-played block is refused rather than scored as a whole one", () => {
  const levels = sweepLevels({ kind: "stat", stat: "movement" }, BASE, [1]);
  const [first] = sweepJobs({ levels, blocks: 1, minds: ["a"], runSeed: 3 });
  assert.throws(() => blocksOf([row(first, "left", [1, 0])]), /incomplete side-swap block/);
  assert.throws(() => blocksOf([row(first, "left", [1, 0]), row(first, "left", [1, 0])]), /two left halves/);
});

test("the summary does not depend on the order the workers finished in", () => {
  const levels = sweepLevels({ kind: "stat", stat: "movement" }, BASE, [1]);
  const jobs = sweepJobs({ levels, blocks: 24, minds: ["a", "b"], runSeed: 5 });
  const rows = jobs.map((job, i) => row(job, i % 3 === 0 ? "left" : "right", [(i % 7) / 7, (i % 5) / 5]));
  const shuffled = [...rows].sort((a, b) => a.seeds[0] - b.seeds[0]);
  assert.notDeepEqual(shuffled.map((r) => r.id), rows.map((r) => r.id), "the fixture really was reordered");
  assert.deepEqual(summarizeSweep(shuffled, levels), summarizeSweep(rows, levels));
});
