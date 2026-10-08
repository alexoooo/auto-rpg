/**
 * **Man's passive toe on the game's solver** (`docs/reference/man-passive-toes.md`): one foot of
 * the Warrior, cut at the ball (`assets/humanoid/man-contact-geometry.json`), on the arena's ground,
 * built through the core's Rapier world (`createRapierPhysics`: `SOLVER`'s iterations, the contract's
 * friction) and not through the core's body.
 *
 * - **Foot**: the cut foot's hull carrying half the Warrior's mass less the toes, the rest of that
 *   half at the spec's ankle centre; free to translate and not to turn, the rest of the body and the
 *   ankle's muscles holding its turn. Its weight is ramped from none to full over `RAMP` and held
 *   for `HOLD`. A leg on the ankle's velocity motor with its turn held instead made the foot creep
 *   along the ground at up to 8 mm/s, the rigid foot as much as the cut one, where a foot holding
 *   its own turn does not: an artefact of that fixture, recorded with the results.
 * - **Toes**: the cut toes' hull and their share of the foot's mass by volume, weighing from the
 *   start, on a hinge at `mtp` with `TOE`'s range and a ForceBased position motor at `TOE`'s rest,
 *   stiffness and `DAMPING`.
 *
 * Load cases (`CASES`): flat; flat with a known moment lifting the toes off the ground, the spring's
 * control, whose prediction needs no contact reading; the heel raised, the foot turned heel-up
 * about the hinge; and the foot near vertical as in a kneel on the toes. Each is built with the toes
 * at rest, turned with the foot, and clear of the ground: the load bends them. Configurations (`CONFIGS`): 120 Hz with `SOLVER`; 480 Hz read at
 * 120 Hz's spacing; 120 Hz with four times the iterations; the toes on a fixed joint; and one rigid
 * foot (`rigidFoot`'s hull, the foot's whole mass); and, to test the light toes against the heavy
 * foot as the cause, 120 Hz with the toes' mass and moments ten and a hundred times theirs and their
 * weight kept (`conditioned`), which is solver conditioning and not anatomy.
 *
 * Read every 1/120 s over the hold: the hinge's separation, the toe's angle, the moment the ground's
 * normal pushes put on the toes about the hinge with the toes' weight and any applied moment, the
 * spring's torque from its step impulse beside the torque its law gives at that angle and speed, the
 * deepest any piece sinks into the ground, the foot's creep along it, and the fixture's mechanical
 * energy (motion, height, the spring). The static prediction is `TOE.rest` plus that moment over
 * the stiffness, each averaged over the last second.
 *
 *   node research/man-toe-solver.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Scene } from "@babylonjs/core/scene.js";
import { addArenaSolids } from "../src/arena/room.ts";
import { createRapierPhysics, rapierModule } from "../src/core/engine/rapier.ts";
import { FIT_SCALE } from "../src/core/human/model.ts";
import { modelSpec } from "../src/core/models.ts";
import { STANDARD_GRAVITY } from "../src/core/spec/constants.ts";
import { hullSolid } from "../scripts/core/man-envelope.mjs";
import { AUDITED, TOE } from "./core-posture-trials.mjs";
import MAN from "../assets/humanoid/man-contact-geometry.json" with { type: "json" };

/** The toe's damping, N m s/rad: `SOURCES["falisse-2022-toes"]`. */
const DAMPING = 2;
const RAMP = 1, HOLD = 3, LAST = 1;
/** The spring's motor ceiling, N m: far above any moment here, so that it never binds. Rapier reads it in single precision, where `Number.MAX_VALUE` is infinite and the motor gives nothing. */
const UNBOUND = 1e6;
/**
 * The foot's turn heel-up about the hinge, rad, a chosen case each: a heel raise, and a kneel on the
 * toes 0.12 rad short of `TOE.lo`; `torque` is a moment applied to the toes about the hinge, N m,
 * positive plantarflexing.
 */
const CASES = [
  { name: "flat", turn: 0 },
  { name: "flat, toes lifted", turn: 0, torque: -2 },
  { name: "heel raised", turn: 0.5 },
  { name: "kneel on toes", turn: 1.45 },
];
const CONFIGS = [
  { name: "120 Hz", hz: 120, every: 1, iterations: 1, toe: "passive" },
  { name: "480 Hz", hz: 480, every: 4, iterations: 1, toe: "passive" },
  { name: "120 Hz, 4x iterations", hz: 120, every: 1, iterations: 4, toe: "passive" },
  { name: "toe locked", hz: 120, every: 1, iterations: 1, toe: "locked" },
  { name: "rigid foot", hz: 120, every: 1, iterations: 1, toe: "none" },
  { name: "toes x10, 120 Hz", hz: 120, every: 1, iterations: 1, toe: "passive", conditioned: 10 },
  { name: "toes x100, 120 Hz", hz: 120, every: 1, iterations: 1, toe: "passive", conditioned: 100 },
];
/** Above the ground at build, m: the lowest corner's clearance. */
const CLEARANCE = 0.0005;

const R = await rapierModule();
const scene = new Scene(new NullEngine());
const spec = modelSpec(AUDITED);
const SIDE = "left";
const footSpec = spec.segments.find((s) => s.name === `foot.${SIDE}`);
const ankle = spec.joints.find((j) => j.name === `ankle.${SIDE}`);
const g = STANDARD_GRAVITY.value;
const legMass = spec.mass.value / 2 - footSpec.mass.value;
const geometry = MAN[SIDE];
const fit = (p) => p.map((c) => c * FIT_SCALE.value);
const hinge = fit(geometry.mtp.centre);
const axis = geometry.mtp.axis;
const toeShare = geometry.toes.solid.volume / (geometry.toes.solid.volume + geometry.foot.solid.volume);

/** A symmetric 3x3's eigenvalues and eigenvectors (columns), by Jacobi's rotations. */
function eigen(m) {
  const a = m.map((row) => [...row]), v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-18) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) {
        const kp = a[k][p], kq = a[k][q];
        a[k][p] = c * kp - s * kq; a[k][q] = s * kp + c * kq;
      }
      for (let k = 0; k < 3; k++) {
        const pk = a[p][k], qk = a[q][k];
        a[p][k] = c * pk - s * qk; a[q][k] = s * pk + c * qk;
      }
      for (let k = 0; k < 3; k++) {
        const kp = v[k][p], kq = v[k][q];
        v[k][p] = c * kp - s * kq; v[k][q] = s * kp + c * kq;
      }
    }
  }
  return { values: [a[0][0], a[1][1], a[2][2]], vectors: v };
}

/** A solid's mass properties at `mass` kg, at the fit scale: principal moments and their turn. */
function massOf(solid, mass) {
  const tensor = solid.inertia.map((row) => row.map((c) => c * mass * FIT_SCALE.value * FIT_SCALE.value));
  const { values, vectors: v } = eigen(tensor);
  // A right-handed frame: the third axis the cross of the first two.
  const det = v[0][0] * (v[1][1] * v[2][2] - v[2][1] * v[1][2]) - v[0][1] * (v[1][0] * v[2][2] - v[2][0] * v[1][2]) + v[0][2] * (v[1][0] * v[2][1] - v[2][0] * v[1][1]);
  if (det < 0) for (let k = 0; k < 3; k++) v[k][2] = -v[k][2];
  const matrix = Matrix.FromValues(v[0][0], v[1][0], v[2][0], 0, v[0][1], v[1][1], v[2][1], 0, v[0][2], v[1][2], v[2][2], 0, 0, 0, 0, 1);
  return { mass, centre: fit(solid.centre), moments: values, orientation: Quaternion.FromRotationMatrix(matrix), tensor };
}

const turnAbout = (u, angle) => Quaternion.RotationAxis(new Vector3(...u), angle);
/** `p` turned by `q` about `c`. */
function turnedAbout(p, q, c) {
  const v = new Vector3(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
  v.applyRotationQuaternionInPlace(q);
  return [v.x + c[0], v.y + c[1], v.z + c[2]];
}
const toWorld = (rigid, p) => {
  const t = rigid.translation(), r = rigid.rotation();
  const v = new Vector3(...p).applyRotationQuaternionInPlace(new Quaternion(r.x, r.y, r.z, r.w));
  return [v.x + t.x, v.y + t.y, v.z + t.z];
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => Math.sqrt(dot(a, a));

/** One run: `config` on `kase`. Its readings over the hold, and the summary. */
function run(kase, config) {
  const physics = createRapierPhysics(R, { hz: config.hz, gravity: true }, "man-toe-solver", true, false);
  const raw = physics.raw;
  raw.numSolverIterations *= config.iterations;
  addArenaSolids(physics);
  const turn = turnAbout(axis, kase.turn);
  const pieces = config.toe === "none"
    ? [{ name: "foot", hull: geometry.rigidFoot.hull.map(fit), props: massOf(hullSolid(geometry.rigidFoot.hull), footSpec.mass.value), turned: true }]
    : [{ name: "foot", hull: geometry.foot.hull.map(fit), props: massOf(geometry.foot.solid, footSpec.mass.value * (1 - toeShare)), turned: true },
      { name: "toes", hull: geometry.toes.hull.map(fit), props: massOf(geometry.toes.solid, footSpec.mass.value * toeShare * (config.conditioned ?? 1)), turned: true }];
  // The whole posed, then lifted so that its lowest corner clears the ground.
  const posedPoints = pieces.flatMap((p) => p.hull.map((x) => (p.turned ? turnedAbout(x, turn, hinge) : x)));
  const lift = CLEARANCE - Math.min(...posedPoints.map((p) => p[1]));
  const nodeAt = (name, turned) => {
    const node = new TransformNode(name, scene);
    const q = turned ? turn.clone() : Quaternion.Identity();
    const origin = turned ? turnedAbout([0, 0, 0], q, hinge) : [0, 0, 0];
    node.position.set(origin[0], origin[1] + lift, origin[2]);
    node.rotationQuaternion = q;
    return node;
  };
  // The half-body's load rides on the foot at the ankle: one centre, the foot's own moments, which a held turn never reads.
  const foot = pieces[0].props, whole = foot.mass + legMass;
  pieces[0].props = { ...foot, mass: whole, centre: foot.centre.map((c, k) => (foot.mass * c + legMass * ankle.centre.value[k]) / whole),
    tensor: foot.tensor.map((row) => row.map((c) => (c * whole) / foot.mass)) };
  const bodies = {};
  for (const piece of pieces) {
    const { mass, centre, moments, orientation } = piece.props;
    bodies[piece.name] = physics.addBody(nodeAt(piece.name, piece.turned), [{ kind: "hull", points: piece.hull }], { mass, centre, moments, orientation });
  }
  bodies.foot.rigid.setEnabledRotations(false, false, false, true);
  if (config.conditioned) bodies.toes.rigid.setGravityScale(1 / config.conditioned, true);
  bodies.foot.rigid.setGravityScale(0, true);
  const frameOf = (u) => { const q = new Quaternion(); Quaternion.FromUnitVectorsToRef(new Vector3(1, 0, 0), new Vector3(...u), q); return q; };
  let toeJoint = null;
  if (config.toe === "passive") {
    const toeFrame = frameOf(axis);
    toeJoint = physics.addJoint(bodies.foot, bodies.toes, { anchorParent: hinge, anchorChild: hinge, frameParent: toeFrame, frameChild: toeFrame, limits: [[TOE.lo, TOE.hi]] });
    const set = raw.impulseJoints.raw, handle = toeJoint.raw.handle;
    set.jointConfigureMotorModel(handle, R.JointAxis.AngX, R.MotorModel.ForceBased);
    set.jointConfigureMotorPosition(handle, R.JointAxis.AngX, TOE.rest, TOE.stiffness, DAMPING);
    set.jointSetMotorMaxForce(handle, R.JointAxis.AngX, UNBOUND);
  } else if (config.toe === "locked") {
    const xyzw = (q) => ({ x: q.x, y: q.y, z: q.z, w: q.w }), xyz = (p) => ({ x: p[0], y: p[1], z: p[2] });
    const data = R.JointData.fixed(xyz(hinge), xyzw(Quaternion.Identity()), xyz(hinge), xyzw(Quaternion.Identity()));
    raw.createImpulseJoint(data, bodies.foot.rigid, bodies.toes.rigid, true).setContactsEnabled(false);
  }

  const dt = 1 / config.hz, steps = Math.round((RAMP + HOLD) * config.hz);
  const samples = [];
  const toeAngle = () => {
    const f = bodies.foot.rigid.rotation(), t = bodies.toes.rigid.rotation();
    const rel = Quaternion.Inverse(new Quaternion(f.x, f.y, f.z, f.w)).multiply(new Quaternion(t.x, t.y, t.z, t.w));
    const s = rel.w < 0 ? -1 : 1;
    return 2 * Math.atan2(s * (rel.x * axis[0] + rel.y * axis[1] + rel.z * axis[2]), s * rel.w);
  };
  const energyOf = () => {
    let e = 0;
    for (const piece of pieces) {
      const rigid = bodies[piece.name].rigid, v = rigid.linvel(), w = rigid.angvel(), c = rigid.worldCom(), r = rigid.rotation();
      const { mass, tensor } = piece.props;
      // The angular velocity in the body's frame, against the tensor there.
      const local = new Vector3(w.x, w.y, w.z).applyRotationQuaternionInPlace(Quaternion.Inverse(new Quaternion(r.x, r.y, r.z, r.w)));
      const l = [local.x, local.y, local.z], Iw = tensor.map((row) => dot(row, l));
      e += 0.5 * mass * (v.x * v.x + v.y * v.y + v.z * v.z) + 0.5 * dot(l, Iw) + mass * rigid.gravityScale() * g * c.y;
    }
    if (toeJoint) { const a = toeAngle() - TOE.rest; e += 0.5 * TOE.stiffness * a * a; }
    return e;
  };
  /** The hinge's axis in the world, as the foot carries it. */
  const axisNow = () => {
    const r = bodies.foot.rigid.rotation();
    const a = new Vector3(...axis).applyRotationQuaternionInPlace(new Quaternion(r.x, r.y, r.z, r.w));
    return [a.x, a.y, a.z];
  };
  const footStart = bodies.foot.rigid.worldCom();
  let footAtHold = null;
  for (let step = 1; step <= steps; step++) {
    const t = step * dt;
    bodies.foot.rigid.setGravityScale(Math.min(1, t / RAMP), true);
    // The applied moment acts between the toes and the foot, as a muscle's would.
    if (kase.torque && bodies.toes) {
      const u = axisNow();
      bodies.toes.applyTorque(new Vector3(...u).scale(kase.torque));
      bodies.foot.applyTorque(new Vector3(...u).scale(-kase.torque));
    }
    physics.step(dt);
    if (Math.abs(t - (RAMP + HOLD - LAST)) < dt / 2) { const c = bodies.foot.rigid.worldCom(); footAtHold = [c.x, c.y, c.z]; }
    if (step % config.every !== 0 || t <= RAMP + 1e-9) continue;
    const sample = { t, energy: energyOf() };
    if (config.toe !== "none") {
      sample.separation = norm(sub(toWorld(bodies.foot.rigid, hinge), toWorld(bodies.toes.rigid, hinge)));
      // The ground's pushes on the toes and their weight, about the hinge, positive plantarflexing.
      const c = toWorld(bodies.toes.rigid, hinge), u = axisNow();
      let moment = kase.torque ?? 0;
      for (const contact of physics.contactsOf(bodies.toes)) {
        const force = contact.normal.map((n) => (-n * contact.impulse) / dt);
        moment += dot(cross(sub(contact.point, c), force), u);
      }
      const com = bodies.toes.rigid.worldCom();
      moment += dot(cross(sub([com.x, com.y, com.z], c), [0, (-bodies.toes.rigid.mass() * g) / (config.conditioned ?? 1), 0]), u);
      sample.moment = moment;
      sample.load = physics.contactsOf(bodies.toes).reduce((s, contact) => s + contact.impulse / dt, 0);
    }
    // How deep the foot is in the ground: the deepest solver point of any piece, m, 0 when clear.
    sample.depth = Math.max(0, ...Object.values(bodies).flatMap((b) => physics.contactManifoldsOf(b).flatMap((m) => m.points.map((p) => -p.distance))));
    if (toeJoint) {
      sample.angle = toeAngle();
      sample.spring = toeJoint.motorStepImpulse(0) / dt;
      // What the spring's law gives at this angle and the toes' speed about the hinge.
      const wf = bodies.foot.rigid.angvel(), wt = bodies.toes.rigid.angvel();
      sample.law = -TOE.stiffness * (sample.angle - TOE.rest) - DAMPING * dot([wt.x - wf.x, wt.y - wf.y, wt.z - wf.z], axisNow());
    }
    samples.push(sample);
  }
  const last = samples.filter((s) => s.t > RAMP + HOLD - LAST + 1e-9);
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const summary = {
    case: kase.name, config: config.name, turn: kase.turn,
    separation: config.toe === "none" ? null : Math.max(...samples.map((s) => s.separation)),
    energyRise: Math.max(...samples.map((s) => s.energy)) - samples[0].energy,
    energyDrift: samples.at(-1).energy - samples[0].energy,
    load: config.toe === "none" ? null : mean(last.map((s) => s.load)),
    depth: Math.max(...last.map((s) => s.depth)),
  };
  const footEnd = bodies.foot.rigid.worldCom();
  // The foot's slide along the ground over the last second, m/s.
  summary.creep = Math.sqrt((footEnd.x - footAtHold[0]) ** 2 + (footEnd.z - footAtHold[2]) ** 2) / LAST;
  summary.settled = footEnd.y - footStart.y;
  if (toeJoint) {
    const angle = mean(last.map((s) => s.angle)), moment = mean(last.map((s) => s.moment));
    summary.angle = angle;
    summary.predicted = TOE.rest + moment / TOE.stiffness;
    summary.moment = moment;
    summary.spring = mean(last.map((s) => s.spring));
    summary.law = mean(last.map((s) => s.law));
    summary.peakToPeak = Math.max(...last.map((s) => s.angle)) - Math.min(...last.map((s) => s.angle));
    const a = angle - TOE.rest;
    summary.springEnergy = 0.5 * TOE.stiffness * a * a;
  }
  physics.dispose();
  return { summary, samples };
}

/** The declared acceptance (`docs/reference/man-passive-toes.md`): each bar, true where met. */
function accept(s) {
  if (s.angle === undefined) return null;
  return {
    separation: s.separation <= 0.001,
    prediction: Math.abs(s.angle - s.predicted) <= 0.05,
    steady: s.peakToPeak <= 0.01,
    energy: s.energyRise <= 0.01 * s.springEnergy,
  };
}

const results = [];
for (const kase of CASES) for (const config of CONFIGS) {
  const { summary } = run(kase, config);
  summary.accept = accept(summary);
  results.push(summary);
}

const f = (v, d = 3) => (v === null || v === undefined ? "-" : v.toFixed(d));
const mark = (ok) => (ok === undefined ? "" : ok ? "" : " ✗");
console.log(`Harness: Node, the core's Rapier world (createRapierPhysics, coordinate limits, SOLVER), ${AUDITED}'s ${SIDE} foot. Foot ${(legMass + footSpec.mass.value * (1 - toeShare)).toFixed(2)} kg, turn held, ramped over ${RAMP} s, held ${HOLD} s; toes ${(footSpec.mass.value * toeShare).toFixed(3)} kg on k ${TOE.stiffness} N m/rad, d ${DAMPING} N m s/rad, range [${f(TOE.lo)}, ${f(TOE.hi)}].\n`);
console.log("| case | configuration | toe, rad | predicted, rad | ground's moment, N m | spring as read, N m | spring by its law, N m | toe load, N | deepest, mm | peak-to-peak, rad | separation, mm | energy rise, J | drift, J | spring energy, J | creep, mm/s |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const s of results) {
  const a = s.accept ?? {};
  console.log(`| ${s.case} | ${s.config} | ${f(s.angle)} | ${f(s.predicted)}${mark(a.prediction)} | ${f(s.moment, 2)} | ${f(s.spring, 2)} | ${f(s.law, 2)} | ${f(s.load, 0)} | ${f(s.depth * 1000, 1)} | ${f(s.peakToPeak, 4)}${mark(a.steady)} | ${s.separation === null ? "-" : f(s.separation * 1000, 3)}${mark(a.separation)} | ${f(s.energyRise, 4)}${mark(a.energy)} | ${f(s.energyDrift, 4)} | ${f(s.springEnergy, 3)} | ${f(s.creep * 1000, 2)} |`);
}
const passive = (name) => results.filter((s) => s.config === name);
const meets = (name) => passive(name).every((s) => Object.values(s.accept).every(Boolean));
console.log(`\nAcceptance at 120 Hz: ${meets("120 Hz") ? "met" : "not met"}; at 480 Hz: ${meets("480 Hz") ? "met" : "not met"}.`);
const out = new URL("./runs/", import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL("man-toe-solver.json", out), JSON.stringify(results, null, 1));
