// Fits `FIST` in `src/render/skin.ts`: each model's fist, measured on its skin with
// `fist-probe.mjs`, one pose for both hands.
//
//   node scripts/lab/fist-fit.mjs [workshop-fighter|workshop-rogue]
//
// Fingers: every knuckle (MCP) at one angle, as the first phalanges of a fist make one flat face,
// on a 5-degree grid. At each, every finger's middle joint (PIP) as far closed as it goes, with the
// end joint at 0.65 of it (the coupling `scripts/character-lab/realistic/grip_fit.py` fits with),
// sinking the finger no deeper into any part it shares no joint with than 2 mm, or than the
// relaxed hand already does if that is deeper (0.5 mm over it); three rounds, so each finger is
// refitted around its neighbours. The most closed fist wins. Thumb: its three phalanges' directions in the palm's axes, by
// Nelder-Mead from a thumb across the fingers, for a pad on the index or middle finger's middle
// phalanx (within 1 mm), nothing sunk deeper than 1.5 mm or than the relaxed hand already is,
// and joints inside 60 (MCP) and 80 (IP) degrees; the best of three starts.
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { fistTurns } from "../../src/lab/fist.ts";
import { loadGlb, nelderMead, penetration, restBones, skinHand, summary } from "./fist-probe.mjs";
import fighterRig from "../../assets/humanoid/workshop-fighter.json" with { type: "json" };
import rogueRig from "../../assets/humanoid/workshop-rogue.json" with { type: "json" };

const model = process.argv[2] ?? "workshop-fighter";
const rig = { "workshop-fighter": fighterRig, "workshop-rogue": rogueRig }[model];
const glb = await loadGlb(model);
const hands = ["r", "l"].map((side) => {
  const relaxed = new Map(Object.entries(rig.grips.empty).filter(([k]) => k.endsWith(`_${side}`))
    .map(([k, q]) => [k, new Quaternion(q[1], q[2], q[3], q[0])]));
  const allowed = new Map(penetration(skinHand(glb, side, relaxed), 0.02).map(([pair, d]) => [pair, Math.max(2, d + 0.5)]));
  return { side, bones: restBones(glb, side), allowed };
});
const posed = (hand, pose) => skinHand(glb, hand.side, fistTurns(hand.bones, hand.side, pose));

// The thumb while the fingers are fitted: across the fingers.
let thumb = [
  { forward: 0.45, palmar: 0.781, radial: 0.433 },
  { forward: 0.428, palmar: 0.636, radial: -0.641 },
  { forward: 0.64, palmar: 0.093, radial: -0.763 },
];
const fingers = Object.fromEntries(["index", "middle", "ring", "pinky"].map((f) => [f, { mcp: 0, pip: 0, dip: 0 }]));

/** How far `finger` sits past its allowance, on the worse hand, in anything but the thumb. */
const excess = (finger, pose) => Math.max(0, ...hands.map((hand) =>
  Math.max(...penetration(posed(hand, pose), 0.02).filter(([pair]) => pair.includes(finger) && !/thumb/.test(pair))
    .map(([pair, d]) => d - (hand.allowed.get(pair) ?? 2)))));

/** With every knuckle at `mcp`: each finger's most closed PIP within its allowance, three rounds; null if one has none. */
function closeAt(mcp) {
  const pips = Object.fromEntries(Object.keys(fingers).map((f) => [f, 0]));
  const pose = () => ({ fingers: Object.fromEntries(Object.entries(pips).map(([f, pip]) => [f, { mcp, pip, dip: +(0.65 * pip).toFixed(1) }])), thumb });
  for (let round = 0; round < 3; round++) {
    for (const finger of ["middle", "index", "ring", "pinky"]) {
      let best = null;
      for (let pip = 40; pip <= 110; pip += 5) {
        pips[finger] = pip;
        if (excess(finger, pose()) <= 0) best = pip;
      }
      if (best === null) return null;
      pips[finger] = best;
    }
  }
  return pose().fingers;
}
let fit = null;
for (let mcp = 60; mcp <= 90; mcp += 5) {
  const closed = closeAt(mcp);
  const total = closed && Object.values(closed).reduce((s, a) => s + a.mcp + 1.65 * a.pip, 0);
  console.error(`knuckles at ${mcp}:`, JSON.stringify(closed && Object.fromEntries(Object.entries(closed).map(([f, a]) => [f, a.pip]))));
  if (closed && (!fit || total >= fit.total)) fit = { closed, total };
}
Object.assign(fingers, fit.closed);

const unit = (a) => { const l = Math.hypot(...a); return { forward: a[0] / l, palmar: a[1] / l, radial: a[2] / l }; };
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.forward * b.forward + a.palmar * b.palmar + a.radial * b.radial))) * 180 / Math.PI;
const gap = (as, bs) => {
  let g = Infinity;
  for (const a of as) for (const b of bs) g = Math.min(g, (a.p[0] - b.p[0]) ** 2 + (a.p[1] - b.p[1]) ** 2 + (a.p[2] - b.p[2]) ** 2);
  return Math.sqrt(g) * 1000;
};
function thumbCost(x) {
  const aim = [unit(x.slice(0, 3)), unit(x.slice(3, 6)), unit(x.slice(6, 9))];
  const range = Math.max(0, angle(aim[0], aim[1]) - 60) ** 2 + Math.max(0, angle(aim[1], aim[2]) - 80) ** 2;
  return hands.reduce((sum, hand) => {
    const verts = posed(hand, { fingers, thumb: aim }), of = (p) => verts.filter((v) => v.part === `${p}_${hand.side}`);
    const sunk = penetration(verts, 0.02).filter(([pair]) => pair.includes("thumb"))
      .reduce((s, [pair, d]) => s + Math.max(0, d - Math.max(1.5, hand.allowed.get(pair) ?? 0)) ** 2, 0);
    const reach = Math.max(0, gap(of("thumb_03"), [...of("middle_02"), ...of("index_02")]) - 1);
    return sum + 100 * sunk + reach ** 2 + range;
  }, 0);
}
// Starts: that thumb, and that thumb turned further across and back toward the palm.
const starts = [
  [0.45, 0.781, 0.433, 0.428, 0.636, -0.641, 0.64, 0.093, -0.763],
  [0.45, 0.781, 0.433, 0.3, 0.8, -0.5, 0.3, 0.3, -0.9],
  [0.35, 0.85, 0.4, 0.4, 0.75, -0.55, 0.5, 0.35, -0.8],
];
let best = null;
for (const start of starts) {
  let fit = { x: start };
  for (const step of [0.2, 0.1, 0.05]) fit = nelderMead(thumbCost, fit.x, step, 200);
  console.error("thumb start", JSON.stringify(start), "cost", fit.f.toFixed(2));
  if (!best || fit.f < best.f) best = fit;
}
thumb = [0, 3, 6].map((k) => unit(best.x.slice(k, k + 3)));
const round3 = (d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, +v.toFixed(3)]));
thumb = thumb.map(round3);

const pose = { fingers, thumb };
for (const hand of hands) {
  const verts = posed(hand, pose), of = (p) => verts.filter((v) => v.part === `${p}_${hand.side}`);
  console.error(`hand ${hand.side}: worst depth by kind, mm`, JSON.stringify(summary(penetration(verts, 0.02))),
    `thumb pad gap ${gap(of("thumb_03"), [...of("middle_02"), ...of("index_02")]).toFixed(1)} mm`,
    `thumb MCP ${angle(thumb[0], thumb[1]).toFixed(0)} IP ${angle(thumb[1], thumb[2]).toFixed(0)} deg`);
}
console.log(JSON.stringify(pose));
