/**
 * A closed-loop push from hands and knees: a state machine over the bearing solve (plant-up's, as
 * `research/rise-witness.mjs`'s bearer), each state an aim (shares by limb, the centre of mass's
 * place and velocity, height, pelvis pitch, posture) with transitions read from the body, then the
 * stance bridge (the combat fold eased in) and Stand up's steady and climb. Node stand, core
 * world, Rapier, 120 Hz, calm, no assist.
 */
import "../../../tests/harness/preload-data.mjs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import poses from "../../../assets/research/posture-holds.json" with { type: "json" };
import { SERVO_SECONDS } from "../../../src/core/body.ts";
import { commandedBody } from "../../../src/core/mind/host.ts";
import { buildBody } from "../../../src/core/build/build-body.ts";
import { loadEngine } from "../../../src/core/engine/engines.ts";
import { armedWith } from "../../../src/core/items/held.ts";
import { humanoidSpec, humanSpec } from "../../../src/core/human/spec.ts";
import { guardPosture } from "../../../src/core/skills/guard/guard.ts";
import { createWorld } from "../../../src/core/world.ts";
import { recoveryMeasurement } from "../../../src/core/control/recovery-measurement.ts";
import { observeBody } from "../../../src/core/observation.ts";
import { clockSenses } from "../../../src/core/mind/senses.ts";
import { carrying } from "../../../src/core/control/motor.ts";
import { kitOf } from "../../../src/core/mind/kit.ts";
import { partLookup } from "../../../src/entrants/game.ts";
import { PUNCHER } from "../../../src/entrants/classic/presets.ts";
import { STAND_CHECK } from "../../../src/lab/ground-mode.ts";
import { standUp } from "../../../src/core/recovery/ground/stand-up.ts";
import { groundReading, quietOnFeet } from "../../../src/core/control/ground-reading.ts";
import { withinSupport } from "../../../src/core/control/support.ts";
import { bearLimbs, carryRoot, limbMotion, makeBearing } from "../../../src/core/control/bearing.ts";
import { uprightness } from "../../../src/core/control/ground.ts";
import { servoAsk, servoSolve } from "../../../src/core/control/servo.ts";
import { turnOfToRef } from "../../../src/core/read-motion.ts";
import { atan2 } from "../../../src/core/math/real.ts";
import { spinBetweenToRef, turnAboutToRef } from "../../../src/core/math/turn.ts";
import { riseLimbs } from "../../../src/core/recovery/rise/limbs.ts";
import { RISE } from "../../../src/core/recovery/rise/stages.ts";
import { placement } from "../../../research/rise-witness.mjs";
import { poseDrive } from "../../../src/core/recovery/ground/technique.ts";

const WITHIN = .2;
const smooth = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.min(1, Math.max(0, u));

/** A stored posture (the Warrior's) by channel, the drive's values; `stand` the guard. */
export function storedPosture(spec, id) {
  if (id === "stand") { const guard = guardPosture(spec); return Object.fromEntries(spec.joints.flatMap(j => j.dofs.map(d => [`${j.name} ${d.positive}`, (guard[`${j.name} ${d.positive}`] ?? 0) + d.bind.value]))); }
  const reference = humanSpec("workshop-fighter"), held = poses.find(p => p.model === "workshop-fighter" && p.id === id);
  return Object.fromEntries(reference.joints.flatMap(j => j.dofs.map((d, k) => [`${j.name} ${d.positive}`, held.placement.joints[j.name][k] + d.bind.value])));
}
export const mix = (a, b, k) => Object.fromEntries(Object.keys(a).map(c => [c, a[c] + ((b[c] ?? a[c]) - a[c]) * k]));

/** The support margin of (x, z) inside the soles' inset outline, m: positive inside (distance to the edge is not computed; 0 inside), negative the distance outside. */
function outside(g, x, z) { const [nx, nz] = withinSupport(g.soles, x, z); return Math.hypot(nx - x, nz - z); }

/** The bearing solve on `own`'s rise limbs (shin, hand, foot each side), its aims a state's. */
function bearer(own, view) {
  const muscles = own.muscles, root = muscles.dynamics.root.segment, low = uprightness(own.built), made = riseLimbs(own, RISE);
  const kinds = RISE.limbs.map(limb => limb.name.split(".")[0]);
  const memory = { tasks: made.tasks, memory: made.limbs.map(limb => limb.memory), root: new Float64Array(6),
    helped: { force: new Vector3(), moment: new Vector3() }, held: { channels: [], z0: [], Z: [] }, shortfall: { force: new Vector3(), moment: new Vector3() } };
  const solve = makeBearing(null, made.limbs, memory, { effort: true });
  const work = { place: new Vector3(), spin: new Vector3(), rootSpin: new Vector3(), turn: new Quaternion(), yaw: new Quaternion(), pitch: new Quaternion(),
    across: new Vector3(), right: new Vector3(1, 0, 0), moved: new Uint8Array(muscles.channels.length), aim: { centre: new Vector3(), spin: new Vector3() }, goal: new Float64Array(muscles.channels.length) };
  const orient = { heading: 0, toward: new Vector3(0, 0, 1) };
  return {
    orient, made,
    begin(g) {
      turnOfToRef(root, work.turn); work.across.set(1, 0, 0).applyRotationQuaternionToRef(work.turn, work.across);
      orient.heading = atan2(-work.across.z, work.across.x);
      const feet = ["foot.left", "foot.right"].map(name => own.built.segments.get(name).node.position);
      orient.toward.set((feet[0].x + feet[1].x) / 2 - g.centre.x, 0, (feet[0].z + feet[1].z) / 2 - g.centre.z);
      const l = orient.toward.length(); if (l > 1e-6) orient.toward.scaleInPlace(1 / l); else orient.toward.set(0, 0, 1);
    },
    /**
     * One step toward `aim`: `share` by limb kind; the place (`place` world x,z if given, else the bearing limbs' weighted middle) moved
     * `toward` m on the way to the feet; velocity `along` toward the feet and `up`; `height` a share of standing (null: where it is);
     * `pitch` the pelvis's, rad; `response` s; `posture` the servo's.
     */
    step(aim, g, dt) {
      for (let i = 0; i < muscles.channels.length; i++) { const c = muscles.channels[i], s = c.dof.spec; work.goal[i] = Math.max(s.min.value, Math.min(s.max.value, (aim.posture[c.name] ?? 0) - s.bind.value)); }
      const ground = low.lowest(), n = 1 / aim.response;
      made.read(ground, aim.overProp ?? true); work.place.setAll(0);
      let total = 0; const bore = [];
      for (let l = 0; l < made.limbs.length; l++) {
        const weight = aim.shares ? aim.shares[l] : (aim.share[kinds[l]] ?? 0), move = aim.moves?.[l];
        if (move) {
          // A free move: the limb's point carried to `move` (world), critically damped at the move's own rate; it bears nothing.
          const r = move[3] ?? n;
          made.bear(l, work.goal, r, ground, 0, true);
          const task = made.limbs[l].task, at = made.limbs[l].work.at;
          task.linear.x = r * r * (move[0] - at.x) + 2 * task.linear.x;
          task.linear.z = r * r * (move[2] - at.z) + 2 * task.linear.z;
          task.linear.y += r * r * (move[1] - ground);
          task.bearing = false;
          continue;
        }
        if (weight > 0 && made.bear(l, work.goal, n, ground, weight, true)) { work.place.addInPlaceFromFloats(made.over[l].x * weight, 0, made.over[l].z * weight); total += weight; bore.push(l); }
        else made.rest(l);
      }
      if (aim.place) work.place.set(aim.place[0], 0, aim.place[1]);
      else if (total > 0) work.place.scaleInPlace(1 / total); else work.place.set(g.centre.x, 0, g.centre.z);
      const t = orient.toward;
      work.place.addInPlaceFromFloats(t.x * (aim.toward ?? 0), 0, t.z * (aim.toward ?? 0));
      const height = aim.height === null ? g.centre.y : ground + view.standing * aim.height;
      work.aim.centre.set(n * n * (work.place.x - g.centre.x) + 2 * n * (t.x * (aim.along ?? 0) - g.velocity.x),
        n * n * (height - g.centre.y) + 2 * n * ((aim.up ?? 0) - g.velocity.y),
        n * n * (work.place.z - g.centre.z) + 2 * n * (t.z * (aim.along ?? 0) - g.velocity.z));
      root.body.angularVelocityToRef(work.rootSpin);
      turnAboutToRef(Vector3.UpReadOnly, orient.heading, work.yaw);
      turnAboutToRef(work.right, aim.pitch, work.pitch);
      work.yaw.multiplyToRef(work.pitch, work.turn).multiplyInPlace(root.rest);
      spinBetweenToRef(root.node.rotationQuaternion, work.turn, aim.response, work.spin);
      work.aim.spin.copyFrom(work.spin).scaleInPlace(n).subtractInPlace(work.rootSpin.scaleInPlace(2 * n));
      const asked = servoAsk(muscles, i => work.goal[i], WITHIN, dt), lever = muscles.dynamics.root.centre[1] - ground;
      const carried = carryRoot(solve, muscles, asked, work.aim, lever);
      if (process.env.DEBUG) { for (let i = 0; i < muscles.channels.length; i++) if (!Number.isFinite(asked.accel[i])) console.log("NaN", muscles.channels[i].name, muscles.angle(i), muscles.rate(i), work.goal[i], [0,1,2].map(k => k < muscles.channels[i].joint.dofs.length ? muscles.turning(i, k) : "-")); }
      if (process.env.DEBUG) { const bad = (a) => [...a].some((v) => !Number.isFinite(v)); console.log("aim", work.aim.centre.asArray().map(v=>v.toFixed(2)), work.aim.spin.asArray().map(v=>v.toFixed(2)), "lever", lever.toFixed(3), "asked NaN", bad(asked.accel ?? asked), "carried", carried && (carried.length !== undefined ? bad(carried) : JSON.stringify(carried).slice(0,120))); }
      limbMotion(solve, asked, work.moved); servoSolve(muscles, asked, carried, work.moved); bearLimbs(solve, muscles, asked, lever, true);
      return bore;
    },
  };
}

/** Segment indices of interest in `spec.segments` order. */
function indices(spec) {
  const at = (n) => spec.segments.findIndex(s => s.name === n);
  return { shank: [at("shank.left"), at("shank.right")], hand: [at("hand.left"), at("hand.right"), at("forearm.left"), at("forearm.right")], thigh: [at("thigh.left"), at("thigh.right")],
    trunk: [at("lowerTrunk"), at("middleTrunk"), at("upperTrunk"), at("head")] };
}

/**
 * One trial. `plan(ctx)` returns the controller: `{ step(g, ctx, dt) → "bridge" | "fail" | null }`, called each control step with
 * `ctx` = { bearer, t (s in state), state, loads, own, view, set(state) }. The bridge and the climb follow as push.mjs's.
 */
export async function trial({ model = "workshop-fighter", held = "empty", seed, controller, bridge = { ease: .8, rise: .75, pitch: .8 }, trace = 0, cap = 8, start = "push-off-bear" }) {
  const spec = armedWith(humanoidSpec(model), "right", held), placed = placement(start, spec, seed);
  if ("refused" in placed) return { seed, refused: placed.refused };
  const engine = new NullEngine(), scene = new Scene(engine), world = createWorld(scene, await loadEngine("rapier"));
  world.physics.addFixedBox([0, -.5, 0], [40, 1, 40]);
  const built = buildBody(spec, world, placed), ix = indices(spec);
  const control = { phase: "push", state: null, enteredAt: 0, events: [], bridgeAt: null, climbAt: null, handBack: null, quiet: 0, failed: null };
  let reader = null;
  const body = commandedBody(built, world, { servoSeconds: .1 }, [(own, view, clock) => {
    const kit = kitOf(partLookup, own.spec, PUNCHER);
    const motor = carrying(kit.motor(own.built, SERVO_SECONDS, kit.posture, undefined, own.assist), ["stance"], "the push");
    const channels = own.muscles.channels, b = bearer(own, view);
    const cl = (c, v) => Math.max(c.dof.spec.min.value + c.dof.spec.bind.value, Math.min(c.dof.spec.max.value + c.dof.spec.bind.value, v));
    const fold = Object.fromEntries(channels.map((c) => [c.name, kit.posture[c.name] ?? 0]));
    fold["lumbar flexion"] = cl(channels.find((c) => c.name === "lumbar flexion"), fold["lumbar flexion"] + .89);
    fold["thoracic flexion"] = cl(channels.find((c) => c.name === "thoracic flexion"), fold["thoracic flexion"] + .368);
    const ctl = controller({ spec, b, own, view, fold });
    let from = null, t0 = null, h0 = null, p0 = null, stand = null, begun = false;
    const drive = poseDrive(own.muscles);
    const ctx = { b, own, view, spec, ix, control, drive, fold, state: null, t: 0, set(s) { control.events.push([+view.time.toFixed(2), s]); ctx.state = s; control.state = s; control.enteredAt = view.time; }, outside: (x, z) => outside(ctx.g, x, z) };
    return { name: "push", state: { motor: motor.state, control }, wants: () => control.phase !== "done", begin() {}, end() {},
      step(_senses, dt) {
        reader ??= groundReading(own.built, dt);
        const g = reader.read(); ctx.g = g;
        if (control.phase === "push") {
          if (!begun) { b.begin(g); begun = true; ctl.begin?.(ctx); }
          ctx.t = view.time - control.enteredAt;
          const r = ctl.step(g, ctx, dt);
          if (r === "bridge") { control.phase = "bridge"; control.bridgeAt = view.time; control.events.push([+view.time.toFixed(2), "bridge"]); }
          else if (r === "fail") { control.phase = "done"; control.failed = ctx.state; }
          if (control.phase === "push") return;
        }
        if (control.phase === "climb") {
          if (!stand) { stand = standUp(own, view, clock, { kind: "stand-up", techniques: [{ kind: "step-up" }] }, kit); stand.begin(); control.climbAt = view.time; }
          stand.step(null, dt);
          if (!stand.state.active) { control.phase = "done"; control.handBack = view.time; }
          return;
        }
        if (control.phase !== "bridge") return;
        if (t0 === null) {
          t0 = view.time; from = Object.fromEntries(channels.map((c, i) => [c.name, own.muscles.angle(i) + c.dof.spec.bind.value]));
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
        if (control.quiet + 1e-9 >= .1) { control.phase = "climb"; control.events.push([+view.time.toFixed(2), "climb"]); }
        else if (t > 3) { control.phase = "done"; control.failed = "bridge"; }
      } };
  }]);
  body.drive((view) => ({ posture: {}, pushes: [], stance: { feet: ["left", "right"], centre: null, height: view.standing - .03, heading: 0 } }));
  const measure = recoveryMeasurement(built, observeBody(built, body.muscles, world, clockSenses(world), { contactPatches: true }));
  const rows = [], ankI = body.muscles.channels.findIndex((c) => c.name === "ankle.left dorsiflexion"), kneeI = body.muscles.channels.findIndex((c) => c.name === "knee.left flexion");
  let quiet = 0, verified = null, fell = false, steps = 0, progress = 0; const win = new Float64Array(12);
  try {
    while (world.time < cap && (verified === null || world.time - verified < 1)) {
      world.step(); steps++;
      const m = measure();
      if (reader) { const g = reader.read(); win[steps % 12] = Math.min(1, g.footLoad[0] + g.footLoad[1]) * (g.flat[0] && g.flat[1] ? 1 : .3) * Math.max(0, 1 - g.velocity.length() / .5) * (.5 + .5 * Math.min(1, g.height) * Math.max(0, g.upright)); if (steps >= 12) progress = Math.max(progress, Math.min(...win)); }
      if (verified === null && (control.phase === "climb" || (control.phase === "done" && control.handBack !== null))) { quiet = m.ready ? quiet + world.dt : 0; if (quiet + 1e-9 >= STAND_CHECK.quiet) verified = world.time; }
      if (verified !== null && m.observation.down) { fell = true; break; }
      if (control.phase === "done" && control.handBack === null) break;
      if (trace && steps % trace === 0 && reader) {
        const g = reader.read(), L = g.load, sum = (a) => a.reduce((s, i) => s + L[i], 0);
        const c = g.centre, out = outside(g, c.x, c.z), cap2 = outside(g, c.x + g.velocity.x * .3, c.z + g.velocity.z * .3);
        rows.push({ t: +world.time.toFixed(2), ph: control.phase === "push" ? control.state : control.phase, pos: g.raw, h: +g.height.toFixed(2), feet: +(g.footLoad[0] + g.footLoad[1]).toFixed(2), flat: `${+g.flat[0]}${+g.flat[1]}`,
          shin: +sum(ix.shank).toFixed(2), thigh: +sum(ix.thigh).toFixed(2), hand: +sum(ix.hand).toFixed(2), trunk: +sum(ix.trunk).toFixed(2), out: +out.toFixed(3), cap: +cap2.toFixed(3), v: +g.velocity.length().toFixed(2), up: +g.upright.toFixed(2), s: control.s === undefined ? null : +control.s.toFixed(2), ank: +(body.muscles.angle(ankI) + body.muscles.channels[ankI].dof.spec.bind.value).toFixed(2), knee: +(body.muscles.angle(kneeI) + body.muscles.channels[kneeI].dof.spec.bind.value).toFixed(2), sole: +g.sole[0].toFixed(2) });
      }
    }
  } finally { body.dispose?.(); world.dispose(); scene.dispose(); engine.dispose(); }
  const r = (v) => (v === null || v === undefined ? null : +v.toFixed(2));
  const reached = { land: 0, rock: .05, back: .05, onto: .1, feet: .1, walk: .15, up: .2, push: .2 }[control.state] ?? 0;
  const score = verified !== null && !fell ? 2 + (cap - verified) / cap : verified !== null ? 1 + .5 * (cap - verified) / cap : .6 * progress + reached + (control.bridgeAt !== null ? .15 : 0) + (control.climbAt !== null ? .1 : 0);
  return { seed, score, progress: +progress.toFixed(3), verified: fell ? null : r(verified), fell, failed: control.failed, bridgeAt: r(control.bridgeAt), climbAt: r(control.climbAt), events: control.events, ...(trace ? { rows } : {}) };
}
