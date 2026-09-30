// Fits `CLUB_GRIP` in `src/lab/club-grip.ts`: each model's hand closed on the club's haft
// where the core's grip puts it (`haft.mjs`), measured on its skin with `fist-probe.mjs`, one pose
// for both hands.
//
//   node scripts/lab/haft-fit.mjs [workshop-fighter|workshop-rogue]
//
// Fingers: each finger's knuckle (MCP) and middle joint (PIP) on a 5-degree grid, the end joint
// at 0.65 of the middle (the coupling `fist-fit.mjs` fits with). Each finger wraps the haft: it
// takes the pose whose three phalanges lie nearest it (the sum of each one's nearest gap), with
// no vertex of it deeper in the haft than 1 mm, nor in any part it shares no joint with than
// `fist-fit` allows (2 mm, or 0.5 mm past the relaxed hand); three rounds, so each finger is
// refitted around its neighbours. (The most closed pose, the fist's measure, hooks the fingers
// over the haft at a straight knuckle, the middle phalanx well off it.) Thumb: its three
// phalanges' directions in the palm's axes, by Nelder-Mead from the fist's thumb, for a pad on the
// haft or on the index or middle finger's middle phalanx (within 1 mm), nothing deeper in the haft
// than 1 mm nor in the hand than the fist allows, and joints inside the fist's 60 (MCP) and 80
// (IP) degrees; the best of three starts.
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { fistTurns } from "../../src/lab/fist.ts";
import { loadGlb, nelderMead, penetration, restBones, skinHand, summary } from "./fist-probe.mjs";
import { haftGaps, haftOf } from "./haft.mjs";
import fighterRig from "../../assets/humanoid/workshop-fighter.json" with { type: "json" };
import rogueRig from "../../assets/humanoid/workshop-rogue.json" with { type: "json" };

const model = process.argv[2] ?? "workshop-fighter";
const rig = { "workshop-fighter": fighterRig, "workshop-rogue": rogueRig }[model];
const glb = await loadGlb(model);
const hands = ["r", "l"].map((side) => {
  const relaxed = new Map(Object.entries(rig.grips.empty).filter(([k]) => k.endsWith(`_${side}`))
    .map(([k, q]) => [k, new Quaternion(q[1], q[2], q[3], q[0])]));
  const allowed = new Map(penetration(skinHand(glb, side, relaxed), 0.02).map(([pair, d]) => [pair, Math.max(2, d + 0.5)]));
  return { side, bones: restBones(glb, side), allowed, haft: haftOf(glb, model, side) };
});
const posed = (hand, pose) => skinHand(glb, hand.side, fistTurns(hand.bones, hand.side, pose));
/** How deep `digit`'s deepest part sits in the haft, mm, 0 if clear. */
const inHaft = (verts, hand, digit) =>
  Math.max(0, ...[...haftGaps(verts, hand.haft)].filter(([part]) => part.startsWith(`${digit}_`)).map(([, g]) => -g));

// The thumb while the fingers are fitted: the fist's.
let thumb = [
  { forward: 0.439, palmar: 0.714, radial: 0.546 },
  { forward: 0.522, palmar: 0.691, radial: -0.501 },
  { forward: 0.688, palmar: 0.007, radial: -0.726 },
];
const fingers = Object.fromEntries(["index", "middle", "ring", "pinky"].map((f) => [f, { mcp: 0, pip: 0, dip: 0 }]));
const angles = (mcp, pip) => ({ mcp, pip, dip: +(0.65 * pip).toFixed(1) });

/** How far `finger`'s phalanges lie from the haft in `pose`, mm summed over both hands; null if it sinks in. */
const wrap = (finger, pose) => {
  let sum = 0;
  for (const hand of hands) {
    const gaps = haftGaps(posed(hand, pose), hand.haft);
    for (const k of [1, 2, 3]) {
      const g = gaps.get(`${finger}_0${k}_${hand.side}`);
      if (g < -1) return null;
      sum += Math.max(0, g);
    }
  }
  return sum;
};
/** Whether `finger` sits in the rest of the hand no deeper than it may, on both hands. */
const clear = (finger, pose) => hands.every((hand) =>
  penetration(posed(hand, pose), 0.02, (part) => part.startsWith(`${finger}_`)).filter(([pair]) => !/thumb/.test(pair))
    .every(([pair, d]) => d <= (hand.allowed.get(pair) ?? 2)));

const grid = [];
for (let mcp = 0; mcp <= 90; mcp += 5) for (let pip = 0; pip <= 110; pip += 5) grid.push([mcp, pip]);
for (let round = 0; round < 3; round++) {
  for (const finger of ["middle", "index", "ring", "pinky"]) {
    const poseOf = ([mcp, pip]) => ({ fingers: { ...fingers, [finger]: angles(mcp, pip) }, thumb });
    // The poses clear of the haft, nearest it first; the first clear of the hand wins.
    const ranked = grid.map((at) => ({ at, gap: wrap(finger, poseOf(at)) })).filter((c) => c.gap !== null).sort((a, b) => a.gap - b.gap);
    const found = ranked.find((c) => clear(finger, poseOf(c.at)));
    if (!found) throw new Error(`${finger} fits nowhere`);
    fingers[finger] = angles(...found.at);
  }
  console.error(`round ${round}:`, JSON.stringify(Object.fromEntries(Object.entries(fingers).map(([f, a]) => [f, [a.mcp, a.pip]]))));
}

const unit = (a) => { const l = Math.hypot(...a); return { forward: a[0] / l, palmar: a[1] / l, radial: a[2] / l }; };
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.forward * b.forward + a.palmar * b.palmar + a.radial * b.radial))) * 180 / Math.PI;
const gap = (as, bs) => {
  let g = Infinity;
  for (const a of as) for (const b of bs) g = Math.min(g, (a.p[0] - b.p[0]) ** 2 + (a.p[1] - b.p[1]) ** 2 + (a.p[2] - b.p[2]) ** 2);
  return Math.sqrt(g) * 1000;
};
/** The thumb's pad's distance from what it may rest on: the haft, or the index or middle finger's middle phalanx, mm. */
const padGap = (verts, hand) => {
  const of = (p) => verts.filter((v) => v.part === `${p}_${hand.side}`);
  const onHaft = Math.max(0, haftGaps(of("thumb_03"), hand.haft).get(`thumb_03_${hand.side}`));
  return Math.min(onHaft, gap(of("thumb_03"), [...of("middle_02"), ...of("index_02")]));
};
function thumbCost(x) {
  const aim = [unit(x.slice(0, 3)), unit(x.slice(3, 6)), unit(x.slice(6, 9))];
  const range = Math.max(0, angle(aim[0], aim[1]) - 60) ** 2 + Math.max(0, angle(aim[1], aim[2]) - 80) ** 2;
  return hands.reduce((sum, hand) => {
    const verts = posed(hand, { fingers, thumb: aim });
    const sunk = penetration(verts, 0.02, (part) => part.startsWith("thumb_"))
      .reduce((s, [pair, d]) => s + Math.max(0, d - Math.max(1.5, hand.allowed.get(pair) ?? 0)) ** 2, 0);
    const haft = Math.max(0, inHaft(verts, hand, "thumb") - 1) ** 2;
    return sum + 100 * (sunk + haft) + Math.max(0, padGap(verts, hand) - 1) ** 2 + range;
  }, 0);
}
// Starts: the fist's thumb, that thumb less across the palm, and one lying along the haft.
const starts = [
  [0.439, 0.714, 0.546, 0.522, 0.691, -0.501, 0.688, 0.007, -0.726],
  [0.5, 0.6, 0.6, 0.6, 0.6, -0.3, 0.8, 0.1, -0.5],
  [0.4, 0.7, 0.6, 0.4, 0.8, -0.4, 0.5, 0.5, -0.7],
];
let best = null;
for (const start of starts) {
  let fit = { x: start };
  for (const step of [0.2, 0.1, 0.05]) fit = nelderMead(thumbCost, fit.x, step, 200);
  console.error("thumb start", JSON.stringify(start), "cost", fit.f.toFixed(2));
  if (!best || fit.f < best.f) best = fit;
}
const round3 = (d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, +v.toFixed(3)]));
thumb = [0, 3, 6].map((k) => round3(unit(best.x.slice(k, k + 3))));

const pose = { fingers, thumb };
for (const hand of hands) {
  const verts = posed(hand, pose);
  const gaps = Object.fromEntries([...haftGaps(verts, hand.haft)].filter(([p]) => !/^hand/.test(p)).map(([p, g]) => [p.slice(0, -2), +g.toFixed(1)]));
  console.error(`hand ${hand.side}: worst depth by kind, mm`, JSON.stringify(summary(penetration(verts, 0.02))),
    `\n  nearest to the haft, mm (negative inside)`, JSON.stringify(gaps),
    `\n  thumb pad gap ${padGap(verts, hand).toFixed(1)} mm, thumb MCP ${angle(thumb[0], thumb[1]).toFixed(0)} IP ${angle(thumb[1], thumb[2]).toFixed(0)} deg`);
}
console.log(JSON.stringify(pose));
