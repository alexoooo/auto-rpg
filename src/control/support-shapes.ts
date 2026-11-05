import { configurationShapeAt, type BodySpec, type SegmentSpec, type ShapeSpec } from "../core/bodies/spec/body.ts";
import type { Vec3 } from "../core/bodies/spec/quantity.ts";

const samePoint = (a: Vec3, b: Vec3): boolean => a.every((value, i) => value === b[i]);

/** Numeric collider geometry, independent of its quantities' provenance. */
function sameShape(a: ShapeSpec, b: ShapeSpec): boolean {
  switch (a.kind) {
    case "sphere": return b.kind === "sphere" && samePoint(a.centre.value, b.centre.value) && a.radius.value === b.radius.value;
    case "box": return b.kind === "box" && samePoint(a.centre.value, b.centre.value) && samePoint(a.size.value, b.size.value);
    case "capsule": return b.kind === "capsule" && a.radius.value === b.radius.value
      && (samePoint(a.from.value, b.from.value) && samePoint(a.to.value, b.to.value) || samePoint(a.from.value, b.to.value) && samePoint(a.to.value, b.from.value));
    case "hull": return b.kind === "hull" && a.points.length === b.points.length
      && a.points.every(point => b.points.some(other => samePoint(point.value, other.value)));
    default: { const never: never = a; throw new Error(`unknown support shape ${never}`); }
  }
}

/** A cached support reader assumes its segment's base geometry in every reachable configuration. */
export function supportConfigurationRefusal(spec: BodySpec, segments: readonly SegmentSpec[]): string | null {
  for (const segment of segments) for (const name of Object.keys(segment.configurations?.shapes ?? {}))
    if (!sameShape(segment.shape, configurationShapeAt(spec, segment, name))) return `${spec.model}: support ${segment.name} changes collider geometry; this support controller requires fixed support shapes`;
  return null;
}
