/** Reproducible physical-task manifests and append-only results, with bounded worker lifetimes. */
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir, mkdir, writeFile, appendFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { Worker } from "node:worker_threads";
import { foundationJobs, FOUNDATION, proportion } from "./control-foundation-trials.mjs";
import { CORE_ENGINE } from "../tests/harness/core-stand.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const digest = (value) => createHash("sha256").update(value).digest("hex");
const json = (value) => JSON.stringify(value, (_, v) => typeof v === "number" && !Number.isFinite(v) ? String(v) : v, 2);

/** Hash actual source and JSON assets, including untracked additions and excluding binary art. */
async function contentRevision() {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (/\.(ts|mjs|json)$/.test(entry.name)) files.push(path);
    }
  }
  for (const folder of ["src", "assets", "tests/harness"]) await visit(resolve(root, folder));
  for (const entry of await readdir(resolve(root, "research"))) if (entry.endsWith(".mjs")) files.push(resolve(root, "research", entry));
  files.push(resolve(root, "package-lock.json"));
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    hash.update(relative(root, file).replaceAll("\\", "/") + "\0");
    hash.update((await readFile(file, "utf8")).replaceAll("\r\n", "\n"));
    hash.update("\0");
  }
  return hash.digest("hex");
}

/** Results remain ordered by task, independent of worker completion order; all workers are joined. */
export async function runFoundation(jobs, { workers = 4, onResult = async () => {} } = {}) {
  if (!Number.isSafeInteger(workers) || workers < 1) throw new Error("workers must be a positive integer");
  const rows = new Array(jobs.length), pool = [];
  let next = 0;
  try {
    await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, async () => {
      const worker = new Worker(new URL("./control-foundation-worker.mjs", import.meta.url));
      pool.push(worker);
      while (next < jobs.length) {
        const index = next++;
        const result = await new Promise((resolveResult, reject) => {
          const cleanup = () => { worker.off("error", failed); worker.off("exit", exited); worker.off("message", message); };
          const failed = (error) => { cleanup(); reject(error); };
          const exited = (code) => failed(new Error(`worker exited during task ${index}: ${code}`));
          const message = (reply) => {
            cleanup();
            if (reply.index !== index) reject(new Error("worker answered another task"));
            else if (reply.error) reject(new Error(reply.error));
            else resolveResult(reply.result);
          };
          worker.once("error", failed); worker.once("exit", exited); worker.once("message", message);
          worker.postMessage({ index, job: jobs[index] });
        });
        rows[index] = { job: jobs[index], result };
        await onResult(rows[index]);
      }
    }));
    return rows;
  } finally { await Promise.all(pool.map((worker) => worker.terminate())); }
}

/** Each task/loadout/hand/controller has its own denominator; guard differences are paired. */
export function summarizeFoundation(rows) {
  const groups = new Map(), bouts = new Map();
  for (const row of rows) {
    const { job, result } = row;
    const key = [job.task, job.model, job.held, job.hand ?? "", job.target ?? "", job.recovery ?? "", job.guard ?? ""].join("/");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
    if (job.task === "bout" && result.status === "measured") {
      const pair = `${job.model}/${job.held}/${job.seed}/${job.hz}`;
      if (!bouts.has(pair)) bouts.set(pair, {});
      bouts.get(pair)[job.guard] = result.outcome;
    }
  }
  const cells = [...groups].map(([cell, members]) => {
    const measured = members.filter((r) => r.result.status === "measured");
    const outcomes = measured.map((r) => r.result.outcome), task = members[0].job.task;
    const eligible = task === "recovery" ? outcomes.filter((o) => o.fell) : task === "strike" ? outcomes : [];
    const successes = eligible.filter((o) => task === "recovery" ? o.risen && o.up
      : members[0].job.target === "miss" ? !o.fell && o.stood : o.usefulHit && !o.fell).length;
    return { cell, trials: members.length, measured: measured.length, unsupported: members.length - measured.length,
      success: ["recovery", "strike"].includes(task) ? proportion(successes, eligible.length) : null };
  });
  const pairedGuard = [];
  for (const [pair, variants] of bouts) for (const [guard, side] of [["left-cover", 0], ["right-cover", 1]]) {
    if (!variants.pose || !variants[guard]) continue;
    const control = variants.pose.sides[side], cover = variants[guard].sides[side];
    pairedGuard.push({ pair, guard, headDamageSaved: control.headDamage - cover.headDamage,
      damageSaved: control.damage - cover.damage, poseFallen: control.fallen, coverFallen: cover.fallen,
      poseSeconds: variants.pose.seconds, coverSeconds: variants[guard].seconds });
  }
  return { cells, pairedGuard };
}

async function main() {
  const { values } = parseArgs({ options: {
    suite: { type: "string", default: "baseline" }, split: { type: "string", default: "development" },
    samples: { type: "string", default: String(FOUNDATION.samples) }, from: { type: "string", default: "0" },
    hz: { type: "string", default: "120" }, workers: { type: "string", default: "4" }, models: { type: "string" }, out: { type: "string" },
  } });
  const options = { suite: values.suite, split: values.split, samples: Number(values.samples), from: Number(values.from), hz: Number(values.hz),
    ...(values.models ? { models: values.models.split(",") } : {}) };
  const jobs = foundationJobs(options), started = new Date().toISOString();
  const directory = resolve(values.out ?? resolve(root, "research/runs/control-foundation", `${started.replaceAll(":", "-")}-${randomUUID()}`));
  const lock = JSON.parse(await readFile(resolve(root, "package-lock.json"), "utf8"));
  const pkg = lock.packages["node_modules/@dimforge/rapier3d-simd-compat"];
  const manifest = { protocol: FOUNDATION.version, started, options, workers: Number(values.workers),
    harness: "Node, core world, per-task arena/stand fixtures", node: process.version, engine: CORE_ENGINE,
    package: { version: pkg.version, resolved: pkg.resolved, integrity: pkg.integrity },
    source: { git: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), content: await contentRevision() },
    sensing: "existing fighter senses; stationary blow offset disclosed at commitment", action: "existing fighter skills and staged-rise/lie",
    policyPeriodSteps: 1, assists: { rootBalancePercent: 0, weapon: false },
    unavailable: ["two-handed items", "grip release", "integrated recovery/combat", "moving isolated targets", "actuator work", "contact penetration"],
    jobs };
  const installed = JSON.parse(await readFile(resolve(root, "node_modules/@dimforge/rapier3d-simd-compat/package.json"), "utf8"));
  if (installed.version !== pkg.version || CORE_ENGINE !== "rapier") throw new Error("manifest requires the locked Rapier package; run npm ci");
  manifest.package.entrySha256 = digest(await readFile(resolve(root, "node_modules/@dimforge/rapier3d-simd-compat", installed.main)));
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "manifest.json"), json(manifest), { flag: "wx" });
  await writeFile(resolve(directory, "rows.jsonl"), "", { flag: "wx" });
  console.log(`${jobs.length} tasks; ${directory}`);
  let completed = 0, writes = Promise.resolve();
  try {
    const rows = await runFoundation(jobs, { workers: Number(values.workers), onResult(row) {
      writes = writes.then(() => appendFile(resolve(directory, "rows.jsonl"), JSON.stringify(row, (_, v) => typeof v === "number" && !Number.isFinite(v) ? String(v) : v) + "\n"));
      console.log(`${++completed}/${jobs.length} ${row.job.task} ${row.job.model} ${row.job.held} ${row.result.status}`);
      return writes;
    } });
    await writes;
    await writeFile(resolve(directory, "summary.json"), json(summarizeFoundation(rows)), { flag: "wx" });
    console.log(`Completed ${rows.length} tasks; manifest SHA256 ${digest(json(manifest))}`);
  } catch (error) {
    await writes.catch(() => {});
    await writeFile(resolve(directory, "failure.json"), json({ completed, error: String(error?.stack ?? error) }), { flag: "wx" });
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
