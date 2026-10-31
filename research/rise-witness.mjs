/**
 * **Whether a fast rise exists on the body as built**: a search for one witness, a trajectory from a
 * placed start at rest to verified standing (`STAND_CHECK`) within the target's allowance
 * (`docs/reference/rising.md#the-budget`). Node stand, core world, Rapier, 120 Hz, calm, no assist.
 *
 * A candidate is a move's phases, each held for its duration, then the body steadied by the stance
 * as Stand up's steady steadies it (`standUp`, `src/core/recovery/ground/stand-up.ts`) and handed back
 * once ready (`research/climb.mjs`). A phase is one of two kinds:
 *
 * - **pose**, open-loop: a posture the pose drive (`poseDrive`) holds at its rate and activation;
 * - **bear**, closed-loop: plant-up's bearing solve (`plantUp`, `src/core/recovery/ground/plant-up.ts`)
 *   on the limbs given shares of the body's weight, carrying the centre of mass toward a place (an
 *   offset from the bearing limbs' centre toward the feet, and a height) at a velocity (toward the
 *   feet and up), so a phase can carry momentum, and the pelvis to a pitch, at a response time;
 *   every freedom the limbs' tasks do not take is servoed to the phase's posture.
 *
 * A phase's searched channels are the trunk's flexion and each limb's main freedoms, mirrored left
 * to right where the move is (`mirrored`); its other channels keep the phase's seed posture.
 * Diagonal CMA-ES (`research/cma.mjs`) from the seeds.
 *
 * A trial scores 2 and the share of the cap left once verified standing and held `hold` s; verified
 * and then down, 1 and half that share; short of it, under 1: the best over the trial, held
 * `HELD` s, of the soles' share of the body's weight, its height's share of standing, its trunk's
 * uprightness and its stillness (1 at rest, 0 at `STILL` m/s), multiplied: what verification asks,
 * held so that a body flung for a step by the solver scores nothing. The cap is the search's; a
 * witness is verified within the target's allowance.
 *
 *   node research/rise-witness.mjs --move push-off --out research/runs/rise-witness/push-off
 *     [--model workshop-fighter] [--held empty] [--generations 100] [--workers 16] [--sigma .15] [--cap 8]
 *   node research/rise-witness.mjs --replay <best.json> [--seeds 4] [--hold 2] [--steady <json>]
 *
 * `--steady` changes the steady as `research/crouch-steady.mjs`'s variants do (`research/climb.mjs`).
 * With `HANDOVER=1` each replay prints the body as the steady takes it; with `TABLE=1`, the steady's trace.
 */
import { parentPort, isMainThread, workerData } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { cmaSearch, workerPool } from "./cma.mjs";
import { crouchSteady, traceRow } from "./climb.mjs";
import "../tests/harness/preload-data.mjs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import poses from "../assets/research/posture-holds.json" with { type: "json" };
import { commandedBody } from "../src/core/mind/host.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { loadEngine } from "../src/core/engine/engines.ts";
import { humanSpec, humanoidSpec } from "../src/core/human/spec.ts";
import { armedWith } from "../src/core/items/held.ts";
import { guardPosture } from "../src/core/skills/guard/guard.ts";
import { createWorld } from "../src/core/world.ts";
import { groundPlacement, groundPostures } from "../src/lab/ground-starts.ts";
import { recoveryMeasurement } from "../src/core/control/recovery-measurement.ts";
import { observeBody } from "../src/core/observation.ts";
import { clockSenses } from "../src/core/mind/senses.ts";
import { groundReading } from "../src/core/recovery/ground/reading.ts";
import { poseDrive } from "../src/core/recovery/ground/technique.ts";
import { bearLimbs, carryRoot, limbMotion, makeBearing } from "../src/core/control/bearing.ts";
import { uprightness } from "../src/core/control/ground.ts";
import { servoAsk, servoSolve } from "../src/core/control/servo.ts";
import { turnOfToRef } from "../src/core/read-motion.ts";
import { atan2 } from "../src/core/math/real.ts";
import { spinBetweenToRef, turnAboutToRef } from "../src/core/math/turn.ts";
import { riseLimbs } from "../src/core/recovery/rise/limbs.ts";
import { STAND_CHECK } from "../src/lab/ground-mode.ts";

/** A pose phase: its seed posture, and its settings where not `POSE_SEED`. */
const pose = (seed, settings = {}) => ({ kind: "pose", seed, settings: { ...POSE_SEED, ...settings } });
/** A bear phase: its seed posture and settings, the shares by limb kind (each side's). */
const bear = (seed, settings) => ({ kind: "bear", seed, settings: { ...BEAR_SEED, ...settings } });

/**
 * Each move: its placed start, its phases, and whether its channels are mirrored. `squat-up` and
 * `squat-up-bear` are the controls: the stance alone stands the Warrior from its squat. The first
 * starts there, every phase of no duration; the second with its bear phases held, so its search
 * either finds the bearing solve's rise or shortens them to none.
 */
const MOVES = {
  "push-off": { start: "fours", mirrored: true, phases: () => [pose("fours"), pose("fours-squat"), pose("squat"), pose("stand")] },
  "rock-up": { start: "back", mirrored: true, phases: () => [pose("squat"), pose("squat"), pose("squat"), pose("stand")] },
  "squat-up": { start: "squat", mirrored: true, phases: () => [pose("squat", { duration: 0 }), pose("squat", { duration: 0 }), pose("stand", { duration: 0 }), pose("stand", { duration: 0 })] },
  "squat-up-bear": { start: "squat", mirrored: true, phases: () => [
    bear("squat", { duration: .2, foot: .5, hand: 0, shin: 0, height: .6 }),
    bear("stand", { duration: .2, foot: .5, hand: 0, shin: 0, height: .98, pitch: 0 })] },
  "push-off-bear": { start: "fours", mirrored: true, phases: () => [
    bear("fours", { duration: .3, shin: .25, hand: .25, foot: 0, height: .4, pitch: 1.3 }),
    bear("fours-squat", { duration: .3, shin: .2, hand: .3, foot: 0, toward: .25, height: .5, along: .8, up: .5, pitch: 1 }),
    bear("squat", { duration: .3, shin: 0, hand: 0, foot: .5, height: .6, pitch: .6 }),
    bear("stand", { duration: .3, shin: 0, hand: 0, foot: .5, height: .98, pitch: 0 })] },
  "rock-up-bear": { start: "back", mirrored: true, phases: () => [
    pose("squat"), pose("squat", { top: 8 }),
    bear("squat", { duration: .3, shin: 0, hand: 0, foot: .5, toward: 0, height: .55, along: .5, up: .5, pitch: .6 }),
    bear("stand", { duration: .3, shin: 0, hand: 0, foot: .5, height: .98, pitch: 0 })] },
};
/** The channels a phase searches, a limb's named for its left side. */
const TRUNK = ["thoracic flexion", "lumbar flexion"], TURNS = ["thoracic rotation right", "lumbar lateral flexion right"];
const LIMB = ["shoulder.left flexion", "shoulder.left abduction", "elbow.left flexion", "hip.left flexion", "hip.left abduction", "knee.left flexion", "ankle.left dorsiflexion"];
const mirror = name => name.replace(".left", ".right");
/**
 * A phase's duration, s. A duration's lowest tenth is none, so a candidate may hand the body to the
 * stance at once: the placed squat held 0.05 s by the drive is past the stance's catch.
 */
const DURATION = [.03, 1.2], NONE = .1;
/** A pose phase's rate ceiling, rad/s, and activation. */
const TOP = [1, 20], ACTIVATION = [.1, 1];
/**
 * A bear phase's response time, s; the pelvis's pitch, rad; the place's offset toward the feet, m,
 * and height, a share of standing; the velocity asked toward the feet and up, m/s; a limb's share.
 */
const RESPONSE = [.08, .8], PITCH = [-.6, 1.6], TOWARD = [-.4, .4], HEIGHT = [.2, 1.05], ALONG = [-1.5, 1.5], UP = [-1, 2], SHARE = [0, 1];
/** Seed values of a phase's own settings. */
const POSE_SEED = { duration: .35, top: 4, activation: 1 };
const BEAR_SEED = { duration: .35, response: .35, pitch: .6, toward: 0, height: .6, along: 0, up: 0, shin: 0, hand: 0, foot: .5 };
/** How far a pose phase's goal may be from its posture before it asks the full rate, rad; a bear phase's servo, likewise. */
const WITHIN = .2;
/** How long a partial reading must hold to count, s; the speed of the centre of mass at which it counts nothing, m/s. */
const HELD = .1, STILL = .5;
const log = (u, [lo, hi]) => Math.exp(Math.log(lo) + Math.min(1, Math.max(0, u)) * (Math.log(hi) - Math.log(lo)));
const unlog = (v, [lo, hi]) => Math.min(1, Math.max(0, Math.log(v / lo) / Math.log(hi / lo)));
const lin = (u, [lo, hi]) => lo + Math.min(1, Math.max(0, u)) * (hi - lo);
const unlin = (v, [lo, hi]) => Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
const duration = u => u < NONE ? 0 : log((u - NONE) / (1 - NONE), DURATION);
const unduration = v => v <= 0 ? 0 : NONE + (1 - NONE) * unlog(v, DURATION);

/** Each phase kind's settings in the unit cube, after its channels: name, to value, from value. */
const SETTINGS = {
  pose: [["duration", duration, unduration], ["top", u => log(u, TOP), v => unlog(v, TOP)], ["activation", u => lin(u, ACTIVATION), v => unlin(v, ACTIVATION)]],
  bear: [["duration", duration, unduration], ["response", u => log(u, RESPONSE), v => unlog(v, RESPONSE)],
    ...[["pitch", PITCH], ["toward", TOWARD], ["height", HEIGHT], ["along", ALONG], ["up", UP], ["shin", SHARE], ["hand", SHARE], ["foot", SHARE]]
      .map(([name, span]) => [name, u => lin(u, span), v => unlin(v, span)])],
};

/** A posture by channel (the pose drive's values, bind included) for a seed name on `spec`. */
function seedPosture(spec, name) {
  const reference = humanSpec("workshop-fighter");
  const stored = id => {
    const held = poses.find(p => p.model === "workshop-fighter" && p.id === id);
    return Object.fromEntries(reference.joints.flatMap(j => j.dofs.map((d, k) => [`${j.name} ${d.positive}`, held.placement.joints[j.name][k] + d.bind.value])));
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

/** The searched channels of one phase, each a list of the channels it sets. */
function searched(move) {
  return MOVES[move].mirrored ? [...TRUNK.map(c => [c]), ...LIMB.map(c => [c, mirror(c)])]
    : [...TRUNK, ...TURNS].map(c => [c]).concat(LIMB.map(c => [c]), LIMB.map(c => [mirror(c)]));
}

/** A channel's range in the pose drive's values. */
function range(spec, channel) {
  const [joint, ...rest] = channel.split(" "), j = spec.joints.find(x => x.name === joint), d = j.dofs.find(x => x.positive === rest.join(" "));
  return [d.min.value + d.bind.value, d.max.value + d.bind.value];
}

/** A candidate's phases: each its kind, posture and settings. */
export function phases(move, spec, u) {
  const groups = searched(move);
  let at = 0;
  return MOVES[move].phases().map(phase => {
    const settings = SETTINGS[phase.kind], x = u.slice(at, at + groups.length + settings.length), posture = { ...seedPosture(spec, phase.seed) };
    at += groups.length + settings.length;
    groups.forEach((channels, i) => { const [lo, hi] = range(spec, channels[0]); for (const c of channels) posture[c] = lo + x[i] * (hi - lo); });
    return { kind: phase.kind, seed: phase.seed, posture, ...Object.fromEntries(settings.map(([name, to], i) => [name, to(x[groups.length + i])])) };
  });
}

/** The search's start: every phase at its seed. */
export function seedUnit(move, spec) {
  const groups = searched(move);
  return MOVES[move].phases().flatMap(phase => {
    const posture = seedPosture(spec, phase.seed);
    return [...groups.map(channels => unlin(posture[channels[0]], range(spec, channels[0]))), ...SETTINGS[phase.kind].map(([name, , from]) => from(phase.settings[name]))];
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

/** A bear phase's runner on `own`: the bearing solve of `plantUp`, its aims the phase's. */
function bearer(own, view) {
  const muscles = own.muscles, root = muscles.dynamics.root.segment, low = uprightness(own.built), made = riseLimbs(own);
  const kinds = own.spec.ends.map(limb => limb.name.split(".")[0]);
  const memory = { tasks: made.tasks, memory: made.limbs.map(limb => limb.memory), root: new Float64Array(6),
    helped: { force: new Vector3(), moment: new Vector3() }, held: { channels: [], z0: [], Z: [] },
    shortfall: { force: new Vector3(), moment: new Vector3() } };
  const solve = makeBearing(null, made.limbs, memory, { effort: true });
  const work = { place: new Vector3(), spin: new Vector3(), rootSpin: new Vector3(), turn: new Quaternion(), yaw: new Quaternion(), pitch: new Quaternion(),
    across: new Vector3(), right: new Vector3(1, 0, 0), toward: new Vector3(), moved: new Uint8Array(muscles.channels.length),
    aim: { centre: new Vector3(), spin: new Vector3() }, goal: new Float64Array(muscles.channels.length) };
  const orient = { heading: 0 };
  return {
    state: { memory, orient },
    /** Fixes the heading and the direction toward the feet from where the body is. */
    begin(g) {
      turnOfToRef(root, work.turn); work.across.set(1, 0, 0).applyRotationQuaternionToRef(work.turn, work.across);
      orient.heading = atan2(-work.across.z, work.across.x);
      const feet = ["foot.left", "foot.right"].map(name => own.built.segments.get(name).node.position);
      work.toward.set((feet[0].x + feet[1].x) / 2 - g.centre.x, 0, (feet[0].z + feet[1].z) / 2 - g.centre.z);
      const length = work.toward.length();
      if (length > 1e-6) work.toward.scaleInPlace(1 / length); else work.toward.set(0, 0, 1);
    },
    step(phase, g, dt) {
      for (let i = 0; i < muscles.channels.length; i++) {
        const c = muscles.channels[i], spec = c.dof.spec;
        work.goal[i] = Math.max(spec.min.value, Math.min(spec.max.value, (phase.posture[c.name] ?? 0) - spec.bind.value));
      }
      const ground = low.lowest(), n = 1 / phase.response;
      made.read(ground, true); work.place.setAll(0);
      let total = 0;
      for (let l = 0; l < made.limbs.length; l++) {
        const weight = phase[kinds[l]] ?? 0;
        if (weight > 0 && made.bear(l, work.goal, n, ground, weight, true)) { work.place.addInPlaceFromFloats(made.over[l].x * weight, 0, made.over[l].z * weight); total += weight; }
        else made.rest(l);
      }
      if (total > 0) work.place.scaleInPlace(1 / total); else work.place.set(g.centre.x, 0, g.centre.z);
      work.place.addInPlaceFromFloats(work.toward.x * phase.toward, 0, work.toward.z * phase.toward);
      const height = ground + view.standing * phase.height;
      work.aim.centre.set(n * n * (work.place.x - g.centre.x) + 2 * n * (work.toward.x * phase.along - g.velocity.x),
        n * n * (height - g.centre.y) + 2 * n * (phase.up - g.velocity.y),
        n * n * (work.place.z - g.centre.z) + 2 * n * (work.toward.z * phase.along - g.velocity.z));
      root.body.angularVelocityToRef(work.rootSpin);
      turnAboutToRef(Vector3.UpReadOnly, orient.heading, work.yaw);
      turnAboutToRef(work.right, phase.pitch, work.pitch);
      work.yaw.multiplyToRef(work.pitch, work.turn).multiplyInPlace(root.rest);
      spinBetweenToRef(root.node.rotationQuaternion, work.turn, phase.response, work.spin);
      work.aim.spin.copyFrom(work.spin).scaleInPlace(n).subtractInPlace(work.rootSpin.scaleInPlace(2 * n));
      const asked = servoAsk(muscles, i => work.goal[i], WITHIN, dt), lever = muscles.dynamics.root.centre[1] - ground;
      const carried = carryRoot(solve, muscles, asked, work.aim, lever);
      limbMotion(solve, asked, work.moved); servoSolve(muscles, asked, carried, work.moved); bearLimbs(solve, muscles, asked, lever, true);
    },
  };
}

/** One trial of `u` from `move`'s start at `seed`: its score, the hand-over and verified times from the start, s. */
export async function witnessTrial({ move, model = "workshop-fighter", held = "empty", seed, u, hold = 1, cap = 8, trace = false, steady = {} }) {
  const spec = bodySpec(model, held), placed = placement(move, spec, seed);
  if ("refused" in placed) return { score: 0, refused: placed.refused };
  const plan = phases(move, spec, u), handover = plan.reduce((s, p) => s + p.duration, 0);
  const engine = new NullEngine(), scene = new Scene(engine), world = createWorld(scene, await loadEngine("rapier"));
  world.physics.addFixedBox([0, -.5, 0], [40, 1, 40]);
  const built = buildBody(spec, world, placed);
  const reader = groundReading(built, world.dt);
  const control = { active: true, time: 0, phase: -1, steady: false, ready: 0, from: null };
  const body = commandedBody(built, world, { servoSeconds: .1, subs: [(own, view) => {
    const drive = poseDrive(own.muscles), bearing = bearer(own, view), steadying = crouchSteady(own, view, steady);
    control.steadying = steadying.control;
    return { name: `witness:${move}`, state: { control, bearing: bearing.state, steady: steadying.state }, wants: () => control.active, begin() {}, end() {},
      step(_senses, dt) {
        if (control.time < handover) {
          let at = control.time, k = 0;
          while (k < plan.length - 1 && at >= plan[k].duration) { at -= plan[k].duration; k++; }
          const phase = plan[k], g = view.ground ?? reader.read();
          if (phase.kind === "pose") drive(phase.posture, WITHIN, phase.top, phase.activation);
          else {
            if (control.phase < 0 || plan[control.phase].kind !== "bear") bearing.begin(g);
            bearing.step(phase, g, dt);
          }
          control.phase = k;
        } else {
          const first = !control.steady;
          control.steady = true;
          steadying.step(dt);
          if (first && process.env.HANDOVER) handoverState(steadying.control, view, seed);
          control.active = steadying.control.on;
        }
        control.time += dt;
      } };
  }] });
  body.drive(view => ({ posture: guardPosture(spec), pushes: [], stance: { feet: ["left", "right"], centre: null, height: view.standing - .03, heading: 0 } }));
  const measure = recoveryMeasurement(built, observeBody(built, body.muscles, world, clockSenses(world), { contactPatches: true }));
  const table = [], path = [], window = new Float64Array(Math.round(HELD / world.dt));
  let steps = 0, quiet = 0, verified = null, fell = false, progress = 0, last = "";
  try {
    while (world.time < cap + (verified === null ? 0 : hold) && (verified === null || world.time - verified < hold)) {
      world.step();
      const m = measure(), g = reader.read();
      if (process.env.TABLE && control.steady && steps % 6 === 0) table.push(traceRow(m, body, control.steadying, world));
      const feet = Math.min(1, g.footLoad[0] + g.footLoad[1]);
      window[steps++ % window.length] = feet * Math.min(1, g.height) * Math.max(0, g.upright) * Math.max(0, 1 - g.velocity.length() / STILL);
      if (steps >= window.length) progress = Math.max(progress, Math.min(...window));
      if (verified === null) { quiet = m.ready ? quiet + world.dt : 0; if (quiet + 1e-9 >= STAND_CHECK.quiet) verified = world.time; }
      else if (m.observation.down) { fell = true; break; }
      if (trace && g.raw !== last) { path.push([+world.time.toFixed(3), g.raw, +g.height.toFixed(2)]); last = g.raw; }
      if (verified === null && world.time > cap) break;
    }
  } finally { world.dispose(); scene.dispose(); engine.dispose(); }
  if (table.length) console.table(table);
  const score = verified !== null && !fell ? 2 + (cap - verified) / cap : verified !== null ? 1 + .5 * (cap - verified) / cap : .9 * progress;
  return { score, seed, handover: +handover.toFixed(3), verified: verified === null ? null : +verified.toFixed(3), fell, progress: +progress.toFixed(3),
    ...(trace ? { path } : {}) };
}

/** The body's state as the steady takes it over, to stderr: the centre of mass's lead over the feet's middle and its speeds, its height's share of standing. */
function handoverState(steady, view, seed) {
  const g = view.ground;
  console.error(JSON.stringify({ seed, position: g?.position ?? null, lead: +steady.lead.toFixed(3), height: +(steady.at / view.standing).toFixed(2), speed: g ? +g.velocity.length().toFixed(2) : null }));
}

/** A best candidate's phases as plain data, its postures left out. */
const described = (move, spec, u) => phases(move, spec, u).map(({ posture, ...rest }) => Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, typeof v === "number" ? +v.toFixed(3) : v])));

if (!isMainThread && workerData.harness === "rise-witness") {
  parentPort.on("message", async ({ id, x }) => {
    try { parentPort.postMessage({ id, r: await witnessTrial({ ...workerData, u: x }) }); }
    catch (error) { parentPort.postMessage({ id, r: { score: 0, error: String(error?.stack ?? error) } }); }
  });
} else if (process.argv[1]?.endsWith("rise-witness.mjs")) {
  const { values } = parseArgs({ options: { move: { type: "string" }, out: { type: "string" }, model: { type: "string" }, held: { type: "string" },
    generations: { type: "string" }, workers: { type: "string" }, sigma: { type: "string" }, replay: { type: "string" },
    seeds: { type: "string" }, hold: { type: "string" }, cap: { type: "string" }, steady: { type: "string" } } });
  const cap = Number(values.cap ?? 8);
  if (values.replay) {
    const best = JSON.parse(await readFile(values.replay, "utf8")), spec = bodySpec(best.model, best.held);
    for (const seed of acceptedSeeds(best.move, spec, Number(values.seeds ?? 4)))
      console.log(JSON.stringify(await witnessTrial({ move: best.move, model: best.model, held: best.held, seed, u: best.u, hold: Number(values.hold ?? 2), cap, trace: true, steady: JSON.parse(values.steady ?? "{}") })));
  } else {
    const move = values.move, model = values.model ?? "workshop-fighter", held = values.held ?? "empty";
    if (!MOVES[move]) throw new Error(`--move is one of ${Object.keys(MOVES).join(", ")}`);
    if (!values.out) throw new Error("--out names the search's files");
    const spec = bodySpec(model, held), [seed] = acceptedSeeds(move, spec, 1), start = seedUnit(move, spec);
    await mkdir(dirname(values.out), { recursive: true });
    const workers = Number(values.workers ?? Math.max(1, availableParallelism() - 4));
    const pool = workerPool(new URL(import.meta.url), { harness: "rise-witness", move, model, held, seed, cap }, workers), t0 = Date.now();
    try {
      const result = await cmaSearch({ n: start.length, start, sigma: Number(values.sigma ?? .15), lambda: workers, generations: Number(values.generations ?? 100), seed: 7,
        score: u => pool.evaluate(u),
        async onGeneration(entry, progress) {
          const seconds = Math.round((Date.now() - t0) / 1000);
          await writeFile(`${values.out}.best.json`, JSON.stringify({ move, model, held, seed, cap, ...progress.best, phases: described(move, spec, progress.best.u) }));
          await appendFile(`${values.out}.jsonl`, JSON.stringify({ ...entry, bestSoFar: +progress.best.score.toFixed(4), r: progress.best.r, s: seconds }) + "\n");
          console.log(JSON.stringify({ g: entry.g, best: entry.best, median: entry.median, sigma: entry.sigma, bestSoFar: +progress.best.score.toFixed(3),
            verified: progress.best.r.verified, handover: progress.best.r.handover, s: seconds }));
        } });
      console.log(JSON.stringify({ best: result.best.score, r: result.best.r }));
    } finally { await pool.terminate(); }
  }
}
