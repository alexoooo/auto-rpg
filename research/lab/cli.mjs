import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { spawn } from "node:child_process";
import { guardOwnedChild, terminateOwnedChild } from "../owned-child.mjs";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { atomicJson, lockRun } from "../runner.mjs";
import { ROOT } from "../fingerprint.mjs";
import { stable, digest } from "../schedule.mjs";
import { collect, scenarios, labFingerprint, snapshotSources, refit, portfolio, evaluatePolicy } from "./experiments.mjs";
import { DEFAULT_CONFIG, replay } from "./environment.mjs";
import { oracle, fitObservationModel, fairPlan, calibrateObservationModel } from "./planning.mjs";
import { updateArchive } from "./archive.mjs";
import { referenceFight } from "./reference.mjs";
import { populationSearch } from "./league.mjs";
import { teacherCampaign } from "./teacher-campaign.mjs";
import { exportPoses } from "./poses.mjs";
import { constantSearch } from "../constant-search.mjs";
import { infer } from "../../src/golem/lab-policy.ts";
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
const campaign = flags.budget === "campaign-2026-09-21";
if (flags.budget && !campaign) throw new Error("unknown budget authorization");
const maxComputeMs = campaign ? 8 * 3600000 : 3600000;
if (!Number.isFinite(seconds) || seconds <= 0 || seconds > (campaign ? 3600 : 600)) throw new Error("command exceeds authorized per-job limit");
const budgetDirectory = join(ROOT, campaign ? "research/runs/wave3-budget" : "research/runs/wave2-budget");
mkdirSync(budgetDirectory, { recursive: true });
const unlock = lockRun(budgetDirectory);
const budgetPath = join(budgetDirectory, "budget.json");
const budget = existsSync(budgetPath) ? JSON.parse(readFileSync(budgetPath, "utf8")) : { usedMs: 0, runs: [] };
const start = Date.now();
const allowance = Math.min(seconds * 1000, maxComputeMs - budget.usedMs);
const deadline = start + allowance;
let child = null, checkpoint;
const saveBudget = () => atomicJson(budgetPath, { ...budget, usedMs: budget.usedMs + Date.now() - start });
const stopChild = () => terminateOwnedChild(child);
const signal = () => { stopChild(); saveBudget(); unlock(); process.exit(130); };
process.once("SIGINT", signal); process.once("SIGTERM", signal);
const read = (name) => JSON.parse(readFileSync(join(directory, name), "utf8"));
async function trainChild(trainingArgs, milliseconds) {
  const python = resolve(flags.python ?? ".tools/ai-lab-venv/Scripts/python.exe");
  child = guardOwnedChild(spawn(python, trainingArgs, { cwd: ROOT, stdio: "inherit", windowsHide: true,
    env: { ...process.env, MPLCONFIGDIR: join(ROOT, ".tools/matplotlib-cache") } }));
  const watchdog = setTimeout(stopChild, milliseconds);
  try { await new Promise((done, reject) => { child.once("error", reject); child.once("exit", (code) => code === 0 ? done() : reject(new Error(`trainer exited ${code}`))); }); }
  finally { clearTimeout(watchdog); }
}
let status = "failed";
try {
  if (allowance <= 0) throw new Error("authorized compute budget exhausted");
  const identity = { version: 1, fingerprint: labFingerprint(), kind: campaign ? "local-campaign" : "local-smoke", maxComputeMs };
  const manifestPath = join(directory, "manifest.json");
  if (existsSync(manifestPath) && stable(read("manifest.json")) !== stable(identity)) throw new Error("lab source changed; preserve this experiment and use a new run directory");
  atomicJson(manifestPath, identity);
  const snapshotPath = join(directory, "source-snapshot.json");
  if (!existsSync(snapshotPath)) atomicJson(snapshotPath, snapshotSources());
  checkpoint = setInterval(saveBudget, 1000);
  switch (command) {
    case "dagger-campaign": {
      if (!flags.model) throw new Error("dagger-campaign requires an initial student --model");
      let model = JSON.parse(readFileSync(resolve(flags.model), "utf8"));
      if (model.version !== 2 || model.hz !== 12) throw new Error("DAgger campaign requires a version-2, 12 Hz student");
      const dataset = [], rounds = [];
      for (let round = 0; round < 3 && deadline - Date.now() > 15000; round++) {
        const record = await collect({ deadline, surface: model.surface, seconds: 20, seed: 7001 + round,
          build: ["default", "two-blades", "mace"][round], policy: { kind: "network", model } });
        atomicJson(join(directory, `dagger-replay-${round}.json`), record);
        // Retain ordinary student decisions, not just rare teacher queries, to limit forgetting.
        for (const row of record.steps.slice(0, -1)) dataset.push({ observation: row.observation,
          action: infer(model, row.observation), source: "student-retention", round });
        const labels = [];
        for (const point of scenarios(record).slice(0, 3)) {
          if (deadline - Date.now() < 15000) break;
          let label;
          try { label = await oracle(record, point.index, { deadline: deadline - 12000, candidates: 16, iterations: 1 }); }
          catch (error) {
            if (String(error).includes("deadline") || String(error).includes("budget exhausted")) break;
            throw error;
          }
          const action = label.action ?? infer(model, label.observation);
          labels.push({ ...label, action, source: label.action === null ? "teacher-retained-student" : "teacher-improvement", round });
          // Explicit query emphasis, recorded rather than an implicit loss weighting.
          for (let weight = 0; weight < 8; weight++) dataset.push(labels.at(-1));
          atomicJson(join(directory, "dagger-labels.json"), dataset);
        }
        atomicJson(join(directory, "dagger-labels.json"), dataset);
        if (!dataset.length || deadline - Date.now() < 12000) break;
        const out = join(directory, `dagger-student-${round}`), seconds = Math.min(40, (deadline - Date.now()) / 1000 - 8);
        await trainChild([join(ROOT, "research/lab/train.py"), "distill", "--out", out, "--surface", model.surface,
          "--baseline", model.baseline ?? "golem-driver",
          "--seed", String(7001 + round), "--seconds", String(seconds), "--labels", join(directory, "dagger-labels.json")], deadline - Date.now());
        model = JSON.parse(readFileSync(join(out, "model.json"), "utf8"));
        rounds.push({ round, queries: labels, datasetRows: dataset.length, student: relative(ROOT, out) });
        atomicJson(join(directory, "dagger-campaign.json"), { rounds, model, status: "training only; independent evaluation required" });
      }
      break;
    }
    case "poses": {
      const input = flags.record ? JSON.parse(readFileSync(resolve(flags.record), "utf8")) : read("replay.json");
      const record = input.record ?? input;
      atomicJson(join(directory, "pose-replay.json"), await exportPoses(record, { deadline }));
      console.log(`/research/lab/viewer.html?data=/${relative(ROOT, directory).replaceAll("\\", "/")}/pose-replay.json`);
      break;
    }
    case "teacher-campaign": {
      const filename = "teacher-campaign.json";
      const previous = existsSync(join(directory, filename)) ? read(filename) : null;
      const save = (value) => atomicJson(join(directory, filename), value);
      save(await teacherCampaign({ deadline, seed: Number(flags.seed ?? 4001), previous, onCheckpoint: save }));
      break;
    }
    case "population": {
      const save = (value) => atomicJson(join(directory, "population.json"), value);
      save(await populationSearch({ deadline, seed: Number(flags.seed ?? 1), generations: Number(flags.generations ?? 6), onCheckpoint: save }));
      break;
    }
    case "pose-search": {
      const save = (value) => {
        atomicJson(join(directory, "constant-search.json"), value);
        atomicJson(join(directory, "model.json"), value.model);
      };
      save(await constantSearch({ deadline, seed: Number(flags.seed ?? 1),
        generations: Number(flags.generations ?? 8), onCheckpoint: save }));
      break;
    }
    case "collect": {
      const transitions = [];
      const record = await collect({ deadline, surface: flags.surface ?? "pilot", seconds: Number(flags.duration ?? 10),
        seed: Number(flags.seed ?? 1), build: flags.build ?? "default",
        opponent: flags.opponent ?? "golem-fencer", opponentBuild: flags.opponentBuild ?? flags.build ?? "default",
        controlBaseline: flags.baseline ?? "golem-driver",
        ...(flags.policy ? { policy: { kind: flags.policy.startsWith("golem-") ? "baseline" : "bespoke", name: flags.policy } } : {}),
        onTransition: (r) => transitions.push(r) });
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
      const search = { candidates: Number(flags.candidates ?? 4), horizon: Number(flags.horizon ?? 2),
        commitSeconds: Number(flags.commit ?? 0.25) };
      if (existing?.search && stable(existing.search) !== stable(search)) throw new Error("reference search changed; use a new experiment");
      const config = { surface: flags.surface ?? "pilot", maxSeconds: Number(flags.duration ?? 150),
        seed: Number(flags.seed ?? DEFAULT_CONFIG.seed), leftBuild: flags.build ?? "default",
        rightBuild: flags.opponentBuild ?? flags.build ?? "default", controlBaseline: flags.baseline ?? "golem-driver",
        left: { kind: "baseline", name: flags.baseline ?? "golem-driver" },
        right: { kind: "baseline", name: flags.opponent ?? "golem-fencer" } };
      if (tier === "fair" && config.surface !== "pilot") throw new Error("fair reference currently requires the pilot action surface");
      if (existing && Object.entries(config).some(([key, value]) => stable(existing.record.config[key]) !== stable(value))) {
        throw new Error("reference fight configuration changed; use a new experiment");
      }
      const result = await referenceFight({ tier, record: existing?.record ?? null,
        config,
        model: tier === "fair" ? read("observation-model.json") : null, deadline, ...search,
        maxDecisions: Number(flags.decisions ?? 8), onCheckpoint: (value) => atomicJson(join(directory, name),
          { ...value, search, labels: [...(existing?.labels ?? []), ...value.labels] }) });
      atomicJson(join(directory, name), { ...result, search, labels: [...(existing?.labels ?? []), ...result.labels] });
      break;
    }
    case "fair": {
      const rows = read("transitions.json"), model = fitObservationModel(rows);
      const labels = rows.slice(0, 12).map((r) => fairPlan(r.observation, model, { steps: 6 }));
      atomicJson(join(directory, "observation-model.json"), model);
      atomicJson(join(directory, "fair-teacher.json"), labels);
      const validation = [];
      await collect({ deadline, surface: flags.surface ?? "pilot", seconds: Number(flags.duration ?? 10),
        seed: Number(flags.seed ?? 50001), onTransition: (r) => validation.push({ ...r, split: "model-validation" }) });
      atomicJson(join(directory, "model-validation.json"), validation);
      atomicJson(join(directory, "model-calibration.json"), calibrateObservationModel(model, validation));
      break;
    }
    case "refit": atomicJson(join(directory, "refit.json"), await refit({ deadline, bouts: Number(flags.bouts ?? 4) })); break;
    case "evaluate": {
      const candidates = flags.model ? [{ kind: "network", model: JSON.parse(readFileSync(resolve(flags.model), "utf8")) }]
        : flags.spec ? [JSON.parse(readFileSync(resolve(flags.spec), "utf8"))]
        : flags.terminalModel ? [{ kind: "terminal-model", model: JSON.parse(readFileSync(resolve(flags.terminalModel), "utf8")).terminalModel }]
        : flags.refit ? [{ kind: "refit", tables: read("refit.json").tables }]
        : flags.policy ? [{ kind: flags.policy.startsWith("golem-") ? "baseline" : "bespoke", name: flags.policy }] : portfolio();
      const protocol = { split: flags.split ?? "selection", maxSeconds: Number(flags.duration ?? 150), candidates,
        repeats: Number(flags.repeats ?? 1), crossBuild: flags.crossBuild === "true" };
      const filename = `evaluation-${digest(protocol).slice(0, 16)}.json`;
      const results = existsSync(join(directory, filename)) ? read(filename)
        : candidates.map((policy) => ({ policy, split: protocol.split, maxSeconds: protocol.maxSeconds, rows: [] }));
      const persist = () => { atomicJson(join(directory, filename), results); atomicJson(join(directory, "evaluation.json"), results); };
      for (const result of results) {
        if (Date.now() >= deadline) break;
        await evaluatePolicy(result.policy, { deadline, split: protocol.split, maxSeconds: protocol.maxSeconds, completed: result.rows,
          repeats: protocol.repeats, crossBuild: protocol.crossBuild,
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
      const method = flags.method ?? "ppo", surface = flags.surface ?? "pilot", seed = String(flags.seed ?? 1);
      if (!["ppo", "neat", "evolution", "distill"].includes(method) || !["pilot", "direct", "residual"].includes(surface) || !/^\d+$/.test(seed)) throw new Error("invalid training arguments");
      const reward = flags.reward ?? "terminal";
      if (!["terminal", "potential"].includes(reward)) throw new Error("invalid reward mode");
      const envs = flags.envs ?? "1";
      const out = join(directory, `${method}-${surface}-${seed}${reward === "terminal" ? "" : "-potential"}${envs === "1" ? "" : `-envs${envs}`}`);
      const trainingArgs = [join(ROOT, "research/lab/train.py"), method, "--out", out, "--surface", surface, "--seed", seed,
        "--seconds", String(Math.max(1, allowance / 1000 - 8)), "--episode-seconds", flags.duration ?? "150", "--reward", reward, "--envs", envs,
        "--baseline", flags.baseline ?? "golem-driver", "--log-std", flags.logStd ?? "0"];
      if (flags.labels) trainingArgs.push("--labels", resolve(flags.labels));
      await trainChild(trainingArgs, allowance);
      break;
    }
    case "preview": {
      const specs = flags.model ? [{ kind: "network", model: JSON.parse(readFileSync(resolve(flags.model), "utf8")) }]
        : flags.spec ? [JSON.parse(readFileSync(resolve(flags.spec), "utf8"))]
        : flags.terminalModel ? [{ kind: "terminal-model", model: JSON.parse(readFileSync(resolve(flags.terminalModel), "utf8")).terminalModel }]
        : portfolio();
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
