// The blind held-out tournament reporter. Physics rows come from the frozen
// manifest through `tournament-executor.mjs`; this file owns aggregation, the
// recomputed verdict and the test quarantine.
//
//     npm run ai:evaluate -- --split test --manifest <path> --rows <path>
//         [--run-next --batch-size 64 --artifact <candidate>=<path> ...]
//         [--output <path>]
//
// `--split test` is the only split this command answers, and that is a
// narrowing rather than an oversight: the train and validation engagement
// summaries were produced by re-running `evaluate-options.mjs`, whose whole
// subject was parity with the superseded option executor. Session 17 deleted
// that module and the `--write-engagement-baseline` switch that froze its
// output, and `docs/measurements.md` keeps the one conclusion the train
// baseline reached. Ask for a train or validation split and you get a refusal
// naming the split rather than a report of nothing.
import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";

import { candidateFromRawRows, nextTournamentBatch, recomputeTournamentReport, validateTournamentManifest } from "../src/learning/tournament.ts";
import { executeNextTournamentRows, loadFrozenArtifacts } from "./tournament-executor.mjs";

const argv = process.argv.slice(2);
const value = (name, fallback = null) => {
  const at = argv.indexOf(`--${name}`); return at >= 0 && argv[at + 1] !== undefined ? argv[at + 1] : fallback;
};
const split = value("split", "test");
if (!["train", "validation", "test"].includes(split)) throw new Error(`unknown evaluation split "${split}"`);
if (split !== "test") {
  throw new Error(`--split ${split} is no longer available: ai:evaluate answers only the held-out test split, ` +
    "because the train/validation engagement corpus ran through the deleted evaluate-options.mjs");
}
if (argv.includes("--write-engagement-baseline")) {
  throw new Error("--write-engagement-baseline is gone with asset-src/learning/engagement-baseline-v1.json; " +
    "its conclusion is in docs/measurements.md");
}
const started = performance.now();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const manifestPath = value("manifest");
if (!manifestPath) throw new Error("--manifest is required before the held-out test can be opened");
const manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes);
validateTournamentManifest(manifest);
if (sha256(manifestBytes).length !== 64) throw new Error("could not digest tournament manifest");
const rowsPath = value("rows");
if (!rowsPath) {
  throw new Error("held-out tournament artifacts have no completed raw rows; pass --rows to resume the frozen indexed run");
}
const rawRows = JSON.parse(await readFile(rowsPath, "utf8"));
const batchSize = Number(value("batch-size", 64));
const next = nextTournamentBatch(rawRows, manifest, batchSize);
if (next.length) {
  if (argv.includes("--run-next")) {
    const bindings = argv.flatMap((entry, index) => entry === "--artifact" ? [argv[index + 1]] : []).filter(Boolean);
    const bytes = new Map();
    for (const binding of bindings) {
      const separator = binding.indexOf("="); if (separator <= 0) throw new Error(`invalid --artifact binding "${binding}"; expected candidate=path`);
      const name = binding.slice(0, separator); if (bytes.has(name)) throw new Error(`duplicate --artifact binding for "${name}"`);
      bytes.set(name, new Uint8Array(await readFile(binding.slice(separator + 1))));
    }
    const artifacts = loadFrozenArtifacts(manifest, bytes); const temporary = `${rowsPath}.tmp-${process.pid}`;
    const completed = await executeNextTournamentRows({ manifest, rows: rawRows, artifacts, maximum: batchSize,
      async onRow(merged) { await writeFile(temporary, `${JSON.stringify(merged, null, 2)}\n`); await rename(temporary, rowsPath); } });
    console.log(JSON.stringify({ version: 1, status: "advanced", manifestDigest: manifest.digest,
      completedRows: completed.length, remainingRows: nextTournamentBatch(completed, manifest, 1).length ? "present" : 0 }, null, 2));
    process.exit(0);
  }
  const resumePlan = { version: 1, status: "incomplete", manifestDigest: manifest.digest, completedRows: rawRows.length,
    next: next.map((entry) => ({ ...entry, job: manifest.jobs[entry.index] })) };
  if (value("output")) await writeFile(value("output"), `${JSON.stringify(resumePlan, null, 2)}\n`);
  console.log(JSON.stringify(resumePlan, null, 2)); process.exit(0);
}
const verdict = recomputeTournamentReport({ manifest, rawRows });
const aggregates = manifest.candidates.map((candidate) => candidateFromRawRows(candidate, rawRows));
const decisions = rawRows.reduce((sum, row) => sum + Object.values(row.actionCounts).reduce((a, b) => a + b, 0), 0);
const wallSeconds = (performance.now() - started) / 1000;
const report = { version: 1, manifest, manifestFileSha256: sha256(manifestBytes), rawRows, aggregates, verdict,
  wallSeconds, decisionsPerSecond: decisions / Math.max(1e-9, wallSeconds) };
if (value("output")) await writeFile(value("output"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
