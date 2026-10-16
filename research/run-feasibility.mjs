/**
 * **Can a body run as a person runs?** A clip of a person running (a BVH clip, `research/bvh.mjs`)
 * carrying a body's mass, in the plane the run goes in, and the torque each leg joint would need to
 * move it so (planar inverse dynamics, Newton-Euler, foot to hip), set against what the joint's
 * muscles can give at the speed it turns (`forceVelocityFactor`, the body's own peaks and curves).
 * No controller and no engine: it asks whether any controller could.
 *
 * - **The pose.** The clip's own skeleton, filtered: each body segment's mass sits on the clip's
 *   joints that piece spans (`UPPER`; the thigh and shank on the hip, knee and ankle) at the share
 *   of its axis the body's spec puts it, and turns as that axis turns from the clip's zero pose. The
 *   foot turns as the clip's foot bone does. The body's inertias are scaled to the clip's size, and
 *   the result back to the body's by Froude (the body's leg, hip to ankle, over the clip's: moments
 *   by the ratio, speeds by one over its root).
 * - **The ground.** The force the ground must give is the whole body's rate of momentum less its
 *   weight. It bears while that force holds up more than `BEARS` of the weight: on the lower sole
 *   from a landing, a second joining that comes down low and slow, and of two, one gone fast leaving
 *   (`SOLE`); a frame on both is left out of the stance leg's reading, since the force is not split.
 *   The clip's foot bone is not trusted for the sole's place (CMU's turns through more than a
 *   person's ankle does), so the ground is each ankle's lowest less the body's ankle height. The
 *   force is borne where its line through the centre of mass meets the ground, held to the flat
 *   sole's reach behind and ahead of the ankle; a frame where that point falls past the sole by more
 *   than `MARGIN` is the filter spreading the force past a sole's leaving, and is unexplained and
 *   not read. The point that balances the body's rate of angular momentum is reported beside it as
 *   a check, not used. While both ankles are well clear of the ground (`SOLE.clear`) the force
 *   should be nothing: what is left (`flight residual`) is the reading's error; and the vertical
 *   impulse borne over all of it is the share the reading explains.
 * - **The stretch.** Only the clip's longest steady stretch one way is read (`steady`).
 * - **The reading.** Each joint's freedom in the body's channel sense (hip flexion from the pelvis,
 *   knee flexion, ankle dorsiflexion positive, read from the zero pose as a source's ranges are), its
 *   speed, and the torque needed. The muscles pulling the torque's way can give
 *   `peak x forceVelocityFactor(speed in their direction)`; the torque over that is the **use**, and
 *   a use over 1 is a frame the body cannot make. The ankle's angles and its moment's lever lean on
 *   the foot bone and the sole's reach, and are the least sure of the three.
 * - **Haste** (the legs' muscles' unloaded speed, a per cent of the body's, as the owner set it) is
 *   read as the least factor, of `HASTE`, at which no frame's use passes 1; past the last, a frame
 *   asks more than the joint's peak, which no speed gives.
 *
 *   node research/run-feasibility.mjs <clip.bvh>[@rate] [...] [--models workshop-fighter,workshop-rogue]
 *     [--cutoff 8] [--json out.json]
 *
 * `@rate` is a clip's frames a second where its file's frame time is not (CMU's subjects captured
 * at 60: 141_34@60). `--cutoff` is the low-pass filter's corner on the clip's places, Hz (a
 * second-order Butterworth run both ways, the corner corrected for the two passes, Winter 2009).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { dot, readClip, size, sub } from "./bvh.mjs";

const G = 9.81;
/** Haste factors tried, lowest first. */
const HASTE = [1, 1.25, 1.5, 2, 2.5, 3, 4, 6];
/** The leg joints read, by channel: the joint, its freedom and its sense in the plane. */
const CHANNELS = [
  { name: "hip flexion", joint: "hip", dof: 0 },
  { name: "knee flexion", joint: "knee", dof: 0 },
  { name: "ankle dorsiflexion", joint: "ankle", dof: 0 },
];
/**
 * The clip's joints each piece above the legs spans, from its proximal end to its distal, as the
 * body's spec places them. The head's distal end is the crown, the clip's Head its skull's base, so
 * the head sits a little low; the hand's distal end is the clip's index finger.
 */
const UPPER = {
  head: ["Neck", "Head"], upperTrunk: ["Neck", "Spine1"], middleTrunk: ["Spine1", "Spine"], lowerTrunk: ["Spine", "Hips"],
  "upperArm.left": ["LeftArm", "LeftForeArm"], "forearm.left": ["LeftForeArm", "LeftHand"], "hand.left": ["LeftHand", "LeftHandIndex1"],
  "upperArm.right": ["RightArm", "RightForeArm"], "forearm.right": ["RightForeArm", "RightHand"], "hand.right": ["RightHand", "RightHandIndex1"],
};
/** The piece whose turn the hip's flexion is read from. */
const PELVIS = "lowerTrunk";
/** A frame at the clip's ends, within this many of them, is dropped: the filter and the differences need its neighbours. */
const EDGE = 8;
/** How far past the sole's heel or toe the ground's force may meet the ground and the sole still bear it, m on the body. */
const MARGIN = 0.02;
/** A stance frame counts in the friction reading when the ground bears more than this share of the weight. */
const LOADED = 0.2;
/** The ground bears while the body needs more than this share of its weight from it; flight otherwise. */
const BEARS = 0.1;
/**
 * Which soles bear, frame to frame: the lower ankle's from a landing until flight; while one bears, a
 * second joins as its ankle comes within `land` of its lowest (its 5 % quantile over the stretch),
 * m on the body, slower than `speed` m/s on the body, and of two, one faster than that leaves. A
 * frame is surely in flight while both ankles are over `clear` m up.
 */
const SOLE = { land: 0.03, speed: 1, clear: 0.12 };
/** What `steady` reads a stretch by: its speed's span, s; the brisk speed's quantile; the share of it held; the most the way may turn, rad. */
const STEADY = { span: 0.5, brisk: 0.9, share: 0.8, turn: 0.35 };

const { modelSpec } = await import("../src/core/models.ts");
const { forceVelocityFactor } = await import("../src/core/muscle/force-velocity.ts");

// -- The plane: forward along the run, up.

const plane = (p, e) => [p[0] * e[0] + p[2] * e[2], p[1]];
const angle = (v) => Math.atan2(v[1], v[0]);
const turn = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [c * v[0] - s * v[1], s * v[0] + c * v[1]]; };
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const less = (a, b) => [a[0] - b[0], a[1] - b[1]];
const crossz = (a, b) => a[0] * b[1] - a[1] * b[0];
const unwrap = (xs) => { const out = [xs[0]]; for (let i = 1; i < xs.length; i++) { let d = xs[i] - xs[i - 1]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; out.push(out[i - 1] + d); } return out; };

/** A second-order Butterworth low-pass run forward and back, the ends padded by reflection. */
function lowPass(xs, cutoff, rate) {
  const corrected = cutoff / 0.802, K = Math.tan(Math.PI * corrected / rate), norm = 1 / (1 + Math.SQRT2 * K + K * K);
  const b0 = K * K * norm, b1 = 2 * b0, b2 = b0, a1 = 2 * (K * K - 1) * norm, a2 = (1 - Math.SQRT2 * K + K * K) * norm;
  const pad = Math.min(xs.length - 1, 30);
  const padded = [...Array.from({ length: pad }, (_, i) => 2 * xs[0] - xs[pad - i]), ...xs, ...Array.from({ length: pad }, (_, i) => 2 * xs[xs.length - 1] - xs[xs.length - 2 - i])];
  const pass = (v) => { const y = new Array(v.length); let x1 = v[0], x2 = v[0], y1 = v[0], y2 = v[0]; for (let i = 0; i < v.length; i++) { const yi = b0 * v[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v[i]; y2 = y1; y1 = yi; y[i] = yi; } return y; };
  return pass(pass(padded).reverse()).reverse().slice(pad, pad + xs.length);
}

// -- The clip, in the plane.

/**
 * The longest stretch of frames over which the hips go at least `STEADY.share` of the clip's
 * brisk speed (its `STEADY.brisk` quantile, the speed read over `STEADY.span` s) and within
 * `STEADY.turn` rad of the way they went as it began: a clip's start, stop and turn left out.
 */
function steady(hips, dt) {
  const k = Math.max(1, Math.round(STEADY.span / dt / 2)), n = hips.length;
  const v = hips.map((_, f) => { const a = hips[Math.max(0, f - k)], b = hips[Math.min(n - 1, f + k)], t = (Math.min(n - 1, f + k) - Math.max(0, f - k)) * dt; return [(b[0] - a[0]) / t, (b[2] - a[2]) / t]; });
  const speeds = v.map((x) => Math.hypot(x[0], x[1])), sorted = [...speeds].sort((a, b) => a - b), brisk = sorted[Math.floor(STEADY.brisk * (n - 1))];
  let best = { first: 0, last: 0 }, start = -1, heading = 0;
  for (let f = 0; f <= n; f++) {
    const going = f < n && speeds[f] >= STEADY.share * brisk;
    const way = f < n ? Math.atan2(v[f][1], v[f][0]) : 0;
    const turned = start >= 0 && Math.abs(Math.atan2(Math.sin(way - heading), Math.cos(way - heading))) > STEADY.turn;
    if (start >= 0 && (!going || turned)) { if (f - 1 - start > best.last - best.first) best = { first: start, last: f - 1 }; start = -1; }
    if (going && start < 0) { start = f; heading = way; }
  }
  return best;
}

export function clipMotion(file, rate, cutoff) {
  const read = readClip(readFileSync(file, "utf8"), { rate });
  const { frames, dt, zero, index, J, at, rest } = read;
  const mid = (f) => at(f, J.left.hip).map((x, k) => (x + at(f, J.right.hip)[k]) / 2);
  // The run read: the longest stretch going steadily one way (`steady`).
  const { first, last } = steady(Array.from({ length: frames }, (_, f) => mid(f)), dt);
  const moved = sub(mid(last), mid(first)), e = [moved[0] / Math.hypot(moved[0], moved[2]), 0, moved[2] / Math.hypot(moved[0], moved[2])];
  const p = (f, j) => plane(at(f, j), e);
  const series = (fn) => lowPass(Array.from({ length: frames }, (_, f) => fn(f)), cutoff, 1 / dt);
  const angles = (fn) => lowPass(unwrap(Array.from({ length: frames }, (_, f) => fn(f))), cutoff, 1 / dt);
  const track = (fn) => ({ x: series((f) => fn(f)[0]), y: series((f) => fn(f)[1]) });
  // The zero pose faces +z: its places in the plane are (z, y).
  const rested = (j) => [zero[j][2], zero[j][1]];
  const names = [...new Set(Object.values(UPPER).flat())];
  const joints = Object.fromEntries(names.map((name) => [name, track((f) => p(f, index(name)))]));
  const restOf = Object.fromEntries(Object.entries(UPPER).map(([piece, [a, b]]) => [piece, angle(less(rested(index(b)), rested(index(a))))]));
  const legs = Object.fromEntries(["left", "right"].map((side) => {
    const j = J[side];
    // The foot at rest falls from ankle to toe as the importer reads it: its pitch is -(pi/2 - rest).
    const restFoot = -(Math.PI / 2 - rest[side]);
    return [side, {
      hip: track((f) => p(f, j.hip)), knee: track((f) => p(f, j.knee)), ankle: track((f) => p(f, j.ankle)),
      foot: angles((f) => angle(less(p(f, j.toe), p(f, j.ankle))) - restFoot),
      rest: { thigh: angle(less(rested(j.knee), rested(j.hip))), shank: angle(less(rested(j.ankle), rested(j.knee))) },
    }];
  }));
  const leg = (f) => (size(sub(at(f, J.left.hip), at(f, J.left.knee))) + size(sub(at(f, J.left.knee), at(f, J.left.ankle)))
    + size(sub(at(f, J.right.hip), at(f, J.right.knee))) + size(sub(at(f, J.right.knee), at(f, J.right.ankle)))) / 2;
  const legLength = Array.from({ length: frames }, (_, f) => leg(f)).reduce((a, b) => a + b, 0) / frames;
  const speed = dot(moved, e) / ((last - first) * dt);
  return {
    clip: basename(file), frames, dt, first, last, legLength, speed,
    joints, restOf, legs,
  };
}

// -- The body, in the plane: its reference pose seen from its left, forward along +z.

export function bodyModel(spec) {
  const seg = (name) => { const s = spec.segments.find((x) => x.name === name); if (!s) throw new Error(`no segment ${name}`); return s; };
  const joint = (name) => { const j = spec.joints.find((x) => x.name === name); if (!j) throw new Error(`no joint ${name}`); return j; };
  const flat = (v) => [v[2], v[1]];
  const piece = (s) => ({ name: s.name, mass: s.mass.value ?? s.mass, inertia: (s.inertia.value ?? s.inertia)[0], centre: flat(s.centreOfMass.value ?? s.centreOfMass) });
  const val = (q) => q?.value ?? q;
  const hip = flat(val(joint("hip.left").centre)), knee = flat(val(joint("knee.left").centre)), ankle = flat(val(joint("ankle.left").centre));
  const legNames = new Set(["thigh.left", "shank.left", "foot.left", "thigh.right", "shank.right", "foot.right"]);
  const upper = spec.segments.filter((s) => !legNames.has(s.name)).map((s) => {
    const ends = UPPER[s.name];
    if (!ends) throw new Error(`no clip joints for ${s.name}`);
    return { ...piece(s), ends, share: shares(flat(val(s.centreOfMass)), flat(val(s.proximal)), flat(val(s.distal))) };
  });
  const foot = seg("foot.left"), box = foot.shape;
  const soleHeight = val(foot.points.sole)[1];
  const heel = [val(box.centre)[2] - val(box.size)[1] / 2, 0], toe = [val(box.centre)[2] + val(box.size)[1] / 2, 0];
  const dofs = Object.fromEntries(CHANNELS.map((c) => {
    const d = joint(`${c.joint}.left`).dofs[c.dof], m = d.muscle;
    const curve = (q) => ({ unloadedSpeed: val(q.unloadedSpeed), curvature: val(q.curvature), eccentricCeiling: val(q.eccentricCeiling), eccentricSlopeRatio: val(q.eccentricSlopeRatio) });
    return [c.name, { min: val(d.min), max: val(d.max), bind: val(d.bind), positive: { peak: val(m.peakPositive), curve: curve(m.speedPositive) }, negative: { peak: val(m.peakNegative), curve: curve(m.speedNegative) } }];
  }));
  return {
    model: spec.model, mass: val(spec.mass), hip, knee, ankle, upper, heel, toe, dofs,
    thigh: piece(seg("thigh.left")), shank: piece(seg("shank.left")), foot: { ...piece(foot), sole: soleHeight },
    leg: Math.hypot(knee[0] - hip[0], knee[1] - hip[1]) + Math.hypot(ankle[0] - knee[0], ankle[1] - knee[1]),
  };
}

// -- Posed and read.

/** A piece's centre as shares of its axis from `from` to `to` and of that axis turned a quarter forward-up, in the body's reference pose. */
function shares(centre, from, to) {
  const axis = less(to, from), d = less(centre, from), l2 = axis[0] * axis[0] + axis[1] * axis[1];
  return { along: (d[0] * axis[0] + d[1] * axis[1]) / l2, across: crossz(axis, d) / l2 };
}
const placed = (from, to, s) => { const axis = less(to, from), across = turn(axis, Math.PI / 2); return add(from, [axis[0] * s.along + across[0] * s.across, axis[1] * s.along + across[1] * s.across]); };

export function feasibility(motion, body) {
  // The clip's skeleton carries the body's mass, by the body's shares, at the clip's size: lengths
  // by 1/ratio, inertias by its square. Times and accelerations are the clip's, so its forces are
  // the body's; its moments are the body's over ratio and its speeds the body's times the root of ratio.
  const ratio = body.leg / motion.legLength, small = 1 / ratio, dt = motion.dt;
  const thighShare = shares(body.thigh.centre, body.hip, body.knee), shankShare = shares(body.shank.centre, body.knee, body.ankle);
  const scaled = (piece) => ({ ...piece, inertia: piece.inertia * small * small });
  const n = motion.frames;
  // Every frame's pose: each piece's centre and turn, each joint's place, each sole's corners.
  const poses = Array.from({ length: n }, (_, f) => {
    const J = (name) => [motion.joints[name].x[f], motion.joints[name].y[f]];
    const pieces = body.upper.map((u) => {
      const from = J(u.ends[0]), to = J(u.ends[1]);
      return { ...scaled(u), at: placed(from, to, u.share), turn: angle(less(to, from)) - motion.restOf[u.name] };
    });
    const trunk = pieces.find((u) => u.name === PELVIS).turn;
    const legs = {};
    for (const side of ["left", "right"]) {
      const L = motion.legs[side], dFoot = L.foot[f];
      const Hs = [L.hip.x[f], L.hip.y[f]], K = [L.knee.x[f], L.knee.y[f]], A = [L.ankle.x[f], L.ankle.y[f]];
      const thighTurn = angle(less(K, Hs)), shankTurn = angle(less(A, K));
      const onFoot = (q) => add(A, turn([(q[0] - body.ankle[0]) * small, (q[1] - body.ankle[1]) * small], dFoot));
      const thighFrom = thighTurn - L.rest.thigh, shankFrom = shankTurn - L.rest.shank;
      legs[side] = {
        H: Hs, K, A, heel: onFoot(body.heel), toe: onFoot(body.toe),
        thigh: { ...scaled(body.thigh), at: placed(Hs, K, thighShare), turn: thighTurn },
        shank: { ...scaled(body.shank), at: placed(K, A, shankShare), turn: shankTurn },
        foot: { ...scaled(body.foot), at: onFoot(body.foot.centre), turn: dFoot },
        // Anatomical angles: from the clip's zero pose, as a source's ranges are read.
        reading: { "hip flexion": thighFrom - trunk, "knee flexion": thighFrom - shankFrom, "ankle dorsiflexion": dFoot - shankFrom },
      };
    }
    return { pieces, legs, trunk };
  });
  // A piece turned past a half turn (a thigh or shank kicked up past level, an arm swung) carries its turn on without the jump.
  body.upper.forEach((u, i) => {
    const turns = unwrap(poses.map((q) => q.pieces[i].turn));
    poses.forEach((q, f) => { q.pieces[i].turn = turns[f]; });
  });
  const pelvisAt = body.upper.findIndex((u) => u.name === PELVIS);
  poses.forEach((q) => { q.trunk = q.pieces[pelvisAt].turn; });
  for (const side of ["left", "right"]) for (const k of ["thigh", "shank"]) {
    const turns = unwrap(poses.map((q) => q.legs[side][k].turn));
    poses.forEach((q, f) => {
      const leg = q.legs[side], shift = turns[f] - leg[k].turn;
      leg[k].turn = turns[f];
      if (k === "thigh") { leg.reading["hip flexion"] += shift; leg.reading["knee flexion"] += shift; }
      else { leg.reading["knee flexion"] -= shift; leg.reading["ankle dorsiflexion"] -= shift; }
    });
  }
  const accel = (f, pick) => { const a = pick(poses[f - 1]), b = pick(poses[f]), c = pick(poses[f + 1]); return [(a[0] - 2 * b[0] + c[0]) / (dt * dt), (a[1] - 2 * b[1] + c[1]) / (dt * dt)]; };
  const spinRate = (f, pick) => (pick(poses[f + 1]) - pick(poses[f - 1])) / (2 * dt);
  const spinAccel = (f, pick) => (pick(poses[f - 1]) - 2 * pick(poses[f]) + pick(poses[f + 1])) / (dt * dt);
  const gravity = [0, -G];
  const weight = body.mass * G;
  const from = Math.max(EDGE, motion.first), to = Math.min(n - 1 - EDGE, motion.last);
  // Each ankle's lowest over the stretch, its 5 % quantile, and how high and fast it is.
  const floorOf = Object.fromEntries(["left", "right"].map((side) => {
    const ys = []; for (let f = from; f <= to; f++) ys.push(poses[f].legs[side].A[1]);
    ys.sort((a, b) => a - b);
    return [side, ys[Math.floor(0.05 * (ys.length - 1))]];
  }));
  const height = (pose, side) => pose.legs[side].A[1] - floorOf[side];
  const going = (f, side) => Math.abs(poses[f + 1].legs[side].A[0] - poses[f - 1].legs[side].A[0]) / (2 * dt);
  // The flat sole's reach behind and ahead of the ankle, on the clip's skeleton.
  const sole = { heel: (body.heel[0] - body.ankle[0]) * small, toe: (body.toe[0] - body.ankle[0]) * small };
  const rows = [];
  let bearing = [];
  for (let f = from; f <= to; f++) {
    const pose = poses[f];
    const all = [...pose.pieces.map((_, i) => ({ get: (q) => q.pieces[i] })),
      ...["left", "right"].flatMap((side) => ["thigh", "shank", "foot"].map((k) => ({ get: (q) => q.legs[side][k] })))];
    // The ground's force and the moment it must give, about the origin: the body's rates of momentum less gravity's.
    let F = [0, 0], M = 0, mass = 0, centre = [0, 0];
    for (const { get } of all) {
      const p = get(pose), a = accel(f, (q) => get(q).at), alpha = spinAccel(f, (q) => get(q).turn);
      const need = [p.mass * (a[0] - gravity[0]), p.mass * (a[1] - gravity[1])];
      F = add(F, need); M += crossz(p.at, need) + p.inertia * alpha;
      mass += p.mass; centre = add(centre, [p.at[0] * p.mass, p.at[1] * p.mass]);
    }
    centre = [centre[0] / mass, centre[1] / mass];
    // Which soles bear (`SOLE`): from a landing until flight; a second sole that comes down slow joins, and of two, one gone fast leaves.
    const slow = (side) => going(f, side) < SOLE.speed * Math.sqrt(small);
    const lower = height(pose, "left") <= height(pose, "right") ? "left" : "right";
    if (F[1] <= BEARS * weight) bearing = [];
    else if (!bearing.length) bearing = [lower];
    else {
      for (const side of ["left", "right"]) if (!bearing.includes(side) && height(pose, side) < SOLE.land * small && slow(side)) bearing = [...bearing, side];
      if (bearing.length === 2) { const kept = bearing.filter(slow); bearing = kept.length ? kept : bearing; }
    }
    const clear = ["left", "right"].every((side) => height(pose, side) > SOLE.clear * small);
    // A sole the force, aimed through the centre of mass, cannot pass through is not bearing it: the
    // filter has spread the force past the sole's leaving. Such a frame is unexplained and not read.
    const level = (side) => floorOf[side] + (body.foot.sole - body.ankle[1]) * small;
    const aimedAt = (side) => centre[0] - (centre[1] - level(side)) * F[0] / F[1];
    const fits = (side) => { const x = aimedAt(side) - pose.legs[side].A[0]; return x >= sole.heel - MARGIN * small && x <= sole.toe + MARGIN * small; };
    const unexplained = bearing.length === 1 && !fits(bearing[0]);
    const row = { f, bearing: unexplained ? [] : bearing, bore: bearing, unexplained, clear, force: F, trunk: pose.trunk, legs: {} };
    for (const side of ["left", "right"]) {
      const leg = pose.legs[side], on = !unexplained && bearing.length === 1 && bearing[0] === side;
      let ground = [0, 0], cop = null;
      if (on) {
        const lo = leg.A[0] + sole.heel, hi = leg.A[0] + sole.toe;
        // The balance of the body's angular momentum puts it here: reported, not used.
        const balanced = (M + level(side) * F[0]) / F[1];
        // Where the ground's force, aimed through the centre of mass, meets the ground, held to the sole.
        const aimed = aimedAt(side);
        cop = [Math.max(lo, Math.min(hi, aimed)), level(side)];
        ground = F;
        row.cop = { off: aimed < lo || aimed > hi ? 1 : 0, balancedOff: balanced < lo || balanced > hi ? 1 : 0, friction: F[1] > LOADED * weight ? Math.abs(F[0] / F[1]) : null, up: F[1] / weight };
      }
      // Foot to hip: the force and moment each piece's parent gives it.
      const foot = leg.foot, shank = leg.shank, thigh = leg.thigh;
      const aFoot = accel(f, (q) => q.legs[side].foot.at), aShank = accel(f, (q) => q.legs[side].shank.at), aThigh = accel(f, (q) => q.legs[side].thigh.at);
      const alFoot = spinAccel(f, (q) => q.legs[side].foot.turn), alShank = spinAccel(f, (q) => q.legs[side].shank.turn), alThigh = spinAccel(f, (q) => q.legs[side].thigh.turn);
      const FA = less([foot.mass * (aFoot[0] - gravity[0]), foot.mass * (aFoot[1] - gravity[1])], ground);
      const MA = foot.inertia * alFoot - crossz(less(leg.A, foot.at), FA) - (cop ? crossz(less(cop, foot.at), ground) : 0);
      const FK = add([shank.mass * (aShank[0] - gravity[0]), shank.mass * (aShank[1] - gravity[1])], FA);
      const MK = shank.inertia * alShank + MA - crossz(less(leg.K, shank.at), FK) + crossz(less(leg.A, shank.at), FA);
      const FH = add([thigh.mass * (aThigh[0] - gravity[0]), thigh.mass * (aThigh[1] - gravity[1])], FK);
      const MH = thigh.inertia * alThigh + MK - crossz(less(leg.H, thigh.at), FH) + crossz(less(leg.K, thigh.at), FK);
      const torque = { "hip flexion": MH * ratio, "knee flexion": -MK * ratio, "ankle dorsiflexion": MA * ratio };
      const slow = 1 / Math.sqrt(ratio);
      const rate = {
        "hip flexion": (spinRate(f, (q) => q.legs[side].thigh.turn) - spinRate(f, (q) => q.trunk)) * slow,
        "knee flexion": (spinRate(f, (q) => q.legs[side].thigh.turn) - spinRate(f, (q) => q.legs[side].shank.turn)) * slow,
        "ankle dorsiflexion": (spinRate(f, (q) => q.legs[side].foot.turn) - spinRate(f, (q) => q.legs[side].shank.turn)) * slow,
      };
      row.legs[side] = { on, torque, rate, reading: leg.reading };
    }
    rows.push(row);
  }
  return { ratio, dt, rows, speed: motion.speed * Math.sqrt(ratio), seconds: (to - from) * dt * Math.sqrt(ratio) };
}

/** The use of a channel at a frame: the torque needed over what its pulling side gives at its speed, with the legs' unloaded speeds times `haste`. */
function use(dof, torque, rate, haste) {
  const sense = torque >= 0 ? 1 : -1, side = sense > 0 ? dof.positive : dof.negative;
  const curve = { ...side.curve, unloadedSpeed: side.curve.unloadedSpeed * haste };
  const can = side.peak * forceVelocityFactor(sense * rate, curve);
  return can > 0 ? Math.abs(torque) / can : Infinity;
}

const round = (x, k = 2) => Number.isFinite(x) ? +x.toFixed(k) : x === Infinity ? "inf" : null;
const peak = (xs) => xs.reduce((m, x) => Math.max(m, x), -Infinity);
const lowest = (xs) => xs.reduce((m, x) => Math.min(m, x), Infinity);
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

function summarise(result, body) {
  const { rows } = result;
  const clear = rows.filter((r) => r.clear), flight = rows.filter((r) => r.bearing.length === 0), single = rows.filter((r) => r.bearing.length === 1), both = rows.filter((r) => r.bearing.length === 2);
  const out = {
    model: body.model, mass: round(body.mass, 1), scale: round(result.ratio, 3), speed: round(result.speed), seconds: round(result.seconds),
    frames: { read: rows.length, flight: flight.length, single: single.length, both: both.length },
    ground: {
      flightResidual: clear.length ? round(mean(clear.map((r) => Math.hypot(...r.force) / (body.mass * G)))) : null, clearFrames: clear.length,
      peakUp: round(peak(single.map((r) => r.cop.up))),
      friction: round(peak(single.map((r) => r.cop.friction).filter((x) => x !== null))),
      copOutside: round(mean(single.map((r) => r.cop.off))), balancedOutside: round(mean(single.map((r) => r.cop.balancedOff))),
      explained: round(rows.reduce((a, r) => a + (r.bearing.length ? Math.max(0, r.force[1]) : 0), 0) / rows.reduce((a, r) => a + Math.max(0, r.force[1]), 0)),
      unexplained: rows.filter((r) => r.unexplained).length,
    },
    channels: {},
  };
  for (const c of CHANNELS) {
    const dof = body.dofs[c.name];
    // Both legs; a frame on both feet is left out of the stance leg's reading, since the ground's force there is not split.
    const samples = rows.flatMap((r) => ["left", "right"].filter((side) => !(r.bearing.length === 2)).map((side) => ({
      stance: r.legs[side].on, torque: r.legs[side].torque[c.name], rate: r.legs[side].rate[c.name], reading: r.legs[side].reading[c.name],
    })));
    const by = (pred) => samples.filter(pred);
    const uses = (haste, set) => set.map((s) => use(dof, s.torque, s.rate, haste));
    const phase = (set) => ({
      use: round(peak(uses(1, set))), over: round(mean(uses(1, set).map((u) => u > 1 ? 1 : 0))),
      haste: HASTE.find((h) => peak(uses(h, set)) <= 1) ?? `>${HASTE[HASTE.length - 1]}`,
    });
    out.channels[c.name] = {
      speed: { peak: round(peak(samples.map((s) => Math.abs(s.rate)))), positive: round(peak(samples.map((s) => s.rate))), negative: round(lowest(samples.map((s) => s.rate))) },
      torque: { positive: round(peak(samples.map((s) => s.torque)), 0), negative: round(lowest(samples.map((s) => s.torque)), 0) },
      reading: { low: round(lowest(samples.map((s) => s.reading))), high: round(peak(samples.map((s) => s.reading))), min: round(dof.min + dof.bind), max: round(dof.max + dof.bind) },
      peaks: { positive: round(dof.positive.peak, 0), negative: round(dof.negative.peak, 0), w0Positive: round(dof.positive.curve.unloadedSpeed), w0Negative: round(dof.negative.curve.unloadedSpeed) },
      stance: phase(by((s) => s.stance)), swing: phase(by((s) => !s.stance)),
    };
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values: options, positionals } = parseArgs({ allowPositionals: true, options: {
    models: { type: "string", default: "workshop-fighter,workshop-rogue" }, cutoff: { type: "string", default: "8" }, json: { type: "string" },
  } });
  if (!positionals.length) throw new Error("usage: node research/run-feasibility.mjs <clip.bvh>[@rate] [...] [--models a,b] [--cutoff hz] [--json out]");
  const cutoff = Number(options.cutoff);
  const report = { harness: `planar inverse dynamics on the clip's skeleton carrying each body's segments, clip filtered at ${cutoff} Hz, Froude-scaled; no engine`, clips: [] };
  const bodies = options.models.split(",").map((m) => bodyModel(modelSpec(m)));
  for (const arg of positionals) {
    const [file, rate] = arg.split("@");
    const motion = clipMotion(file, rate ? Number(rate) : undefined, cutoff);
    const entry = { clip: motion.clip, speed: round(motion.speed), leg: round(motion.legLength, 3), bodies: [] };
    console.log(`\n${motion.clip}: ${entry.speed} m/s, leg ${entry.leg} m`);
    for (const body of bodies) {
      const s = summarise(feasibility(motion, body), body);
      entry.bodies.push(s);
      console.log(`  ${s.model} (${s.mass} kg, x${s.scale}): ${s.speed} m/s; frames flight/one/both/unexplained ${s.frames.flight - s.ground.unexplained}/${s.frames.single}/${s.frames.both}/${s.ground.unexplained} (vertical impulse explained ${s.ground.explained});`
        + ` ${s.seconds} s read; flight residual ${s.ground.flightResidual} BW over ${s.ground.clearFrames} clear frames, peak up ${s.ground.peakUp} BW, friction needed ${s.ground.friction}, centre of pressure off the sole ${s.ground.copOutside} (by the balance of angular momentum ${s.ground.balancedOutside})`);
      for (const [name, c] of Object.entries(s.channels)) {
        console.log(`    ${name.padEnd(19)} speed ${c.speed.negative}..${c.speed.positive} rad/s (w0 +${c.peaks.w0Positive}/-${c.peaks.w0Negative}); torque ${c.torque.negative}..${c.torque.positive} N m (peaks +${c.peaks.positive}/-${c.peaks.negative});`
          + ` reading ${c.reading.low}..${c.reading.high} (limits ${c.reading.min}..${c.reading.max})`);
        console.log(`    ${"".padEnd(19)} stance: use ${c.stance.use}, ${c.stance.over} of frames over, haste ${c.stance.haste};  swing: use ${c.swing.use}, ${c.swing.over} over, haste ${c.swing.haste}`);
      }
    }
    report.clips.push(entry);
  }
  if (options.json) writeFileSync(options.json, JSON.stringify(report, null, 2) + "\n");
}
