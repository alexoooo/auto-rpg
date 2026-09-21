import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { mulberry32 } from "../src/rng.ts";
import { SEARCH_FIELDS, SEARCH_PARENTS, candidateBounds, validateCandidate } from "../src/golem/research-candidates.ts";
import { seed, digest } from "./schedule.mjs";
import { atomicJson, runJobs } from "./runner.mjs";

const TRAIN_FOES = ["golem-duelist", "golem-fencer", "golem-planner", "golem-miser"];
const HELD_BUILDS = ["wheel", "multileg", "plated", "pitch-blade"];
export const trainingBuilds = (builds) => builds.filter((build) => !HELD_BUILDS.includes(build.name));
const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
const score = (row, name) => row.winner === null ? 0.5 : row[row.winner] === name ? 1 : 0;

/** The parent and every candidate receive exactly the same opponent/body/seed cells. */
export function comparisonJobs(names, foes, builds, phase, repetitions = 1) {
  const jobs = [];
  for (const name of names) for (let rep = 0; rep < repetitions; rep++) {
    for (const foe of foes) for (const build of builds) {
      const block = `${phase}/${rep}/${foe}/${build.name}`;
      const seeds = [seed(block, "subject"), seed(block, "opponent")];
      for (let side = 0; side < 2; side++) {
        jobs.push({ id: `${name}/${block}/${side}`, round: 0, block,
          left: side ? foe : name, right: side ? name : foe, leftBuild: build.name, rightBuild: build.name,
          seeds: side ? [...seeds].reverse() : seeds });
      }
    }
  }
  return jobs;
}

/** Paired resampling of entire side-swap blocks, not correlated individual games. */
export function bootstrap(values, runSeed = 20260920, iterations = 4000) {
  if (!values.length || values.some((v) => !Number.isFinite(v))) throw new Error("bootstrap needs finite paired observations");
  const random = mulberry32(runSeed);
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    let total = 0;
    for (let j = 0; j < values.length; j++) total += values[Math.floor(random() * values.length)];
    samples.push(total / values.length);
  }
  samples.sort((a, b) => a - b);
  return { mean: mean(values), low: samples[Math.floor(iterations * 0.025)], high: samples[Math.floor(iterations * 0.975)], blocks: values.length };
}
function blockValues(rows, name, measure) {
  const blocks = new Map();
  for (const row of rows) if (row.status === "ok" && (row.left === name || row.right === name)) {
    const list = blocks.get(row.block) ?? [];
    list.push(measure(row, name)); blocks.set(row.block, list);
  }
  return new Map([...blocks].map(([key, values]) => {
    if (values.length !== 2) throw new Error(`incomplete paired block ${key}`);
    return [key, mean(values)];
  }));
}
export function pairedComparison(rows, a, b, measure = score) {
  const left = blockValues(rows, a, measure), right = blockValues(rows, b, measure);
  if (left.size !== right.size || [...left.keys()].some((key) => !right.has(key))) throw new Error("unpaired comparisons");
  return bootstrap([...left].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => value - right.get(key)));
}

function gaussian(random) {
  return Math.sqrt(-2 * Math.log(Math.max(1e-12, random()))) * Math.cos(2 * Math.PI * random());
}
function generationCandidates(parent, generation, distribution) {
  const random = mulberry32(seed("cem", parent, generation));
  return Array.from({ length: 16 }, (_, i) => {
    const parameters = Object.fromEntries(SEARCH_FIELDS.map((field) => {
      const [low, high] = candidateBounds(parent, field);
      const { center, sigma } = distribution[field];
      const value = i === 0 ? center : center + sigma * gaussian(random);
      return [field, Math.max(low, Math.min(high, value))];
    }));
    const candidate = { name: `golem-researched-${parent.slice(6)}-${generation}-${i}`,
      label: `Researched ${parent.slice(6)} ${generation}.${i}`, parent, parameters };
    validateCandidate(candidate); return candidate;
  });
}
function initialDistribution(parent) {
  return Object.fromEntries(SEARCH_FIELDS.map((field) => {
    const [low, high] = candidateBounds(parent, field);
    return [field, { center: SEARCH_PARENTS[parent][field], sigma: (high - low) / 3 }];
  }));
}

export async function search(directory, manifest, options) {
  const statePath = join(directory, "search.json");
  const identity = digest({ fingerprint: manifest.fingerprint, protocol: manifest.protocol, version: 1 });
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8"))
    : { version: 1, identity, styles: Object.fromEntries(Object.keys(SEARCH_PARENTS).map((parent) =>
      [parent, { generation: 0, distribution: initialDistribution(parent), history: [] }])) };
  if (state.identity !== identity) throw new Error("search fingerprint mismatch");
  const builds = trainingBuilds(manifest.builds);
  for (let generation = 0; generation < 8; generation++) for (const parent of Object.keys(SEARCH_PARENTS)) {
    const style = state.styles[parent];
    if (style.generation > generation) continue;
    if (Date.now() >= options.deadline) { atomicJson(statePath, state); return state; }
    const candidates = generationCandidates(parent, generation, style.distribution);
    const jobs = comparisonJobs([parent, ...candidates.map((c) => c.name)], TRAIN_FOES, builds, `train-${generation}`);
    const rows = await runJobs(join(directory, `${parent}-${generation}`), { ...manifest, candidates }, jobs, options);
    if (rows.length !== jobs.length || rows.some((row) => row.status !== "ok")) {
      atomicJson(statePath, state); return state;
    }
    const ranking = candidates.map((candidate) => ({ candidate,
      score: mean(rows.filter((r) => r.left === candidate.name || r.right === candidate.name).map((r) => score(r, candidate.name))),
      improvement: pairedComparison(rows, candidate.name, parent) })).sort((a, b) => b.score - a.score);
    const elites = ranking.slice(0, 4);
    for (const field of SEARCH_FIELDS) {
      const values = elites.map((e) => e.candidate.parameters[field]);
      const center = mean(values), [low, high] = candidateBounds(parent, field);
      style.distribution[field] = { center, sigma: Math.max((high - low) * 0.04,
        Math.sqrt(mean(values.map((v) => (v - center) ** 2)))) };
    }
    style.history.push({ generation, winner: ranking[0] });
    style.generation++;
    atomicJson(statePath, state);
    console.log(JSON.stringify({ search: parent, generation, score: ranking[0].score,
      gain: ranking[0].improvement.mean }));
  }
  return state;
}

export async function confirm(directory, manifest, state, options) {
  const finalistsPath = join(directory, "finalists.json");
  let finalists;
  if (existsSync(finalistsPath)) {
    const saved = JSON.parse(readFileSync(finalistsPath, "utf8"));
    if (saved.fingerprint !== manifest.fingerprint) throw new Error("finalist fingerprint mismatch");
    finalists = saved.candidates;
  } else {
    finalists = [];
    for (const [parent, style] of Object.entries(state.styles)) {
      const candidates = style.history.map((row) => row.winner.candidate);
      if (!candidates.length) continue;
      const selectionBuilds = trainingBuilds(manifest.builds);
      const jobs = comparisonJobs([parent, ...candidates.map((c) => c.name)], TRAIN_FOES, selectionBuilds, "selection");
      const rows = await runJobs(join(directory, `selection-${parent}`), { ...manifest, candidates }, jobs, options);
      if (rows.length !== jobs.length || rows.some((r) => r.status !== "ok")) return { status: "selection-incomplete", finalists: [] };
      candidates.sort((a, b) => pairedComparison(rows, b.name, parent).mean - pairedComparison(rows, a.name, parent).mean);
      finalists.push(candidates[0]);
    }
    atomicJson(finalistsPath, { fingerprint: manifest.fingerprint, candidates: finalists });
  }
  if (!finalists.length) return { status: "no-complete-search-generation", finalists: [] };
  // Same held-out jobs across styles permit paired behavioral comparisons too.
  const names = [...new Set(finalists.flatMap((c) => [c.parent, c.name]))];
  const foes = manifest.policies.filter((name) => !Object.hasOwn(SEARCH_PARENTS, name));
  const jobs = comparisonJobs(names, foes, manifest.builds, "final-confirmation", 2);
  const rows = await runJobs(join(directory, "confirmation"), { ...manifest, candidates: finalists }, jobs, options);
  if (rows.length !== jobs.length || rows.some((r) => r.status !== "ok")) return { status: "confirmation-incomplete", finalists };
  const reports = finalists.map((candidate) => ({ candidate,
    improvement: pairedComparison(rows, candidate.name, candidate.parent),
    unseenOpponents: pairedComparison(rows.filter((row) => !TRAIN_FOES.includes(
      names.includes(row.left) ? row.right : row.left)), candidate.name, candidate.parent),
    unseenBuilds: pairedComparison(rows.filter((row) => HELD_BUILDS.includes(row.leftBuild)), candidate.name, candidate.parent) }));
  const distinct = [];
  for (const report of reports.filter((r) => r.improvement.low > 0).sort((a, b) => b.improvement.mean - a.improvement.mean)) {
    const comparisons = distinct.map((other) => {
      const bands = ["attackRate", "retreatFraction", "blockRate", "range0", "range1", "range2", "range3"].map((key) => {
        const band = pairedComparison(rows, report.candidate.name, other.candidate.name, (row, name) => {
          const d = row.sides[row.left === name ? "left" : "right"].descriptors;
          return key.startsWith("range") ? d.range[Number(key.slice(-1))] : d[key];
        });
        return { descriptor: key, ...band };
      });
      return { against: other.candidate.name, bands, distinct: bands.some((b) => b.low > 0 || b.high < 0) };
    });
    report.diversity = comparisons;
    if (comparisons.every((c) => c.distinct)) distinct.push(report);
  }
  const result = { version: 1, fingerprint: manifest.fingerprint, status: "complete", reports, eligible: distinct.map((r) => r.candidate),
    // Statistical eligibility is deliberately separate from a recorded browser review.
    browserReviewRequired: distinct.map((r) => r.candidate.name) };
  atomicJson(join(directory, "confirmation.json"), result);
  return result;
}
