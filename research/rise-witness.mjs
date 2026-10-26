/**
 * **Whether a fast rise exists on the body as built**: a search for one witness, a trajectory from a
 * placed start at rest to verified standing (`STAND_CHECK`) within the target's allowance
 * (`docs/reference/rising.md#the-budget`). Node stand, core world, Rapier, 120 Hz, calm, no assist.
 *
 * A candidate is open-loop: keyframes, each a posture the pose drive (`poseDrive`) holds for its
 * duration at its rate and activation, then the body steadied by the stance as Stand up's steady
 * steadies it (`standUp`, `src/core/mind/ground/stand-up.ts`) and handed back once ready for
 * `READY` s. A keyframe's searched
 * channels are the trunk's flexion and each limb's main freedoms, mirrored left to right where the
 * move is (`mirrored`); its other channels keep the keyframe's seed posture. Diagonal CMA-ES
 * (`research/cma.mjs`) from the seeds.
 *
 * A trial scores 2 and the share of the cap left once verified standing and held `hold` s; verified
 * and then down, 1 and half that share; short of it, under 1: the best over the trial, held
 * `HELD` s, of the soles' share of the body's weight, its height's share of standing, its trunk's
 * uprightness and its stillness (1 at rest, 0 at `STILL` m/s), multiplied: what verification asks,
 * held so that a body flung for a step by the solver scores nothing. The cap is the search's; a
 * witness is verified within the target's allowance.
 *
 *   node research/rise-witness.mjs --move push-off --out research/runs/rise-witness/push-off
 *     [--model workshop-fighter] [--held empty] [--generations 100] [--workers 16] [--sigma .15] [--from <best.json>]
 *   node research/rise-witness.mjs --replay <best.json> [--seeds 4] [--hold 2]
 */
import { parentPort, isMainThread, workerData } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { cmaSearch, workerPool } from "./cma.mjs";
import "../tests/harness/preload-data.mjs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import poses from "../assets/research/posture-holds.json" with { type: "json" };
import { createBody } from "../src/core/body.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { loadEngine } from "../src/core/engine/engines.ts";
import { humanSpec, humanoidSpec } from "../src/core/human/spec.ts";
import { armedWith } from "../src/core/items/held.ts";
import { guardPosture } from "../src/core/skills/guard.ts";
import { createWorld } from "../src/core/world.ts";
import { groundPlacement, groundPostures } from "../src/lab/ground-starts.ts";
import { recoveryMeasurement } from "../src/core/control/recovery-measurement.ts";
import { observeBody } from "../src/core/observation.ts";
import { clockSenses } from "../src/core/mind/senses.ts";
import { groundReading } from "../src/core/mind/ground/reading.ts";
import { poseDrive } from "../src/core/mind/ground/technique.ts";
import { standReady } from "../src/core/mind/ground/reading.ts";
import { SERVO_SECONDS } from "../src/core/body.ts";
import { carrying } from "../src/core/control/motor.ts";
import { locomotion } from "../src/core/skills/locomotion.ts";
import { kitOf } from "../src/core/mind/kit.ts";
import { partLookup } from "../src/core/mind/catalog.ts";
import { PUNCHER } from "../src/core/mind/config.ts";
import { STAND_CHECK } from "../src/lab/ground-mode.ts";

/**
 * Each move: its placed start, its keyframes' seed postures, whether its channels are mirrored,
 * and its keyframes' seed settings where not `SEED`. `squat-up` is the control: the stance alone
 * stands the Warrior from its squat, and its search starts there, every keyframe of no duration.
 */
const MOVES = {
  "push-off": { start: "fours", seeds: ["fours", "fours-squat", "squat", "stand"], mirrored: true },
  "rock-up": { start: "back", seeds: ["squat", "squat", "squat", "stand"], mirrored: true },
  "squat-up": { start: "squat", seeds: ["squat", "squat", "stand", "stand"], mirrored: true, settings: { duration: 0, top: 4, activation: 1 } },
  "roll-push-off": { start: "back", seeds: ["squat", "fours", "fours", "fours-squat", "squat", "stand"], mirrored: false },
};
/** The channels a keyframe searches, a limb's named for its left side. */
const TRUNK = ["thoracic flexion", "lumbar flexion"], TURNS = ["thoracic rotation right", "lumbar lateral flexion right"];
const LIMB = ["shoulder.left flexion", "shoulder.left abduction", "elbow.left flexion", "hip.left flexion", "hip.left abduction", "knee.left flexion", "ankle.left dorsiflexion"];
const mirror = name => name.replace(".left", ".right");
/**
 * A keyframe's duration, s, the drive's rate ceiling, rad/s, and its activation. A duration's
 * lowest tenth is none, so a candidate may hand the body to the stance at once: the placed squat
 * held 0.05 s by the drive is past the stance's catch.
 */
const DURATION = [.03, 1.2], NONE = .1, TOP = [1, 20], ACTIVATION = [.1, 1];
const duration = u => u < NONE ? 0 : log((u - NONE) / (1 - NONE), DURATION);
const unduration = v => v <= 0 ? 0 : NONE + (1 - NONE) * unlog(v, DURATION);
/** Seed values of the keyframe's own settings. */
const SEED = { duration: .35, top: 4, activation: 1 };
/** How long a partial reading must hold to count, s; the speed of the centre of mass at which it counts nothing, m/s. */
const HELD = .1, STILL = .5;
/** How long Stand up's steady waits on a ready body before it hands it back, s. */
const READY = .1;
const log = (u, [lo, hi]) => Math.exp(Math.log(lo) + Math.min(1, Math.max(0, u)) * (Math.log(hi) - Math.log(lo)));
const unlog = (v, [lo, hi]) => Math.min(1, Math.max(0, Math.log(v / lo) / Math.log(hi / lo)));

/** A posture by channel (the pose drive's values, bind included) for a seed name on `spec`. */
function seedPosture(spec, name) {
  const reference = humanSpec("workshop-fighter");
  const stored = id => {
    const pose = poses.find(p => p.model === "workshop-fighter" && p.id === id);
    return Object.fromEntries(reference.joints.flatMap(j => j.dofs.map((d, k) => [`${j.name} ${d.positive}`, pose.placement.joints[j.name][k] + d.bind.value])));
  };
  if (name === "stand") {
    const guard = guardPosture(spec);
    return Object.fromEntries(spec.joints.flatMap(j => j.dofs.map(d => [`${j.name} ${d.positive}`, (guard[`${j.name} ${d.positive}`] ?? 0) + d.bind.value])));
  }
  if (name === "fours-squat") {
    const a = stored("fours"), b = stored("squat");
    return Object.fromEntries(Object.keys(a).map(k => [k, (a[k] + b[k]) / 2]));
  }
  return stored(name);
}

/** The searched channels of one keyframe, each a list of the channels it sets. */
function searched(move) {
  return MOVES[move].mirrored ? [...TRUNK.map(c => [c]), ...LIMB.map(c => [c, mirror(c)])]
    : [...TRUNK, ...TURNS].map(c => [c]).concat(LIMB.map(c => [c]), LIMB.map(c => [mirror(c)]));
}

/** A channel's range in the pose drive's values. */
function range(spec, channel) {
  const [joint, ...rest] = channel.split(" "), j = spec.joints.find(x => x.name === joint), d = j.dofs.find(x => x.positive === rest.join(" "));
  return [d.min.value + d.bind.value, d.max.value + d.bind.value];
}

/** A candidate's keyframes: each a posture, a duration, a rate ceiling and an activation. */
export function keyframes(move, spec, u) {
  const groups = searched(move), per = groups.length + 3;
  return MOVES[move].seeds.map((seed, k) => {
    const posture = { ...seedPosture(spec, seed) }, x = u.slice(k * per, (k + 1) * per);
    groups.forEach((channels, i) => { const [lo, hi] = range(spec, channels[0]); for (const c of channels) posture[c] = lo + x[i] * (hi - lo); });
    return { seed, posture, duration: duration(x[groups.length]), top: log(x[groups.length + 1], TOP),
      activation: ACTIVATION[0] + x[groups.length + 2] * (ACTIVATION[1] - ACTIVATION[0]) };
  });
}

/** The search's start: every keyframe at its seed. */
export function seedUnit(move, spec) {
  const groups = searched(move), settings = MOVES[move].settings ?? SEED;
  return MOVES[move].seeds.flatMap(seed => {
    const posture = seedPosture(spec, seed);
    return [...groups.map(channels => { const [lo, hi] = range(spec, channels[0]); return Math.min(1, Math.max(0, (posture[channels[0]] - lo) / (hi - lo))); }),
      unduration(settings.duration), unlog(settings.top, TOP), (settings.activation - ACTIVATION[0]) / (ACTIVATION[1] - ACTIVATION[0])];
  });
}

/** The body for `model` holding `held` in its right hand. */
const bodySpec = (model, held) => armedWith(humanoidSpec(model), "right", held);

/** The placement of `move`'s start at `seed`, the Warrior's stored posture put on a body without its own; or why it is refused. */
export function placement(move, spec, seed) {
  const start = MOVES[move].start, own = groundPostures(spec).includes(start);
  let waypoint;
  if (!own) {
    const reference = humanSpec("workshop-fighter"), source = poses.find(p => p.model === "workshop-fighter" && p.id === start);
    const angles = Object.fromEntries(reference.joints.flatMap(j => j.dofs.map((d, k) => [`${j.name} ${d.positive}`, source.placement.joints[j.name][k] + d.bind.value])));
    waypoint = { ...source.placement, joints: Object.fromEntries(spec.joints.map(j => [j.name, j.dofs.map(d => (angles[`${j.name} ${d.positive}`] ?? 0) - d.bind.value)])) };
  }
  return groundPlacement(spec, { seed, ground: { start: "placed", posture: start, degrees: null, impulse: null, foe: 0, gusts: false } }, waypoint);
}

/** The first `count` seeds from 1 whose placement is accepted. */
export function acceptedSeeds(move, spec, count) {
  const seeds = [];
  for (let seed = 1; seeds.length < count && seed < 100; seed++) if (!("refused" in placement(move, spec, seed))) seeds.push(seed);
  return seeds;
}

/** One trial of `u` from `move`'s start at `seed`: its score, the hand-over and verified times from the start, s. */
export async function witnessTrial({ move, model = "workshop-fighter", held = "empty", seed, u, hold = 1, cap = 8, trace = false }) {
  const spec = bodySpec(model, held), placed = placement(move, spec, seed);
  if ("refused" in placed) return { score: 0, refused: placed.refused };
  const frames = keyframes(move, spec, u), handover = frames.reduce((s, f) => s + f.duration, 0);
  const engine = new NullEngine(), scene = new Scene(engine), world = createWorld(scene, await loadEngine("rapier"));
  world.physics.addFixedBox([0, -.5, 0], [40, 1, 40]);
  const built = buildBody(spec, world, placed);
  const control = { active: true, time: 0, steady: false, ready: 0 };
  const body = createBody(built, world, { servoSeconds: .1, subs: [(own, view) => {
    const drive = poseDrive(own.muscles), kit = kitOf(partLookup, own.spec, PUNCHER), legs = locomotion(null);
    const motor = carrying(kit.motor(own.built, SERVO_SECONDS, kit.posture, undefined, own.assist), ["stance"], "the witness");
    return { name: `witness:${move}`, state: { control, motor: motor.state, legs: legs.state }, wants: () => control.active, begin() {}, end() {},
      step(_senses, dt) {
        if (control.time < handover) {
          let at = control.time, k = 0;
          while (k < frames.length - 1 && at >= frames[k].duration) { at -= frames[k].duration; k++; }
          drive(frames[k].posture, .2, frames[k].top, frames[k].activation);
        } else {
          if (!control.steady) { control.steady = true; motor.stance.read(); legs.resume({ ...view, stance: motor.stance.reading }); }
          motor.stance.read();
          motor.setStance(legs.goal({ ...view, stance: motor.stance.reading }, null, legs.heading, dt));
          motor.control(own.muscles, dt);
          control.ready = standReady(view) ? control.ready + dt : 0;
          if (control.ready + 1e-9 >= READY) control.active = false;
        }
        control.time += dt;
      } };
  }] });
  body.drive(view => ({ posture: guardPosture(spec), pushes: [], stance: { feet: ["left", "right"], centre: null, height: view.standing - .03, heading: 0 } }));
  const measure = recoveryMeasurement(built, observeBody(built, body.muscles, world, clockSenses(world), { contactPatches: true }));
  const reader = groundReading(built, world.dt), path = [], window = new Float64Array(Math.round(HELD / world.dt));
  let steps = 0;
  let quiet = 0, verified = null, fell = false, progress = 0, last = "";
  try {
    while (world.time < cap + (verified === null ? 0 : hold) && (verified === null || world.time - verified < hold)) {
      world.step();
      const m = measure(), g = reader.read();
      const feet = Math.min(1, g.footLoad[0] + g.footLoad[1]);
      window[steps++ % window.length] = feet * Math.min(1, g.height) * Math.max(0, g.upright) * Math.max(0, 1 - g.velocity.length() / STILL);
      if (steps >= window.length) progress = Math.max(progress, Math.min(...window));
      if (verified === null) { quiet = m.ready ? quiet + world.dt : 0; if (quiet + 1e-9 >= STAND_CHECK.quiet) verified = world.time; }
      else if (m.observation.down) { fell = true; break; }
      if (trace && g.raw !== last) { path.push([+world.time.toFixed(3), g.raw, +g.height.toFixed(2)]); last = g.raw; }
      if (verified === null && world.time > cap) break;
    }
  } finally { world.dispose(); scene.dispose(); engine.dispose(); }
  const score = verified !== null && !fell ? 2 + (cap - verified) / cap : verified !== null ? 1 + .5 * (cap - verified) / cap : .9 * progress;
  return { score, seed, handover: +handover.toFixed(3), verified: verified === null ? null : +verified.toFixed(3), fell, progress: +progress.toFixed(3),
    ...(trace ? { path } : {}) };
}

if (!isMainThread) {
  parentPort.on("message", async ({ id, x }) => {
    try { parentPort.postMessage({ id, r: await witnessTrial({ ...workerData, u: x }) }); }
    catch (error) { parentPort.postMessage({ id, r: { score: 0, error: String(error?.stack ?? error) } }); }
  });
} else if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("rise-witness.mjs")) {
  const { values } = parseArgs({ options: { move: { type: "string" }, out: { type: "string" }, model: { type: "string" }, held: { type: "string" },
    generations: { type: "string" }, workers: { type: "string" }, sigma: { type: "string" }, from: { type: "string" }, replay: { type: "string" },
    seeds: { type: "string" }, hold: { type: "string" }, cap: { type: "string" } } });
  if (values.replay) {
    const best = JSON.parse(await readFile(values.replay, "utf8")), spec = bodySpec(best.model, best.held);
    for (const seed of acceptedSeeds(best.move, spec, Number(values.seeds ?? 4)))
      console.log(JSON.stringify(await witnessTrial({ move: best.move, model: best.model, held: best.held, seed, u: best.u, hold: Number(values.hold ?? 2), cap: Number(values.cap ?? 8), trace: true })));
  } else {
    const move = values.move, model = values.model ?? "workshop-fighter", held = values.held ?? "empty";
    if (!MOVES[move]) throw new Error(`--move is one of ${Object.keys(MOVES).join(", ")}`);
    if (!values.out) throw new Error("--out names the search's files");
    const spec = bodySpec(model, held), [seed] = acceptedSeeds(move, spec, 1), cap = Number(values.cap ?? 5);
    let start = seedUnit(move, spec);
    if (values.from) {
      // The given witness's keyframes take the place of the last ones here, mirrored channels copied to both sides.
      const from = JSON.parse(await readFile(values.from, "utf8")), frames = keyframes(from.move, bodySpec(from.model, from.held), from.u);
      const groups = searched(move), per = groups.length + 3, offset = MOVES[move].seeds.length - frames.length;
      frames.forEach((f, k) => groups.forEach((channels, i) => { const [lo, hi] = range(spec, channels[0]);
        start[(offset + k) * per + i] = Math.min(1, Math.max(0, (f.posture[channels[0]] - lo) / (hi - lo)));
        start[(offset + k) * per + groups.length] = unduration(f.duration); start[(offset + k) * per + groups.length + 1] = unlog(f.top, TOP);
        start[(offset + k) * per + groups.length + 2] = (f.activation - ACTIVATION[0]) / (ACTIVATION[1] - ACTIVATION[0]); }));
    }
    await mkdir(dirname(values.out), { recursive: true });
    const workers = Number(values.workers ?? Math.max(1, availableParallelism() - 4));
    const pool = workerPool(new URL(import.meta.url), { move, model, held, seed, cap }, workers), t0 = Date.now();
    try {
      const result = await cmaSearch({ n: start.length, start, sigma: Number(values.sigma ?? .15), lambda: workers, generations: Number(values.generations ?? 100), seed: 7,
        score: u => pool.evaluate(u),
        async onGeneration(entry, progress) {
          const seconds = Math.round((Date.now() - t0) / 1000);
          await writeFile(`${values.out}.best.json`, JSON.stringify({ move, model, held, seed, cap, ...progress.best, keyframes: keyframes(move, spec, progress.best.u).map(f => ({ ...f, posture: undefined })) }));
          await appendFile(`${values.out}.jsonl`, JSON.stringify({ ...entry, bestSoFar: +progress.best.score.toFixed(4), r: progress.best.r, s: seconds }) + "\n");
          console.log(JSON.stringify({ g: entry.g, best: entry.best, median: entry.median, sigma: entry.sigma, bestSoFar: +progress.best.score.toFixed(3),
            verified: progress.best.r.verified, handover: progress.best.r.handover, s: seconds }));
        } });
      console.log(JSON.stringify({ best: result.best.score, r: result.best.r }));
    } finally { await pool.terminate(); }
  }
}
