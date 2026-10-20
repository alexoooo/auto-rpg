import { frameOf, type BodySpec, type SegmentSpec } from "./body.ts";
import { convexHull } from "./hull.ts";
import { add, cross, dot, length, scale, sub } from "./vec.ts";
import type { Vec3 } from "./quantity.ts";

type Capsule = { kind: "capsule"; from: Vec3; to: Vec3; radius: number };
type Box = { kind: "box"; centre: Vec3; axes: Vec3[]; half: Vec3 };
type Hull = { kind: "hull"; points: Vec3[]; planes: readonly { normal: Vec3; offset: number }[] };
type Solid = Capsule | Box | Hull;

function hull(points: Vec3[]): Hull {
  const { vertices, planes } = convexHull(points);
  return { kind: "hull", points: vertices.map(i => points[i]!), planes };
}

function solid(segment: SegmentSpec): Solid {
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
  return f((low + high) / 2);
}

const along = (a: Capsule, t: number): Vec3 => add(a.from, scale(sub(a.to, a.from), t));
function boxHull(b: Box): Hull {
  const points: Vec3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1])
    points.push([x, y, z].reduce<Vec3>((p, sign, i) => add(p, scale(b.axes[i]!, sign * b.half[i]!)), b.centre));
  return hull(points);
}

function clearance(a: Solid, b: Solid): number {
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
    if (a.kind === "capsule" && b.kind === "hull") return least(t => Math.max(...b.planes.map(p => dot(p.normal, along(a, t)) - p.offset))) - a.radius;
    if (b.kind === "capsule") return clearance(b, a);
    const x = a.kind === "box" ? boxHull(a) : a as Hull, y = b.kind === "box" ? boxHull(b) : b as Hull;
    const gap = (from: Hull, to: Hull) => Math.max(...from.planes.map(p => Math.min(...to.points.map(q => dot(p.normal, q))) - p.offset));
    return Math.max(gap(x, y), gap(y, x));
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

/** Nonadjacent collision shapes that intersect in the reference pose, before any solver can move them. */
export function bodyIntersections(spec: BodySpec): readonly string[] {
  const parents = new Map(spec.joints.map(j => [j.child, j.parent])), faults: string[] = [];
  const shapes = spec.segments.map(segment => [...new Set([segment.shape, ...Object.values(segment.handPoses ?? {}), ...(segment.contacts ?? []).map(c => c.shape)])]
    .map(shape => solid({ ...segment, shape })));
  for (let i = 0; i < spec.segments.length; i++) for (let j = i + 1; j < spec.segments.length; j++) {
    const a = spec.segments[i]!, b = spec.segments[j]!;
    if (parents.get(a.name) === b.name || parents.get(b.name) === a.name) continue;
    if (shapes[i]!.some(x => shapes[j]!.some(y => clearance(x, y) < -1e-9))) faults.push(`${a.name} intersects ${b.name}`);
  }
  return faults;
}
