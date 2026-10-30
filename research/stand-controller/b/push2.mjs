/**
 * Fork B: the push into the deep squat. From the placed hands-and-knees start (`placement`, the
 * push-off witness's), the transition: the witness's first three bear phases (`research/rise-witness.mjs`'s
 * encoding, searched; a phase's lowest tenth of duration none), then the fixed hold: the bearing solve
 * on the feet alone toward the arms-forward deep squat (its posture, pelvis pitch and height), and once
 * quiet on flat feet 0.1 s, Stand up's climb (`climbAfter`); verified as the target verifies
 * (`STAND_CHECK`). Node stand, core world, Rapier, 120 Hz, calm, no assist.
 *
 *   node push2.mjs --out runs/p1 [--variant dorsi0.8] [--posture <squat json>] [--seeds 4] [--generations 60] [--workers 14]
 *   node push2.mjs --replay runs/p1.best.json [--seeds 8] [--trace]
 */
import "../../../tests/harness/preload-data.mjs";
import { parentPort, isMainThread, workerData } from "node:worker_threads";
import { readFileSync } from "node:fs";
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createBody, SERVO_SECONDS } from "../../../src/core/body.ts";
import { buildBody } from "../../../src/core/build/build-body.ts";
import { loadEngine } from "../../../src/core/engine/engines.ts";
import { armedWith } from "../../../src/core/items/held.ts";
import { createWorld } from "../../../src/core/world.ts";
import { kitOf } from "../../../src/core/mind/kit.ts";
import { partLookup } from "../../../src/entrants/game.ts";
import { PUNCHER } from "../../../src/core/mind/config.ts";
import { STAND_CHECK } from "../../../src/lab/ground-mode.ts";
import { standUp } from "../../../src/core/mind/ground/stand-up.ts";
import { groundReading, quietOnFeet } from "../../../src/core/mind/ground/reading.ts";
import { recoveryMeasurement } from "../../../src/core/control/recovery-measurement.ts";
import { observeBody } from "../../../src/core/observation.ts";
import { clockSenses } from "../../../src/core/mind/senses.ts";
import { cmaSearch, workerPool } from "../../../research/cma.mjs";
import { phases as witnessPhases, placement, acceptedSeeds } from "../../../research/rise-witness.mjs";
import { variantSpec } from "../bodies.mjs";
import { phasedRun } from "../phased-rise.ts";

const CAP = 8, QUIET = .1, HOLD_LIMIT = 2.5, STEPS = 3, PER = 19;
const specOf = (variant, held) => armedWith(variantSpec("workshop-fighter", variant), "right", held);

/** The candidate's transition: the witness's first `STEPS` phases from `u`, those of no duration left out. */
export function transition(spec, u) {
  const full = [...u.slice(0, STEPS * PER), ...Array(PER).fill(0)];
  return witnessPhases("push-off-bear", spec, full).slice(0, STEPS).filter((p) => p.duration > 0);
}

export async function push2Trial({ variant = "dorsi0.8", held = "empty", seed, plan, squat, trace = false, cap = CAP }) {
  const spec = specOf(variant, held), placed = placement("push-off-bear", spec, seed);
  if ("refused" in placed) return { seed, score: 0, refused: placed.refused };
  const engine = new NullEngine(), scene = new Scene(engine), world = createWorld(scene, await loadEngine("rapier"));
  world.physics.addFixedBox([0, -.5, 0], [40, 1, 40]);
  const built = buildBody(spec, world, placed);
  const timed = plan.reduce((s, p) => s + p.duration, 0);
  const hold = { kind: "bear", posture: squat.angles, duration: 100, response: .3, pitch: squat.pitch, toward: 0, height: squat.height / .98, along: 0, up: 0, shin: 0, hand: 0, foot: .5 };
  const c = { phase: plan.length ? "push" : "hold", pushEnd: null, holdAt: null, q: 0, climbAt: null, handBack: null, failed: null };
  let reader = null;
  const body = createBody(built, world, { servoSeconds: .1, subs: [(own, view, clock) => {
    const kit = kitOf(partLookup, own.spec, PUNCHER);
    let run = null, holding = null, stand = null;
    return { name: "push2", state: { c }, wants: () => c.phase !== "host" && c.phase !== "failed", begin() {}, end() {},
      step(_s, dt) {
        reader ??= groundReading(own.built, dt);
        const g = reader.read();
        if (c.phase === "push") {
          if (!run) { run = phasedRun(own, view, { from: "fours", phases: plan, hold: plan.at(-1) }, () => true); run.begin("left"); }
          run.step(g, null, dt);
          if (run.state.elapsed + 1e-9 >= timed) { c.phase = "hold"; c.pushEnd = { t: +view.time.toFixed(2), feet: +(g.footLoad[0] + g.footLoad[1]).toFixed(2), flat: `${+g.flat[0]}${+g.flat[1]}`, h: +g.height.toFixed(2), v: +g.velocity.length().toFixed(2) }; }
          return;
        }
        if (c.phase === "hold") {
          if (!holding) { holding = phasedRun(own, view, { from: "fours", phases: [hold], hold }, () => true); holding.begin("left"); c.holdAt = view.time; }
          holding.step(g, null, dt);
          c.q = quietOnFeet(g) && g.height < .9 ? c.q + dt : 0;
          if (c.q + 1e-9 >= QUIET) c.phase = "climb";
          else if (view.time - c.holdAt > HOLD_LIMIT) c.phase = "failed";
          return;
        }
        if (c.phase === "climb") {
          if (!stand) { stand = standUp(own, view, clock, { kind: "stand-up", techniques: [{ kind: "step-up" }] }, kit); stand.begin(); c.climbAt = view.time; }
          if (stand.state.active) stand.step(null, dt); else { c.phase = "host"; c.handBack = view.time; }
        }
      } };
  }] });
  body.drive((view) => ({ posture: {}, pushes: [], stance: { feet: ["left", "right"], centre: null, height: view.standing - .03, heading: 0 } }));
  const measure = recoveryMeasurement(built, observeBody(built, body.muscles, world, clockSenses(world), { contactPatches: true }));
  const rows = [], window = new Float64Array(12);
  let quiet = 0, verified = null, fell = false, steps = 0, progress = 0;
  try {
    while (world.time < cap && (verified === null || world.time - verified < 1)) {
      world.step(); steps++;
      const m = measure(), g = reader?.read();
      if (g) { window[steps % 12] = Math.min(1, g.footLoad[0] + g.footLoad[1]) * (g.flat[0] && g.flat[1] ? 1 : .3) * Math.max(0, 1 - g.velocity.length() / .5); if (steps >= 12) progress = Math.max(progress, Math.min(...window)); }
      if (c.phase === "climb" || c.phase === "host") { if (verified === null) { quiet = m.ready ? quiet + world.dt : 0; if (quiet + 1e-9 >= STAND_CHECK.quiet) verified = world.time; } else if (m.observation.down) { fell = true; break; } }
      if (c.phase === "failed") break;
      if (trace && steps % 12 === 0 && g) rows.push({ t: +world.time.toFixed(2), ph: c.phase, pos: g.raw, h: +g.height.toFixed(2), feet: +(g.footLoad[0] + g.footLoad[1]).toFixed(2), flat: `${+g.flat[0]}${+g.flat[1]}`, v: +g.velocity.length().toFixed(2), up: +g.upright.toFixed(2) });
    }
  } finally { body.dispose?.(); world.dispose(); scene.dispose(); engine.dispose(); }
  const r2 = (v) => (v === null ? null : +v.toFixed(2));
  const score = verified !== null && !fell ? 2 + (cap - verified) / cap : verified !== null ? 1 : .8 * progress + (c.climbAt !== null ? .2 : 0);
  return { seed, score, progress: +progress.toFixed(3), pushEnd: c.pushEnd, climbAt: r2(c.climbAt), verified: fell ? null : r2(verified), fell, ...(trace ? { rows } : {}) };
}

async function candidate({ variant, held, seeds, squat, u }) {
  const plan = transition(specOf(variant, held), u), rows = [];
  for (const seed of seeds) rows.push(await push2Trial({ variant, held, seed, plan, squat }));
  return { score: rows.reduce((s, r) => s + r.score, 0) / rows.length, stood: rows.filter((r) => r.verified !== null).length, times: rows.map((r) => r.verified), climbs: rows.filter((r) => r.climbAt !== null).length };
}

if (!isMainThread && workerData?.harness === "push2") {
  parentPort.on("message", async ({ id, x }) => {
    try { parentPort.postMessage({ id, r: await candidate({ ...workerData, u: x }) }); }
    catch (error) { parentPort.postMessage({ id, r: { score: 0, error: String(error?.stack ?? error) } }); }
  });
} else if (process.argv[1]?.endsWith("push2.mjs")) {
  const { values } = parseArgs({ options: { out: { type: "string" }, variant: { type: "string" }, held: { type: "string" }, posture: { type: "string" }, seeds: { type: "string" },
    generations: { type: "string" }, workers: { type: "string" }, sigma: { type: "string" }, replay: { type: "string" }, trace: { type: "boolean" } } });
  if (values.replay) {
    const best = JSON.parse(readFileSync(values.replay, "utf8")), spec = specOf(best.variant, best.held), plan = transition(spec, best.u);
    console.log(JSON.stringify(plan.map(({ posture, ...p }) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === "number" ? +v.toFixed(2) : v])))));
    for (const seed of acceptedSeeds("push-off-bear", spec, Number(values.seeds ?? 8))) {
      const out = await push2Trial({ variant: best.variant, held: values.held ?? best.held, seed, plan, squat: best.squat, trace: values.trace });
      if (out.rows) console.table(out.rows);
      const { rows: _r, ...rest } = out; console.log(JSON.stringify(rest));
    }
  } else {
    const variant = values.variant ?? "dorsi0.8", held = values.held ?? "empty", spec = specOf(variant, held);
    const squat = JSON.parse(readFileSync(values.posture ?? `posture-${variant}-0.45-arms_to_1.5.json`, "utf8")).rec;
    const seeds = acceptedSeeds("push-off-bear", spec, Number(values.seeds ?? 4));
    const witness = JSON.parse(readFileSync(new URL("../../../assets/research/rise-witness/push-off-bear.json", import.meta.url), "utf8"));
    const start = witness.u.slice(0, STEPS * PER);
    await mkdir(dirname(values.out), { recursive: true });
    const workers = Number(values.workers ?? 14), t0 = Date.now();
    const pool = workerPool(new URL(import.meta.url), { harness: "push2", variant, held, seeds, squat }, workers);
    try {
      const result = await cmaSearch({ n: start.length, start, sigma: Number(values.sigma ?? .15), lambda: workers, generations: Number(values.generations ?? 60), seed: 13,
        score: (u) => pool.evaluate(u),
        async onGeneration(entry, progress) {
          const s = Math.round((Date.now() - t0) / 1000);
          await writeFile(`${values.out}.best.json`, JSON.stringify({ variant, held, seeds, squat, ...progress.best }));
          await appendFile(`${values.out}.jsonl`, JSON.stringify({ ...entry, bestSoFar: progress.best.score, r: progress.best.r, s }) + "\n");
          console.log(JSON.stringify({ g: entry.g, best: +entry.best.toFixed(3), median: +entry.median.toFixed(3), bestSoFar: +progress.best.score.toFixed(3), stood: progress.best.r.stood, times: progress.best.r.times, climbs: progress.best.r.climbs, s }));
        } });
      console.log(JSON.stringify({ best: result.best.score, r: result.best.r }));
    } finally { await pool.terminate(); }
  }
}
