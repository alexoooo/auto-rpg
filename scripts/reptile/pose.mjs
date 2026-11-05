// The grass lizard posed as the reptile stands: its spine straightened, its tail shortened, its legs
// set symmetric and wide, and the whole in the body frame (docs/art/reptile.md#what-the-file-holds).
// `fit` is what the skin's weights and the body's fit read; `bake` moves the scan's vertices.
import { load } from "./source.mjs";
import { SIDES } from "../../src/core/bodies/bilateral.ts";

/** The scan's floor, in its units. */
const FLOOR = -0.384;
/** How fast a vertex's weight for a bone falls behind its nearest bone's, the scan's units of cost. */
const BLEND = 0.025;
/** The tail behind the vent kept, of the scan's: the reptile's whole footprint fits a Crypt room three times. */
export const TAIL = 0.28;
/** How far the front leg reaches, girdle to wrist, of its length: the body stands this much above the scan. */
const EXTEND = 0.95;
/** The front leg, girdle to wrist, m, the reptile's: the scale. */
const REACH = 0.2715;
/** Every paw from the middle, m, the reptile's footprint. */
const WIDTH = 0.26;
/** The head and jaw carried raised about the neck, rad. */
export const HEAD_RAISE = 0.3;

/**
 * Rough landmarks of each leg, read off orthographic views of the scan, in its units and axes
 * (x toward the tail, y up, z the lizard's left); `x` where its girdle meets the spine.
 */
const LANDMARKS = {
  front: {
    left: { elbow: [-0.48, 0.08, 0.27], wrist: [-0.62, -0.30, 0.40], toe: [-0.93, -0.37, 0.52] },
    right: { elbow: [-1.00, 0.10, -0.52], wrist: [-1.15, -0.28, -0.62], toe: [-1.60, -0.37, -0.68] },
    x: -0.88,
  },
  hind: {
    left: { elbow: [0.48, 0.10, 0.48], wrist: [0.82, -0.20, 0.33], toe: [1.10, -0.36, 0.75] },
    right: { elbow: [1.07, 0.0, -0.42], wrist: [1.22, -0.20, -0.05], toe: [1.75, -0.33, -0.17] },
    x: 0.62,
  },
};
/** The leg pieces' half thickness, the scan's units. */
const RADII = { front: { upper: 0.06, lower: 0.045, paw: 0.02 }, hind: { upper: 0.08, lower: 0.055, paw: 0.025 } };

const v3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
};
const len = (a) => Math.sqrt(v3.dot(a, a)), norm = (a) => v3.mul(a, 1 / len(a));
/** The distance from `p` to the piece `a`–`b`. */
export function toPiece(p, a, b) {
  const ab = v3.sub(b, a), ap = v3.sub(p, a), t = Math.max(0, Math.min(1, v3.dot(ap, ab) / v3.dot(ab, ab)));
  return len(v3.sub(ap, v3.mul(ab, t)));
}

/** The scan's spine: per 0.05 slice along x, the mid height, the dorsal ridge's z (the top band's mean) and the half height; smoothed over ±0.2. */
function spine(parts) {
  const bins = new Map();
  for (const p of parts) for (let v = 0; v < p.positions.length / 3; v++) {
    const x = p.positions[v * 3], y = p.positions[v * 3 + 1], z = p.positions[v * 3 + 2], k = Math.round(x / .05);
    if (!bins.has(k)) bins.set(k, []);
    bins.get(k).push([x, y, z]);
  }
  const raw = [];
  for (const k of [...bins.keys()].sort((a, b) => a - b)) {
    const ps = bins.get(k);
    let top = -Infinity;
    for (const p of ps) top = Math.max(top, p[1]);
    const band = ps.filter((p) => p[1] > top - .04), zc = band.reduce((s, p) => s + p[2], 0) / band.length;
    const under = ps.filter((p) => Math.abs(p[2] - zc) < .04);
    let lo = Infinity;
    for (const p of under) lo = Math.min(lo, p[1]);
    raw.push([k * .05, (top + lo) / 2, zc, (top - lo) / 2]);
  }
  return raw.map(([x]) => {
    const near = raw.filter((r) => Math.abs(r[0] - x) <= .2);
    return [x, ...[1, 2, 3].map((j) => near.reduce((s, r) => s + r[j], 0) / near.length)];
  });
}

export const parts = load();
// The centreline: rows [x, y, z, half height], the snout's end extended to its tip; s its arc length in the top view.
const rows = spine(parts);
rows.unshift([-2.06, rows[0][1], rows[0][2], rows[0][3] * .5]);
const C = rows.map(([x, y, z, r]) => ({ x, y, z, r }));
let acc = 0;
C.forEach((c, i) => { if (i) acc += Math.hypot(c.x - C[i - 1].x, c.z - C[i - 1].z); c.s = acc; });
for (let i = 0; i < C.length; i++) {
  const a = C[Math.max(0, i - 1)], b = C[Math.min(C.length - 1, i + 1)], d = Math.hypot(b.x - a.x, b.z - a.z);
  C[i].t = [(b.x - a.x) / d, (b.z - a.z) / d];
}
/** The centreline at arc length s: point, half height and tangent. */
function at(s) {
  let i = 0;
  while (i < C.length - 2 && C[i + 1].s < s) i++;
  const a = C[i], b = C[i + 1], f = Math.max(0, Math.min(1, (s - a.s) / (b.s - a.s)));
  const mix = (k) => a[k] + (b[k] - a[k]) * f;
  const t = [a.t[0] + (b.t[0] - a.t[0]) * f, a.t[1] + (b.t[1] - a.t[1]) * f], tl = Math.hypot(...t);
  return { x: mix("x"), y: mix("y"), z: mix("z"), r: mix("r"), s, t: [t[0] / tl, t[1] / tl] };
}
/** A point's arc length and lateral offset (the lizard's left +) from the centreline, in the top view. */
function project(x, z) {
  let best = Infinity, s = 0, l = 0;
  for (let i = 0; i < C.length - 1; i++) {
    const a = C[i], b = C[i + 1], dx = b.x - a.x, dz = b.z - a.z, span = dx * dx + dz * dz;
    const f = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / span));
    const px = a.x + dx * f, pz = a.z + dz * f, d = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d < best) { best = d; s = a.s + (b.s - a.s) * f; const t = [dx / Math.sqrt(span), dz / Math.sqrt(span)]; l = (x - px) * -t[1] + (z - pz) * t[0]; }
  }
  return { s, l };
}
const sAtX = (x) => project(x, C.reduce((best, c) => Math.abs(c.x - x) < Math.abs(best.x - x) ? c : best).z).s;
const S_SNOUT = 0.02, S_VENT = sAtX(0.82), S_TIP = C[C.length - 1].s, S_NECK = sAtX(-1.36), S_HINGE = sAtX(-1.46);
/** Where the tail's base segment gives way to its tip, of the tail from the vent. */
const S_BEND = S_VENT + (S_TIP - S_VENT) * 0.4;
/** The tail lowered toward the floor behind the vent. */
const droop = (s) => s <= S_VENT ? 0 : -0.12 * Math.min(1, (s - S_VENT) / 2);
/** The tail behind the vent shortened to `TAIL` of its length. */
const squeeze = (s) => s <= S_VENT ? s : S_VENT + (s - S_VENT) * TAIL;
/** How far the body stands above the scan's height. */
let LIFT = 0;
/** Straightened coordinates [s, y, l] of a scan point, by the centreline nearest it. */
function straighten([x, y, z]) { const { s, l } = project(x, z); return [squeeze(s), y + droop(s) + LIFT, l]; }
/** Straightened coordinates by the rigid turn of the centreline at s0. */
function turned([x, y, z], s0) { const c = at(s0), dx = x - c.x, dz = z - c.z; return [s0 + dx * c.t[0] + dz * c.t[1], y + LIFT, -dx * c.t[1] + dz * c.t[0]]; }

// The legs: their girdles on the centreline at the trunk's surface, their joints straightened by the
// girdle's turn and made symmetric, the two sides' average; every paw `WIDTH` from the middle in the
// scale the front leg sets, the hind ankles as wide as the front wrists.
const LEG = {};
function placeLegs() {
  for (const end of ["front", "hind"]) {
    const sg = sAtX(LANDMARKS[end].x), c = at(sg), girdle = [sg, c.y + LIFT, c.r];
    const sides = SIDES.map((side) => {
      const m = side === "left" ? 1 : -1, pt = (p) => { const q = turned(p, sg); return [q[0], q[1], q[2] * m]; };
      const art = LANDMARKS[end][side];
      return { side, E: pt(art.elbow), W: pt(art.wrist), T: pt(art.toe) };
    });
    const avg = (f) => (f(sides[0]) + f(sides[1])) / 2;
    const L1 = avg((s) => len(v3.sub(s.E, girdle))), L2 = avg((s) => len(v3.sub(s.W, s.E))), L3 = avg((s) => len(v3.sub(s.T, s.W)));
    // The wrist at the sides' average, on its height above the floor; the elbow by two links, on the
    // side of the girdle-to-wrist line where the sides' average elbow is.
    const wrist = [avg((s) => s.W[0]), avg((s) => s.W[1]) - LIFT, end === "hind" ? LEG.front.W[2] : WIDTH * (L1 + L2) / REACH];
    const elbow = [avg((s) => s.E[0]), avg((s) => s.E[1]), avg((s) => s.E[2])];
    let d = v3.sub(wrist, girdle), dl = len(d);
    if (dl > (L1 + L2) * .98) { d = v3.mul(d, (L1 + L2) * .98 / dl); dl = (L1 + L2) * .98; }
    const W = v3.add(girdle, d), along = (L1 * L1 - L2 * L2 + dl * dl) / (2 * dl), rise = Math.sqrt(Math.max(0, L1 * L1 - along * along));
    const toward = v3.sub(elbow, girdle), off = norm(v3.sub(toward, v3.mul(d, v3.dot(toward, d) / (dl * dl))));
    const E = v3.add(girdle, v3.add(v3.mul(d, along / dl), v3.mul(off, rise)));
    const dir = norm([avg((s) => (s.T[0] - s.W[0]) / Math.hypot(s.T[0] - s.W[0], s.T[2] - s.W[2])), 0, avg((s) => (s.T[2] - s.W[2]) / Math.hypot(s.T[0] - s.W[0], s.T[2] - s.W[2]))]);
    const T = [W[0] + dir[0] * L3, FLOOR + 0.01, W[2] + dir[2] * L3];
    LEG[end] = { sg, girdle, E, W, T, L1, L2, L3, sides };
  }
}
// Stood up until the front leg reaches `EXTEND` of its length from girdle to wrist.
placeLegs();
{
  const f = LEG.front, lateral = f.W[2] - f.girdle[2], drop = Math.sqrt((EXTEND * (f.L1 + f.L2)) ** 2 - lateral * lateral);
  LIFT = Math.max(0, f.W[1] + drop - f.girdle[1]);
}
placeLegs();

/** A frame [origin, axes] from an origin, a direction and its plane's normal hint. */
function frame(o, a, nHint) { const x = norm(a), n = norm(v3.sub(nHint, v3.mul(x, v3.dot(nHint, x)))), y = v3.cross(n, x); return { o, ax: [x, y, n] }; }
const into = (f, p) => { const d = v3.sub(p, f.o); return f.ax.map((a) => v3.dot(d, a)); };
const outOf = (f, q) => v3.add(f.o, v3.add(v3.mul(f.ax[0], q[0]), v3.add(v3.mul(f.ax[1], q[1]), v3.mul(f.ax[2], q[2]))));
const mirror = (p, m) => [p[0], p[1], p[2] * m];
/** The paw's pieces: a fan of five from the wrist toward the toe. */
const fan = (W, T, r) => [-0.8, -0.4, 0, 0.4, 0.8].map((phi) => { const d = v3.sub(T, W), c = Math.cos(phi), s = Math.sin(phi); return [W, v3.add(W, [d[0] * c - d[2] * s, d[1], d[0] * s + d[2] * c]), r]; });

// Each leg bone: its frame in the scan and its frame posed, in straightened coordinates (the side's own sign).
const bones = [];
for (const end of ["front", "hind"]) for (const side of SIDES) {
  const leg = LEG[end], m = side === "left" ? 1 : -1, art = leg.sides.find((s) => s.side === side);
  const G = mirror(leg.girdle, m), aE = mirror(art.E, m), aW = mirror(art.W, m), aT = mirror(art.T, m);
  const tE = mirror(leg.E, m), tW = mirror(leg.W, m), tT = mirror(leg.T, m);
  const aN = v3.cross(v3.sub(aE, G), v3.sub(aW, aE)), tN = v3.cross(v3.sub(tE, G), v3.sub(tW, tE)), r = RADII[end];
  bones.push(
    { sg: leg.sg, art: frame(G, v3.sub(aE, G), aN), target: frame(G, v3.sub(tE, G), tN), pieces: [[G, aE, r.upper]] },
    { sg: leg.sg, art: frame(aE, v3.sub(aW, aE), aN), target: frame(tE, v3.sub(tW, tE), tN), pieces: [[aE, aW, r.lower]] },
    { sg: leg.sg, art: frame(aW, v3.sub(aT, aW), [0, 1, 0]), target: frame(tW, v3.sub(tT, tW), [0, 1, 0]), pieces: fan(aW, aT, r.paw) },
  );
}

/** Metres a scan unit: the front leg, girdle to wrist, at `REACH`. */
const K = REACH / (LEG.front.L1 + LEG.front.L2), S_MID = (LEG.front.sg + LEG.hind.sg) / 2;
/** Straightened coordinates into the body frame, m: x the body's right, y up from the floor, z forward, the origin midway between the girdles. */
const game = ([s, y, l]) => [-l * K, (y - FLOOR) * K, (S_MID - s) * K];

/**
 * A scan part's vertices posed, in the body frame. Each vertex blends where the spine and the leg
 * bones nearest it carry it (the spine straightened, each bone moved rigidly), by its cost to each,
 * the distance from its pieces less their thickness, falling off by `BLEND`.
 */
export function bake(part) {
  const P = part.positions, n = P.length / 3, out = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], st = straighten(p), c = at(st[0]);
    const costs = [[null, Math.hypot(st[1] - droop(st[0]) - LIFT - c.y, st[2]) - c.r]];
    for (const b of bones) {
      const q = turned(p, b.sg);
      costs.push([b, Math.min(...b.pieces.map(([a, e, r]) => toPiece(q, a, e) - r)), q]);
    }
    costs.sort((a, b) => a[1] - b[1]);
    const near = costs.slice(0, 4).map((c) => [c, Math.exp(-(c[1] - costs[0][1]) / BLEND)]), total = near.reduce((s, [, w]) => s + w, 0);
    let q = [0, 0, 0];
    for (const [[bone, , turnedPoint], w] of near) q = v3.add(q, v3.mul(bone ? outOf(bone.target, into(bone.art, turnedPoint)) : st, w / total));
    out.set(game(q), v * 3);
  }
  return out;
}

/** The posed lizard's centreline at s, in the body frame. */
const onLine = (s) => { const c = at(s); return game([squeeze(s), c.y + droop(s) + LIFT, 0]); };
const legPieces = {}, legs = {};
for (const end of ["front", "hind"]) for (const side of SIDES) {
  const leg = LEG[end], m = side === "left" ? 1 : -1, r = RADII[end];
  const G = game(mirror(leg.girdle, m)), E = game(mirror(leg.E, m)), W = game(mirror(leg.W, m)), T = game(mirror(leg.T, m));
  legPieces[`upper.${end}.${side}`] = [[G, E, r.upper * K]];
  legPieces[`lower.${end}.${side}`] = [[E, W, r.lower * K]];
  legPieces[`paw.${end}.${side}`] = fan(W, T, r.paw * K);
  legs[`${end}.${side}`] = { girdle: G, bend: E, ankle: W, upper: r.upper * K, lower: r.lower * K };
}

/** **The posed lizard's landmarks in the body frame, m**: what the skin's weights and the body's fit read. */
export const fit = Object.freeze({
  /** The weights' fall-off, m of cost. */
  blend: BLEND * K,
  /** The centreline's span each of head, trunk and the tail's two segments takes, by arc length. */
  spans: [["head", S_SNOUT, S_NECK], ["trunk", S_NECK, S_VENT], ["tail.base", S_VENT, S_BEND], ["tail.tip", S_BEND, S_TIP]],
  /** The centreline from the snout: arc length, point and half height. */
  centre: C.filter((c) => c.s >= S_SNOUT).map((c) => ({ s: c.s, p: onLine(c.s), r: c.r * K })),
  legPieces, legs,
  /** The mouth's line: the jaw is what lies below it, ahead of the hinge. */
  mouthY: (-0.06 - FLOOR) * K,
  hinge: onLine(S_HINGE), neck: onLine(S_NECK), snout: onLine(S_SNOUT), vent: onLine(S_VENT), bend: onLine(S_BEND), tip: onLine(S_TIP),
  /** The trunk's half height midway from neck to vent. */
  trunkRadius: at((S_NECK + S_VENT) / 2).r * K,
  eye: game(turned([-1.69, 0.10, 0.09], sAtX(-1.69))), lowerTip: game(turned([-2.01, -0.08, -0.01], sAtX(-2.01))),
});
