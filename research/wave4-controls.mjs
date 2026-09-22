/** Additional matched-data controls, declared before student selection/confirmation. */
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { ROOT } from "./fingerprint.mjs";
import { atomicJson, lockRun } from "./runner.mjs";
import { guardOwnedChild, terminateOwnedChild } from "./owned-child.mjs";
import { digest, stable } from "./schedule.mjs";
import { createEnvironment } from "./lab/environment.mjs";
import { AUTHORIZATION, remainingAllowance, fixtures, compare, BASE } from "./lab/wave4-protocol.mjs";
import { infer, validateNetwork } from "../src/golem/lab-policy.ts";
import { labFingerprint } from "./lab/experiments.mjs";
import { Logger } from "@babylonjs/core/Misc/logger.js";

const dir = join(ROOT, "research/runs/wave4-matched-controls"), primary = join(ROOT, "research/runs/wave4-2026-09-22-r2");
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const budgetDir = join(ROOT, "research/runs/wave4-budget");
mkdirSync(dir, { recursive: true });
const unlock = lockRun(budgetDir), budgetPath = join(budgetDir, "budget.json"), budget = read(budgetPath);
if (stable(budget.authorization) !== stable(AUTHORIZATION)) { unlock(); throw new Error("wrong authorization"); }
const started = Date.now(), deadline = started + remainingAllowance(budget.usedMs, 1800000);
const stage = process.argv[2] ?? "selection";
const checkpoint = () => atomicJson(budgetPath, { ...budget, usedMs: budget.usedMs + Date.now() - started,
  active: { stage: `matched-controls-${stage}`, pid: process.pid } });
const timer = setInterval(checkpoint, 1000);
let status = "failed";
try {
  if (deadline <= Date.now()) throw new Error("campaign budget exhausted");
  if (!["selection", "confirmation"].includes(stage)) throw new Error("invalid control stage");
  if (read(join(primary, "protocol.json")).fingerprint !== labFingerprint()) throw new Error("source changed");
  Logger.LogLevels = Logger.ErrorLogLevel;
  const identity = { fingerprint: labFingerprint(), source: readFileSync(import.meta.filename, "utf8"),
    fitSource: readFileSync(join(ROOT, "research/wave4-controls.py"), "utf8") };
  const manifest = join(dir, "manifest.json");
  if (existsSync(manifest) && stable(read(manifest)) !== stable(identity)) throw new Error("control protocol changed");
  atomicJson(manifest, identity);
  if (!existsSync(join(dir, "provenance.json"))) {
    const child = guardOwnedChild(spawn(join(ROOT, ".tools/ai-lab-venv/Scripts/python.exe"), [join(ROOT, "research/wave4-controls.py")],
      { cwd: ROOT, stdio: "inherit", windowsHide: true }));
    const watchdog = setTimeout(() => terminateOwnedChild(child), Math.min(60000, deadline - Date.now()));
    try { await new Promise((done, reject) => { child.once("error", reject); child.once("exit", (code) => code === 0 ? done() : reject(new Error("control fitting failed"))); }); }
    finally { clearTimeout(watchdog); terminateOwnedChild(child); }
  }
  const parity = read(join(dir, "parity.json"));
  const summaries = [];
  for (const name of ["constant", "clock"]) {
    const model = read(join(dir, `${name}.json`)); validateNetwork(model);
    const error = Math.max(...parity.observations.flatMap((obs, i) => infer(model, obs).map((x, j) => Math.abs(x - parity.predictions[name][i][j]))));
    if (error > 1e-5) throw new Error("control export parity failed");
    const cells = fixtures(stage === "selection" ? "studentSelection" : "studentConfirmation", stage === "selection" ? 2 : 8);
    const file = join(dir, `${name}-${stage}.json`), spec = { kind: "network", model };
    const rows = existsSync(file) ? read(file).rows : [];
    for (const cell of cells) {
      const previous = rows.filter((r) => r.seed === cell.seed);
      if (previous.length) { if (previous.length !== 2 || new Set(previous.map((r) => r.side)).size !== 2) throw new Error("incomplete saved pair"); continue; }
      const pair = [];
      for (const side of ["left", "right"]) {
        if (Date.now() >= deadline) throw new Error("control deadline");
        const env = await createEnvironment({ seed: side === "left" ? cell.seed : cell.seed ^ 0x123456,
          leftBuild: side === "left" ? cell.build : cell.opponentBuild, rightBuild: side === "right" ? cell.build : cell.opponentBuild,
          left: side === "left" ? spec : cell.opponentSpec, right: side === "right" ? spec : cell.opponentSpec });
        try {
          let state = env.state();
          while (!state.terminated && !state.truncated && Date.now() < deadline) state = env.step();
          if (!state.terminated && !state.truncated) throw new Error("control deadline; unfinished bout excluded");
          pair.push({ ...cell, side, terminated: state.terminated, truncated: state.truncated, seconds: state.clock,
            applicability: "applicable", winner: state.winner, score: state.winner === side ? 1 : state.winner === null ? 0.5 : 0 });
        } finally { env.close(); }
      }
      rows.push(...pair); atomicJson(file, { policyHash: digest(spec), cells, rows, complete: rows.length === cells.length * 2 });
    }
    const studentId = read(join(primary, "student-selection.json")).finalist.id;
    const student = read(join(primary, stage === "selection" ? `evaluation-${studentId}.json` : "evaluation-student-confirmation.json"));
    summaries.push({ name, parityMaxError: error, comparison: compare(student.rows, rows) });
    console.log(JSON.stringify(summaries.at(-1)));
  }
  atomicJson(join(dir, `${stage}-summary.json`), { summaries, complete: true,
    studentBeatsMatchedControls: summaries.every((r) => r.comparison.interval.low > 0) });
  status = "complete";
} finally {
  clearInterval(timer); budget.usedMs += Date.now() - started; delete budget.active;
  budget.runs.push({ stage: `matched-controls-${stage}`, status, elapsedMs: Date.now() - started });
  atomicJson(budgetPath, budget); unlock();
}
