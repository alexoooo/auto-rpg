/**
 * Do golem-built policies fight well in a human body? Declared before any outcome; no reselection.
 *
 * `node research/human-transfer.mjs declare` freezes fixtures, policies, source and the decision
 * rule; `evaluate` runs them on the declaration's own 45-minute ledger; `summarize` recomputes the
 * comparisons from saved pairs without new bouts. The picker refuses these policies on human bodies
 * (commit c24ba5f); bouts are not gated, so this measures what that refusal is withholding.
 */
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { ROOT, fingerprint } from "./fingerprint.mjs";
import { atomicJson, lockRun } from "./runner.mjs";
import { stable, digest } from "./schedule.mjs";
import { labFingerprint } from "./lab/experiments.mjs";
import { compare } from "./lab/wave4-protocol.mjs";
import { createEnvironment } from "./lab/environment.mjs";

const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const directory = join(ROOT, "research/runs/human-transfer-2026-09-22");
const budgetDirectory = join(ROOT, "research/runs/human-transfer-budget");
export const AUTHORIZATION = Object.freeze({ id: "human-transfer-2026-09-22", maxMs: 45 * 60000, maxJobMs: 3600000 });
const HUMAN = ["human-warrior", "human-dual-swords", "human-unarmed", "human-maul"];
const OPPONENT = { kind: "baseline", name: "humanoid-duelist" };
// Each candidate on the human builds its requirement accepted before the family gate, 192 bouts
// apiece (sized to the ledger at ~28 s a bout). Controls cover the union, so every candidate pair has a same-seed control pair.
const CANDIDATES = [
  { name: "golem-researched-student-v1", builds: ["human-dual-swords"], seeds: 24 },
  { name: "golem-researched-needle-v1", builds: ["human-warrior", "human-dual-swords"], seeds: 12 },
  { name: "golem-researched-paired-v1", builds: ["human-warrior", "human-dual-swords", "human-unarmed"], seeds: 8 },
  { name: "golem-researched-ppo-v1", builds: HUMAN, seeds: 6 },
];
const CONTROLS = ["humanoid-duelist", "golem-duelist"];
const WORKERS = 30;

const fixture = (build, opponentBuild, index) => ({ split: "humanTransfer", build, opponentBuild,
  opponent: OPPONENT.name, seed: 420000000 + HUMAN.indexOf(build) * 10000 + HUMAN.indexOf(opponentBuild) * 1000 + index });
const fixtureKey = (row) => `${row.build}/${row.opponentBuild}/${row.seed}`;
const key = (policy, row) => `${policy}/${fixtureKey(row)}`;

async function runPair(task, deadline) {
  const rows = [];
  for (const side of ["left", "right"]) {
    const { build, opponentBuild, seed } = task.row;
    // The subject's mind always takes `seed` and the opponent's `seed ^ 0x123456`, on either side.
    const env = await createEnvironment({ seed: side === "left" ? seed : seed ^ 0x123456,
      leftBuild: side === "left" ? build : opponentBuild, rightBuild: side === "right" ? build : opponentBuild,
      left: side === "left" ? task.spec : OPPONENT, right: side === "right" ? task.spec : OPPONENT });
    try {
      let state = env.state();
      while (!state.terminated && !state.truncated && Date.now() < deadline) state = env.step();
      if (!state.terminated && !state.truncated) return null; // deadline: the unfinished pair is excluded
      const result = env.result(), other = side === "left" ? "right" : "left";
      rows.push({ ...task.row, policy: task.policy, side, terminated: state.terminated, truncated: state.truncated,
        seconds: state.clock, winner: state.winner, score: state.winner === side ? 1 : state.winner === null ? 0.5 : 0,
        dealt: result[side].damage, taken: result[other].damage, hits: result[side].hits });
    } finally { env.close(); }
  }
  return rows;
}

if (!isMainThread) {
  Logger.LogLevels = Logger.ErrorLogLevel;
  parentPort.on("message", async (task) => {
    try { parentPort.postMessage({ id: task.id, rows: await runPair(task, workerData.deadline) }); }
    catch (error) { parentPort.postMessage({ id: task.id, error: String(error?.stack ?? error) }); }
  });
} else {
  mkdirSync(directory, { recursive: true });
  const declarationPath = join(directory, "declaration.json"), pairsPath = join(directory, "pairs.json");
  const command = process.argv[2];
  if (command === "declare") await declare();
  else if (command === "evaluate") await evaluate();
  else if (command === "summarize") summarize();
  else throw new Error("expected declare, evaluate or summarize");

  async function declare() {
    const { POLICIES } = await import("../src/mind.ts");
    const { namedBuild } = await import("../src/golem/roster.ts");
    const { assessPolicy } = await import("../src/policy-applicability.ts");
    const published = read(join(ROOT, "src/golem/researched-lab.json"));
    const admitted = read(join(ROOT, "research/lab/results/wave4.json")).admission.policies;
    const candidates = CANDIDATES.map((c) => {
      const spec = published.find((entry) => entry.name === c.name)?.spec;
      if (!spec) throw new Error(`${c.name} is not published`);
      const hash = admitted.find((a) => a.name === c.name)?.policyHash;
      if (hash && hash !== digest(spec)) throw new Error(`${c.name} differs from its admitted version`);
      return { ...c, spec, policyHash: digest(spec) };
    });
    const controlSeeds = Object.fromEntries(HUMAN.map((b) => [b, Math.max(...candidates.filter((c) => c.builds.includes(b)).map((c) => c.seeds))]));
    const tasks = [];
    const add = (policy, build, seeds) => {
      for (const opponentBuild of HUMAN) for (let i = 0; i < seeds; i++) {
        const row = fixture(build, opponentBuild, i);
        // Ordered by the fraction of its own cell done, so a deadline leaves every comparison balanced.
        tasks.push({ id: key(policy, row), policy, row, order: i / seeds });
      }
    };
    for (const c of candidates) for (const b of c.builds) add(c.name, b, c.seeds);
    for (const name of CONTROLS) for (const b of HUMAN) add(name, b, controlSeeds[b]);
    tasks.sort((a, b) => a.order - b.order || (digest(a.id) < digest(b.id) ? -1 : 1));
    const picker = Object.fromEntries([...candidates.map((c) => c.name), ...CONTROLS].map((name) => [name,
      Object.fromEntries(HUMAN.map((b) => [b, assessPolicy(POLICIES.find((p) => p.name === name), true, namedBuild(b).setup).status]))]));
    const declaration = {
      question: "Do the four researched golem policies beat the human baseline when they are put in human bodies?",
      opponent: OPPONENT, humanBuilds: HUMAN, candidates, controls: CONTROLS, controlSeeds, tasks,
      bouts: tasks.length * 2, pickerAtDeclaration: picker,
      rule: [
        "Primary: each candidate against humanoid-duelist on the same fixtures, both sides, paired by seed.",
        "A candidate transfers only with >=128 bouts, a mean gain >= +10 points and a strictly positive lower 95% paired bootstrap bound (wave4 compare()).",
        "Otherwise it stays golem-only in the picker. A transfer licenses a review of lifting the gate on the builds measured, not the lift itself.",
        "Secondary, descriptive only: each candidate against golem-duelist in human bodies, and golem-duelist against humanoid-duelist.",
        "A pair containing a truncated bout is excluded from every comparison using its fixture, and counted.",
        "Stop at the ledger's 45 minutes; the analysis uses every matched complete pair. No outcome-dependent stopping or reselection.",
      ],
      authorization: AUTHORIZATION, fingerprint: fingerprint().hash, labFingerprint: labFingerprint(),
      source: readFileSync(import.meta.filename, "utf8"),
    };
    if (existsSync(declarationPath)) {
      if (stable(read(declarationPath)) !== stable(declaration)) throw new Error("declaration changed");
    } else {
      if (existsSync(pairsPath)) throw new Error("outcomes exist without a declaration");
      atomicJson(declarationPath, declaration);
    }
    console.log(JSON.stringify({ declared: declaration.bouts, tasks: tasks.length, controlSeeds, picker }));
  }

  async function evaluate() {
    const declaration = read(declarationPath);
    if (declaration.source !== readFileSync(import.meta.filename, "utf8")) throw new Error("script changed since declaration");
    if (declaration.fingerprint !== fingerprint().hash || declaration.labFingerprint !== labFingerprint()) throw new Error("source changed since declaration");
    const unlock = lockRun(budgetDirectory), budgetPath = join(budgetDirectory, "budget.json");
    const budget = existsSync(budgetPath) ? read(budgetPath) : { authorization: AUTHORIZATION, usedMs: 0, runs: [] };
    if (stable(budget.authorization) !== stable(AUTHORIZATION)) { unlock(); throw new Error("wrong authorization"); }
    const specs = Object.fromEntries([...declaration.candidates.map((c) => [c.name, c.spec]),
      ...CONTROLS.map((name) => [name, { kind: "baseline", name }])]);
    const started = Date.now();
    const deadline = started + Math.max(0, Math.min(AUTHORIZATION.maxJobMs, AUTHORIZATION.maxMs - budget.usedMs));
    const checkpoint = () => atomicJson(budgetPath, { ...budget, usedMs: budget.usedMs + Date.now() - started,
      active: { stage: "evaluate", pid: process.pid, startedAt: new Date(started).toISOString() } });
    const timer = setInterval(checkpoint, 1000), workers = [];
    let status = "failed";
    try {
      const completed = existsSync(pairsPath) ? read(pairsPath) : {};
      const pending = declaration.tasks.filter((t) => !completed[t.id]);
      let cursor = 0, finishedBouts = 0, stopped = false;
      await Promise.all(Array.from({ length: Math.min(WORKERS, pending.length) }, () => new Promise((resolve, reject) => {
        const worker = new Worker(new URL(import.meta.url), { workerData: { deadline } });
        workers.push(worker);
        let done = false;
        const next = () => {
          if (stopped || cursor >= pending.length || Date.now() >= deadline) { done = true; resolve(); return; }
          const task = pending[cursor++];
          worker.postMessage({ ...task, spec: specs[task.policy] });
        };
        worker.on("error", reject);
        worker.on("exit", (code) => { if (!done) reject(new Error(`worker exited ${code}`)); });
        worker.on("message", (message) => {
          if (message.error) { stopped = true; reject(new Error(`${message.id}: ${message.error}`)); return; }
          if (message.rows === null) { stopped = true; done = true; resolve(); return; }
          completed[message.id] = message.rows;
          atomicJson(pairsPath, completed);
          finishedBouts += 2;
          if (finishedBouts % 64 === 0) {
            const elapsed = (Date.now() - started) / 1000, total = Object.keys(completed).length * 2;
            console.log(JSON.stringify({ bouts: total, of: declaration.bouts, elapsedSeconds: Math.round(elapsed),
              boutsPerMinute: +(finishedBouts / elapsed * 60).toFixed(1),
              etaMinutes: +((declaration.bouts - total) / (finishedBouts / elapsed) / 60).toFixed(1) }));
          }
          next();
        });
        next();
      })));
      if (fingerprint().hash !== declaration.fingerprint) throw new Error("source changed during evaluation");
      status = Object.keys(completed).length === declaration.tasks.length ? "complete" : "deadline";
      summarize();
    } finally {
      await Promise.all(workers.map((worker) => worker.terminate()));
      clearInterval(timer);
      budget.usedMs += Date.now() - started;
      delete budget.active;
      budget.runs.push({ stage: "evaluate", status, elapsedMs: Date.now() - started, startedAt: new Date(started).toISOString() });
      atomicJson(budgetPath, budget);
      unlock();
    }
  }

  function summarize() {
    const declaration = read(declarationPath), completed = existsSync(pairsPath) ? read(pairsPath) : {};
    const pairs = new Map(Object.entries(completed));
    const truncated = new Set(declaration.tasks.filter((t) => pairs.get(t.id)?.some((r) => r.truncated || !r.terminated))
      .map((t) => fixtureKey(t.row)));
    const usable = (policy) => declaration.tasks.filter((t) => t.policy === policy && pairs.has(t.id) && !truncated.has(fixtureKey(t.row)));
    const matched = (a, b) => {
      const other = new Set(usable(b).map((t) => fixtureKey(t.row)));
      const shared = usable(a).filter((t) => other.has(fixtureKey(t.row)));
      const rows = (policy) => shared.flatMap((t) => pairs.get(key(policy, t.row)));
      if (!shared.length) return null;
      const comparison = compare(rows(a), rows(b));
      const byBuild = Object.fromEntries([...new Set(shared.map((t) => t.row.build))].map((build) => {
        const score = (policy) => { const r = rows(policy).filter((x) => x.build === build); return r.reduce((s, x) => s + x.score, 0) / r.length; };
        return [build, { bouts: rows(a).filter((x) => x.build === build).length, candidate: score(a), control: score(b) }];
      }));
      return { candidate: a, control: b, ...comparison, byBuild };
    };
    const primary = declaration.candidates.map((c) => matched(c.name, "humanoid-duelist"));
    const secondary = [...declaration.candidates.map((c) => matched(c.name, "golem-duelist")), matched("golem-duelist", "humanoid-duelist")];
    const all = [...pairs.values()].flat();
    const sideBias = all.length ? all.filter((r) => r.winner === "left").length / all.length : null;
    const summary = { complete: pairs.size === declaration.tasks.length, bouts: pairs.size * 2, declaredBouts: declaration.bouts,
      truncatedFixtures: truncated.size, meanSeconds: all.reduce((s, r) => s + r.seconds, 0) / Math.max(1, all.length),
      leftWinFraction: sideBias, drawFraction: all.filter((r) => r.winner === null).length / Math.max(1, all.length),
      primary, secondary, transfers: primary.filter((p) => p?.eligible).map((p) => p.candidate) };
    atomicJson(join(directory, "summary.json"), summary);
    console.log(JSON.stringify({ ...summary, primary: primary.map(brief), secondary: secondary.map(brief) }, null, 1));
  }
}

function brief(c) {
  if (!c) return null;
  const pct = (x) => +(x * 100).toFixed(1);
  return { candidate: c.candidate, control: c.control, bouts: c.boutsPerPolicy, candidateScore: pct(c.candidateScore),
    controlScore: pct(c.controlScore), gain: pct(c.interval.mean), low: pct(c.interval.low), high: pct(c.interval.high), eligible: c.eligible };
}
