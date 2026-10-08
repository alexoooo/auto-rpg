/**
 * **Man's hands on the punch**: the Warrior's unassisted executor against the compliant pad, the
 * spec's capsule hand against Man's palm and fist hulls (`handsSpec`). Two executions: the closed
 * fist the force battery measures (`PLANTED_PUNCH_EXECUTION`, attack-force's punch cell), and the
 * game's own bare-hand blow, which leaves the hand open and aims its knuckles. Each cell runs both
 * hands, straight and cross, both actuation laws, at 120, 480, 960 and 1920 Hz, over six target
 * placements, since one placement is one sample. Record: docs/reference/man-punch.md.
 *
 *   node research/man-punch.mjs [docs/reference/man-punch.json.gz] [--workers N]
 */
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { parseArgs } from "node:util";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { punchCalibration } from "./punch-calibration.mjs";
import { forceSummary } from "./attack-force.mjs";
import { combatFingerprint } from "./arena-combat.mjs";
import { HAND_GEOMETRIES } from "./man-hands.mjs";
import { PLANTED_PUNCH_EXECUTION } from "../src/core/skills/combat.ts";

export const MAN_PUNCH = Object.freeze({
  executions: Object.freeze(["fist", "open"]),
  rates: Object.freeze([120, 480, 960, 1920]),
  placements: Object.freeze([.55, .6, .65].flatMap((ahead) => [1.55, 1.63].map((height) => Object.freeze({ ahead, height })))),
  seconds: 8,
});

const executionOf = (name) => {
  switch (name) {
    case "fist": return PLANTED_PUNCH_EXECUTION;
    case "open": return undefined;
    default: throw new Error(`no execution ${name}`);
  }
};

/** One cell, read down to what the comparison needs; the full waveforms stay out of the record. */
export async function manPunchCell(job) {
  const result = await punchCalibration({
    hand: job.hand, family: job.family, hz: job.hz, actuation: job.actuation, hands: job.hands,
    ahead: job.ahead, height: job.height, seconds: MAN_PUNCH.seconds, armExtension: .5,
    execution: executionOf(job.execution), matchedFeedback: true, paths: { elbowExtension: .5 }, pad: { face: "compliant" },
  });
  const summary = forceSummary(result, "punch");
  const clean = result.impacts.filter((e) => e.eligible && !e.preImpact.down).slice(0, 3);
  return {
    ...job, harness: result.harness, accepted: summary.accepted, faults: summary.faults, fell: result.fell,
    returned: summary.returned, failedCycles: result.cycles.failed,
    impacts: result.impacts.length, eligible: result.impacts.filter((e) => e.eligible).length,
    trials: clean.map((e, i) => ({
      impulse: e.impulse, speed: e.last10cmSpeed, effectiveMass: e.effectiveMass, freeJointMass: e.freeJointMass,
      duration: e.duration, steps: e.positiveSteps, force120: summary.trials[i]?.force120 ?? null, peak2ms: summary.trials[i]?.peak2ms ?? null,
      pose: e.preImpact.pose, offset: e.contactGeometry.offset, rest: e.contactGeometry.rest,
    })),
  };
}

export function manPunchJobs() {
  const jobs = [];
  for (const hands of HAND_GEOMETRIES) for (const execution of MAN_PUNCH.executions)
    for (const actuation of ["symmetric", "directional"]) for (const family of ["straight", "cross"])
      for (const hand of ["left", "right"]) for (const hz of MAN_PUNCH.rates) for (const { ahead, height } of MAN_PUNCH.placements)
        jobs.push({ hands, execution, actuation, family, hand, hz, ahead, height });
  // The dearest first, so the pool drains evenly.
  return jobs.map((job, id) => ({ ...job, id })).sort((a, b) => b.hz - a.hz || a.id - b.id);
}

export async function manPunch({ workers = 24 } = {}) {
  const fingerprint = combatFingerprint(), jobs = manPunchJobs(), rows = [];
  const pool = Array.from({ length: workers }, () => new Worker(new URL(import.meta.url), { workerData: { entry: import.meta.url } }));
  let index = 0;
  try {
    await Promise.all(pool.map((worker) => new Promise((resolve, reject) => {
      worker.on("error", reject);
      worker.on("exit", (code) => { if (code !== 0) reject(new Error(`punch worker exited ${code}`)); });
      const next = () => {
        if (index === jobs.length) return resolve();
        const job = jobs[index++];
        worker.once("message", (row) => {
          if (row.error) return reject(new Error(row.error));
          rows.push(row);
          process.stderr.write(`${rows.length}/${jobs.length} ${row.hands}/${row.execution}/${row.actuation}/${row.family}/${row.hand}/${row.hz}/${row.ahead}/${row.height}: ${row.accepted ? "ok" : row.faults.join("|")}\n`);
          next();
        });
        worker.postMessage(job);
      };
      next();
    })));
  } finally { await Promise.all(pool.map((w) => w.terminate())); }
  if (combatFingerprint() !== fingerprint) throw new Error("source changed during the punch battery");
  rows.sort((a, b) => a.id - b.id);
  return { version: 1, fingerprint, protocol: MAN_PUNCH, rows };
}

if (!isMainThread && workerData?.entry === import.meta.url) parentPort.on("message", async (job) => {
  try { parentPort.postMessage(await manPunchCell(job)); } catch (e) { parentPort.postMessage({ error: e.stack }); }
});
else if (isMainThread && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { workers: { type: "string", default: "24" } } });
  const record = await manPunch({ workers: Number(values.workers) });
  writeFileSync(positionals[0] ?? "docs/reference/man-punch.json.gz", gzipSync(JSON.stringify(record)));
  console.log(`${record.rows.length} cells, ${record.rows.filter((r) => r.accepted).length} accepted`);
}
