import type { Vec3 } from "./quantity.ts";
import { cross, dot, length, scale, sub } from "./vec.ts";

/**
 * **The convex hull of a set of points**, for a collision shape that follows a surface (a trunk
 * segment's is the hull of the clothed vertices its bones weigh most on). Pure arithmetic on plain
 * points, so the measuring script, the tests and the lab's view read the same hull.
 *
 * Built incrementally: a tetrahedron of four far-apart points, then each point in turn replaces the
 * faces it lies outside of by a fan from their horizon to it. A point within the tolerance of a
 * face's plane is taken to be on it. A point taken in before the corners around it can stay a vertex
 * lying in a face or an edge; such a vertex's faces turn about fewer than three directions, so it
 * is dropped and the hull built again, until every vertex is a corner.
 */
interface Hull {
  /** Indices into the points of the hull's corners, ascending. */
  readonly vertices: readonly number[];
  /** Triangles of point indices, counter-clockwise seen from outside. */
  readonly faces: readonly (readonly [number, number, number])[];
  /** Each face's outward unit normal and its plane's offset: a point `p` is outside when `dot(normal, p) > offset`. */
  readonly planes: readonly { readonly normal: Vec3; readonly offset: number }[];
}

/**
 * Floating-point slack, as a fraction of the points' extent: how far outside a face's plane a
 * point must be to count as outside it. It stands for rounding, not for any size of a body.
 */
const HULL_TOLERANCE = 1e-9;

export function convexHull(points: readonly Vec3[]): Hull {
  let kept = points.map((_, i) => i);
  for (;;) {
    const hull = incremental(kept.map((i) => points[i]!));
    const corners = hull.vertices.filter((v) => isCorner(hull, v));
    if (corners.length === hull.vertices.length) {
      const back = (i: number) => kept[i]!;
      return {
        vertices: hull.vertices.map(back),
        faces: hull.faces.map(([u, v, w]) => [back(u), back(v), back(w)] as const),
        planes: hull.planes,
      };
    }
    kept = corners.map((i) => kept[i]!);
  }
}

/** Whether the faces at `vertex` turn about three independent directions: a corner, not a point in a face or an edge. */
function isCorner(hull: Hull, vertex: number): boolean {
  const normals = hull.faces.flatMap((f, i) => (f.includes(vertex) ? [hull.planes[i]!.normal] : []));
  for (let i = 0; i < normals.length; i++) for (let j = i + 1; j < normals.length; j++) {
    const across = cross(normals[i]!, normals[j]!);
    for (let k = j + 1; k < normals.length; k++) if (Math.abs(dot(across, normals[k]!)) > HULL_TOLERANCE) return true;
  }
  return false;
}

function incremental(points: readonly Vec3[]): Hull {
  if (points.length < 4) throw new Error(`a hull needs four points, not ${points.length}`);
  const extent = Math.max(...[0, 1, 2].map((axis) =>
    Math.max(...points.map((p) => p[axis]!)) - Math.min(...points.map((p) => p[axis]!))));
  const tolerance = HULL_TOLERANCE * extent;

  // The first tetrahedron: the least x, the point farthest from it, the one farthest from their
  // line, and the one farthest from their plane.
  const farthest = (score: (p: Vec3) => number) =>
    points.reduce((best, p, i) => (score(p) > score(points[best]!) ? i : best), 0);
  const a = points.reduce((best, p, i) => (p[0] < points[best]![0] ? i : best), 0);
  const b = farthest((p) => length(sub(p, points[a]!)));
  const ab = sub(points[b]!, points[a]!);
  const c = farthest((p) => length(cross(ab, sub(p, points[a]!))));
  const across = cross(ab, sub(points[c]!, points[a]!));
  const d = farthest((p) => Math.abs(dot(across, sub(p, points[a]!))));
  if (!(Math.abs(dot(across, sub(points[d]!, points[a]!))) > tolerance * length(across))) {
    throw new Error("the points lie in a plane and bound no volume");
  }

  interface Face { readonly corners: readonly [number, number, number]; readonly normal: Vec3; readonly offset: number; alive: boolean }
  const faces: Face[] = [];
  const edges = new Map<string, Face>();
  const key = (u: number, v: number) => `${u},${v}`;
  const addFace = (u: number, v: number, w: number): void => {
    const n = cross(sub(points[v]!, points[u]!), sub(points[w]!, points[u]!));
    const normal = scale(n, 1 / length(n));
    const face: Face = { corners: [u, v, w], normal, offset: dot(normal, points[u]!), alive: true };
    faces.push(face);
    edges.set(key(u, v), face); edges.set(key(v, w), face); edges.set(key(w, u), face);
  };
  // Wound so each normal points away from the fourth corner.
  const inside = scale([0, 1, 2].map((i) => points[a]![i]! + points[b]![i]! + points[c]![i]! + points[d]![i]!) as unknown as Vec3, 1 / 4);
  for (const [u, v, w] of [[a, b, c], [a, c, d], [a, d, b], [b, d, c]] as const) {
    const n = cross(sub(points[v]!, points[u]!), sub(points[w]!, points[u]!));
    if (dot(n, sub(inside, points[u]!)) < 0) addFace(u, v, w); else addFace(u, w, v);
  }

  const seed = new Set([a, b, c, d]);
  points.forEach((p, i) => {
    if (seed.has(i)) return;
    const visible = faces.filter((f) => f.alive && dot(f.normal, p) - f.offset > tolerance);
    if (!visible.length) return;
    const lit = new Set(visible);
    // The horizon: edges of a lit face whose other side is dark, kept in the lit face's winding.
    const horizon: [number, number][] = [];
    for (const f of visible) {
      const [u, v, w] = f.corners;
      for (const [s, t] of [[u, v], [v, w], [w, u]] as const) if (!lit.has(edges.get(key(t, s))!)) horizon.push([s, t]);
    }
    for (const f of visible) {
      f.alive = false;
      const [u, v, w] = f.corners;
      for (const [s, t] of [[u, v], [v, w], [w, u]] as const) if (edges.get(key(s, t)) === f) edges.delete(key(s, t));
    }
    for (const [s, t] of horizon) addFace(s, t, i);
  });

  const alive = faces.filter((f) => f.alive);
  return {
    vertices: [...new Set(alive.flatMap((f) => f.corners))].sort((x, y) => x - y),
    faces: alive.map((f) => f.corners),
    planes: alive.map((f) => ({ normal: f.normal, offset: f.offset })),
  };
}
