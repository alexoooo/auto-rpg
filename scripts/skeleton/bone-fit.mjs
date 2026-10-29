/**
 * **The crypt skeleton's body, measured from its bones.** Reads the art
 * (`assets/art/environment/skeleton/skeleton.glb`), places each piece at its bind
 * (`assets/skeleton/bind.json`, the fist build) in the body frame, groups the pieces by the
 * segment that carries them (`SKELETON_PIECES`), and writes `assets/skeleton/bones.json`:
 *
 * - `segments.<name>`: the bones' solid volume, their centroid, their second moment per unit
 *   volume about the centroid (`spread`: xx, yy, zz and xy, yz, zx, m2), and a low-polygon
 *   collider, the hull of the bones' farthest vertices along `DIRECTIONS` (an icosphere's vertices).
 * - `hands.<side>`: the hand's hull (palm and fingers: the art's hand is always closed, so an open
 *   hand and a fist are the same shape); `palm`, the centre of its patch on the palmar side
 *   (toward the curled fingers), where it bears; `strike`, where the line from the wrist through
 *   the middle knuckle leaves it.
 * - `feet.<side>`: the foot bones' extents, body frame.
 *
 * Body frame (+x right, +y up, +z front), metres; points rounded to 0.1 mm. The meshes are closed,
 * so a solid's volume is the sum of its triangles' signed tetrahedra; the art's winding gives them
 * one sign throughout, checked. `node scripts/skeleton/bone-fit.mjs` prints a summary; `--write`
 * writes the file. The record: `docs/art/skeleton.md#the-body-fitted-to-the-bones`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MeshoptDecoder } from "meshoptimizer";
import { parseSkeletonArt, SKELETON_PIECES } from "../../src/render/skeleton-skin.ts";
import { convexHull } from "../../src/core/spec/hull.ts";
import { add, dot, normalize, orthogonalTo, scale, sub } from "../../src/core/spec/vec.ts";
import { PATCH } from "../core/hand-envelope.mjs";
import bind from "../../assets/skeleton/bind.json" with { type: "json" };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(ROOT, "assets", "skeleton", "bones.json");

/** The icosphere's subdivision whose vertices are the hull's directions: 1, 42 directions, about 35 corners a hull. */
const DIRECTIONS = 1;

const round = (x, step) => Math.round(x / step) * step;
const point = (p) => p.map((x) => +round(x, 1e-4).toFixed(4));
const significant = (x) => +x.toPrecision(6);

/** `v` turned by the unit quaternion (x, y, z, w). */
function turn([x, y, z, w], v) {
  const cx = y * v[2] - z * v[1], cy = z * v[0] - x * v[2], cz = x * v[1] - y * v[0];
  return [v[0] + 2 * (w * cx + y * cz - z * cy), v[1] + 2 * (w * cy + z * cx - x * cz), v[2] + 2 * (w * cz + x * cy - y * cx)];
}
const row = (part) => {
  const found = bind.find((p) => p.build === "fist/fist" && p.id === `left.golem.${part}`);
  if (!found) throw new Error(`the bind has no ${part}`);
  return found;
};
/** A bind part's end along its own y, body frame: +1 its max, -1 its min (as `skeleton.ts` reads joints). */
const partEnd = (part, sign) => { const r = row(part); return add(r.position, turn(r.rotation, [0, sign > 0 ? r.max[1] : r.min[1], 0])); };

function icosphere(level) {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(normalize);
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let l = 0; l < level; l++) {
    const cache = new Map();
    const mid = (a, b) => {
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (!cache.has(key)) { v.push(normalize(scale(add(v[a], v[b]), 0.5))); cache.set(key, v.length - 1); }
      return cache.get(key);
    };
    faces = faces.flatMap(([a, b, c]) => { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]]; });
  }
  return v;
}

/** The hull of `points`' farthest along each direction: its corners. */
function lowHull(points, directions) {
  const chosen = new Set();
  for (const d of directions) {
    let best = 0, far = -Infinity;
    points.forEach((p, i) => { const s = dot(p, d); if (s > far) { far = s; best = i; } });
    chosen.add(best);
  }
  const candidates = [...chosen].map((i) => points[i]);
  return convexHull(candidates).vertices.map((i) => candidates[i]);
}

/** Where the ray from `from` along `direction` leaves the convex hull of `corners`. */
function exit(corners, from, direction) {
  const { planes } = convexHull(corners);
  let t = Infinity;
  for (const { normal, offset } of planes) {
    const rate = dot(normal, direction);
    if (rate > 0) t = Math.min(t, (offset - dot(normal, from)) / rate);
  }
  if (!Number.isFinite(t) || t < 0) throw new Error("the ray starts outside the hull or never leaves it");
  return add(from, scale(direction, t));
}

/** Volume, centroid and second moment per unit volume about the centroid of closed meshes, from a shared origin. */
function solid(meshes, origin) {
  let volume = 0, sign = 0;
  const first = [0, 0, 0], second = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const { points, indices } of meshes) {
    let own = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = [points[indices[i]], points[indices[i + 1]], points[indices[i + 2]]].map((p) => sub(p, origin));
      const v = (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
      own += v;
      const sum = add(add(a, b), c);
      for (let j = 0; j < 3; j++) {
        first[j] += v * sum[j] / 4;
        // A tetrahedron with a vertex at the origin: V/20 (sum of its vertices' outer products plus the outer product of their sum).
        for (let k = 0; k < 3; k++) second[j][k] += v / 20 * (a[j] * a[k] + b[j] * b[k] + c[j] * c[k] + sum[j] * sum[k]);
      }
    }
    const s = Math.sign(own);
    if (sign && s !== sign) throw new Error("the pieces wind opposite ways");
    sign = s;
    volume += own;
  }
  const c = scale(first, 1 / volume);
  const spread = (j, k) => second[j][k] / volume - c[j] * c[k];
  return { volume: Math.abs(volume), centroid: add(origin, c),
    spread: { diagonal: [spread(0, 0), spread(1, 1), spread(2, 2)], off: [spread(0, 1), spread(1, 2), spread(2, 0)] } };
}

await MeshoptDecoder.ready;
const decode = async (source, count, stride, mode, filter) => {
  const target = new Uint8Array(count * stride);
  MeshoptDecoder.decodeGltfBuffer(target, count, stride, source, mode, filter);
  return target;
};
const bytes = fs.readFileSync(path.join(ROOT, "assets", "art", "environment", "skeleton", "skeleton.glb"));
const art = await parseSkeletonArt(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), decode);

/** A piece's vertices in the body frame, at its part's bind. */
function placed(key, part) {
  const piece = art.get(key);
  if (!piece) throw new Error(`the art has no piece ${key}`);
  const r = row(part), points = [];
  for (let i = 0; i < piece.positions.length; i += 3) points.push(add(r.position, turn(r.rotation, [piece.positions[i], piece.positions[i + 1], piece.positions[i + 2]])));
  return { points, indices: piece.indices };
}

const directions = icosphere(DIRECTIONS);
const bySegment = new Map();
for (const [key, { part, segment }] of Object.entries(SKELETON_PIECES)) {
  const list = bySegment.get(segment) ?? [];
  list.push({ key, ...placed(key, part) });
  bySegment.set(segment, list);
}

const segments = {};
for (const [segment, pieces] of bySegment) {
  const all = pieces.flatMap((p) => p.points);
  const origin = scale(all.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / all.length);
  const { volume, centroid, spread } = solid(pieces, origin);
  segments[segment] = { pieces: pieces.map((p) => p.key), volume: significant(volume), centroid: point(centroid),
    spread: { diagonal: spread.diagonal.map(significant), off: spread.off.map(significant) }, hull: lowHull(all, directions).map(point) };
}

const hands = {}, feet = {};
for (const side of ["left", "right"]) {
  const arm = side === "right" ? "primary" : "secondary";
  const palm = placed(`${arm}.wrist.bare`, `${arm}.wrist`).points, fingers = placed(`${arm}.fist`, `${arm}.fist`).points;
  const WJC = partEnd(`${arm}.rollRing`, -1), MET3 = partEnd(`${arm}.wrist`, -1), along = normalize(sub(MET3, WJC));
  const mean = (points) => scale(points.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / points.length);
  // The palmar side: toward the curled fingers, square to the hand's line.
  const palmar = orthogonalTo(sub(mean(fingers), mean(palm)), along);
  const hull = lowHull([...palm, ...fingers], directions), deepest = Math.max(...hull.map((p) => dot(p, palmar)));
  const patch = hull.filter((p) => dot(p, palmar) >= deepest - PATCH);
  hands[side] = { hull: hull.map(point), palm: point(mean(patch)), strike: point(exit(hull, MET3, along)) };
  const foot = placed(`legs.foot${side === "left" ? "L" : "R"}`, `legs.foot${side === "left" ? "L" : "R"}`).points;
  feet[side] = { min: point([0, 1, 2].map((k) => Math.min(...foot.map((p) => p[k])))), max: point([0, 1, 2].map((k) => Math.max(...foot.map((p) => p[k])))) };
}

const record = { directions: directions.length, segments, hands, feet };
let total = 0;
for (const s of Object.values(segments)) total += s.volume;
for (const [name, s] of Object.entries(segments)) {
  console.log(`${name.padEnd(15)} ${(s.volume * 1e6).toFixed(1).padStart(7)} cm3  ${(100 * s.volume / total).toFixed(1).padStart(5)} %  `
    + `centroid ${s.centroid.join(", ")}  corners ${s.hull.length}  spread ${s.spread.diagonal.map((x) => (x * 1e4).toFixed(2)).join("/")} cm2`);
}
console.log(`total ${(total * 1e6).toFixed(1)} cm3`);
for (const side of ["left", "right"]) console.log(side, "palm", hands[side].palm.join(", "), " strike", hands[side].strike.join(", "), " foot", feet[side].min.join(", "), "..", feet[side].max.join(", "));
if (process.argv.includes("--write")) {
  fs.writeFileSync(OUT, JSON.stringify(record, null, 1) + "\n");
  console.log(`wrote ${path.relative(ROOT, OUT)}`);
}
