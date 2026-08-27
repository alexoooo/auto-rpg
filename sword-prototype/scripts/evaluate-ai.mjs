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

import { candidateFromRawRows, headUtilisation, mergeBehaviourRecord, nextTournamentBatch,
  recomputeTournamentReport, validateTournamentManifest } from "../src/learning/tournament.ts";
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
// Every decision, not every action: the joint map has one key per decision's
// whole tuple, so this sum is the same denominator it always was.
//
// **Candidate rows only, on both sides of the ratio.** The three controls are
// built by `mindFactoryForTournament` as `() => control`, which discards
// `onDecision`, so a control row contributes bout seconds and zero decisions. A
// rate summed over every row would be diluted by exactly the control fraction --
// three quarters of it, at three controls to one candidate -- and would move
// when the control set changed rather than when a candidate did.
const candidateNames = new Set(manifest.candidates.map((entry) => entry.name));
const measured = rawRows.filter((row) => candidateNames.has(row.candidate));
const decisions = measured.reduce((sum, row) => sum + Object.values(row.tacticCounts).reduce((a, b) => a + b, 0), 0);
// **`decisionsPerSecond` was `decisions / wallSeconds` and it was meaningless.**
// `wallSeconds` is the wall clock of THIS invocation, which parses two JSON
// files and aggregates them; no bout runs inside it. When `--run-next` executes
// bouts the process exits at `process.exit(0)` above and never reaches this
// line, so **the denominator has never once contained a simulation**. It is
// inversely proportional to how fast the reporter is and carries no term at all
// for how long the fights took -- so re-reporting the same finished tournament
// on a faster machine "improves" the throughput of bouts that already ran.
// Measured on a two-cell synthetic report (`.review/rem26/makereport.mjs`):
// 0.024 s of reporting, 192 decisions, 7,900 "decisions/sec"; an earlier review
// measured 0.064 s and 66,682 on a real one. Two numbers an order of magnitude
// apart off records with the same fights in them.
//
// The rate that is both true and comparable across candidates is per *simulated*
// second, and the rows carry it: `row.seconds` is the bout's own clock. A policy
// at `MIN_PERSISTENCE` decides about ten times a simulated second and one at
// `MAX_PERSISTENCE` about two and a half, so this number says something about
// the controller rather than about the machine that reported it.
const boutSeconds = measured.reduce((sum, row) => sum + row.seconds, 0);
// **Per candidate AND per cell.** `candidateFromRawRows` folds the cell keys
// away, so the pooled figure alone cannot answer the question the table in
// `headUtilisation`'s docstring is about -- an effector head reads as collapsed
// on `bow+empty` and free on `empty+empty` for reasons that have nothing to do
// with the candidate. `rawRows` keeps `job` beside the counts, so the grouping
// is available here and nowhere else.
//
// **`algorithm` remains provenance, but stance no longer needs it to explain a
// missing head.** `lookaheadMind` declares one stance option; learned controllers
// declare their head width; and the executor records a free stance only when
// both that declaration and the body make it meaningful. Thus look-ahead and a
// centipede report `freeChoiceDecisions: 0`, while a learned humanoid head that
// collapsed reports a non-zero free denominator beside the same one-option
// marginal.
//
// **The `persistence` row does not need the algorithm name, and that is the
// difference worth reading.** It was the same trap twice over: PPO wrote the
// constant `UNLEARNED_PERSISTENCE` (0.4) until its sixth head landed, and until
// `persistenceCounts` existed `headUtilisation` had no dwell row at all --
// `TacticTuple` is the five-name joint key -- so a candidate whose dwell
// collapsed onto one bin printed exactly what one sweeping the grid printed, for
// every algorithm including the two that learn it. The row now carries its own
// evidence: `freeChoiceDecisions: 0` means the controller declared no dwell head
// (today only `lookahead`, which also has no clock term to spend one), and
// `freeChoiceDecisions` equal to `decisions` with `chosen: 1` means a head that
// had all eight bins and used one. `dagger` and `neat-qd` decide all five tuple
// heads and a continuous dwell; `ppo` decides a dwell bin.
const cellName = (row) => `${row.job.unit}/${row.job.loadout}`;
const utilisationFor = (rows) => headUtilisation(mergeBehaviourRecord(rows));
const utilisation = aggregates.map((candidate) => {
  const mine = rawRows.filter((row) => row.candidate === candidate.name);
  const cells = [...new Set(mine.map(cellName))].sort();
  return { name: candidate.name, algorithm: candidate.algorithm, heads: headUtilisation(candidate),
    cells: cells.map((name) => ({ name, heads: utilisationFor(mine.filter((row) => cellName(row) === name)) })) };
});
const wallSeconds = (performance.now() - started) / 1000;
const report = { version: 1, manifest, manifestFileSha256: sha256(manifestBytes), rawRows, aggregates, utilisation,
  verdict, wallSeconds, boutSeconds, decisionsPerBoutSecond: decisions / Math.max(1e-9, boutSeconds) };
if (value("output")) await writeFile(value("output"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
