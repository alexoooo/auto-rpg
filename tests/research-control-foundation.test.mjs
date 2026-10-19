/**
 * **The control foundation's physical trials** (`research/control-foundation.mjs`): each replays
 * on a fresh world, keeps its denominators, and holds its invariants whether or not its controller
 * succeeds (Node, Rapier, 120 Hz unless a job says otherwise). Its jobs and summaries are
 * `control-foundation-jobs`'s, and how often each controller succeeds
 * `research-control-foundation-capability`'s.
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
    assert.ok(rows.every((r) => r.result.outcome.complete && r.result.outcome.replayExact), JSON.stringify(rows.map((r) => r.result.outcome)));
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
  assert.ok(rows.every((r) => r.result.outcome.invalid === null));
  assert.deepEqual(rows[0].result.outcome.goal, rows[1].result.outcome.goal);
  assert.notEqual(rows[0].result.outcome.observationDigest, rows[1].result.outcome.observationDigest);
  const summary = summarizeFoundation(rows);
  assert.equal(summary.cells.length, 2);
  assert.ok(summary.cells.every((c) => c.success.count === 1));
});

test("a physical strike repeats on fresh worlds and a missing target does not score a hit", async () => {
  const jobs = foundationJobs({ models: ["workshop-fighter"], samples: 1 });
  const at = jobs.find((j) => j.task === "strike" && j.held === "club" && j.hand === "right" && j.target === "place");
  const miss = jobs.find((j) => j.task === "strike" && j.held === "club" && j.hand === "right" && j.target === "miss");
  const a = await foundationTrial(at), b = await foundationTrial(at), absent = await foundationTrial(miss);
  assert.deepEqual(a, b);
  assert.equal(a.status, "measured");
  assert.ok(a.physical.steps > 120);
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
  assert.ok(rows.every((r) => r.result.outcome.replayExact));
  assert.ok(rows.every((r) => r.result.physical.assistForceIntegralNs === 0));
  assert.deepEqual(summarizeFoundation(rows).cells.map((c) => c.success.count), [1, 1]);
});

test("standing bar trials have separate denominators and enforce physical support gates", async () => {
  const options = { suite: "bar", models: ["workshop-fighter"], samples: 1, actuation: "directional" };
  const jobs = foundationJobs({ ...options, support: "standing" });
  assert.throws(() => foundationJobs({ ...options, support: "unknown" }), /support/);
  assert.ok(jobs.every((j, i) => j.support === "standing" && j.id !== foundationJobs(options)[i].id));
  const rows = await runFoundation(jobs, { workers: 2 });
  assert.ok(rows.every((r) => r.result.configuration.pin === null && r.result.outcome.replayExact));
  const summary = summarizeFoundation([...rows, ...rows.map((r) => ({ ...r, job: { ...r.job, support: "pinned" } }))]);
  assert.equal(summary.cells.length, 4);
  assert.ok(summary.cells.every((c) => c.success.count === 1));
});

test("the common runner preserves side-specific support outcomes and replay", async () => {
  const jobs = foundationJobs({ suite: "support", models: ["crypt-skeleton"], samples: 1, actuation: "directional" });
  assert.deepEqual(jobs.map((j) => j.side), ["left", "right"]);
  const rows = await runFoundation(jobs, { workers: 2 });
  assert.ok(rows.every((r) => r.result.outcome.replayExact));
  assert.deepEqual(summarizeFoundation(rows).cells.map((c) => c.success.count), [1, 1]);
});

test("point-strike trials separate hands, loadouts and intentional misses", async () => {
  const jobs = foundationJobs({ suite: "point-strike", models: ["workshop-fighter"], samples: 1, actuation: "directional" });
  assert.equal(jobs.length, 12);
  assert.equal(new Set(jobs.map((j) => j.id)).size, 12);
  const selected = jobs.filter((j) => j.hands === "both" && j.held === "club");
  const rows = await runFoundation(selected, { workers: 2 });
  assert.ok(rows.every((r) => r.result.outcome.replayExact));
  // An intentional miss touches nothing.
  assert.ok(rows[1].result.outcome.strikes.every((s) => s.contacts === 0));
  assert.deepEqual(summarizeFoundation(rows).cells.map((c) => c.success.count), [1, 1]);
});

test("moving strikes keep tracked, fixed-aim and miss outcomes separate", async () => {
  const jobs = foundationJobs({ suite: "moving-strike", models: ["workshop-fighter"], samples: 1, actuation: "directional" });
  assert.equal(jobs.length, 18);
  assert.equal(new Set(jobs.map((j) => j.id)).size, 18);
  const selected = jobs.filter((j) => j.hands === "left" && j.held === "empty");
  assert.deepEqual(selected.map((j) => [j.miss, j.swing.tracking, j.swing.delay]), [[false, true, 3], [false, false, 3], [true, true, 3]]);
  const rows = await runFoundation(selected, { workers: 2 });
  assert.ok(rows.every((r) => r.result.outcome.replayExact));
  assert.ok(rows.every((r) => r.result.outcome.strikes.every((s) => s.targetTravel > 0.1 && s.targetSpeed > 0.5)));
  assert.equal(rows[2].result.outcome.strikes[0].contacts, 0);
  assert.equal(summarizeFoundation(rows).cells.length, 3);
  assert.ok(summarizeFoundation(rows).cells.every((c) => c.success.count === 1));
  const extended = foundationJobs({ suite: "moving-strike", models: ["workshop-fighter"], samples: 1, actuation: "directional", centreControl: true, continueSeconds: 10 });
  assert.ok(extended.every((j, i) => j.centreControl && j.continueSeconds === 10 && j.watchSeconds === 17 && j.id !== jobs[i].id));
  const compared = [...rows, ...rows.map((r) => ({ ...r, job: { ...r.job, centreControl: true, continueSeconds: 10 } }))];
  assert.equal(summarizeFoundation(compared).cells.length, 6);
  assert.throws(() => foundationJobs({ suite: "bar", centreControl: true }), /point-strike suite/);
  assert.throws(() => foundationJobs({ suite: "point-strike", continueSeconds: NaN }), /continuation/);
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
      assert.ok(row.result.physical.stops.nearSteps > 0, "the fixture did not reach its case: no joint came near its stop");
      assert.equal(row.result.configuration.engineRevision, manifest.engineRevision);
      assert.equal(row.result.outcome.replayExact, true);
      assert.equal(row.result.configuration.jointStops, true);
      assert.equal(row.result.physical.stops.steps, row.result.outcome.steps);
      assert.equal(row.result.physical.stops.rejectedSteps, 0);
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
  const [, , hit, miss] = a.map((r) => r.result.outcome);
  assert.ok(miss.blows > 0, `the fixture did not reach its case: the miss threw nothing (${JSON.stringify(miss)})`);
  assert.ok(hit.landed <= hit.blows && hit.speeds.length === hit.landed, JSON.stringify(hit));
  assert.ok(miss.landed === 0 && miss.contacts === 0 && miss.speed === null, JSON.stringify(miss));
});

test("a competency kick replays on fresh worlds", async () => {
  const jobs = foundationJobs({ suite: "competency", models: ["workshop-fighter"], samples: 1 });
  const pick = [jobs.find((j) => j.competency === "kick" && j.foot === "left" && j.mode === "hit" && j.held === "empty")];
  const [a, b] = await Promise.all([runFoundation(pick, { workers: 1 }), runFoundation(pick, { workers: 1 })]);
  assert.deepEqual(a.map((r) => r.result.outcome), b.map((r) => r.result.outcome));
  const [kick] = a.map((r) => r.result.outcome);
  assert.ok(kick.landed <= kick.blows && kick.speeds.length === kick.landed, JSON.stringify(kick));
});
