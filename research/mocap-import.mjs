/**
 * **A walk's reference from motion capture**: a BVH clip (the CMU Graphics Lab database's, as
 * cgspeed's conversion writes it: `Hips`, `LeftUpLeg`, `LeftLeg`, `LeftFoot`, `LeftToeBase` and the
 * right side's, 120 frames a second) read into what a SIMBICON walk asks of the legs, step by step:
 * from one foot's landing to the other's, at each of `PHASES` even shares of the step,
 *
 * - the swinging thigh's lean from straight down, forward and out to its own side of the way the
 *   pelvis faces, in the world (`swingHip`, `swingSpread`'s frame);
 * - each knee's flexion and each ankle's dorsiflexion (the foot's angle to the shank, less that
 *   angle with the shank upright and the sole flat: the foot then falls from the ankle to the toe by
 *   the height between where the two rest on the floor);
 * - the pelvis's lean forward of upright (its spine's, less the zero pose's);
 *
 * and the step's time, length forward and to the side of the pelvis's facing, and the walk's speed,
 * each also over the leg's length (hip to ankle), and the speed as a Froude number v / sqrt(g leg).
 *
 * The clip's own joint angles are not read: its rest pose sets the legs at angles of their own, so
 * every quantity is read off the joints' places by forward kinematics.
 *
 * A step whose pelvis turns by more than `TURNED` is dropped, and each step is put in a group by the
 * way it goes against the pelvis's facing: forward, back, or to a side, where a side's step is the
 * leading leg's (it swings toward the way the walk goes) or the closing one's; a step to the left is
 * read as one to the right with the legs' roles swapped.
 *
 *   node research/mocap-import.mjs <clip.bvh> [--unit 0.05644] [--rate 120] [--out reference.json]
 *
 * `--unit` is metres a BVH unit: CMU's skeletons are in 1/0.45 inch. `--rate` is the clip's frames a
 * second where its file's frame time is not: CMU's index names subjects captured at 60 that cgspeed's
 * conversion writes at 120.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseArgs } from "node:util";

/** The shares of a step each quantity is read at. */
const PHASES = 16;
/**
 * A sole is on the ground while its ankle or its toe is within `height` of where that point rests on the
 * ground (the `rest` share of the clip lowest it comes: a marker set sits each its own height over the
 * floor) and slower than `speed`, m and m/s.
 */
const CONTACT = { height: 0.03, speed: 0.4, rest: 0.05 };
const G = 9.81;
/** The most the pelvis may turn over a step kept, rad. */
const TURNED = 0.25;

/** The joints and their channels, in the file's order, and each frame's values. */
function parseBvh(text) {
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
const apply = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const size = (a) => Math.sqrt(dot(a, a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const n = size(a); return [a[0] / n, a[1] / n, a[2] / n]; };

/** Each frame's joint places and turns, world, in the file's units, y up; with `zero`, one frame with every joint unturned. */
function forward(clip, zero = false) {
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

const { values: options, positionals } = parseArgs({ allowPositionals: true, options: { unit: { type: "string" }, rate: { type: "string" }, out: { type: "string" } } });
const file = positionals[0];
if (!file) throw new Error("usage: node research/mocap-import.mjs <clip.bvh> [--unit m] [--rate hz] [--out file]");
const scale = Number(options.unit ?? 0.05644);
const clip = parseBvh(readFileSync(file, "utf8"));
const { places, turns } = forward(clip);
const zero = forward(clip, true).places[0];
const index = (name) => { const i = clip.joints.findIndex((j) => j.name === name); if (i < 0) throw new Error(`no joint ${name}`); return i; };
const J = {
  hips: index("Hips"),
  left: { hip: index("LeftUpLeg"), knee: index("LeftLeg"), ankle: index("LeftFoot"), toe: index("LeftToeBase") },
  right: { hip: index("RightUpLeg"), knee: index("RightLeg"), ankle: index("RightFoot"), toe: index("RightToeBase") },
};
const at = (f, j) => places[f][j].map((x) => x * scale);
const dt = options.rate ? 1 / Number(options.rate) : clip.frameTime, frames = clip.frames;

// The spine's lean forward standing, the zero pose's (which faces +z).
const restLean = (() => { const spine = unit(sub(zero[index("Spine1")], zero[J.hips])); return Math.atan2(spine[2], spine[1]); })();

// Where each ankle and toe rests on the ground: the `rest` share of the clip lowest it comes.
const floorOf = new Map();
for (const side of ["left", "right"]) for (const j of [J[side].ankle, J[side].toe]) {
  const ys = Array.from({ length: frames }, (_, f) => at(f, j)[1]).sort((a, b) => a - b);
  floorOf.set(j, ys[Math.floor(CONTACT.rest * (frames - 1))]);
}
const floor = Math.min(...floorOf.values());
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
// Landings: a sole's first frame on the ground after at least 0.1 s off it.
const landings = [];
for (const side of ["left", "right"]) {
  let off = 0;
  for (let f = 1; f < frames; f++) {
    if (!contact[side][f]) { off += dt; continue; }
    if (off >= 0.1) landings.push({ side, frame: f });
    off = 0;
  }
}
landings.sort((a, b) => a.frame - b.frame);

// Each step: from a landing to the next landing of the other foot; the landing foot bears it.
const steps = [];
for (let k = 0; k + 1 < landings.length; k++) {
  const a = landings[k], b = landings[k + 1];
  if (a.side === b.side) continue;
  const stance = a.side, swing = b.side, out = swing === "left" ? -1 : 1;
  const n = b.frame - a.frame;
  const fwd = facing(a.frame), right = rightOf(a.frame);
  const centre = (f) => at(f, J.hips);
  const move = sub(centre(b.frame), centre(a.frame));
  const sample = [];
  for (let p = 0; p < PHASES; p++) {
    const f = a.frame + Math.round(p * n / PHASES);
    const face = facing(f), side = rightOf(f);
    const read = (leg) => {
      const hip = at(f, J[leg].hip), knee = at(f, J[leg].knee), ankle = at(f, J[leg].ankle), toe = at(f, J[leg].toe);
      const thigh = unit(sub(knee, hip)), shank = unit(sub(ankle, knee)), foot = unit(sub(toe, ankle));
      const legOut = leg === "left" ? -1 : 1;
      return {
        lean: Math.atan2(dot(thigh, face), -thigh[1]),
        spread: Math.atan2(dot(thigh, side) * legOut, -thigh[1]),
        knee: Math.acos(Math.max(-1, Math.min(1, dot(thigh, shank)))),
        foot: Math.acos(Math.max(-1, Math.min(1, dot(shank, foot)))),
      };
    };
    const st = read(stance), sw = read(swing);
    const spine = unit(sub(at(f, index("Spine1")), at(f, J.hips)));
    sample.push({ stance: st, swing: sw, pelvis: Math.atan2(dot(spine, face), spine[1]) - restLean });
  }
  const leg = (size(sub(at(a.frame, J[stance].hip), at(a.frame, J[stance].knee))) + size(sub(at(a.frame, J[stance].knee), at(a.frame, J[stance].ankle))));
  steps.push({
    stance, frame: a.frame, time: n * dt,
    ahead: dot(move, fwd), aside: dot(move, right) * out, speed: Math.sqrt(move[0] * move[0] + move[2] * move[2]) / (n * dt),
    along: dot(move, fwd) / (n * dt), across: dot(move, right) / (n * dt), leg, sample,
    turned: Math.acos(Math.max(-1, Math.min(1, dot(fwd, facing(b.frame))))),
  });
}
for (const s of steps) for (const q of s.sample) for (const [side, l] of [[s.stance, q.stance], [s.stance === "left" ? "right" : "left", q.swing]]) { l.ankle = l.foot - rest[side]; delete l.foot; }

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
/** A step's way: forward, back, or to a side by its leading leg's step or its closing one. */
const wayOf = (step) => Math.abs(step.across) > Math.abs(step.along)
  ? ((step.across > 0) === (step.stance === "left") ? "side-lead" : "side-close")
  : step.along > 0 ? "forward" : "back";
const kept = steps.filter((step) => step.turned <= TURNED);
const groups = {};
for (const step of kept) (groups[wayOf(step)] ??= []).push(step);
const leg = mean(steps.map((step) => step.leg));
const deg = (x) => (x * 180 / Math.PI).toFixed(0).padStart(4);
const QUANTITIES = [["swing lean", (q) => q.swing.lean], ["swing spread", (q) => q.swing.spread], ["swing knee", (q) => q.swing.knee], ["swing ankle", (q) => q.swing.ankle],
  ["stance knee", (q) => q.stance.knee], ["stance ankle", (q) => q.stance.ankle], ["pelvis lean", (q) => q.pelvis]];
const out = { clip: basename(file), frames, rate: 1 / dt, unit: scale, leg, steps: steps.length, kept: kept.length, ways: {} };
console.log(JSON.stringify({ clip: out.clip, rate: out.rate, leg, steps: steps.length, kept: kept.length }));
for (const [way, group] of Object.entries(groups)) {
  const speed = mean(group.map((step) => Math.sqrt(step.along * step.along + step.across * step.across)));
  const curves = Object.fromEntries(QUANTITIES.map(([name, pick]) => [name, Array.from({ length: PHASES }, (_, p) => mean(group.map((step) => pick(step.sample[p]))))]));
  out.ways[way] = { steps: group.length, time: mean(group.map((step) => step.time)), along: mean(group.map((step) => step.along)), across: mean(group.map((step) => Math.abs(step.across))), froude: speed / Math.sqrt(G * leg), curves };
  const w = out.ways[way];
  console.log(`${way}: ${group.length} steps, ${w.time.toFixed(3)} s, along ${w.along.toFixed(2)} across ${w.across.toFixed(2)} m/s, Froude ${w.froude.toFixed(2)}`);
  for (const [name] of QUANTITIES) console.log("  " + name.padEnd(14), curves[name].map(deg).join(""));
}
if (options.out) writeFileSync(options.out, JSON.stringify(out));
