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
const runs = [];
for (const name of readdirSync(join(ROOT, "research/runs")).filter((n) => n.startsWith("wave3-") && n !== "wave3-budget").sort()) {
  const directory = join(ROOT, "research/runs", name), manifest = join(directory, "manifest.json");
  if (!existsSync(manifest)) continue;
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
  if (existsSync(join(directory, "refit.json"))) {
    const r = read(join(directory, "refit.json"));
    entry.refit = { bouts: r.outcomes.length, coverage: r.coverage, samples: r.terminalModel?.samples,
      terminalSamples: r.terminalRecords?.filter((s) => s.next === null).length };
  }
  runs.push(entry);
}
const directory = join(ROOT, "research/lab/results");
mkdirSync(directory, { recursive: true });
atomicJson(join(directory, "campaign.json"), { publishedAt: new Date().toISOString(),
  status: "ongoing research; no automatic promotion", budget: read(join(ROOT, "research/runs/wave3-budget/budget.json")), runs });
console.log(`Published ${runs.length} run summaries; ratings unchanged.`);
