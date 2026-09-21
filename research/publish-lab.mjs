/** Compact smoke evidence; explicit inputs, never promote or modify production ratings. */
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { atomicJson } from "./runner.mjs";
import { digest } from "./schedule.mjs";
const [validationPath, finalPath] = process.argv.slice(2).map((p) => resolve(p));
if (!validationPath || !finalPath) throw new Error("usage: node research/publish-lab.mjs TRAIN_RUN FINAL_RUN");
const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const output = resolve("research/lab/results");
mkdirSync(output, { recursive: true });
const training = [];
for (const directory of [validationPath, finalPath]) {
  for (const folder of readdirSync(directory, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    let report;
    try { report = read(join(directory, folder.name, "training.json")); } catch (e) { if (e.code === "ENOENT") continue; throw e; }
    const model = read(join(directory, folder.name, "model.json"));
    const filename = `${folder.name}.json`;
    atomicJson(join(output, filename), model);
    training.push({ ...report, artifact: filename, modelHash: digest(model), source: read(join(directory, "manifest.json")) });
  }
}
const evaluations = readdirSync(finalPath).filter((n) => /^evaluation-[0-9a-f]+\.json$/.test(n)).map((n) => ({
  file: n, results: read(join(finalPath, n)).map(({ policy, ...result }) => ({ ...result,
    policy: policy.kind === "network" ? { kind: "network", modelHash: digest(policy.model) } : policy })) }));
const refit = read(join(finalPath, "refit.json"));
const teachers = read(join(finalPath, "teacher.json"));
const stripReference = (r) => ({ tier: r.tier, status: r.status, decisions: r.labels.length,
  simulatedSeconds: r.record.steps.at(-1)?.clock, labels: r.labels });
atomicJson(join(output, "smoke.json"), { evaluatedAt: new Date().toISOString(), status: "feasibility only; no promoted policy",
  manifest: read(join(finalPath, "manifest.json")), training, evaluations,
  replay: read(join(finalPath, "replay-verification.json")), scenarios: read(join(finalPath, "scenarios.json")),
  teacher: teachers, studentQueries: read(join(finalPath, "student-teacher.json")),
  references: ["privileged", "fair"].map((tier) => stripReference(read(join(finalPath, `reference-${tier}.json`)))),
  refit: { bouts: refit.outcomes.length, windows: refit.records.length, coverage: refit.coverage, limitations: refit.limitations },
  budget: read(resolve("research/runs/wave2-budget/budget.json")) });
console.log(output);
