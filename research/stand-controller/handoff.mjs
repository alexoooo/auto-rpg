/**
 * The hand-off on the world: a body placed in a statics witness (hands touching, the soles bearing),
 * held on its feet by the stance (its pelvis pitch and height kept, its posture eased to the combat
 * fold's), then given to the game's Stand up once quiet on both flat feet in a crouch, where its
 * climb begins. Node stand, core world, Rapier, 120 Hz, calm, no assist.
 *
 *   node handoff.mjs --record statics-workshop-fighter.json --variant built --row 'squat, hands light @ 0.70 m' [--held empty] [--seeds 1-4] [--ease .6] [--trace]
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
import { jointAngles } from "../../src/core/build/joint-state.ts";
import { loadEngine } from "../../src/core/engine/engines.ts";
import { armedWith } from "../../src/core/items/held.ts";
import { createWorld } from "../../src/core/world.ts";
import { addArenaSolids } from "../../src/arena/room.ts";
import { recoveryMeasurement } from "../../src/core/control/recovery-measurement.ts";
import { observeBody } from "../../src/core/observation.ts";
import { clockSenses } from "../../src/core/mind/senses.ts";
import { carrying } from "../../src/core/control/motor.ts";
import { kitOf } from "../../src/core/mind/kit.ts";
import { partLookup } from "../../src/entrants/game.ts";
import { PUNCHER } from "../../src/entrants/classic/presets.ts";
import { STAND_CHECK } from "../../src/lab/ground-mode.ts";
import { groundPlacement } from "../../src/lab/ground-starts.ts";
import { standUp } from "../../src/core/recovery/ground/stand-up.ts";
import { groundReading, quietOnFeet } from "../../src/core/recovery/ground/reading.ts";
import { staticBody, posed, placeLike } from "../../research/core-posture-trials.mjs";
import { variantSpec, cappedSpec } from "./bodies.mjs";
import { phasedRun } from "./phased-rise.ts";

/** The combat fold's pitch and spine (`COMBAT_FOLD`), and how long a crouch must read quiet before the climb is asked, s. */
const FOLD = { pitch: .9, lumbar: .89, thoracic: .368 }, QUIET = .1, CAP = 8;
const smooth = (u) => u * u * (3 - 2 * u);

/** A statics posture as a placement for `spec`: the root's turn and each joint's angles, raised clear of the ground. */
async function placementOf(model, variant, spec, posture, seed) {
  const body = await staticBody(cappedSpec(variantSpec(model, variant)));
  try {
    posed(body, posture);
    const root = body.built.segments.get("lowerTrunk");
    const rotation = root.node.rotationQuaternion.multiply(Quaternion.Inverse(root.rest)).normalize().asArray();
    const joints = {};
    for (const [name, joint] of body.built.joints) joints[name] = jointAngles(joint).map((a, k) => Math.max(joint.spec.dofs[k].min.value, Math.min(joint.spec.dofs[k].max.value, a)));
    const address = (s) => ({ seed: s, ground: { start: "placed", posture: "squat", level: "open", degrees: null, impulse: null, foe: 0, gusts: false } });
    // The hips eased out of flexion by as many 0.01 rad steps as it takes to clear the witness's few millimetres of trunk on thigh, which the statics allow.
    for (let ease = 0; ease <= .15 + 1e-9; ease += .01) {
      const opened = Object.fromEntries(Object.entries(joints).map(([name, angles]) => [name, !name.startsWith("hip.") ? angles
        : angles.map((a, k) => { const d = spec.joints.find((j) => j.name === name).dofs[k]; return d.positive === "flexion" ? Math.max(d.min.value, a - ease) : a; })]));
      const p = groundPlacement(spec, address(Math.max(1, seed)), { position: [0, 0, 0], rotation, joints: opened }, seed === 0 ? 0 : .02);
      if (!("refused" in p)) return { ...p, widened: +ease.toFixed(2) };
    }
    return { refused: "no clear placement within 0.3 rad of widening" };
  } finally { body.dispose(); }
}

export async function handoff({ model = "workshop-fighter", variant = "built", held = "empty", posture, seed = 0, ease = .6, hold = 2, settle = 0, rise = 0, forceDirect = false, jitter = .03, pitchTo = FOLD.pitch, trace = false, ramp = null }) {
  const spec = armedWith(variantSpec(model, variant), "right", held);
  const placement = forceDirect ? { refused: "direct" } : await placementOf(model, variant, spec, posture, seed);
  // A witness its placement check refuses (a few millimetres of self-overlap the statics allow) is put where the statics stand it instead.
  const direct = "refused" in placement;

  // A direct start's seed turns each searched freedom by up to `jitter` rad.
  if (direct && seed > 0) { let a = seed * 2654435761 >>> 0; const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    posture = { ...posture, angles: posture.angles.map((v) => v + (u() * 2 - 1) * jitter) }; }
  const engine = new NullEngine(), scene = new Scene(engine), world = createWorld(scene, await loadEngine("rapier"));
  addArenaSolids(world.physics);
  const built = buildBody(spec, world, direct ? { position: [0, 0, 0] } : placement);
  const control = { phase: ramp ? "bear" : "hold", rampEnd: null, quietAt: null, quiet: 0, handBack: null, climbBegun: null, log: null };
  let reader = null;
  const body = commandedBody(built, world, { servoSeconds: .1 }, [(own, view, clock) => {
    const kit = kitOf(partLookup, own.spec, PUNCHER);
    const motor = carrying(kit.motor(own.built, SERVO_SECONDS, kit.posture, undefined, own.assist), ["stance"], "the hand-off");
    const channels = own.muscles.channels;
    const clamp = (c, v) => Math.max(c.dof.spec.min.value + c.dof.spec.bind.value, Math.min(c.dof.spec.max.value + c.dof.spec.bind.value, v));
    const fold = Object.fromEntries(channels.map((c) => [c.name, kit.posture[c.name] ?? 0]));
    fold["lumbar flexion"] = clamp(channels.find((c) => c.name === "lumbar flexion"), fold["lumbar flexion"] + FOLD.lumbar);
    fold["thoracic flexion"] = clamp(channels.find((c) => c.name === "thoracic flexion"), fold["thoracic flexion"] + FOLD.thoracic);
    let from = null, t0 = null, h0 = null, p0 = null, stand = null, phased = null;
    // The ramp: the bearing solve (step 8's phased rise) moving the weight from hands and feet onto the feet, the hands' share stepped down to none, toward `ramp.target`'s posture, pitch and height.
    const rampPhases = ramp && ramp.hands.map((hand, k) => ({ kind: "bear", posture: ramp.target.angles, duration: ramp.seconds, response: ramp.response ?? .3, pitch: ramp.target.pitch,
      toward: 0, height: ramp.target.height / ramp.standing, along: 0, up: 0, shin: 0, hand, foot: .5 - hand }));
    return { name: "hand-off", state: { motor: motor.state, control }, wants: () => control.phase !== "done", begin() {}, end() {},
      step(_senses, dt) {
        reader ??= groundReading(own.built, dt);
        const g = reader.read();
        if (control.phase === "bear") {
          if (!phased) { phased = phasedRun(own, view, { from: "fours", phases: rampPhases, hold: rampPhases.at(-1) }, () => true); phased.begin("left"); }
          phased.step(g, null, dt);
          if (phased.state.elapsed + 1e-9 >= ramp.seconds * ramp.hands.length) { control.phase = "hold"; control.rampEnd = { t: +view.time.toFixed(2), feet: +(g.footLoad[0] + g.footLoad[1]).toFixed(2), flat: `${+g.flat[0]}${+g.flat[1]}`, v: +Math.sqrt(g.velocity.lengthSquared()).toFixed(2) }; }
          return;
        }
        if (control.phase === "climb") {
          if (!stand) { stand = standUp(own, view, clock, { kind: "stand-up", techniques: [{ kind: "step-up" }] }, kit); stand.begin(); control.climbBegun = view.time; }
          stand.step(null, dt); control.stand = stand;
          if (!stand.state.active) { control.phase = "done"; control.handBack = view.time; control.log = stand.state.log.slice(-6); }
          return;
        }
        if (t0 === null) {
          t0 = view.time; from = Object.fromEntries(channels.map((c, i) => [c.name, own.muscles.angle(i) + c.dof.spec.bind.value]));
          motor.stance.read(); h0 = motor.stance.reading.centre.y - motor.stance.reading.support.y;
          const pelvis = own.built.segments.get("lowerTrunk"), up = new Vector3(0, 1, 0).applyRotationQuaternion(pelvis.node.rotationQuaternion.multiply(Quaternion.Inverse(pelvis.rest)));
          p0 = Math.atan2(up.z, up.y); control.p0 = +p0.toFixed(3);
        }
        const t = view.time - t0, k = smooth(Math.min(1, t / ease));
        motor.setPosture(Object.fromEntries(channels.map((c) => [c.name, from[c.name] + (fold[c.name] - from[c.name]) * k])));
        motor.stance.read();
        motor.setStance({ feet: ["left", "right"], centre: null, heading: 0, height: rise ? h0 + (rise * view.standing - h0) * k : h0, pose: { pitch: p0 + ((pitchTo ?? p0) - p0) * k, seconds: .3 } });
        motor.control(own.muscles, dt);
        const ready = quietOnFeet(g) && g.height < .9;
        control.quiet = ready ? control.quiet + dt : 0;
        if (control.quiet + 1e-9 >= QUIET && t >= settle) { control.quietAt ??= view.time; control.phase = "climb"; }
        if (t > hold) control.phase = "done";
      } };
  }]);
  if (direct) {
    body.setLevel("held");
    const statical = await staticBody(cappedSpec(variantSpec(model, variant)));
    posed(statical, posture); placeLike(statical, built, .002); statical.dispose();
    body.setLevel("full");
  }
  body.drive((view) => ({ posture: {}, pushes: [], stance: { feet: ["left", "right"], centre: null, height: view.standing - .03, heading: 0 } }));
  const measure = recoveryMeasurement(built, observeBody(built, body.muscles, world, clockSenses(world), { contactPatches: true }));
  const rows = [];
  let quiet = 0, verified = null, fell = false, lowest = Infinity;
  try {
    while (world.time < CAP && (verified === null || world.time - verified < 1)) {
      world.step();
      const m = measure();
      lowest = Math.min(lowest, m.observation.centre[1]);
      if (control.phase === "climb" || control.phase === "done") {
        if (verified === null) { quiet = m.ready ? quiet + world.dt : 0; if (quiet + 1e-9 >= STAND_CHECK.quiet) verified = world.time; }
      }
      if (verified !== null && m.observation.down) fell = true;
      if (trace && Math.round(world.time / world.dt) % 12 === 0) {
        const g = reader?.read();
        rows.push({ t: +world.time.toFixed(2), phase: control.phase, y: +m.observation.centre[1].toFixed(3), feet: g ? +(g.footLoad[0] + g.footLoad[1]).toFixed(2) : null,
          flat: g ? `${+g.flat[0]}${+g.flat[1]}` : "", v: g ? +Math.sqrt(g.velocity.lengthSquared()).toFixed(2) : null, up: +m.rootUp.toFixed(2), down: m.observation.down });
      }
    }
  } finally { body.dispose?.(); world.dispose(); scene.dispose(); engine.dispose(); }
  const r = (v) => (v === null ? null : +v.toFixed(2));
  return { placed: direct ? "statics" : `placement, hips eased ${placement.widened}`, rampEnd: control.rampEnd, p0: control.p0 ?? null, quietAt: r(control.quietAt), handBack: r(control.handBack), verified: fell ? null : r(verified), fell, lowest: r(lowest), end: control.log?.at(-1) ?? null, standLog: (control.log ?? control.stand?.state.log ?? []).slice(-8).map((e) => JSON.stringify(e).slice(0, 160)), ...(trace ? { rows } : {}) };
}

if (process.argv[1]?.endsWith("handoff.mjs")) {
  const { values } = parseArgs({ options: { record: { type: "string" }, variant: { type: "string" }, row: { type: "string" }, model: { type: "string" }, held: { type: "string" },
    seeds: { type: "string" }, ease: { type: "string" }, hold: { type: "string" }, pitch: { type: "string" }, trace: { type: "boolean" }, pick: { type: "string" }, settle: { type: "string" }, from: { type: "string" }, rise: { type: "string" }, direct: { type: "boolean" }, jitter: { type: "string" }, start: { type: "string" }, ramp: { type: "string" }, steps: { type: "string" } } });
  const records = JSON.parse(readFileSync(values.record, "utf8"));
  const variant = values.variant ?? "built", model = values.model ?? records[0].model;
  const mine = records.filter((m) => m.variant === (values.from ?? variant) && m.rec.row === values.row && m.rec.found && m.rec.balanced);
  if (!mine.length) throw new Error(`no balanced witness of ${values.row} on ${variant}`);
  const best = mine.filter((m) => m.rec.held).reduce((a, b) => (values.pick === "share" ? (b.rec.share < a.rec.share) : (b.rec.margin > a.rec.margin)) ? b : a);
  console.log(`witness: seed ${best.seed}, share ${best.rec.share}, margin ${best.rec.margin}, centre ${best.rec.height}, pitch ${best.rec.pitch}`);
  // With --start, the body is placed in that record's least-share `hands and feet` witness and ramped onto its feet toward the witness above.
  let startPosture = best.rec.posture, ramp = null;
  if (values.start) {
    const starts = JSON.parse(readFileSync(values.start, "utf8")).filter((m) => m.model === model && m.variant === variant && m.rec.held);
    const s0 = starts.reduce((a, b) => (Math.abs(b.rec.height - best.rec.height) < Math.abs(a.rec.height - best.rec.height) ? b : a));
    console.log(`start: hands and feet seed ${s0.seed}, share ${s0.rec.share}, centre ${s0.rec.height}, hands ${JSON.stringify(s0.rec.forces)}`);
    startPosture = s0.rec.posture;
    const steps = Number(values.steps ?? 4), first = .25;
    ramp = { target: { angles: best.rec.angles, pitch: best.rec.pitch, height: best.rec.height }, standing: model === "workshop-rogue" ? .95 : .98, seconds: Number(values.ramp ?? .3),
      hands: [...Array.from({ length: steps }, (_, k) => +(first * (1 - (k + 1) / steps)).toFixed(3)), 0] };
    console.log(`ramp: ${JSON.stringify(ramp.hands)} each ${ramp.seconds} s`);
  }
  const [lo, hi] = (values.seeds ?? "0-0").split("-").map(Number);
  for (let seed = lo; seed <= (hi ?? lo); seed++) {
    const out = await handoff({ model, variant, held: values.held ?? "empty", posture: startPosture, ramp, seed, ease: Number(values.ease ?? .6), hold: Number(values.hold ?? 2), settle: Number(values.settle ?? 0), rise: Number(values.rise ?? 0), forceDirect: values.direct ?? false, jitter: Number(values.jitter ?? .03),
      pitchTo: values.pitch === undefined ? FOLD.pitch : values.pitch === "keep" ? null : Number(values.pitch), trace: values.trace });
    if (out.rows) console.table(out.rows);
    const { rows: _rows, ...rest } = out;
    console.log(JSON.stringify({ seed, ...rest }));
  }
}
