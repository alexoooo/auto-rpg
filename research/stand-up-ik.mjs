import { pathToFileURL } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { chainTo, pointAtToRef, reachJacobianTo, rootFrameToRef, rotationAtToRef } from "../src/core/control/kinematics.ts";
import { footStatesOf, withinSupport } from "../src/core/control/support.ts";
import { lowsOf } from "../src/core/control/ground.ts";
import { standUpCheckpoint, standUpReplay } from "./stand-up-replay.mjs";

/** Declared numerical search settings, in metres and radians, for the offline pose experiment. */
export const IK_SETTINGS = Object.freeze({ iterations: 180, derivative: .00002, damping: .0001,
  fkPositionTolerance: .001, fkAngularTolerance: .001,
  positionTolerance: .005, angularTolerance: .035, penetrationTolerance: .005,
  maximumStep: .15, collisionWeight: 20, supportWeight: 3, preferenceWeight: .01 });
const vec = v => ({ x: v.x, y: v.y, z: v.z });
const quat = q => ({ x: q.x, y: q.y, z: q.z, w: q.w });
const norm = a => Math.hypot(...a);
const minus = (a, b) => a.map((x, k) => x - b[k]);

/** Native collider queries receive calculated poses; the physical body and its nodes are read only. */
export function standUpKinematics(f) {
  const { built } = f.stand, o = f.observe(), channels = f.stance.body.muscles.channels;
  const root = built.segments.get("lowerTrunk"), frame = rootFrameToRef(root,
    { position: new Vector3(), rotation: new Quaternion() });
  const measured = o.joints.map(j => j.angle), parts = [...built.segments.values()];
  const rootPosition = root.node.position.clone();
  const centres = new Map(parts.map(part => [part, [...part.body.massProperties.centre]]));
  const indices = new Map(channels.map((c, i) => [c.name, i]));
  const jointIndices = new Map([...built.joints.values()].map(j => [j,
    j.dofs.map((_, k) => indices.get(channels.find(c => c.joint === j && c.index === k).name))]));
  const chains = new Map(parts.map(p => [p, chainTo(built, p)]));
  const colliders = new Map(parts.map(part => [part, Array.from({ length: part.body.rigid.numColliders() }, (_, k) => {
    const c = part.body.rigid.collider(k), p = c.translationWrtParent(), q = c.rotationWrtParent();
    return { shape: c.shape, local: new Vector3(p.x, p.y, p.z), turn: new Quaternion(q.x, q.y, q.z, q.w) };
  })]));
  const lows = new Map(parts.map(part => [part, (part.poses?.[part.handPose?.applied]?.rigid ?? part.rigid)
    .shapes.flatMap(shape => lowsOf(shape, part.frame)).map(low => ({
      local: new Vector3(...low.at).subtractInPlace(new Vector3(...part.frame.origin))
        .applyRotationQuaternion(Quaternion.Inverse(part.rest)), radius: low.radius }))]));
  const pairs = [];
  for (let a = 0; a < parts.length; a++) for (let b = a + 1; b < parts.length; b++) {
    if ([...built.joints.values()].some(j => (j.parent === parts[a] && j.child === parts[b])
      || (j.parent === parts[b] && j.child === parts[a]))) continue;
    pairs.push([parts[a], parts[b]]);
  }
  const initial = [0, 0, 0, 0, 0, 0, ...measured];
  const ranges = [[-.6, .6], [-.3, .6], [-.6, .6], [-1.5, 1.5], [-1.5, 1.5], [-1.5, 1.5],
    ...channels.map(c => [c.dof.spec.min.value, c.dof.spec.max.value])];
  const mass = parts.reduce((sum, p) => sum + p.rigid.mass, 0);
  const poses = x => {
    const rotation = Quaternion.RotationYawPitchRoll(x[4], x[3], x[5]).multiply(frame.rotation);
    const translation = rootPosition.add(new Vector3(x[0], x[1], x[2]))
      .subtractInPlace(new Vector3(...root.frame.origin).applyRotationQuaternion(rotation)), out = new Map();
    for (const part of parts) {
      const chain = chains.get(part), along = chain.map(j => jointIndices.get(j).map(i => x[i + 6]));
      const at = chain.length ? pointAtToRef(chain, along, part.frame.origin, new Vector3()) : new Vector3(...part.frame.origin);
      let turn = new Quaternion();
      chain.forEach((j, k) => { turn = turn.multiply(rotationAtToRef(j, along[k], new Quaternion())); });
      out.set(part.spec.name, { position: at.applyRotationQuaternion(rotation).addInPlace(translation),
        rotation: rotation.multiply(turn).multiply(part.rest) });
    }
    return out;
  };
  const point = (p, name, local) => new Vector3(...local).applyRotationQuaternion(p.get(name).rotation).addInPlace(p.get(name).position).asArray();
  const centre = p => {
    const out = new Vector3();
    for (const part of parts) out.addInPlace(new Vector3(...centres.get(part))
      .applyRotationQuaternion(p.get(part.spec.name).rotation).addInPlace(p.get(part.spec.name).position).scaleInPlace(part.rigid.mass / mass));
    return out.asArray();
  };
  const contacts = p => {
    const geometry = new Map(parts.map(part => [part, colliders.get(part).map(c => ({ shape: c.shape,
      position: vec(c.local.applyRotationQuaternion(p.get(part.spec.name).rotation).addInPlace(p.get(part.spec.name).position)),
      rotation: quat(p.get(part.spec.name).rotation.multiply(c.turn)) }))]));
    const result = [];
    for (const part of parts) {
      let distance = Infinity;
      for (const low of lows.get(part)) {
        const y = low.local.applyRotationQuaternion(p.get(part.spec.name).rotation).y + p.get(part.spec.name).position.y - low.radius;
        distance = Math.min(distance, y);
      }
      result.push({ pair: [part.spec.name, "floor"], distance });
    }
    for (const [a, b] of pairs) {
      let distance = Infinity;
      for (const A of geometry.get(a)) for (const B of geometry.get(b)) {
        const c = A.shape.contactShape(A.position, A.rotation, B.shape, B.position, B.rotation, .015);
        if (c) distance = Math.min(distance, c.distance);
      }
      result.push({ pair: [a.spec.name, b.spec.name], distance });
    }
    return result;
  };
  const retained = o.contacts.filter(c => c.fixed !== null && c.impulse > 0
    && ["hand.left", "hand.right", "shank.right"].includes(c.segment)).map(c => {
    const p = o.segments.find(p => p.name === c.segment);
    return { name: c.segment, at: new Vector3(...c.point).subtractInPlace(new Vector3(...p.position))
      .applyRotationQuaternion(Quaternion.Inverse(new Quaternion(...p.rotation))).asArray(), target: [...c.point] };
  });
  const patches = o.contacts.filter(c => c.fixed !== null && c.impulse > 0
    && retained.some(a => a.name === c.segment)).map(c => ({ corners: (c.patch?.filter(p => -p.normal[1] >= .9 && p.distance <= .005)
      .map(p => new Vector3(...p.point))) ?? [new Vector3(...c.point)] })).filter(p => p.corners.length);
  const foot = footStatesOf(built).find(p => p.side === "left"), sole = foot.sole.reduce((sum, p) => sum.addInPlace(p), new Vector3()).scaleInPlace(1 / foot.sole.length).asArray();
  const leg = built.spec.segments.filter(p => /^(thigh|shank)\.left$/.test(p.name))
    .reduce((sum, p) => sum + norm(minus(p.proximal.value, p.distal.value)), 0);
  const yaw = Math.atan2(-Vector3.Right().applyRotationQuaternion(frame.rotation).z, Vector3.Right().applyRotationQuaternion(frame.rotation).x);
  const offset = new Vector3(-leg * .2, 0, leg * .3).applyRotationQuaternion(Quaternion.RotationYawPitchRoll(yaw, 0, 0));
  const target = [root.node.position.x + offset.x, 0, root.node.position.z + offset.z];
  const targetRotation = Quaternion.RotationYawPitchRoll(yaw, 0, 0).multiply(foot.segment.rest);
  const initialPoses = poses(initial);
  const fkError = { position: Math.max(...o.segments.map(s => norm(minus(initialPoses.get(s.name).position.asArray(), s.position)))),
    orientation: Math.max(...o.segments.map(s => {
      const turn = Quaternion.Inverse(new Quaternion(...s.rotation)).multiply(initialPoses.get(s.name).rotation).normalize();
      return 2 * Math.atan2(Math.hypot(turn.x, turn.y, turn.z), Math.abs(turn.w));
    })) };
  const derivatives = () => {
    const columns = [];
    for (const name of ["foot.left", "hand.right"]) {
      const part = built.segments.get(name), chain = chains.get(part), angles = chain.map(j => jointIndices.get(j).map(i => initial[i + 6]));
      const local = name === "foot.left" ? sole : retained.find(a => a.name === name)?.at ?? [0, 0, 0];
      const reference = new Vector3(...local).applyRotationQuaternion(part.rest).addInPlace(new Vector3(...part.frame.origin)).asArray();
      const free = chain.flatMap((j, joint) => j.dofs.map((d, k) => ({ joint, k, min: d.spec.min.value, max: d.spec.max.value, preferred: angles[joint][k] })));
      const jacobian = reachJacobianTo([], chain, angles, free, reference);
      free.forEach((freedom, k) => {
        const index = jointIndices.get(chain[freedom.joint])[freedom.k] + 6, hi = [...initial], lo = [...initial];
        hi[index] += IK_SETTINGS.derivative; lo[index] -= IK_SETTINGS.derivative;
        const numeric = minus(point(poses(hi), name, local), point(poses(lo), name, local)).map(v => v / (2 * IK_SETTINGS.derivative));
        const analytic = new Vector3(...jacobian[k]).applyRotationQuaternion(frame.rotation).asArray();
        columns.push({ name, variable: channels[index - 6].name, error: norm(minus(numeric, analytic)) });
      });
      const at = new Vector3(...point(initialPoses, name, local)).subtractInPlace(rootPosition);
      for (let k = 0; k < 6; k++) {
        const hi = [...initial], lo = [...initial]; hi[k] += IK_SETTINGS.derivative; lo[k] -= IK_SETTINGS.derivative;
        const numeric = minus(point(poses(hi), name, local), point(poses(lo), name, local)).map(v => v / (2 * IK_SETTINGS.derivative));
        const axis = new Vector3(k % 3 === 0 ? 1 : 0, k % 3 === 1 ? 1 : 0, k % 3 === 2 ? 1 : 0);
        const analytic = k < 3 ? axis.asArray() : Vector3.Cross(axis, at).asArray();
        columns.push({ name, variable: `root.${k}`, error: norm(minus(numeric, analytic)) });
      }
    }
    return { maxError: Math.max(...columns.map(c => c.error)), columns };
  };
  const upright = Quaternion.RotationYawPitchRoll(yaw, .2, 0).multiply(Quaternion.Inverse(frame.rotation)).toEulerAngles().asArray();
  return { initial, ranges, channels, poses, point, centre, contacts, retained, patches, sole, target, targetRotation,
    upright, fkError, derivatives, metadata: f.metadata, measured: o };
}

function linear(A, b) {
  const n = b.length, rows = A.map((r, i) => [...r, b[i]]);
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(rows[i][k]) > Math.abs(rows[pivot][k])) pivot = i;
    [rows[k], rows[pivot]] = [rows[pivot], rows[k]];
    if (Math.abs(rows[k][k]) < 1e-14) return null;
    for (let i = k + 1; i < n; i++) {
      const a = rows[i][k] / rows[k][k];
      for (let j = k; j <= n; j++) rows[i][j] -= a * rows[k][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let k = n - 1; k >= 0; k--) {
    let v = rows[k][n]; for (let j = k + 1; j < n; j++) v -= rows[k][j] * x[j];
    x[k] = v / rows[k][k];
  }
  return x;
}

/** Range-bounded damped least squares with explicit reporting of every geometric violation. */
export function solveStandUpPose(model, { variant = "D", seed = model.initial, target = model.target,
  rotation = model.targetRotation, preferred = model.initial, iterations = IK_SETTINGS.iterations,
  rootRotation = null, rootHeight = null, goals = [], selfClearance = -IK_SETTINGS.penetrationTolerance } = {}) {
  if (!["A", "B", "C", "D", "E"].includes(variant)) throw new Error(`unknown IK variant: ${variant}`);
  if (!Number.isFinite(selfClearance) || selfClearance < -IK_SETTINGS.penetrationTolerance)
    throw new Error("self clearance cannot weaken the geometric penetration tolerance");
  const free = model.initial.map((_, k) => k).filter(k => {
    if (k < 6) return variant !== "A";
    const name = model.channels[k - 6].name;
    if (variant === "A") return /^(hip|knee|ankle)\.left /.test(name);
    return variant === "B" ? !/^(lumbar|thoracic|neck)/.test(name) : !/^neck/.test(name);
  });
  const collision = variant === "D" || variant === "E";
  const residual = x => {
    const p = model.poses(x), r = [];
    for (const anchor of model.retained) r.push(...minus(model.point(p, anchor.name, anchor.at), anchor.target).map(v => v * 3));
    if (target) r.push(...minus(model.point(p, "foot.left", model.sole), target));
    if (rotation) {
      const turn = rotation.multiply(Quaternion.Inverse(p.get("foot.left").rotation)).normalize();
      const sign = turn.w < 0 ? -1 : 1; r.push(turn.x * sign * .4, turn.y * sign * .4, turn.z * sign * .4);
    }
    for (const goal of goals) {
      if (goal.target) r.push(...minus(model.point(p, goal.name, goal.at), goal.target));
      if (goal.rotation) {
        const turn = goal.rotation.multiply(Quaternion.Inverse(p.get(goal.name).rotation)).normalize();
        const sign = turn.w < 0 ? -1 : 1;
        r.push(turn.x * sign * .4, turn.y * sign * .4, turn.z * sign * .4);
      }
    }
    if (rootRotation) {
      const turn = rootRotation.multiply(Quaternion.Inverse(p.get("lowerTrunk").rotation)).normalize();
      const sign = turn.w < 0 ? -1 : 1; r.push(turn.x * sign * .8, turn.y * sign * .8, turn.z * sign * .8);
    }
    if (rootHeight !== null) r.push(p.get("lowerTrunk").position.y - rootHeight);
    const c = model.centre(p), near = withinSupport(model.patches, c[0], c[2], 0);
    r.push((c[0] - near[0]) * IK_SETTINGS.supportWeight, (c[2] - near[1]) * IK_SETTINGS.supportWeight);
    if (collision) for (const contact of model.contacts(p)) {
      const clearance = contact.pair.includes("floor") ? -IK_SETTINGS.penetrationTolerance : selfClearance;
      r.push(Math.min(0, contact.distance - clearance) * IK_SETTINGS.collisionWeight);
    }
    for (const k of free) r.push((x[k] - preferred[k]) * IK_SETTINGS.preferenceWeight);
    if (r.some(v => !Number.isFinite(v))) throw new Error(`nonfinite residual ${JSON.stringify({ variant, r, x })}`);
    return r;
  };
  const score = r => r.reduce((s, v) => s + v * v, 0);
  const x = seed.map((v, k) => Math.min(model.ranges[k][1], Math.max(model.ranges[k][0], free.includes(k) ? v : model.initial[k])));
  let r = residual(x), loss = score(r), reason = "iteration budget", count = 0;
  for (; count < iterations; count++) {
    const J = free.map(k => {
      const shifted = [...x]; shifted[k] += IK_SETTINGS.derivative;
      return residual(shifted).map((v, i) => (v - r[i]) / IK_SETTINGS.derivative);
    });
    const A = free.map((_, i) => free.map((_, j) => J[i].reduce((s, v, k) => s + v * J[j][k], 0)
      + (i === j ? IK_SETTINGS.damping : 0)));
    const b = J.map(column => -column.reduce((s, v, k) => s + v * r[k], 0));
    const active = new Set();
    let dx = null;
    for (let bound = 0; bound <= free.length; bound++) {
      const boundedA = A.map((row, i) => row.map((v, j) => active.has(i) || active.has(j) ? (i === j ? 1 : 0) : v));
      dx = linear(boundedA, b.map((v, i) => active.has(i) ? 0 : v));
      if (!dx) break;
      const blocked = free.findIndex((k, i) => !active.has(i) && ((x[k] <= model.ranges[k][0] + 1e-8 && dx[i] < 0)
        || (x[k] >= model.ranges[k][1] - 1e-8 && dx[i] > 0)));
      if (blocked < 0) break;
      active.add(blocked);
    }
    if (!dx) { reason = "singular linearization"; break; }
    if (dx.some(v => !Number.isFinite(v))) throw new Error(`nonfinite linear step ${JSON.stringify({ variant, count, A, b, dx })}`);
    const scale = Math.min(1, IK_SETTINGS.maximumStep / Math.max(...dx.map(Math.abs)));
    let improved = false;
    for (const backtrack of [1, .5, .25, .125, .0625]) {
      const trial = [...x];
      free.forEach((k, i) => { trial[k] = Math.min(model.ranges[k][1], Math.max(model.ranges[k][0], x[k] + dx[i] * scale * backtrack)); });
      const next = residual(trial), nextLoss = score(next);
      if (nextLoss < loss - 1e-12) { x.splice(0, x.length, ...trial); r = next; loss = nextLoss; improved = true; break; }
    }
    if (!improved) { reason = "no decreasing bounded step"; break; }
  }
  const p = model.poses(x), turn = rotation?.multiply(Quaternion.Inverse(p.get("foot.left").rotation)).normalize();
  const footError = target ? norm(minus(model.point(p, "foot.left", model.sole), target)) : 0;
  const angularError = turn ? 2 * Math.atan2(Math.hypot(turn.x, turn.y, turn.z), Math.abs(turn.w)) : 0;
  const retainedErrors = model.retained.map(a => ({ name: a.name, error: norm(minus(model.point(p, a.name, a.at), a.target)) }));
  const violations = model.contacts(p).filter(c => c.distance < -IK_SETTINGS.penetrationTolerance);
  const c = model.centre(p), near = withinSupport(model.patches, c[0], c[2], 0), supportError = Math.hypot(c[0] - near[0], c[2] - near[1]);
  const rootTurn = rootRotation?.multiply(Quaternion.Inverse(p.get("lowerTrunk").rotation)).normalize();
  const rootAngularError = rootTurn ? 2 * Math.atan2(Math.hypot(rootTurn.x, rootTurn.y, rootTurn.z), Math.abs(rootTurn.w)) : 0;
  const rootHeightError = rootHeight === null ? 0 : Math.abs(p.get("lowerTrunk").position.y - rootHeight);
  const goalErrors = goals.map(goal => {
    const turn = goal.rotation?.multiply(Quaternion.Inverse(p.get(goal.name).rotation)).normalize();
    return { name: goal.name, position: goal.target ? norm(minus(model.point(p, goal.name, goal.at), goal.target)) : 0,
      orientation: turn ? 2 * Math.atan2(Math.hypot(turn.x, turn.y, turn.z), Math.abs(turn.w)) : 0 };
  });
  return { variant, x, iterations: count, termination: reason, loss, footError, angularError, retainedErrors,
    supportError, centre: c, root: p.get("lowerTrunk").position.asArray(), violations,
    rootAngularError, rootHeightError, goalErrors,
    pass: footError <= IK_SETTINGS.positionTolerance && angularError <= IK_SETTINGS.angularTolerance
      && rootAngularError <= IK_SETTINGS.angularTolerance && rootHeightError <= IK_SETTINGS.positionTolerance
      && goalErrors.every(e => e.position <= IK_SETTINGS.positionTolerance && e.orientation <= IK_SETTINGS.angularTolerance)
      && retainedErrors.every(e => e.error <= IK_SETTINGS.positionTolerance)
      && supportError <= IK_SETTINGS.positionTolerance && violations.length === 0 };
}

/** The measured seed, two knee bends and two upright root seeds compare the same endpoint objectives. */
export function standUpSeeds(model) {
  return [model.initial, ...[1.5, 2.3].map(knee => {
    const x = [...model.initial];
    for (const [name, value] of Object.entries({ "hip.left flexion": 1.8, "hip.left abduction": .4,
      "hip.left internal rotation": -.3, "knee.left flexion": knee, "ankle.left dorsiflexion": -.4 })) {
      const i = model.channels.findIndex(c => c.name === name); if (i >= 0) x[i + 6] = value;
    }
    return x;
  }), ...[0, .15].map(height => {
    const x = [...model.initial]; x[1] = height;
    x.splice(3, 3, ...model.upright);
    for (const [name, value] of Object.entries({ "hip.left flexion": 1.2, "hip.left abduction": .4,
      "hip.left internal rotation": .3, "knee.left flexion": 1.8, "ankle.left dorsiflexion": -.4,
      "hip.right flexion": .4, "knee.right flexion": 2.4 })) {
      const i = model.channels.findIndex(c => c.name === name); if (i >= 0) x[i + 6] = value;
    }
    return x;
  })];
}

export function compareStandUpIK(model) {
  const seeds = standUpSeeds(model);
  return ["A", "B", "C", "D"].flatMap(variant => seeds.map((seed, seedIndex) => {
    const result = solveStandUpPose(model, { variant, seed });
    console.log(JSON.stringify({ variant, seed: seedIndex, pass: result.pass, loss: result.loss,
      foot: result.footError, angle: result.angularError, supports: result.retainedErrors,
      collision: result.violations, root: result.root }));
    return { ...result, seed: seedIndex };
  }));
}

/** Continuous candidates keep their branch and screen the spaces between every pair of waypoints. */
export function solveStandUpPath(model, { steps = 12, target = model.target, rotation = model.targetRotation,
  rootRotation = null, rootHeight = null, lift = .12 } = {}) {
  if (!Number.isSafeInteger(steps) || steps < 1) throw new Error("a path requires positive integral steps");
  const initialPoses = model.poses(model.initial), footFrom = model.point(initialPoses, "foot.left", model.sole);
  const rootFrom = initialPoses.get("lowerTrunk"), footRotation = initialPoses.get("foot.left").rotation;
  const rows = [], between = [];
  let previous = [...model.initial];
  for (let k = 1; k <= steps; k++) {
    const u = k / steps, s = u * u * (3 - 2 * u);
    const goal = target ? footFrom.map((v, axis) => v + (target[axis] - v) * s + (axis === 1 ? 4 * lift * s * (1 - s) : 0)) : null;
    const row = solveStandUpPose(model, { variant: "E", seed: previous, preferred: previous, target: goal,
      rotation: rotation ? Quaternion.Slerp(footRotation, rotation, s) : null,
      rootRotation: rootRotation ? Quaternion.Slerp(rootFrom.rotation, rootRotation, s) : null,
      rootHeight: rootHeight === null ? null : rootFrom.position.y + (rootHeight - rootFrom.position.y) * s });
    const branchChange = Math.max(...row.x.slice(3).map((v, axis) => Math.abs(v - previous[axis + 3])));
    const translationChange = norm(minus(row.x.slice(0, 3), previous.slice(0, 3)));
    const slices = Math.max(1, Math.ceil(branchChange / .03), Math.ceil(translationChange / .005));
    const faults = [];
    for (let slice = 1; slice < slices; slice++) {
      const t = slice / slices, x = previous.map((v, axis) => v + (row.x[axis] - v) * t), p = model.poses(x);
      const collisions = model.contacts(p).filter(c => c.distance < -IK_SETTINGS.penetrationTolerance);
      const anchors = model.retained.map(a => ({ name: a.name, error: norm(minus(model.point(p, a.name, a.at), a.target)) }))
        .filter(a => a.error > IK_SETTINGS.positionTolerance);
      if (collisions.length || anchors.length) faults.push({ slice, slices, collisions, anchors });
    }
    rows.push({ ...row, fraction: u, branchChange, translationChange });
    between.push({ from: k - 1, to: k, slices, faults });
    if (!row.pass || branchChange > .3 || translationChange > .1 || faults.length) break;
    previous = [...row.x];
  }
  const pass = rows.length === steps && rows.every(r => r.pass && r.branchChange <= .3 && r.translationChange <= .1)
    && between.every(b => b.faults.length === 0);
  return { rows, between, pass, termination: pass ? "screened complete path" : "blocked waypoint" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const checkpointAt = process.argv.indexOf("--checkpoint"), outAt = process.argv.indexOf("--out");
  if (checkpointAt < 0 || outAt < 0) throw new Error("--checkpoint and --out are required");
  const f = await standUpReplay();
  try {
    const bytes = readFileSync(process.argv[checkpointAt + 1]);
    f.restore(standUpCheckpoint(bytes));
    const model = standUpKinematics(f);
    if (model.fkError.position > IK_SETTINGS.fkPositionTolerance || model.fkError.orientation > IK_SETTINGS.fkAngularTolerance)
      throw new Error(`FK mismatch: ${JSON.stringify(model.fkError)}`);
    const derivatives = model.derivatives();
    if (derivatives.maxError > .00002) throw new Error(`derivative mismatch: ${JSON.stringify(derivatives)}`);
    const results = compareStandUpIK(model);
    const path = solveStandUpPath(model);
    writeFileSync(process.argv[outAt + 1], JSON.stringify({ metadata: f.metadata, settings: IK_SETTINGS,
      fkError: model.fkError, derivatives, target: model.target, retained: model.retained, results, path }, null, 2), { flag: "wx" });
  } finally { f.dispose(); }
}
