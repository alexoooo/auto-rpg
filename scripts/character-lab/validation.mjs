import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { surface } from "./contact.mjs";

/**
 * What the checks read off a workshop model's skin (`docs/art/characters.md#what-the-checks-read`). A length along
 * the hand is in metres on the hand the grips are authored on, whose middle knuckle is `hand` from its wrist;
 * another model's hand scales it. A place along the forearm is a share of it, 0 at the elbow and 1 at the wrist.
 */
const SKIN = Object.freeze({
  hand: .1209,
  /** The palm's pad: bound to the hand by more than `weight`, between `from` and `to` along the hand, and facing
   * the palm's way by more than the cosine `facing`. */
  palm: Object.freeze({ weight: .6, from: .055, to: .115, facing: .25 }),
  /** A digit's pad: bound to its two outer bones by more than `weight`, and facing the palm's way by more than the
   * cosine `facing`. */
  pad: Object.freeze({ weight: .65, facing: .05 }),
  /** The wrist: the skin from `from` to `to` along the forearm, within `radius` of its axis, m. Its area is read at
   * each of `sections`, over the skin within `slice` of the section. */
  wrist: Object.freeze({ from: .72, to: 1.02, radius: .07, sections: Object.freeze([.77, .84, .91, .98]), slice: .027 }),
  /** The forearm: the skin from `from` to `to` along it, between `least` and `most` from its axis, m. */
  forearm: Object.freeze({ from: .2, to: .75, least: .015, most: .065 }),
  /** The share of a pad's distances, counted from the nearest, at which its contact is read. */
  patch: .1,
  /** A triangle belongs to a part of the body when each of its corners is bound to the part's bones by more than
   * this. */
  part: .65,
});
const DIGITS = ["index", "middle", "ring", "pinky", "thumb"];
/** The side of a cell of the surface index, m. A numeric setting: it changes how fast the index answers, not what
 * it answers. */
const CELL = .12;

/**
 * How far each of `points` is from the grip, m: negative inside it. `grip` is the exported handle, a cylinder
 * given as two equal rings of vertices; its axis and radius are read off the rings.
 */
export function gripDistances(points, grip) {
  const mean = (ring) => ring.reduce((sum, p) => sum.add(p), Vector3.Zero()).scale(1 / ring.length);
  const half = grip.length / 2, a = mean(grip.slice(0, half)), b = mean(grip.slice(half));
  const axis = b.subtract(a).normalize(), length = b.subtract(a).length();
  const radius = grip.slice(0, half).reduce((sum, p) => sum + p.subtract(a).length(), 0) / half;
  return points.map((p) => {
    const d = p.subtract(a), t = Vector3.Dot(d, axis);
    const radial = d.subtract(axis.scale(t)).length() - radius, axial = Math.max(-t, t - length);
    return Math.hypot(Math.max(radial, 0), Math.max(axial, 0)) + Math.min(Math.max(radial, axial), 0);
  });
}

/** How far the nearest of `points` is from the grip, m. */
export function gripGap(points, grip) {
  return Math.min(...gripDistances(points, grip));
}

/**
 * The nearest of a pad's `distances`, and the one `SKIN.patch` of the way up their order, the third at least: a
 * pad lies on a grip when that one is near too, and not only its nearest point.
 */
export function contactPatch(distances) {
  const ordered = distances.toSorted((a, b) => a - b);
  const at = Math.min(ordered.length - 1, Math.max(2, Math.floor(ordered.length * SKIN.patch)));
  return { minimum: ordered[0], patch: ordered[at] };
}

/**
 * The vertices of `mesh`, the skin, that make up each region of the arm on `side` ("l" or "r"), found in the rest
 * pose: the palm's pad and each digit's by index, the wrist's with their place along the forearm, the forearm's
 * with their distance from its axis; with every vertex's rest position and the forearm's rest axis.
 */
export function skinRegions(mesh, side) {
  const bones = mesh.skeleton.bones;
  const indices = mesh.getVerticesData("matricesIndices"), weights = mesh.getVerticesData("matricesWeights");
  const positions = mesh.getVerticesData("position"), normals = mesh.getVerticesData("normal");
  const byIndex = new Map(bones.map((bone) => [bone.getIndex(), bone.name]));
  const rest = (name) => bones.find((bone) => bone.name === name)
    .getAbsoluteInverseBindMatrix().clone().invert().getTranslation();
  const wrist = rest(`hand_${side}`), middle = rest(`middle_01_${side}`), long = middle.subtract(wrist).normalize();
  // The palm faces the way the middle finger's first bone leans off the hand's length.
  const proximal = rest(`middle_02_${side}`).subtract(middle);
  const palm = proximal.subtract(long.scale(Vector3.Dot(proximal, long))).normalize();
  const handScale = middle.subtract(wrist).length() / SKIN.hand;
  const elbow = rest(`lowerarm_${side}`), fore = wrist.subtract(elbow), length = fore.length(), axis = fore.normalize();
  const result = { palm: [], index: [], middle: [], ring: [], pinky: [], thumb: [], wrist: [], forearm: [], restPoints: [] };
  for (let i = 0; i < positions.length / 3; i++) {
    const p = Vector3.FromArray(positions, i * 3), n = Vector3.FromArray(normals, i * 3), weight = {};
    for (let j = 0; j < 4; j++) {
      const name = byIndex.get(indices[i * 4 + j]);
      weight[name] = (weight[name] ?? 0) + weights[i * 4 + j];
    }
    result.restPoints.push(p);
    const along = Vector3.Dot(p.subtract(wrist), long), facing = Vector3.Dot(n, palm);
    const onPalm = along > SKIN.palm.from * handScale && along < SKIN.palm.to * handScale;
    if ((weight[`hand_${side}`] ?? 0) > SKIN.palm.weight && onPalm && facing > SKIN.palm.facing) result.palm.push(i);
    for (const digit of DIGITS) {
      const outer = (weight[`${digit}_02_${side}`] ?? 0) + (weight[`${digit}_03_${side}`] ?? 0);
      if (outer > SKIN.pad.weight && facing > SKIN.pad.facing) result[digit].push(i);
    }
    const t = Vector3.Dot(p.subtract(elbow), axis) / length;
    const radius = p.subtract(elbow.add(axis.scale(t * length))).length();
    if (t > SKIN.wrist.from && t < SKIN.wrist.to && radius < SKIN.wrist.radius) result.wrist.push({ i, t });
    const { from, to, least, most } = SKIN.forearm;
    if (t > from && t < to && radius > least && radius < most) result.forearm.push({ i, radius });
  }
  result.restFore = axis;
  return result;
}

/** The most any vertex of the forearm stands from the posed forearm's axis, as a multiple of its rest distance. */
export function forearmExpansion(regions, points, elbow, wrist) {
  const axis = wrist.subtract(elbow).normalize();
  if (regions.forearm.length < 12) throw Error("No forearm surface sampled");
  return Math.max(...regions.forearm.map(({ i, radius }) => {
    const d = points[i].subtract(elbow);
    return d.subtract(axis.scale(Vector3.Dot(d, axis))).length() / radius;
  }));
}

/** The spread of `points` across `axis`: the root of the determinant of their covariance in the plane across it. */
function sectionArea(points, axis) {
  const reference = Math.abs(axis.y) < .9 ? Vector3.Up() : new Vector3(1, 0, 0);
  const u = Vector3.Cross(axis, reference).normalize(), v = Vector3.Cross(axis, u).normalize();
  const centre = points.reduce((sum, p) => sum.add(p), Vector3.Zero()).scale(1 / points.length);
  let xx = 0, xy = 0, yy = 0;
  for (const p of points) {
    const d = p.subtract(centre), x = Vector3.Dot(d, u), y = Vector3.Dot(d, v);
    xx += x * x;
    xy += x * y;
    yy += y * y;
  }
  return Math.sqrt(Math.max(0, xx * yy - xy * xy)) / points.length;
}

/** The least, over the wrist's sections, of a section's posed area over its rest area: a wrist that twists shut
 * reads near zero. */
export function wristAreaRatio(regions, points, axis) {
  let minimum = Infinity;
  for (const t of SKIN.wrist.sections) {
    const ids = regions.wrist.filter((v) => Math.abs(v.t - t) < SKIN.wrist.slice).map((v) => v.i);
    if (ids.length < 6) continue;
    const rest = sectionArea(ids.map((i) => regions.restPoints[i]), regions.restFore);
    const posed = sectionArea(ids.map((i) => points[i]), axis);
    minimum = Math.min(minimum, posed / rest);
  }
  if (!Number.isFinite(minimum)) throw Error("No wrist surface sections sampled");
  return minimum;
}

/** Whether the segment from `a` to `b` passes through the triangle `p`, `q`, `r`, its own ends apart. The narrow
 * phase reads the deformed garment's triangles, not a guessed ellipsoid about the torso. */
function segmentTriangle(a, b, p, q, r) {
  const d = b.subtract(a), e1 = q.subtract(p), e2 = r.subtract(p), h = Vector3.Cross(d, e2), det = Vector3.Dot(e1, h);
  if (Math.abs(det) < 1e-10) return false;
  const inv = 1 / det, s = a.subtract(p), u = inv * Vector3.Dot(s, h);
  if (u < 0 || u > 1) return false;
  const cross = Vector3.Cross(s, e1), v = inv * Vector3.Dot(d, cross);
  if (v < 0 || u + v > 1) return false;
  const t = inv * Vector3.Dot(e2, cross);
  return t > .0001 && t < .9999;
}

/** The posed vertices of `mesh`, or of the mesh a part was cut from, read once into `cache` when there is one. */
function sampledSurface(mesh, cache) {
  if (!cache) return surface(mesh);
  const source = mesh.source ?? mesh;
  if (!cache.has(source)) cache.set(source, surface(source));
  return cache.get(source);
}

/** The key of every cell that the box about `points` touches. */
function cellKeys(points) {
  let lo = points[0].clone(), hi = lo.clone();
  for (const p of points) {
    lo = Vector3.Minimize(lo, p);
    hi = Vector3.Maximize(hi, p);
  }
  const keys = [];
  for (let x = Math.floor(lo.x / CELL); x <= Math.floor(hi.x / CELL); x++) {
    for (let y = Math.floor(lo.y / CELL); y <= Math.floor(hi.y / CELL); y++) {
      for (let z = Math.floor(lo.z / CELL); z <= Math.floor(hi.z / CELL); z++) keys.push(`${x},${y},${z}`);
    }
  }
  return keys;
}

/**
 * The posed triangles of `meshes`, filed by the cells they touch. `intersects(a, b)` says whether the segment
 * passes through any of them, and `lastTriangle` is the one it found.
 */
export function surfaceIndex(meshes, cache) {
  const cells = new Map();
  let lastTriangle;
  for (const mesh of meshes) {
    const points = sampledSurface(mesh, cache), indices = mesh.getIndices();
    for (let i = 0; i < indices.length; i += 3) {
      const triangle = [points[indices[i]], points[indices[i + 1]], points[indices[i + 2]]];
      for (const key of cellKeys(triangle)) {
        let cell = cells.get(key);
        if (!cell) {
          cell = [];
          cells.set(key, cell);
        }
        cell.push(triangle);
      }
    }
  }
  return {
    get lastTriangle() { return lastTriangle; },
    intersects(a, b) {
      const seen = new Set();
      for (const key of cellKeys([a, b])) for (const triangle of cells.get(key) ?? []) {
        if (seen.has(triangle)) continue;
        seen.add(triangle);
        if (segmentTriangle(a, b, ...triangle)) {
          lastTriangle = triangle;
          return true;
        }
      }
      return false;
    },
  };
}

/** Whether any edge of `mesh` passes through the surface `index` holds; `onHit` is told the edge and the triangle. */
export function meshCrossesSurface(mesh, index, cache, onHit) {
  const points = sampledSurface(mesh, cache), ids = mesh.getIndices(), seen = new Set();
  for (let i = 0; i < ids.length; i += 3) for (let j = 0; j < 3; j++) {
    const a = ids[i + j], b = ids[i + (j + 1) % 3], key = a < b ? `${a},${b}` : `${b},${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (index.intersects(points[a], points[b])) {
      onHit?.({ edge: [points[a], points[b]], triangle: index.lastTriangle, vertexIds: [a, b] });
      return true;
    }
  }
  return false;
}

/** The triangles of `mesh` whose corners are each bound, by more than `SKIN.part`, to bones `acceptBone` takes: a
 * part of the body, with the mesh's own vertices. */
export function skinPart(mesh, acceptBone) {
  const indices = mesh.getVerticesData("matricesIndices"), weights = mesh.getVerticesData("matricesWeights");
  const names = new Map(mesh.skeleton.bones.map((bone) => [bone.getIndex(), bone.name]));
  const belongs = (i) => {
    let sum = 0;
    for (let j = 0; j < 4; j++) if (acceptBone(names.get(indices[i * 4 + j]) ?? "")) sum += weights[i * 4 + j];
    return sum > SKIN.part;
  };
  const source = mesh.getIndices(), selected = [];
  for (let i = 0; i < source.length; i += 3) {
    if (belongs(source[i]) && belongs(source[i + 1]) && belongs(source[i + 2])) selected.push(...source.slice(i, i + 3));
  }
  return {
    source: mesh,
    getPositionData: (...args) => mesh.getPositionData(...args),
    computeWorldMatrix: (...args) => mesh.computeWorldMatrix(...args),
    getIndices: () => selected,
  };
}
