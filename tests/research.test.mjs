import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initialRating, updateRating, ratePeriod } from "../research/rating.mjs";
import { schedule, completeRounds, PROTOCOL } from "../research/schedule.mjs";
import { runJobs, prepareRun, lockRun, retryFileLock } from "../research/runner.mjs";
import { policyRatingBadge, policyRatingLabel, policyRatingNote } from "../src/policy-rating.ts";
import { NAMED_BUILDS } from "../src/golem/roster.ts";
import { fingerprint } from "../research/fingerprint.mjs";
import { POLICIES } from "../src/mind.ts";
import { unitDefinition } from "../src/units.ts";
import { GOLEM_CONTROL_SURFACE } from "../src/control-surfaces.ts";

test("checkpoint writes retry transient file locks, but neither hide permanent errors nor wait forever", () => {
  let calls = 0, waited = 0;
  const lock = Object.assign(new Error("locked"), { code: "EPERM" });
  assert.equal(retryFileLock(() => { if (++calls < 3) throw lock; return "saved"; }, (ms) => { waited += ms; }), "saved");
  assert.equal(calls, 3); assert.equal(waited, 40);
  calls = 0;
  assert.throws(() => retryFileLock(() => { calls++; throw lock; }, () => {}), /locked/);
  assert.equal(calls, 50);
  calls = 0;
  assert.throws(() => retryFileLock(() => { calls++; throw Object.assign(new Error("full"), { code: "ENOSPC" }); }, () => {}), /full/);
  assert.equal(calls, 1);
});

test("Glicko-2 reproduces Glickman's published example", () => {
  const actual = updateRating({ rating: 1500, deviation: 200, volatility: 0.06 }, [
    { opponent: { rating: 1400, deviation: 30 }, score: 1 },
    { opponent: { rating: 1550, deviation: 100 }, score: 0 },
    { opponent: { rating: 1700, deviation: 300 }, score: 0 },
  ]);
  assert.ok(Math.abs(actual.rating - 1464.06) < 0.01);
  assert.ok(Math.abs(actual.deviation - 151.52) < 0.01);
  assert.ok(Math.abs(actual.volatility - 0.059996) < 0.000001);
});

test("rating periods are order independent, draws symmetric, and reversing results reverses strength", () => {
  const ratings = { a: initialRating(), b: initialRating(), c: initialRating() };
  const rows = [{ id: "1", status: "ok", left: "a", right: "b", winner: "left" },
    { id: "2", status: "ok", left: "a", right: "c", winner: "left" }];
  assert.deepEqual(ratePeriod(ratings, rows), ratePeriod(ratings, [...rows].reverse()));
  assert.ok(ratePeriod(ratings, rows).a.rating > 1500);
  assert.ok(ratePeriod(ratings, rows.map((r) => ({ ...r, winner: "right" }))).a.rating < 1500);
  const draw = ratePeriod(ratings, rows.map((r) => ({ ...r, winner: null })));
  assert.equal(draw.a.rating, 1500);
  assert.ok(draw.a.deviation < 350);
  assert.throws(() => ratePeriod(ratings, [{ ...rows[0], status: "failed" }]), /failed/);
});

test("league balances builds, policy assignments and sides, with seeds following policies", () => {
  const names = Array.from({ length: 12 }, (_, i) => `p${i}`);
  const jobs = schedule(names, NAMED_BUILDS, 1);
  assert.equal(jobs.length, 3168);
  assert.equal(new Set(jobs.map((j) => j.id)).size, jobs.length);
  for (let i = 0; i < jobs.length; i += 2) {
    const a = jobs[i], b = jobs[i + 1];
    assert.equal(a.left, b.right); assert.equal(a.leftBuild, b.rightBuild);
    assert.deepEqual(a.seeds, [...b.seeds].reverse());
    assert.notEqual(a.seeds[0], a.seeds[1]);
  }
  const counts = new Map();
  for (const job of jobs) for (const side of ["left", "right"]) {
    const key = `${job[side]}/${job[`${side}Build`]}/${side}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  assert.equal(counts.size, 12 * 12 * 2);
  assert.equal(new Set(counts.values()).size, 1);
});

test("incomplete or failed rounds cannot contribute, and altered jobs are rejected", () => {
  const jobs = schedule(["a", "b"], NAMED_BUILDS.slice(0, 2), 2);
  const rows = jobs.map((j) => ({ ...j, status: "ok", winner: null }));
  assert.equal(completeRounds(jobs, rows).length, 2);
  assert.equal(completeRounds(jobs, rows.slice(0, -1)).length, 1);
  assert.equal(completeRounds(jobs, rows.map((r, i) => i === 0 ? { ...r, status: "failed" } : r)).length, 0);
  assert.throws(() => completeRounds(jobs, [{ ...rows[0], seeds: [1, 2] }]), /seeds/);
  assert.throws(() => completeRounds(jobs, [rows[0], rows[0]]), /duplicate/);
});

test("resuming produces identical results and refuses changed manifests", async () => {
  const directory = mkdtempSync(join(tmpdir(), "ai-runner-"));
  const jobs = schedule(["a", "b"], NAMED_BUILDS.slice(0, 2), 1);
  const manifest = { fingerprint: "test", protocol: PROTOCOL };
  const options = { workers: 2, workerUrl: new URL("./harness/research-worker-fixture.mjs", import.meta.url) };
  try {
    const rows = await runJobs(directory, manifest, jobs, options);
    assert.equal(rows.length, jobs.length);
    const before = readFileSync(join(directory, "results.jsonl"), "utf8");
    assert.deepEqual(await runJobs(directory, manifest, jobs, options), rows);
    assert.equal(readFileSync(join(directory, "results.jsonl"), "utf8"), before);
    assert.throws(() => prepareRun(directory, { ...manifest, fingerprint: "changed" }, jobs), /mismatch/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("failed workers create explicit failures rather than wins or draws", async () => {
  const directory = mkdtempSync(join(tmpdir(), "ai-failure-"));
  const jobs = schedule(["a", "b"], NAMED_BUILDS.slice(0, 2), 1).slice(0, 1);
  try {
    const rows = await runJobs(directory, { crash: true }, jobs, { workers: 1,
      workerUrl: new URL("./harness/research-worker-fixture.mjs", import.meta.url) });
    assert.equal(rows[0].status, "failed"); assert.equal(rows[0].winner, undefined);
    assert.equal(completeRounds(jobs, rows).length, 0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("a job past its wall limit fails, and one inside it does not", async () => {
  const workerUrl = new URL("./harness/research-worker-fixture.mjs", import.meta.url);
  const jobs = schedule(["a", "b"], NAMED_BUILDS.slice(0, 2), 1).slice(0, 1);
  for (const [limit, status] of [[100, "failed"], [5000, "ok"]]) {
    const directory = mkdtempSync(join(tmpdir(), "ai-limit-"));
    try {
      const rows = await runJobs(directory, { delayMs: 600 }, jobs, { workers: 1, workerUrl, jobLimitMs: limit });
      assert.equal(rows[0].status, status, `limit ${limit} ms`);
      if (status === "failed") assert.match(rows[0].error, /wall limit/);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }
});

test("a live run directory cannot be opened for a second computation", () => {
  const directory = mkdtempSync(join(tmpdir(), "ai-lock-"));
  try {
    const unlock = lockRun(directory);
    assert.throws(() => lockRun(directory), /in use/);
    unlock();
    lockRun(directory)();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("selector labels retain dated measurements after simulation and policy changes", () => {
  const data = { version: 1, fingerprint: "current", evaluatedAt: "2026-09-20T00:00:00Z", rounds: 1,
    policies: { a: { rating: 1538.3, deviation: 50, bouts: 528, provisional: true } } };
  assert.equal(policyRatingLabel("a", "A", data), "A — 1538 · 2026-09-20 (provisional)");
  assert.equal(policyRatingLabel("missing", "New", data), "New — unrated");
  assert.equal(policyRatingLabel("idle", "Idle", data), "Idle — unrated");
  assert.equal(policyRatingBadge("a", data), "1538 provisional");
  assert.equal(policyRatingBadge("missing", data), "unrated");
  assert.equal(policyRatingBadge("idle", data), "unrated");
  assert.match(policyRatingNote("a", data, "current"), /528 bouts/);
  assert.doesNotMatch(policyRatingNote("a", data, "current"), /has changed/);
  assert.match(policyRatingNote("a", data, "changed"), /Last evaluated 2026-09-20.*528 bouts.*last measured rating is shown/);
  data.fingerprint = "older-simulation";
  assert.equal(policyRatingLabel("a", "A", data), "A — 1538 · 2026-09-20 (provisional)");
  data.policies.a.provisional = false;
  assert.equal(policyRatingLabel("a", "A", data), "A — 1538 · 2026-09-20");
  assert.equal(policyRatingBadge("a", data), "1538");
  data.fingerprint = "current";
  data.policies.a.policyVersion = "parameters-v1";
  assert.equal(policyRatingLabel("a", "A", data), "A — 1538 · 2026-09-20");
  assert.match(policyRatingNote("a", data, "current", "parameters-v2"), /has changed.*last measured rating is shown/);
  assert.doesNotMatch(policyRatingNote("a", data, "current", "parameters-v1"), /has changed/);
  data.version = 2;
  assert.equal(policyRatingLabel("a", "A", data), "A — unrated");
  assert.equal(policyRatingBadge("a", data), "unrated");
  assert.match(policyRatingNote("a", data, "current"), /^Unrated:/);
});

test("fingerprints track transitive runtime code, excluding type-only UI", () => {
  const root = mkdtempSync(join(tmpdir(), "ai-fingerprint-"));
  try {
    for (const dir of ["tests/harness", "src/golem", "research"]) mkdirSync(join(root, dir), { recursive: true });
    for (const path of ["src/golem/roster.ts", "research/worker.mjs"]) {
      writeFileSync(join(root, path), "export const value = 1;\n");
    }
    writeFileSync(join(root, "package-lock.json"), "{}");
    writeFileSync(join(root, "tests/harness/bout-runner.mjs"), "import '../../src/simulation.ts';");
    writeFileSync(join(root, "src/simulation.ts"), "import type { UI } from './ui.ts'; export const speed = 1;");
    writeFileSync(join(root, "src/ui.ts"), "export type UI = string;");
    const before = fingerprint(root).hash;
    writeFileSync(join(root, "src/ui.ts"), "export type UI = number;");
    assert.equal(fingerprint(root).hash, before);
    writeFileSync(join(root, "src/simulation.ts"), "export const speed = 2;");
    assert.notEqual(fingerprint(root).hash, before);
    const next = fingerprint(root).hash;
    writeFileSync(join(root, "package-lock.json"), '{"version":2}');
    assert.notEqual(fingerprint(root).hash, next);
    writeFileSync(join(root, "src/one.ts"), "export const value = 1;");
    writeFileSync(join(root, "src/two.ts"), "export const value = 1;");
    writeFileSync(join(root, "src/simulation.ts"), "import './one.ts';");
    const firstGraph = fingerprint(root);
    assert.ok(firstGraph.files.includes("src/one.ts"));
    assert.deepEqual(fingerprint(root), firstGraph); // Warm parse cache.
    writeFileSync(join(root, "src/simulation.ts"), "import './two.ts';"); // Same byte length.
    const secondGraph = fingerprint(root);
    assert.notEqual(secondGraph.hash, firstGraph.hash);
    assert.ok(secondGraph.files.includes("src/two.ts"));
    assert.ok(!secondGraph.files.includes("src/one.ts"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a registered policy reaches the actual body picker and factory, never a foreign surface", () => {
  const mind = { decide: () => ({}) };
  const entries = [
    { name: "golem-picker-test", label: "Picker test", surface: GOLEM_CONTROL_SURFACE, create: () => mind },
    { name: "golem-foreign-test", label: "Foreign", surface: "foreign", create: () => mind },
  ];
  POLICIES.push(...entries);
  try {
    const golem = unitDefinition("golem");
    assert.ok(golem.compatiblePolicies.includes(entries[0].name));
    assert.ok(golem.driverOptions.some((row) => row.name === entries[0].name));
    assert.equal(golem.createPolicy(entries[0].name, 17), mind);
    assert.ok(!golem.driverOptions.some((row) => row.name === entries[1].name));
    assert.throws(() => golem.createPolicy(entries[1].name), /does not support/);
  } finally { POLICIES.splice(POLICIES.length - entries.length, entries.length); }
});

test("a counterfactual knob is set only for its run and refused whole when any part of it is wrong", async () => {
  const { applyOverrides, KNOBS } = await import("../research/overrides.mjs");
  const { TORSO_WAIST } = await import("../src/golem/config.ts");
  const shipped = TORSO_WAIST.leanTorque;
  const restore = applyOverrides({ "waist.leanTorque": 4630 });
  try { assert.equal(TORSO_WAIST.leanTorque, 4630); } finally { restore(); }
  assert.equal(TORSO_WAIST.leanTorque, shipped);
  assert.equal(KNOBS["waist.leanTorque"].block, TORSO_WAIST);
  assert.throws(() => applyOverrides({ "waist.leanTorque": 4630, "waist.nothing": 1 }), /no override knob/);
  assert.equal(TORSO_WAIST.leanTorque, shipped);
  assert.throws(() => applyOverrides({ "waist.leanTorque": Number.NaN }), /finite/);
  assert.equal(TORSO_WAIST.leanTorque, shipped);
  applyOverrides(undefined)();
  assert.equal(TORSO_WAIST.leanTorque, shipped);
});

test("no research worker module loads another worker module, directly or through a helper", () => {
  // Importing a worker module registers its `parentPort` handler as well, so every job runs twice
  // and the second answer is taken as the next job's result (docs/analysis/2026-09-26-headroom.md,
  // section 7). Static imports only: a dynamic one inside a function runs where it is called.
  const dir = new URL("../research/", import.meta.url);
  const source = (file) => readFileSync(new URL(file, dir), "utf8");
  const registers = (text) => /parentPort\)?\s*(\?\.|\.)\s*on\s*\(/.test(text);
  const localImports = (file) => [...source(file).matchAll(/^import[^;]*?from\s+"(\.\/[^"]+\.mjs)"/gms)]
    .map((m) => m[1].slice(2));
  const workers = ["census-worker.mjs", "drills-worker.mjs", "fall-loop-worker.mjs", "headroom-worker.mjs",
    "league-worker.mjs", "side-mirror-worker.mjs", "stroke-worker.mjs", "worker.mjs"];
  for (const worker of workers) assert.ok(registers(source(worker)), `${worker} is expected to register a handler`);
  for (const worker of workers) {
    const seen = new Set();
    const queue = localImports(worker);
    while (queue.length) {
      const file = queue.shift();
      if (seen.has(file)) continue;
      seen.add(file);
      assert.ok(!registers(source(file)), `${worker} loads ${file}, which registers a worker message handler`);
      queue.push(...localImports(file));
    }
  }
});
