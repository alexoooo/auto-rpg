import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync, renameSync, openSync, closeSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { digest, stable, completeRounds } from "./schedule.mjs";

export const defaultWorkers = () => Math.max(1, Math.min(8, Math.floor(availableParallelism() / 2)));
export function lockRun(directory) {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, "run.lock");
  if (existsSync(path)) {
    const { pid } = JSON.parse(readFileSync(path, "utf8"));
    if (!Number.isInteger(pid) || pid <= 0) throw new Error("invalid run lock; inspect before removing");
    try { process.kill(pid, 0); throw new Error(`run directory is in use by process ${pid}`); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
    unlinkSync(path); // Only a demonstrably dead owner's lock, never its results.
  }
  const fd = openSync(path, "wx");
  writeFileSync(fd, JSON.stringify({ pid: process.pid })); closeSync(fd);
  return () => unlinkSync(path);
}
/** Windows readers/antivirus can briefly deny replacing an otherwise writable file.
 * Keep the old checkpoint intact; retry only transient lock errors, with a bounded wait. */
export function retryFileLock(operation, pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)) {
  for (let attempt = 0; ; attempt++) {
    try { return operation(); }
    catch (error) {
      if (!["EPERM", "EACCES", "EBUSY"].includes(error.code) || attempt >= 49) throw error;
      pause(20);
    }
  }
}
export function atomicJson(path, value) {
  retryFileLock(() => writeFileSync(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`));
  retryFileLock(() => renameSync(`${path}.tmp`, path));
}
export function readResults(directory) {
  const path = join(directory, "results.jsonl");
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8");
  // An interrupted append is not a completed result. Preserve the tail for diagnosis.
  const last = text.lastIndexOf("\n");
  if (last !== text.length - 1) throw new Error(`${path}: incomplete last line; preserve it and repair before resuming`);
  return text.split("\n").filter(Boolean).map((line) => JSON.parse(line));
}
export function prepareRun(directory, manifest, jobs) {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, "manifest.json");
  const identity = { ...manifest, scheduleHash: digest(jobs) };
  if (existsSync(path)) {
    if (stable(JSON.parse(readFileSync(path, "utf8"))) !== stable(identity)) throw new Error("resume manifest/fingerprint mismatch");
  } else atomicJson(path, identity);
  const rows = readResults(directory);
  completeRounds(jobs, rows); // Validate identities even when no round is complete.
  return rows;
}

/**
 * Persistent workers, but a fresh wasm instance for every job. Never two worlds in a realm.
 * `jobLimitMs` is one job's wall limit: five minutes suits a bout, and a caller whose job is a
 * search (session 04's expert plays a bout at a twentieth of real time or slower) sets its own.
 */
export async function runJobs(directory, manifest, jobs, { workers = defaultWorkers(), deadline = Infinity,
  onProgress = () => {}, workerUrl = new URL("./worker.mjs", import.meta.url), jobLimitMs = 300000 } = {}) {
  if (!Number.isInteger(workers) || workers < 1 || workers > 64) throw new Error("invalid worker count");
  if (!(jobLimitMs > 0)) throw new Error("invalid job wall limit");
  const rows = prepareRun(directory, manifest, jobs);
  const done = new Set(rows.map((row) => row.id));
  const pending = jobs.filter((job) => !done.has(job.id));
  let cursor = 0;
  let cancelled = false;
  const stop = () => { cancelled = true; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const started = Date.now();
  let lastProgress = 0;
  async function lane() {
    if (cursor >= pending.length || Date.now() >= deadline) return;
    let worker;
    function spawn() {
      worker = new Worker(workerUrl, { stdout: true, stderr: true });
      worker.stdout.resume();
      worker.stderr.on("data", (chunk) => process.stderr.write(chunk));
    }
    try {
      spawn();
      while (!cancelled && cursor < pending.length && Date.now() < deadline) {
        const job = pending[cursor++];
        const row = await new Promise((resolveResult) => {
          let timer;
          const cleanup = () => {
            clearTimeout(timer); worker.off("message", message); worker.off("error", error); worker.off("exit", exited);
          };
          const finish = (result) => { cleanup(); resolveResult(result); };
          const message = (result) => finish(result);
          const error = (err) => finish({ ...job, status: "failed", error: String(err.stack ?? err), workerLost: true });
          const exited = (code) => error(new Error(`worker exited ${code}`));
          worker.once("message", message); worker.once("error", error); worker.once("exit", exited);
          timer = setTimeout(() => {
            if (Date.now() >= deadline) finish({ ...job, status: "interrupted" });
            else error(new Error(`job exceeded its ${(jobLimitMs / 60000).toFixed(1)}-minute wall limit`));
          }, Math.max(1, Math.min(jobLimitMs, deadline - Date.now())));
          worker.postMessage({ job, manifest });
        });
        if (row.status === "interrupted") break; // An uncompleted job remains pending on resume.
        appendFileSync(join(directory, "results.jsonl"), `${JSON.stringify(row)}\n`);
        rows.push(row);
        if (Date.now() - lastProgress > 15000 || rows.length === jobs.length) {
          lastProgress = Date.now();
          onProgress({ done: rows.length, total: jobs.length, elapsedSeconds: (Date.now() - started) / 1000,
            failures: rows.filter((r) => r.status !== "ok").length });
        }
        if (row.status !== "ok") {
          await worker.terminate();
          if (!cancelled && cursor < pending.length && Date.now() < deadline) spawn();
        }
      }
    } finally { await worker?.terminate(); }
  }
  try { await Promise.all(Array.from({ length: Math.min(workers, pending.length) }, lane)); }
  finally { process.off("SIGINT", stop); process.off("SIGTERM", stop); }
  return rows;
}
