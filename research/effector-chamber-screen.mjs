/**
 * A two-segment blade trajectory: draw the hand outboard, then sweep it through the mark.
 * Every plan is played on the same normally warmed physical body, through legal commands.
 * The first segment ends at the second's starting bearing and reach, so the command is continuous.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { impactScreenCell } from "./effector-impact-screen.mjs";
import { orientationScreenPlans } from "./effector-orientation-screen.mjs";

export const CHAMBER_SCREEN_HARNESS =
  "Node/Havok bout runner, equal human blades, seed pair 11/22, left subject, 0.75 s normal warmup then 1 s forced legal plan";

export function chamberScreenPlans() {
  const best = orientationScreenPlans().find(p => p.label === "tilt0/roll0/to-0.5");
  if (!best) throw new Error("missing measured orientation baseline");
  const plans = [best];
  for (const time of [.15, .3, .45]) for (const reach of [.45, .65]) {
    for (const bearing of [.8, 1.2]) {
      const chamber = { ...best.segs[0], duration: time, retract: reach, extend: reach,
        sweep: bearing, sweepTo: bearing };
      const strike = { ...best.segs[0], duration: .3, retract: reach, extend: .95,
        sweep: bearing, sweepTo: -.5 };
      plans.push({ label: `chamber/t${time}/r${reach}/a${bearing}`,
        segs: [chamber, strike], switchAt: time });
    }
  }
  return plans;
}

/** Rotate both phases together, preserving their shared boundary pose and time. */
export function chamberRotationPlans() {
  const base = chamberScreenPlans().find(p => p.label === "chamber/t0.3/r0.45/a0.8");
  if (!base) throw new Error("missing measured chamber baseline");
  const plans = [base];
  for (const tilt of [-.6, 0, .6]) for (const roll of [-2, -1, 0, 1, 2]) {
    if (tilt === 0 && roll === 0) continue;
    plans.push({ ...base, label: `chamber-rotation/tilt${tilt}/roll${roll}`,
      segs: base.segs.map(seg => ({ ...seg, tilt, roll })) });
  }
  return plans;
}

export async function chamberScreen() {
  Logger.LogLevels = Logger.ErrorLogLevel;
  const rows = [];
  let warmPose;
  for (const plan of chamberScreenPlans()) {
    const row = await impactScreenCell({ terminal: "blade", plan });
    warmPose ??= row.start.pose;
    if (row.start.pose !== warmPose) throw new Error("chamber cells did not receive the same warmed state");
    if (!row.targetHands.includes("primary")) throw new Error(`target was not commanded: ${plan.label}`);
    rows.push(row);
  }
  return { date: "2026-09-27", harness: CHAMBER_SCREEN_HARNESS, axes: {
    time: [.15, .3, .45], reach: [.45, .65], bearing: [.8, 1.2],
    strike: { duration: .3, extend: .95, sweepTo: -.5, tilt: 0, roll: 0, lift: -.35 },
  }, rows };
}

export async function chamberRotationScreen() {
  Logger.LogLevels = Logger.ErrorLogLevel;
  const rows = [];
  let warmPose;
  for (const plan of chamberRotationPlans()) {
    const row = await impactScreenCell({ terminal: "blade", plan });
    warmPose ??= row.start.pose;
    if (row.start.pose !== warmPose) throw new Error("rotation cells did not receive the same warmed state");
    rows.push(row);
  }
  return { date: "2026-09-27", harness: CHAMBER_SCREEN_HARNESS,
    axes: { tilt: [-.6, 0, .6], roll: [-2, -1, 0, 1, 2], fixed: "chamber/t0.3/r0.45/a0.8" }, rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  (process.argv.includes("--rotation") ? chamberRotationScreen() : chamberScreen())
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
