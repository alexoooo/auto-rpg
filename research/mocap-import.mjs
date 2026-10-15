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
import { dot, readClip, size, sub, unit } from "./bvh.mjs";

/** The shares of a step each quantity is read at. */
const PHASES = 16;
const G = 9.81;
/** The most the pelvis may turn over a step kept, rad. */
const TURNED = 0.25;

const { values: options, positionals } = parseArgs({ allowPositionals: true, options: { unit: { type: "string" }, rate: { type: "string" }, out: { type: "string" } } });
const file = positionals[0];
if (!file) throw new Error("usage: node research/mocap-import.mjs <clip.bvh> [--unit m] [--rate hz] [--out file]");
const scale = Number(options.unit ?? 0.05644);
const { frames, dt, zero, index, J, at, rest, rightOf, facing, contact } = readClip(readFileSync(file, "utf8"), { unit: scale, rate: options.rate ? Number(options.rate) : undefined });

// The spine's lean forward standing, the zero pose's (which faces +z).
const restLean = (() => { const spine = unit(sub(zero[index("Spine1")], zero[J.hips])); return Math.atan2(spine[2], spine[1]); })();

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
