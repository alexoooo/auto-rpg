/**
 * **The ground Options' profiles** (`assets/core/edge-profiles.json`, in the profiles' one type,
 * `src/core/skills/framework/profile.ts`): Option Mind, the game's preset on its priors alone and
 * choosing by chance among the Options near the best (`MARGIN`), rising from the stand-up target's falls (`risingJobs`) turned by offsets neither of its protocols
 * plays (`--offsets`), every body in every loadout; each try of a ground technique it runs is a
 * trial begun where the body lay (`groundStart`): a way up or a reposition, flatten, and a brace
 * while a way up does not yet admit the body (`BRACE_TUMBLING_OPTION`, calm). A trial runs from its
 * try's start until the mind next begins an Option other than a brace while tumbling or a landing:
 * what the try costs before the next choice, the body's tumbling after it included. It is done
 * where its Option noted it done and the body is then where it goes (a way up's edge, on its feet
 * for one to standing; flatten's lie; a brace's, where a way up is begun next); else it ended down
 * where the body lies then (`Trial.end`).
 * Each profile names what it was measured on: the body as the fall builds it, the technique's
 * config, the world's rate and the command's delay. Node, core world, Rapier, 120 Hz.
 *
 *   node research/edge-profiles.mjs [--model <model>] [--offsets 5.625,16.875] [--workers N] [--write]
 *     [--rows <trials.jsonl>]
 * Raw falls and their trials are cached in research/runs/edge-profiles, or --rows, on the same build.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { BUILD_IDENTITY } from "../scripts/build-identity.mjs";

const OUT = new URL("../assets/core/edge-profiles.json", import.meta.url);
import { edgeTrial, edgeProfiles } from "./edge-profile-trial.mjs";

if (isMainThread) {
  const { values } = parseArgs({ options: { model: { type: "string" }, offsets: { type: "string", default: "5.625,16.875" }, workers: { type: "string" }, rows: { type: "string" }, write: { type: "boolean", default: false } } });
  await import("../tests/harness/preload-data.mjs");
  const { risingJobs } = await import("../src/evaluation/rising.ts");
  const offsets = values.offsets.split(",").map(Number);
  const jobs = offsets.flatMap((offset) => risingJobs({ target: true, offset })).filter((job) => !values.model || job.model === values.model).map(({ model, loadout, seed, start, degrees, balance, grit, gusts }) =>
    ({ model, loadout, seed, start, degrees, balance, grit, gusts, target: true }));
  if (!jobs.length) throw new Error(`no profile falls for ${values.model}`);
  const retained = values.model ? JSON.parse(readFileSync(OUT, "utf8")) : null;
  if (retained && JSON.stringify(retained.source.offsets) !== JSON.stringify(offsets)) throw new Error("a body's profile refresh keeps the existing offsets");
  const count = Math.min(jobs.length, Number(values.workers ?? Math.max(1, availableParallelism() - 2)));
  // Each fall's trials kept by its place among the falls, so the profiles do not depend on which worker ends first.
  const cacheId = createHash("sha256").update(JSON.stringify([BUILD_IDENTITY, values.model ?? null, offsets])).digest("hex").slice(0, 20);
  const rowsFile = values.rows ?? `research/runs/edge-profiles/${cacheId}.jsonl`, cached = new Map();
  if (existsSync(rowsFile)) for (const line of readFileSync(rowsFile, "utf8").trim().split("\n").filter(Boolean)) {
    const row = JSON.parse(line);
    if (row.build === BUILD_IDENTITY) cached.set(JSON.stringify(row.job), row.result);
  }
  mkdirSync(dirname(rowsFile), { recursive: true });
  const started = Date.now(), byFall = [], queue = [];
  for (const [i, job] of jobs.entries()) {
    const saved = cached.get(JSON.stringify(job));
    if (saved) byFall[i] = saved;
    else queue.push([i, job]);
  }
  const reused = jobs.length - queue.length;
  await Promise.all(Array.from({ length: Math.min(count, queue.length) }, () => new Promise((done, fail) => {
    const worker = new Worker(new URL(import.meta.url));
    const next = () => { const item = queue.shift(); if (item) worker.postMessage(item); else worker.terminate().then(done); };
    worker.on("message", ([i, result]) => {
      byFall[i] = result;
      appendFileSync(rowsFile, JSON.stringify({ build: BUILD_IDENTITY, job: jobs[i], result }) + "\n");
      next();
    });
    worker.on("error", fail);
    next();
  })));
  const all = byFall.flatMap(result => result.trials);
  const sorted = edgeProfiles(all);
  console.log(`edge profiles: ${all.length} trials in ${sorted.length} profiles, offsets ${offsets.join(", ")}; Node, core world, Rapier, 120 Hz; ${((Date.now() - started) / 1000).toFixed(0)} s; ${reused}/${jobs.length} falls reused; rows ${rowsFile}`);
  for (const p of sorted) {
    const byFrom = new Map();
    for (const t of p.trials) { const f = byFrom.get(t.start.postures.own) ?? { n: 0, done: 0, seconds: 0 }; f.n++; f.done += t.done ? 1 : 0; f.seconds += t.seconds; byFrom.set(t.start.postures.own, f); }
    console.log(`${p.label} ${p.measured.spec}: ${[...byFrom].map(([from, f]) => `from ${from} ${f.done}/${f.n} done, ${(f.seconds / f.n).toFixed(2)} s`).join("; ")}`);
  }
  const { modelSpec } = await import("../src/core/models.ts"), { bodyKey } = await import("../src/core/spec/body.ts");
  const body = values.model ? bodyKey(modelSpec(values.model)) : null;
  const refreshed = sorted.map((p) => ({ measured: p.measured, target: null, trials: p.trials }));
  const out = { source: { script: "research/edge-profiles.mjs", falls: "rising-target", offsets },
    profiles: [...(retained?.profiles.filter((p) => p.measured.body !== body) ?? []), ...refreshed] };
  // A trial a line: the file stays readable at a few thousand trials.
  const text = `{\n  "source": ${JSON.stringify(out.source)},\n  "profiles": [\n${out.profiles.map((p) =>
    `    { "measured": ${JSON.stringify(p.measured)}, "target": null, "trials": [\n${p.trials.map((t) => `      ${JSON.stringify(t)}`).join(",\n")}\n    ] }`).join(",\n")}\n  ]\n}\n`;
  if (values.write) writeFileSync(OUT, text);
} else {
  parentPort.on("message", async ([i, job]) => parentPort.postMessage([i, await edgeTrial(job)]));
}
