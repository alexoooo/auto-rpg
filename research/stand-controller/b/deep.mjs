/**
 * Fork B: what holds the statics' balanced deep squat on its feet. The squat placed direct on a body
 * with the ankle's dorsiflexion raised, each searched freedom turned by up to `jitter` rad a seed,
 * then one controller: `bear`, the bearing solve on the feet alone toward the squat's posture, pitch
 * and height (`toward` m the centre aimed ahead of the feet's middle); `stance`, the stance at the
 * placed height and pelvis pitch, the placed posture held. Every `every` s: the centre of mass's lead
 * over the feet's middle and the soles' reach either way along the feet, the pelvis's pitch, the
 * feet's load and flatness, the speed. Node stand, core world, Rapier, 120 Hz, calm, no assist.
 *
 *   node deep.mjs --variant dorsi0.8 --control bear|stance [--seeds 0-3] [--for 2] [--trace] [--response .3] [--toward 0] [--pitch <rad>]
 */
import "../../../tests/harness/preload-data.mjs";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { SERVO_SECONDS } from "../../../src/core/body.ts";
import { commandedBody } from "../../../src/core/mind/host.ts";
import { buildBody } from "../../../src/core/build/build-body.ts";
import { loadEngine } from "../../../src/core/engine/engines.ts";
import { armedWith } from "../../../src/core/items/held.ts";
import { createWorld } from "../../../src/core/world.ts";
import { addArenaSolids } from "../../../src/arena/room.ts";
import { carrying } from "../../../src/core/control/motor.ts";
import { kitOf } from "../../../src/core/mind/kit.ts";
import { partLookup } from "../../../src/entrants/game.ts";
import { PUNCHER } from "../../../src/entrants/classic/presets.ts";
import { groundReading, quietOnFeet } from "../../../src/core/control/ground-reading.ts";
import { recoveryMeasurement } from "../../../src/core/control/recovery-measurement.ts";
import { observeBody } from "../../../src/core/observation.ts";
import { clockSenses } from "../../../src/core/mind/senses.ts";
import { STAND_CHECK } from "../../../src/lab/ground-mode.ts";
import { staticBody, posed, placeLike } from "../../../research/core-posture-trials.mjs";
import { variantSpec, cappedSpec } from "../bodies.mjs";
import { phasedRun } from "../phased-rise.ts";

/** The statics' deep squat with the most margin on `from`: hands and feet, hands light, its centre under 0.4 m. */
export function deepSquat(variant, record = "../margin-workshop-fighter.json", from = variant, height = null) {
  const records = JSON.parse(readFileSync(new URL(record, import.meta.url), "utf8"));
  const mine = height === null ? records.filter((m) => m.variant === from && m.rec.row === "hands and feet, hands light" && m.rec.held && m.rec.height < .4)
    : records.filter((m) => m.variant === from && m.rec.row === `squat @ ${height.toFixed(2)} m` && m.rec.held);
  if (!mine.length) return null;
  return mine.reduce((a, b) => (b.rec.margin > a.rec.margin ? b : a)).rec;
}

export const jittered = (posture, seed, jitter) => {
  if (seed === 0) return posture;
  let a = seed * 2654435761 >>> 0;
  const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { ...posture, angles: posture.angles.map((v) => v + (u() * 2 - 1) * jitter) };
};

/** The pelvis's pitch, rad (as `handoff.mjs` reads it), the centre's lead over the soles' middle along the feet, the soles' reach ahead and behind, the speed along the feet. */
export function feetFrame(built, g) {
  const pelvis = built.segments.get("lowerTrunk"), up = new Vector3(0, 1, 0).applyRotationQuaternion(pelvis.node.rotationQuaternion.multiply(Quaternion.Inverse(pelvis.rest)));
  const fwd = new Vector3();
  for (const side of ["left", "right"]) { const f = built.segments.get(`foot.${side}`); fwd.addInPlace(new Vector3(0, 0, 1).applyRotationQuaternion(f.node.rotationQuaternion.multiply(Quaternion.Inverse(f.rest)))); }
  fwd.y = 0; fwd.normalize();
  const corners = g.soles.flatMap((s) => s.corners), mx = corners.reduce((a, c) => a + c.x, 0) / corners.length, mz = corners.reduce((a, c) => a + c.z, 0) / corners.length;
  const along = (x, z) => (x - mx) * fwd.x + (z - mz) * fwd.z, reach = corners.map((c) => along(c.x, c.z));
  return { pitch: Math.atan2(up.z, up.y), lead: along(g.centre.x, g.centre.z), front: Math.max(...reach), back: Math.min(...reach), vAlong: g.velocity.x * fwd.x + g.velocity.z * fwd.z, fwd };
}

/**
 * One trial from the placed squat. `after`, when given, takes over at `after.at` s: `after.step(own, view, clock, kit, g, dt, state)`,
 * writing `state.result` and `state.phase` as it goes; the trial then runs to `seconds` and reports what `after` wrote.
 */
export async function deepTrial({ variant = "dorsi0.8", control = "bear", seed = 0, jitter = .03, seconds = 2, response = .3, pitch = null, toward = 0, held = "empty", squat, every = .1, trace = false, after = null, onStep = null }) {
  const spec = armedWith(variantSpec("workshop-fighter", variant), "right", held);
  const engine = new NullEngine(), scene = new Scene(engine), world = createWorld(scene, await loadEngine("rapier"));
  addArenaSolids(world.physics);
  const built = buildBody(spec, world, { position: [0, 0, 0] });
  const posture = jittered(squat.posture, seed, jitter);
  let reader = null, run = null, motor = null, h0 = null, p0 = null, held0 = null;
  const state = { t: 0, phase: control, result: {} };
  const body = commandedBody(built, world, { servoSeconds: .1 }, [(own, view, clock) => {
    const kit = kitOf(partLookup, own.spec, PUNCHER);
    motor = carrying(kit.motor(own.built, SERVO_SECONDS, kit.posture, undefined, own.assist), ["stance"], "deep");
    const channels = own.muscles.channels;
    return { name: "deep", state: { motor: motor.state, state }, wants: () => state.phase !== "host", begin() {}, end() {},
      step(_s, dt) {
        reader ??= groundReading(own.built, dt);
        const g = reader.read();
        if (after && (state.handed || (state.t >= (after.at ?? 0) && (after.when ? after.when(g, state, dt) : true)))) {
          if (!state.handed) { state.handed = true; state.result.handedAt = +view.time.toFixed(2); }
          after.step(own, view, clock, kit, g, dt, state); state.t += dt; return;
        }
        if (control === "bear") {
          if (!run) {
            const phase = { kind: "bear", posture: squat.angles, duration: 100, response, pitch: pitch ?? squat.pitch, toward, height: squat.height / .98, along: 0, up: 0, shin: 0, hand: 0, foot: .5 };
            run = phasedRun(own, view, { from: "fours", phases: [phase], hold: phase }, () => true); run.begin("left");
          }
          run.step(g, null, dt);
        } else {
          if (h0 === null) { motor.stance.read(); h0 = motor.stance.reading.centre.y - motor.stance.reading.support.y; p0 = feetFrame(own.built, g).pitch;
            held0 = Object.fromEntries(channels.map((c, i) => [c.name, own.muscles.angle(i) + c.dof.spec.bind.value])); }
          motor.setPosture(held0); motor.stance.read();
          motor.setStance({ feet: ["left", "right"], centre: null, heading: 0, height: h0, pose: { pitch: pitch ?? p0, seconds: .3 } });
          motor.control(own.muscles, dt);
        }
        state.t += dt;
      } };
  }]);
  body.setLevel("held");
  const statical = await staticBody(cappedSpec(variantSpec("workshop-fighter", variant)));
  posed(statical, posture); placeLike(statical, built, .002); statical.dispose();
  body.setLevel("full");
  body.drive((view) => ({ posture: {}, pushes: [], stance: { feet: ["left", "right"], centre: null, height: view.standing - .03, heading: 0 } }));
  const rows = [];
  const measure = after ? recoveryMeasurement(built, observeBody(built, body.muscles, world, clockSenses(world), { contactPatches: true })) : null;
  let quiet = 0, quietAt = null, lostAt = null, steps = 0, standQuiet = 0, verified = null, fell = false;
  const n = Math.max(1, Math.round(every / world.dt));
  try {
    while (world.time < seconds) {
      world.step(); steps++;
      const m = measure?.();
      const g = reader?.read(); if (!g) continue;
      if (m && state.handed) { if (verified === null) { standQuiet = m.ready ? standQuiet + world.dt : 0; if (standQuiet + 1e-9 >= STAND_CHECK.quiet) verified = world.time; }
        else if (m.observation.down) { fell = true; break; } else if (world.time - verified >= 1) break; }
      if (onStep && onStep(world, g, built, state) === "stop") break;
      const feet = g.footLoad[0] + g.footLoad[1];
      if (lostAt === null && (feet < .5 || !(g.flat[0] || g.flat[1]))) lostAt = world.time;
      quiet = quietOnFeet(g) ? quiet + world.dt : 0; if (quietAt === null && quiet >= .1) quietAt = world.time;
      if (trace && steps % n === 0) { const f = feetFrame(built, g); rows.push({ t: +world.time.toFixed(2), ph: state.phase, h: +g.centre.y.toFixed(3), feet: +feet.toFixed(2), flat: `${+g.flat[0]}${+g.flat[1]}`,
        lead: +f.lead.toFixed(3), front: +f.front.toFixed(3), back: +f.back.toFixed(3), vAlong: +f.vAlong.toFixed(2), v: +g.velocity.length().toFixed(2), pitch: +f.pitch.toFixed(2) }); }
    }
  } finally { body.dispose?.(); world.dispose(); scene.dispose(); engine.dispose(); }
  return { seed, lostAt: lostAt === null ? null : +lostAt.toFixed(2), quietAt: quietAt === null ? null : +quietAt.toFixed(2), ...(after ? { verified: verified === null || fell ? null : +verified.toFixed(2), fell } : {}), ...state.result, ...(trace ? { rows } : {}) };
}

if (process.argv[1]?.endsWith("deep.mjs")) {
  const { values } = parseArgs({ options: { variant: { type: "string" }, control: { type: "string" }, seeds: { type: "string" }, for: { type: "string" }, trace: { type: "boolean" },
    response: { type: "string" }, pitch: { type: "string" }, toward: { type: "string" }, from: { type: "string" }, squat: { type: "string" }, posture: { type: "string" } } });
  const variant = values.variant ?? "dorsi0.8";
  const squat = values.posture ? JSON.parse(readFileSync(values.posture, "utf8")).rec : values.squat ? deepSquat(variant, "./squat-workshop-fighter.json", values.from ?? variant, Number(values.squat)) : deepSquat(variant, undefined, values.from ?? variant);
  console.log(`squat: margin ${squat.margin}, centre ${squat.height}, pitch ${squat.pitch}, share ${squat.share}`);
  const [lo, hi] = (values.seeds ?? "0-3").split("-").map(Number);
  for (let seed = lo; seed <= hi; seed++) {
    const out = await deepTrial({ variant, control: values.control ?? "bear", seed, seconds: Number(values.for ?? 2), response: Number(values.response ?? .3),
      pitch: values.pitch === undefined ? null : Number(values.pitch), toward: Number(values.toward ?? 0), squat, trace: values.trace });
    if (out.rows) console.table(out.rows);
    const { rows: _r, ...rest } = out; console.log(JSON.stringify(rest));
  }
}
