/**
 * The posture audit's trials (`docs/reference/postures.md`): whether a body can hold itself still
 * on a given support, and which stop or which muscle closes a support it cannot hold.
 *
 * **Statics** (`statics`, `search`). A posture is written to the segments' nodes by the joints' own
 * kinematics (`posed`); no world is stepped. On it the floating body's equilibrium is solved for
 * the least share of its strength that holds it (`leastShare`): the ground pushes at the row's
 * points, within friction and never pulling, and every freedom's torque is within that share of
 * the peak of the side that pulls, a freedom at its stop free to lean on it. A row is a support:
 * what touches the ground and what of that bears (`ROWS`). The search finds a posture of the row
 * with the least share, from a seed written by hand and then, where that holds nothing, from
 * random ones.
 *
 * Angles are each freedom's from the reference pose, in its own sense (`jointAngles`). A seed and
 * a printed table write them from the freedom's own zero, as the riser's postures are
 * (`DofSpec.bind`): the reference pose's angle less.
 */
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scene } from "@babylonjs/core/scene.js";
import { addArenaSolids } from "../src/arena/room.ts";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { bodyDynamics } from "../src/core/build/dynamics.ts";
import { jointAngles } from "../src/core/build/joint-state.ts";
import { lowsOf } from "../src/core/control/ground.ts";
import { chainTo, pointAtToRef, rotationAtToRef } from "../src/core/control/kinematics.ts";
import { pointOfToRef } from "../src/core/control/support.ts";
import { CONTACT_FRICTION } from "../src/core/engine/engine.ts";
import { modelSpec } from "../src/core/human/spec.ts";
import { driveMuscles } from "../src/core/muscle/driver.ts";
import { STANCE_LOWER } from "../src/core/skills/locomotion.ts";
import { derive } from "../src/core/spec/quantity.ts";
import { createWorld, PHYSICS_HZ } from "../src/core/world.ts";
import { freshEngine } from "../tests/harness/core-stand.mjs";
import { risenAt } from "./core-rise-trials.mjs";

export const STATICS_HARNESS = "Node, statics: the joints' kinematics and the body's dynamics (src/core/build/dynamics.ts), no world step";

/** The body every row is read on: the Warrior, nothing in its hands, no assist. */
export const AUDITED = "workshop-fighter";

/** How far a touch may stand off the ground, and any other point under it, and still be on it, m. */
export const ON = 0.001;
/** How deep two segments the engine collides may stand in each other in a posture the search keeps, m. */
export const OVERLAP = 0.005;
/** How far short of its stop a stop starts to bear, rad: the search's ramp onto it. A posture reported is snapped onto the stops it is that near. */
const RAMP = 0.035;
/** The most a stop bears, N m: more than any muscle, so that a stop is never what binds. */
const STOP_BEARS = 1e4;
/** The freedoms the search leaves at the reference pose: the wrist's deviation and the forearm's turn, which a palm on the ground does not need. */
const HELD = /^wrist\.\w+ (radial deviation|pronation)$/;

/**
 * The ground's friction by name: `box`, |f_x| and |f_z| each within mu / sqrt 2 of the normal
 * force, the square the bearing solve inscribes in the cone (`shareGroundWrench`); `cone`, eight
 * edges on the engine's own cone. Each a list of the unit-normal edges a point's force is a
 * non-negative sum of.
 */
export const FRICTIONS = Object.freeze({
  box: [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => [a * CONTACT_FRICTION / Math.SQRT2, 1, b * CONTACT_FRICTION / Math.SQRT2]),
  cone: Array.from({ length: 8 }, (_, k) => [CONTACT_FRICTION * Math.cos(k * Math.PI / 4), 1, CONTACT_FRICTION * Math.sin(k * Math.PI / 4)]),
});

/**
 * The limits a variant strips, each to `STRIPPED` rad: a pattern of channels, both sides. An
 * override of the search's ranges; no spec changes.
 */
export const VARIANTS = Object.freeze({
  built: [],
  knee: [/^knee\.\w+ flexion$/],
  ankle: [/^ankle\.\w+ dorsiflexion$/],
  hip: [/^hip\.\w+ flexion$/],
  lumbar: [/^lumbar flexion$/],
  all: [/^knee\.\w+ flexion$/, /^ankle\.\w+ dorsiflexion$/, /^hip\.\w+ flexion$/, /^lumbar flexion$/],
});
/** A stripped stop, rad: short of the half turn the angles' measure reads within (`rotationOfToRef`). */
export const STRIPPED = 3;

/**
 * **A body as the statics read it**: built once in its reference pose in a world that is never
 * stepped, with its freedoms in the muscle driver's order (`driveMuscles`), what each moves, every
 * lowest point of every shape (`lowsOf`), and the contacts a row may name (`contactsOf`). The
 * caller disposes.
 */
export async function staticBody(spec = modelSpec(AUDITED)) {
  const scene = new Scene(new NullEngine());
  const world = createWorld(scene, await freshEngine());
  const built = buildBody(spec, world, { position: [0, 0, 0] });
  const segments = [...built.segments.values()], joints = [...built.joints.values()];
  const root = segments.find((segment) => !joints.some((joint) => joint.child === segment));
  const chains = new Map(segments.map((segment) => [segment, chainTo(built, segment)]));
  const jointIndex = new Map(joints.map((joint, j) => [joint, j]));
  const freedoms = joints.flatMap((joint, j) => joint.dofs.map((dof, k) => ({
    name: `${joint.spec.name} ${dof.spec.positive}`, joint, j, k,
    lo: dof.spec.min.value, hi: dof.spec.max.value, bind: dof.spec.bind.value,
    plus: dof.spec.muscle.peakPositive.value, minus: dof.spec.muscle.peakNegative.value,
  })));
  const mass = segments.reduce((sum, segment) => sum + segment.rigid.mass, 0);
  const gravity = world.physics.gravity;
  const lows = segments.flatMap((segment) => lowsOf(segment.spec.shape, segment.frame).map((low) => ({ segment, at: low.at, radius: low.radius })));
  const body = {
    built, segments, joints, root, chains, jointIndex, freedoms, mass, gravity, lows,
    weight: mass * Math.hypot(...gravity),
    moves: freedoms.map((f) => new Set(segments.filter((segment) => chains.get(segment).includes(f.joint)))),
    dynamics: bodyDynamics(built, gravity),
    channel: new Map(freedoms.map((f, i) => [f.name, i])),
    dispose: () => { built.dispose(); world.dispose(); scene.dispose(); },
  };
  body.contacts = contactsOf(body);
  body.shapes = shapesOf(body);
  return body;
}

/**
 * **What may touch the ground**, by name and side (`sole.left`): each a list of touches, a touch
 * a segment's point or the lowest of its few. A capsule's point is its end a radius under it; a
 * box's, a corner.
 *
 * - `sole`: the foot's four bottom corners;
 * - `ball`: its two bottom front corners, the heel up;
 * - `instep`: its two top front corners, the foot pointed;
 * - `toes`: of each side's front corners the lower, bottom or top: a foot on its toes either way;
 * - `knee`: the lower of the thigh's end and the shank's end at the knee;
 * - `hand`: the hand's two ends, a palm flat on the ground.
 */
function contactsOf(body) {
  const segment = (name) => {
    const found = body.built.segments.get(name);
    if (!found) throw new Error(`${body.built.spec.model} has no ${name}`);
    return found;
  };
  const lowsOn = (s) => body.lows.filter((low) => low.segment === s);
  const nearest = (s, centre) => lowsOn(s).reduce((best, low) => (distance(low.at, centre) < distance(best.at, centre) ? low : best));
  const contacts = {};
  for (const side of ["left", "right"]) {
    const foot = segment(`foot.${side}`), corners = lowsOn(foot);
    if (corners.length !== 8) throw new Error(`${foot.spec.name} is not a box`);
    const byHeight = [...corners].sort((a, b) => a.at[1] - b.at[1]);
    const ahead = (list) => [...list].sort((a, b) => b.at[2] - a.at[2]);
    const bottom = byHeight.slice(0, 4), top = byHeight.slice(4);
    const ball = ahead(bottom).slice(0, 2), instep = ahead(top).slice(0, 2);
    const sameSide = (low) => instep.reduce((best, other) => (Math.abs(other.at[0] - low.at[0]) < Math.abs(best.at[0] - low.at[0]) ? other : best));
    const thigh = segment(`thigh.${side}`), shank = segment(`shank.${side}`), hand = segment(`hand.${side}`);
    const knee = body.joints.find((joint) => joint.child === shank).spec.centre.value;
    const one = (low) => ({ segment: low.segment, candidates: [low] });
    contacts[`sole.${side}`] = bottom.map(one);
    contacts[`ball.${side}`] = ball.map(one);
    contacts[`instep.${side}`] = instep.map(one);
    contacts[`toes.${side}`] = ball.map((low) => ({ segment: foot, candidates: [low, sameSide(low)] }));
    contacts[`knee.${side}`] = [{ segment: shank, candidates: [nearest(thigh, knee), nearest(shank, knee)] }];
    contacts[`hand.${side}`] = lowsOn(hand).map(one);
  }
  return contacts;
}

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Each segment's colliders as the engine has them (Rapier's own shapes, their place on the body),
 * for how deep two that collide stand in each other (`overlapOf`): every pair the engine collides,
 * which is every pair no joint joins.
 */
function shapesOf(body) {
  const parts = body.segments.map((segment) => {
    const rigid = segment.body.rigid, colliders = [];
    for (let k = 0; k < rigid.numColliders(); k++) {
      const collider = rigid.collider(k), t = collider.translationWrtParent(), r = collider.rotationWrtParent();
      colliders.push({ shape: collider.shape, at: new Vector3(t.x, t.y, t.z), turn: new Quaternion(r.x, r.y, r.z, r.w) });
    }
    // A sphere that holds the segment: about its lows' middle, out to the farthest and its radius.
    const lows = body.lows.filter((low) => low.segment === segment);
    const middle = [0, 1, 2].map((k) => lows.reduce((sum, low) => sum + low.at[k], 0) / lows.length);
    return { segment, colliders, middle, reach: Math.max(...lows.map((low) => distance(low.at, middle) + low.radius)), at: new Vector3() };
  });
  const jointed = (a, b) => body.joints.some((joint) => (joint.parent === a && joint.child === b) || (joint.parent === b && joint.child === a));
  const pairs = [];
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) if (!jointed(parts[i].segment, parts[j].segment)) pairs.push([parts[i], parts[j]]);
  return { parts, pairs };
}

/** Each joint's angles, out of `angles` by freedom. */
function byJoint(body, angles) {
  const out = body.joints.map((joint) => new Array(joint.dofs.length).fill(0));
  body.freedoms.forEach((f, i) => { out[f.j][f.k] = angles[i]; });
  return out;
}

const scratch = { turn: new Quaternion(), joint: new Quaternion(), root: new Quaternion(), at: new Vector3(), v: new Vector3(), w: new Vector3(), q: new Quaternion() };

/**
 * **`body` in `posture`**, its nodes written: `{ height, pitch, roll, angles }`, the root's frame
 * `height` m up, pitched forward `pitch` rad (about x, the body's head toward +z) then rolled
 * `roll` rad (about z), and every freedom at `angles` (by freedom, from the reference pose). A
 * segment's turn is the root's times each joint's on the way out to it (`rotationAtToRef`), and
 * its place swings about each joint's centre (`pointAtToRef`), as `jointAngles` reads them back.
 */
export function posed(body, posture) {
  const { height, pitch, roll, angles } = posture, joints = byJoint(body, angles);
  const R = Quaternion.RotationYawPitchRollToRef(0, pitch, roll, scratch.root);
  for (const segment of body.segments) {
    const chain = body.chains.get(segment), origin = segment.frame.origin, turn = scratch.turn.copyFromFloats(0, 0, 0, 1);
    if (chain.length === 0) scratch.at.set(origin[0], origin[1], origin[2]);
    else {
      const along = chain.map((joint) => joints[body.jointIndex.get(joint)]);
      pointAtToRef(chain, along, origin, scratch.at);
      chain.forEach((joint, c) => turn.multiplyInPlace(rotationAtToRef(joint, along[c], scratch.joint)));
    }
    const node = segment.node;
    scratch.at.applyRotationQuaternionToRef(R, node.position);
    node.position.y += height;
    R.multiplyToRef(turn, scratch.q);
    scratch.q.multiplyToRef(segment.rest, node.rotationQuaternion ??= new Quaternion());
  }
  return body;
}

/** A touch where the body stands now: its lowest candidate's lowest point, world, into `out`; returns it. */
function touchPointToRef(touch, out) {
  let best = Infinity;
  for (const low of touch.candidates) {
    pointOfToRef(low.segment, low.at, scratch.v);
    const y = scratch.v.y - low.radius;
    if (y < best) { best = y; out.set(scratch.v.x, y, scratch.v.z); }
  }
  return out;
}

/** The lowest point of each of `body`'s lows, world height, m, now. */
function lowHeights(body, out = new Float64Array(body.lows.length)) {
  body.lows.forEach((low, i) => { out[i] = pointOfToRef(low.segment, low.at, scratch.v).y - low.radius; });
  return out;
}

/** The body's centre of mass, world, now. */
function centreOfMass(body, out = new Vector3()) {
  out.setAll(0);
  for (const segment of body.segments) out.addInPlace(pointOfToRef(segment, segment.rigid.centre, scratch.v).scale(segment.rigid.mass));
  return out.scaleInPlace(1 / body.mass);
}

/**
 * How deep the engine's colliders of two segments it collides stand in each other, m, as `body`
 * stands now: the deepest pair, and which. Rapier's own contact query between its shapes.
 */
export function overlapOf(body) {
  for (const part of body.shapes.parts) pointOfToRef(part.segment, part.middle, part.at);
  const places = new Map();
  const placesOf = (part) => {
    if (!places.has(part)) {
      const node = part.segment.node;
      places.set(part, part.colliders.map(({ at, turn }) => {
        const p = at.applyRotationQuaternion(node.rotationQuaternion).addInPlace(node.position), q = node.rotationQuaternion.multiply(turn);
        return { p: { x: p.x, y: p.y, z: p.z }, q: { x: q.x, y: q.y, z: q.z, w: q.w } };
      }));
    }
    return places.get(part);
  };
  let deepest = 0, between = null;
  for (const [a, b] of body.shapes.pairs) {
    if (Vector3.Distance(a.at, b.at) > a.reach + b.reach) continue;
    a.colliders.forEach((ca, i) => b.colliders.forEach((cb, j) => {
      const A = placesOf(a)[i], B = placesOf(b)[j];
      const contact = ca.shape.contactShape(A.p, A.q, cb.shape, B.p, B.q, 0);
      if (contact && -contact.distance > deepest) { deepest = -contact.distance; between = [a.segment.spec.name, b.segment.spec.name]; }
    }));
  }
  return { depth: deepest, between };
}

// --- The rows

/**
 * **The rows**: each a support, `touch` what is on the ground and `bear` (a subset; all of it
 * unless given) what pushes on it. A waypoint bears all it touches; a limb that lifts or lands
 * touches and bears nothing. `symmetric` rows hold the left side to the right's angles and the
 * trunk square; `heights` scans the centre of mass's height over the ground, m, a row each. The
 * kneeling leg is the right, the leg set forward the left. `seed` is the posture the search
 * starts from (`SEEDS`).
 */
const both = (kind) => [`${kind}.left`, `${kind}.right`];
export const ROWS = Object.freeze([
  { name: "stand", route: "control", touch: both("sole"), symmetric: true, seed: "stand" },
  { name: "fours", route: "control", touch: [...both("knee"), ...both("toes"), ...both("hand")], symmetric: true, seed: "fours" },
  { name: "fours, hands light", route: "S", touch: [...both("knee"), ...both("toes"), ...both("hand")], bear: [...both("knee"), ...both("toes")], symmetric: true, seed: "fours" },
  { name: "kneel", route: "S", touch: [...both("knee"), ...both("toes")], symmetric: true, seed: "kneel" },
  { name: "kneel, left knee light", route: "S", touch: [...both("knee"), ...both("toes")], bear: ["knee.right", "toes.right"], seed: "kneel" },
  { name: "fours, left knee light", route: "K", touch: [...both("knee"), ...both("toes"), ...both("hand")], bear: ["knee.right", "toes.right", ...both("hand")], seed: "fours" },
  { name: "half kneel, hands", route: "K", touch: ["knee.right", "toes.right", "sole.left", ...both("hand")], seed: "half kneel, hands" },
  { name: "half kneel, hands light", route: "K", touch: ["knee.right", "toes.right", "sole.left", ...both("hand")], bear: ["knee.right", "toes.right", "sole.left"], seed: "half kneel, hands" },
  { name: "half kneel", route: "K", touch: ["knee.right", "toes.right", "sole.left"], seed: "half kneel" },
  { name: "half kneel, knee light", route: "K", touch: ["knee.right", "toes.right", "sole.left"], bear: ["toes.right", "sole.left"], seed: "half kneel" },
  { name: "half kneel, one leg", route: "K", touch: ["knee.right", "toes.right", "sole.left"], bear: ["sole.left"], seed: "half kneel" },
  { name: "kneel on toes", route: "Q", touch: [...both("knee"), ...both("ball")], symmetric: true, seed: "kneel" },
  { name: "kneel on toes, knees light", route: "Q", touch: [...both("knee"), ...both("ball")], bear: both("ball"), symmetric: true, seed: "kneel" },
  { name: "squat on toes", route: "Q", touch: both("ball"), symmetric: true, heights: [0.45, 0.5, 0.55, 0.6, 0.7, 0.8], seed: "squat on toes" },
  { name: "squat", route: "Q", touch: both("sole"), symmetric: true, heights: [0.45, 0.5, 0.55, 0.6, 0.7, 0.8], seed: "squat" },
  { name: "fours on toes, knees light", route: "B", touch: [...both("knee"), ...both("ball"), ...both("hand")], bear: [...both("ball"), ...both("hand")], symmetric: true, seed: "fours" },
  { name: "hands and toes", route: "B", touch: [...both("ball"), ...both("hand")], symmetric: true, seed: "bear" },
  { name: "hands and feet", route: "B", touch: [...both("sole"), ...both("hand")], symmetric: true, seed: "bear" },
  { name: "hands and feet, hands light", route: "B", touch: [...both("sole"), ...both("hand")], bear: both("sole"), symmetric: true, seed: "bear" },
]);

/** A row and its height, if it scans one, as one name. */
export const rowName = (row, height) => (height === undefined ? row.name : `${row.name} @ ${height.toFixed(2)} m`);

/**
 * The postures the search starts from, by name: the root's pitch, rad, and channels' angles from
 * their own zero (`@` both sides), the rest at the reference pose. `fours` is the riser's own
 * (`FOURS`, `src/core/mind/rise/stages.ts`); the others are guesses the search corrects.
 */
export const SEEDS = Object.freeze({
  stand: { pitch: 0, angles: {} },
  fours: {
    pitch: 1.3,
    angles: {
      "lumbar flexion": 0.3, "thoracic flexion": 0.2, "shoulder.@ flexion": 1.9, "shoulder.@ abduction": 0.3, "shoulder.@ internal rotation": -0.4,
      "elbow.@ flexion": 0.3, "wrist.@ flexion": -0.8, "hip.@ flexion": 1.9, "knee.@ flexion": 2.4, "ankle.@ dorsiflexion": 0.38,
    },
  },
  kneel: { pitch: 0.1, angles: { "hip.@ flexion": 0.2, "knee.@ flexion": 1.6, "ankle.@ dorsiflexion": 0.1, "shoulder.@ abduction": 0.3, "elbow.@ flexion": 0.3 } },
  "half kneel": {
    pitch: 0.1,
    angles: {
      "hip.right flexion": 0.1, "knee.right flexion": 1.6, "ankle.right dorsiflexion": 0.2, "hip.left flexion": 1.5, "knee.left flexion": 1.5,
      "ankle.left dorsiflexion": 0.1, "shoulder.@ abduction": 0.3, "elbow.@ flexion": 0.3,
    },
  },
  "half kneel, hands": {
    pitch: 0.9,
    angles: {
      "hip.right flexion": 0.9, "knee.right flexion": 1.6, "ankle.right dorsiflexion": 0.2, "hip.left flexion": 2, "knee.left flexion": 1.6,
      "ankle.left dorsiflexion": 0.2, "lumbar flexion": 0.3, "shoulder.@ flexion": 1.2, "shoulder.@ abduction": 0.3, "elbow.@ flexion": 0.2, "wrist.@ flexion": -1,
    },
  },
  "squat on toes": { pitch: 0.4, angles: { "hip.@ flexion": 2, "knee.@ flexion": 2.3, "ankle.@ dorsiflexion": 0.1, "shoulder.@ flexion": 1.4, "elbow.@ flexion": 0.3 } },
  squat: { pitch: 0.5, angles: { "hip.@ flexion": 1.9, "knee.@ flexion": 2.1, "ankle.@ dorsiflexion": 0.38, "shoulder.@ flexion": 1.5, "elbow.@ flexion": 0.3 } },
  bear: {
    pitch: 1.3,
    angles: {
      "hip.@ flexion": 1.6, "knee.@ flexion": 0.6, "ankle.@ dorsiflexion": 0.2, "shoulder.@ flexion": 1.8, "shoulder.@ abduction": 0.3, "elbow.@ flexion": 0.1, "wrist.@ flexion": -1.2,
    },
  },
});

/** A seed's angles by freedom, from the reference pose: each named channel's angle less its `bind`, clamped to its range. */
export function seedAngles(body, seed, ranges = body.freedoms) {
  const angles = body.freedoms.map(() => 0);
  for (const [name, value] of Object.entries(seed.angles)) {
    const names = name.includes("@") ? [name.replace("@", "left"), name.replace("@", "right")] : [name];
    for (const one of names) {
      const i = body.channel.get(one);
      if (i === undefined) throw new Error(`no channel ${one}`);
      angles[i] = Math.min(ranges[i].hi, Math.max(ranges[i].lo, value - body.freedoms[i].bind));
    }
  }
  return angles;
}

/** The freedoms' ranges under `variant` (`VARIANTS`): a stripped stop at `STRIPPED`. */
export function rangesOf(body, variant) {
  const patterns = VARIANTS[variant];
  if (!patterns) throw new Error(`no variant ${variant}`);
  return body.freedoms.map((f) => ({ lo: f.lo, hi: patterns.some((pattern) => pattern.test(f.name)) ? STRIPPED : f.hi }));
}

/**
 * **What a row's search moves** (`knobs`): the root's height, pitch, and roll unless the row is
 * symmetric, then a knob a freedom the search may move, or a pair of one the left side mirrors.
 * The `HELD` freedoms stay at the reference, and in a symmetric row so do the neck's and the
 * trunk's lateral flexion and rotation.
 */
export function knobsOf(body, row) {
  const knobs = [];
  for (const [i, f] of body.freedoms.entries()) {
    if (HELD.test(f.name)) continue;
    if (row.symmetric) {
      if (f.name.includes(".left ")) continue;
      if (!f.name.includes(".right ") && !/ flexion$/.test(f.name)) continue;
      const mirror = f.name.includes(".right ") ? body.channel.get(f.name.replace(".right ", ".left ")) : undefined;
      knobs.push(mirror === undefined ? [i] : [i, mirror]);
    } else knobs.push([i]);
  }
  return knobs;
}

// --- The inner solve

/**
 * **The least share of its strength that holds `body` still as it stands** on the row's bearing
 * touches: the least s such that the ground's forces at those points (each a non-negative sum of
 * its friction's edges, `FRICTIONS`) and the stops balance the body, its root free, with every
 * freedom's muscles giving at most s times the peak of the side that pulls. A linear programme;
 * then, at that s, a second for the least sum of every freedom's share, so a freedom that does
 * not bind is read at what it needs. With no ground forces that balance it, `balanced` is false
 * and `miss` is how far they fall short, a share of its weight.
 *
 * The body's statics are `bodyDynamics`'s at rest: 0 = torques + gravity + contacts, the joints'
 * rows and the root's, a force f at x on a segment adding (m x (x - p)) . f to each freedom that
 * moves it and f with its moment to the root's. A stop at `hi` gives any torque toward `lo` and
 * none away, ramped in over `RAMP` short of it unless `snap`, where it bears only on it.
 */
export function leastShare(body, row, posture, { friction = "box", ranges = body.freedoms, snap = false, spread = true } = {}) {
  const { dynamics, freedoms } = body, n = freedoms.length, edges = FRICTIONS[friction];
  dynamics.update(byJoint(body, posture.angles));
  const bearing = (row.bear ?? row.touch).flatMap((name) => body.contacts[name].map((touch) => ({ name, touch, point: touchPointToRef(touch, new Vector3()) })));
  // A freedom that moves no bearing point asks a torque no ground force changes: its share is a
  // floor under s, and it is no row of the programme.
  const reached = freedoms.map((_, f) => bearing.some((b) => body.moves[f].has(b.touch.segment)));
  const W = body.weight, c = dynamics.root.centre;
  // A column per edge of each bearing point: its generalized force per newton along the edge.
  const columns = [];
  for (const contact of bearing) {
    const x = contact.point;
    for (const e of edges) {
      const F = [e[0], e[1], e[2]], r = [x.x - c[0], x.y - c[1], x.z - c[2]];
      const root = [r[1] * F[2] - r[2] * F[1], r[2] * F[0] - r[0] * F[2], r[0] * F[1] - r[1] * F[0], ...F];
      const joints = freedoms.map((_, f) => {
        if (!body.moves[f].has(contact.touch.segment)) return 0;
        const m = dynamics.axis(f), p = dynamics.pivot(f), a = [x.x - p[0], x.y - p[1], x.z - p[2]];
        return (m[1] * a[2] - m[2] * a[1]) * F[0] + (m[2] * a[0] - m[0] * a[2]) * F[1] + (m[0] * a[1] - m[1] * a[0]) * F[2];
      });
      columns.push({ contact, edge: F, root, joints });
    }
  }
  // Each stop's bearing: 1 on it, ramped to 0 a `RAMP` short, or 0 or 1 snapped.
  const near = (gap) => (snap ? (gap <= 1e-9 ? 1 : 0) : Math.max(0, Math.min(1, 1 - gap / RAMP)));
  const stops = freedoms.map((_, f) => ({ hi: near(ranges[f].hi - posture.angles[f]), lo: near(posture.angles[f] - ranges[f].lo) }));
  const stopColumns = [];
  stops.forEach((s, f) => {
    if (!reached[f]) return;
    if (s.hi > 0) stopColumns.push({ f, sign: 1, most: s.hi * STOP_BEARS });
    if (s.lo > 0) stopColumns.push({ f, sign: -1, most: s.lo * STOP_BEARS });
  });
  // An unreached freedom's muscles: its gravity's torque, less what a stop it leans on bears.
  const fixedTorque = freedoms.map((_, f) => {
    if (reached[f]) return 0;
    const t = -dynamics.gravity[f];
    return t > 0 ? Math.max(0, t - stops[f].lo * STOP_BEARS) : Math.min(0, t + stops[f].hi * STOP_BEARS);
  });
  const floor = Math.max(0, ...freedoms.map((fr, f) => (fixedTorque[f] >= 0 ? fixedTorque[f] / fr.plus : -fixedTorque[f] / fr.minus)));
  const E = columns.length, S = stopColumns.length;
  // The unknowns: the edges' forces, N; the stops' torques as shares of `STOP_BEARS`, so that every
  // row is of a size; s.
  const v = E + S + 1, sAt = E + S;
  const Aeq = [], beq = [];
  // The root's rows, moments over the weight times a metre and forces over the weight.
  for (let r = 0; r < 6; r++) {
    const row6 = new Array(v).fill(0);
    columns.forEach((col, e) => { row6[e] = col.root[r] / W; });
    Aeq.push(row6);
    beq.push(-dynamics.root.gravity[r] / W);
  }
  // The muscles' torque: t = -gravity - J w + (stop at hi) - (stop at lo), each side within s P.
  const torqueRow = (f, sign, P) => {
    const a = new Array(v).fill(0);
    columns.forEach((col, e) => { a[e] = (-sign * col.joints[f]) / P; });
    stopColumns.forEach((st, k) => { if (st.f === f) a[E + k] = (sign * st.sign * STOP_BEARS) / P; });
    return a;
  };
  const Aub = [], bub = [];
  const rows = freedoms.flatMap((_, f) => (reached[f] ? [f] : []));
  for (const f of rows) {
    const fr = freedoms[f], g = dynamics.gravity[f];
    const up = torqueRow(f, 1, fr.plus); up[sAt] = -1; Aub.push(up); bub.push(g / fr.plus);
    const down = torqueRow(f, -1, fr.minus); down[sAt] = -1; Aub.push(down); bub.push(-g / fr.minus);
  }
  stopColumns.forEach((st, k) => { const a = new Array(v).fill(0); a[E + k] = 1; Aub.push(a); bub.push(st.most / STOP_BEARS); });
  const cost = new Array(v).fill(0);
  cost[sAt] = 1;
  const first = linearProgramme(cost, Aub, bub, Aeq, beq);
  if (first.status === "infeasible") return { balanced: false, miss: first.infeasibility, share: Infinity, bearing };
  if (first.status !== "optimal") throw Object.assign(new Error(`the least share's programme is ${first.status}`), { programme: { cost, Aub, bub, Aeq, beq } });
  const share = Math.max(floor, first.x[sAt]);
  // The least sum of shares at that s: a share a reached freedom, each at least its torque over its side's peak.
  let x = first.x;
  if (spread) {
    const w = v + rows.length, extend = (row) => [...row, ...new Array(rows.length).fill(0)];
    const Aub2 = Aub.map(extend), bub2 = [...bub];
    const Acap = new Array(w).fill(0);
    Acap[sAt] = 1;
    Aub2.push(Acap); bub2.push(share * (1 + 1e-7) + 1e-9);
    rows.forEach((f, r) => {
      const fr = freedoms[f];
      for (const [sign, P] of [[1, fr.plus], [-1, fr.minus]]) {
        const a = extend(torqueRow(f, sign, P));
        a[v + r] = -1;
        Aub2.push(a); bub2.push(sign > 0 ? dynamics.gravity[f] / P : -dynamics.gravity[f] / P);
      }
    });
    const cost2 = new Array(w).fill(0);
    for (let r = 0; r < rows.length; r++) cost2[v + r] = 1;
    const second = linearProgramme(cost2, Aub2, bub2, Aeq.map(extend), beq);
    if (second.status === "optimal") x = second.x;
  }
  // What the solution asks: each freedom's muscles' torque, the stops', and each bearing touch's force.
  const torques = freedoms.map((_, f) => {
    if (!reached[f]) return fixedTorque[f];
    let t = -dynamics.gravity[f];
    columns.forEach((col, e) => { t -= col.joints[f] * x[e]; });
    stopColumns.forEach((st, k) => { if (st.f === f) t += st.sign * STOP_BEARS * x[E + k]; });
    return t;
  });
  const stopTorques = [
    ...stopColumns.map((st, k) => ({ channel: freedoms[st.f].name, at: st.sign > 0 ? "hi" : "lo", torque: -st.sign * STOP_BEARS * x[E + k] })),
    ...freedoms.flatMap((fr, f) => {
      const leant = reached[f] ? 0 : -dynamics.gravity[f] - fixedTorque[f];
      return leant === 0 ? [] : [{ channel: fr.name, at: leant < 0 ? "hi" : "lo", torque: leant }];
    }),
  ].filter((st) => Math.abs(st.torque) > 0.5);
  const forces = bearing.map(() => new Vector3());
  columns.forEach((col, e) => { forces[bearing.indexOf(col.contact)].addInPlaceFromFloats(col.edge[0] * x[e], col.edge[1] * x[e], col.edge[2] * x[e]); });
  const ratios = freedoms.map((fr, f) => (torques[f] >= 0 ? torques[f] / fr.plus : torques[f] / fr.minus));
  return { balanced: true, miss: 0, share, torques, ratios, stops: stopTorques, bearing, forces };
}

/** The least a pivot may be of its column's largest entry (`simplex`). */
const PIVOT = 1e-9;

/**
 * How many orders of its unknowns a programme is solved in before its failure is believed, and
 * before its infeasibility is: a rounded tableau has called a programme that holds infeasible by
 * 1.8e-3.
 */
const ORDERS = 8, CONFIRM = 3;
/** How far an answer may stand outside a constraint, over 1 and the constraint's bound, and be within it. */
const WITHIN = 1e-7;

/**
 * **A linear programme**: the least of `c . x` over x >= 0, `Aub x <= bub`, `Aeq x = beq`
 * (`simplex`). An answer is checked against the constraints; one that fails the check, or a
 * programme that stalls, reads unbounded or reads infeasible, is solved again with its unknowns in
 * another order, since the tableau's rounding follows its order; infeasible in `CONFIRM` orders
 * is believed, by the least of their misses. `infeasibility` is phase one's least sum of the
 * artificial variables: how far the equalities, as scaled, are from being met when they cannot be.
 */
export function linearProgramme(c, Aub, bub, Aeq, beq) {
  const n = c.length, dot = (a, x) => a.reduce((sum, v, k) => sum + v * x[k], 0);
  const within = (x) => x.every((v) => v >= -WITHIN)
    && Aub.every((a, i) => dot(a, x) - bub[i] <= WITHIN * (1 + Math.abs(bub[i])))
    && Aeq.every((a, i) => Math.abs(dot(a, x) - beq[i]) <= WITHIN * (1 + Math.abs(beq[i])));
  let last = null, infeasible = null, misses = 0;
  for (let k = 0; k < ORDERS; k++) {
    const draw = random(k), order = [...c.keys()].map((j) => [k === 0 ? j : draw(), j]).sort((a, b) => a[0] - b[0]).map(([, j]) => j);
    const P = (a) => order.map((j) => a[j]);
    const solved = simplex(P(c), Aub.map(P), bub, Aeq.map(P), beq);
    if (solved.status === "infeasible") {
      if (!infeasible || solved.infeasibility < infeasible.infeasibility) infeasible = solved;
      if (++misses >= CONFIRM) return infeasible;
      continue;
    }
    if (solved.status === "optimal") {
      const x = new Array(n).fill(0);
      order.forEach((j, at) => { x[j] = solved.x[at]; });
      if (within(x)) return { ...solved, x };
      last = { status: "outside its constraints" };
    } else last = solved;
  }
  return infeasible ?? last;
}

/**
 * **The simplex method** on `linearProgramme`'s programme: two phases on a dense tableau, Dantzig's
 * rule, Bland's from a run of degenerate pivots on.
 */
export function simplex(c, Aub, bub, Aeq, beq) {
  const n = c.length, rows = [];
  // Each row as a x (=, <=) b with b >= 0: a slack where one is added, an artificial where one is needed.
  Aub.forEach((a, i) => rows.push(bub[i] >= 0 ? { a, b: bub[i], slack: 1, art: false } : { a: a.map((v) => -v), b: -bub[i], slack: -1, art: true }));
  Aeq.forEach((a, i) => rows.push(beq[i] >= 0 ? { a, b: beq[i], slack: 0, art: true } : { a: a.map((v) => -v), b: -beq[i], slack: 0, art: true }));
  const m = rows.length, slacks = rows.filter((r) => r.slack !== 0).length, arts = rows.filter((r) => r.art).length;
  const N = n + slacks + arts, width = N + 1;
  const T = new Float64Array((m + 1) * width), basis = new Int32Array(m);
  let s = n, t = n + slacks;
  rows.forEach((r, i) => {
    const base = i * width;
    for (let j = 0; j < n; j++) T[base + j] = r.a[j];
    T[base + N] = r.b;
    if (r.slack !== 0) { T[base + s] = r.slack; if (!r.art) basis[i] = s; s++; }
    if (r.art) { T[base + t] = 1; basis[i] = t; t++; }
  });
  const scale = 1 + Math.max(...rows.map((r) => Math.abs(r.b)));
  const eps = 1e-10 * scale;
  const objective = m * width;
  const pivot = (row, col) => {
    const base = row * width, p = T[base + col];
    for (let j = 0; j < width; j++) T[base + j] /= p;
    for (let i = 0; i <= m; i++) {
      if (i === row) continue;
      const f = T[i * width + col];
      if (f === 0) continue;
      const bi = i * width;
      for (let j = 0; j < width; j++) T[bi + j] -= f * T[base + j];
    }
    basis[row] = col;
  };
  // Bland's rule, once a run of degenerate pivots has called it in, stays in for the phase: it
  // cannot cycle, and Dantzig's, taken up again, can.
  const run = (allowed) => {
    let degenerate = 0, bland = false;
    for (let iteration = 0; iteration < 50 * (m + N); iteration++) {
      let col = -1, best = -eps;
      bland ||= degenerate > 2 * m;
      for (let j = 0; j < N; j++) {
        if (!allowed(j)) continue;
        const r = T[objective + j];
        if (r < best) { col = j; if (bland) break; best = r; }
      }
      if (col < 0) return "optimal";
      // A pivot under `PIVOT` of its column's largest entry is a zero rounded: divided by, it
      // multiplies the tableau's rounding past its values.
      let row = -1, least = Infinity, largest = 0;
      for (let i = 0; i < m; i++) largest = Math.max(largest, Math.abs(T[i * width + col]));
      for (let i = 0; i < m; i++) {
        const a = T[i * width + col];
        if (a > eps && a > PIVOT * largest) {
          // A value within `eps` of zero is zero, so that a degenerate row ties with another
          // exactly and Bland's rule breaks the tie; left as rounded, the rows are told apart
          // by their rounding and the pivots cycle.
          const b = T[i * width + N], ratio = (b <= eps ? 0 : b) / a;
          if (ratio < least - 1e-12 || (Math.abs(ratio - least) <= 1e-12 && row >= 0 && basis[i] < basis[row])) { least = ratio; row = i; }
        }
      }
      if (row < 0) return "unbounded";
      degenerate = least <= eps ? degenerate + 1 : 0;
      pivot(row, col);
    }
    return "stalled";
  };
  // Phase one: the least sum of the artificials.
  for (let j = 0; j <= N; j++) T[objective + j] = 0;
  for (let j = n + slacks; j < N; j++) T[objective + j] = 1;
  for (let i = 0; i < m; i++) if (basis[i] >= n + slacks) for (let j = 0; j <= N; j++) T[objective + j] -= T[i * width + j];
  const phase1 = run(() => true);
  if (phase1 !== "optimal") return { status: phase1 };
  const infeasibility = -T[objective + N];
  if (infeasibility > 1e-8 * scale) return { status: "infeasible", infeasibility };
  // Artificials left in the basis at zero: pivoted out where a real column can take their row.
  for (let i = 0; i < m; i++) {
    if (basis[i] < n + slacks) continue;
    for (let j = 0; j < n + slacks; j++) if (Math.abs(T[i * width + j]) > eps) { pivot(i, j); break; }
  }
  // Phase two: the cost, the artificials out of reach.
  for (let j = 0; j <= N; j++) T[objective + j] = j < n ? c[j] : 0;
  for (let i = 0; i < m; i++) {
    const cb = basis[i] < n ? c[basis[i]] : 0;
    if (cb !== 0) for (let j = 0; j <= N; j++) T[objective + j] -= cb * T[i * width + j];
  }
  const phase2 = run((j) => j < n + slacks);
  if (phase2 !== "optimal") return { status: phase2 };
  const x = new Array(n).fill(0);
  for (let i = 0; i < m; i++) if (basis[i] < n) x[basis[i]] = T[i * width + N];
  return { status: "optimal", x, value: c.reduce((sum, ci, j) => sum + ci * x[j], 0), infeasibility: 0 };
}

// --- The posture of a row

/**
 * **`posture` put on the row's ground**: damped Gauss-Newton steps on the root's height, pitch and
 * roll and the knobs (`knobsOf`), which move each touch the row names onto the ground, the centre
 * of mass to the row's `height` if it has one, and any other point under the ground up to it.
 * Angles stay in `ranges`; a knob in `fixed` stays where it is. Returns the posture and how far
 * it is from the row's ground, m: its touches' largest distance from it and its deepest other
 * point under it.
 */
export function project(body, row, posture, { knobs = knobsOf(body, row), ranges = body.freedoms, fixed = new Set(), height, steps = 12 } = {}) {
  const touches = row.touch.flatMap((name) => body.contacts[name]);
  const point = new Vector3(), centre = new Vector3(), heights = new Float64Array(body.lows.length);
  let p = { ...posture, angles: [...posture.angles] };
  const vars = [{ get: (q) => q.height, set: (q, x) => { q.height = x; } }, { get: (q) => q.pitch, set: (q, x) => { q.pitch = x; } }];
  if (!row.symmetric) vars.push({ get: (q) => q.roll, set: (q, x) => { q.roll = x; } });
  knobs.forEach((knob, k) => {
    if (fixed.has(k)) return;
    const [i] = knob, { lo, hi } = ranges[i];
    vars.push({ get: (q) => q.angles[i], set: (q, x) => { const a = Math.min(hi, Math.max(lo, x)); for (const j of knob) q.angles[j] = a; } });
  });
  // The residuals: each touch's height, the centre's height off the row's, and each other point under the ground.
  const residuals = (q, under) => {
    posed(body, q);
    const r = touches.map((touch) => touchPointToRef(touch, point).y);
    if (height !== undefined) r.push(centreOfMass(body, centre).y - height);
    if (under) for (const i of under) { const low = body.lows[i]; r.push(Math.min(0, pointOfToRef(low.segment, low.at, point).y - low.radius)); }
    return r;
  };
  const norm = (r) => r.reduce((sum, v) => sum + v * v, 0);
  const underOf = () => { lowHeights(body, heights); const out = []; heights.forEach((h, i) => { if (h < 0.005) out.push(i); }); return out; };
  let under = (posed(body, p), underOf()), r = residuals(p, under);
  for (let step = 0; step < steps && Math.max(...r.map(Math.abs)) > ON / 4; step++) {
    // The Jacobian by differences, a column a variable.
    const h = 1e-6, J = r.map(() => new Array(vars.length).fill(0));
    vars.forEach((variable, c) => {
      const q = { ...p, angles: [...p.angles] };
      variable.set(q, variable.get(p) + h);
      const moved = variable.get(q) - variable.get(p);
      if (moved === 0) return;
      const rq = residuals(q, under);
      rq.forEach((value, k) => { J[k][c] = (value - r[k]) / moved; });
    });
    // dx = -J' (J J' + d^2 E)^-1 r.
    const d2 = 1e-6, G = J.map((a, i) => J.map((b, j) => a.reduce((sum, v, k) => sum + v * b[k], 0) + (i === j ? d2 : 0)));
    const z = solveDense(G, r);
    const dx = vars.map((_, c) => -J.reduce((sum, row, k) => sum + row[c] * z[k], 0));
    let scale = 1, next = null, rn = null;
    for (let tries = 0; tries < 6; tries++, scale /= 2) {
      const q = { ...p, angles: [...p.angles] };
      vars.forEach((variable, c) => variable.set(q, variable.get(p) + scale * dx[c]));
      const rq = residuals(q, under);
      if (norm(rq) < norm(r)) { next = q; rn = rq; break; }
    }
    if (!next) break;
    p = next;
    under = underOf();
    r = residuals(p, under);
  }
  posed(body, p);
  lowHeights(body, heights);
  const off = Math.max(0, ...touches.map((touch) => Math.abs(touchPointToRef(touch, point).y)), ...Array.from(heights, (h) => -h));
  return { posture: p, off, centre: centreOfMass(body, centre).y };
}

/** Solve `A x = b` by elimination with partial pivoting. */
function solveDense(A, b) {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      if (f !== 0) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = M[r][n];
    for (let k = r + 1; k < n; k++) sum -= M[r][k] * x[k];
    x[r] = sum / M[r][r];
  }
  return x;
}

/**
 * **How `body` holds the row in `posture`**: put on its ground (`project`), its overlap read, its
 * least share solved; and a score the search makes least: a posture off its ground by more than
 * `ON` or overlapping by more than `OVERLAP` scores 1000 and up by how far; one the ground cannot
 * balance, 100 and up by its miss; one that holds, its share.
 */
export function statics(body, row, posture, { friction = "box", variant = "built", height, snap = false, knobs = knobsOf(body, row) } = {}) {
  const ranges = rangesOf(body, variant);
  let placed = project(body, row, posture, { knobs, ranges, height });
  let fixed = new Set();
  if (snap) {
    // Each knob within the ramp of a stop put on it, held there, and the posture put back on its ground.
    const angles = [...placed.posture.angles];
    knobs.forEach((knob, k) => {
      const [i] = knob, { lo, hi } = ranges[i], a = angles[i];
      const to = hi - a <= RAMP ? hi : a - lo <= RAMP ? lo : null;
      if (to !== null) { for (const j of knob) angles[j] = to; fixed.add(k); }
    });
    placed = project(body, row, { ...placed.posture, angles }, { knobs, ranges, height, fixed });
  }
  const { posture: p, off, centre } = placed;
  posed(body, p);
  const overlap = overlapOf(body);
  const solved = leastShare(body, row, p, { friction, ranges, snap, spread: snap });
  const geometry = Math.max(0, off - ON) + Math.max(0, overlap.depth - OVERLAP);
  const score = geometry > 0 ? 1000 + 1000 * geometry : !solved.balanced ? 100 + solved.miss : solved.share;
  return { posture: p, off, overlap, centre, solved, score, ranges };
}

// --- The search

/** A seeded uniform draw in [0, 1) (mulberry32). */
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded standard normal draw, by Box and Muller. */
function normal(uniform) {
  return () => Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform());
}

/**
 * The search's coordinates for a row, each about a unit wide: the height over 2 m, the pitch and
 * the roll over a half turn, and each knob as its share of its range.
 */
function coordinates(body, row, knobs, ranges) {
  const base = row.symmetric ? 2 : 3;
  return {
    size: base + knobs.length,
    encode(p) {
      const z = [p.height / 2, p.pitch / Math.PI];
      if (!row.symmetric) z.push(p.roll / Math.PI);
      for (const [i] of knobs) z.push((p.angles[i] - ranges[i].lo) / (ranges[i].hi - ranges[i].lo));
      return z;
    },
    decode(z, from) {
      const angles = [...from.angles];
      knobs.forEach((knob, k) => {
        const [i] = knob, u = Math.min(1, Math.max(0, z[base + k]));
        for (const j of knob) angles[j] = ranges[i].lo + u * (ranges[i].hi - ranges[i].lo);
      });
      return { height: 2 * z[0], pitch: Math.PI * z[1], roll: row.symmetric ? 0 : Math.PI * z[2], angles };
    },
  };
}

/**
 * **The search for a row's posture**: a separable CMA-ES (Ros and Hansen 2008, "A simple
 * modification in CMA-ES achieving linear time and space complexity", PPSN X) over the search's
 * coordinates, each candidate put on the row's ground and scored by `statics`. Seed 0 starts from
 * the row's seed posture with a small step, a polish; any other from a posture drawn at random
 * about it with a wide one. Returns the best posture's reading, snapped onto its stops.
 */
export function search(body, row, { seed = 0, evals = 1500, friction = "box", variant = "built", height, start } = {}) {
  const ranges = rangesOf(body, variant), knobs = knobsOf(body, row), coords = coordinates(body, row, knobs, ranges);
  const given = SEEDS[row.seed];
  const from = start ?? { height: 1, pitch: given.pitch, roll: 0, angles: seedAngles(body, given, ranges) };
  const uniform = random(seed * 7919 + 17), gauss = normal(uniform), D = coords.size;
  let mean = coords.encode(from);
  if (seed > 0) mean = mean.map((v, d) => (d === 0 ? v : d < (row.symmetric ? 2 : 3) ? v + 0.15 * gauss() : uniform()));
  const evaluate = (z) => statics(body, row, coords.decode(z, from), { friction, variant, height, knobs });
  // Lamarckian: a candidate is put on its ground, and its coordinates are where it was put.
  let best = evaluate(mean);
  mean = coords.encode(best.posture);
  let sigma = seed > 0 ? 0.25 : 0.05, used = 1;
  const lambda = 4 + Math.floor(3 * Math.log(D)), mu = Math.floor(lambda / 2);
  const raw = Array.from({ length: mu }, (_, i) => Math.log(mu + 0.5) - Math.log(i + 1)), total = raw.reduce((a, b) => a + b, 0);
  const weights = raw.map((w) => w / total), mueff = 1 / weights.reduce((sum, w) => sum + w * w, 0);
  const cs = (mueff + 2) / (D + mueff + 5), ds = 1 + 2 * Math.max(0, Math.sqrt((mueff - 1) / (D + 1)) - 1) + cs;
  const cc = 4 / (D + 4), c1 = 2 / ((D + 1.3) * (D + 1.3) + mueff) * (D + 2) / 3;
  const cmu = Math.min(1 - c1, 2 * (mueff - 2 + 1 / mueff) / ((D + 2) * (D + 2) + mueff) * (D + 2) / 3);
  const chiN = Math.sqrt(D) * (1 - 1 / (4 * D) + 1 / (21 * D * D));
  const C = new Array(D).fill(1), ps = new Array(D).fill(0), pc = new Array(D).fill(0);
  let stale = 0;
  while (used + lambda <= evals && sigma > 1e-4 && stale < 40) {
    const offspring = [];
    for (let k = 0; k < lambda; k++) {
      const y = Array.from({ length: D }, (_, d) => Math.sqrt(C[d]) * gauss());
      const reading = evaluate(mean.map((m, d) => m + sigma * y[d]));
      offspring.push({ z: coords.encode(reading.posture), reading });
    }
    used += lambda;
    offspring.sort((a, b) => a.reading.score - b.reading.score);
    if (offspring[0].reading.score < best.score - 1e-6) { best = offspring[0].reading; stale = 0; } else stale++;
    const old = mean;
    mean = Array.from({ length: D }, (_, d) => weights.reduce((sum, w, i) => sum + w * offspring[i].z[d], 0));
    const step = mean.map((m, d) => (m - old[d]) / sigma);
    for (let d = 0; d < D; d++) ps[d] = (1 - cs) * ps[d] + Math.sqrt(cs * (2 - cs) * mueff) * step[d] / Math.sqrt(C[d]);
    const psNorm = Math.sqrt(ps.reduce((sum, v) => sum + v * v, 0));
    const hsig = psNorm / Math.sqrt(1 - (1 - cs) ** (2 * used / lambda)) < (1.4 + 2 / (D + 1)) * chiN ? 1 : 0;
    for (let d = 0; d < D; d++) {
      pc[d] = (1 - cc) * pc[d] + hsig * Math.sqrt(cc * (2 - cc) * mueff) * step[d];
      const rank = weights.reduce((sum, w, i) => { const y = (offspring[i].z[d] - old[d]) / sigma; return sum + w * y * y; }, 0);
      C[d] = Math.max(1e-12, (1 - c1 - cmu) * C[d] + c1 * pc[d] * pc[d] + cmu * rank);
    }
    sigma *= Math.exp((cs / ds) * (psNorm / chiN - 1));
  }
  const snapped = statics(body, row, best.posture, { friction, variant, height, knobs, snap: true });
  return { ...(snapped.score <= best.score + 1e-3 || snapped.score < 100 ? snapped : best), evals: used };
}

/**
 * A reading as a row of the table: whether the posture is found (on its ground and clear of
 * itself), balanced and held (found, balanced, its share at most 1); its share; the freedoms
 * that bind (at 98 % of the share or more); the five largest shares; the stops that bear; how far its
 * centre of mass stands inside its bearing points (`margin`, m, negative outside); the deepest
 * overlap; the centre's height; the pitch; every searched freedom's angle from its own zero.
 */
export function recordOf(body, row, reading, { variant = "built", friction = "box", height, seed = 0 } = {}) {
  const { posture, off, overlap, solved } = reading;
  const found = off <= ON && overlap.depth <= OVERLAP;
  const round = (v, places = 3) => Math.round(v * 10 ** places) / 10 ** places;
  const named = body.freedoms.map((f, i) => [f.name, posture.angles[i] + f.bind]).filter(([name]) => !HELD.test(name));
  posed(body, posture);
  const centre = centreOfMass(body);
  const share = solved.balanced ? solved.share : null;
  return {
    row: rowName(row, height), route: row.route, variant, friction, seed,
    found, balanced: solved.balanced, held: found && solved.balanced && share <= 1,
    share: share === null ? null : round(share), miss: round(solved.miss),
    binds: solved.balanced ? body.freedoms.flatMap((f, i) => (Math.abs(solved.ratios[i]) >= 0.98 * solved.share ? [f.name] : [])) : [],
    ratios: solved.balanced
      ? body.freedoms.map((f, i) => ({ channel: f.name, ratio: round(solved.ratios[i]) })).sort((a, b) => Math.abs(b.ratio) - Math.abs(a.ratio)).slice(0, 5)
      : [],
    stops: solved.balanced ? solved.stops.map((s) => ({ ...s, torque: round(s.torque, 1) })) : [],
    forces: solved.balanced ? Object.fromEntries((row.bear ?? row.touch).map((name) => [name, round(solved.bearing.reduce((sum, b, k) => sum + (b.name === name ? solved.forces[k].y : 0), 0), 1)])) : {},
    margin: round(marginOf(solved.bearing.map((b) => b.point), centre)),
    off: round(off, 4), overlap: { depth: round(overlap.depth, 4), between: overlap.between },
    height: round(centre.y), pitch: round(posture.pitch), roll: round(posture.roll),
    angles: Object.fromEntries(named.map(([name, a]) => [name, round(a)])),
    posture: { height: posture.height, pitch: posture.pitch, roll: posture.roll, angles: [...posture.angles] },
  };
}

/** How far `centre` (x, z) stands inside the convex outline of `points` (x, z), m; negative outside, by how far. */
export function marginOf(points, centre) {
  const hull = outline(points.map((p) => [p.x, p.z]));
  const x = centre.x, z = centre.z;
  if (hull.length === 1) return -Math.hypot(x - hull[0][0], z - hull[0][1]);
  let inside = hull.length >= 3, nearest = Infinity;
  for (let k = 0; k < hull.length; k++) {
    const [ax, az] = hull[k], [bx, bz] = hull[(k + 1) % hull.length];
    const ex = bx - ax, ez = bz - az, t = Math.min(1, Math.max(0, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
    nearest = Math.min(nearest, Math.hypot(x - ax - t * ex, z - az - t * ez));
    if (ex * (z - az) - ez * (x - ax) < 0) inside = false;
  }
  return inside ? nearest : -nearest;
}

/** The convex hull of `points` (x, z), anticlockwise, by the monotone chain. */
function outline(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const chain = (from) => {
    const out = [];
    for (const q of from) {
      while (out.length >= 2 && turn(out[out.length - 2], out[out.length - 1], q) <= 1e-12) out.pop();
      out.push(q);
    }
    return out.slice(0, -1);
  };
  const hull = [...chain(sorted), ...chain([...sorted].reverse())];
  return hull.length ? hull : [sorted[0]];
}

/** The rows by name. */
export const rowNamed = (name) => {
  const row = ROWS.find((r) => r.name === name);
  if (!row) throw new Error(`no row ${name}`);
  return row;
};

/**
 * **One job**: the row named `row` searched on a static body of `AUDITED` under `variant` and
 * `friction`, from `seed` with `evals` evaluations, at `height` if the row scans it; or from
 * `start` (a posture) if given. Its record (`recordOf`).
 */
export async function audit({ row: name, variant = "built", friction = "box", seed = 0, evals = 1500, height, start }) {
  const body = await bodyOnce();
  const row = rowNamed(name);
  const reading = search(body, row, { seed, evals, friction, variant, height, start });
  return { ...recordOf(body, row, reading, { variant, friction, height, seed }), evals: reading.evals };
}

/**
 * **A path between two rows on one ground**: `from` and `to` (rows that touch the same points;
 * one row twice for two of its heights, named in `names`) joined by `samples` postures between
 * `start` and `end`, each interpolated, put back on that ground and solved bearing on what either
 * row bears: the weight moved across while nothing lifts. Its record is the greatest share on the
 * way and where (0 at `start`, 1 at `end`), whether every sample was found and balanced, and the
 * first that was not found (`lost`): a straight line between two answers is one path of many, and
 * may pass through the body itself.
 */
export async function path({ from, to, names = [from, to], start, end, variant = "built", friction = "box", samples = 15 }) {
  const body = await bodyOnce();
  const a = rowNamed(from), b = rowNamed(to);
  if (a.touch.join() !== b.touch.join()) throw new Error(`${from} and ${to} do not touch the same ground`);
  const bear = [...new Set([...(a.bear ?? a.touch), ...(b.bear ?? b.touch)])];
  const row = { ...a, name: `${names[0]} to ${names[1]}`, bear, symmetric: a.symmetric && b.symmetric };
  const steps = [];
  for (let k = 0; k <= samples + 1; k++) {
    const t = k / (samples + 1), mix = (u, v) => u + t * (v - u);
    const posture = { height: mix(start.height, end.height), pitch: mix(start.pitch, end.pitch), roll: mix(start.roll, end.roll), angles: start.angles.map((u, i) => mix(u, end.angles[i])) };
    const reading = statics(body, row, posture, { friction, variant, snap: true });
    const found = reading.off <= ON && reading.overlap.depth <= OVERLAP;
    steps.push({ t, found, balanced: reading.solved.balanced, share: reading.solved.balanced ? reading.solved.share : null, off: reading.off, overlap: reading.overlap });
  }
  const worst = steps.reduce((w, s) => ((s.share ?? Infinity) > (w.share ?? Infinity) ? s : w));
  const round = (v, places = 3) => (v === null ? null : Math.round(v * 10 ** places) / 10 ** places);
  const lost = steps.find((s) => !s.found);
  return {
    from: names[0], to: names[1], variant, friction, samples,
    found: !lost, balanced: steps.every((s) => s.balanced),
    share: round(worst.share), at: round(worst.t), held: steps.every((s) => s.found && s.balanced && s.share <= 1),
    shares: steps.map((s) => round(s.share)),
    lost: lost ? { at: round(lost.t), off: round(lost.off, 4), overlap: round(lost.overlap.depth, 4), between: lost.overlap.between } : null,
  };
}

// --- The engine's body

/**
 * **The engine's body put where `body` stands**: each segment of `built` (a body of the same spec
 * in a world that steps) moved to its namesake's pose, `lift` m higher, at rest. Outside the
 * engine's contract, on the rigid body itself (as `research/core-rapier-probe.mjs` reaches it): done
 * before a step, and no velocity read until one has run, since a segment's velocities are kept for
 * the step.
 */
export function placeLike(body, built, lift = 0.0005) {
  for (const segment of body.segments) {
    const other = built.segments.get(segment.spec.name), p = segment.node.position, q = segment.node.rotationQuaternion;
    const rigid = other.body.rigid;
    rigid.setTranslation({ x: p.x, y: p.y + lift, z: p.z }, true);
    rigid.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    rigid.setLinvel({ x: 0, y: 0, z: 0 }, true);
    rigid.setAngvel({ x: 0, y: 0, z: 0 }, true);
    other.node.position.set(p.x, p.y + lift, p.z);
    (other.node.rotationQuaternion ??= new Quaternion()).copyFrom(q);
  }
}

/**
 * **Each joint's moment** (N m, world) on its child, its parent taking the opposite, that gives
 * its freedoms `torques` (by freedom) with `body` in `posture`: the least moment whose part along
 * each freedom's axis (`bodyDynamics`'s `axis`) is that freedom's torque; the joint's constraint
 * takes the rest.
 */
export function jointMomentsOf(body, posture, torques) {
  body.dynamics.update(byJoint(body, posture.angles));
  return body.joints.map((joint, j) => {
    const fs = body.freedoms.flatMap((f, i) => (f.j === j ? [i] : []));
    const A = fs.map((i) => [...body.dynamics.axis(i)]);
    const G = A.map((a) => A.map((b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    const z = solveDense(G, fs.map((i) => torques[i]));
    return new Vector3(...[0, 1, 2].map((k) => A.reduce((sum, a, r) => sum + a[k] * z[r], 0)));
  });
}

// --- The stand hold and the handover

export const HOLD_HARNESS = "Node, core world (src/core/world.ts), Rapier, at the solver named";

/**
 * The solvers a hold is read on. A posture held by its joints' motors alone gives under its load
 * as far as the solver falls short of converging: on the game's own (`game`: 120 Hz, the core's
 * iterations) a statue standing as built, every freedom driven to its angle at 5000 N m, misses
 * its goals by 0.12 rad within a second and falls, and one squatting at 0.5 m sinks and falls on
 * its back; at 480 Hz and 256 iterations of 4 passes (`reference`) the two stay within 2 and 4 cm
 * of where they were put over 2 s, every joint within 0.0006 rad (`docs/reference/postures.md`).
 * So the body's hold is read on the reference, and the game's on its own. The reference's
 * iterations are set on Rapier's world from here, outside the engine's contract: a measuring
 * instrument's, not the core's.
 */
export const SOLVERS = Object.freeze({
  reference: Object.freeze({ hz: 480, iterations: 256, pgs: 4 }),
  game: Object.freeze({ hz: PHYSICS_HZ.value }),
});
/** How long a placed posture is watched, s. */
const HOLD_SECONDS = 3;
/** How far a placed body is put over its ground, m: no contact is made in placing it. */
const LIFT = 0.0005;
/**
 * A freedom driven to its angle closes its error in `CLOSE_SECONDS`, at most `CLOSE_MOST` rad/s:
 * the pose drive the rise battery holds a body stiff with (`toppled`, `research/core-rise-trials.mjs`).
 */
const CLOSE_SECONDS = 0.2, CLOSE_MOST = 3;
/** How far a segment may move from where it was put, m, and the posture have stayed. */
const STAYED = 0.02;
/** How much stronger than its strength the solver's own creep is read at (`creep`): every freedom held by ten times its peak. */
export const STRONG = 10;
/** How far the strong control may move and not have fallen, m: five times `STAYED`. */
const FELL = 5 * STAYED;
/** The shares the least that holds is bisected over (`least`), and how many times. */
const LEAST_MOST = 1.5, LEAST_STEPS = 8;
/** How long a handed-over body is watched, s: long enough to rise and be up `UP_SECONDS`. */
const HANDED_SECONDS = 6;
/** How far under the height its stance asks a handed-over body's centre of mass may end and it have stood, m. */
const STOOD = 0.05;

/** `spec` with each stop `variant` strips put at `STRIPPED` (`VARIANTS`), each a fresh leaf. */
export function strippedSpec(spec, variant) {
  const patterns = VARIANTS[variant];
  if (!patterns) throw new Error(`no variant ${variant}`);
  if (patterns.length === 0) return spec;
  const rule = "the posture audit's stripped stop: short of the half turn the angles' measure reads within";
  return {
    ...spec,
    joints: spec.joints.map((joint) => ({
      ...joint,
      dofs: joint.dofs.map((dof) => (patterns.some((pattern) => pattern.test(`${joint.name} ${dof.positive}`)) ? { ...dof, max: derive("rad", rule, [dof.max], () => STRIPPED) } : dof)),
    })),
  };
}

/**
 * **`variant`'s body built in a world on the arena's ground and put in `posture`**, `lift` m over
 * it and at rest: its segments fixed while they are put (as the `held` level does), then let go.
 * `make(built, world)` makes what drives it before it is put (`setLevel` is the caller's, through
 * `level`). The caller disposes.
 */
async function placed(posture, { variant = "built", lift = LIFT, make, solver = "game" } = {}) {
  const scene = new Scene(new NullEngine());
  const { hz, iterations, pgs } = SOLVERS[solver];
  const world = createWorld(scene, await freshEngine(), { hz });
  if (iterations && !world.physics.raw) throw new Error(`the ${solver} solver is Rapier's`);
  if (iterations) { world.physics.raw.numSolverIterations = iterations; world.physics.raw.numInternalPgsIterations = pgs; }
  addArenaSolids(world.physics);
  const built = buildBody(strippedSpec(modelSpec(AUDITED), variant), world, { position: [0, 0, 0] });
  const driving = make?.(built, world) ?? null;
  const level = (fixed) => { for (const segment of built.segments.values()) segment.body.setFixed(fixed); };
  if (driving?.setLevel) driving.setLevel("held"); else level(true);
  const body = await bodyOnce();
  posed(body, posture);
  placeLike(body, built, lift);
  if (driving?.setLevel) driving.setLevel("full"); else level(false);
  return { world, built, driving, dispose: () => { driving?.dispose?.(); built.dispose(); world.dispose(); scene.dispose(); } };
}

/**
 * What a placed body did over `steps` of its world's steps: how far its segments went from where
 * they were put (`drift`, m, the most of any), the freedom furthest from its goal at the end
 * (`worst`), the fastest any segment moved over the last second (`peak`, m/s), and over the last
 * half second which segments the ground pushed (`touched`) and which pairs of its own unjointed
 * segments the solver pushed apart (`leant`).
 */
function watch(world, built, goals, steps, each = () => {}) {
  const segments = [...built.segments.values()], joints = [...built.joints.values()];
  const from = segments.map((segment) => segment.node.position.clone());
  const nameOf = new Map(segments.map((segment) => [segment.body, segment.spec.name]));
  const jointed = new Set(joints.flatMap((joint) => [`${joint.parent.spec.name}|${joint.child.spec.name}`, `${joint.child.spec.name}|${joint.parent.spec.name}`]));
  const touched = new Set(), leant = new Set(), v = new Vector3();
  let peak = 0;
  for (let i = 0; i < steps; i++) {
    world.step();
    each(i);
    if (i >= steps - world.hz) for (const segment of segments) peak = Math.max(peak, segment.body.linearVelocityToRef(v).length());
    if (i < steps - world.hz / 2) continue;
    for (const segment of segments) {
      for (const contact of world.physics.contactsOf(segment.body)) {
        if (contact.impulse <= 0) continue;
        if (contact.other === null) touched.add(segment.spec.name);
        else if (nameOf.has(contact.other) && !jointed.has(`${segment.spec.name}|${nameOf.get(contact.other)}`)) leant.add([segment.spec.name, nameOf.get(contact.other)].sort().join(" on "));
      }
    }
  }
  const drift = Math.max(...segments.map((segment, k) => Vector3.Distance(segment.node.position, from[k])));
  let worst = { channel: null, error: 0 };
  joints.forEach((joint, j) => jointAngles(joint).forEach((a, k) => {
    const error = a - goals[j][k];
    if (Math.abs(error) > Math.abs(worst.error)) worst = { channel: `${joint.spec.name} ${joint.dofs[k].spec.positive}`, error };
  }));
  return { drift, worst, peak, touched: [...touched].sort(), leant: [...leant].sort() };
}

const close = (error) => Math.max(-CLOSE_MOST, Math.min(CLOSE_MOST, error / CLOSE_SECONDS));
const round = (v, places = 3) => Math.round(v * 10 ** places) / 10 ** places;

/**
 * **Whether the engine's body stays in `posture`** (a row's, `row`), put there and held `seconds`
 * by its motors, each freedom driven to its angle (`close`) with at most `k` times the peak of its
 * muscles on the side the statics say it loads (`drive: "side"`; a freedom the statics load
 * nowhere, its weaker side), or by the muscle driver itself at activation `k` (`drive: "driver"`,
 * `driveMuscles`): its ceiling the side it is pushed toward. Stayed: no segment `STAYED` m from
 * where it was put. The rest is `watch`'s. On `solver` (`SOLVERS`).
 */
export async function held({ row: name, posture, variant = "built", k = 1, drive = "side", seconds = HOLD_SECONDS, lift = LIFT, solver = "reference" }) {
  const body = await bodyOnce(), row = rowNamed(name), goals = byJoint(body, posture.angles);
  posed(body, posture);
  const solved = leastShare(body, row, posture, { ranges: rangesOf(body, variant), snap: true });
  const ceilings = body.freedoms.map((f, i) => {
    const t = solved.balanced ? solved.torques[i] : 0;
    return k * (t > 0 ? f.plus : t < 0 ? f.minus : Math.min(f.plus, f.minus));
  });
  const make = (built, world) => {
    if (drive === "driver") {
      const d = driveMuscles(built, world, (muscles) => {
        muscles.activation.fill(Math.min(1, k));
        for (let i = 0; i < muscles.velocity.length; i++) {
          const f = body.freedoms[i];
          muscles.velocity[i] = close(goals[f.j][f.k] - muscles.angle(i));
        }
      });
      return d;
    }
    if (drive !== "side") throw new Error(`no drive ${drive}`);
    const joints = [...built.joints.values()], angles = [], ceilingOf = byJoint(body, ceilings);
    const hook = world.beforeStep(() => joints.forEach((joint, j) => {
      jointAngles(joint, angles);
      joint.dofs.forEach((dof, kk) => joint.joint.setMotor(kk, dof.sign * close(goals[j][kk] - angles[kk]), ceilingOf[j][kk]));
    }));
    return { dispose: () => hook.dispose() };
  };
  const stand = await placed(posture, { variant, lift, make, solver });
  try {
    const seen = watch(stand.world, stand.built, goals, Math.round(seconds * stand.world.hz));
    return {
      row: name, variant, drive, solver, k: round(k), stayed: seen.drift <= STAYED, drift: round(seen.drift, 4),
      worst: { channel: seen.worst.channel, error: round(seen.worst.error) }, peak: round(seen.peak), touched: seen.touched, leant: seen.leant,
    };
  } finally { stand.dispose(); }
}

/**
 * **The least share of its strength that holds `posture` on the engine** (`held`), bisected over
 * [0, `LEAST_MOST`] in `LEAST_STEPS` halvings, beside the solver's own creep there (`STRONG` times
 * its strength): `k` null if even `LEAST_MOST` does not hold it, or if the creep is a fall
 * (`FELL`), when no share is read. A posture whose creep is over `STAYED` is judged against twice
 * its creep.
 */
export async function least({ row, posture, variant = "built", drive = "side", solver = "reference" }) {
  const creep = await held({ row, posture, variant, drive: "side", k: STRONG, solver });
  if (creep.drift > FELL) return { row, variant, drive, solver, k: null, at: creep, creep, fell: true };
  const bar = Math.max(STAYED, 2 * creep.drift);
  const stays = async (k) => { const r = await held({ row, posture, variant, drive, k, solver }); return { ...r, stayed: r.drift <= bar }; };
  const hi = await stays(drive === "driver" ? 1 : LEAST_MOST);
  if (!hi.stayed) return { row, variant, drive, solver, k: null, at: hi, creep, fell: false };
  let lo = 0, best = hi;
  for (let step = 0; step < LEAST_STEPS; step++) {
    const k = (lo + best.k) / 2, r = await stays(k);
    if (r.stayed) best = r; else lo = k;
  }
  return { row, variant, drive, solver, k: best.k, at: best, creep, fell: false };
}

/**
 * **The handover**: the body as the game makes it (`createBody`) put in `posture` while it is
 * `held`, then at `full` and asked what a standing body is asked: the stance on both feet, its
 * centre of mass `STANCE_LOWER` under the height it stands at as built, facing as built, the rest
 * at the reference pose. Stood: up `UP_SECONDS` running within `HANDED_SECONDS` (`risenAt`), which a
 * body squatting on its feet is, and its centre of mass at the end within `STOOD` of the height
 * asked. When it was first up, the centre's height at the end and the height asked, m, and the
 * fastest a segment moved over the last second. On the game's solver unless `solver` says.
 */
export async function handed({ row, posture, seconds = HANDED_SECONDS, lift = LIFT, solver = "game" }) {
  const body = await bodyOnce();
  const height = standingHeight(body) - STANCE_LOWER;
  const stance = Object.freeze({ feet: Object.freeze(["left", "right"]), centre: null, height, heading: 0 });
  const command = Object.freeze({ posture: Object.freeze({}), hands: Object.freeze({ left: null, right: null }), pushes: Object.freeze([]), stance });
  const stand = await placed(posture, { lift, solver, make: (built, world) => createBody(built, world, { servoSeconds: SERVO_SECONDS }) });
  try {
    stand.driving.drive(() => command);
    const downs = [];
    const seen = watch(stand.world, stand.built, byJoint(body, posture.angles), Math.round(seconds * stand.world.hz), () => downs.push(stand.driving.view.down));
    const at = risenAt(downs, stand.world.hz), segments = [...stand.built.segments.values()];
    const centre = centreOfMass({ segments, mass: segments.reduce((sum, segment) => sum + segment.rigid.mass, 0) }).y;
    return {
      row, solver, stood: at !== null && centre >= height - STOOD, seconds: at === null ? null : round(at, 2),
      centre: round(centre), asked: round(height), peak: round(seen.peak), down: downs.at(-1),
    };
  } finally { stand.dispose(); }
}

/** The height of `body`'s centre of mass over its soles standing in its reference pose, m. */
function standingHeight(body) {
  const stand = rowNamed("stand"), { posture } = project(body, stand, { height: 1, pitch: 0, roll: 0, angles: body.freedoms.map(() => 0) }, { knobs: [] });
  posed(body, posture);
  return centreOfMass(body).y;
}

/** A worker's one static body, built at its first job. */
let made = null;
const bodyOnce = () => (made ??= staticBody());

export const TRIALS = { audit, path, held, least, handed };
