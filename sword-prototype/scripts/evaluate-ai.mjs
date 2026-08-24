// Engagement and blind-tournament reporter. Physics rows come from the same
// evaluate-options/measure harness; this file owns aggregation and test quarantine.
import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";

import { candidateFromRawRows, nextTournamentBatch, recomputeTournamentReport, validateTournamentManifest } from "../src/learning/tournament.ts";
import { executeNextTournamentRows, loadFrozenArtifacts } from "./tournament-executor.mjs";

const argv = process.argv.slice(2);
const value = (name, fallback = null) => {
  const at = argv.indexOf(`--${name}`); return at >= 0 && argv[at + 1] !== undefined ? argv[at + 1] : fallback;
};
const split = value("split", "train");
if (!["train", "validation", "test"].includes(split)) throw new Error(`unknown evaluation split "${split}"`);
const started = performance.now();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const quantile = (values, fraction) => {
  if (!values.length) return null; const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)];
};

if (split !== "test") {
  // evaluate-options exports the raw factual records after running its
  // fresh-Havok corpus. Keeping that module as ai:options preserves the old
  // command/parity entry point while this command owns promotion summaries.
  const { output } = await import("./evaluate-options.mjs");
  const rawRows = output.records.filter((row) => row.split === split).map((row) => ({ ...row,
    behavior: Object.fromEntries(Object.entries(row.behavior).filter(([name]) => !name.startsWith("_"))) }));
  const groups = [...new Set(rawRows.map((row) => row.controller))].sort().map((controller) => {
    const rows = rawRows.filter((row) => row.controller === controller);
    const opportunities = rows.reduce((sum, row) => sum + (row.behavior.engagement?.viableOpportunities ?? 0), 0);
    const attacks = rows.reduce((sum, row) => sum + (row.behavior.engagement?.attacksInWindow ?? 0), 0);
    const contacts = rows.reduce((sum, row) => sum + (row.behavior.engagement?.damagingContactsInWindow ?? 0), 0);
    return { controller, rows: rows.length, winRate: rows.filter((row) => row.behavior.win).length / Math.max(1, rows.length),
      opportunityAttackRate: attacks / Math.max(1, opportunities), attackContactRate: contacts / Math.max(1, attacks),
      firstAttackP90Seconds: quantile(rows.map((row) => row.behavior.engagement?.firstAttackSeconds).filter(Number.isFinite), 0.9),
      nearRangeStallShare: rows.reduce((sum, row) => sum + (row.behavior.engagement?.nearRangeStallSeconds ?? 0), 0) /
        Math.max(1e-9, rows.reduce((sum, row) => sum + row.duration, 0)) };
  });
  const cellRows = rawRows.map((row) => ({ cell: row.cell, controller: row.controller, mirror: row.mirror,
    win: row.behavior.win, opportunityAttackRate: (row.behavior.engagement?.attacksInWindow ?? 0) /
      Math.max(1, row.behavior.engagement?.viableOpportunities ?? 0), attackContactRate:
      (row.behavior.engagement?.damagingContactsInWindow ?? 0) / Math.max(1, row.behavior.engagement?.attacksInWindow ?? 0) }));
  const report = { version: 1, split, seed: output.baseSeed, rawRows, macro: groups,
    worstCell: [...cellRows].sort((a, b) => a.opportunityAttackRate - b.opportunityAttackRate ||
      a.attackContactRate - b.attackContactRate || a.cell.localeCompare(b.cell))[0] ?? null,
    wallSeconds: (performance.now() - started) / 1000 };
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (argv.includes("--write-engagement-baseline")) {
    const path = new URL("../asset-src/learning/engagement-baseline-v1.json", import.meta.url);
    await writeFile(path, text); console.log(`wrote ${path.pathname}`);
  }
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

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
