/**
 * **Stand up's steady from a crouch** (`standUp`, `src/core/mind/ground/stand-up.ts`): the body
 * placed in the Warrior's stored `squat` (its angles put on each body, seeds 1 up, refused draws
 * skipped), steadied by the stance as the steady steadies it (its own motor, `legs.resume`, the
 * stance's goal), handed back once `standReady` holds 0.1 s, the host's stance after; timed to
 * verified standing (`STAND_CHECK`). Node stand, core world, Rapier, 120 Hz, calm, no assist.
 *
 * A variant changes the steady:
 *
 * - `ease`: the posture eased from the crouch's angles to the guard's over `ease` s (smoothstep);
 * - `servo`, `tuning`: the steady's motor's servo time constant and stance settings (`StanceTuning`);
 * - `ahead`: `{ d, T }`, the centre of mass asked `d` m ahead of the feet's middle for `T` s;
 * - `fold`: `{ T, pitch, response, lumbar, thoracic }`, the stance's supported root pose
 *   (`StanceGoal.pose`) on the combat fold's schedule (`COMBAT_FOLD`), from the crouch's depth to
 *   none over `T` s;
 * - `lift`: `{ T, pitch, response }`, the supported root pose with every other joint held at the
 *   crouch's angles, the pelvis from `pitch` to upright and the height from the crouch's to the
 *   stance's over `T` s;
 * - `climb`: `{ T, kh, ka }`, no stance: every joint from the crouch's angle to the guard's over `T`
 *   s (minimum jerk), the hips' flexion and the ankles' dorsiflexion less `kh`, `ka` times the
 *   centre of mass's lead over the feet's middle (and 0.1 s of its velocity), then the stance.
 *
 *   node research/crouch-steady.mjs [--model workshop-fighter] [--held empty] [--variant '{"ease":.5}'] [--seeds 8] [--trace <seed>]
 *   node research/crouch-steady.mjs --search [--generations 40]
 *
 * `--search` is CMA-ES (`research/cma.mjs`) over `ease`, `servo` and the stance's time constants,
 * track and ankle spare, scored by the mean time to verified over the seeds, a body not verified
 * within 5 s counted at 6.
 */
import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import "../tests/harness/preload-data.mjs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import poses from "../assets/research/posture-holds.json" with { type: "json" };
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { loadEngine } from "../src/core/engine/engines.ts";
import { humanSpec, humanoidSpec } from "../src/core/human/spec.ts";
import { armedWith } from "../src/core/items/held.ts";
import { guardPosture } from "../src/core/skills/guard.ts";
import { createWorld } from "../src/core/world.ts";
import { recoveryMeasurement } from "../src/core/control/recovery-measurement.ts";
import { observeBody } from "../src/core/observation.ts";
import { clockSenses } from "../src/core/mind/senses.ts";
import { standReady } from "../src/core/mind/ground/reading.ts";
import { carrying } from "../src/core/control/motor.ts";
import { locomotion } from "../src/core/skills/locomotion.ts";
import { kitOf } from "../src/core/mind/kit.ts";
import { partLookup } from "../src/core/mind/catalog.ts";
import { PUNCHER } from "../src/core/mind/config.ts";
import { groundPlacement } from "../src/lab/ground-starts.ts";
import { STAND_CHECK } from "../src/lab/ground-mode.ts";

/** How long the steady waits on a ready body before it hands it back, s; the cap, and a failure's score, s. */
const READY = .1, CAP = 5, FAIL = 6;
/** The combat fold's lowering, m, and the stance's own, m. */
const FOLD = .5, LOWER = .03;

const bodySpec = (model, held) => armedWith(humanoidSpec(model), "right", held);
const smooth = u => u * u * (3 - 2 * u), jerk = u => u * u * u * (10 - 15 * u + 6 * u * u);

/** The Warrior's stored squat put on `spec` at `seed`, or why it is refused. */
export function placement(spec, seed) {
  const reference = humanSpec("workshop-fighter"), source = poses.find(p => p.model === "workshop-fighter" && p.id === "squat");
  const angles = Object.fromEntries(reference.joints.flatMap(j => j.dofs.map((d, k) => [`${j.name} ${d.positive}`, source.placement.joints[j.name][k] + d.bind.value])));
  const waypoint = { ...source.placement, joints: Object.fromEntries(spec.joints.map(j => [j.name, j.dofs.map(d => (angles[`${j.name} ${d.positive}`] ?? 0) - d.bind.value)])) };
  return groundPlacement(spec, { seed, ground: { start: "placed", posture: "squat", degrees: null, impulse: null, foe: 0, gusts: false } }, waypoint);
}

/** The first `count` seeds from 1 whose placement is accepted. */
export function acceptedSeeds(spec, count) {
  const seeds = [];
  for (let seed = 1; seeds.length < count && seed < 100; seed++) if (!("refused" in placement(spec, seed))) seeds.push(seed);
  return seeds;
}

/** One steady from the squat at `seed`: when the body is first at 95 % of standing height, handed back and verified, s. */
export async function steady({ model = "workshop-fighter", held = "empty", seed, variant = {}, trace = false }) {
  const spec = bodySpec(model, held), placed = placement(spec, seed);
  if ("refused" in placed) return { seed, refused: placed.refused };
  const engine = new NullEngine(), scene = new Scene(engine), world = createWorld(scene, await loadEngine("rapier"));
  world.physics.addFixedBox([0, -.5, 0], [40, 1, 40]);
  const built = buildBody(spec, world, placed);
  const control = { on: true, t0: null, from: null, mid: null, depth: null, height: null, climbed: false, ready: 0, handBack: null };
  const body = createBody(built, world, { servoSeconds: .1, subs: [(own, view) => {
    const kit = kitOf(partLookup, own.spec, PUNCHER), legs = locomotion(null);
    const motor = carrying(kit.motor(own.built, variant.servo ?? SERVO_SECONDS, kit.posture, variant.tuning, own.assist), ["stance"], "the crouch steady");
    const channels = own.muscles.channels;
    const blend = k => Object.fromEntries(channels.map((c, i) => [c.name, control.from[i] + ((kit.posture[c.name] ?? 0) - control.from[i]) * k]));
    const resume = () => { motor.stance.read(); legs.resume({ ...view, stance: motor.stance.reading }); };
    return { name: "crouch steady", state: { motor: motor.state, legs: legs.state, control }, wants: () => control.on, begin() {}, end() {},
      step(_senses, dt) {
        if (control.t0 === null) { control.t0 = view.time; control.from = channels.map((_, i) => own.muscles.angle(i)); resume(); }
        const t = view.time - control.t0;
        motor.stance.read();
        const r = motor.stance.reading, h = legs.heading, fx = Math.sin(h), fz = Math.cos(h);
        control.mid ??= [r.support.x, r.support.z];
        if (variant.ease) motor.setPosture(blend(smooth(Math.min(1, t / variant.ease))));
        let goal = legs.goal({ ...view, stance: r }, null, h, dt);
        if (goal && variant.ahead && t < variant.ahead.T)
          goal = { ...goal, centre: [control.mid[0] + variant.ahead.d * fx, control.mid[1] + variant.ahead.d * fz] };
        if (goal && variant.fold) {
          const f = variant.fold, span = FOLD - LOWER;
          control.depth ??= Math.max(0, Math.min(1, (legs.reference - LOWER - (r.centre.y - r.support.y)) / span));
          const u = Math.min(1, t / f.T), depth = control.depth * (1 - smooth(u));
          if (u < 1) {
            const pose = { ...kit.posture };
            pose["lumbar flexion"] = (pose["lumbar flexion"] ?? 0) + (f.lumbar ?? .89) * depth;
            pose["thoracic flexion"] = (pose["thoracic flexion"] ?? 0) + (f.thoracic ?? .368) * depth;
            motor.setPosture(pose);
            goal = { feet: ["left", "right"], centre: null, heading: h, height: legs.reference - LOWER - span * depth, pose: { pitch: (f.pitch ?? .9) * depth, seconds: f.response ?? .5 } };
          } else motor.setPosture(kit.posture);
        }
        if (goal && variant.lift) {
          const f = variant.lift, top = legs.reference - LOWER, u = Math.min(1, t / f.T), k = smooth(u);
          control.height ??= r.centre.y - r.support.y;
          if (u < 1) {
            motor.setPosture(blend(0));
            goal = { feet: ["left", "right"], centre: null, heading: h, height: control.height + (top - control.height) * k, pose: { pitch: f.pitch * (1 - k), seconds: f.response ?? .3 } };
          } else motor.setPosture(kit.posture);
        }
        if (variant.climb) {
          const f = variant.climb;
          if (t < f.T) {
            const lead = (r.centre.x - control.mid[0]) * fx + (r.centre.z - control.mid[1]) * fz + .1 * (r.velocity.x * fx + r.velocity.z * fz);
            const pose = blend(jerk(t / f.T));
            for (const c of channels) {
              if (/^hip\.(left|right) flexion$/.test(c.name)) pose[c.name] -= (f.kh ?? 0) * lead;
              if (/^ankle\.(left|right) dorsiflexion$/.test(c.name)) pose[c.name] -= (f.ka ?? 0) * lead;
              const d = c.dof.spec; pose[c.name] = Math.max(d.min.value, Math.min(d.max.value, pose[c.name]));
            }
            motor.setPosture(pose); goal = null;
          } else if (!control.climbed) {
            control.climbed = true; motor.setPosture(kit.posture); resume(); motor.stance.read();
            goal = legs.goal({ ...view, stance: motor.stance.reading }, null, legs.heading, dt);
          }
        }
        motor.setStance(goal);
        motor.control(own.muscles, dt);
        control.ready = standReady(view) ? control.ready + dt : 0;
        if (control.ready + 1e-9 >= READY) { control.on = false; control.handBack = view.time; }
      } };
  }] });
  body.drive(view => ({ posture: guardPosture(spec), pushes: [], stance: { feet: ["left", "right"], centre: null, height: view.standing - .03, heading: 0 } }));
  const measure = recoveryMeasurement(built, observeBody(built, body.muscles, world, clockSenses(world), { contactPatches: true }));
  const rows = [];
  let quiet = 0, verified = null, fell = false, climbed = null;
  try {
    while (world.time < CAP && (verified === null || world.time - verified < 1)) {
      world.step();
      const m = measure(), o = m.observation, height = o.centre[1] / body.view.standing;
      if (verified === null) { quiet = m.ready ? quiet + world.dt : 0; if (quiet + 1e-9 >= STAND_CHECK.quiet) verified = world.time; }
      else if (o.down) fell = true;
      if (climbed === null && height >= .95) climbed = world.time;
      if (trace && Math.round(world.time / world.dt) % 6 === 0) {
        const fastest = re => Math.max(0, ...o.segments.filter(s => re.test(s.name)).map(s => Math.hypot(...s.velocity)));
        rows.push({ t: +world.time.toFixed(2), height: +height.toFixed(2), pelvisUp: +m.rootUp.toFixed(2), arms: +fastest(/arm|hand/i).toFixed(2),
          trunk: +fastest(/trunk|head|neck/i).toFixed(2), legs: +fastest(/thigh|shank|foot/).toFixed(2), position: body.view.ground?.position ?? "-",
          ready: m.ready, handed: !control.on });
      }
    }
  } finally { world.dispose(); scene.dispose(); engine.dispose(); }
  return { seed, climbed, handBack: control.handBack, verified: fell ? null : verified, fell, ...(trace ? { rows } : {}) };
}

const SEARCH = { lg: (u, lo, hi) => Math.exp(Math.log(lo) + Math.min(1, Math.max(0, u)) * Math.log(hi / lo)), ul: (v, lo, hi) => Math.log(v / lo) / Math.log(hi / lo) };
/** A search point's variant: the stance's time constants, track and ankle spare, the servo's constant and the posture's ease. */
const decode = u => ({ ...(u[4] >= .02 ? { ease: Math.min(1, u[4]) } : {}), servo: SEARCH.lg(u[5], .04, .3),
  tuning: { seconds: { across: SEARCH.lg(u[0], .1, .8), height: SEARCH.lg(u[1], .06, .6), turn: SEARCH.lg(u[2], .06, .6), swing: .04 },
    track: SEARCH.lg(u[3], .08, .5), ankleSpare: SEARCH.lg(u[6], .005, .3) } });
/** The game's settings, the posture eased over 0.5 s. */
const START = [SEARCH.ul(.3, .1, .8), SEARCH.ul(.15, .06, .6), SEARCH.ul(.15, .06, .6), SEARCH.ul(.2, .08, .5), .5, SEARCH.ul(.1, .04, .3), SEARCH.ul(.01, .005, .3)];

if (!isMainThread) {
  parentPort.on("message", async ({ id, x }) => {
    try { const r = await steady({ ...workerData, seed: x.seed, variant: decode(x.u) }); parentPort.postMessage({ id, r: { t: r.verified ?? FAIL } }); }
    catch (error) { parentPort.postMessage({ id, r: { t: FAIL, error: String(error?.stack ?? error) } }); }
  });
} else if (process.argv[1]?.endsWith("crouch-steady.mjs")) {
  const { values } = parseArgs({ options: { model: { type: "string" }, held: { type: "string" }, variant: { type: "string" }, seeds: { type: "string" },
    trace: { type: "string" }, search: { type: "boolean" }, generations: { type: "string" }, workers: { type: "string" } } });
  const model = values.model ?? "workshop-fighter", held = values.held ?? "empty", variant = JSON.parse(values.variant ?? "{}");
  const seeds = acceptedSeeds(bodySpec(model, held), Number(values.seeds ?? 8));
  const fmt = v => v === null ? "-" : v.toFixed(2);
  if (values.trace) {
    const r = await steady({ model, held, seed: Number(values.trace), variant, trace: true });
    console.table(r.rows);
    console.log(`at 95 % ${fmt(r.climbed)} s, handed back ${fmt(r.handBack)} s, verified ${fmt(r.verified)} s${r.fell ? ", fell" : ""}`);
  } else if (values.search) {
    const { cmaSearch, workerPool } = await import("./cma.mjs");
    const pool = workerPool(new URL(import.meta.url), { model, held }, Number(values.workers ?? Math.max(1, availableParallelism() - 4)));
    const result = await cmaSearch({ n: START.length, start: START, sigma: .15, lambda: 12, generations: Number(values.generations ?? 40), seed: 7,
      score: async u => { const ts = await Promise.all(seeds.map(seed => pool.evaluate({ u, seed }).then(r => r.t))); return { score: -ts.reduce((a, b) => a + b, 0) / ts.length, ts }; },
      onGeneration: (entry, search) => console.log(`g${entry.g} mean ${(-entry.best).toFixed(2)} s, best so far ${(-search.best.score).toFixed(2)} s`) });
    await pool.terminate();
    console.log(JSON.stringify(decode(result.best.u)), result.best.r.ts.map(fmt).join(" "));
  } else {
    const rows = [];
    for (const seed of seeds) rows.push(await steady({ model, held, seed, variant }));
    const stood = rows.filter(r => r.verified !== null).map(r => r.verified).sort((a, b) => a - b), m = stood.length;
    const median = m ? (stood[(m - 1) >> 1] + stood[m >> 1]) / 2 : null;
    console.log(`${model} ${held} ${JSON.stringify(variant)}: stood ${m} of ${rows.length}, median ${fmt(median)} s; ${rows.map(r => `${r.seed}: ${fmt(r.verified)}`).join(", ")}`);
  }
}
