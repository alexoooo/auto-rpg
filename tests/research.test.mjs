import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initialRating, updateRating, ratePeriod } from "../research/rating.mjs";
import { schedule, completeRounds, PROTOCOL } from "../research/schedule.mjs";
import { runJobs, prepareRun, lockRun } from "../research/runner.mjs";
import { pairedComparison, bootstrap, comparisonJobs } from "../research/search.mjs";
import { policyRatingLabel, policyRatingNote } from "../src/policy-rating.ts";
import { candidateBounds, validateCandidate, SEARCH_FIELDS, SEARCH_PARENTS } from "../src/golem/research-candidates.ts";
import { NAMED_BUILDS } from "../src/golem/roster.ts";
import { fingerprint } from "../research/fingerprint.mjs";
import { reviewedCandidates } from "../research/promotion.mjs";
import { digest } from "../research/schedule.mjs";

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
test("a live run directory cannot be opened for a second computation", () => {
  const directory = mkdtempSync(join(tmpdir(), "ai-lock-"));
  try {
    const unlock = lockRun(directory);
    assert.throws(() => lockRun(directory), /in use/);
    unlock();
    lockRun(directory)();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("candidate search bounds enforce all and only the permitted policy parameters", () => {
  for (const parent of Object.keys(SEARCH_PARENTS)) {
    const candidate = { name: "golem-researched-test", label: "Test", parent,
      parameters: Object.fromEntries(SEARCH_FIELDS.map((key) => [key, SEARCH_PARENTS[parent][key]])) };
    validateCandidate(candidate);
    const bad = structuredClone(candidate); bad.parameters.turnGain = candidateBounds(parent, "turnGain")[1] + 0.01;
    assert.throws(() => validateCandidate(bad), /turnGain/);
    assert.throws(() => validateCandidate({ ...candidate, parameters: { ...candidate.parameters, motorTorque: 99 } }), /exactly/);
  }
});
test("paired bootstrap detects a real improvement and rejects unmatched samples", () => {
  const jobs = comparisonJobs(["parent", "candidate"], ["foe"], NAMED_BUILDS.slice(0, 2), "holdout");
  const rows = jobs.map((job) => ({ ...job, status: "ok", winner: job.left === "candidate" ? "left" : "right" }));
  const band = pairedComparison(rows, "candidate", "parent");
  assert.ok(band.low > 0); assert.equal(band.blocks, 2);
  assert.deepEqual(bootstrap([0, 0, 0]), { mean: 0, low: 0, high: 0, blocks: 3 });
  assert.throws(() => pairedComparison(rows.slice(1), "candidate", "parent"), /incomplete/);
});
test("selector labels distinguish rated, provisional, missing and stale measurements", () => {
  const data = { version: 1, fingerprint: "current", evaluatedAt: "2026-09-20T00:00:00Z", rounds: 1,
    policies: { a: { rating: 1538.3, deviation: 50, bouts: 528, provisional: true } } };
  assert.equal(policyRatingLabel("a", "A", data, "current"), "A — 1538 (provisional)");
  assert.equal(policyRatingLabel("a", "A", data, "changed"), "A — needs evaluation");
  assert.equal(policyRatingLabel("missing", "New", data, "current"), "New — unrated");
  assert.equal(policyRatingLabel("idle", "Idle", data, "current"), "Idle — unrated");
  assert.match(policyRatingNote("a", data, "current"), /528 bouts/);
  data.policies.a.provisional = false;
  assert.equal(policyRatingLabel("a", "A", data, "current"), "A — 1538");
  data.policies.a.policyVersion = "parameters-v1";
  assert.equal(policyRatingLabel("a", "A", data, "current", "parameters-v2"), "A — needs evaluation");
});

test("fingerprints track transitive runtime code, excluding type-only UI and separately versioned candidates", () => {
  const root = mkdtempSync(join(tmpdir(), "ai-fingerprint-"));
  try {
    for (const dir of ["tests/harness", "src/golem", "research"]) mkdirSync(join(root, dir), { recursive: true });
    for (const path of ["src/golem/roster.ts", "src/golem/research-candidates.ts", "research/worker.mjs"]) {
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
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("promotion requires both confirmed improvement and review of the exact parameters", () => {
  const parent = "golem-form";
  const candidate = { name: "golem-researched-test", label: "Test", parent,
    parameters: Object.fromEntries(SEARCH_FIELDS.map((key) => [key, SEARCH_PARENTS[parent][key]])) };
  const confirmation = { status: "complete", eligible: [candidate] };
  const review = { fingerprint: "current", candidates: [] };
  assert.deepEqual(reviewedCandidates(confirmation, review, "current"), []);
  review.candidates.push({ name: candidate.name, candidateHash: digest(candidate), accepted: true,
    notes: "Distinct retreat and counterattack observed", reviewedAt: "2026-09-20", scenarios: ["default versus fencer"] });
  assert.deepEqual(reviewedCandidates(confirmation, review, "current"), [candidate]);
  assert.deepEqual(reviewedCandidates({ status: "complete", eligible: [] }, review, "current"), []);
  assert.throws(() => reviewedCandidates(confirmation, review, "changed"), /fingerprint/);
  review.candidates[0].candidateHash = "different-parameters";
  assert.deepEqual(reviewedCandidates(confirmation, review, "current"), []);
});
