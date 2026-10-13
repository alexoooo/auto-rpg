/**
 * **Where a walk's ground force is lost**, on the locomotion test bed's setup (the Lab's Run on the
 * Node stand, Rapier, 120 Hz, no wind): each control step, for each bearing foot, the chain from the
 * stance's plan to the ground, and where it parts.
 *
 *   node research/locomotion-wrench.mjs [--models workshop-fighter,workshop-rogue] [--paces 0,0.5,1.2]
 *     [--legs stride,stance,sway] [--seconds 12] [--from 3] [--out wrench.jsonl] [--workers 12]
 *     [--scale "ankle dorsiflexion+=3;ankle dorsiflexion-=2"] [--stride "push=0"]
 *
 * The four stages, each read in the step it acts in:
 *
 * 1. **Planned**: the ground's wrench the stance's leg torques count on at each bearing sole
 *    (`StanceReading.asked`), its centre of pressure (where that wrench has no moment but about up),
 *    and the root's acceleration the plan asks (`StanceState.aim.root`).
 * 2. **Asked of the muscles**: each bearing leg channel's torque as given (activation times its
 *    strength at the step's speed, in the sense asked), and whether it is at full activation: a
 *    torque the solve wanted past the muscle's strength is clipped there.
 * 3. **Delivered**: what the motor gave over the step (`MuscleDriver.pulled`).
 * 4. **Realised**: the ground's whole wrench over the step, from the body's own momentum: its force
 *    the change in momentum less gravity's, its moment about the centre of mass the change in
 *    angular momentum about it (each segment's, in the mass properties the engine holds). Its centre
 *    of pressure on the ground is where that wrench has no moment but about up. On one foot it is
 *    that foot's; on two it is the pair's, read against the plan's for the pair. (The engine's
 *    contact point is each collider pair's solver points' plain average, not a centre of pressure.)
 *
 * The centre of pressure is reported along the body's heading and out to the bearing foot's own
 * side, from the place the sole bears (its middle, or its front edge's middle once rolled); by
 * phase: on both feet, and on one foot while the other swings. A gap is realised less planned.
 * Each bearing leg joint's limit is read too: the share of leg-steps its stop pushed in the step's
 * last solver substep (`jointLimitImpulse`).
 *
 * It also reads whether the walk fails kinematically, the only case a whole-body inverse
 * kinematics would help: each swing's landing against where it was sent, the share of bearing
 * leg-steps a leg joint is within `NEAR_STOP` of its range, and the share whose knee is within
 * `NEAR_STRAIGHT` of straight.
 */
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { appendFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

/** A joint within this of a stop, rad, presses it. */
const NEAR_STOP = 0.02;
/** A knee within this of straight, rad, is near the leg's Jacobian losing rank. */
const NEAR_STRAIGHT = 0.05;
/** The straight line walked: forward, facing +z, 80 m. */
const LINE = { pieces: [{ kind: "corner", metres: 0, turn: 0 }, { kind: "straight", metres: 80 }], facing: 0 };
/** The ground's side, m. */
const GROUND = 200;

/** A body's momentum, and its angular momentum about its centre of mass, and that centre: each segment's own, in the mass properties the engine holds. */
function momentumOf(segments, mass) {
  const C = new Vector3(), linear = new Vector3(), angular = new Vector3();
  const c = new Vector3(), v = new Vector3(), w = new Vector3(), q = new Quaternion(), spin = new Vector3(), turned = new Vector3();
  for (const segment of segments) C.addInPlace(centreOf(segment, c).scaleInPlace(segment.rigid.mass));
  C.scaleInPlace(1 / mass);
  for (const segment of segments) {
    const { mass: m, moments, orientation } = segment.body.massProperties;
    centreOf(segment, c); segment.body.linearVelocityToRef(v); segment.body.angularVelocityToRef(w);
    linear.addInPlace(v.scale(m));
    angular.addInPlace(Vector3.Cross(c.subtract(C), v).scaleInPlace(m));
    segment.node.rotationQuaternion.multiplyToRef(orientation, q);
    w.applyRotationQuaternionToRef(Quaternion.Inverse(q), spin);
    spin.set(spin.x * moments[0], spin.y * moments[1], spin.z * moments[2]);
    angular.addInPlace(spin.applyRotationQuaternionToRef(q, turned));
  }
  return { C, linear, angular };
}
let centreOf = null;

/** The point on the level ground (y = `y0`) where a wrench `F`, `M` about `C` has no moment but about up. */
function pressureCentre(C, F, M, y0) {
  const h = C.y - y0;
  return [C.x - (h * F.x - M.z) / F.y, C.z - (M.x + h * F.z) / F.y];
}

const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const round = (x, k = 3) => x === null || x === undefined ? null : +x.toFixed(k);

async function runOnce({ model, pace, legs, seconds, from, scale, stride }) {
  const [{ modelSpec }, { labActor }, { startLocomotion }, { trackOf }, { LAB_PRESETS }, { coreStand }, { STRIDE }, { footStatesOf, centreOfToRef }] = await Promise.all([
    import("../src/core/models.ts"), import("../src/lab/actor.ts"), import("../src/lab/locomotion-mode.ts"), import("../src/lab/track.ts"),
    import("../src/lab/scenarios.ts"), import("../tests/harness/core-stand.mjs"), import("../src/core/skills/stride.ts"), import("../src/core/control/support.ts"),
  ]);
  centreOf = centreOfToRef;
  const stand = await coreStand(modelSpec(model), { ground: true, groundSize: GROUND });
  const subject = legs === "sway" ? await swaying(stand, pace)
    : running(stand, { labActor, startLocomotion, trackOf, LAB_PRESETS, STRIDE }, legs, stride, pace);
  const { muscles, stance, reading } = subject, dt = stand.world.dt, g = -stand.built.physics.gravity[1];
  const segments = [...stand.built.segments.values()], mass = segments.reduce((s, x) => s + x.rigid.mass, 0);
  const feet = footStatesOf(stand.built);
  const straight = Object.fromEntries(feet.map((f) => [f.side, f.straight]));
  const pelvis = feet[0].chain[0].parent;
  const legChannels = muscles.channels.flatMap((c, i) => {
    const m = /^(hip|knee|ankle)\.(left|right) (.*)$/.exec(c.name);
    // The stop's push in the step's last solver substep: the engine joint's raw Rapier joint.
    const limit = () => { const joint = c.joint.joint.raw; return joint.rawSet.jointLimitImpulse(joint.handle, 3 + c.index); };
    return m ? [{ i, group: `${m[1]} ${m[3]}`, side: m[2], knee: m[1] === "knee", min: c.dof.spec.min.value, max: c.dof.spec.max.value, limit }] : [];
  });
  const rows = [], torque = {}, kin = { legSteps: 0, nearStop: {}, nearStraight: 0, limit: {}, limitTorque: {}, landings: [] };
  let before = null, swinging = null, pending = null;
  const lastWanted = [new Float64Array(0), new Float64Array(0)];
  // A probe's cause test, never a body's: each named channel side's peak scaled (`--scale "ankle dorsiflexion+=3"`, "every" every channel).
  for (const [name, factor] of Object.entries(scale)) {
    const [, channel, sense] = /^(.*)([+-])$/.exec(name);
    for (const c of muscles.channels) if (channel === "every" || c.name.replace(/.(left|right)/, "") === channel) {
      const side = sense === "+" ? c.positive : c.negative;
      Object.defineProperty(side, "peak", { value: side.peak * factor });
    }
  }
  const n = muscles.channels.length, speeds = () => Float64Array.from({ length: n }, (_, i) => muscles.speed(i));
  // The body's dynamics as the step's command read it, kept to the next step, when the step's joint speeds are known.
  const snapshot = () => { const R = muscles.dynamics.root; return { mass: R.mass.map((r) => Float64Array.from(r)), coupling: R.coupling.map((r) => Float64Array.from(r)),
    bias: Float64Array.from(R.bias), gravity: Float64Array.from(R.gravity), centre: [...R.centre], speeds: speeds() }; };
  const keepWanted = () => [0, 1].forEach((f) => { lastWanted[f] = Float64Array.from(stance.tasks[f].given); });
  const hook = stand.world.afterStep(() => { try { readStep(); } finally { keepWanted(); } });
  function readStep() {
    const time = stand.world.time, now = momentumOf(segments, mass), prior = before;
    const v = pelvis.body.linearVelocityToRef(new Vector3()), w = pelvis.body.angularVelocityToRef(new Vector3());
    now.v = [v.x, v.y, v.z]; now.w = [w.x, w.y, w.z];
    before = now;
    // The last step's ground wrench as the stance's own model gives it for the motion the step made (its root's and its joints' accelerations), about the root's centre.
    if (pending) {
      const { D, row, wrench } = pending, after = speeds(), W = [];
      for (let r = 0; r < 6; r++) {
        let sum = D.bias[r] - D.gravity[r];
        for (let c = 0; c < 6; c++) sum += D.mass[r][c] * pending.root[c];
        for (let i = 0; i < n; i++) sum += D.coupling[r][i] * (after[i] - D.speeds[i]) / dt;
        W.push(sum);
      }
      const h = row.facing, sh = Math.sin(h), ch = Math.cos(h), ahead = (x, z) => x * sh + z * ch;
      row.model = { ground: { ahead: ahead(W[3], W[5]), up: W[4] }, real: { ahead: ahead(wrench[3], wrench[5]), up: wrench[4] },
        moment: Math.hypot(W[0] - wrench[0], W[1] - wrench[1], W[2] - wrench[2]) };
      pending = null;
    }
    const D = snapshot();
    // Landings: where a swing's sole came down against where it was last sent.
    const swing = stance.step.swing, h = reading.facing, sh = Math.sin(h), ch = Math.cos(h);
    const ahead = (x, z) => x * sh + z * ch, right = (x, z) => x * ch - z * sh;
    if (reading.phase === "swing" && swing) swinging = swing;
    else if (swinging && reading.phase !== "swing") {
      const sole = reading.soles[swinging.foot], dx = sole.x - swinging.to[0], dz = sole.z - swinging.to[1];
      if (time >= from) kin.landings.push(Math.hypot(dx, dz));
      swinging = null;
    }
    if (time < from || !prior || subject.down() || reading.phase === "flight") return;
    const swung = reading.phase === "swing" && swing ? swing.foot : null;
    const bearers = ["left", "right"].filter((side) => side !== swung && reading.asked[side].force.y > 0);
    if (!bearers.length) return;
    // The ground's wrench over the step, realised, and as planned, about the centre of mass at mid-step.
    const C = now.C.add(prior.C).scaleInPlace(0.5);
    const F = now.linear.subtract(prior.linear).scaleInPlace(1 / dt), M = now.angular.subtract(prior.angular).scaleInPlace(1 / dt);
    F.y += mass * g;
    const Fp = new Vector3(), Mp = new Vector3(), arm = new Vector3();
    for (const side of bearers) {
      const asked = reading.asked[side];
      Fp.addInPlace(asked.force);
      Mp.addInPlace(asked.moment).addInPlace(Vector3.Cross(asked.at.subtractToRef(C, arm), asked.force));
    }
    const y0 = bearers.reduce((sum, side) => sum + reading.asked[side].at.y, 0) / bearers.length;
    const [rx, rz] = pressureCentre(C, F, M, y0), [px, pz] = pressureCentre(C, Fp, Mp, y0);
    const root = stance.aim.root, rootReal = [0, 1, 2].map((k) => (now.v[k] - prior.v[k]) / dt);
    // The realised wrench about the root's centre, and the root's realised accelerations in the dynamics' order (spin, then the centre's).
    const Rc = new Vector3(...D.centre), MR = M.add(Vector3.Cross(C.subtract(Rc), F));
    pending = { D, root: [0, 1, 2].map((k) => (now.w[k] - prior.w[k]) / dt).concat(rootReal), wrench: [MR.x, MR.y, MR.z, F.x, F.y, F.z] };
    const row = {
      short: { ahead: ahead(reading.shortfall.force.x, reading.shortfall.force.z), up: reading.shortfall.force.y, moment: reading.shortfall.moment.length() },
      time: round(time, 4), swung, facing: h, clipped: false, averaged: 0, elsewhere: 0,
      ground: { plan: { ahead: ahead(Fp.x, Fp.z), up: Fp.y }, real: { ahead: ahead(F.x, F.z), up: F.y } },
      root: { plan: { ahead: ahead(root[3], root[5]), up: root[4] }, real: { ahead: ahead(rootReal[0], rootReal[2]), up: rootReal[1] } },
      cop: null,
    };
    // The centre of pressure, from the bearing place on one foot, against the plan's on two.
    if (bearers.length === 1) {
      const side = bearers[0], at = reading.asked[side].at, out = side === "right" ? 1 : -1;
      row.cop = { rolled: stance.feet[side === "left" ? 0 : 1].rolled,
        plan: { ahead: ahead(px - at.x, pz - at.z), out: out * right(px - at.x, pz - at.z) },
        real: { ahead: ahead(rx - at.x, rz - at.z), out: out * right(rx - at.x, rz - at.z) } };
    } else {
      row.cop = { rolled: bearers.some((side) => stance.feet[side === "left" ? 0 : 1].rolled),
        plan: { ahead: 0, out: 0 }, real: { ahead: ahead(rx - px, rz - pz), out: right(rx - px, rz - pz) } };
    }
    // How far the sole's mean of two steps' torques (`soleTorque`) parts from this step's own, N m, summed over the bearing legs' channels.
    for (const side of bearers) {
      const f = side === "left" ? 0 : 1, task = stance.tasks[f], channels = stance.feet[f].channels;
      for (let k = 0; k < channels.length; k++) {
        const wanted = task.given[k], prev = lastWanted[f][k];
        if (Number.isFinite(wanted) && Number.isFinite(prev)) row.averaged += Math.abs(wanted - prev) / 2;
      }
    }
    for (const side of bearers) {
      // The bearing leg's channels: asked against delivered, and how often the ask was clipped.
      for (const c of legChannels) {
        if (c.side !== side) continue;
        const vel = muscles.velocity[c.i];
        if (!Number.isFinite(vel)) {
          const sense = vel > 0 ? 1 : -1, asks = sense * muscles.activation[c.i] * muscles.strength(c.i, sense), got = muscles.pulled[c.i];
          const t = (torque[`${c.group} ${sense > 0 ? "+" : "-"}`] ??= { n: 0, asked: 0, got: 0, gap: 0, full: 0, slowed: 0, speed: 0 });
          const peak = (sense > 0 ? muscles.channels[c.i].positive : muscles.channels[c.i].negative).peak;
          t.n++; t.asked += Math.abs(asks); t.got += Math.abs(got); t.gap += Math.abs(got - asks); t.slowed += muscles.strength(c.i, sense) / peak; t.speed += sense * muscles.speed(c.i);
          if (muscles.activation[c.i] >= 0.999) { t.full++; row.clipped = true; }
        }
        const angle = muscles.angle(c.i);
        if (angle - c.min < NEAR_STOP || c.max - angle < NEAR_STOP) kin.nearStop[c.group] = (kin.nearStop[c.group] ?? 0) + 1;
        if (c.knee && angle - straight[side] < NEAR_STRAIGHT) kin.nearStraight++;
        const stop = c.limit();
        if (stop !== 0) { kin.limit[c.group] = (kin.limit[c.group] ?? 0) + 1; kin.limitTorque[c.group] = (kin.limitTorque[c.group] ?? 0) + Math.abs(stop) / dt; }
      }
      kin.legSteps++;
    }
    // The bearing sole's acceleration as the plan has it (its leg's freedoms' accelerations as solved, the root's, and the motion's drift), less what its task asked: the ground holds the sole, so what the plan moves it by is force it did not plan.
    row.sole = {};
    for (const side of bearers) {
      const f = side === "left" ? 0 : 1, task = stance.tasks[f], channels = stance.feet[f].channels, at = reading.asked[side].at;
      const dyn = muscles.dynamics, p0 = dyn.root.centre, lin = new Vector3(), ang = new Vector3();
      dyn.driftToRef(stand.built.segments.get(`foot.${side}`), at, lin, ang);
      const r = at.subtract(new Vector3(...p0)), alpha = new Vector3(root[0], root[1], root[2]);
      lin.addInPlace(new Vector3(root[3], root[4], root[5])).addInPlace(Vector3.Cross(alpha, r)); ang.addInPlace(alpha);
      for (let k = 0; k < channels.length; k++) {
        const axis = new Vector3(...dyn.axis(channels[k])), d = at.subtract(new Vector3(...dyn.pivot(channels[k])));
        lin.addInPlace(Vector3.Cross(axis, d).scaleInPlace(task.accel[k])); ang.addInPlace(axis.scaleInPlace(task.accel[k]));
      }
      const dl = lin.subtract(task.linear), da = ang.subtract(task.angular);
      row.sole[side] = { rolled: stance.feet[f].rolled, ahead: ahead(dl.x, dl.z), up: dl.y, size: dl.length(), spin: da.length() };
    }
    // The ground's push on any segment but the bearing feet, N, from the solver's normal impulses.
    const physics = stand.world.physics, bearingFeet = new Set(bearers.map((side) => `foot.${side}`));
    for (const [name, segment] of stand.built.segments) {
      if (bearingFeet.has(name)) continue;
      for (const contact of physics.contactsOf(segment.body, (other) => other === null)) row.elsewhere += contact.impulse / dt;
    }
    pending.row = row;
    rows.push(row);
  }
  let frame = subject.frame();
  try {
    while (frame.time < seconds && !frame.fallen) { subject.advance(); frame = subject.frame(); }
  } finally { hook.dispose(); subject.dispose(); stand.dispose(); }
  return { model, pace, legs, fell: frame.fallen ? round(frame.time, 2) : null, mean: round(frame.mean), summary: summarize(rows, torque, kin) };
}

/** The steps' means by phase, the torque stages by channel group, and the kinematic readings. */
function summarize(rows, torque, kin) {
  const phases = { double: (r) => r.swung === null, single: (r) => r.swung !== null };
  const out = { steps: rows.length, phases: {} };
  for (const [name, test] of Object.entries(phases)) {
    const rs = rows.filter(test);
    const cop = (cs) => cs.length ? {
      n: cs.length,
      plan: { ahead: round(mean(cs.map((c) => c.plan.ahead))), out: round(mean(cs.map((c) => c.plan.out))) },
      real: { ahead: round(mean(cs.map((c) => c.real.ahead))), out: round(mean(cs.map((c) => c.real.out))) },
      gap: { ahead: round(mean(cs.map((c) => c.real.ahead - c.plan.ahead))), out: round(mean(cs.map((c) => c.real.out - c.plan.out))),
        size: round(mean(cs.map((c) => Math.hypot(c.real.ahead - c.plan.ahead, c.real.out - c.plan.out)))) },
    } : null;
    const cops = rs.map((r) => r.cop);
    const gapOf = (sub) => sub.length ? { n: sub.length, ahead: round(mean(sub.map((r) => r.ground.real.ahead - r.ground.plan.ahead)), 1), up: round(mean(sub.map((r) => r.ground.real.up - r.ground.plan.up)), 1) } : null;
    const modelled = rs.filter((r) => r.model), avg = rs.map((r) => r.averaged).sort((a, b) => a - b), mid = avg[avg.length >> 1] ?? 0;
    out.phases[name] = {
      model: modelled.length ? { n: modelled.length, ahead: round(mean(modelled.map((r) => r.model.ground.ahead - r.model.real.ahead)), 1),
        up: round(mean(modelled.map((r) => r.model.ground.up - r.model.real.up)), 1),
        size: round(mean(modelled.map((r) => Math.hypot(r.model.ground.ahead - r.model.real.ahead, r.model.ground.up - r.model.real.up))), 1),
        moment: round(mean(modelled.map((r) => r.model.moment)), 1) } : null,
      short: { ahead: round(mean(rs.map((r) => r.short.ahead)), 1), up: round(mean(rs.map((r) => r.short.up)), 1), moment: round(mean(rs.map((r) => r.short.moment)), 1),
        share: round(rs.filter((r) => Math.hypot(r.short.ahead, r.short.up) > 5 || r.short.moment > 2).length / Math.max(rs.length, 1)) },
      sole: (() => { const ss = rs.flatMap((r) => Object.values(r.sole ?? {})), flat = ss.filter((x) => !x.rolled), rolled = ss.filter((x) => x.rolled);
        const of = (xs) => xs.length ? { n: xs.length, ahead: round(mean(xs.map((x) => x.ahead)), 3), up: round(mean(xs.map((x) => x.up)), 3), size: round(mean(xs.map((x) => x.size)), 3), spin: round(mean(xs.map((x) => x.spin)), 3) } : null;
        return { flat: of(flat), rolled: of(rolled) }; })(),
      elsewhere: { mean: round(mean(rs.map((r) => r.elsewhere)), 1), share: round(rs.filter((r) => r.elsewhere > 20).length / Math.max(rs.length, 1)),
        touched: gapOf(rs.filter((r) => r.elsewhere > 20)), clear: gapOf(rs.filter((r) => r.elsewhere <= 20)) },
      clipped: gapOf(rs.filter((r) => r.clipped)), unclipped: gapOf(rs.filter((r) => !r.clipped)),
      averaged: { median: round(mid, 1), below: gapOf(rs.filter((r) => r.averaged <= mid)), above: gapOf(rs.filter((r) => r.averaged > mid)) },
      share: round(rs.length / Math.max(rows.length, 1)),
      flat: cop(cops.filter((c) => !c.rolled)), rolled: cop(cops.filter((c) => c.rolled)),
      ground: { plan: { ahead: round(mean(rs.map((r) => r.ground.plan.ahead)), 1), up: round(mean(rs.map((r) => r.ground.plan.up)), 0) },
        real: { ahead: round(mean(rs.map((r) => r.ground.real.ahead)), 1), up: round(mean(rs.map((r) => r.ground.real.up)), 0) },
        swing: { plan: round(Math.sqrt(mean(rs.map((r) => r.ground.plan.ahead * r.ground.plan.ahead)) ?? 0), 1), real: round(Math.sqrt(mean(rs.map((r) => r.ground.real.ahead * r.ground.real.ahead)) ?? 0), 1) },
        gap: { ahead: round(mean(rs.map((r) => r.ground.real.ahead - r.ground.plan.ahead)), 1), up: round(mean(rs.map((r) => r.ground.real.up - r.ground.plan.up)), 1),
          size: round(mean(rs.map((r) => Math.hypot(r.ground.real.ahead - r.ground.plan.ahead, r.ground.real.up - r.ground.plan.up))), 1) } },
      root: { gap: { ahead: round(mean(rs.map((r) => r.root.real.ahead - r.root.plan.ahead)), 2), up: round(mean(rs.map((r) => r.root.real.up - r.root.plan.up)), 2),
        size: round(mean(rs.map((r) => Math.hypot(r.root.real.ahead - r.root.plan.ahead, r.root.real.up - r.root.plan.up))), 2) } },
    };
  }
  out.torque = Object.fromEntries(Object.entries(torque).map(([k, t]) => [k, { asked: round(t.asked / t.n, 1), got: round(t.got / t.n, 1), gap: round(t.gap / t.n, 1), full: round(t.full / t.n), n: t.n, strength: round(t.slowed / t.n, 2), speed: round(t.speed / t.n, 2) }]));
  out.kinematic = {
    landing: round(mean(kin.landings.slice(2))), landings: Math.max(kin.landings.length - 2, 0),
    nearStop: Object.fromEntries(Object.entries(kin.nearStop).map(([k, n]) => [k, round(n / kin.legSteps)])),
    nearStraight: round(kin.nearStraight / Math.max(kin.legSteps, 1)),
    limit: Object.fromEntries(Object.entries(kin.limit).map(([k, n]) => [k, { share: round(n / kin.legSteps), torque: round(kin.limitTorque[k] / n, 1) }])),
  };
  return out;
}

/** The Lab's Run on the forward line, its legs the stride's or the stance's own walk. */
function running(stand, { labActor, startLocomotion, trackOf, LAB_PRESETS, STRIDE }, legs, stride, pace) {
  const locomotion = legs === "stride" ? { kind: "stride", ...STRIDE, ...stride } : null;
  const mind = { ...LAB_PRESETS.script.config, ...(locomotion ? { locomotion } : {}) };
  const run = startLocomotion(labActor(stand.built, stand.world, { mind, measuring: true }), trackOf(LINE.pieces), { top: pace, facing: LINE.facing });
  const { body } = run;
  return { muscles: body.muscles, stance: body.state.mind.host.motor.stance, reading: body.view.stance, down: () => body.view.down,
    advance: () => stand.step(stand.seconds(0.1)), frame: () => run.frame(), dispose: () => run.dispose() };
}

/** The sway's reach forward and back of the soles' middle, m. */
const SWAY = 0.04;
/** How long the body stands before it sways, s. */
const SETTLE = 1;

/**
 * The control fixture: the stance alone on both feet at the height a fight stands at, no gait, its
 * centre of mass swayed forward and back over the soles' middle at `hz`.
 */
async function swaying(stand, hz) {
  const [{ motorControl }, { driveMuscles }, { standingHeight }, { STANCE_LOWER }] = await Promise.all([import("../src/core/control/motor.ts"),
    import("../src/core/muscle/driver.ts"), import("../src/core/control/support.ts"), import("../src/core/skills/locomotion.ts")]);
  const motor = motorControl(stand.built, 0.1, {});
  // The stance reads the body before each command, as a body's own step has it (`src/core/body.ts`).
  const driver = driveMuscles(stand.built, stand.world, (muscles, dt) => { motor.stance.read(); motor.control(muscles, dt); }), reading = motor.stance.reading;
  const height = standingHeight(stand.built) - STANCE_LOWER, feet = ["left", "right"];
  motor.setStance({ feet, centre: null, height, heading: 0 });
  stand.step(stand.seconds(SETTLE));
  const mid = reading.soles.left.add(reading.soles.right).scaleInPlace(0.5), start = stand.world.time;
  const fallen = () => reading.centre.y - reading.support.y < 0.6 * height;
  return {
    muscles: driver, stance: motor.state.stance, reading, down: fallen,
    advance() {
      for (let k = stand.seconds(0.1); k > 0; k--) {
        const ahead = SWAY * Math.sin(2 * Math.PI * hz * (stand.world.time - start));
        motor.setStance({ feet, centre: [mid.x, mid.z + ahead], height, heading: 0 });
        stand.step(1);
      }
    },
    frame: () => ({ time: stand.world.time, fallen: fallen(), mean: null }),
    dispose: () => driver.dispose(),
  };
}

if (!isMainThread) {
  parentPort.on("message", async (job) => {
    try { parentPort.postMessage({ id: job.id, result: await runOnce(job) }); }
    catch (error) { parentPort.postMessage({ id: job.id, error: String(error?.stack ?? error) }); }
  });
} else {
  const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
  const list = (name, fallback) => arg(name, fallback).split(",");
  const models = list("models", "workshop-fighter,workshop-rogue"), paces = list("paces", "0,0.5,1.2").map(Number), legsList = list("legs", "stride,stance");
  const scale = Object.fromEntries((arg("scale", "") || "").split(";").filter(Boolean).map((x) => { const [k, v] = x.split("="); return [k, Number(v)]; }));
  const stride = Object.fromEntries((arg("stride", "") || "").split(";").filter(Boolean).map((x) => { const [k, v] = x.split("="); return [k, Number(v)]; }));
  const seconds = Number(arg("seconds", "12")), from = Number(arg("from", "3")), out = arg("out");
  const workers = Math.min(Number(arg("workers", String(Math.max(1, availableParallelism() - 2)))), 64);
  const jobs = [];
  for (const model of models) for (const legs of legsList) for (const pace of paces) jobs.push({ id: jobs.length, model, legs, pace, seconds, from, scale, stride });
  const results = [];
  await new Promise((resolve, reject) => {
    let next = 0, done = 0;
    const pool = Array.from({ length: Math.min(workers, jobs.length) }, () => new Worker(fileURLToPath(import.meta.url)));
    const feed = (worker) => { if (next < jobs.length) worker.postMessage(jobs[next++]); };
    for (const worker of pool) {
      worker.on("message", ({ result, error }) => {
        if (error) { pool.forEach((w) => w.terminate()); reject(new Error(error)); return; }
        results.push(result);
        if (out) appendFileSync(out, `${JSON.stringify(result)}\n`);
        if (++done === jobs.length) { pool.forEach((w) => w.terminate()); resolve(); } else feed(worker);
      });
      worker.on("error", reject);
      feed(worker);
    }
  });
  console.log(`Node stand, Rapier, 120 Hz, no wind, ${seconds} s, read from ${from} s`);
  results.sort((a, b) => a.id - b.id);
  for (const job of jobs) {
    const r = results.find((x) => x.model === job.model && x.legs === job.legs && x.pace === job.pace), s = r.summary;
    console.log(`\n${r.model} ${r.legs} asked ${r.pace}: ${r.fell === null ? "held" : `fell at ${r.fell} s`}, ${r.mean} m/s along, ${s.steps} steps`);
    for (const [name, p] of Object.entries(s.phases)) {
      const cop = (c) => c ? `n ${c.n} plan ${c.plan.ahead}/${c.plan.out} real ${c.real.ahead}/${c.real.out} gap ${c.gap.ahead}/${c.gap.out} |${c.gap.size}| m` : "-";
      console.log(`  ${name} (${p.share}): flat ${cop(p.flat)}; rolled ${cop(p.rolled)}`);
      const g = (x) => x ? `${x.ahead}/${x.up} (n ${x.n})` : "-";
      if (p.model) console.log(`    model less realised, ahead/up ${p.model.ahead}/${p.model.up} |${p.model.size}| N, moment |${p.model.moment}| N m; ground gap clipped ${g(p.clipped)} unclipped ${g(p.unclipped)}; averaging (median ${p.averaged.median} N m) below ${g(p.averaged.below)} above ${g(p.averaged.above)}`);
      const sl = (x) => x ? `ahead ${x.ahead} up ${x.up} |${x.size}| m/s2, spin |${x.spin}| rad/s2 (n ${x.n})` : "-";
      console.log(`    bearing sole's planned acceleration less its task's: flat ${sl(p.sole.flat)}; rolled ${sl(p.sole.rolled)}`);
      console.log(`    shortfall (the wrench the soles cannot give) ahead/up ${p.short.ahead}/${p.short.up} N, moment ${p.short.moment} N m, on ${p.short.share} of steps`);
      console.log(`    ground on other segments ${p.elsewhere.mean} N mean, ${p.elsewhere.share} of steps over 20 N: gap there ${g(p.elsewhere.touched)}, clear ${g(p.elsewhere.clear)}`);
      console.log(`    ground force ahead/up plan ${p.ground.plan.ahead}/${p.ground.plan.up} real ${p.ground.real.ahead}/${p.ground.real.up} gap ${p.ground.gap.ahead}/${p.ground.gap.up} |${p.ground.gap.size}| N, ahead rms plan ${p.ground.swing.plan} real ${p.ground.swing.real} N; root accel gap ahead/up ${p.root.gap.ahead}/${p.root.gap.up} |${p.root.gap.size}| m/s2`);
    }
    console.log(`  torque asked/got/gap N m: ${Object.entries(s.torque).map(([k, t]) => `${k} ${t.asked}/${t.got}/${t.gap} (full ${t.full} of ${t.n}, strength ${t.strength} of peak, shortening ${t.speed} rad/s)`).join("; ")}`);
    console.log(`  kinematic: landing ${s.kinematic.landing} m over ${s.kinematic.landings}; near straight ${s.kinematic.nearStraight}; near a stop ${JSON.stringify(s.kinematic.nearStop)}; stop pushing ${JSON.stringify(s.kinematic.limit)}`);
  }
}
