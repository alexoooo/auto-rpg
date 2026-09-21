import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { POLICIES } from "../src/mind.ts";
import { NAMED_BUILDS } from "../src/golem/roster.ts";
import { ENGAGEMENT_INSTRUMENT_VERSION } from "../src/recorder.ts";
import { PROTOCOL, schedule } from "./schedule.mjs";
import { fingerprint, ROOT } from "./fingerprint.mjs";
import { runJobs, atomicJson, readResults, defaultWorkers, lockRun } from "./runner.mjs";
import { summarize, markdownReport } from "./report.mjs";
import { search, confirm } from "./search.mjs";
import { promote } from "./promotion.mjs";

const [command = "help", ...args] = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i += 2) {
  if (!args[i].startsWith("--") || args[i + 1] === undefined) throw new Error("arguments are --name value pairs");
  flags[args[i].slice(2)] = args[i + 1];
}
for (const flag of Object.keys(flags)) if (!["dir", "workers", "hours", "rounds", "seed"].includes(flag)) throw new Error(`unknown flag ${flag}`);
const directory = resolve(flags.dir ?? "research/runs/current");
const workers = Number(flags.workers ?? defaultWorkers());
const hours = Number(flags.hours ?? (command === "run" ? 8 : 3));
const rounds = Number(flags.rounds ?? 4);
if (flags.seed !== undefined && (!Number.isInteger(Number(flags.seed)) || Number(flags.seed) < 0
  || Number(flags.seed) > 0xffffffff)) throw new Error("seed must be a uint32");
if (!Number.isFinite(hours) || hours <= 0 || hours > 8 || !Number.isInteger(rounds) || rounds < 1 || rounds > 4) throw new Error("hours must be (0,8], rounds 1..4");
const onProgress = (progress) => console.log(JSON.stringify(progress));
const publishedVariants = JSON.parse(readFileSync(join(ROOT, "src/golem/researched-variants.json"), "utf8"));

function newManifest() {
  return { version: 1, fingerprint: fingerprint().hash, protocol: PROTOCOL, rounds,
    seed: Number(flags.seed ?? 20260920), policies: POLICIES.filter((p) => p.name !== "idle").map((p) => p.name),
    policyVersions: Object.fromEntries(POLICIES.filter((p) => p.name !== "idle").map((p) =>
      [p.name, JSON.stringify(publishedVariants.find((c) => c.name === p.name)) ?? p.name])),
    builds: NAMED_BUILDS, candidates: publishedVariants, instrumentVersion: ENGAGEMENT_INSTRUMENT_VERSION,
    dependencies: JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).dependencies,
    runtime: { node: process.version, platform: process.platform, arch: process.arch } };
}
function getManifest() {
  const path = join(directory, "manifest.json");
  if (!existsSync(path)) return newManifest();
  const { scheduleHash, ...manifest } = JSON.parse(readFileSync(path, "utf8"));
  if (manifest.fingerprint !== fingerprint().hash) throw new Error("simulation fingerprint changed; use a new run directory");
  if (manifest.runtime.node !== process.version) throw new Error("Node runtime changed; use a new run directory");
  for (const name of manifest.policies) {
    const candidate = manifest.candidates.find((c) => c.name === name);
    const published = publishedVariants.find((c) => c.name === name);
    if (published && JSON.stringify(candidate) !== JSON.stringify(published)) throw new Error(`policy version changed: ${name}`);
  }
  return manifest;
}
function report(manifest, from = directory) {
  const jobs = schedule(manifest.policies, manifest.builds, manifest.rounds, manifest.seed);
  const summary = summarize(manifest, jobs, readResults(from));
  atomicJson(join(from, "summary.json"), summary);
  writeFileSync(join(from, "summary.md"), markdownReport(summary));
  return summary;
}
function publish(manifest, from = directory) {
  if (fingerprint().hash !== manifest.fingerprint) throw new Error("source changed during evaluation; refusing publication");
  const summary = report(manifest, from);
  if (!summary.completedRounds) throw new Error("no complete balanced round to publish");
  const artifact = { version: 1, fingerprint: manifest.fingerprint, evaluatedAt: new Date().toISOString(),
    rounds: summary.completedRounds, policies: Object.fromEntries(Object.entries(summary.policies).map(([name, p]) =>
      [name, { rating: p.rating, deviation: p.deviation, bouts: p.bouts, provisional: p.provisional,
        policyVersion: manifest.policyVersions[name] }])) };
  atomicJson(join(ROOT, "src/policy-ratings.json"), artifact);
  mkdirSync(join(ROOT, "research/results"), { recursive: true });
  atomicJson(join(ROOT, "research/results/baseline.json"), summary);
  atomicJson(join(ROOT, "research/results/manifest.json"), manifest);
  atomicJson(join(ROOT, "research/results/provenance.json"), {
    fingerprint: manifest.fingerprint, sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(),
    dependencyFiles: fingerprint().files, publishedAt: artifact.evaluatedAt,
  });
  writeFileSync(join(ROOT, "research/results/baseline.md"), markdownReport(summary));
  console.log(`Published ${summary.completedRounds} complete rounds (${summary.ratedBouts} bouts)`);
}

if (command === "help") {
  console.log("node research/cli.mjs <run|evaluate|summarize|search|confirm|promote|publish> [--dir research/runs/current] [--workers N] [--hours 8] [--rounds 4] [--seed 20260920]");
} else {
  mkdirSync(directory, { recursive: true });
  const manifest = getManifest();
  const jobs = schedule(manifest.policies, manifest.builds, manifest.rounds, manifest.seed);
  const started = Date.now();
  const budgetPath = join(directory, "budget.json");
  const prior = existsSync(budgetPath) ? JSON.parse(readFileSync(budgetPath, "utf8")) : { usedMs: 0 };
  const remaining = Math.max(0, hours * 3600000 - prior.usedMs);
  const deadline = started + remaining;
  const options = { workers, deadline, onProgress };
  const computing = ["run", "evaluate", "search", "confirm", "promote"].includes(command);
  const unlock = computing ? lockRun(directory) : () => {};
  const checkpoint = () => atomicJson(budgetPath, { usedMs: prior.usedMs + Date.now() - started });
  const budgetTimer = computing ? setInterval(checkpoint, 15000) : null;
  let cancelled = false;
  const stopAfterCurrentStage = () => { cancelled = true; options.deadline = Date.now(); };
  const stageDeadline = (hours) => Math.min(options.deadline,
    started + Math.max(0, hours * 3600000 - prior.usedMs));
  process.once("SIGINT", stopAfterCurrentStage);
  process.once("SIGTERM", stopAfterCurrentStage);
  try {
    if (command === "evaluate" || command === "run") {
      await runJobs(directory, manifest, jobs, { ...options,
        deadline: command === "run" ? stageDeadline(3) : options.deadline });
      const summary = report(manifest);
      if (summary.completedRounds) publish(manifest);
    }
    if (!cancelled && (command === "search" || command === "run")) {
      const state = await search(directory, manifest, { ...options,
        deadline: command === "run" ? stageDeadline(6) : options.deadline });
      if (command === "run" && !cancelled) console.log(JSON.stringify(await confirm(directory, manifest, state, options)));
    }
    if (command === "confirm") {
      const state = JSON.parse(readFileSync(join(directory, "search.json"), "utf8"));
      console.log(JSON.stringify(await confirm(directory, manifest, state, options)));
    }
    if (command === "summarize") console.log(markdownReport(report(manifest)));
    if (command === "publish") publish(manifest);
    if (command === "promote") {
      const result = await promote(directory, manifest, options);
      if (result.status === "promoted") publish(result.manifest, result.directory);
      console.log(JSON.stringify(result));
    }
    if (!["run", "evaluate", "summarize", "search", "confirm", "promote", "publish"].includes(command)) throw new Error(`unknown command ${command}`);
  } finally {
    if (budgetTimer) clearInterval(budgetTimer);
    process.off("SIGINT", stopAfterCurrentStage); process.off("SIGTERM", stopAfterCurrentStage);
    if (computing) checkpoint();
    unlock();
  }
}
