import { availableParallelism } from "node:os";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { saveConstruct } from "../src/construct/codec.ts";
import { canonicalIntegrityJson, integrityDigest } from "../src/construct/integrity.ts";
import { CONSTRUCT_LAB_ARENA_DIGEST, constructLabConfigDigest } from "../src/construct/lab-config.ts";
import { createConstructBoutJobs } from "../src/construct/matchup.ts";
import { CONSTRUCT_LEARNING_SCHEDULE, CONSTRUCT_LEARNING_SCHEDULE_DIGEST } from
  "../src/construct/learning/schedule.ts";
import { WARDEN_SENSORS, wardenBlueprint, wardenControl, wardenProgram } from "../src/construct/warden.ts";
import { runConstructBatch } from "./run-construct-bouts.mjs";

const canonicalFiles = async (directory) => Promise.all(["rows.jsonl", "state.json", "report.json"]
  .map((name) => readFile(path.join(directory, name), "utf8")));
export const constructQualificationSourcePaths = async () => {
  // Over-inclusion is intentional: a cosmetic edit may force a new evidence label, while an
  // omitted parser, capability or compiler dependency would let behavior move under an old one.
  const source = (await readdir(new URL("../src/", import.meta.url), { recursive: true }))
    // The qualification identity is (scheduleDigest, sourceDigest). Keeping the schedule in
    // both makes pinning entryGate.sourceDigest self-referential: writing the observed digest
    // changes the file that produced it. The schedule remains fully covered by scheduleDigest.
    .filter((name) => name.endsWith(".ts") && name.replaceAll("\\", "/") !==
      "construct/learning/schedule.ts")
    .map((name) => `src/${name.replaceAll("\\", "/")}`);
  const scripts = (await readdir(new URL("./", import.meta.url)))
    .filter((name) => name.endsWith(".mjs") && (name.startsWith("construct-") ||
      name === "run-construct-bouts.mjs" || name === "qualify-construct-learning-entry.mjs"))
    .map((name) => `scripts/${name}`);
  return [...source, ...scripts, "package.json", "package-lock.json"].sort();
};
export const constructQualificationSourceFingerprint = async (read = readFile) => integrityDigest([
  ...(await Promise.all((await constructQualificationSourcePaths())
    .map((name) => read(new URL(`../${name}`, import.meta.url), "utf8")))),
  canonicalIntegrityJson({ node: process.version, platform: process.platform, arch: process.arch }),
].join("\0"));

const saved = saveConstruct("Authored Warden qualification", wardenBlueprint("crossbow"),
  wardenControl("crossbow"), wardenProgram("crossbow"), WARDEN_SENSORS);

const assignment = CONSTRUCT_LEARNING_SCHEDULE.authoredQualification;
const jobs = createConstructBoutJobs(saved, saved, assignment.seeds, {
  mirrored: assignment.mirrored,
  arenaDigest: CONSTRUCT_LAB_ARENA_DIGEST,
  configDigest: constructLabConfigDigest(assignment.boutCapSteps),
  boutCapSteps: assignment.boutCapSteps,
});

const actionNames = (rows) => new Set(rows.flatMap((row) => row.actionTrace.map((entry) =>
  entry.slice(entry.lastIndexOf("/") + 1))));

export function authoredQualificationActionFailures(rows, required = assignment.requiredActions) {
  return Object.freeze(rows.flatMap((row) => {
    const actions = actionNames([row]);
    const missing = required.filter((action) => !actions.has(action));
    return missing.length ? [Object.freeze({ job: row.job, seed: row.seed, mirrored: row.mirrored,
      missing: Object.freeze(missing) })] : [];
  }));
}

const MISSING_CAPABILITY_ROW = "capability row disappeared from the runtime snapshot";

export function authoredQualificationCapabilityFailures(rows) {
  return Object.freeze(rows.flatMap((row) => row.capabilityLosses
    .filter(({ reason }) => reason === MISSING_CAPABILITY_ROW)
    .map(({ id, reason }) => Object.freeze({ job: row.job, seed: row.seed, mirrored: row.mirrored,
      id, reason }))));
}

const QUALIFICATION_EXPECTATIONS = Object.freeze(["rejected", "qualified", "recorded"]);

export function parseConstructQualificationArgs(argv) {
  const outAt = argv.indexOf("--out");
  if (outAt < 0 || !argv[outAt + 1] || argv[outAt + 1].startsWith("--")) {
    throw new Error("construct entry qualification requires --out <directory>");
  }
  const workersAt = argv.indexOf("--workers");
  const workersValue = workersAt < 0 ? undefined : argv[workersAt + 1];
  const workers = workersValue === undefined ? undefined : Number(workersValue);
  if (workersAt >= 0 && (!workersValue || workersValue.startsWith("--") ||
    !Number.isSafeInteger(workers) || workers <= 0)) {
    throw new Error("construct entry qualification --workers must be a positive safe integer");
  }
  const expectationIndexes = argv.flatMap((value, index) => value === "--expect" ? [index] : []);
  if (expectationIndexes.length > 1) {
    throw new Error("construct entry qualification accepts --expect only once");
  }
  const expectAt = expectationIndexes[0];
  const expectation = expectAt === undefined ? undefined : argv[expectAt + 1];
  if (expectAt !== undefined && (!expectation || expectation.startsWith("--"))) {
    throw new Error("construct entry qualification --expect requires rejected, qualified or recorded");
  }
  if (expectation !== undefined && !QUALIFICATION_EXPECTATIONS.includes(expectation)) {
    throw new Error(`construct entry qualification --expect does not accept ${JSON.stringify(expectation)}; ` +
      "expected rejected, qualified or recorded");
  }
  return Object.freeze({ outDirectory: argv[outAt + 1], workers, expectation });
}

export function assertConstructQualificationExpectation(expectation, actual) {
  if (actual !== "rejected" && actual !== "qualified") {
    throw new Error(`construct entry qualification produced invalid terminal status ${JSON.stringify(actual)}`);
  }
  if (expectation === undefined) return;
  if (!QUALIFICATION_EXPECTATIONS.includes(expectation)) {
    throw new Error(`construct entry qualification received invalid expectation ${JSON.stringify(expectation)}`);
  }
  if (expectation !== "recorded" && expectation !== actual) {
    throw new Error(`construct entry qualification expected ${expectation} but actual status was ${actual}`);
  }
}

export async function qualifyConstructLearningEntry(outDirectory, options = {}) {
  const output = path.resolve(outDirectory);
  await mkdir(output, { recursive: true });
  const defaultWorkers = availableParallelism();
  const sourceDigest = await constructQualificationSourceFingerprint();
  const runs = [];
  let control = null;
  const runPlan = options.workers === undefined ? assignment.bracket : Object.freeze([`current-${options.workers}`]);
  for (let index = 0; index < runPlan.length; index += 1) {
    const label = runPlan[index];
    const workers = options.workers ?? (label === "subject-default" ? defaultWorkers :
      Number(label.slice(label.lastIndexOf("-") + 1)));
    const directory = path.join(output, `${String(index).padStart(2, "0")}-${label}`);
    if (await constructQualificationSourceFingerprint() !== sourceDigest) throw new Error("construct runtime source changed during qualification");
    const result = await runConstructBatch({ jobs, outDirectory: directory, workers });
    if (await constructQualificationSourceFingerprint() !== sourceDigest) throw new Error("construct runtime source changed during qualification");
    const canonical = await canonicalFiles(directory);
    if (control === null) control = canonical;
    else if (canonical.some((bytes, at) => bytes !== control[at])) {
      throw new Error(`${label} changed canonical construct rows, state or report bytes`);
    }
    runs.push(Object.freeze({ label, workers, telemetry: result.telemetry }));
  }
  const rows = JSON.parse(`[${control[0].trim().split("\n").join(",")}]`);
  const actions = actionNames(rows);
  const actionFailures = authoredQualificationActionFailures(rows);
  const damagingRows = rows.filter((row) => row.left.damage > 0 && row.right.damage > 0).length;
  const timeCaps = rows.filter((row) => row.ending === "time").length;
  const stuckSteps = rows.reduce((sum, row) => sum + row.left.stuckSteps + row.right.stuckSteps, 0);
  const capabilityLosses = rows.reduce((sum, row) => sum + row.left.capabilityLosses + row.right.capabilityLosses, 0);
  const capabilityFailures = authoredQualificationCapabilityFailures(rows);
  const reasons = [];
  if (damagingRows !== rows.length) reasons.push(`${rows.length - damagingRows} row(s) lack bilateral physical damage`);
  if (actionFailures.length) reasons.push(`${actionFailures.length} row(s) lack required authored actions: ${actionFailures
    .map(({ job, missing }) => `job ${job} missing ${missing.join(",")}`).join("; ")}`);
  if (stuckSteps > 0) reasons.push(`${stuckSteps} stuck physics step(s)`);
  if (capabilityFailures.length) reasons.push(`${capabilityFailures.length} unexplained capability loss(es): ${capabilityFailures
    .map(({ job, id }) => `job ${job} ${id}`).join("; ")}`);
  if (timeCaps * 2 >= rows.length) reasons.push(`${timeCaps}/${rows.length} bouts reached the time cap; meaningful completions are not the majority`);
  const report = Object.freeze({
    version: 2,
    status: reasons.length === 0 ? "qualified" : "rejected",
    scheduleDigest: CONSTRUCT_LEARNING_SCHEDULE_DIGEST,
    sourceDigest,
    runDigest: runs[0]?.telemetry.runDigest ?? null,
    corpus: Object.freeze({ seeds: assignment.seeds, mirrors: assignment.mirrored, rows: rows.length,
      damagingRows, timeCaps, stuckSteps, capabilityLosses,
      unexplainedCapabilityLosses: capabilityFailures.length, capabilityFailures,
      actions: Object.freeze([...actions].sort()), actionFailures }),
    canonicalParity: runPlan.length > 1 ? true : null,
    topologyEvidence: runPlan.length > 1 ? "measured by this bracket" : "reused from the frozen 1/2/4/8/default bracket",
    runs: Object.freeze(runs),
    reasons: Object.freeze(reasons),
  });
  await writeFile(path.join(output, "qualification.json"), canonicalIntegrityJson(report) + "\n", "utf8");
  return report;
}

export async function runConstructQualificationCli(argv = process.argv.slice(2),
  qualify = qualifyConstructLearningEntry, output = process.stdout) {
  const { outDirectory, workers, expectation } = parseConstructQualificationArgs(argv);
  const report = await qualify(outDirectory, { workers });
  output.write(`${canonicalIntegrityJson(report)}\n`);
  assertConstructQualificationExpectation(expectation, report.status);
  return expectation === undefined && report.status !== "qualified" ? 2 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await runConstructQualificationCli();
}
