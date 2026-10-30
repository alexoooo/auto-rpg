/**
 * **Stand up's steady from a crouch** (`standUp`, `src/core/recovery/ground/stand-up.ts`): the body
 * placed in the Warrior's stored `squat` (its angles put on each body, seeds 1 up, refused draws
 * skipped), steadied by the stance as the steady steadies it (its own motor, `legs.resume`, the
 * stance's goal), handed back once `standReady` holds 0.1 s, the host's stance after; timed to
 * verified standing (`STAND_CHECK`). Node stand, core world, Rapier, 120 Hz, calm, no assist.
 *
 * The steady is `research/climb.mjs`'s; a variant changes it:
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
 * - `ramp`: `{ T, delay, d, lean, reach, Tp }`, the climb: for `delay` s the height held, the centre of
 *   mass asked `d` m ahead of the feet's middle and the trunk's flexion and the shoulders' raised by
 *   `lean` and `reach` rad, then the height to standing over `T` s (minimum jerk) as they are let
 *   go, the posture from the crouch's angles to the guard's over `Tp` s; with `tuning.ankleSpare`
 *   null the ankles' floor does not lift the plan;
 * - `keep`: s the steady holds the body past ready before it hands it back;
 * - `path`: `{ T, s, d, lean, reach, Tp, gate, slow, below, flat, stay, top, keepPitch }`, the planned
 *   climb: the centre of mass on a quintic from where it is, at its speed, to `top` (standing) over
 *   the feet's middle (`d` ahead) at rest over `T` s, the pelvis from its pitch to upright, the
 *   posture to the guard's over `Tp` s with `lean` and `reach` on the way, the feet planted
 *   (`StanceGoal.pose`, followed at `s` s); with `gate`, begun once both soles are flat and
 *   touching, the centre of mass over them, slower than `slow` and lower than `below` of standing;
 *   `stay` and `keepPitch` hold the centre of mass's place and the pelvis's pitch where they are.
 *
 *   node research/crouch-steady.mjs [--model workshop-fighter] [--held empty] [--variant '{"ease":0.5}'] [--seeds 8] [--trace <seed>]
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
import { createBody } from "../src/core/body.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { loadEngine } from "../src/core/engine/engines.ts";
import { humanSpec, humanoidSpec } from "../src/core/human/spec.ts";
import { armedWith } from "../src/core/items/held.ts";
import { guardPosture } from "../src/core/skills/guard/guard.ts";
import { createWorld } from "../src/core/world.ts";
import { recoveryMeasurement } from "../src/core/control/recovery-measurement.ts";
import { observeBody } from "../src/core/observation.ts";
import { clockSenses } from "../src/core/mind/senses.ts";
import { groundPlacement } from "../src/lab/ground-starts.ts";
import { STAND_CHECK } from "../src/lab/ground-mode.ts";
import { crouchSteady, traceRow } from "./climb.mjs";

/** The cap, and a failure's score, s. */
const CAP = 5, FAIL = 6;

const bodySpec = (model, held) => armedWith(humanoidSpec(model), "right", held);

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
  let control = null;
  const body = createBody(built, world, { servoSeconds: .1, subs: [(own, view) => {
    const steadying = crouchSteady(own, view, variant);
    control = steadying.control;
    return { name: "crouch steady", state: steadying.state, wants: () => control.on, begin() {}, end() {}, step: (_senses, dt) => steadying.step(dt) };
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
        rows.push(traceRow(m, body, control, world));
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

if (!isMainThread && workerData.harness === "crouch-steady") {
  parentPort.on("message", async ({ id, x }) => {
    try { const r = await steady({ model: workerData.model, held: workerData.held, seed: x.seed, variant: decode(x.u) }); parentPort.postMessage({ id, r: { t: r.verified ?? FAIL } }); }
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
    const pool = workerPool(new URL(import.meta.url), { harness: "crouch-steady", model, held }, Number(values.workers ?? Math.max(1, availableParallelism() - 4)));
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
