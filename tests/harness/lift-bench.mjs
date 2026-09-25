/**
 * How hard an arm can lift or shove: the load a chain moves against a set force.
 *
 *     node tests/harness/lift-bench.mjs
 *     node tests/harness/lift-bench.mjs --modules=effector.wrist.blade --json
 *
 * `docs/plans/2026-09-23-physical-contact-01-measure.md` (in git at 30dcb8c) section 5, and the number session 07's
 * lift and session 04's body density rest on: the owner's answer of 2026-09-23 made the comparison
 * the design -- "arms stay light by design; lift is spare arm torque against body weight".
 *
 * One module on the bench stand (`standUp` from `impact-bench.mjs`: NullEngine, real Havok, no
 * rendering), settled in its guard pose for 1 s, then commanded **up** (elevation at its ceiling,
 * reach at thrust) or **sideways** (azimuth at its ceiling, reach at thrust) and held for 1.5 s. A
 * first run with nothing in the way finds where that command puts the striker's tip.
 *
 * **Capacity** (`liftCapacity`). A plate on a slider -- a dynamic body, no gravity, free to move
 * only along the command's axis (world up, or the free tip's horizontal bearing) -- stands with its
 * near face `gapM` short of the free tip, and from the moment of the command a constant force `F`
 * pushes it back at the arm. The arm has lifted `F` if by the end of the hold the plate has risen at
 * least half the gap toward the tip; the capacity is the largest such `F`, found by doubling and
 * then bisection. Half the gap and not all of it on purpose: an arm driven to full extension under a
 * load becomes a toggle, whose mechanical advantage diverges as it straightens, and a lift that only
 * succeeds at the last millimetre of a straight arm is a jack, not an arm's strength.
 *
 * **Why not a pressed wall**, which is what the plan's text asked for. It was built first: a
 * keyframed slab across the path, and the contact impulses on it summed per step. The readout is
 * sound -- `contactForceReadout` reads a resting 50 kg load at 475 N against 490.5 -- but what it
 * read was not an arm: the stone reach fist "held" 8.5 kN against the slab at x1 and then dropped a
 * 50 kg dynamic plate it was pushing up. An arm pinned between two infinitely heavy bodies (the
 * keyframed stand and a keyframed wall) carries load through its joint constraints like a column,
 * and the reading is that structure's reaction, not what the motors can move. Moving a load against
 * a force is the question a lift asks, so it is the one this bench asks. (A block the size of a head
 * centred on the free tip was tried before the wall, and was simply gone round.)
 *
 * Beside it, the whole-body weight of the family that carries the chain, from `mass-census.mjs`.
 */
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsConstraintAxis, PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";
import { pathToFileURL } from "node:url";

import { BUTTON_REACH } from "../../src/buttons.ts";
import { CONFIG } from "../../src/config.ts";
import { ATTRIBUTES, ATTRIBUTE_IDS } from "../../src/golem/attributes.ts";
import { COLLIDES, LAYER } from "../../src/physics.ts";
import { boxPart } from "../../src/rig.ts";
import { standUp } from "./impact-bench.mjs";

export const HARNESS = "the Node lift bench (tests/harness/lift-bench.mjs, bench stand, NullEngine, real Havok)";
const SUBSTEP = 1 / CONFIG.world.physicsHz;
const G = 9.81;

/** Each chain with a held item and bare, and the family that carries it. */
export const LIFT_MODULES = Object.freeze([
  { moduleId: "effector.reach.blade", family: "stone" }, { moduleId: "effector.reach.fist", family: "stone" },
  { moduleId: "effector.wrist.blade", family: "stone" }, { moduleId: "effector.wrist.fist", family: "stone" },
  { moduleId: "effector.pitch.blade", family: "stone" }, { moduleId: "effector.pitch.fist", family: "stone" },
  { moduleId: "effector.skeletal.blade", family: "skeleton" }, { moduleId: "effector.skeletal.fist", family: "skeleton" },
  { moduleId: "effector.anatomical.blade", family: "human" }, { moduleId: "effector.anatomical.fist", family: "human" },
]);

/** Every live stat at `value`, clamped into its row; a row that is not live stays at 1. */
export const everyStatAt = (value) => Object.freeze(Object.fromEntries(ATTRIBUTE_IDS.map((id) => {
  const row = ATTRIBUTES[id];
  return [id, row.live ? Math.min(row.max, Math.max(row.min, value)) : 1];
})));

export const DIRECTIONS = Object.freeze({
  up: { pointerY: 1, reach: BUTTON_REACH.thrust },
  sideways: { pointerX: 1, reach: BUTTON_REACH.thrust },
});

/**
 * The contact force on `body`, one reading per solver step: the magnitudes of every contact impulse
 * Havok reports on it during the step, over the substep. Checked against a resting load of known
 * mass in `tests/contact-instruments.test.mjs`, where it reads 475 N for a 490.5 N weight: Havok's
 * reported impulse runs about 3 % under the weight it holds, so the column is good to a few per cent.
 */
export function contactForceReadout(scene, body) {
  let stepImpulse = 0;
  const forces = [];
  body.setCollisionCallbackEnabled(true);
  const onContact = body.getCollisionObservable().add((event) => { stepImpulse += Math.abs(event.impulse ?? 0); });
  const onStep = scene.onAfterPhysicsObservable.add(() => { forces.push(stepImpulse / SUBSTEP); stepImpulse = 0; });
  return {
    forces,
    /** The mean over the last `seconds` of readings. */
    meanOver: (seconds) => {
      const window = forces.slice(-Math.round(seconds / SUBSTEP));
      return window.length ? window.reduce((a, b) => a + b, 0) / window.length : 0;
    },
    dispose: () => { body.getCollisionObservable().remove(onContact); scene.onAfterPhysicsObservable.remove(onStep); },
  };
}

/** The free tip: where the command puts the striker with nothing in the way. */
export async function freeTip({ moduleId, attributes = null, command, settleSeconds = 1, holdSeconds = 1.5 }) {
  const bench = await standUp(moduleId, attributes);
  try {
    bench.frames(settleSeconds);
    Object.assign(bench.intent.primary, command);
    bench.frames(holdSeconds);
    const tip = bench.module.strikers[0].tipPosition().clone();
    return { tip, socket: bench.socket.clone(), tipFromSocketM: Vector3.Distance(tip, bench.socket) };
  } finally { bench.dispose(); }
}

/**
 * The slab across a command's path: its normal `axis` (world up, or the free tip's horizontal
 * bearing from the socket), its near face `shortM` before the free tip along that axis.
 */
export function slabFor(direction, socket, tip, { shortM = 0.2, thicknessM = 0.2, spanM = 3 } = {}) {
  const axis = direction === "up" ? new Vector3(0, 1, 0)
    : new Vector3(tip.x - socket.x, 0, tip.z - socket.z).normalize();
  const centre = tip.add(axis.scale(thicknessM / 2 - shortM));
  // The box's thin side is its local Y, turned onto the axis.
  const rotation = direction === "up" ? Quaternion.Identity()
    : Quaternion.FromUnitVectorsToRef(new Vector3(0, 1, 0), axis, new Quaternion());
  return { axis, centre, rotation, size: new Vector3(spanM, thicknessM, spanM) };
}

/**
 * A plate on a slider along `slab.axis`, pushed back along it by `forceN` from the command on.
 * Returns how far the plate moved along the axis (positive is toward the free tip, the way the arm
 * pushes) and the contact force the plate felt over the last 0.5 s. With `withArm: false` the arm
 * is commanded nowhere and the plate is left to the force alone, which is the trial's own control.
 */
export async function sliderTrial({ moduleId, attributes = null, command, slab, forceN, plateKg = 20,
  settleSeconds = 1, holdSeconds = 1.5, withArm = true }) {
  const bench = await standUp(moduleId, attributes);
  try {
    const plate = boxPart(bench.scene, { name: "lift.plate", position: slab.centre.clone(), rotation: slab.rotation,
      size: slab.size, mass: plateKg, layer: LAYER.RIGHT_TRUNK, collidesWith: COLLIDES.RIGHT_TRUNK });
    const anchor = boxPart(bench.scene, { name: "lift.anchor", position: slab.centre.clone(), rotation: slab.rotation,
      size: new Vector3(0.05, 0.05, 0.05), mass: 1, layer: 0, collidesWith: 0, motionType: PhysicsMotionType.ANIMATED });
    plate.body.setGravityFactor(0);
    bench.plugin.setActivationControl(plate.body, 1);
    // The plate's thin side is its local Y, which `slabFor` turned onto the axis: free along it,
    // bounded so a plate the arm cannot hold does not fall through the stand, and locked in all else.
    const slider = new Physics6DoFConstraint({ pivotA: Vector3.Zero(), pivotB: Vector3.Zero(),
      axisA: new Vector3(1, 0, 0), axisB: new Vector3(1, 0, 0), perpAxisA: new Vector3(0, 1, 0), perpAxisB: new Vector3(0, 1, 0) }, [
      { axis: PhysicsConstraintAxis.LINEAR_X, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.LINEAR_Y, minLimit: -1, maxLimit: 0.6 },
      { axis: PhysicsConstraintAxis.LINEAR_Z, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.ANGULAR_X, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.ANGULAR_Y, minLimit: 0, maxLimit: 0 },
      { axis: PhysicsConstraintAxis.ANGULAR_Z, minLimit: 0, maxLimit: 0 },
    ], bench.scene);
    anchor.body.addConstraint(plate.body, slider);
    bench.frames(settleSeconds);
    const start = Vector3.Dot(plate.mesh.position, slab.axis);
    const push = slab.axis.scale(-forceN * SUBSTEP);
    const load = bench.scene.onBeforePhysicsObservable.add(() => plate.body.applyImpulse(push, plate.mesh.position));
    const readout = contactForceReadout(bench.scene, plate.body);
    if (withArm) Object.assign(bench.intent.primary, command);
    bench.frames(holdSeconds);
    bench.scene.onBeforePhysicsObservable.remove(load);
    const movedM = Vector3.Dot(plate.mesh.position, slab.axis) - start;
    const contactN = readout.meanOver(0.5);
    readout.dispose();
    slider.dispose();
    return { movedM, contactN };
  } finally { bench.dispose(); }
}

/** How far short of the free tip the plate stands, in the capacity search. */
export const LIFT_GAPS_M = Object.freeze([0.2, 0.4]);

/**
 * The largest force the arm moves the plate half the gap against: doubling from 250 N until it
 * fails, then bisecting to `toleranceN`. Zero when the arm cannot move even a free plate that far,
 * which is a chain that cannot push that way at all rather than a weak one.
 */
export async function liftCapacity({ moduleId, direction = "up", attributes = null, gapM = 0.2, free = null,
  toleranceN = 50, ceilingN = 64000 }) {
  const command = DIRECTIONS[direction];
  const tip = free ?? await freeTip({ moduleId, attributes, command });
  const slab = slabFor(direction, tip.socket, tip.tip, { shortM: gapM, spanM: 0.8 });
  const trial = async (forceN) => ({ forceN, ...(await sliderTrial({ moduleId, attributes, command, slab, forceN })) });
  const lifts = (t) => t.movedM >= gapM / 2;
  const row = (capacityN, trials, atCapacity) =>
    ({ moduleId, direction, gapM, freeTipFromSocketM: tip.tipFromSocketM, capacityN, trials, atCapacity });
  const base = await trial(0);
  if (!lifts(base)) return row(0, 1, base);
  let good = base, bad = null, trials = 1;
  for (let f = 250; f <= ceilingN; f *= 2) {
    const t = await trial(f);
    trials += 1;
    if (lifts(t)) good = t; else { bad = t; break; }
  }
  if (!bad) return row(Infinity, trials, good);
  while (bad.forceN - good.forceN > toleranceN) {
    const t = await trial((good.forceN + bad.forceN) / 2);
    trials += 1;
    if (lifts(t)) good = t; else bad = t;
  }
  return row(good.forceN, trials, good);
}

async function main() {
  Logger.LogLevels = Logger.ErrorLogLevel;
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
  const only = args.modules ? new Set(args.modules.split(",")) : null;
  const { ATTRIBUTE_PRESETS } = await import("../../research/stat-sweep.mjs");
  const { runMassCensus } = await import("./mass-census.mjs");
  const families = await runMassCensus();
  const weightOf = (family) => G * families.find((row) => row.family === family).wholeKg;
  const levels = { x1: null, "x1.25": everyStatAt(1.25), max: ATTRIBUTE_PRESETS.max() };
  const rows = [];
  for (const { moduleId, family } of LIFT_MODULES) {
    if (only && !only.has(moduleId)) continue;
    for (const [level, attributes] of Object.entries(levels)) {
      for (const direction of Object.keys(DIRECTIONS)) {
        const free = await freeTip({ moduleId, attributes, command: DIRECTIONS[direction] });
        for (const gapM of LIFT_GAPS_M) {
          rows.push({ level, family, bodyWeightN: weightOf(family),
            ...(await liftCapacity({ moduleId, direction, attributes, gapM, free })) });
        }
      }
    }
  }
  if ("json" in args) { console.log(JSON.stringify({ harness: HARNESS, rows }, null, 2)); return; }
  console.log(`${HARNESS}\n`);
  console.log("Capacity: the largest force pushing back on a slider plate that the arm still moves half the gap toward its free tip within a 1.5 s hold, bisected to 50 N. Body weight is the x1 family's whole mass (mass census); at `max` a body's own weight grows with size and weight, which the ratio column does not follow.\n");
  console.log("| Module | Level | Direction | Free tip from socket m | Gap m | Capacity N | Contact at capacity N | x1 body weight N | Capacity / weight |");
  console.log("| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  const n = (x) => (Number.isFinite(x) ? x.toFixed(0) : "> ceiling");
  for (const r of rows) {
    console.log(`| ${r.moduleId} | ${r.level} | ${r.direction} | ${r.freeTipFromSocketM.toFixed(2)} | ${r.gapM.toFixed(1)} | ${n(r.capacityN)} | ${r.atCapacity.contactN.toFixed(0)} | ${r.bodyWeightN.toFixed(0)} | ${Number.isFinite(r.capacityN) ? (r.capacityN / r.bodyWeightN).toFixed(2) : "--"} |`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
