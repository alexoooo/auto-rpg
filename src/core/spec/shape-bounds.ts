import { frameOf, type SegmentSpec, type ShapeSpec } from "./body.ts";
import type { Vec3 } from "./quantity.ts";
import { add, dot, scale, sub } from "./vec.ts";

/** Collision bounds in the body's reference frame, or the segment's own frame. */
export function shapeBounds(segment: SegmentSpec, local = false, shape: ShapeSpec = segment.shape): { min: Vec3; max: Vec3 } {
  const frame = frameOf(segment);
  const point = (p: Vec3): Vec3 => {
    if (!local) return p;
    const d = sub(p, frame.origin);
    return [dot(d, frame.x), dot(d, frame.y), dot(d, frame.z)];
  };
  let points: Vec3[], radius = 0;
  switch (shape.kind) {
    case "capsule": points = [point(shape.from.value), point(shape.to.value)]; radius = shape.radius.value; break;
    case "sphere": points = [point(shape.centre.value)]; radius = shape.radius.value; break;
    case "hull": points = shape.points.map(p => point(p.value)); break;
    case "box": {
      points = [];
      const axes = [frame.x, frame.y, frame.z];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
        points.push(point([x, y, z].reduce<Vec3>((p, sign, i) => add(p, scale(axes[i]!, sign * shape.size.value[i]! / 2)), shape.centre.value)));
      }
      break;
    }
    default: { const never: never = shape; throw new Error(`unknown shape ${String(never)}`); }
  }
  return {
    min: [0, 1, 2].map(i => Math.min(...points.map(p => p[i]!)) - radius) as unknown as Vec3,
    max: [0, 1, 2].map(i => Math.max(...points.map(p => p[i]!)) + radius) as unknown as Vec3,
  };
}
