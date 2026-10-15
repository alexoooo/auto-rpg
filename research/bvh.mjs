/**
 * **A BVH clip, read**: the CMU Graphics Lab database's, as cgspeed's conversion writes it (`Hips`,
 * `LeftUpLeg`, `LeftLeg`, `LeftFoot`, `LeftToeBase` and the right side's), its joints placed by
 * forward kinematics each frame, in metres, y up, and each sole's contact with the floor. The clip's
 * own joint angles are not read: its rest pose sets the legs at angles of their own.
 * `research/mocap-import.mjs` and `research/run-feasibility.mjs` read clips through it.
 */

/**
 * A sole is on the ground while its ankle or its toe is within `height` of where that point rests on the
 * ground (the `rest` share of the clip lowest it comes: a marker set sits each its own height over the
 * floor) and slower than `speed`, m and m/s.
 */
const CONTACT = { height: 0.03, speed: 0.4, rest: 0.05 };

/** The joints and their channels, in the file's order, and each frame's values. */
export function parseBvh(text) {
  const tokens = text.split(/\s+/).filter(Boolean);
  let at = 0;
  const next = () => tokens[at++];
  const joints = [];
  const read = (parent) => {
    const kind = next();
    if (kind === "End") {
      next(); next(); next();
      const offset = [Number(next()), Number(next()), Number(next())];
      next();
      joints[parent].end = offset;
      return;
    }
    const name = next(); next();
    next();
    const offset = [Number(next()), Number(next()), Number(next())];
    next();
    const count = Number(next()), channels = [];
    for (let k = 0; k < count; k++) channels.push(next());
    const index = joints.length;
    joints.push({ name, parent, offset, channels, end: null });
    while (tokens[at] !== "}") read(index);
    next();
  };
  if (next() !== "HIERARCHY") throw new Error("not a BVH file");
  read(-1);
  if (next() !== "MOTION") throw new Error("no MOTION section");
  next(); const frames = Number(next());
  next(); next(); const frameTime = Number(next());
  const width = joints.reduce((s, j) => s + j.channels.length, 0);
  const values = new Float64Array(frames * width);
  for (let k = 0; k < values.length; k++) values[k] = Number(next());
  return { joints, frames, frameTime, width, values };
}

/** A 3x3 rotation, rows end to end. */
const identity = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];
function mul(a, b) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}
function axisTurn(axis, degrees) {
  const t = degrees * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  switch (axis) {
    case "X": return [1, 0, 0, 0, c, -s, 0, s, c];
    case "Y": return [c, 0, s, 0, 1, 0, -s, 0, c];
    case "Z": return [c, -s, 0, s, c, 0, 0, 0, 1];
    default: throw new Error(`no axis ${axis}`);
  }
}
export const apply = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const size = (a) => Math.sqrt(dot(a, a));
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit = (a) => { const n = size(a); return [a[0] / n, a[1] / n, a[2] / n]; };

/** Each frame's joint places and turns, world, in the file's units, y up; with `zero`, one frame with every joint unturned. */
export function forward(clip, zero = false) {
  const { joints, width } = clip;
  const frames = zero ? 1 : clip.frames, values = zero ? new Float64Array(width) : clip.values;
  const places = [], turns = [];
  for (let f = 0; f < frames; f++) {
    const p = [], t = [];
    let k = f * width;
    for (const joint of joints) {
      let local = identity(), shift = [0, 0, 0];
      for (const channel of joint.channels) {
        const v = values[k++];
        if (channel.endsWith("position")) shift["XYZ".indexOf(channel[0])] = v;
        else local = mul(local, axisTurn(channel[0], v));
      }
      if (joint.parent < 0) { p.push([joint.offset[0] + shift[0], joint.offset[1] + shift[1], joint.offset[2] + shift[2]]); t.push(local); }
      else {
        const pt = t[joint.parent], pp = p[joint.parent], o = apply(pt, joint.offset);
        p.push([pp[0] + o[0], pp[1] + o[1], pp[2] + o[2]]);
        t.push(mul(pt, local));
      }
    }
    places.push(p); turns.push(t);
  }
  return { places, turns };
}

/**
 * `text`, a BVH file, read: `unit` metres a BVH unit (CMU's skeletons are in 1/0.45 inch), `rate`
 * the clip's frames a second where its file's frame time is not (CMU's index names subjects captured
 * at 60 that cgspeed's conversion writes at 120). `at(f, j)` is joint `j`'s place at frame `f`, m;
 * `contact[side][f]` whether that sole is on the ground; `rest[side]` the ankle's angle of the foot
 * to the shank standing.
 */
export function readClip(text, { unit: scale = 0.05644, rate } = {}) {
  const clip = parseBvh(text);
  const { places } = forward(clip);
  const zero = forward(clip, true).places[0];
  const index = (name) => { const i = clip.joints.findIndex((j) => j.name === name); if (i < 0) throw new Error(`no joint ${name}`); return i; };
  const J = {
    hips: index("Hips"),
    left: { hip: index("LeftUpLeg"), knee: index("LeftLeg"), ankle: index("LeftFoot"), toe: index("LeftToeBase") },
    right: { hip: index("RightUpLeg"), knee: index("RightLeg"), ankle: index("RightFoot"), toe: index("RightToeBase") },
  };
  const at = (f, j) => places[f][j].map((x) => x * scale);
  const dt = rate ? 1 / rate : clip.frameTime, frames = clip.frames;

  // Where each ankle and toe rests on the ground: the `rest` share of the clip lowest it comes.
  const floorOf = new Map();
  for (const side of ["left", "right"]) for (const j of [J[side].ankle, J[side].toe]) {
    const ys = Array.from({ length: frames }, (_, f) => at(f, j)[1]).sort((a, b) => a - b);
    floorOf.set(j, ys[Math.floor(CONTACT.rest * (frames - 1))]);
  }
  // Each ankle's angle of the foot to the shank standing: the shank upright, the foot falling to the toe by the rest heights' difference.
  const rest = Object.fromEntries(["left", "right"].map((side) => {
    const length = size(sub(zero[J[side].toe], zero[J[side].ankle])) * scale, fall = floorOf.get(J[side].ankle) - floorOf.get(J[side].toe);
    return [side, Math.acos(fall / length)];
  }));

  // The pelvis's right each frame (its left hip to its right, flat), and its facing, up crossed with its right.
  const rightOf = (f) => { const r = sub(at(f, J.right.hip), at(f, J.left.hip)); return unit([r[0], 0, r[2]]); };
  const facing = (f) => unit(cross([0, 1, 0], rightOf(f)));

  // Contact: a sole (its ankle or its toe) near the floor and slow.
  const contact = { left: [], right: [] };
  for (const side of ["left", "right"]) for (let f = 0; f < frames; f++) {
    const low = (j) => at(f, j)[1] - floorOf.get(j);
    const speed = (j) => f === 0 ? 0 : size(sub(at(f, j), at(f - 1, j))) / dt;
    const down = (j) => low(j) < CONTACT.height && speed(j) < CONTACT.speed;
    contact[side].push(down(J[side].ankle) || down(J[side].toe));
  }
  return { clip, frames, dt, zero, index, J, at, floorOf, rest, rightOf, facing, contact };
}
