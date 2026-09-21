import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateCandidate } from "../src/golem/research-candidates.ts";
import { schedule, completeRounds, digest } from "./schedule.mjs";
import { runJobs, readResults, atomicJson, prepareRun } from "./runner.mjs";
import { fingerprint, ROOT } from "./fingerprint.mjs";

/** Statistical eligibility never substitutes for looking at representative fights. */
export function reviewedCandidates(confirmation, review, currentFingerprint) {
  if (confirmation.status !== "complete") throw new Error("confirmation is incomplete");
  if (confirmation.fingerprint !== currentFingerprint) throw new Error("confirmation fingerprint mismatch");
  if (review.fingerprint !== currentFingerprint || !Array.isArray(review.candidates)) throw new Error("review fingerprint mismatch");
  return confirmation.eligible.filter((candidate) => {
    validateCandidate(candidate);
    const entry = review.candidates.find((row) => row.name === candidate.name);
    if (!entry || entry.candidateHash !== digest(candidate) || !entry.accepted) return false;
    if (!entry.notes?.trim() || !entry.scenarios?.length || !entry.reviewedAt) throw new Error("review needs scenarios, date and notes");
    return true;
  });
}

/** Extend the exact league with new entrants; retain every measured baseline bout. */
export async function promote(directory, manifest, options) {
  const confirmation = JSON.parse(readFileSync(join(directory, "confirmation.json"), "utf8"));
  const review = JSON.parse(readFileSync(join(directory, "browser-review.json"), "utf8"));
  const current = fingerprint().hash;
  if (manifest.fingerprint !== current) throw new Error("simulator changed before promotion");
  const publishedPath = join(ROOT, "src/golem/researched-variants.json");
  const published = JSON.parse(readFileSync(publishedPath, "utf8"));
  // Generation/index belongs in the artifact ID, not the player's policy label.
  const accepted = reviewedCandidates(confirmation, review, current).map((candidate) => ({ ...candidate,
    label: published.find((c) => c.name === candidate.name)?.label
      ?? `Golem ${candidate.parent.slice(6)} (tuned ${published.filter((c) => c.parent === candidate.parent).length + 1})`,
  }));
  if (!accepted.length) return { status: "no-reviewed-candidates" };
  const candidates = [...manifest.candidates, ...accepted.filter((c) => !manifest.policies.includes(c.name))];
  const policies = [...manifest.policies, ...accepted.map((c) => c.name).filter((name) => !manifest.policies.includes(name))];
  const extended = { ...manifest, policies, candidates, policyVersions: { ...manifest.policyVersions,
    ...Object.fromEntries(accepted.map((c) => [c.name, JSON.stringify(c)])) } };
  const jobs = schedule(policies, manifest.builds, manifest.rounds, manifest.seed);
  const target = join(directory, "promoted-league");
  const resultPath = join(target, "results.jsonl");
  if (!existsSync(join(target, "manifest.json"))) {
    mkdirSync(target, { recursive: true });
    prepareRun(target, extended, jobs);
    const baseline = readResults(directory);
    completeRounds(jobs, baseline);
    writeFileSync(resultPath, baseline.map((row) => JSON.stringify(row)).join("\n") + (baseline.length ? "\n" : ""));
  }
  const rows = await runJobs(target, extended, jobs, options);
  const rounds = completeRounds(jobs, rows);
  if (!rounds.length) return { status: "extended-league-incomplete", directory: target };
  if (fingerprint().hash !== current) throw new Error("simulator changed during promotion");
  // Existing published variants are retained; reviewed immutable candidate IDs are added.
  for (const candidate of accepted) {
    const previous = published.find((c) => c.name === candidate.name);
    if (previous && digest(previous) !== digest(candidate)) throw new Error(`candidate identity reused: ${candidate.name}`);
    if (!previous) published.push(candidate);
  }
  atomicJson(publishedPath, published);
  return { status: "promoted", directory: target, manifest: extended, accepted: accepted.map((c) => c.name) };
}
