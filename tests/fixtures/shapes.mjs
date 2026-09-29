/**
 * Clearance between a spec's collision shapes, measured geometrically (H55, H57): a collision
 * layer that forbids a pair also hides whether it has room, so a spec's shapes are measured before
 * any engine sees them.
 *
 * Every distance here is between convex sets. The distance from a point moving along a line to a
 * convex set is convex in where the point is, so a capsule's nearest approach is found by ternary
 * search along its axis. Two boxes are separated by the largest gap along any of their fifteen
 * separating axes, which is a lower bound on their distance.
 */
import { frameOf } from "../../src/core/spec/body.ts";
import { add, cross, dot, length, scale, sub } from "../../src/core/spec/vec.ts";

/** A shape as the measures below take it: a capsule (a sphere is one of length zero) or a box. */
export function solid(segment) {
  const shape = segment.shape;
  switch (shape.kind) {
    case "capsule": return { kind: "capsule", from: shape.from.value, to: shape.to.value, radius: shape.radius.value };
    case "sphere": return { kind: "capsule", from: shape.centre.value, to: shape.centre.value, radius: shape.radius.value };
    case "box": {
      const frame = frameOf(segment);
      return { kind: "box", centre: shape.centre.value, axes: [frame.x, frame.y, frame.z], half: shape.size.value.map((s) => s / 2) };
    }
    default: throw new Error(`unknown shape ${shape.kind}`);
  }
}

function pointToSegment(p, a, b) {
  const ab = sub(b, a);
  const span = dot(ab, ab);
  const t = span === 0 ? 0 : Math.min(1, Math.max(0, dot(sub(p, a), ab) / span));
  return length(sub(p, add(a, scale(ab, t))));
}

function pointToBox(p, box) {
  const d = sub(p, box.centre);
  return Math.hypot(...box.axes.map((axis, i) => Math.max(0, Math.abs(dot(d, axis)) - box.half[i])));
}

/** The least of a convex function of s in [0, 1]. */
function least(f) {
  let low = 0, high = 1;
  for (let i = 0; i < 200; i++) {
    const a = low + (high - low) / 3, b = high - (high - low) / 3;
    if (f(a) <= f(b)) high = b; else low = a;
  }
  return f((low + high) / 2);
}

const along = (capsule) => (s) => add(capsule.from, scale(sub(capsule.to, capsule.from), s));

function boxGap(a, b) {
  const axes = [...a.axes, ...b.axes];
  for (const u of a.axes) for (const v of b.axes) {
    const c = cross(u, v);
    if (length(c) > 1e-9) axes.push(scale(c, 1 / length(c)));
  }
  const span = (box, axis) => {
    const centre = dot(box.centre, axis);
    const reach = box.axes.reduce((sum, edge, i) => sum + Math.abs(dot(edge, axis)) * box.half[i], 0);
    return [centre - reach, centre + reach];
  };
  return Math.max(...axes.map((axis) => {
    const [a0, a1] = span(a, axis), [b0, b1] = span(b, axis);
    return Math.max(b0 - a1, a0 - b1);
  }));
}

/**
 * The room between two shapes: their distance, negative when they overlap. For two boxes it is
 * a lower bound, exact when the boxes are separated along a face normal.
 */
export function clearance(a, b) {
  if (a.kind === "box" && b.kind === "box") return boxGap(a, b);
  if (a.kind === "box") return clearance(b, a);
  const p = along(a);
  if (b.kind === "box") return least((s) => pointToBox(p(s), b)) - a.radius;
  return least((s) => pointToSegment(p(s), b.from, b.to)) - a.radius - b.radius;
}

/** The lowest point of a shape. */
export function lowest(shape) {
  if (shape.kind === "capsule") return Math.min(shape.from[1], shape.to[1]) - shape.radius;
  return shape.centre[1] - shape.axes.reduce((sum, edge, i) => sum + Math.abs(edge[1]) * shape.half[i], 0);
}
