import { Quaternion, Vector3 } from "../math/vector.ts";
import { rigidOf, rigidPoints } from "../build/rigid.ts";
import { frameOf, type BodySpec, type SegmentSpec, type ShapeSpec, segmentOf } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { add, scale, sub } from "../spec/vec.ts";
import { bodyClearance } from "./sensed-bounds.ts";

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

/**
 * **How far ahead of its centre of mass a body stands out along a ground direction**, m, as it
 * stands now: the farthest of its limbs' ends (each effector's segment, its own colliders, what it
 * holds left out), no less than its trunk's clearance (`bodyClearance`).
 */
export function bodyAhead(spec: BodySpec): (view: Sight, ax: number, az: number) => number {
  const trunk = bodyClearance(spec);
  const limbs = (spec.effectors ?? []).map(effector => {
    const segment = segmentOf(spec, effector.segment);
    const anchor = segment && rigidPoints(spec, segment).get(effector.point)?.value;
    if (!segment || !anchor) throw new Error(`${spec.model}: a limb's end needs its segment and its point ${effector.point}`);
    const rigid = rigidOf(spec, segment), offsets: number[] = [], radii: number[] = [];
    rigid.shapes.forEach((shape, index) => {
      const owner = rigid.owners[index]!.kind;
      if (owner !== "segment" && owner !== "region") return;
      const support = supportOf(shape, segment);
      for (const point of support.points) { offsets.push(...sub(point, anchor)); radii.push(support.radius); }
    });
    return { name: effector.segment, anchor: effector.point, offsets: Float64Array.from(offsets), radii: Float64Array.from(radii) };
  });
  return (view, ax, az) => {
    let ahead = trunk;
    const root = view.root;
    if (!root) return ahead;
    const r = root.rotation, cx = view.stance.centre.x, cz = view.stance.centre.z;
    for (const limb of limbs) {
      const observed = view.effectors?.[limb.name], anchor = observed?.points[limb.anchor];
      if (!observed || !anchor) continue;
      const q = observed.rotation;
      for (let n = 0; n < limb.radii.length; n++) {
        const vx = limb.offsets[3 * n]!, vy = limb.offsets[3 * n + 1]!, vz = limb.offsets[3 * n + 2]!;
        // Turned by the limb's quaternion, then by the root's: v + w t + q × t, t = 2 q × v.
        let tx = 2 * (q.y * vz - q.z * vy), ty = 2 * (q.z * vx - q.x * vz), tz = 2 * (q.x * vy - q.y * vx);
        const sx = vx + q.w * tx + (q.y * tz - q.z * ty) + anchor.x, sy = vy + q.w * ty + (q.z * tx - q.x * tz) + anchor.y,
          sz = vz + q.w * tz + (q.x * ty - q.y * tx) + anchor.z;
        tx = 2 * (r.y * sz - r.z * sy); ty = 2 * (r.z * sx - r.x * sz); tz = 2 * (r.x * sy - r.y * sx);
        const wx = sx + r.w * tx + (r.y * tz - r.z * ty) + root.position.x, wz = sz + r.w * tz + (r.x * ty - r.y * tx) + root.position.z;
        ahead = Math.max(ahead, (wx - cx) * ax + (wz - cz) * az + limb.radii[n]!);
      }
    }
    return ahead;
  };
}
