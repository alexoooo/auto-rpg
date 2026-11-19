import { frameOf, localPoint, type SegmentFrame, type SegmentSpec, type ShapeSpec } from "./body.ts";
import type { Vec3 } from "../../quantity.ts";
import { scale } from "./vec.ts";
import { boxCorners } from "./geometry.ts";

interface Bounds { readonly min: Vec3; readonly max: Vec3 }

/** `shape`'s collision bounds, as `segment` carries it, in the body's reference frame. */
export const shapeBounds = (segment: SegmentSpec, shape: ShapeSpec): Bounds => bounds(frameOf(segment), shape, (p) => p);

/** `shape`'s collision bounds, as `segment` carries it, in the segment's own frame (`localPoint`). */
export function localShapeBounds(segment: SegmentSpec, shape: ShapeSpec): Bounds {
  const frame = frameOf(segment);
  return bounds(frame, shape, (p) => localPoint(frame, p));
}

/** The bounds of `shape`'s points taken by `point`, a box's edges along `frame`. */
function bounds(frame: SegmentFrame, shape: ShapeSpec, point: (p: Vec3) => Vec3): Bounds {
  let points: Vec3[], radius = 0;
  switch (shape.kind) {
    case "capsule": points = [point(shape.from.value), point(shape.to.value)]; radius = shape.radius.value; break;
    case "sphere": points = [point(shape.centre.value)]; radius = shape.radius.value; break;
    case "hull": points = shape.points.map(p => point(p.value)); break;
    case "box": points = boxCorners(shape.centre.value, [frame.x, frame.y, frame.z], scale(shape.size.value, .5)).map(point); break;
    default: { const never: never = shape; throw new Error(`unknown shape ${String(never)}`); }
  }
  const low = (k: 0 | 1 | 2) => Math.min(...points.map(p => p[k])) - radius, high = (k: 0 | 1 | 2) => Math.max(...points.map(p => p[k])) + radius;
  return { min: [low(0), low(1), low(2)], max: [high(0), high(1), high(2)] };
}
