import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { rigidOf, rigidPoints } from "../build/rigid.ts";
import { frameOf, type BodySpec, type SegmentSpec, type ShapeSpec, segmentOf } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { add, scale, sub } from "../spec/vec.ts";

type Point = { readonly x: number; readonly y: number; readonly z: number };
type Turn = Point & { readonly w: number };

type Sight = {
  readonly stance: { readonly centre: { readonly x: number; readonly z: number } };
  readonly root?: { readonly position: Point; readonly rotation: Turn };
  readonly effectors?: Readonly<Record<string, { readonly points: Readonly<Record<string, Point>>; readonly rotation: Turn }>>;
};

/** Collider support points in the body's reference frame; round shapes retain their full radius. */
function supportOf(shape: ShapeSpec, segment: SegmentSpec): { readonly points: readonly Vec3[]; readonly radius: number } {
  switch (shape.kind) {
    case "sphere": return { points: [shape.centre.value], radius: shape.radius.value };
    case "capsule": return { points: [shape.from.value, shape.to.value], radius: shape.radius.value };
    case "hull": return { points: shape.points.map(point => point.value), radius: 0 };
    case "box": {
      const frame = frameOf(segment), points: Vec3[] = [];
      for (const x of [-1 / 2, 1 / 2]) for (const y of [-1 / 2, 1 / 2]) for (const z of [-1 / 2, 1 / 2])
        points.push(add(shape.centre.value, add(scale(frame.x, x * shape.size.value[0]), add(scale(frame.y, y * shape.size.value[1]), scale(frame.z, z * shape.size.value[2])))));
      return { points, radius: 0 };
    }
    default: { const never: never = shape; throw new Error(`unknown collider ${never}`); }
  }
}

/**
 * Current world-horizontal radius about the observed centre of mass for the rigid segments
 * carrying equipment. Their complete colliders include hand envelopes and item contact regions.
 * Named points anchor each observed segment; they do not substitute for its physical extent.
 */
export function heldClearance(spec: BodySpec): (view: Sight) => number {
  const names = new Set((spec.held ?? []).map(held => held.segment));
  const carriers = [...names].map(name => {
    const segment = segmentOf(spec, name);
    const effector = spec.effectors?.find(effector => effector.segment === name);
    if (!segment || !effector) throw new Error(`${spec.model}: held clearance needs an observed effector for ${name}`);
    const anchor = rigidPoints(spec, segment).get(effector.point)?.value;
    if (!anchor) throw new Error(`${spec.model}: held clearance needs ${name}'s point ${effector.point}`);
    return { name, anchor: effector.point, shapes: rigidOf(spec, segment).shapes.map(shape => {
      const support = supportOf(shape, segment);
      return { radius: support.radius, offsets: support.points.map(point => sub(point, anchor)) };
    }) };
  });
  const at = new Vector3(), segmentTurn = new Quaternion(), rootTurn = new Quaternion();
  return view => {
    let radius = 0;
    for (const carrier of carriers) {
      const root = view.root, observed = view.effectors?.[carrier.name], anchor = observed?.points[carrier.anchor];
      if (!root || !observed || !anchor) throw new Error(`${spec.model}: held clearance has no current observation for ${carrier.name}`);
      segmentTurn.copyFromFloats(observed.rotation.x, observed.rotation.y, observed.rotation.z, observed.rotation.w);
      rootTurn.copyFromFloats(root.rotation.x, root.rotation.y, root.rotation.z, root.rotation.w);
      for (const shape of carrier.shapes) for (const offset of shape.offsets) {
        at.set(offset[0], offset[1], offset[2]).applyRotationQuaternionToRef(segmentTurn, at).addInPlaceFromFloats(anchor.x, anchor.y, anchor.z);
        at.applyRotationQuaternionToRef(rootTurn, at).addInPlaceFromFloats(root.position.x, root.position.y, root.position.z);
        const dx = at.x - view.stance.centre.x, dz = at.z - view.stance.centre.z;
        radius = Math.max(radius, Math.sqrt(dx * dx + dz * dz) + shape.radius);
      }
    }
    return radius;
  };
}
