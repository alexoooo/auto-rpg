/**
 * Walking one way while facing another: each of the core's bodies, the wooden club in its right
 * hand, alone on the stand under a fighter's tactics (`fighterTactics`) given one order for the
 * whole trial, at eight world bearings 45 degrees apart and four facings: its walk (no facing
 * ordered), and a far point ahead of where it stands as built (+z), to its right (+x) and behind
 * it (-z).
 *
 *   node research/orders-walk.mjs [--seconds 8] [--workers 14] [--shares 1,0.7,0.5]
 *
 * It prints the harness, and for each body and facing a row: how many of the eight walks fell,
 * at which bearings and when, the least and the most ground covered along the bearing ordered, the most covered across it,
 * and how far the pelvis's forward axis ended from the facing ordered, at worst (falls left out).
 * With `--shares` it prints the same once for each share of the fastest walk held while facing
 * elsewhere, in place of `STRAFE`'s. Each trial is a world of its own on a worker thread.
 */
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { armed } from "../src/core/human/grip.ts";
import { HUMANOID_MODELS as BODY_MODELS, modelSpec } from "../src/core/models.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { fighterTactics, STRAFE } from "../src/core/mind/fighter.ts";
import { driveBy } from "../src/core/mind/tactics.ts";
import { wrap } from "../src/core/skills/locomotion.ts";
import { coreStand } from "../tests/harness/core-stand.mjs";

const FACINGS = { "the walk": null, ahead: 0, "a quarter turn": Math.PI / 2, "a half turn": Math.PI };
const FAR = 1000;

/** One walk: `model` ordered to walk along `bearing` facing `facing` (a far point's bearing, or its walk) for `seconds`. */
async function trial({ model, bearing, facing, seconds, strafe }) {
  const stand = await coreStand(armed(modelSpec(model), "right", woodenClub()), { groundSize: 40 });
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS });
  try {
    const centre = body.view.stance.centre, from = centre.clone();
    const move = { x: Math.sin(bearing), z: Math.cos(bearing) };
    const point = facing === null ? null : { x: FAR * Math.sin(facing), z: FAR * Math.cos(facing) };
    // The facing is the direction to the point from where the body stands, as a person's pointer gives it.
    const orders = () => ({ move, face: point && { x: point.x - centre.x, z: point.z - centre.z }, attack: null });
    const skills = driveBy(body, fighterTactics("orders", orders, strafe));
    const pelvis = stand.built.segments.get("lowerTrunk").node, built = pelvis.rotationQuaternion.clone();
    let fellAt = null;
    for (let step = 0; step < stand.seconds(seconds) && fellAt === null; step++) {
      stand.step();
      if (body.view.down) fellAt = stand.world.time;
    }
    const dx = centre.x - from.x, dz = centre.z - from.z;
    // How the pelvis has turned since it was built facing +z, about up.
    const forward = new Vector3(0, 0, 1).applyRotationQuaternion(pelvis.rotationQuaternion.multiply(Quaternion.Inverse(built)));
    const asked = facing ?? bearing;
    return {
      bearing, fellAt, along: dx * move.x + dz * move.z, across: Math.abs(dx * move.z - dz * move.x),
      off: Math.abs(wrap(Math.atan2(forward.x, forward.z) - asked)),
    };
  } finally { body.dispose(); stand.dispose(); }
}

if (!isMainThread) {
  parentPort.on("message", async (job) => {
    try { parentPort.postMessage({ result: await trial(job) }); }
    catch (error) { parentPort.postMessage({ error: String(error?.stack ?? error) }); }
  });
} else {
  const { values } = parseArgs({ options: { seconds: { type: "string", default: "8" }, workers: { type: "string" }, shares: { type: "string" } } });
  const seconds = Number(values.seconds), lanes = Number(values.workers ?? Math.max(1, availableParallelism() - 2));
  const rules = values.shares ? values.shares.split(",").map((share) => ({ ...STRAFE, share: Number(share) })) : [STRAFE];
  const jobs = [];
  for (const strafe of rules) for (const model of BODY_MODELS) for (const [name, facing] of Object.entries(FACINGS)) {
    // The share is read only when a facing is ordered: the walk facing itself is run once.
    if (facing === null && strafe !== rules[0]) continue;
    for (let i = 0; i < 8; i++) jobs.push({ model, name, facing, bearing: wrap(i * Math.PI / 4), seconds, strafe });
  }
  const pool = Array.from({ length: Math.min(lanes, jobs.length) }, () => new Worker(new URL(import.meta.url)));
  const started = Date.now();
  let next = 0;
  await Promise.all(pool.map((worker) => new Promise((resolve, reject) => {
    const feed = () => {
      if (next >= jobs.length) { worker.terminate(); resolve(); return; }
      const job = jobs[next++];
      worker.once("message", ({ result, error }) => {
        if (error) { reject(new Error(error)); return; }
        job.result = result;
        feed();
      });
      worker.postMessage(job);
    };
    feed();
  })));

  console.log(`Node stand (tests/harness/core-stand.mjs), Rapier, 120 Hz; the wooden club in the right hand; ${seconds} s a walk; ${jobs.length} walks in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  console.log(`Turned within ${STRAFE.turned} rad of its facing, a body walks at the share plus the rest of its fastest walk times the cosine of the angle between its heading and its walk.\n`);
  console.log("| Share | Body | Facing | Falls of 8 | Fell: bearing, deg, at s | Along, m: least to most | Across, m: most | Off its facing, rad: most |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const strafe of rules) for (const model of BODY_MODELS) for (const name of Object.keys(FACINGS)) {
    const rows = jobs.filter((job) => job.strafe === strafe && job.model === model && job.name === name).map((job) => job.result);
    if (rows.length === 0) continue;
    const held = rows.filter((row) => row.fellAt === null), fell = rows.filter((row) => row.fellAt !== null);
    const along = held.map((row) => row.along);
    console.log(`| ${name === "the walk" ? "" : strafe.share} | ${model} | ${name} | ${fell.length} | ${fell.map((row) => `${Math.round(row.bearing * 180 / Math.PI)} at ${row.fellAt.toFixed(1)}`).join(", ")} | ${held.length ? `${Math.min(...along).toFixed(2)} to ${Math.max(...along).toFixed(2)}` : ""} | ${held.length ? Math.max(...held.map((row) => row.across)).toFixed(2) : ""} | ${held.length ? Math.max(...held.map((row) => row.off)).toFixed(2) : ""} |`);
  }
}
