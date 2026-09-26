// The stance channel's bench (skill ceiling session 06, the command surface): one body commanded a
// stance through a command mind, standing and then walking, and read for where its feet went, how
// high its hips sit, and how hard it is to push over in each direction.
//
// The authority rule of `docs/plans/2026-09-25-skill-ceiling-06-commander-and-command-surface.md`:
// the channel names its actuator (`gaitChannels` in `src/body-command.ts`: the hip abduction and
// flexion, knee and ankle servos) and this measures what that actuator does with the command.
//
//   node research/stance-bench.mjs [--builds default,skeleton-warrior] [--out research/runs/stance-bench]
//
// Harness: the Node locomotion bench (a headless supported pair, the right body idle 12 m away,
// stepped at the shipped physics rate by `_advancePhysicsEngineStep`). Not comparable with page
// readings.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CONFIG } from "../src/config.ts";
import { stepPair } from "../src/fighter.ts";
import { Golem } from "../src/golem/golem.ts";
import { idleMind } from "../src/mind.ts";
import { flatSupportedWorldRegistry } from "../src/supported-locomotion-production.ts";
import { freshBodyCommand, setChannelFlags } from "../src/body-command.ts";
import { createHeadlessArena } from "../tests/harness/golem-headless-arena.mjs";
import { auditBuild } from "./headroom-builds.mjs";

Logger.LogLevels = Logger.NoneLogLevel;
const FIXED = 1 / CONFIG.world.physicsHz;

/** A command mind holding one stance and one forward speed; nothing else moves. */
export function stanceMind(stance, forward = 0) {
  const out = freshBodyCommand();
  out.gait.stance.width = stance.width; out.gait.stance.lead = stance.lead; out.gait.stance.weight = stance.weight;
  out.gait.forward = forward;
  return { name: "stance-probe", command: () => out, set(next) { Object.assign(out.gait.stance, next); } };
}

/** A supported pair on the flat, the left body driven by `mind`, as `research/leverage.mjs` builds it; `research/step-bench.mjs` uses it too. */
export async function pair(setup, mind) {
  const arena = await createHeadlessArena();
  const { scene } = arena;
  const world = flatSupportedWorldRegistry();
  const bodies = [
    new Golem(scene, { side: "left", origin: new Vector3(0, 0, 0), facing: 0, setup, mind, controlPolicies: [], locomotionWorld: world }),
    new Golem(scene, { side: "right", origin: new Vector3(0, 0, 12), facing: Math.PI, setup: auditBuild("default").setup,
      mind: idleMind(), controlPolicies: [], locomotionWorld: world }),
  ];
  let clock = 0;
  const samplers = [];
  const control = scene.onBeforePhysicsObservable.add(() => { stepPair(...bodies, FIXED, clock); clock += FIXED; });
  const after = scene.onAfterPhysicsObservable.add(() => { for (const f of samplers) f(clock); });
  return {
    golem: bodies[0], port: bodies[0].locomotion, onSample: (f) => samplers.push(f),
    run(seconds) { const end = clock + seconds; while (clock < end) { scene._renderId += 1; scene._advancePhysicsEngineStep(1000 / 60); } },
    dispose() {
      scene.onBeforePhysicsObservable.remove(control);
      scene.onAfterPhysicsObservable.remove(after);
      for (const g of bodies) g.dispose();
      arena.dispose();
    },
  };
}

/** A limb's mesh by a key fragment, from the golem's own limb list. */
export const limb = (golem, fragment) => golem.limbs.find((l) => l.key.includes(fragment))?.part.mesh ?? null;

/** A world point in the body's frame (x its right, z ahead), about the pelvis. */
function local(point, origin, yaw) {
  const dx = point.x - origin.x, dz = point.z - origin.z;
  return { x: dx * Math.cos(yaw) - dz * Math.sin(yaw), z: dx * Math.sin(yaw) + dz * Math.cos(yaw) };
}

/** The fall impulse along the body's ahead, behind, left and right, and the weakest of all, N s. */
function fallImpulses(port) {
  const yaw = port.carrier.state.yaw;
  const mass = port.supportedMassKg;
  const along = (a) => {
    const line = port.stabilityLinesAlong(Math.sin(yaw + a), Math.cos(yaw + a)).fallAtMps;
    return Number.isFinite(line) ? line * mass : NaN;
  };
  return { ahead: along(0), right: along(Math.PI / 2), behind: along(Math.PI), left: along(-Math.PI / 2),
    weakest: port.fallImpulseNs() };
}

/** One cell: stand `settle` s under a stance, read; then walk `walk` s at 0.35 and `walk` s at full forward. */
export async function stanceCell(setup, stance, { settle = 1.5, walk = 1.5 } = {}) {
  const mind = stanceMind(stance, 0);
  const world = await pair(setup, mind);
  try {
    const { golem, port } = world;
    let down = 0, steps = 0, walking = false, slipSum = 0, slipSteps = 0, flight = 0;
    world.onSample(() => {
      steps += 1;
      if (port.state !== "supported") down += 1;
      if (!walking) return;
      const evidence = golem.locomotionEvidence();
      if (evidence.plantedFeet > 0) { slipSum += evidence.footSlipMps; slipSteps += 1; } else flight += 1;
    });
    world.run(settle);
    const pelvis = golem.chaseRoot();
    const yaw = port.carrier.state.yaw;
    const leftFoot = limb(golem, "legs.footL");
    const rightFoot = limb(golem, "legs.footR");
    const feet = leftFoot && rightFoot ? { left: local(leftFoot.position, pelvis.position, yaw), right: local(rightFoot.position, pelvis.position, yaw) } : null;
    const standing = {
      feet,
      width: feet ? feet.right.x - feet.left.x : NaN,
      stagger: feet ? feet.right.z - feet.left.z : NaN,
      under: feet ? -(feet.right.z + feet.left.z) / 2 : NaN,
      heightM: pelvis.position.y,
      fall: fallImpulses(port),
      downSteps: down,
    };
    const walkAt = (forward) => {
      mind.command().gait.forward = forward;
      down = 0; steps = 0; slipSum = 0; slipSteps = 0; flight = 0; walking = true;
      const start = { x: pelvis.position.x, z: pelvis.position.z };
      world.run(walk);
      return {
        forward,
        travelledM: Math.hypot(pelvis.position.x - start.x, pelvis.position.z - start.z),
        meanFootSlipMps: slipSteps ? slipSum / slipSteps : NaN, flightSteps: flight,
        downSteps: down, steps,
      };
    };
    const slow = walkAt(0.35);
    const full = walkAt(1);
    return { stance, standing, slow, full };
  } finally {
    world.dispose();
  }
}

/** The stance cells the bench reads: neutral, each axis at both ends, and one combination. */
export const STANCE_CELLS = Object.freeze([
  { width: 0, lead: 0, weight: 0 },
  { width: 1, lead: 0, weight: 0 }, { width: -1, lead: 0, weight: 0 },
  { width: 0, lead: 1, weight: 0 }, { width: 0, lead: -1, weight: 0 },
  { width: 0, lead: 0, weight: 1 }, { width: 0, lead: 0, weight: -1 },
  { width: 1, lead: 1, weight: 0.5 },
]);

async function main() {
  const { values } = parseArgs({ options: {
    builds: { type: "string", default: "default,skeleton-warrior" },
    out: { type: "string", default: "research/runs/stance-bench" },
  } });
  setChannelFlags({ stance: true });
  mkdirSync(values.out, { recursive: true });
  const rows = [];
  console.log("Node locomotion bench: stance held 1.5 s standing, then 1.5 s at 0.35 forward and 1.5 s at full");
  console.log("build              width  lead weight | feet width stagger under | hip y  | fall N.s ahead behind left right weakest | down | slip mm/s 0.35 1 | flight down");
  for (const name of values.builds.split(",")) {
    const setup = auditBuild(name)?.setup;
    if (!setup) throw new Error(`no build "${name}"`);
    for (const stance of STANCE_CELLS) {
      const row = await stanceCell(setup, stance);
      rows.push({ build: name, ...row });
      const s = row.standing, f = s.fall;
      const n = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : "  -  ");
      console.log(`${name.padEnd(18)} ${n(stance.width, 1).padStart(5)} ${n(stance.lead, 1).padStart(5)} ${n(stance.weight, 1).padStart(6)} | `
        + `${n(s.width)} ${n(s.stagger)} ${n(s.under)} | ${n(s.heightM)} | `
        + `${n(f.ahead, 0)} ${n(f.behind, 0)} ${n(f.left, 0)} ${n(f.right, 0)} ${n(f.weakest, 0)} | ${s.downSteps} | `
        + `${n(row.slow.meanFootSlipMps * 1000, 0)} ${n(row.full.meanFootSlipMps * 1000, 0)} | `
        + `${row.slow.flightSteps + row.full.flightSteps} ${row.slow.downSteps + row.full.downSteps}`);
    }
  }
  writeFileSync(join(values.out, "stance-bench.json"), JSON.stringify(rows, null, 1));
}

if (process.argv[1] && process.argv[1].endsWith("stance-bench.mjs")) await main();
