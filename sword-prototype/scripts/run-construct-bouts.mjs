import { availableParallelism } from "node:os";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import { parseSavedConstruct } from "../src/construct/codec.ts";
import { canonicalIntegrityJson } from "../src/construct/integrity.ts";
import { CONSTRUCT_LAB_ARENA_DIGEST, CONSTRUCT_LAB_BOUT_CAP_STEPS,
  constructLabConfigDigest } from "../src/construct/lab-config.ts";
import { canonicalConstructLabReportJson, canonicalConstructLabRowJson,
  recomputeConstructLabReport, validateConstructLabRow } from "../src/construct/lab-report.ts";
import { constructBatchDigest, createConstructBoutJobs } from "../src/construct/matchup.ts";
import { WARDEN_SENSORS } from "../src/construct/warden.ts";
import { partitionIndexed } from "../src/learning/jobs.ts";

export { CONSTRUCT_LAB_ARENA_DIGEST, CONSTRUCT_LAB_BOUT_CAP_STEPS, constructLabConfigDigest };
const WORKER_URL = new URL("./construct-bout-worker.mjs", import.meta.url);
const ENGINE_URL = new URL("./construct-bout-engine.mjs", import.meta.url);
let temporarySequence = 0;

const utf8 = (value) => new TextEncoder().encode(value).byteLength;

const atomicWrite = async (target, bytes) => {
  temporarySequence += 1;
  const temporary = `${target}.tmp-${process.pid}-${temporarySequence}`;
  await writeFile(temporary, bytes, { encoding: "utf8", flag: "wx" });
  await rename(temporary, target);
};

const readJson = async (target) => JSON.parse(await readFile(target, "utf8"));
const jobName = (index) => `${String(index).padStart(8, "0")}.json`;

const stateFor = (runDigest, jobs, completed, complete) => Object.freeze({
  version: 1,
  runDigest,
  totalJobs: jobs.length,
  jobDigests: Object.freeze(jobs.map((job) => job.matchupDigest)),
  completed: Object.freeze([...completed].sort((a, b) => a - b)),
  complete,
});

const canonicalState = (state) => canonicalIntegrityJson(state) + "\n";

const assertStateIdentity = (state, expected) => {
  if (state.version !== 1 || state.runDigest !== expected.runDigest || state.totalJobs !== expected.totalJobs ||
      JSON.stringify(state.jobDigests) !== JSON.stringify(expected.jobDigests)) {
    throw new Error("construct batch resume identity does not match blueprint/program/arena/config jobs");
  }
};

const assertRowIdentity = (row, job) => {
  if (!job || row.job !== job.index || row.matchupDigest !== job.matchupDigest ||
      row.seed !== job.matchup.seed || row.mirrored !== job.matchup.mirrored) {
    throw new Error(`construct worker returned a row for unknown or mismatched job ${row.job}`);
  }
};

async function committedRows(jobsDirectory, jobs) {
  const names = new Set(await readdir(jobsDirectory));
  const rows = new Map();
  for (const job of jobs) {
    const name = jobName(job.index);
    if (!names.has(name)) continue;
    const row = validateConstructLabRow(await readJson(path.join(jobsDirectory, name)));
    try { assertRowIdentity(row, job); }
    catch { throw new Error(`committed construct row ${name} does not match job identity`); }
    rows.set(job.index, row);
  }
  const unexpected = [...names].find((name) => /^\d{8}\.json$/.test(name) &&
    !jobs.some((job) => jobName(job.index) === name));
  if (unexpected) throw new Error(`construct batch has unexpected committed job "${unexpected}"`);
  return rows;
}

const runWorker = (batch, engineUrl, engineOptions, onRow) => {
  const worker = new Worker(WORKER_URL, { workerData: {
    jobs: batch,
    engineUrl: engineUrl.href,
    engineOptions,
  } });
  let reportedError = null;
  let deliveries = Promise.resolve();
  const promise = new Promise((resolve, reject) => {
    worker.on("message", (message) => {
      if (message.type === "row") {
        deliveries = deliveries.then(() => onRow(message.row)).catch((error) => {
          reportedError = error;
          void worker.terminate();
        });
      } else if (message.type === "error") {
        reportedError = new Error(`construct worker job ${message.job}: ${message.message}`);
      }
    });
    worker.on("error", reject);
    worker.on("exit", (code) => {
      void deliveries.then(() => {
        if (reportedError) reject(reportedError);
        else if (code !== 0) reject(new Error(`construct bout worker exited ${code}`));
        else resolve();
      }, reject);
    });
  });
  return Object.freeze({ promise, terminate: () => worker.terminate() });
};

export async function runConstructBatch({
  jobs,
  outDirectory,
  workers = availableParallelism(),
  resume = false,
  engineUrl = ENGINE_URL,
  engineOptions = {},
  onCommitted = null,
}) {
  if (!Number.isSafeInteger(workers) || workers <= 0) throw new Error(`invalid construct worker count ${workers}`);
  if (jobs.length === 0) throw new Error("construct batch requires at least one job");
  const orderedJobs = [...jobs].sort((a, b) => a.index - b.index);
  const runDigest = constructBatchDigest(orderedJobs);
  const output = path.resolve(outDirectory);
  const jobsDirectory = path.join(output, "jobs");
  await mkdir(jobsDirectory, { recursive: true });
  const statePath = path.join(output, "state.json");
  const expectedState = stateFor(runDigest, orderedJobs, [], false);
  let priorState = null;
  try { priorState = await readJson(statePath); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  if (priorState) assertStateIdentity(priorState, expectedState);
  const rows = await committedRows(jobsDirectory, orderedJobs);
  if (!resume && (priorState !== null || rows.size > 0)) {
    throw new Error(`construct batch output "${output}" already contains state; pass --resume`);
  }
  await atomicWrite(statePath, canonicalState(stateFor(runDigest, orderedJobs, rows.keys(), rows.size === orderedJobs.length)));

  const pending = orderedJobs.filter((job) => !rows.has(job.index));
  const workerCount = Math.min(workers, pending.length);
  const batches = workerCount === 0 ? [] : partitionIndexed(pending, workerCount)
    .map((batch) => batch.map(({ value }) => value));
  const completionOrder = [];
  const startedAt = Date.now();
  const startedCpu = process.cpuUsage();
  let commitQueue = Promise.resolve();
  const commit = (rowValue) => {
    commitQueue = commitQueue.then(async () => {
      const row = validateConstructLabRow(rowValue);
      const job = orderedJobs[row.job];
      assertRowIdentity(row, job);
      const target = path.join(jobsDirectory, jobName(row.job));
      const bytes = canonicalConstructLabRowJson(row) + "\n";
      const existing = rows.get(row.job);
      if (existing) {
        if (canonicalConstructLabRowJson(existing) !== canonicalConstructLabRowJson(row)) {
          throw new Error(`construct worker returned different bytes for completed job ${row.job}`);
        }
        return;
      }
      await atomicWrite(target, bytes);
      rows.set(row.job, row);
      completionOrder.push(row.job);
      await atomicWrite(statePath, canonicalState(stateFor(runDigest, orderedJobs, rows.keys(), rows.size === orderedJobs.length)));
      await onCommitted?.(row);
    });
    return commitQueue;
  };
  if (workerCount > 0) {
    const running = [];
    try {
      for (const batch of batches) running.push(runWorker(batch, engineUrl, engineOptions, commit));
      await Promise.all(running.map(({ promise }) => promise));
      await commitQueue;
    } catch (error) {
      await Promise.allSettled(running.map(({ terminate }) => terminate()));
      throw error;
    }
  }
  if (rows.size !== orderedJobs.length) {
    throw new Error(`construct batch finished with ${rows.size}/${orderedJobs.length} committed jobs`);
  }
  const canonicalRows = orderedJobs.map((job) => rows.get(job.index));
  const rowsBytes = canonicalRows.map(canonicalConstructLabRowJson).join("\n") + "\n";
  const report = recomputeConstructLabReport(canonicalRows, runDigest);
  await atomicWrite(path.join(output, "rows.jsonl"), rowsBytes);
  await atomicWrite(path.join(output, "report.json"), canonicalConstructLabReportJson(report) + "\n");
  await atomicWrite(statePath, canonicalState(stateFor(runDigest, orderedJobs, rows.keys(), true)));
  const wallMilliseconds = Date.now() - startedAt;
  const cpu = process.cpuUsage(startedCpu);
  const telemetry = {
    version: 1,
    runDigest,
    workers,
    wallMilliseconds,
    cpuUserMicroseconds: cpu.user,
    cpuSystemMicroseconds: cpu.system,
    aggregateCpuUtilization: wallMilliseconds > 0 ? (cpu.user + cpu.system) / (wallMilliseconds * 1000) : 0,
    completionOrder,
    pid: process.pid,
    rssBytes: process.memoryUsage().rss,
  };
  await atomicWrite(path.join(output, "telemetry.json"), JSON.stringify(telemetry, null, 2) + "\n");
  return { runDigest, rows: Object.freeze(canonicalRows), report, telemetry };
}

const parseSeeds = (value) => {
  if (value.includes(",")) {
    const tokens = value.split(",").map((token) => token.trim());
    if (tokens.some((token) => token === "")) {
      throw new Error("--seeds must be a positive count or comma-separated unsigned integers");
    }
    const seeds = tokens.map((token) => Number(token));
    if (seeds.some((seed) => !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff)) {
      throw new Error("--seeds must be a positive count or comma-separated unsigned integers");
    }
    return seeds;
  }
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count <= 0) throw new Error("--seeds must be a positive count");
  return Array.from({ length: count }, (_, seed) => seed);
};

const parseArguments = (argv) => {
  const knownValues = new Set(["left", "right", "seeds", "workers", "out"]);
  const knownFlags = new Set(["mirrored", "resume"]);
  const result = { mirrored: false, resume: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`unknown construct batch argument "${token}"`);
    const name = token.slice(2);
    if (knownFlags.has(name)) { result[name] = true; continue; }
    if (!knownValues.has(name)) throw new Error(`unknown construct batch flag "--${name}"`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`--${name} requires a value`);
    result[name] = value;
    index += 1;
  }
  for (const required of ["left", "right", "seeds", "out"]) {
    if (!result[required]) throw new Error(`construct batch requires --${required}`);
  }
  return result;
};

export async function runConstructBatchCli(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  const leftText = await readFile(path.resolve(args.left), "utf8");
  const rightText = await readFile(path.resolve(args.right), "utf8");
  if (utf8(leftText) > 1024 * 1024 || utf8(rightText) > 1024 * 1024) {
    throw new Error("construct batch saved input exceeds the 1 MiB import ceiling");
  }
  const left = parseSavedConstruct(leftText, WARDEN_SENSORS);
  const right = parseSavedConstruct(rightText, WARDEN_SENSORS);
  const jobs = createConstructBoutJobs(left, right, parseSeeds(args.seeds), {
    mirrored: args.mirrored,
    arenaDigest: CONSTRUCT_LAB_ARENA_DIGEST,
    configDigest: constructLabConfigDigest(),
    boutCapSteps: CONSTRUCT_LAB_BOUT_CAP_STEPS,
  });
  return runConstructBatch({
    jobs,
    outDirectory: args.out,
    workers: args.workers === undefined ? availableParallelism() : Number(args.workers),
    resume: args.resume,
  });
}

const isEntry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  const result = await runConstructBatchCli();
  process.stdout.write(`${canonicalConstructLabReportJson(result.report)}\n`);
}
