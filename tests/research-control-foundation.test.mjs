import test from "node:test";
import assert from "node:assert/strict";
import { foundationJobs, foundationTrial, attackAccounting, proportion } from "../research/control-foundation-trials.mjs";
import { runFoundation, summarizeFoundation } from "../research/control-foundation.mjs";

test("foundation starts are reproducible, split-disjoint and explicit about unsupported equipment", () => {
  const options = { models: ["workshop-fighter"], samples: 3 };
  const a = foundationJobs(options), b = foundationJobs({ ...options, split: "held-out" });
  assert.deepEqual(a, foundationJobs(options));
  assert.equal(new Set(a.map((j) => j.id)).size, a.length);
  assert.ok(a.every((j) => !b.some((other) => other.id === j.id)));
  const seeds = new Set(a.map((j) => j.seed).filter((s) => s !== undefined));
  assert.ok(b.filter((j) => j.seed !== undefined).every((j) => !seeds.has(j.seed)));
  assert.equal(a.filter((j) => j.task === "unsupported").length, 2);
  assert.deepEqual([...new Set(a.filter((j) => j.task === "strike").map((j) => j.hand))], ["left", "right"]);
  assert.throws(() => foundationJobs({ from: 999999, samples: 2 }), /split/);
  assert.throws(() => foundationJobs({ hz: 0 }), /hz/);
  assert.throws(() => foundationJobs({ suite: "typo" }), /suite/);
});

test("preparation counts commitments, not frames in a swing or aborted approaches", () => {
  const meter = attackAccounting();
  for (const [phase, time] of [["approach", 1], ["place", 2], ["chamber", 4], ["swing", 5], ["swing", 6], [null, 7],
    ["approach", 8], [null, 9], ["settle", 10], ["swing", 12]]) meter.take(phase, time);
  assert.deepEqual(meter.preparations, [3, 2]);
  assert.deepEqual(proportion(0, 0), { successes: 0, count: 0, rate: null, interval95: null });
  const interval = proportion(1, 2);
  assert.equal(interval.rate, 0.5);
  assert.ok(interval.interval95[0] > 0 && interval.interval95[0] < 0.1 && interval.interval95[1] > 0.9);
  assert.throws(() => proportion(2, 1), /counts/);
});

test("a physical strike repeats on fresh worlds and a missing target does not score a hit", async () => {
  const jobs = foundationJobs({ models: ["workshop-fighter"], samples: 1 });
  const at = jobs.find((j) => j.task === "strike" && j.held === "club" && j.hand === "right" && j.target === "place");
  const miss = jobs.find((j) => j.task === "strike" && j.held === "club" && j.hand === "right" && j.target === "miss");
  const a = await foundationTrial(at), b = await foundationTrial(at), absent = await foundationTrial(miss);
  assert.deepEqual(a, b);
  assert.equal(a.status, "measured");
  assert.ok(a.outcome.usefulHit && a.outcome.done > 0 && a.physical.steps > 120);
  assert.equal(absent.outcome.usefulHit, false);
  assert.equal(absent.outcome.done, 0);
  assert.notEqual(a.physical.digest, absent.physical.digest);
  assert.ok(a.physical.maxJointAnchorSeparationMetres > 0);
  assert.equal(a.physical.assistForceIntegralNs, 0);
});

test("workers preserve task order, report unsupported tasks and terminate on a failed job", async () => {
  const jobs = foundationJobs({ suite: "bar", models: ["workshop-fighter"], samples: 1 });
  const rows = await runFoundation(jobs, { workers: 2 });
  assert.deepEqual(rows.map((r) => r.job), jobs);
  assert.ok(rows.every((r) => r.result.status === "unsupported"));
  const summary = summarizeFoundation(rows);
  assert.deepEqual(summary.cells.map((c) => [c.measured, c.unsupported, c.success]), [[0, 1, null], [0, 1, null]]);
  await assert.rejects(runFoundation([{ task: "unknown" }], { workers: 1 }), /unknown foundation task/);
});

test("guard differences compare the same side and start and recovery excludes shoves held", () => {
  const outcome = (damage) => ({ seconds: 10, sides: [{ headDamage: damage, damage: damage + 1, fallen: false }, { headDamage: 8, damage: 9, fallen: true }] });
  const job = { model: "workshop-fighter", held: "club", seed: 4, hz: 120, task: "bout" };
  const rows = [
    { job: { ...job, guard: "pose" }, result: { status: "measured", outcome: outcome(4) } },
    { job: { ...job, guard: "left-cover" }, result: { status: "measured", outcome: outcome(1) } },
    ...[{ fell: true, risen: true, up: true }, { fell: true, risen: true, up: false }, { fell: false }].map((o) =>
      ({ job: { ...job, task: "recovery" }, result: { status: "measured", outcome: o } })),
  ];
  const summary = summarizeFoundation(rows);
  assert.deepEqual(summary.pairedGuard, [{ pair: "workshop-fighter/club/4/120", guard: "left-cover", headDamageSaved: 3,
    damageSaved: 3, poseFallen: false, coverFallen: false, poseSeconds: 10, coverSeconds: 10 }]);
  assert.equal(summary.cells.at(-1).success.count, 2);
  assert.equal(summary.cells.at(-1).success.successes, 1);
});
