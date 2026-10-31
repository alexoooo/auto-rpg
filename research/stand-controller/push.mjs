/**
 * The push version of the hand-off: from hands and knees, bear phases (the bearing solve, as the
 * push-off witness's) push the weight back over the feet; then the bridge: the stance takes the
 * body as it is, its posture eased to the combat fold's, its height toward `rise` of standing and
 * its pelvis toward `pitch`; once quiet on both flat feet in a crouch for 0.1 s, Stand up (step-up's
 * steady and climb) takes it. Node stand, core world, Rapier, 120 Hz, calm, no assist.
 *
 *   node push.mjs [--model workshop-fighter] [--held empty] [--seeds 1-4] [--phases 3] [--ease .8] [--rise .75] [--pitch .8] [--trace]
 */
import "../../tests/harness/preload-data.mjs";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { SERVO_SECONDS } from "../../src/core/body.ts";
import { commandedBody } from "../../src/core/mind/host.ts";
import { buildBody } from "../../src/core/build/build-body.ts";
import { loadEngine } from "../../src/core/engine/engines.ts";
import { armedWith } from "../../src/core/items/held.ts";
import { humanoidSpec } from "../../src/core/human/spec.ts";
import { createWorld } from "../../src/core/world.ts";
import { recoveryMeasurement } from "../../src/core/control/recovery-measurement.ts";
import { observeBody } from "../../src/core/observation.ts";
import { clockSenses } from "../../src/core/mind/senses.ts";
import { carrying } from "../../src/core/control/motor.ts";
import { kitOf } from "../../src/core/mind/kit.ts";
import { partLookup } from "../../src/entrants/game.ts";
import { PUNCHER } from "../../src/entrants/classic/presets.ts";
import { STAND_CHECK } from "../../src/lab/ground-mode.ts";
import { standUp } from "../../src/core/recovery/ground/stand-up.ts";
import { groundReading, quietOnFeet } from "../../src/core/control/ground-reading.ts";
import { phases as witnessPhases, placement, acceptedSeeds } from "../../research/rise-witness.mjs";
import { phasedRun } from "./phased-rise.ts";

/** The combat fold's pitch and spine (`COMBAT_FOLD`); how long a crouch must read quiet before the climb, s; the trial's cap, s. */
const FOLD = { lumbar: .89, thoracic: .368 }, QUIET = .1, CAP = 8;
const smooth = (u) => u * u * (3 - 2 * u);

/**
 * One trial: `plan` the bear phases (each as `phasedRun` takes them), `bridge` the stance's ease
 * `{ ease, rise, pitch, after }` (`after`: the bridge's seconds before the climb may be asked).
 */
export async function pushTrial({ model = "workshop-fighter", held = "empty", seed, plan, bridge, trace = false, cap = CAP }) {
  const spec = armedWith(humanoidSpec(model), "right", held), placed = placement("push-off-bear", spec, seed);
  if ("refused" in placed) return { seed, refused: placed.refused };
  const engine = new NullEngine(), scene = new Scene(engine), world = createWorld(scene, await loadEngine("rapier"));
  world.physics.addFixedBox([0, -.5, 0], [40, 1, 40]);
  const built = buildBody(spec, world, placed);
  const timed = plan.reduce((s, p) => s + p.duration, 0);
  const control = { phase: plan.length ? "push" : "bridge", pushEnd: null, bridgeAt: null, quiet: 0, climbAt: null, handBack: null, failed: null, log: null };
  let reader = null;
  const body = commandedBody(built, world, { servoSeconds: .1 }, [(own, view, clock) => {
    const kit = kitOf(partLookup, own.spec, PUNCHER);
    const motor = carrying(kit.motor(own.built, SERVO_SECONDS, kit.posture, undefined, own.assist), ["stance"], "the push");
    const channels = own.muscles.channels;
    const clamp = (c, v) => Math.max(c.dof.spec.min.value + c.dof.spec.bind.value, Math.min(c.dof.spec.max.value + c.dof.spec.bind.value, v));
    const fold = Object.fromEntries(channels.map((c) => [c.name, kit.posture[c.name] ?? 0]));
    fold["lumbar flexion"] = clamp(channels.find((c) => c.name === "lumbar flexion"), fold["lumbar flexion"] + FOLD.lumbar);
    fold["thoracic flexion"] = clamp(channels.find((c) => c.name === "thoracic flexion"), fold["thoracic flexion"] + FOLD.thoracic);
    let from = null, t0 = null, h0 = null, p0 = null, stand = null, run = null;
    return { name: "push", state: { motor: motor.state, control }, wants: () => control.phase !== "done", begin() {}, end() {},
      step(_senses, dt) {
        reader ??= groundReading(own.built, dt);
        const g = reader.read();
        if (control.phase === "push") {
          if (!run) { run = phasedRun(own, view, { from: "fours", phases: plan, hold: plan.at(-1) }, () => true); run.begin("left"); }
          run.step(g, null, dt);
          if (run.state.elapsed + 1e-9 >= timed) {
            control.phase = "bridge";
            control.pushEnd = { t: +view.time.toFixed(2), feet: +(g.footLoad[0] + g.footLoad[1]).toFixed(2), flat: `${+g.flat[0]}${+g.flat[1]}`, v: +g.velocity.length().toFixed(2), h: +g.height.toFixed(2), pos: g.raw };
          }
          return;
        }
        if (control.phase === "climb") {
          if (!stand) { stand = standUp(own, view, clock, { kind: "stand-up", techniques: [{ kind: "step-up" }] }, kit); stand.begin(); control.climbAt = view.time; }
          stand.step(null, dt);
          if (!stand.state.active) { control.phase = "done"; control.handBack = view.time; control.log = stand.state.log.slice(-4); }
          return;
        }
        if (t0 === null) {
          t0 = view.time; control.bridgeAt = view.time;
          from = Object.fromEntries(channels.map((c, i) => [c.name, own.muscles.angle(i) + c.dof.spec.bind.value]));
          motor.stance.read(); h0 = motor.stance.reading.centre.y - motor.stance.reading.support.y;
          const pelvis = own.built.segments.get("lowerTrunk"), up = new Vector3(0, 1, 0).applyRotationQuaternion(pelvis.node.rotationQuaternion.multiply(Quaternion.Inverse(pelvis.rest)));
          p0 = Math.atan2(up.z, up.y);
        }
        const t = view.time - t0, k = smooth(Math.min(1, t / bridge.ease));
        motor.setPosture(Object.fromEntries(channels.map((c) => [c.name, from[c.name] + (fold[c.name] - from[c.name]) * k])));
        motor.stance.read();
        motor.setStance({ feet: ["left", "right"], centre: null, heading: 0, height: h0 + (bridge.rise * view.standing - h0) * k, pose: { pitch: p0 + (bridge.pitch - p0) * k, seconds: .3 } });
        motor.control(own.muscles, dt);
        control.quiet = quietOnFeet(g) && g.height < .9 ? control.quiet + dt : 0;
        if (control.quiet + 1e-9 >= QUIET && t >= (bridge.after ?? 0)) control.phase = "climb";
        else if (t > 3) control.phase = "done";
      } };
  }]);
  body.drive((view) => ({ posture: {}, pushes: [], stance: { feet: ["left", "right"], centre: null, height: view.standing - .03, heading: 0 } }));
  const measure = recoveryMeasurement(built, observeBody(built, body.muscles, world, clockSenses(world), { contactPatches: true }));
  const rows = [];
  let quiet = 0, verified = null, fell = false, steps = 0, progress = 0;
  // Short of verified, the best held 0.1 s of the soles' share of the weight, both soles flat, stillness (none at 0.5 m/s) and height.
  const window = new Float64Array(12);
  try {
    while (world.time < cap && (verified === null || world.time - verified < 1)) {
      world.step(); steps++;
      const m = measure();
      if (reader) { const g = reader.read(); window[steps % 12] = Math.min(1, g.footLoad[0] + g.footLoad[1]) * (g.flat[0] && g.flat[1] ? 1 : .3) * Math.max(0, 1 - g.velocity.length() / .5) * (.5 + .5 * Math.min(1, g.height) * Math.max(0, g.upright));
        if (steps >= 12) progress = Math.max(progress, Math.min(...window)); }
      if (verified === null && (control.phase === "climb" || control.phase === "done")) { quiet = m.ready ? quiet + world.dt : 0; if (quiet + 1e-9 >= STAND_CHECK.quiet) verified = world.time; }
      if (verified !== null && m.observation.down) { fell = true; break; }
      if (control.phase === "done" && verified === null && control.handBack === null) break;
      if (trace && steps % 6 === 0) {
        const g = reader?.read();
        rows.push({ t: +world.time.toFixed(2), phase: control.phase, pos: g?.raw, h: g ? +g.height.toFixed(2) : null, feet: g ? +(g.footLoad[0] + g.footLoad[1]).toFixed(2) : null,
          flat: g ? `${+g.flat[0]}${+g.flat[1]}` : "", v: g ? +g.velocity.length().toFixed(2) : null, up: +m.rootUp.toFixed(2) });
      }
    }
  } finally { body.dispose?.(); world.dispose(); scene.dispose(); engine.dispose(); }
  const r = (v) => (v === null || v === undefined ? null : +v.toFixed(2));
  const score = verified !== null && !fell ? 2 + (cap - verified) / cap : verified !== null ? 1 + .5 * (cap - verified) / cap : .9 * progress + (control.climbAt !== null ? .1 : 0);
  return { seed, score, progress: +progress.toFixed(3), pushEnd: control.pushEnd, climbAt: r(control.climbAt), handBack: r(control.handBack), verified: fell ? null : r(verified), fell, ...(trace ? { rows } : {}) };
}

if (process.argv[1]?.endsWith("push.mjs")) {
  const { values } = parseArgs({ options: { model: { type: "string" }, held: { type: "string" }, seeds: { type: "string" }, phases: { type: "string" },
    ease: { type: "string" }, rise: { type: "string" }, pitch: { type: "string" }, after: { type: "string" }, trace: { type: "boolean" }, witness: { type: "string" } } });
  const model = values.model ?? "workshop-fighter", held = values.held ?? "empty";
  const spec = armedWith(humanoidSpec(model), "right", held);
  const witness = JSON.parse(readFileSync(values.witness ?? "../../assets/research/rise-witness/push-off-bear.json", "utf8"));
  const plan = witnessPhases("push-off-bear", spec, witness.u).slice(0, Number(values.phases ?? 3));
  const bridge = { ease: Number(values.ease ?? .8), rise: Number(values.rise ?? .75), pitch: Number(values.pitch ?? .8), after: Number(values.after ?? 0) };
  const [lo, hi] = (values.seeds ?? "1-4").split("-").map(Number);
  for (const seed of acceptedSeeds("push-off-bear", spec, hi).filter((s, i) => i + 1 >= lo)) {
    const out = await pushTrial({ model, held, seed, plan, bridge, trace: values.trace });
    if (out.rows) console.table(out.rows);
    const { rows: _r, ...rest } = out;
    console.log(JSON.stringify(rest));
  }
}
