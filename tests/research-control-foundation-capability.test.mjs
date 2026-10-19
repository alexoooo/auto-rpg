/**
 * **How well the control foundation's controllers do** (`research/control-foundation.mjs`),
 * measured and not a gate (`tests/experimental.json`): each trial's success, and the speeds and
 * reaches its competencies read (Node, Rapier, 120 Hz unless a job says otherwise).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { foundationJobs, foundationTrial } from "../research/control-foundation-trials.mjs";
import { runFoundation, summarizeFoundation } from "../research/control-foundation.mjs";

test("support entry's worker watch starts after its physical fall bootstrap", () => {
  const directory = mkdtempSync(join(tmpdir(), "foundation-entry-"));
  try {
    execFileSync(process.execPath, ["research/control-foundation.mjs", "--suite", "support-entry", "--models", "workshop-fighter",
      "--workers", "1", "--actuation", "directional", "--out", directory],
    { env: { ...process.env, CORE_ENGINE: "rapier-coordinate-coulomb" }, timeout: 120000, stdio: "pipe" });
    const rows = readFileSync(join(directory, "rows.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(rows.length, 4);
    const failed = rows.find((r) => r.job.direction === 1).result.outcome;
    assert.equal(failed.complete, true); assert.equal(failed.steps, 4800); assert.equal(failed.success, false);
    assert.ok(rows.every((r) => r.result.outcome.replayExact));
    assert.equal(rows.filter((r) => r.result.outcome.success).length, 3);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("defense trials keep hand/loadout denominators and pair physical protection against pose", async () => {
  const jobs = foundationJobs({ suite: "defense", models: ["workshop-fighter"], samples: 1, actuation: "directional" });
  assert.equal(jobs.length, 12);
  assert.deepEqual([...new Set(jobs.map((j) => j.hands))], ["left", "right", "both"]);
  assert.deepEqual([...new Set(jobs.map((j) => j.held))], ["empty", "club"]);
  const rows = await runFoundation(jobs.slice(0, 2), { workers: 2 });
  assert.ok(rows.every((r) => r.result.outcome.replayExact && r.result.outcome.steps === 1200));
  const [prediction, pose] = rows.map((r) => r.result.outcome);
  assert.equal(prediction.success, true); assert.ok(pose.protectedImpulse > prediction.protectedImpulse);
  const summary = summarizeFoundation(rows);
  assert.equal(summary.cells.length, 2);
  assert.ok(summary.cells.every((c) => c.success.count === 1));
  assert.equal(summary.pairedDefense.length, 1);
  assert.equal(summary.pairedDefense[0].protectedImpulseSavedNs, pose.protectedImpulse - prediction.protectedImpulse);
});

test("the common runner hosts both reach controllers and keeps their denominators separate", async () => {
  const jobs = foundationJobs({ suite: "reach", models: ["workshop-fighter"], samples: 1, actuation: "directional" });
  assert.deepEqual(jobs.map((j) => [j.controller, j.policyPeriodSteps, j.hz, j.held]), [["actuator", 4, 120, "empty"], ["layered", 4, 120, "empty"]]);
  assert.throws(() => foundationJobs({ suite: "reach", hz: 480 }), /120/);
  const rows = await runFoundation(jobs, { workers: 2 });
  assert.ok(rows.every((r) => r.result.outcome.terminated && !r.result.outcome.truncated && r.result.outcome.invalid === null));
  assert.deepEqual(rows[0].result.outcome.goal, rows[1].result.outcome.goal);
  assert.notEqual(rows[0].result.outcome.observationDigest, rows[1].result.outcome.observationDigest);
  const summary = summarizeFoundation(rows);
  assert.equal(summary.cells.length, 2);
  assert.ok(summary.cells.every((c) => c.success.successes === 1 && c.success.count === 1));
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
  const directional = await foundationTrial({ ...at, actuation: "directional" });
  assert.notEqual(directional.physical.digest, a.physical.digest, "the selected actuator law reaches the physical fixture");
});

test("the common bar runner measures each release separately and replays its loaded branch", async () => {
  const jobs = foundationJobs({ suite: "bar", models: ["workshop-fighter"], samples: 1, actuation: "directional" });
  assert.deepEqual(jobs.map((j) => [j.held, j.release]), [["shared-club", "left"], ["shared-club", "right"]]);
  const rows = await runFoundation(jobs, { workers: 2 });
  assert.ok(rows.every((r) => r.result.outcome.success && r.result.outcome.replayExact));
  assert.ok(rows.every((r) => r.result.physical.assistForceIntegralNs === 0));
  assert.deepEqual(summarizeFoundation(rows).cells.map((c) => [c.success.successes, c.success.count]), [[1, 1], [1, 1]]);
});

test("standing bar trials have separate denominators and enforce physical support gates", async () => {
  const options = { suite: "bar", models: ["workshop-fighter"], samples: 1, actuation: "directional" };
  const jobs = foundationJobs({ ...options, support: "standing" });
  assert.throws(() => foundationJobs({ ...options, support: "unknown" }), /support/);
  assert.ok(jobs.every((j, i) => j.support === "standing" && j.id !== foundationJobs(options)[i].id));
  const rows = await runFoundation(jobs, { workers: 2 });
  assert.ok(rows.every((r) => r.result.outcome.success && !r.result.outcome.fell && r.result.outcome.rejectedSteps === 0));
  assert.ok(rows.every((r) => r.result.configuration.pin === null && r.result.outcome.replayExact));
  const summary = summarizeFoundation([...rows, ...rows.map((r) => ({ ...r, job: { ...r.job, support: "pinned" } }))]);
  assert.equal(summary.cells.length, 4);
  assert.ok(summary.cells.every((c) => c.success.count === 1));
});

test("the common runner preserves side-specific support outcomes and replay", async () => {
  const jobs = foundationJobs({ suite: "support", models: ["crypt-skeleton"], samples: 1, actuation: "directional" });
  assert.deepEqual(jobs.map((j) => j.side), ["left", "right"]);
  const rows = await runFoundation(jobs, { workers: 2 });
  assert.ok(rows.every((r) => r.result.outcome.success && r.result.outcome.replayExact));
  assert.deepEqual(summarizeFoundation(rows).cells.map((c) => [c.success.successes, c.success.count]), [[1, 1], [1, 1]]);
});

test("point-strike trials separate hands, loadouts and intentional misses", async () => {
  const jobs = foundationJobs({ suite: "point-strike", models: ["workshop-fighter"], samples: 1, actuation: "directional" });
  assert.equal(jobs.length, 12);
  assert.equal(new Set(jobs.map((j) => j.id)).size, 12);
  const selected = jobs.filter((j) => j.hands === "both" && j.held === "club");
  const rows = await runFoundation(selected, { workers: 2 });
  assert.ok(rows.every((r) => r.result.outcome.success && r.result.outcome.replayExact));
  assert.ok(rows[0].result.outcome.strikes.every((s) => s.contacts > 0));
  assert.ok(rows[1].result.outcome.strikes.every((s) => s.contacts === 0));
  assert.deepEqual(summarizeFoundation(rows).cells.map((c) => [c.success.successes, c.success.count]), [[1, 1], [1, 1]]);
});

test("the CLI records the corrected Rapier profile used by its physical workers", () => {
  const directory = mkdtempSync(join(tmpdir(), "foundation-coordinate-"));
  try {
    execFileSync(process.execPath, ["research/control-foundation.mjs", "--suite", "bar", "--models", "crypt-skeleton",
      "--samples", "1", "--workers", "1", "--support", "standing", "--actuation", "directional", "--joint-stops", "--out", directory],
    { env: { ...process.env, CORE_ENGINE: "rapier-coordinate" }, timeout: 120000, stdio: "pipe" });
    const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
    const rows = readFileSync(join(directory, "rows.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(manifest.engine, "rapier-coordinate");
    assert.ok(manifest.engineRevision.endsWith("/coordinate-limits"));
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(row.result.configuration.engineRevision, manifest.engineRevision);
      assert.equal(row.result.outcome.replayExact, true);
      assert.equal(row.result.outcome.releaseContinuous, true);
      assert.equal(row.result.outcome.success, true);
      assert.equal(row.result.configuration.jointStops, true);
      assert.equal(row.result.physical.stops.steps, row.result.outcome.steps);
      assert.equal(row.result.physical.stops.rejectedSteps, 0);
      assert.ok(row.result.physical.stops.nearSteps > 0);
      assert.ok(row.result.physical.stops.peakAccelerationViolation < row.result.configuration.stopPrediction.accelerationTolerance);
    }
  } finally {
    const target = realpathSync(directory);
    assert.equal(dirname(target), realpathSync(tmpdir()));
    assert.ok(basename(target).startsWith("foundation-coordinate-"));
    rmSync(target, { recursive: true, force: true });
  }
});

test("competency trials replay on fresh worlds, and a miss lands nothing a hit lands", async () => {
  const jobs = foundationJobs({ suite: "competency", models: ["workshop-fighter"], samples: 1 });
  const pick = [jobs.find((j) => j.competency === "stand" && j.level === 0.3 && j.held === "empty"),
    jobs.find((j) => j.competency === "walk" && j.trial === "walk" && j.speed === 0.3 && j.held === "club"),
    jobs.find((j) => j.competency === "punch" && j.hand === "right" && j.placement === "place" && j.mode === "hit"),
    jobs.find((j) => j.competency === "punch" && j.hand === "right" && j.mode === "miss")];
  const [a, b] = await Promise.all([runFoundation(pick, { workers: 4 }), runFoundation(pick, { workers: 4 })]);
  assert.deepEqual(a.map((r) => r.result.outcome), b.map((r) => r.result.outcome));
  const [stand, walk, hit, miss] = a.map((r) => r.result.outcome);
  assert.ok(stand.success && !stand.fell);
  assert.ok(walk.success && !walk.fell && walk.along > 0.2 && walk.along < 0.4, `walked ${walk.along}`);
  assert.ok(hit.success && hit.landed > 0 && hit.landed <= hit.blows && hit.speeds.length === hit.landed, JSON.stringify(hit));
  // The planted cross at its own cell reads 4.4 to 5 m/s over its last 10 cm (docs/reference/competencies.md#baseline).
  assert.ok(hit.speeds.every((v) => v > 4 && v < 5.5) && hit.firstContactSeconds > 0.25 && hit.firstContactSeconds < 0.5, JSON.stringify(hit.speeds));
  assert.ok(miss.success && miss.blows > 0 && miss.landed === 0 && miss.contacts === 0 && miss.speed === null, JSON.stringify(miss));
});

test("a competency kick replays on fresh worlds and lands at a front kick's speed", async () => {
  const jobs = foundationJobs({ suite: "competency", models: ["workshop-fighter"], samples: 1 });
  const pick = [jobs.find((j) => j.competency === "kick" && j.foot === "left" && j.mode === "hit" && j.held === "empty")];
  const [a, b] = await Promise.all([runFoundation(pick, { workers: 1 }), runFoundation(pick, { workers: 1 })]);
  assert.deepEqual(a.map((r) => r.result.outcome), b.map((r) => r.result.outcome));
  const [kick] = a.map((r) => r.result.outcome);
  // The front kick reads 1.1 to 1.5 m/s at contact (docs/reference/competencies.md#baseline).
  assert.ok(kick.success && kick.landed > 0 && kick.speeds.every((v) => v > 1 && v < 1.6), JSON.stringify(kick));
});
