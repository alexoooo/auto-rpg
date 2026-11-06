import { isRefused, type Refused } from "../../refusal.ts";
import { frameOf, type BodySpec, type SegmentSpec, type ShapeSpec, type SegmentFrame } from "./body.ts";
import { Quaternion, Vector3 } from "../../math/vector.ts";
import { convexHullChecked } from "./hull.ts";
import { add, cross, dot, length, scale, sub } from "./vec.ts";
import type { Vec3 } from "./quantity.ts";

type Capsule = { kind: "capsule"; from: Vec3; to: Vec3; radius: number };
type Box = { kind: "box"; centre: Vec3; axes: Vec3[]; half: Vec3 };
type Hull = { kind: "hull"; points: Vec3[]; coordinates: Float64Array; faces: readonly (readonly [Vec3, Vec3, Vec3])[]; edges: readonly Vec3[]; planes: readonly { normal: Vec3; offset: number }[] };
type Solid = Capsule | Box | Hull;

function hull(points: Vec3[]): Hull | Refused {
  const made = convexHullChecked(points);
  if (isRefused(made)) return made;
  const { vertices, planes, faces } = made;
  const edges = new Map<string, Vec3>();
  for (const [a, b, c] of faces) for (const [u, v] of [[a, b], [b, c], [c, a]] as const)
    edges.set(`${Math.min(u, v)},${Math.max(u, v)}`, sub(points[v]!, points[u]!));
  const corners = vertices.map(i => points[i]!);
  return { kind: "hull", points: corners, coordinates: Float64Array.from(corners.flat()), faces: faces.map(([a, b, c]) => [points[a]!, points[b]!, points[c]!] as const), edges: [...edges.values()], planes };
}

function solid(segment: SegmentSpec): Solid | Refused {
  const shape = segment.shape;
  switch (shape.kind) {
    case "capsule": return { kind: "capsule", from: shape.from.value, to: shape.to.value, radius: shape.radius.value };
    case "sphere": return { kind: "capsule", from: shape.centre.value, to: shape.centre.value, radius: shape.radius.value };
    case "hull": return hull(shape.points.map(p => p.value));
    case "box": {
      const f = frameOf(segment);
      return { kind: "box", centre: shape.centre.value, axes: [f.x, f.y, f.z], half: scale(shape.size.value, .5) };
    }
    default: { const never: never = shape; throw new Error(`unknown shape ${String(never)}`); }
  }
}

function least(f: (t: number) => number): number {
  let low = 0, high = 1;
  for (let i = 0; i < 100; i++) {
    const a = low + (high - low) / 3, b = high - (high - low) / 3;
    if (f(a) <= f(b)) high = b; else low = a;
  }
  return Math.min(f(0), f(1), f((low + high) / 2));
}

function pointEdge(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub(b, a), squared = dot(ab, ab);
  const t = squared > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / squared)) : 0;
  return length(sub(p, add(a, scale(ab, t))));
}

/** Closest points of two finite segments, including parallel and point segments. */
function segmentDistance(a: Vec3, b: Vec3, c: Vec3, d: Vec3): number {
  const u = sub(b, a), v = sub(d, c), w = sub(a, c);
  const uu = dot(u, u), vv = dot(v, v), uv = dot(u, v), uw = dot(u, w), vw = dot(v, w);
  if (uu === 0) return pointEdge(a, c, d);
  if (vv === 0) return pointEdge(c, a, b);
  const denominator = uu * vv - uv * uv;
  let s = denominator > 0 ? Math.max(0, Math.min(1, (uv * vw - uw * vv) / denominator)) : 0;
  let t = (uv * s + vw) / vv;
  if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -uw / uu)); }
  else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (uv - uw) / uu)); }
  return length(sub(add(a, scale(u, s)), add(c, scale(v, t))));
}

function segmentHull(a: Vec3, b: Vec3, h: Hull): number {
  if (a.every((v, k) => v === b[k])) return pointHull(a, h);
  let low = 0, high = 1;
  for (const plane of h.planes) {
    const start = dot(plane.normal, a) - plane.offset, change = dot(plane.normal, sub(b, a));
    if (change === 0) { if (start > 0) { low = 1; high = 0; break; } }
    else if (change > 0) high = Math.min(high, -start / change);
    else low = Math.max(low, -start / change);
  }
  if (low <= high) return 0;
  let closest = Math.min(pointHull(a, h), pointHull(b, h));
  for (const [p, q, r] of h.faces)
    closest = Math.min(closest, segmentDistance(a, b, p, q), segmentDistance(a, b, q, r), segmentDistance(a, b, r, p));
  return closest;
}

/** Euclidean distance to a convex solid: zero inside, the nearest face, edge or corner outside. */
function pointHull(p: Vec3, h: Hull): number {
  if (h.planes.every(plane => dot(plane.normal, p) <= plane.offset)) return 0;
  let closest = Infinity;
  for (const [a, b, c] of h.faces) {
    const ab = sub(b, a), bc = sub(c, b), ca = sub(a, c), n = cross(ab, sub(c, a));
    const squared = dot(n, n), signed = dot(sub(p, a), n);
    const projected = sub(p, scale(n, signed / squared));
    const inside = dot(cross(ab, sub(projected, a)), n) >= 0
      && dot(cross(bc, sub(projected, b)), n) >= 0 && dot(cross(ca, sub(projected, c)), n) >= 0;
    closest = Math.min(closest, inside ? Math.abs(signed) / Math.sqrt(squared)
      : Math.min(pointEdge(p, a, b), pointEdge(p, b, c), pointEdge(p, c, a)));
  }
  return closest;
}

const along = (a: Capsule, t: number): Vec3 => add(a.from, scale(sub(a.to, a.from), t));
function boxHull(b: Box): Hull | Refused {
  const points: Vec3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1])
    points.push([x, y, z].reduce<Vec3>((p, sign, i) => add(p, scale(b.axes[i]!, sign * b.half[i]!)), b.centre));
  return hull(points);
}

/** Project corners in their declared order, with the same dot arithmetic on contiguous coordinates. */
function projectHull(hull: Hull, axis: Vec3, out: Float64Array, offset: number): void {
  const points = hull.coordinates, ax = axis[0], ay = axis[1], az = axis[2];
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < points.length; i += 3) {
    const at = ax * points[i]! + ay * points[i + 1]! + az * points[i + 2]!;
    low = Math.min(low, at); high = Math.max(high, at);
  }
  out[offset] = low; out[offset + 1] = high;
}

function clearance(a: Solid, b: Solid): number | Refused {
  if (a.kind === "box" && b.kind === "box") {
    const axes = [...a.axes, ...b.axes];
    for (const u of a.axes) for (const v of b.axes) {
      const c = cross(u, v), n = length(c);
      if (n > 1e-9) axes.push(scale(c, 1 / n));
    }
    const reach = (box: Box, axis: Vec3) => box.axes.reduce((s, edge, i) => s + Math.abs(dot(edge, axis)) * box.half[i]!, 0);
    return Math.max(...axes.map(axis => Math.abs(dot(sub(a.centre, b.centre), axis)) - reach(a, axis) - reach(b, axis)));
  }
  if (a.kind === "hull" || b.kind === "hull") {
    if (a.kind === "capsule" && b.kind === "hull") return segmentHull(a.from, a.to, b) - a.radius;
    if (b.kind === "capsule") return clearance(b, a);
    const x = a.kind === "box" ? boxHull(a) : a as Hull, y = b.kind === "box" ? boxHull(b) : b as Hull;
    if (isRefused(x)) return x;
    if (isRefused(y)) return y;
    let best = -Infinity;
    const projections = new Float64Array(4);
    const separated = (axis: Vec3): boolean => {
      projectHull(x, axis, projections, 0); projectHull(y, axis, projections, 2);
      best = Math.max(best, projections[0]! - projections[3]!, projections[2]! - projections[1]!);
      return best > 0;
    };
    for (const plane of [...x.planes, ...y.planes]) if (separated(plane.normal)) return best;
    for (const u of x.edges) for (const v of y.edges) {
      const c = cross(u, v), n = length(c);
      if (n > 1e-9 * length(u) * length(v) && separated(scale(c, 1 / n))) return best;
    }
    return best;
  }
  if (a.kind === "box") return clearance(b, a);
  if (b.kind === "box") return least(t => {
    const d = sub(along(a, t), b.centre), distance = b.axes.map((axis, i) => Math.max(0, Math.abs(dot(d, axis)) - b.half[i]!));
    return Math.sqrt(distance.reduce((s, v) => s + v * v, 0));
  }) - a.radius;
  const ab = sub(b.to, b.from), span = dot(ab, ab);
  return least(t => {
    const p = along(a, t), k = span === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, b.from), ab) / span));
    return length(sub(p, add(b.from, scale(ab, k))));
  }) - a.radius - b.radius;
}

/** A declared collider's geometry in the body's reference frame, independent of contact admission. */
export const shapeGeometry = (segment: SegmentSpec, shape: ShapeSpec): Solid | Refused => solid({ ...segment, shape });

/** Geometry carried rigidly from its reference origin to an observed pose. */
export function poseGeometry(shape: Solid, frame: SegmentFrame, at: Vec3, turn: readonly [number, number, number, number]): Solid {
  const q = new Quaternion(...turn), work = new Vector3();
  const carried = (p: Vec3): void => { work.set(dot(p, frame.x), dot(p, frame.y), dot(p, frame.z)).applyRotationQuaternionToRef(q, work); };
  const point = (p: Vec3): Vec3 => {
    carried(sub(p, frame.origin));
    return [at[0] + work.x, at[1] + work.y, at[2] + work.z];
  };
  const direction = (p: Vec3): Vec3 => {
    carried(p);
    return [work.x, work.y, work.z];
  };
  switch (shape.kind) {
    case "capsule": return { ...shape, from: point(shape.from), to: point(shape.to) };
    case "box": return { ...shape, centre: point(shape.centre), axes: shape.axes.map(direction) };
    case "hull": { const points = shape.points.map(point); return { ...shape, points, coordinates: Float64Array.from(points.flat()),
      faces: shape.faces.map(face => face.map(point) as [Vec3, Vec3, Vec3]), edges: shape.edges.map(direction),
      planes: shape.planes.map(plane => {
        const normal = direction(plane.normal), onPlane = point(scale(plane.normal, plane.offset));
        return { normal, offset: dot(normal, onPlane) };
      }) }; }
    default: { const never: never = shape; throw new Error(`unknown geometric shape ${String(never)}`); }
  }
}

/** Signed geometric separation, including filtered pairs; negative means penetration. */
export const geometricClearance = (a: Solid, b: Solid): number | Refused =>
  a.kind === "capsule" && b.kind === "capsule" ? segmentDistance(a.from, a.to, b.from, b.to) - a.radius - b.radius : clearance(a, b);

/** Nonadjacent collision shapes that intersect in the reference pose, before any solver can move them. */
export function bodyIntersections(spec: BodySpec): readonly string[] {
  const parents = new Map(spec.joints.map(j => [j.child, j.parent])), faults: string[] = [];
  const shapes: Solid[][] = [];
  for (const segment of spec.segments) {
    const own: Solid[] = [];
    for (const shape of new Set([segment.shape, ...Object.values(segment.configurations?.shapes ?? {}), ...(segment.contacts ?? []).map(c => c.shape)])) {
      const made = solid({ ...segment, shape });
      if (isRefused(made)) return [`${segment.name}: ${made.refused}`];
      own.push(made);
    }
    shapes.push(own);
  }
  for (let i = 0; i < spec.segments.length; i++) for (let j = i + 1; j < spec.segments.length; j++) {
    const a = spec.segments[i]!, b = spec.segments[j]!;
    if (parents.get(a.name) === b.name || parents.get(b.name) === a.name) continue;
    let intersects = false;
    for (const x of shapes[i]!) {
      for (const y of shapes[j]!) {
        const gap = clearance(x, y);
        if (isRefused(gap)) return [`${a.name}/${b.name}: ${gap.refused}`];
        if (gap < -1e-9) { intersects = true; break; }
      }
      if (intersects) break;
    }
    if (intersects) faults.push(`${a.name} intersects ${b.name}`);
  }
  return faults;
}
