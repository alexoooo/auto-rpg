/**
 * **How fast can a body leave the ground?** A squat jump on the Node stand (Rapier, 120 Hz): the
 * body is built crouched (`crouch`: its knees at the flexion asked, its ankles at `ANKLE`, its feet
 * flat, its hips bent until its centre of mass stands over its feet where it does standing), held
 * there by servo for `HOLD`, and then each leg extensor (hip and knee extension, ankle
 * plantarflexion, both sides alike) pulls toward extension as fast as it can at an onset and an
 * activation of its own, while everything else holds its pose. The three onsets and three
 * activations are searched (`cmaSearch`, `PUSH`) for the fastest speed up the body leaves at. No
 * skill and no mind: the muscles alone, so the answer is near the body's ceiling and not a
 * controller's.
 *
 * It reads the centre of mass's speed as it leaves the ground (the first step its momentum changes
 * by gravity alone), the flight's rise above standing, and for each extensor over the push: the
 * share of steps it turned at more than `NEAR` of its unloaded speed (the curve's end), or within
 * `STOP` of its limit, and its largest torque over its peak.
 *
 * A person's squat jump leaves at about 2.4 to 2.8 m/s (a rise of 0.3 to 0.4 m), from a knee bent
 * about 90 degrees; this reference is recalled, not read from a source here.
 *
 *   node research/jump-test.mjs [--models workshop-fighter,workshop-rogue] [--knees 0.8,1.1,1.3]
 *     [--haste 1,1.5,2,3] [--generations 14] [--workers n] [--json out.json]
 *
 * `--haste` is `Physique.speed`, every muscle's unloaded speed by the factor (only the legs' move
 * the jump; the rest hold).
 */
import { writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import { isMainThread, parentPort } from "node:worker_threads";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

const [{ modelSpec }, { coreStand }, { driveMuscles }, { massCentreToRef }, { cmaSearch, workerPool }] = await Promise.all([
  import("../src/core/models.ts"), import("../tests/harness/core-stand.mjs"), import("../src/core/muscle/driver.ts"), import("../src/core/control/support.ts"),
  import("./cma.mjs"),
]);

const G = 9.81;
/** The servo's gain on an angle's error, 1/s. */
const GAIN = 12;
/** The crouch's ankle dorsiflexion, rad (its stop reads 0.36), and how long it is held before the push, s. */
const ANKLE = 0.3;
const HOLD = 0.5;
/** A speed past this share of the unloaded speed is at the curve's end; an angle within `STOP` rad of a limit is at the stop. */
const NEAR = 0.9;
const STOP = 0.03;
/**
 * The flight: `FLOWN` steps on end whose centre of mass's acceleration is within `FREE` of
 * gravity's, m/s², in every axis; the body left at the first of them.
 */
const FREE = 0.6;
const FLOWN = 4;
/** The search's reach: each extensor's onset after the push starts, s, and its activation, from the first to the second. */
const PUSH = { onset: 0.25, level: [0.2, 1] };
/** How long the push is watched for a takeoff, s, and how long the flight after it. */
const WATCH = { push: 0.8, flight: 0.8 };


const centreOf = (built) => {
  const segments = [...built.segments.values()], mass = segments.reduce((s, x) => s + x.rigid.mass, 0), c = new Vector3(), w = new Vector3();
  massCentreToRef(segments, mass, c, w);
  return c;
};
const feetOf = (built) => ["foot.left", "foot.right"].map((name) => built.segments.get(name).node.position);
const between = (feet) => feet[0].add(feet[1]).scale(0.5);

/** The crouch's angles with the hips at `hip`, the root pitched so the feet lie flat. */
const posed = (knee, hip) => ({
  joints: Object.fromEntries(["left", "right"].flatMap((side) => [[`hip.${side}`, [hip, 0, 0]], [`knee.${side}`, [knee]], [`ankle.${side}`, [ANKLE, 0]]])),
  pitch: ANKLE - knee + hip,
});

/**
 * The stand for `spec` crouched at `knee`: the hip found by bisection to put the centre of mass
 * as far ahead of the feet's middle as it stands upright, the feet where they stand.
 */
async function crouch(spec, knee) {
  const upright = await coreStand(spec);
  const standing = { feet: between(feetOf(upright.built)), centre: centreOf(upright.built) };
  upright.dispose();
  const ahead = standing.centre.z - standing.feet.z;
  const build = async (hip, position = [0, 0, 0]) => {
    const { joints, pitch } = posed(knee, hip);
    return coreStand(spec, { joints, position, rotation: [Math.sin(pitch / 2), 0, 0, Math.cos(pitch / 2)] });
  };
  const offset = async (hip) => {
    const s = await build(hip);
    const feet = between(feetOf(s.built)), c = centreOf(s.built), pitch = s.built.segments.get("foot.left").node.rotationQuaternion.x;
    s.dispose();
    return { ahead: c.z - feet.z, feet, pitch };
  };
  let lo = 0, hi = 2.05;
  for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; if ((await offset(mid)).ahead < ahead) lo = mid; else hi = mid; }
  const hip = (lo + hi) / 2, at = await offset(hip);
  const s = await build(hip, [standing.feet.x - at.feet.x, standing.feet.y - at.feet.y, standing.feet.z - at.feet.z]);
  return { stand: s, hip, footPitch: at.pitch, standing: standing.centre.y };
}

/** A point of the search's cube as the push: the hip's, knee's and ankle's onsets, s, and activations. */
const pushOf = (u) => ({ onset: u.slice(0, 3).map((x) => x * PUSH.onset), level: u.slice(3, 6).map((x) => PUSH.level[0] + x * (PUSH.level[1] - PUSH.level[0])) });

async function jump(model, knee, haste, push) {
  const spec = modelSpec(model, haste === 1 ? undefined : { speed: haste });
  const { stand, hip, footPitch, standing } = await crouch(spec, knee);
  const segments = [...stand.built.segments.values()], mass = segments.reduce((s, x) => s + x.rigid.mass, 0);
  const centre = new Vector3(), velocity = new Vector3(), work = new Vector3();
  let goal = null, time = 0;
  const legs = [];
  const driver = driveMuscles(stand.built, stand.world, (d, dt) => {
    goal ??= Float64Array.from(d.channels, (_, i) => d.angle(i));
    time += dt;
    for (let i = 0; i < d.channels.length; i++) {
      const leg = legs.find((l) => l.i === i);
      const on = leg && time - HOLD >= push.onset[leg.lead];
      d.activation[i] = on ? push.level[leg.lead] : 1;
      d.velocity[i] = on ? -1e3 : GAIN * (goal[i] - d.angle(i));
    }
  });
  for (let i = 0; i < driver.channels.length; i++) {
    const m = /^(hip|knee|ankle)\.(left|right) (flexion|dorsiflexion)$/.exec(driver.channels[i].name);
    if (m) legs.push({ i, joint: m[1], lead: ["hip", "knee", "ankle"].indexOf(m[1]), c: driver.channels[i], steps: 0, near: 0, stop: 0, most: 0 });
  }
  const dt = stand.world.dt;
  try {
    stand.step(stand.seconds(HOLD));
    massCentreToRef(segments, mass, centre, work, velocity);
    const low = centre.y, still = velocity.length();
    let last = velocity.clone(), takeoff = null, free = null, top = -Infinity, flown = 0, peakUp = 0;
    for (let k = 0; k < stand.seconds(WATCH.push + WATCH.flight); k++) {
      stand.step(1);
      massCentreToRef(segments, mass, centre, work, velocity);
      const a = [(velocity.x - last.x) / dt, (velocity.y - last.y) / dt + G, (velocity.z - last.z) / dt];
      last = velocity.clone();
      const pushing = time - HOLD;
      peakUp = Math.max(peakUp, velocity.y);
      if (!takeoff) {
        for (const l of legs) {
          const speed = -driver.speed(l.i), w0 = l.c.negative.curve.unloadedSpeed;
          l.steps++;
          if (speed > NEAR * w0) l.near++;
          if (driver.angle(l.i) < l.c.dof.spec.min.value + STOP) l.stop++;
          l.most = Math.max(l.most, -driver.pulled[l.i] / l.c.negative.peak);
        }
        if (!a.every((x) => Math.abs(x) < FREE)) free = null;
        else if (!free) free = { at: pushing, up: velocity.y, ahead: velocity.z, side: velocity.x, steps: 1 };
        else if (++free.steps >= FLOWN) takeoff = free;
        if (!takeoff && pushing > WATCH.push) break;
      } else {
        top = Math.max(top, centre.y);
        if ((flown += dt) > WATCH.flight) break;
      }
    }
    const joints = Object.fromEntries(["hip", "knee", "ankle"].map((joint) => {
      const ls = legs.filter((l) => l.joint === joint), n = ls.reduce((s, l) => s + l.steps, 0);
      return [joint, { atCurveEnd: +(ls.reduce((s, l) => s + l.near, 0) / n).toFixed(2), atStop: +(ls.reduce((s, l) => s + l.stop, 0) / n).toFixed(2), torqueOverPeak: +Math.max(...ls.map((l) => l.most)).toFixed(2) }];
    }));
    return {
      model, knee, haste, push: { onset: push.onset.map((x) => +x.toFixed(3)), level: push.level.map((x) => +x.toFixed(2)) }, hip: +hip.toFixed(3), footPitch: +footPitch.toFixed(3), crouch: +(standing - low).toFixed(3), still: +still.toFixed(2),
      takeoff: takeoff && { push: +takeoff.at.toFixed(3), up: +takeoff.up.toFixed(2), ahead: +takeoff.ahead.toFixed(2), side: +takeoff.side.toFixed(2) },
      rise: takeoff ? +(top - standing).toFixed(3) : null, peakUp: +peakUp.toFixed(2), joints,
    };
  } finally { driver.dispose(); stand.dispose(); }
}

const speedOf = (r) => r.takeoff ? r.takeoff.up : r.peakUp - 1;

if (!isMainThread) {
  parentPort.on("message", async ({ id, x }) => {
    const r = await jump(x.model, x.knee, x.haste, pushOf(x.u));
    parentPort.postMessage({ id, r: { score: speedOf(r), r } });
  });
} else {
  const { values: options } = parseArgs({ options: {
    models: { type: "string", default: "workshop-fighter,workshop-rogue" }, knees: { type: "string", default: "0.8,1.1,1.3" },
    haste: { type: "string", default: "1,1.5,2,3" }, generations: { type: "string", default: "14" },
    workers: { type: "string", default: String(Math.max(1, availableParallelism() - 2)) }, json: { type: "string" },
  } });
  const list = (s) => s.split(",").map(Number);
  const pool = workerPool(new URL(import.meta.url), null, Number(options.workers));
  const cells = options.models.split(",").flatMap((model) => list(options.knees).flatMap((knee) => list(options.haste).map((haste) => ({ model, knee, haste }))));
  console.log("Node stand, Rapier, 120 Hz: squat jump from a built crouch, each leg extensor's onset and activation searched");
  const results = await Promise.all(cells.map(async (cell) => {
    // Every extensor at once and flat out is the search's start.
    const { best } = await cmaSearch({ n: 6, start: [0, 0, 0, 1, 1, 1], sigma: 0.3, lambda: 12, generations: Number(options.generations), seed: 1,
      score: (u) => pool.evaluate({ ...cell, u }) });
    return best.r.r;
  }));
  await pool.terminate().catch(() => {});
  for (const r of results) {
    const j = r.joints, t = r.takeoff;
    console.log(`${r.model} knee ${r.knee} haste ${r.haste}: hip ${r.hip}, crouch ${r.crouch} m (moving ${r.still} m/s), push onsets ${r.push.onset.join("/")} s at ${r.push.level.join("/")}; `
      + (t ? `leaves after ${t.push} s at ${t.up} m/s up (${t.ahead} ahead, ${t.side} aside), rises ${r.rise} m` : `no takeoff (peak ${r.peakUp} m/s up)`)
      + `; at curve end/stop/torque÷peak: ${["hip", "knee", "ankle"].map((k) => `${k} ${j[k].atCurveEnd}/${j[k].atStop}/${j[k].torqueOverPeak}`).join(", ")}`);
  }
  if (options.json) writeFileSync(options.json, JSON.stringify({ harness: "Node stand, Rapier, 120 Hz", results }, null, 2) + "\n");
}
