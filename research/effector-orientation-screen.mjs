/**
 * A bounded follow-up to effector-impact-screen: vary only the blade's hand tilt, roll and
 * terminal sweep bearing at the strongest sampled timing/height/reach. Every cell starts from
 * the same physical warmup. It is a mechanism screen, not expert headroom.
 *
 * node research/effector-orientation-screen.mjs
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { impactScreenCell, impactScreenPlans } from "./effector-impact-screen.mjs";

export const ORIENTATION_SCREEN_HARNESS =
  "Node/Havok bout runner, equal human blades, seed pair 11/22, left subject, 0.75 s normal warmup then 1 s forced legal plan";

export function orientationScreenPlans() {
  const base = impactScreenPlans().find(plan => plan.label === "sweep/t0.3/y-0.35/r0.95");
  if (!base) throw new Error("missing measured blade baseline");
  const plans = [base];
  for (const tilt of [-1.2, -.6, 0, .6]) for (const roll of [-1, 0, 1]) {
    for (const sweepTo of [-.5, 0, .8]) {
      if (tilt === -.6 && roll === 0 && sweepTo === 0) continue;
      const seg = { ...base.segs[0], tilt, roll, sweepTo };
      plans.push({ ...base, label: `tilt${tilt}/roll${roll}/to${sweepTo}`, segs: [seg] });
    }
  }
  return plans;
}

export async function orientationScreen() {
  Logger.LogLevels = Logger.ErrorLogLevel;
  const rows = [], plans = orientationScreenPlans();
  let warmPose;
  for (const plan of plans) {
    const row = await impactScreenCell({ terminal: "blade", plan });
    warmPose ??= row.start.pose;
    if (row.start.pose !== warmPose) throw new Error("orientation cells did not receive the same warmed state");
    if (!row.targetHands.includes("primary")) throw new Error(`target was not commanded: ${plan.label}`);
    rows.push(row);
  }
  return { date: "2026-09-27", harness: ORIENTATION_SCREEN_HARNESS, axes: {
    tilt: [-1.2, -.6, 0, .6], roll: [-1, 0, 1], sweepTo: [-.5, 0, .8],
    fixed: { duration: .3, lift: -.35, extend: .95 },
  }, rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  orientationScreen().then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
