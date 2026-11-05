// The reptile's body fitted to the posed grass lizard: `node scripts/reptile/fit.mjs [--write]`.
//
// Its trunk, head, jaw, legs and tail where the posed art's are (`pose.mjs`). Every number the art
// does not give (masses, torques, joint ranges, the teeth) is the authored quadruped's
// (`assets/quadruped/authored-body.json`), but for a light tail: docs/reference/reptile.md#the-grass-lizard.
// Without --write it prints the body; with it, writes assets/reptile/body.json.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fit, HEAD_RAISE } from "./pose.mjs";
import { SIDES } from "../../src/core/bodies/bilateral.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const authored = JSON.parse(readFileSync(resolve(ROOT, "assets/quadruped/authored-body.json"), "utf8"));
const body = structuredClone(authored);
const segment = (name) => body.segments.find((s) => s.name === name), joint = (name) => body.joints.find((j) => j.name === name);
const round = (v) => Array.isArray(v) ? v.map(round) : typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v;
/** The centreline's height at z, m. */
function heightAt(z) {
  const c = fit.centre;
  for (let i = 0; i < c.length - 1; i++) {
    const a = c[i].p, b = c[i + 1].p;
    if ((a[2] - z) * (b[2] - z) <= 0) return a[1] + (b[1] - a[1]) * ((z - a[2]) / (b[2] - a[2] || 1));
  }
  return c.at(-1).p[1];
}
const on = (z) => [0, heightAt(z), z];

// The trunk: from the vent to the shoulders, inside the body's ends, its radius the body's half height.
const trunk = segment("trunk"), R = fit.trunkRadius;
trunk.proximal = round(on(fit.vent[2] + R)); trunk.distal = round(on(fit.neck[2] - R * 0.6)); trunk.radius = round(R);

// The head is a capsule behind the eyes to the snout; the jaw hinges where the mouth's line ends and
// reaches the lower jaw's tip. Its teeth and the mouth are the authored quadruped's, scaled and
// tipped about the neck so that its neck lands on the lizard's and its lower middle tooth's tip on
// the lower jaw's.
const neck = fit.neck, HEAD_RADIUS = 0.035;
const fromNeck = joint("neck").centre, fromTip = segment("jaw").points.bite;
const length = (v) => Math.sqrt(v[1] * v[1] + v[2] * v[2]);
const was = [0, fromTip[1] - fromNeck[1], fromTip[2] - fromNeck[2]], now = [0, fit.lowerTip[1] - neck[1], fit.lowerTip[2] - neck[2]];
const k = length(now) / length(was), tip = Math.atan2(now[1], now[2]) - Math.atan2(was[1], was[2]);
/** The rotation about x that carries the authored neck-to-tooth line onto the lizard's. */
const rotate = ([x, y, z]) => { const a = Math.atan2(y, z) + tip, r = Math.sqrt(y * y + z * z); return [x, r * Math.sin(a), r * Math.cos(a)]; };
const place = (p) => { const d = rotate([(p[0] - fromNeck[0]) * k, (p[1] - fromNeck[1]) * k, (p[2] - fromNeck[2]) * k]); return round([neck[0] + d[0], neck[1] + d[1], neck[2] + d[2]]); };
const head = segment("head"), jaw = segment("jaw");
head.proximal = round(on(neck[2] + 0.03)); head.distal = round([0, fit.snout[1] + 0.01, fit.snout[2] - HEAD_RADIUS]); head.radius = HEAD_RADIUS;
head.points = { mouth: place(head.points.mouth), "eye.left": round(fit.eye), "eye.right": round([-fit.eye[0], fit.eye[1], fit.eye[2]]) };
jaw.proximal = round(fit.hinge); jaw.distal = place(jaw.distal);
const span = Math.sqrt(jaw.distal.reduce((s, v, i) => s + (v - jaw.proximal[i]) ** 2, 0));
jaw.size = round([jaw.size[0] * k, span, jaw.size[2] * k]);
jaw.points = { bite: place(jaw.points.bite) };
for (const contact of jaw.contacts) { contact.points = contact.points.map(place); contact.direction = round(rotate(contact.direction)); }
joint("neck").centre = round(neck);
// The head and jaw carried raised (`HEAD_RAISE`); the skin's head is posed to them (build-assets.mjs).
const turnUp = ([x, y, z], [, py, pz], a) => { const dy = y - py, dz = z - pz, c = Math.cos(a), s = Math.sin(a); return [x, py + dy * c + dz * s, pz + dz * c - dy * s]; };
const up = (p) => round(turnUp(p, neck, HEAD_RAISE)), upward = (v) => round(turnUp(v, [0, 0, 0], HEAD_RAISE));
for (const part of [head, jaw]) {
  part.proximal = up(part.proximal); part.distal = up(part.distal);
  part.points = Object.fromEntries(Object.entries(part.points).map(([key, p]) => [key, up(p)]));
}
for (const contact of jaw.contacts) { contact.points = contact.points.map(up); contact.direction = upward(contact.direction); }
joint("jaw").centre = jaw.proximal;
// The neck holds the head and jaw against gravity with the authored margin: its peak scales with
// their weight's lever about the neck at the reference pose.
const lever = (b) => {
  const pivot = b.joints.find((j) => j.name === "neck").centre;
  return ["head", "jaw"].reduce((sum, name) => {
    const s = b.segments.find((x) => x.name === name);
    return sum + s.weight * Math.abs((s.proximal[2] + s.distal[2]) / 2 - pivot[2]);
  }, 0);
};
joint("neck").peak = round(authored.joints.find((j) => j.name === "neck").peak * lever(body) / lever(authored));

// The tail in two, resting on the floor by its radius, light and carried by its joints: at the
// authored weight and strength it drags the trot to a stop.
const base = segment("tail.base"), end = segment("tail.tip"), BASE_RADIUS = 0.035, TIP_RADIUS = 0.012;
base.proximal = round(fit.vent); base.distal = round([0, Math.max(fit.bend[1], BASE_RADIUS), fit.bend[2]]); base.radius = BASE_RADIUS;
end.proximal = base.distal; end.distal = round([0, TIP_RADIUS, fit.tip[2]]); end.radius = TIP_RADIUS;
joint("tail.base").centre = base.proximal; joint("tail.tip").centre = end.proximal;
base.weight = 0.15; end.weight = 0.08; joint("tail.base").peak = 1.5; joint("tail.tip").peak = 0.6;

// The legs where the posed art's are, the paws keeping the authored footprint; each elbow or knee
// bends about the normal of its upper and lower leg's plane, the right's mirroring the left's.
const sub = (a, b) => a.map((x, i) => x - b[i]), cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };
for (const e of ["front", "hind"]) for (const side of SIDES) {
  const leg = fit.legs[`${e}.${side}`], { girdle, bend, ankle } = leg;
  const upper = segment(`upper.${e}.${side}`), lower = segment(`lower.${e}.${side}`), paw = segment(`paw.${e}.${side}`);
  upper.proximal = round(girdle); upper.distal = round(bend); upper.radius = round(leg.upper);
  lower.proximal = round(bend); lower.distal = round(ankle); lower.radius = round(leg.lower);
  paw.proximal = round(ankle); paw.distal = round([ankle[0], 0, ankle[2]]);
  paw.size = round([paw.size[0], 2 * (ankle[1] / 2 - 0.0025), paw.size[2]]);
  paw.points = { sole: round([ankle[0], 0.0025, ankle[2]]) };
  joint(`girdle.${e}.${side}`).centre = upper.proximal;
  const left = fit.legs[`${e}.left`], n = unit(cross(sub(left.bend, left.girdle), sub(left.ankle, left.bend)));
  const b = joint(`bend.${e}.${side}`);
  b.centre = lower.proximal; b.axes = [round(side === "left" ? n : [-n[0], n[1], n[2]])];
  joint(`ankle.${e}.${side}`).centre = paw.proximal;
}

console.log(`head and jaw: x${k.toFixed(3)}, tipped ${(tip * 180 / Math.PI).toFixed(1)} deg; neck peak ${joint("neck").peak} N m`);
for (const s of body.segments) console.log(s.name, JSON.stringify(s.proximal), JSON.stringify(s.distal), s.radius ?? JSON.stringify(s.size));
if (process.argv.includes("--write")) writeFileSync(resolve(ROOT, "assets/reptile/body.json"), JSON.stringify(body, null, 2) + "\n");
