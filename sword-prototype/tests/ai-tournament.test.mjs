import assert from "node:assert/strict";
import test from "node:test";

import { researchMatrix } from "../src/learning/research-matrix.ts";
import { assertCommonTournamentMatrix, freezeTournamentManifest, recomputeTournamentReport,
  mergeTournamentRows, nextTournamentBatch, resumeTournament, tournamentVerdict, validateTournamentManifest } from "../src/learning/tournament.ts";

const candidates = Object.freeze([
  { name: "dagger", algorithm: "dagger", artifactDigest: "a".repeat(64), artifactBytes: 100 },
  { name: "ppo", algorithm: "ppo", artifactDigest: "b".repeat(64), artifactBytes: 200 },
]);
const jobs = researchMatrix("test", 20260824).slice(0, 2).map((job, index) => ({ ...job, cell: index }));
const manifest = () => freezeTournamentManifest({ candidates, jobs });
const safety = Object.freeze({ finiteAnatomical: true, capabilities: true, postVerdict: true, stuckActions: true, lifecycle: true });
const row = (candidate, job, index, overrides = {}) => ({ manifestDigest: manifest().digest, index, candidate, job, outcome: "win", seconds: 8,
  engagement: { opportunities: 10, attacks: 8, contacts: 4, nearRangeStallSeconds: 0.2,
    firstAttackSeconds: 1, meaningful: 4 }, actionCounts: { close: 10, cover: 10, cut: 10 }, safety, ...overrides });
const rows = (order = candidates) => [
  ...order.flatMap((candidate) => jobs.map((job, index) => row(candidate.name, job, index))),
  ...["scripted-meta-control", "random-meta-control", "specialist-control"].flatMap((controller) =>
    jobs.map((job, index) => row(controller, job, index, { outcome: "loss" }))),
];

test("all_controllers_run_the_same_cells_seeds_mirrors_and_opponents", () => {
  assert.doesNotThrow(() => assertCommonTournamentMatrix(rows(), manifest()));
  assert.throws(() => assertCommonTournamentMatrix(rows().slice(1), manifest()), /exact frozen cells/);
});

const cell = (overrides = {}) => ({ name: "warrior/sword", meaningfulEngagement: 3,
  opportunityAttackRate: 0.8, attackContactRate: 0.4, nearRangeStallShare: 0.1,
  firstAttackP90Seconds: 2, symmetricTimeCapRate: 0, score: 0.8, specialistScore: 0.8, ...overrides });
const candidate = (overrides = {}) => ({ name: "good", algorithm: "dagger", artifactBytes: 100,
  meanScore: 0.8, confidenceLow: 0.7, confidenceHigh: 0.9, scriptedScore: 0.6, randomScore: 0.4,
  cells: [cell()], actionCounts: { close: 10, cover: 10, cut: 10 }, safety, ...overrides });

test("a_candidate_with_the_best_mean_but_a_dead_cell_is_rejected", () => {
  const dead = candidate({ name: "dead", meanScore: 0.99, cells: [cell(), cell({ name: "broot/bow", meaningfulEngagement: 0 })] });
  assert.equal(tournamentVerdict([candidate(), dead]).promoted, "good");
});

test("a_candidate_that_wins_by_time_limit_avoidance_is_rejected", () => {
  const runner = candidate({ cells: [cell({ symmetricTimeCapRate: 0.11 })] });
  assert.equal(tournamentVerdict([runner]).promoted, null);
});

test("a_candidate_that_reads_an_unsupported_capability_is_rejected_by_name", () => {
  const invalid = candidate({ safety: { ...safety, capabilities: false } });
  const verdict = tournamentVerdict([invalid]);
  assert.equal(verdict.promoted, null); assert.ok(verdict.candidates[0].failures.includes("capability failure"));
});

test("selection_uses_validation_and_test_is_opened_exactly_once", () => {
  const frozen = manifest(); assert.equal(frozen.selectedOn, "validation"); assert.doesNotThrow(() => validateTournamentManifest(frozen));
  assert.equal(resumeTournament(rows().slice(0, -1), frozen).length, 1);
  assert.throws(() => resumeTournament(rows(), frozen), /cannot be opened twice/);
  const partial = rows().slice(0, 2); const expected = nextTournamentBatch(partial, frozen, 2);
  const byIdentity = new Map(rows().map((value) => [`${value.candidate}:${value.index}`, value]));
  const incoming = expected.map(({ candidate, index }) => byIdentity.get(`${candidate}:${index}`));
  assert.equal(mergeTournamentRows(partial, incoming, frozen).length, 4);
  assert.throws(() => mergeTournamentRows(partial, [...incoming].reverse(), frozen), /indexed order/);
  assert.throws(() => nextTournamentBatch([{ ...partial[0], candidate: "unknown" }], frozen, 1), /unknown tournament controller/);
  assert.throws(() => nextTournamentBatch([{ ...partial[0], manifestDigest: "changed" }], frozen, 1), /different frozen manifest/);
  assert.throws(() => nextTournamentBatch([{ ...partial[0], outcome: "timeout" }], frozen, 1), /invalid outcome/);
  assert.throws(() => nextTournamentBatch([{ ...partial[0], safety: { ...safety, lifecycle: "yes" } }], frozen, 1), /invalid safety evidence/);
});

test("reordering_controllers_does_not_change_any_fight_record_or_verdict", () => {
  const report = { manifest: manifest(), rawRows: rows() };
  const reordered = { ...report, rawRows: rows([...candidates].reverse()) };
  assert.deepEqual(reordered.rawRows.map((value) => value).sort((a, b) => a.candidate.localeCompare(b.candidate) || a.index - b.index),
    report.rawRows.map((value) => value).sort((a, b) => a.candidate.localeCompare(b.candidate) || a.index - b.index));
  assert.deepEqual(recomputeTournamentReport(reordered), recomputeTournamentReport(report));
});

test("the_tournament_report_recomputes_its_verdict_from_raw_rows", () => {
  const report = { manifest: manifest(), rawRows: rows(), verdict: { promoted: "invented" } };
  assert.notEqual(recomputeTournamentReport(report).promoted, report.verdict.promoted);
  const impossible = rows(); impossible[0] = { ...impossible[0], engagement: { ...impossible[0].engagement, attacks: 11 } };
  assert.throws(() => recomputeTournamentReport({ manifest: manifest(), rawRows: impossible }), /impossible engagement attribution/);
});

test("no_passing_candidate_produces_no_promoted_artifact", () => {
  assert.equal(tournamentVerdict([candidate({ cells: [cell({ attackContactRate: 0 })] })]).promoted, null);
});

test("a_statistical_tie_selects_the_frozen_smaller_then_named_candidate", () => {
  const large = candidate({ name: "ppo", algorithm: "ppo", artifactBytes: 200, meanScore: 0.9,
    confidenceLow: 0.7, confidenceHigh: 0.95 });
  const small = candidate({ name: "dagger", algorithm: "dagger", artifactBytes: 100, meanScore: 0.8,
    confidenceLow: 0.72, confidenceHigh: 0.91 });
  assert.equal(tournamentVerdict([large, small]).promoted, "dagger");
  const named = candidate({ name: "a", algorithm: "dagger", artifactBytes: 100 });
  assert.equal(tournamentVerdict([{ ...named, name: "z" }, named]).promoted, "a");
});

test("changing_a_threshold_after_test_opening_invalidates_the_manifest", () => {
  const frozen = structuredClone(manifest()); frozen.thresholds.minOpportunityAttackRate = 0;
  assert.throws(() => validateTournamentManifest(frozen), /changed after test was opened/);
});

test("the_frozen_manifest_owns_its_candidate_and_job_records", () => {
  const mutableCandidates = candidates.map((value) => ({ ...value }));
  const mutableJobs = jobs.map((value) => ({ ...value }));
  const frozen = freezeTournamentManifest({ candidates: mutableCandidates, jobs: mutableJobs });
  mutableCandidates[0].name = "changed"; mutableJobs[0].seed += 1;
  assert.equal(frozen.candidates[0].name, "dagger");
  assert.notEqual(frozen.jobs[0].seed, mutableJobs[0].seed);
  assert.doesNotThrow(() => validateTournamentManifest(frozen));
});
