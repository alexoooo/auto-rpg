/** Independently gated admission and a fresh cross-build rating league. No automatic weak-model promotion. */
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { resolve, join, relative, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { POLICIES } from "../src/mind.ts";
import { NAMED_BUILDS } from "../src/golem/roster.ts";
import { validatePublishedLabPolicy } from "../src/golem/researched-lab-policies.ts";
import { ENGAGEMENT_INSTRUMENT_VERSION } from "../src/recorder.ts";
import { fingerprint, ROOT } from "./fingerprint.mjs";
import { PROTOCOL, digest, schedule, completeRounds } from "./schedule.mjs";
import { atomicJson, lockRun, runJobs } from "./runner.mjs";
import { summarize } from "./report.mjs";
import { labFingerprint } from "./lab/experiments.mjs";
import { compareEvidence } from "./lab/evidence.mjs";
import { AUTHORIZATION, remainingAllowance } from "./lab/wave4-protocol.mjs";

export function admissionAllowance(campaign, budget, requestedMs) {
  if (campaign === "wave4") {
    if (JSON.stringify(budget.authorization) !== JSON.stringify(AUTHORIZATION)) throw new Error("wrong campaign authorization");
    return remainingAllowance(budget.usedMs, requestedMs);
  }
  if (campaign !== "wave3") throw new Error("unknown admission campaign");
  if (!Number.isFinite(budget.usedMs) || budget.usedMs < 0) throw new Error("invalid campaign usage");
  return Math.max(0, Math.min(requestedMs, 8 * 3600000 - budget.usedMs));
}

export function admissionEvidence(proposal, candidate, control, current) {
  validatePublishedLabPolicy(proposal.entry);
  if (proposal.labFingerprint !== current || digest(candidate.policy) !== digest(proposal.entry.spec)) throw new Error("admission source/policy mismatch");
  if (!candidate.split.endsWith("confirmation") || candidate.split !== control.split || candidate.maxSeconds !== 150
    || control.maxSeconds !== 150 || candidate.rows.length < 64 || control.policy.kind !== "baseline"
    || control.policy.name !== "golem-duelist") throw new Error("admission requires full-bout independent confirmation against Duelist");
  if (candidate.rows.some((r) => r.split !== candidate.split) || control.rows.some((r) => r.split !== control.split)) throw new Error("mixed confirmation evidence");
  if (["network", "mixture", "refit", "terminal-model"].includes(candidate.policy.kind)) {
    // An audited provenance declaration, not a claim to infer training history from weights.
    // In particular a teacher's opponents are training opponents for its distilled student.
    const training = proposal.training;
    if (training?.policyHash !== digest(candidate.policy) || !Array.isArray(training.opponents) || !training.opponents.length
      || training.opponents.some((name) => typeof name !== "string" || !name.trim())
      || !Array.isArray(training.sources) || !training.sources.length
      || training.sources.some((path) => typeof path !== "string" || !path.trim())) {
      throw new Error("learned admission requires policy-matched training provenance and opponents");
    }
    if (candidate.rows.some((row) => training.opponents.includes(row.opponent))) {
      throw new Error("confirmation opponent was used in training or teacher data");
    }
  }
  const comparison = compareEvidence(candidate.rows, control.rows);
  if (comparison.lower <= 0 || comparison.mean < 0.1 || comparison.candidate.truncations > candidate.rows.length * 0.1) {
    throw new Error("candidate has not demonstrated a meaningful independent improvement");
  }
  const review = proposal.review;
  if (!review?.accepted || review.policyHash !== digest(proposal.entry.spec) || !review.notes?.trim()
    || !review.scenarios || review.scenarios.length < 2 || !review.reviewedAt) throw new Error("admission requires representative browser review");
  return comparison;
}

/** The proposal's source claim must agree with the actual evaluation manifests. */
export function validateEvaluationSources(proposal, current, read = (path) => JSON.parse(readFileSync(path, "utf8"))) {
  for (const path of [proposal.candidateEvaluation, proposal.controlEvaluation]) {
    const manifest = read(join(dirname(resolve(path)), "manifest.json"));
    if (manifest.fingerprint !== current || manifest.fingerprint !== proposal.labFingerprint) {
      throw new Error("evaluation manifest does not match admission sources");
    }
  }
}

async function main() {
  const flags = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    if (!process.argv[i].startsWith("--") || process.argv[i + 1] === undefined) throw new Error("expected --flag value");
    flags[process.argv[i].slice(2)] = process.argv[i + 1];
  }
  const read = (path) => JSON.parse(readFileSync(path, "utf8"));
  const proposal = read(resolve(flags.proposal)), directory = resolve(flags.dir);
  const scope = relative(join(ROOT, "research/runs"), directory);
  if (scope.startsWith("..") || scope.includes(":")) throw new Error("admission directory must be under research/runs");
  const candidate = read(resolve(proposal.candidateEvaluation))[0], control = read(resolve(proposal.controlEvaluation))[0];
  const currentLab = labFingerprint();
  validateEvaluationSources(proposal, currentLab);
  const evidence = admissionEvidence(proposal, candidate, control, currentLab);
  const seconds = Number(flags.seconds ?? 1800), workers = Number(flags.workers ?? 4);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 3600 || !Number.isInteger(workers) || workers < 1 || workers > 8) throw new Error("invalid admission resource request");
  const campaign = flags.campaign ?? "wave3";
  if (!["wave3", "wave4"].includes(campaign)) throw new Error("unknown admission campaign");
  const budgetDirectory = join(ROOT, `research/runs/${campaign}-budget`);
  const unlock = lockRun(budgetDirectory), budgetPath = join(budgetDirectory, "budget.json");
  const budget = existsSync(budgetPath) ? read(budgetPath) : { usedMs: 0, runs: [] }, started = Date.now();
  let remaining;
  try { remaining = admissionAllowance(campaign, budget, seconds * 1000); }
  catch (error) { unlock(); throw error; }
  const save = () => atomicJson(budgetPath, { ...budget, usedMs: budget.usedMs + Date.now() - started });
  const timer = setInterval(save, 1000);
  let status = "failed";
  try {
    if (remaining <= 0) throw new Error("authorized campaign compute exhausted");
    const original = read(join(ROOT, "src/golem/researched-variants.json"));
    const publishedPath = join(ROOT, "src/golem/researched-lab.json"), published = read(publishedPath);
    const previous = published.find((p) => p.name === proposal.entry.name);
    if (previous && digest(previous) !== digest(proposal.entry)) throw new Error("immutable published policy identity reused");
    const labCandidates = previous ? published : [...published, proposal.entry];
    const policies = [...new Set([...POLICIES.filter((p) => p.name !== "idle").map((p) => p.name), proposal.entry.name])];
    const current = fingerprint().hash;
    const manifest = { version: 1, fingerprint: current, protocol: PROTOCOL, rounds: 1, seed: 20260922,
      policies, candidates: original, labCandidates, builds: NAMED_BUILDS, instrumentVersion: ENGAGEMENT_INSTRUMENT_VERSION,
      policyVersions: Object.fromEntries(policies.map((name) => [name, JSON.stringify([...original, ...labCandidates].find((p) => p.name === name)) ?? name])),
      runtime: { node: process.version, platform: process.platform, arch: process.arch } };
    mkdirSync(directory, { recursive: true });
    atomicJson(join(directory, "admission-evidence.json"), { proposal, comparison: evidence });
    const jobs = schedule(policies, NAMED_BUILDS, 1, manifest.seed);
    const rows = await runJobs(directory, manifest, jobs, { deadline: started + remaining, workers,
      onProgress: (value) => console.log(JSON.stringify(value)) });
    const summary = summarize(manifest, jobs, rows);
    atomicJson(join(directory, "summary.json"), summary);
    if (!completeRounds(jobs, rows).length) { status = "incomplete"; console.log("Rating round incomplete; nothing admitted."); return; }
    if (fingerprint().hash !== current || digest(read(publishedPath)) !== digest(published)) throw new Error("source or published roster changed during admission");
    if (flags.publish === "true") {
      const artifact = { version: 1, fingerprint: current, evaluatedAt: new Date().toISOString(), rounds: summary.completedRounds,
        policies: Object.fromEntries(Object.entries(summary.policies).map(([name, p]) => [name,
          { rating: p.rating, deviation: p.deviation, bouts: p.bouts, provisional: p.provisional, policyVersion: manifest.policyVersions[name] }])) };
      // Write the completed ratings first, so registration never intentionally exposes an unrated entrant.
      atomicJson(join(ROOT, "src/policy-ratings.json"), artifact);
      atomicJson(publishedPath, labCandidates);
      atomicJson(join(ROOT, "research/lab/results/admission.json"), { proposal, evidence, manifest, summary });
      status = "admitted";
    } else status = "rated-not-published";
    console.log(status);
  } finally {
    clearInterval(timer);
    budget.runs.push({ command: "admission-league", flags, startedAt: new Date(started).toISOString(), elapsedMs: Date.now() - started, status });
    save(); unlock();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
