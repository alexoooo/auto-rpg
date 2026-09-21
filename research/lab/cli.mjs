import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { atomicJson, lockRun } from "../runner.mjs";
import { ROOT } from "../fingerprint.mjs";
import { stable, digest } from "../schedule.mjs";
import { collect, scenarios, labFingerprint, refit, portfolio, evaluatePolicy } from "./experiments.mjs";
import { replay } from "./environment.mjs";
import { oracle, fitObservationModel, fairPlan } from "./planning.mjs";
import { updateArchive } from "./archive.mjs";
import { referenceFight } from "./reference.mjs";
Logger.LogLevels = Logger.ErrorLogLevel;

const [command, ...args] = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i += 2) {
  if (!args[i].startsWith("--") || args[i + 1] === undefined) throw new Error("flags require values");
  flags[args[i].slice(2)] = args[i + 1];
}
const directory = resolve(flags.dir ?? "research/runs/wave2");
const scope = relative(join(ROOT, "research/runs"), directory);
if (scope.startsWith("..") || scope.includes(":")) throw new Error("run directory must be under research/runs");
mkdirSync(directory, { recursive: true });
const seconds = Number(flags.seconds ?? 60);
if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 600) throw new Error("smoke commands are capped at 600 seconds");
const budgetDirectory = join(ROOT, "research/runs/wave2-budget");
mkdirSync(budgetDirectory, { recursive: true });
const unlock = lockRun(budgetDirectory);
const budgetPath = join(budgetDirectory, "budget.json");
const budget = existsSync(budgetPath) ? JSON.parse(readFileSync(budgetPath, "utf8")) : { usedMs: 0, runs: [] };
const start = Date.now();
const allowance = Math.min(seconds * 1000, 3600000 - budget.usedMs);
const deadline = start + allowance;
let child = null, checkpoint;
const saveBudget = () => atomicJson(budgetPath, { ...budget, usedMs: budget.usedMs + Date.now() - start });
const stopChild = () => {
  if (child && child.exitCode === null) {
    if (process.platform === "win32") { try { execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); } catch {} }
    else child.kill("SIGTERM");
  }
};
const signal = () => { stopChild(); saveBudget(); unlock(); process.exit(130); };
process.once("SIGINT", signal); process.once("SIGTERM", signal);
const read = (name) => JSON.parse(readFileSync(join(directory, name), "utf8"));
let status = "failed";
try {
  if (allowance <= 0) throw new Error("one-hour pilot budget exhausted; request a new budget before longer work");
  const identity = { version: 1, fingerprint: labFingerprint(), kind: "local-smoke", maxComputeMs: 3600000 };
  const manifestPath = join(directory, "manifest.json");
  if (existsSync(manifestPath) && stable(read("manifest.json")) !== stable(identity)) throw new Error("lab source changed; preserve this experiment and use a new run directory");
  atomicJson(manifestPath, identity);
  checkpoint = setInterval(saveBudget, 1000);
  switch (command) {
    case "collect": {
      const transitions = [];
      const record = await collect({ deadline, surface: flags.surface ?? "pilot", seconds: Number(flags.duration ?? 10),
        seed: Number(flags.seed ?? 1), build: flags.build ?? "default",
        ...(flags.policy ? { policy: { kind: "bespoke", name: flags.policy } } : {}), onTransition: (r) => transitions.push(r) });
      atomicJson(join(directory, "replay.json"), record);
      atomicJson(join(directory, "transitions.json"), transitions);
      atomicJson(join(directory, "scenarios.json"), scenarios(record));
      const copy = await replay(record, record.steps.length, { deadline }); copy.close();
      atomicJson(join(directory, "replay-verification.json"), { matched: true, decisions: record.steps.length,
        simulatedSeconds: record.steps.at(-1)?.clock ?? 0, wallSeconds: (Date.now() - start) / 1000 });
      break;
    }
    case "oracle": {
      const labels = [];
      const record = read("replay.json");
      const points = flags.index ? [{ index: Number(flags.index) }] : read("scenarios.json").slice(0, 3);
      if (!points.length) throw new Error("no eligible scenario; collect a longer fight");
      for (const point of points) {
        if (Date.now() >= deadline) break;
        labels.push(await oracle(record, point.index, { deadline, candidates: Number(flags.candidates ?? 4),
          iterations: Number(flags.iterations ?? 1), horizon: Number(flags.horizon ?? 2) }));
        atomicJson(join(directory, "teacher.json"), labels);
      }
      break;
    }
    case "dagger": {
      if (!flags.model) throw new Error("dagger requires --model");
      const model = JSON.parse(readFileSync(resolve(flags.model), "utf8"));
      const record = await collect({ deadline, surface: model.surface, seconds: Number(flags.duration ?? 6),
        seed: Number(flags.seed ?? 123), policy: { kind: "network", model } });
      atomicJson(join(directory, "student-replay.json"), record);
      const labels = [];
      for (const point of scenarios(record).slice(0, 3)) {
        if (Date.now() >= deadline) break;
        labels.push(await oracle(record, point.index, { deadline, candidates: 4, iterations: 1 }));
        atomicJson(join(directory, "student-teacher.json"), labels);
      }
      if (!labels.length) throw new Error("student visited no queryable scenario before deadline");
      break;
    }
    case "reference": {
      const tier = flags.tier ?? "privileged", name = `reference-${tier}.json`;
      const existing = existsSync(join(directory, name)) ? read(name) : null;
      const result = await referenceFight({ tier, record: existing?.record ?? null,
        config: { surface: "pilot", maxSeconds: Number(flags.duration ?? 150) },
        model: tier === "fair" ? read("observation-model.json") : null, deadline,
        maxDecisions: Number(flags.decisions ?? 8), onCheckpoint: (value) => atomicJson(join(directory, name),
          { ...value, labels: [...(existing?.labels ?? []), ...value.labels] }) });
      atomicJson(join(directory, name), { ...result, labels: [...(existing?.labels ?? []), ...result.labels] });
      break;
    }
    case "fair": {
      const rows = read("transitions.json"), model = fitObservationModel(rows);
      const labels = rows.slice(0, 12).map((r) => fairPlan(r.observation, model, { steps: 6 }));
      atomicJson(join(directory, "observation-model.json"), model);
      atomicJson(join(directory, "fair-teacher.json"), labels);
      break;
    }
    case "refit": atomicJson(join(directory, "refit.json"), await refit({ deadline, bouts: Number(flags.bouts ?? 4) })); break;
    case "evaluate": {
      const candidates = flags.model ? [{ kind: "network", model: JSON.parse(readFileSync(resolve(flags.model), "utf8")) }]
        : flags.refit ? [{ kind: "refit", tables: read("refit.json").tables }] : portfolio();
      const protocol = { split: flags.split ?? "selection", maxSeconds: Number(flags.duration ?? 150), candidates };
      const filename = `evaluation-${digest(protocol).slice(0, 16)}.json`;
      const results = existsSync(join(directory, filename)) ? read(filename)
        : candidates.map((policy) => ({ policy, split: protocol.split, maxSeconds: protocol.maxSeconds, rows: [] }));
      const persist = () => { atomicJson(join(directory, filename), results); atomicJson(join(directory, "evaluation.json"), results); };
      for (const result of results) {
        if (Date.now() >= deadline) break;
        await evaluatePolicy(result.policy, { deadline, split: protocol.split, maxSeconds: protocol.maxSeconds, completed: result.rows,
          onResult: (row) => { result.rows.push(row); if (result.rows.length % 2 === 0) persist(); } });
      }
      persist();
      break;
    }
    case "archive": {
      const archive = {};
      for (const { policy, rows } of read("evaluation.json")) {
        if (!rows.length) continue;
        const mean = (key) => rows.reduce((s, r) => s + r.behavior[key], 0) / rows.length;
        updateArchive(archive, { policy, split: rows[0].split, bouts: rows.length,
          score: rows.reduce((s, r) => s + r.score, 0) / rows.length,
          behavior: { attackRate: mean("attackRate"), retreatFraction: mean("retreatFraction"), nearFraction: mean("nearFraction") },
          status: "selection candidate only; independent confirmation and visual review required" });
      }
      atomicJson(join(directory, "archive.json"), archive);
      break;
    }
    case "train": {
      const python = resolve(flags.python ?? ".tools/ai-lab-venv/Scripts/python.exe");
      const method = flags.method ?? "ppo", surface = flags.surface ?? "pilot", seed = String(flags.seed ?? 1);
      if (!["ppo", "neat", "evolution", "distill"].includes(method) || !["pilot", "direct", "residual"].includes(surface) || !/^\d+$/.test(seed)) throw new Error("invalid training arguments");
      const out = join(directory, `${method}-${surface}-${seed}`);
      const trainingArgs = [join(ROOT, "research/lab/train.py"), method, "--out", out, "--surface", surface, "--seed", seed,
        "--seconds", String(Math.max(1, allowance / 1000 - 8)), "--episode-seconds", flags.duration ?? "150"];
      if (flags.labels) trainingArgs.push("--labels", resolve(flags.labels));
      child = spawn(python, trainingArgs, { cwd: ROOT, stdio: "inherit", windowsHide: true,
        env: { ...process.env, MPLCONFIGDIR: join(ROOT, ".tools/matplotlib-cache") } });
      const watchdog = setTimeout(stopChild, allowance);
      try { await new Promise((done, reject) => { child.once("error", reject); child.once("exit", (code) => code === 0 ? done() : reject(new Error(`trainer exited ${code}`))); }); }
      finally { clearTimeout(watchdog); }
      break;
    }
    case "preview": {
      const specs = flags.model ? [{ kind: "network", model: JSON.parse(readFileSync(resolve(flags.model), "utf8")) }] : portfolio();
      const template = readFileSync(join(ROOT, "index.html"), "utf8");
      const script = `<script type="module">
        import {POLICIES} from '/src/mind.ts';
        import {labMind} from '/src/golem/lab-policy.ts';
        import {GOLEM_CONTROL_SURFACE} from '/src/control-surfaces.ts';
        const specs=${JSON.stringify(specs).replaceAll("<", "\\u003c")};
        specs.forEach((spec,i)=>POLICIES.push({name:'golem-researched-lab-'+i,label:'LAB '+(spec.name??spec.kind),
          surface:GOLEM_CONTROL_SURFACE,create:(seed=1)=>labMind(spec,seed)}));
        await import('/src/main.ts');
        document.title='Experimental policy lab — not promoted';
      </script>`;
      const entry = '<script type="module" src="/src/main.ts"></script>';
      if (template.split(entry).length !== 2) throw new Error("unknown arena entrypoint");
      writeFileSync(join(directory, "preview.html"), template.replace(entry, script));
      console.log(`/${relative(ROOT, directory).replaceAll("\\", "/")}/preview.html`);
      break;
    }
    default: throw new Error("commands: collect, oracle, reference, dagger, fair, refit, evaluate, archive, train, preview");
  }
  status = "complete";
} finally {
  stopChild(); clearInterval(checkpoint);
  budget.runs.push({ command, flags, startedAt: new Date(start).toISOString(), elapsedMs: Date.now() - start, status });
  saveBudget(); unlock();
}
