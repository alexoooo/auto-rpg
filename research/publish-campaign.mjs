/** Publish compact measured evidence; never registers policies or writes ratings. */
import { existsSync, readFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { digest } from "./schedule.mjs";
import { ROOT } from "./fingerprint.mjs";
import { atomicJson } from "./runner.mjs";
import { summarizeEvidence } from "./lab/evidence.mjs";

const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const recordSummary = (record) => {
  const last = record.steps.at(-1), c = record.config;
  return { replayId: record.id, fingerprint: record.fingerprint, seed: c.seed,
    builds: [c.leftBuild, c.rightBuild], surface: c.surface, controlBaseline: c.controlBaseline,
    controlledPolicy: c.left.kind === "network" ? { kind: "network", modelSha256: digest(c.left.model) } : c.left,
    opponent: c.right.kind === "network" ? { kind: "network", modelSha256: digest(c.right.model) } : c.right,
    controlDecisions: record.steps.length, simulatedSeconds: last?.clock,
    winner: last?.winner, vitality: last?.vitality, terminated: last?.terminated, truncated: last?.truncated };
};
const runs = [];
for (const name of readdirSync(join(ROOT, "research/runs")).filter((n) => n.startsWith("wave3-") && n !== "wave3-budget").sort()) {
  const directory = join(ROOT, "research/runs", name), manifest = join(directory, "manifest.json");
  if (!existsSync(manifest)) {
    if (existsSync(join(directory, "dataset.json"))) runs.push({ directory: `research/runs/${name}`, dataset: read(join(directory, "dataset.json")) });
    continue;
  }
  const entry = { directory: `research/runs/${name}`, manifest: read(manifest), training: [], evaluations: [] };
  for (const child of readdirSync(directory, { withFileTypes: true })) {
    if (child.isDirectory() && existsSync(join(directory, child.name, "training.json"))) {
      entry.training.push({ path: child.name, ...read(join(directory, child.name, "training.json")),
        modelSha256: digest(read(join(directory, child.name, "model.json"))),
        modelFileSha256: hash(join(directory, child.name, "model.json")) });
    }
    if (child.isFile() && /^evaluation-.*\.json$/.test(child.name)) {
      for (const result of read(join(directory, child.name))) {
        const { model, ...policy } = result.policy;
        entry.evaluations.push({ file: child.name, ...result,
          policy: model ? { ...policy, modelSha256: digest(model) } : policy,
          summary: result.rows.length ? summarizeEvidence(result.rows) : null });
      }
    }
  }
  for (const file of ["model-calibration.json", "replay-verification.json", "archive.json"]) {
    if (existsSync(join(directory, file))) entry[file] = read(join(directory, file));
  }
  if (existsSync(join(directory, "replay.json"))) entry.replay = recordSummary(read(join(directory, "replay.json")));
  if (existsSync(join(directory, "refit.json"))) {
    const r = read(join(directory, "refit.json"));
    entry.refit = { bouts: r.outcomes.length, coverage: r.coverage, samples: r.terminalModel?.samples,
      terminalSamples: r.terminalRecords?.filter((s) => s.next === null).length };
  }
  if (existsSync(join(directory, "teacher-campaign.json"))) {
    const r = read(join(directory, "teacher-campaign.json"));
    entry.teachers = { seed: r.seed, status: r.status,
      corpus: r.corpus.map((c) => ({ build: c.build, replayId: c.record.id, decisions: c.record.steps.length,
        seconds: c.record.steps.at(-1)?.clock, scenarios: c.scenarios })),
      queries: r.queries.map(({ replayId, index, candidates, evaluations, baselineValue, value, build, scenario, wallSeconds }) =>
        ({ replayId, index, candidates, evaluations, baselineValue, value, build, scenario, wallSeconds })) };
  }
  if (existsSync(join(directory, "population.json"))) {
    const r = read(join(directory, "population.json"));
    entry.population = { seed: r.seed, status: r.status, champion: r.champion,
      generations: r.history.map((g) => ({ generation: g.generation,
        scores: g.evaluated.map((e) => ({ score: e.score, behavior: e.behavior })) })),
      archiveCells: Object.keys(r.archive) };
  }
  if (existsSync(join(directory, "dagger-campaign.json"))) {
    const r = read(join(directory, "dagger-campaign.json"));
    entry.dagger = { status: r.status, modelSha256: digest(r.model), rounds: r.rounds.map((g) =>
      ({ round: g.round, datasetRows: g.datasetRows, student: g.student, queries: g.queries.length,
        improvements: g.queries.filter((q) => q.source === "teacher-improvement").length })) };
  }
  for (const tier of ["privileged", "fair"]) {
    const path = join(directory, `reference-${tier}.json`);
    if (!existsSync(path)) continue;
    const r = read(path), last = r.record.steps.at(-1);
    entry[`reference-${tier}`] = { status: r.status, search: r.search, decisions: r.labels.length,
      simulatedSeconds: last.clock, winner: last.winner, terminated: last.terminated, truncated: last.truncated,
      record: recordSummary(r.record) };
  }
  runs.push(entry);
}
const directory = join(ROOT, "research/lab/results");
mkdirSync(directory, { recursive: true });
atomicJson(join(directory, "campaign.json"), { publishedAt: new Date().toISOString(),
  status: "ongoing research; no automatic promotion", budget: read(join(ROOT, "research/runs/wave3-budget/budget.json")), runs });
console.log(`Published ${runs.length} run summaries; ratings unchanged.`);
