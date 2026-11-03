// Poly Haven's Street Rat (Sean Buckley, CC0) measured: the landmarks the body is fitted to and the
// skin is weighted by. They are read off orthographic views of the published mesh (side, top,
// front, the legs close up and from below), in its own millimetres and axes: x the rat's left,
// y up, z forward, the paws' soles at y 0.

/** The body's stature, m (the reptile's), and the mesh's height, mm (its accessor's max y). */
export const STATURE = 0.325, ART_HEIGHT = 33.8627;
/** The art's millimetres to the body's metres. */
export const SCALE = STATURE / ART_HEIGHT;
/** An art point, mm, into the game's body frame, m: x is the body's right there, so it changes sign. */
export const at = ([x, y, z]) => [-x * SCALE, y * SCALE, z * SCALE];
/** An art length, mm, in m. */
export const mm = (length) => length * SCALE;

/** The art's landmarks, mm. A leg's x is its left side's; the right mirrors it. */
export const ART = Object.freeze({
  // The trunk's axis, rump to shoulders, and its radius: the body's half height and half width there.
  trunk: { from: [0, 20, -20], to: [0, 20, 0], radius: 12 },
  // Where the neck leaves the shoulders, the nose's tip, and the lower incisors' tips under it.
  neck: [0, 19, 10], nose: [0, 10, 41], incisors: [0, 9, 39],
  // The eyes' centres; the skull's axis, behind the eyes to the snout, and its half height; the jaw's
  // hinge, and the back of the chin, where the lower jaw shows under the snout.
  eye: [5.5, 19.5, 25], skull: { from: [0, 18.5, 19], to: [0, 13, 33], radius: 7.5 }, hinge: [0, 10, 21], chin: [0, 7.5, 28],
  // The tail's root at the rump, where its taper ends, and its tip (raised off the ground by its radius).
  tail: { root: [0, 12, -30], bend: [0, 6, -60], tip: [0, 2, -104], rootRadius: 3, tipRadius: 1.3 },
  // Each leg's joints: the shoulder or hip inside the body, the elbow or knee at the belly's edge,
  // the wrist or ankle above the paw; the toes' tips; the upper and lower leg's half thickness.
  front: { girdle: [7, 13, 12], bend: [7.5, 6, 6], ankle: [7.5, 2.4, 12.5], toe: [7.5, 1, 22], upper: 2.8, lower: 1.9 },
  hind: { girdle: [8, 12, -25], bend: [9, 6.5, -19], ankle: [8.5, 2.4, -22.5], toe: [8.5, 1, -10], upper: 3, lower: 2 },
});

/**
 * How far the body carries its head above the art's, rad, about the neck (`ART.neck`): standing,
 * the rat's mouth is about 0.05 m off the floor as the art holds it, and its jaw, opened to the
 * bite's gape (`REPTILE_BITE.open`), drops its incisors about 0.1 m, into the floor. Raised
 * 0.5 rad, the mouth stands at about 0.17 m and the open incisors 0.09 m clear.
 */
export const HEAD_RAISE = 0.5;

/** `p` turned about the x axis through `pivot` by `angle`, forward points rising. */
export const turnUp = ([x, y, z], [, py, pz], angle) => {
  const dy = y - py, dz = z - pz, c = Math.cos(angle), s = Math.sin(angle);
  return [x, py + dy * c + dz * s, pz + dz * c - dy * s];
};

/**
 * How far the body stands above the art, m: trunk, head and tail raised by it, and each leg
 * stretched along its upper and lower bones from its shoulder or hip so that its paw stays on the
 * floor (`standing`). The art holds its hips about 0.12 m up, where a trot at 1 m/s is a gallop's
 * pace; raised, they stand about 0.2 m up: docs/reference/reptile.md#the-rat.
 */
export const LEG_RAISE = 0.08;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => scale(a, 1 / Math.sqrt(dot(a, a)));

/**
 * The art as the body stands, mm: `body(p)` carries a point of the trunk, head or tail, and
 * `legs[name][piece](p)` one of a leg's (`upper`, `lower`, `paw`), `name` as `front.left`; `art`
 * is the landmarks posed so. A bone keeps its thickness and lengthens along its axis by its leg's
 * stretch, its girdle raised with the trunk and its ankle at the art's height.
 */
export function standing() {
  const raise = LEG_RAISE / SCALE, up = (p) => [p[0], p[1] + raise, p[2]];
  const legs = {};
  const posedLeg = (leg, side) => {
    const p = (point) => side === "left" ? point : [-point[0], point[1], point[2]];
    const girdle = p(leg.girdle), bend = p(leg.bend), ankle = p(leg.ankle);
    const k = (girdle[1] + raise - ankle[1]) / (girdle[1] - ankle[1]);
    const along = (from, to, start) => { const u = unit(sub(to, from)); return (q) => { const d = sub(q, from); return add(add(start, d), scale(u, (k - 1) * dot(d, u))); }; };
    const upper = along(girdle, bend, up(girdle)), bent = upper(bend), lower = along(bend, ankle, bent), reached = lower(ankle);
    const paw = (q) => add(q, sub(reached, ankle));
    return { upper, lower, paw, stretch: k };
  };
  for (const end of ["front", "hind"]) for (const side of ["left", "right"]) legs[`${end}.${side}`] = posedLeg(ART[end], side);
  const leg = (end) => {
    const { upper, lower, paw } = legs[`${end}.left`], at = ART[end];
    return { ...at, girdle: upper(at.girdle), bend: upper(at.bend), ankle: lower(at.ankle), toe: paw(at.toe) };
  };
  const art = {
    ...ART, trunk: { ...ART.trunk, from: up(ART.trunk.from), to: up(ART.trunk.to) }, neck: up(ART.neck), nose: up(ART.nose), incisors: up(ART.incisors),
    eye: up(ART.eye), skull: { ...ART.skull, from: up(ART.skull.from), to: up(ART.skull.to) }, hinge: up(ART.hinge), chin: up(ART.chin),
    tail: { ...ART.tail, root: up(ART.tail.root), bend: up(ART.tail.bend), tip: up(ART.tail.tip) }, front: leg("front"), hind: leg("hind"),
  };
  return { body: up, legs, art };
}
