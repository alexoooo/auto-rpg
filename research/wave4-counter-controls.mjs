/** Independent opponents for the already-frozen counters; never reselect from this evidence. */
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { ROOT } from "./fingerprint.mjs";
import { atomicJson, lockRun } from "./runner.mjs";
import { digest, stable } from "./schedule.mjs";
import { createEnvironment } from "./lab/environment.mjs";
import { labFingerprint } from "./lab/experiments.mjs";
import { AUTHORIZATION, BASE, TARGETS, compare, remainingAllowance } from "./lab/wave4-protocol.mjs";

const primary = join(ROOT, "research/runs/wave4-2026-09-22-r2");
const directory = join(ROOT, "research/runs/wave4-counter-controls");
const read = path => JSON.parse(readFileSync(path, "utf8"));
const protocol = read(join(primary, "protocol.json"));
if (protocol.fingerprint !== labFingerprint()) throw new Error("campaign source changed");
const finalists = TARGETS.map(target => {
  const finalist = read(join(primary, `counter-${target}-selection.json`)).finalist;
  return { target, id: finalist.id, policyHash: digest(finalist.spec) };
});
const identity = { fingerprint: protocol.fingerprint, cells: protocol.fixtures.robustness, finalists,
  policy: BASE, source: readFileSync(import.meta.filename, "utf8"),
  purpose: "Matched broad control on training-held-out opponents; retain whole predeclared pool, never rescue a failed target gate with a subgroup." };
mkdirSync(directory, { recursive: true });
const manifest = join(directory, "manifest.json");
if (existsSync(manifest)) {
  if (stable(read(manifest)) !== stable(identity)) throw new Error("counter control declaration changed");
} else {
  if (TARGETS.some(target => existsSync(join(primary, `evaluation-counter-${target}-robustness.json`)))) {
    throw new Error("declare independent controls before observing robustness outcomes");
  }
  atomicJson(manifest, identity);
}

async function evaluate() {
  const budgetDirectory = join(ROOT, "research/runs/wave4-budget");
  const unlock = lockRun(budgetDirectory), budgetPath = join(budgetDirectory, "budget.json");
  const budget = read(budgetPath), started = Date.now();
  if (stable(budget.authorization) !== stable(AUTHORIZATION)) { unlock(); throw new Error("wrong authorization"); }
  const deadline = started + remainingAllowance(budget.usedMs, 1800000);
  const checkpoint = () => atomicJson(budgetPath, { ...budget, usedMs: budget.usedMs + Date.now() - started,
    active: { stage: "counter-generalization-control", pid: process.pid, startedAt: new Date(started).toISOString() } });
  const timer = setInterval(checkpoint, 1000);
  let status = "failed";
  try {
    Logger.LogLevels = Logger.ErrorLogLevel;
    const path = join(directory, "evaluation.json");
    const previous = existsSync(path) ? read(path) : { policy: BASE, cells: identity.cells, rows: [] };
    if (stable(previous.policy) !== stable(BASE) || stable(previous.cells) !== stable(identity.cells)) throw new Error("saved controls changed");
    const rows = previous.rows;
    for (const cell of identity.cells) {
      const old = rows.filter(row => row.seed === cell.seed);
      if (old.length) {
        if (old.length !== 2 || new Set(old.map(row => row.side)).size !== 2) throw new Error("incomplete control pair");
        continue;
      }
      const pair = [];
      for (const side of ["left", "right"]) {
        if (Date.now() >= deadline) throw new Error("counter control deadline");
        const env = await createEnvironment({ seed: side === "left" ? cell.seed : cell.seed ^ 0x123456,
          leftBuild: side === "left" ? cell.build : cell.opponentBuild,
          rightBuild: side === "right" ? cell.build : cell.opponentBuild,
          left: side === "left" ? BASE : cell.opponentSpec, right: side === "right" ? BASE : cell.opponentSpec });
        try {
          let state = env.state();
          while (!state.terminated && !state.truncated && Date.now() < deadline) state = env.step();
          if (!state.terminated && !state.truncated) throw new Error("deadline; incomplete bout excluded");
          pair.push({ ...cell, side, terminated: state.terminated, truncated: state.truncated,
            seconds: state.clock, winner: state.winner, score: state.winner === side ? 1 : state.winner === null ? 0.5 : 0 });
        } finally { env.close(); }
      }
      rows.push(...pair);
      atomicJson(path, { ...previous, rows, complete: rows.length === identity.cells.length * 2 });
      if (rows.length % 16 === 0) console.log(JSON.stringify({ controlBouts: rows.length }));
    }
    const results = finalists.map(finalist => {
      const candidate = read(join(primary, `evaluation-counter-${finalist.target}-robustness.json`));
      if (!candidate.complete || digest(candidate.spec) !== finalist.policyHash) throw new Error("frozen counter evaluation incomplete or changed");
      return { ...finalist, comparison: compare(candidate.rows, rows) };
    });
    atomicJson(join(directory, "summary.json"), { results, complete: true,
      note: "Separate whole-pool generalization evidence. A target-specific gain is not automatically independent-opponent superiority." });
    console.log(JSON.stringify(results));
    status = "complete";
  } finally {
    clearInterval(timer);
    budget.usedMs += Date.now() - started;
    delete budget.active;
    budget.runs.push({ stage: "counter-generalization-control", status, elapsedMs: Date.now() - started, startedAt: new Date(started).toISOString() });
    atomicJson(budgetPath, budget); unlock();
  }
}
if (process.argv[2] === "evaluate") await evaluate();
else if (process.argv[2] !== "declare") throw new Error("expected declare or evaluate");
