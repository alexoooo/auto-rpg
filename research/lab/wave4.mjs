/** September 22 authorized campaign. Each invocation is a checkpointed, metered stage. */
import { existsSync, readFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { ROOT } from "../fingerprint.mjs";
import { atomicJson, lockRun } from "../runner.mjs";
import { guardOwnedChild, terminateOwnedChild } from "../owned-child.mjs";
import { stable, digest } from "../schedule.mjs";
import { collect, scenarios, labFingerprint, snapshotSources } from "./experiments.mjs";
import { oracle, randomNormal } from "./planning.mjs";
import { createEnvironment } from "./environment.mjs";
import { infer, validateNetwork } from "../../src/golem/lab-policy.ts";
import { assessRequirement, policyBodyForSetup } from "../../src/policy-applicability.ts";
import { namedBuild } from "../../src/golem/roster.ts";
import { mulberry32 } from "../../src/rng.ts";
import { AUTHORIZATION, remainingAllowance, fixtures, compare, TEACHER_OPPONENTS, TARGETS, BASE } from "./wave4-protocol.mjs";

const directory = join(ROOT, "research/runs/wave4-2026-09-22-r2");
const budgetDir = join(ROOT, "research/runs/wave4-budget");
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const save = (name, value) => atomicJson(join(directory, name), value);
const load = (name) => read(join(directory, name));
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const score = (rows) => mean(rows.map((r) => r.score));
const oldStudent = join(ROOT, "research/runs/wave3-reference-student-long-r5/distill-residual-11/model.json");
const clockDir = join(ROOT, "research/runs/wave3-reference-student-clock-data");

export function applicability(spec, build) {
  const body = policyBodyForSetup(namedBuild(build).setup);
  if (spec.kind === "bespoke") return assessRequirement(spec.name === "needle" ? "point-primary"
    : spec.name === "paired" ? "independent-hands" : undefined, body);
  if (spec.kind === "network" && spec.model.scope) {
    const independent = assessRequirement("independent-hands", body);
    if (independent.status !== "applicable") return independent;
    const setup = namedBuild(build).setup;
    const allowed = spec.model.scope === "twin-blades" ? ["blade"] : ["blade", "fist"];
    if (![setup.primary, setup.secondary].every((pick) => allowed.includes(pick.terminal))) {
      return { status: "fallback-only", reason: "Outside the frozen network deployment scope." };
    }
  }
  return { status: "applicable", reason: "" };
}

async function evaluate(id, spec, cells, deadline, { allowFallback = false } = {}) {
  const filename = `evaluation-${id}.json`;
  const identity = { id, specHash: digest(spec), cells, allowFallback, maxSeconds: 150 };
  const previous = existsSync(join(directory, filename)) ? load(filename) : { identity, spec, rows: [] };
  if (stable(previous.identity) !== stable(identity)) throw new Error("evaluation identity changed");
  const rows = previous.rows;
  for (const cell of cells) {
    const old = rows.filter((r) => r.seed === cell.seed && r.opponent === cell.opponent);
    if (old.length) {
      if (old.length !== 2 || new Set(old.map((r) => r.side)).size !== 2) throw new Error("invalid resumed pair");
      continue;
    }
    const applicable = applicability(spec, cell.build), opponentApplicable = applicability(cell.opponentSpec, cell.opponentBuild);
    if (!allowFallback && [applicable, opponentApplicable].some((a) => a.status !== "applicable")) throw new Error("specialist fixture requires active behavior");
    const pair = [];
    for (const side of ["left", "right"]) {
      if (Date.now() >= deadline) throw new Error("stage deadline reached; complete pairs checkpointed");
      const env = await createEnvironment({ seed: side === "left" ? cell.seed : cell.seed ^ 0x123456,
        leftBuild: side === "left" ? cell.build : cell.opponentBuild,
        rightBuild: side === "right" ? cell.build : cell.opponentBuild,
        left: side === "left" ? spec : cell.opponentSpec, right: side === "right" ? spec : cell.opponentSpec });
      try {
        let state = env.state();
        while (!state.terminated && !state.truncated && Date.now() < deadline) state = env.step();
        if (!state.terminated && !state.truncated) throw new Error("stage deadline reached; incomplete bout excluded");
        const result = env.result(), behavior = env.behaviors[side], bins = result.behaviour[side].rangeBins;
        pair.push({ ...cell, side, applicability: applicable.status, opponentApplicability: opponentApplicable.status,
          terminated: state.terminated, truncated: state.truncated, seconds: state.clock, winner: state.winner,
          score: state.winner === side ? 1 : state.winner === null ? 0.5 : 0, damage: result[side].damage,
          behavior: { attackRate: behavior.attackEdges / state.clock, retreatFraction: behavior.retreatSeconds / state.clock,
            nearFraction: bins[0] / Math.max(1e-9, bins.reduce((a, b) => a + b, 0)) } });
      } finally { env.close(); }
    }
    rows.push(...pair); save(filename, { ...previous, rows, complete: rows.length === cells.length * 2 });
    if (rows.length % 16 === 0) console.log(JSON.stringify({ evaluation: id, bouts: rows.length, score: score(rows) }));
  }
  return rows;
}

async function train(outName, args, seconds, deadline) {
  const out = join(directory, outName);
  if (existsSync(join(out, "model.json"))) return read(join(out, "model.json"));
  if (deadline - Date.now() < (seconds + 10) * 1000) throw new Error("insufficient stage budget for training job");
  mkdirSync(out, { recursive: true });
  const child = guardOwnedChild(spawn(join(ROOT, ".tools/ai-lab-venv/Scripts/python.exe"),
    [join(ROOT, "research/lab/train.py"), ...args, "--out", out, "--seconds", String(seconds)],
    { cwd: ROOT, stdio: "inherit", windowsHide: true, env: { ...process.env, MPLCONFIGDIR: join(ROOT, ".tools/matplotlib-cache") } }));
  const watchdog = setTimeout(() => terminateOwnedChild(child), Math.min(deadline - Date.now(), (seconds + 30) * 1000));
  try { await new Promise((done, reject) => { child.once("error", reject); child.once("exit", (code) => code === 0 ? done() : reject(new Error(`trainer exited ${code}`))); }); }
  finally { clearTimeout(watchdog); terminateOwnedChild(child); }
  return read(join(out, "model.json"));
}

function prepare() {
  const proposed = {
    authorization: AUTHORIZATION, fingerprint: labFingerprint(), date: "2026-09-22",
    studentHash: digest(read(oldStudent)), teacherOpponents: TEACHER_OPPONENTS,
    seeds: [11, 22, 33], ppoSecondsPerSeed: 180, studentScope: "twin-blades",
    teacherRounds: 3, trajectoriesPerRound: 3, queriesPerTrajectory: 6, teacherBranches: 16,
    promotion: { minimumBouts: 128, minimumGain: 0.1, lower95Bound: "strictly positive", browserReview: true, completedRatingLeague: true },
    fixtures: Object.fromEntries(["studentSelection", "studentConfirmation", "ppoSelection", "ppoConfirmation", "robustness"]
      .map((kind) => [kind, fixtures(kind, kind.endsWith("Confirmation") ? kind.startsWith("student") ? 8 : 6 : kind === "robustness" ? 2 : 2)])),
    counterFixtures: Object.fromEntries(TARGETS.map((target) => [target, {
      train: fixtures("counterTrain", 2, target), selection: fixtures("counterSelection", 8, target), confirmation: fixtures("counterConfirmation", 32, target) }])),
    counterCandidates: 16, counterSelectionFinalists: 3,
  };
  if (existsSync(join(directory, "protocol.json"))) {
    if (stable(load("protocol.json")) !== stable(proposed)) throw new Error("source or protocol changed: preserve this campaign");
  } else {
    // Audit archived evaluation/league seeds before any new outcome is observed.
    const historical = new Set();
    for (const dir of readdirSync(join(ROOT, "research/runs"), { withFileTypes: true }).filter((x) => x.isDirectory() && x.name !== "wave4-2026-09-22-r2")) {
      for (const file of ["evaluation.json", "results.jsonl"]) {
        const path = join(ROOT, "research/runs", dir.name, file);
        if (!existsSync(path)) continue;
        const raw = readFileSync(path, "utf8");
        for (const match of raw.matchAll(/"seed"\s*:\s*(\d+)|"seeds"\s*:\s*\[\s*(\d+)\s*,\s*(\d+)/g)) {
          for (const x of match.slice(1).filter(Boolean)) historical.add(Number(x));
        }
      }
    }
    const cells = [...Object.values(proposed.fixtures).flat(), ...Object.values(proposed.counterFixtures).flatMap((x) => Object.values(x).flat())];
    if (cells.some((r) => historical.has(r.seed) || historical.has(r.seed ^ 0x123456))) throw new Error("historical seed collision");
    save("protocol.json", proposed); save("source-snapshot.json", snapshotSources());
    save("seed-audit.json", { historicalSeeds: historical.size, proposedCells: cells.length, collisions: 0,
      note: "Audits archived evaluation.json and results.jsonl. Teacher collection uses a separate 418000000 band." });
  }
  return proposed;
}

async function studentStage(protocol, deadline) {
  let model = read(oldStudent);
  const dataset = existsSync(join(directory, "student-labels.json")) ? load("student-labels.json")
    : read(join(ROOT, "research/runs/wave3-reference-student-data/labels.json"));
  const report = existsSync(join(directory, "student-teacher.json")) ? load("student-teacher.json") : { rounds: [], queries: [], trajectories: [] };
  for (let round = 0; round < 3; round++) {
    if (report.rounds[round]) { model = read(join(directory, `student-round-${round}/model.json`)); continue; }
    for (let f = 0; f < TEACHER_OPPONENTS.length; f++) {
      const id = round * 3 + f, replayName = `student-trajectory-${id}.json`;
      const record = existsSync(join(directory, replayName)) ? load(replayName) : await collect({ deadline,
        surface: "residual", seconds: 150, seed: 418000000 + id, build: "two-blades", opponent: TEACHER_OPPONENTS[f],
        policy: { kind: "network", model } });
      save(replayName, record);
      if (!report.trajectories.includes(record.id)) {
        report.trajectories.push(record.id);
        for (let i = 0; i < record.steps.length - 1; i += Math.max(1, Math.floor(record.steps.length / 24))) {
          dataset.push({ observation: record.steps[i].observation, action: infer(model, record.steps[i].observation), source: "retention", replayId: record.id, index: i + 1 });
        }
      }
      const last = record.steps.findIndex((r) => r.terminated || r.truncated);
      const length = last < 0 ? record.steps.length : last;
      const points = [...new Set([...scenarios(record).map((p) => p.index),
        ...[0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((p) => Math.max(1, Math.floor(length * p)))])].filter((i) => i < length).slice(0, 6);
      for (const index of points) {
        if (report.queries.some((q) => q.replayId === record.id && q.index === index)) continue;
        const label = await oracle(record, index, { deadline, candidates: 16, iterations: 1, horizon: 2, seed: 418100000 + id * 10 + index });
        if (label.evaluations !== 17) throw new Error("incomplete teacher query; resume from checkpoint");
        const row = { ...label, action: label.action ?? infer(model, label.observation), round, opponent: TEACHER_OPPONENTS[f] };
        report.queries.push(row);
        for (let weight = 0; weight < 8; weight++) dataset.push(row);
        save("student-labels.json", dataset); save("student-teacher.json", report);
        console.log(JSON.stringify({ teacherQueries: report.queries.length, trajectories: report.trajectories.length, round }));
      }
    }
    save("student-labels.json", dataset);
    model = await train(`student-round-${round}`, ["distill", "--surface", "residual", "--baseline", "golem-duelist", "--seed", String(101 + round),
      "--labels", join(directory, "student-labels.json"), "--distill-updates", "10000"], 40, deadline);
    report.rounds.push({ round, datasetRows: dataset.length, uniqueQueries: report.queries.length, modelHash: digest(model) });
    save("student-teacher.json", report);
  }
  const contenders = [
    { id: "student-original", spec: { kind: "network", model: { ...read(oldStudent), scope: "twin-blades" } } },
    { id: "student-corrected", spec: { kind: "network", model: { ...model, scope: "twin-blades" } } },
    { id: "student-constant", spec: { kind: "network", model: { ...read(join(clockDir, "constant-model.json")), scope: "twin-blades" } } },
    ...[0, 1, 2, 3].map((i) => ({ id: `student-clock-${i}`, spec: { kind: "network", model: { ...read(join(clockDir, `clock-model-${i}.json`)), scope: "twin-blades" } } })),
  ];
  const cells = protocol.fixtures.studentSelection, control = await evaluate("student-control", BASE, cells, deadline);
  const results = [];
  for (const item of contenders) {
    validateNetwork(item.spec.model);
    const rows = await evaluate(item.id, item.spec, cells, deadline);
    results.push({ ...item, comparison: compare(rows, control) });
  }
  const students = results.filter((r) => ["student-original", "student-corrected"].includes(r.id)).sort((a, b) => b.comparison.candidateScore - a.comparison.candidateScore);
  save("student-selection.json", { results, finalist: students[0], controls: results.filter((r) => !students.includes(r)), status: "selection only" });
}

async function ppoStage(variant, protocol, deadline) {
  const surface = variant === "direct" ? "direct" : "residual";
  for (const seed of protocol.seeds) {
    const id = `ppo-${variant}-${seed}`;
    const args = ["ppo", "--surface", surface, "--baseline", "golem-duelist", "--seed", String(seed), "--envs", "4",
      "--log-std", variant === "standard" || variant === "direct" ? "0" : "-1.5"];
    if (variant === "restricted") args.push("--residual-mode", "aim-reach");
    await train(id, args, protocol.ppoSecondsPerSeed, deadline);
    for (const execution of ["mean", "sampled"]) {
      const model = read(join(directory, id, execution === "mean" ? "model.json" : "stochastic-model.json"));
      await evaluate(`${id}-${execution}`, { kind: "network", model }, protocol.fixtures.ppoSelection, deadline);
    }
  }
}

async function counterStage(target, protocol, deadline) {
  const cells = protocol.counterFixtures[target];
  const candidates = [{ id: `counter-${target}-duelist`, spec: BASE },
    ...["golem-form", "golem-guardian", "golem-brawler", "golem-miser", "golem-tactician"].map((name) => ({ id: `counter-${target}-${name}`, spec: { kind: "baseline", name } }))];
  const random = mulberry32(target === "needle" ? 419000001 : 419000002);
  while (candidates.length < protocol.counterCandidates) {
    const i = candidates.length;
    candidates.push({ id: `counter-${target}-mixture-${i}`, spec: { kind: "mixture", seconds: 0.5 + random() * 2,
      weights: Array.from({ length: 4 }, (_, row) => Array.from({ length: 8 }, (_, col) => col === 0 ? (row === i % 4 ? 1.5 : 0) : randomNormal(random) * 0.7)) } });
  }
  const ranked = [];
  for (const candidate of candidates) {
    const rows = await evaluate(`${candidate.id}-train`, candidate.spec, cells.train, deadline);
    ranked.push({ ...candidate, trainScore: score(rows) });
  }
  ranked.sort((a, b) => b.trainScore - a.trainScore);
  const control = await evaluate(`counter-${target}-control-selection`, BASE, cells.selection, deadline);
  const results = [];
  for (const candidate of ranked.filter((c) => c.spec.kind !== "baseline" || c.spec.name !== "golem-duelist").slice(0, 3)) {
    const rows = await evaluate(`${candidate.id}-selection`, candidate.spec, cells.selection, deadline);
    results.push({ ...candidate, comparison: compare(rows, control) });
  }
  results.sort((a, b) => b.comparison.candidateScore - a.comparison.candidateScore);
  save(`counter-${target}-selection.json`, { ranked, results, finalist: results[0], status: "selection only" });
}

async function confirmation(protocol, deadline) {
  const finalists = [];
  const student = load("student-selection.json");
  finalists.push({ ...student.finalist, category: "student", cells: protocol.fixtures.studentConfirmation });
  for (const target of TARGETS) finalists.push({ ...load(`counter-${target}-selection.json`).finalist,
    category: `counter-${target}`, cells: protocol.counterFixtures[target].confirmation });
  const ppoControl = await evaluate("ppo-control-selection", BASE, protocol.fixtures.ppoSelection, deadline);
  const learners = [];
  for (const variant of ["standard", "low-noise", "restricted", "direct"]) for (const seed of protocol.seeds) for (const execution of ["mean", "sampled"]) {
    const id = `ppo-${variant}-${seed}-${execution}`, evaluation = load(`evaluation-${id}.json`);
    learners.push({ id, spec: evaluation.spec, comparison: compare(evaluation.rows, ppoControl), variant, seed, execution });
  }
  learners.sort((a, b) => b.comparison.candidateScore - a.comparison.candidateScore);
  save("ppo-selection.json", { learners, finalist: learners[0], status: "selection only; report all seeds" });
  finalists.push({ ...learners[0], category: "ppo", cells: protocol.fixtures.ppoConfirmation });
  if (existsSync(join(directory, "frozen-finalists.json")) && stable(load("frozen-finalists.json")) !== stable(finalists)) throw new Error("finalists changed after freezing");
  save("frozen-finalists.json", finalists);
  const results = [];
  for (const finalist of finalists) {
    const control = await evaluate(`${finalist.category}-confirmation-control`, BASE, finalist.cells, deadline);
    const rows = await evaluate(`${finalist.category}-confirmation`, finalist.spec, finalist.cells, deadline);
    const result = { ...finalist, comparison: compare(rows, control) };
    if (finalist.category === "student") {
      result.imitationControls = [];
      for (const candidate of student.controls) {
        const other = await evaluate(`${candidate.id}-confirmation`, candidate.spec, finalist.cells, deadline);
        result.imitationControls.push({ id: candidate.id, comparison: compare(rows, other) });
      }
      // A constant or clock policy doing equally well does not establish learned state-dependent skill.
      result.comparison.eligible &&= result.imitationControls.every((r) => r.comparison.interval.low > 0);
    }
    if (finalist.category.startsWith("counter")) {
      const broad = await evaluate(`${finalist.category}-robustness`, finalist.spec, protocol.fixtures.robustness, deadline);
      result.robustness = { score: score(broad), bouts: broad.length };
    }
    results.push(result); save("confirmation.json", { results, complete: results.length === finalists.length,
      status: "statistical gate only; eligible candidates still require browser review and rating league" });
    console.log(JSON.stringify({ confirmation: finalist.category, ...result.comparison }));
  }
}

export async function runStage(stage, requestedSeconds = 3600) {
  mkdirSync(directory, { recursive: true }); mkdirSync(budgetDir, { recursive: true });
  const unlock = lockRun(budgetDir), budgetPath = join(budgetDir, "budget.json");
  const budget = existsSync(budgetPath) ? read(budgetPath) : { authorization: AUTHORIZATION, usedMs: 0, runs: [] };
  if (stable(budget.authorization) !== stable(AUTHORIZATION)) { unlock(); throw new Error("budget authorization mismatch"); }
  const start = Date.now(), allowance = remainingAllowance(budget.usedMs, requestedSeconds * 1000), deadline = start + allowance;
  let status = "failed", error = null;
  const checkpoint = () => atomicJson(budgetPath, { ...budget, usedMs: budget.usedMs + Date.now() - start,
    active: { stage, pid: process.pid, startedAt: new Date(start).toISOString() } });
  const timer = setInterval(checkpoint, 1000);
  try {
    if (!allowance) throw new Error("authorized compute budget exhausted");
    const protocol = prepare();
    Logger.LogLevels = Logger.ErrorLogLevel;
    if (stage === "prepare") save("prepared.json", { at: new Date().toISOString(), protocolHash: digest(protocol) });
    else if (stage === "student") await studentStage(protocol, deadline);
    else if (stage.startsWith("ppo-") && ["standard", "low-noise", "restricted", "direct"].includes(stage.slice(4))) await ppoStage(stage.slice(4), protocol, deadline);
    else if (stage.startsWith("counter-") && TARGETS.includes(stage.slice(8))) await counterStage(stage.slice(8), protocol, deadline);
    else if (stage === "confirm") await confirmation(protocol, deadline);
    else throw new Error("unknown wave4 stage");
    status = "complete";
  } catch (e) { error = String(e); throw e; }
  finally {
    clearInterval(timer);
    budget.usedMs += Date.now() - start;
    budget.runs.push({ stage, status, error, elapsedMs: Date.now() - start, startedAt: new Date(start).toISOString() });
    delete budget.active;
    atomicJson(budgetPath, budget); unlock();
    console.log(JSON.stringify({ stage, status, usedSeconds: budget.usedMs / 1000, remainingSeconds: Math.max(0, AUTHORIZATION.maxMs - budget.usedMs) / 1000 }));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await runStage(process.argv[2], Number(process.argv[3] ?? 3600));
