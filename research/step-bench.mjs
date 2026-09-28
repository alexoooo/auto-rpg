// The step target's bench (skill ceiling session 06, the command surface): one body handed a
// ground point and a time, read for when it got there, how far past it went, where it stopped and
// whether it stayed up, against the same body driven at the point by keys.
//
// The authority rule of `docs/plans/2026-09-25-skill-ceiling-06-commander-and-command-surface.md` (in git at c76ce6bc):
// the channel names its actuator (`gaitChannels` in `src/body-command.ts`: the carrier, through
// `stepTravel` in `src/step-target.ts`) and this measures what that actuator does with the command.
//
//   node research/step-bench.mjs [--builds default,skeleton-warrior,wheel,multileg] [--out research/runs/step-bench]
//
// `keys` is what an `Intent` mind can do without the channel: full travel along the unit vector at
// the point in the body's frame, released inside 50 mm. It is the plausible planner the ellipse
// trap in AGENTS.md is about, and it has no clock.
//
// Harness: the Node locomotion bench (a headless supported pair, the right body idle 12 m away,
// stepped at the shipped physics rate by `_advancePhysicsEngineStep`). Not comparable with page
// readings.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { freshBodyCommand, setChannelFlags } from "../src/body-command.ts";
import { auditBuild } from "./headroom-builds.mjs";
import { pair } from "./stance-bench.mjs";

/** A command mind stepping to `target` (world) within `within` s, or driving at it by keys. */
export function stepMind(target, within, mode) {
  const out = freshBodyCommand();
  return {
    name: `step-probe-${mode}`,
    command(view) {
      if (mode === "step") {
        out.gait.step = { x: target.x, z: target.z, within };
        return out;
      }
      const g = view.self.ground, yaw = view.self.facing;
      const dx = target.x - g.x, dz = target.z - g.z, d = Math.hypot(dx, dz);
      const ahead = dx * Math.sin(yaw) + dz * Math.cos(yaw), right = dx * Math.cos(yaw) - dz * Math.sin(yaw);
      out.gait.forward = d > 0.05 ? ahead / d : 0;
      out.gait.strafe = d > 0.05 ? right / d : 0;
      return out;
    },
  };
}

/** One cell: settle, then hand the body the point; read for `seconds`. */
export async function stepCell(setup, { distance, bearing, within, mode, settle = 1, seconds = 3 }) {
  const target = { x: distance * Math.sin(bearing), z: distance * Math.cos(bearing) };
  const mind = stepMind(target, within, "keys");
  let live = false;
  const probe = { name: "step-probe", command: (view, dt, orders) => (live ? mind.command(view, dt, orders) : freshBodyCommand()) };
  const world = await pair(setup, probe);
  try {
    const { golem, port } = world;
    let clock = 0, arrivedAt = null, overshoot = 0, down = 0, slipSum = 0, slipSteps = 0, peak = 0;
    world.onSample(() => {
      if (!live) return;
      clock += 1;
      if (port.state !== "supported") down += 1;
      const g = port.carrierGround();
      const s = port.carrier.state;
      peak = Math.max(peak, Math.hypot(s.velocityX, s.velocityZ));
      const left = Math.hypot(target.x - g.x, target.z - g.z);
      if (arrivedAt === null && left < 0.03) arrivedAt = clock;
      overshoot = Math.max(overshoot, (g.x * target.x + g.z * target.z) / distance - distance);
      const evidence = golem.locomotionEvidence();
      if (evidence.plantedFeet > 0) { slipSum += evidence.footSlipMps; slipSteps += 1; }
    });
    world.run(settle);
    Object.assign(mind, stepMind(target, within, mode));
    live = true;
    world.run(seconds);
    const g = port.carrierGround();
    const hz = clock / seconds;
    return { distance, bearing, within, mode, arrivedS: arrivedAt === null ? null : arrivedAt / hz,
      overshootM: overshoot, missM: Math.hypot(target.x - g.x, target.z - g.z), peakMps: peak,
      meanSlipMps: slipSteps ? slipSum / slipSteps : NaN, downSteps: down };
  } finally {
    world.dispose();
  }
}

/** The cells: two distances, four bearings (ahead, right, behind, the front-left diagonal), two times. */
export const STEP_CELLS = Object.freeze([0.6, 1.5].flatMap((distance) =>
  [0, Math.PI / 2, Math.PI, -Math.PI / 4].flatMap((bearing) =>
    [0.5, 1.0].map((within) => ({ distance, bearing, within })))));

async function main() {
  const { values } = parseArgs({ options: {
    builds: { type: "string", default: "default,skeleton-warrior,wheel,multileg" },
    out: { type: "string", default: "research/runs/step-bench" },
  } });
  setChannelFlags({ step: true });
  mkdirSync(values.out, { recursive: true });
  const rows = [];
  console.log("Node locomotion bench: settle 1 s, then 3 s with the point; carrier ground read each substep");
  console.log("build              dist  bear  within mode | arrived s | overshoot mm | miss mm | peak m/s | slip mm/s | down");
  const n = (x, d = 3) => (x === null ? "never" : Number.isFinite(x) ? x.toFixed(d) : "  -  ");
  for (const name of values.builds.split(",")) {
    const setup = auditBuild(name)?.setup;
    if (!setup) throw new Error(`no build "${name}"`);
    for (const cell of STEP_CELLS) {
      for (const mode of ["step", "keys"]) {
        const row = await stepCell(setup, { ...cell, mode });
        rows.push({ build: name, ...row });
        console.log(`${name.padEnd(18)} ${n(cell.distance, 1)} ${n(cell.bearing, 2).padStart(5)} ${n(cell.within, 1).padStart(5)} ${mode.padEnd(4)} | `
          + `${n(row.arrivedS, 2).padStart(9)} | ${n(row.overshootM * 1000, 0).padStart(12)} | ${n(row.missM * 1000, 0).padStart(7)} | `
          + `${n(row.peakMps, 2).padStart(8)} | ${n(row.meanSlipMps * 1000, 0).padStart(9)} | ${row.downSteps}`);
      }
    }
  }
  writeFileSync(join(values.out, "step-bench.json"), JSON.stringify(rows, null, 1));
}

if (process.argv[1] && process.argv[1].endsWith("step-bench.mjs")) await main();
