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
