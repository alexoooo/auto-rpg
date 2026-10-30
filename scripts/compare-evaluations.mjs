/** Read historical evaluation evidence; this command neither plays cases nor writes records. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EVALUATIONS } from "../src/evaluation/evaluations.ts";
import { compareRecords, selectedSubject } from "../src/evaluation/record-comparison.ts";
import { readRecord } from "../src/evaluation/record.ts";
import { BUILD_IDENTITY, isBuildInput } from "./build-identity.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "pipe"] });

/** The entrants whose kinds (`<entrant>:<kind>`) a subject's config names, each once. */
function scopesIn(value, into = new Set()) {
  if (typeof value === "object" && value !== null) {
    const match = typeof value.kind === "string" ? /^([a-z0-9][a-z0-9-]*):/.exec(value.kind) : null;
    if (match) into.add(match[1]);
    for (const inner of Object.values(value)) scopesIn(inner, into);
  }
  return [...into];
}

/** Git verifies source provenance; changes outside the selected entrants qualify the context. */
export function sourceContext(baseline, candidate, subject, previous, runGit = git) {
  const commits = [baseline.header.commit, candidate.header.commit];
  if (commits.some(commit => !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commit ?? ""))) return ["recorded Git provenance is unknown"];
  try {
    for (const commit of commits) runGit("cat-file", "-e", `${commit}^{commit}`);
    const entrants = [baseline, candidate].flatMap((record, index) => record.header.subjects
      .filter(one => selectedSubject(one.id, index === 0 ? previous : subject)).flatMap(one => scopesIn(one.value?.mind ?? one.value)));
    const owned = file => entrants.some(name => file.startsWith(`src/entrants/${name}/`) || file.startsWith(`assets/entrants/${name}/`));
    const changes = runGit("diff", "--name-only", "--no-renames", "-z", ...commits, "--").split("\0").filter(Boolean);
    return changes.filter(file => isBuildInput(file) && !owned(file)).map(file => `shared runtime input changed: ${file}`);
  } catch {
    return ["recorded Git commits are unavailable; shared source equivalence is unknown"];
  }
}

const estimate = value => value === null ? "none" : `${value.value.toFixed(3)} (${value.low.toFixed(3)} to ${value.high.toFixed(3)})`;

/** Compare two kept records with an explicitly selected subject or entrant family. */
function main(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    subject: { type: "string" }, previous: { type: "string" }, json: { type: "boolean" },
  } });
  if (positionals.length !== 2 || !values.subject)
    throw new Error("npm run compare -- <baseline-record> <candidate-record> --subject <id> [--previous <id>] [--json]");
  const [baseline, candidate] = positionals.map(name => ({ name, ...readRecord(readFileSync(name, "utf8"), name) }));
  if (baseline.header.evaluation !== candidate.header.evaluation) throw new Error("records name different evaluations; their figures cannot be paired");
  const evaluation = EVALUATIONS[candidate.header.evaluation];
  if (!evaluation) throw new Error(`no figure reader for evaluation ${candidate.header.evaluation}`);
  const subject = values.subject, previous = values.previous ?? subject;
  const report = { ...compareRecords(baseline, candidate, subject, previous, evaluation.figures,
    sourceContext(baseline, candidate, subject, previous)), reader: { evaluation: evaluation.id, build: BUILD_IDENTITY } };
  if (values.json) { console.log(JSON.stringify(report, null, 2)); return; }
  console.log(`${baseline.name} (${baseline.header.commit}) -> ${candidate.name} (${candidate.header.commit})`);
  console.log(`Figures use the current ${evaluation.id} readers; build ${BUILD_IDENTITY}.`);
  console.log(report.context.length ? `Descriptive differences; changed or unknown context:\n${report.context.map(reason => `  ${reason}`).join("\n")}`
    : report.coverage.paired ? "Matched evidence; shared context and opponent identities agree. Differences are candidate less baseline."
    : "No complete, fault-free matched units; inspect coverage and opponent versions below.");
  console.log(`${report.coverage.paired} complete, fault-free matched units.`);
  for (const side of ["baseline", "candidate"]) {
    const coverage = report.coverage[side];
    console.log(`${side}: ${coverage.units} units; ${coverage.incomplete.length} incomplete; ${coverage.faults.length} with faults; ${coverage.unmatched.length} unmatched; ${coverage.withinSubject.length} within-subject cases excluded.`);
    for (const unit of coverage.unmatched) console.log(`  unmatched ${unit.subject} (${unit.version})${unit.opponent ? ` v ${unit.opponent} (${unit.opponentVersion})` : ""}: ${JSON.stringify(unit.condition)} [${unit.keys.join(", ")}]`);
    for (const unit of coverage.faults) for (const fault of unit.faults) console.log(`  fault ${fault.key}: ${fault.message}`);
  }
  const table = figures => {
    console.log("\n| Figure | Pairs | Baseline (95 %) | Candidate (95 %) | Difference (95 %) |\n|---|---|---|---|---|");
    for (const figure of figures) console.log(`| ${figure.figure}, ${figure.unit} (${figure.better} better) | ${figure.pairs} | ${estimate(figure.baseline)} | ${estimate(figure.candidate)} | ${estimate(figure.difference)} |`);
  };
  table(report.figures);
  for (const member of report.opponents) if (member.opponent !== null) { console.log(`\nAgainst ${member.opponent}`); table(member.figures); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
