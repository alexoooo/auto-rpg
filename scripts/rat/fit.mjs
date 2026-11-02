// The rat's body fitted to Poly Haven's Street Rat: `node scripts/rat/fit.mjs [--write]`.
//
// The body is the art (`landmarks.mjs`) at the reptile's stature, 0.325 m. Every number the art
// does not give (masses, torques, joint ranges, the teeth) is the reptile's (`assets/reptile/body.json`): docs/reference/reptile.md#the-rat.
// Without --write it prints the body and its fit to the art; with it, writes assets/rat/body.json.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ART, at, HEAD_RAISE, mm, turnUp } from "./landmarks.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const reptile = JSON.parse(readFileSync(resolve(ROOT, "assets/reptile/body.json"), "utf8"));
const body = structuredClone(reptile);
const segment = (name) => body.segments.find((s) => s.name === name), joint = (name) => body.joints.find((j) => j.name === name);
const round = (v) => Array.isArray(v) ? v.map(round) : typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v;

// The trunk.
const trunk = segment("trunk");
trunk.proximal = round(at(ART.trunk.from)); trunk.distal = round(at(ART.trunk.to)); trunk.radius = round(mm(ART.trunk.radius));

// The head is the skull's capsule, behind the eyes to the snout; the jaw hinges under the ear and
// reaches the incisors. Its teeth and the mouth are the reptile's, scaled and tipped about the
// neck so that its neck lands on the rat's and its lower middle tooth's tip on the rat's incisors.
const neck = at(ART.neck), incisors = at(ART.incisors);
const fromNeck = joint("neck").centre, fromTip = segment("jaw").points.bite;
const length = (v) => Math.sqrt(v[1] * v[1] + v[2] * v[2]);
const was = [0, fromTip[1] - fromNeck[1], fromTip[2] - fromNeck[2]], now = [0, incisors[1] - neck[1], incisors[2] - neck[2]];
const k = length(now) / length(was), tip = Math.atan2(now[1], now[2]) - Math.atan2(was[1], was[2]);
/** The rotation about x that carries the reptile's neck-to-tooth line onto the rat's. */
const rotate = ([x, y, z]) => { const a = Math.atan2(y, z) + tip, r = Math.sqrt(y * y + z * z); return [x, r * Math.sin(a), r * Math.cos(a)]; };
const place = (p) => { const d = rotate([(p[0] - fromNeck[0]) * k, (p[1] - fromNeck[1]) * k, (p[2] - fromNeck[2]) * k]); return round([neck[0] + d[0], neck[1] + d[1], neck[2] + d[2]]); };
const head = segment("head"), jaw = segment("jaw");
head.proximal = round(at(ART.skull.from)); head.distal = round(at(ART.skull.to)); head.radius = round(mm(ART.skull.radius));
head.points = { mouth: place(head.points.mouth), "eye.left": round(at(ART.eye)), "eye.right": round(at([-ART.eye[0], ART.eye[1], ART.eye[2]])) };
const jawTip = place(jaw.distal);
jaw.proximal = round(at(ART.hinge)); jaw.distal = jawTip;
const span = Math.sqrt(jaw.distal.reduce((s, v, i) => s + (v - jaw.proximal[i]) ** 2, 0));
jaw.size = round([jaw.size[0] * k, span, jaw.size[2] * k]);
jaw.points = { bite: place(jaw.points.bite) };
for (const contact of jaw.contacts) { contact.points = contact.points.map(place); contact.direction = round(rotate(contact.direction)); }
joint("neck").centre = round(neck); joint("jaw").centre = jaw.proximal;
// The head and jaw carried raised (`HEAD_RAISE`); the skin's head is posed to them (build-assets.mjs).
const up = (p) => round(turnUp(p, neck, HEAD_RAISE)), upward = (v) => round(turnUp(v, [0, 0, 0], HEAD_RAISE));
for (const part of [head, jaw]) {
  part.proximal = up(part.proximal); part.distal = up(part.distal);
  part.points = Object.fromEntries(Object.entries(part.points).map(([key, p]) => [key, up(p)]));
}
for (const contact of jaw.contacts) { contact.points = contact.points.map(up); contact.direction = upward(contact.direction); }
joint("jaw").centre = jaw.proximal;
// The neck holds the head and jaw against gravity with the reptile's margin: its peak scales with
// their weight's lever about the neck at the reference pose, the rat's head reaching further ahead.
const lever = (b) => {
  const pivot = b.joints.find((j) => j.name === "neck").centre;
  return ["head", "jaw"].reduce((sum, name) => {
    const s = b.segments.find((x) => x.name === name);
    return sum + s.weight * Math.abs((s.proximal[2] + s.distal[2]) / 2 - pivot[2]);
  }, 0);
};
joint("neck").peak = round(reptile.joints.find((j) => j.name === "neck").peak * lever(body) / lever(reptile));

// The tail, in two.
const base = segment("tail.base"), end = segment("tail.tip");
base.proximal = round(at(ART.tail.root)); base.distal = round(at(ART.tail.bend)); base.radius = round(mm(ART.tail.rootRadius));
end.proximal = round(at(ART.tail.bend)); end.distal = round(at(ART.tail.tip)); end.radius = round(mm(ART.tail.tipRadius));
joint("tail.base").centre = base.proximal; joint("tail.tip").centre = end.proximal;

// The legs: hips under the trunk, elbows behind and knees ahead of the paws, bending about x.
for (const end of ["front", "hind"]) for (const side of ["left", "right"]) {
  const leg = ART[end], mirror = (p) => side === "left" ? p : [-p[0], p[1], p[2]];
  const girdle = at(mirror(leg.girdle)), bend = at(mirror(leg.bend)), ankle = at(mirror(leg.ankle)), sole = [ankle[0], 0, ankle[2]];
  const upper = segment(`upper.${end}.${side}`), lower = segment(`lower.${end}.${side}`), paw = segment(`paw.${end}.${side}`);
  upper.proximal = round(girdle); upper.distal = round(bend); upper.radius = round(mm(leg.upper));
  lower.proximal = round(bend); lower.distal = round(ankle); lower.radius = round(mm(leg.lower));
  // The paw box hangs from the ankle to the sole, its bottom 2.5 mm above the ground, and keeps the
  // reptile's footprint: the art's paws (about 0.04 by 0.08 m) tip the trot over in a turn.
  paw.proximal = round(ankle); paw.distal = round(sole);
  paw.size = round([paw.size[0], 2 * (ankle[1] / 2 - 0.0025), paw.size[2]]);
  paw.points = { sole: round([ankle[0], 0.0025, ankle[2]]) };
  const g = joint(`girdle.${end}.${side}`), b = joint(`bend.${end}.${side}`), a = joint(`ankle.${end}.${side}`);
  // The hips' second and third axes reach ±1.6 rad, the range its righting needs (docs/reference/reptile.md#the-rat).
  g.centre = upper.proximal; g.limits = [[-1.2, 1.2], [-1.6, 1.6], [-1.6, 1.6]];
  b.centre = lower.proximal; b.axes = [[1, 0, 0]]; b.limits = [[-1.2, 1.2]];
  a.centre = paw.proximal;
}

const angle = (u, v) => Math.acos((u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / Math.hypot(...u) / Math.hypot(...v));
const sub = (a, b) => a.map((x, i) => x - b[i]);
for (const end of ["front", "hind"]) {
  const u = segment(`upper.${end}.left`), l = segment(`lower.${end}.left`);
  console.log(`${end} bend at the reference pose: ${angle(sub(u.distal, u.proximal), sub(l.distal, l.proximal)).toFixed(2)} rad`);
}
console.log(`head and jaw: x${k.toFixed(3)}, tipped ${(tip * 180 / Math.PI).toFixed(1)} deg; trunk axis at ${trunk.proximal[1]} m, belly ${(trunk.proximal[1] - trunk.radius).toFixed(3)} m`);
if (process.argv.includes("--write")) writeFileSync(resolve(ROOT, "assets/rat/body.json"), JSON.stringify(body, null, 2) + "\n");
else console.log(JSON.stringify(body.segments.map((x) => [x.name, x.proximal, x.distal, x.radius ?? x.size])));
