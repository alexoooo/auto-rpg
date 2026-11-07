import { Quaternion, Vector3 } from "../math/vector.ts";
import { attachment, type ReadBody, type ReadSegment } from "./read-body.ts";
import type { Vec3 } from "../quantity.ts";

const scratch = { a: new Quaternion(), b: new Quaternion() };

/** `segment`'s turn since its reference pose, rotation times rest^-1. */
export function turnOfToRef(segment: ReadSegment, out: Quaternion): Quaternion {
  Quaternion.InverseToRef(segment.rest, scratch.a);
  return segment.pose.rotation.multiplyToRef(scratch.a, out);
}

/** `point` (body frame, reference pose, on `segment`) where it is now, world. */
export function pointOfToRef(segment: ReadSegment, point: Vec3, out: Vector3): Vector3 {
  const origin = segment.frame.origin;
  return out.set(point[0] - origin[0], point[1] - origin[1], point[2] - origin[2])
    .applyRotationQuaternionToRef(turnOfToRef(segment, scratch.b), out).addInPlace(segment.pose.position);
}

export const centreOfToRef = (segment: ReadSegment, out: Vector3): Vector3 => pointOfToRef(segment, segment.rigid.centre, out);

/** The mass of `parts`, kg: their rigid bodies' masses summed in order. */
export const massOf = (parts: readonly ReadSegment[]): number => parts.reduce((sum, part) => sum + part.rigid.mass, 0);

/** A body's parts on it (`attachment`), in its segments' order, and their mass, kg (`massOf`). */
export interface Parts { readonly segments: readonly ReadSegment[]; readonly mass: number }

/**
 * **The parts on `body` now** (`Parts`), as a reading made once a reader: each call reads its
 * joints, and finds the parts again only where one has been released or restored since the last;
 * a whole body's parts are all its segments, its mass theirs.
 */
export function partsOn(body: Pick<ReadBody, "segments" | "joints">): () => Parts {
  const on = attachment(body), all = [...body.segments.values()], joints = [...body.joints.values()];
  const attached = new Uint8Array(joints.length).fill(1);
  let parts: Parts = { segments: all, mass: massOf(all) };
  return () => {
    let moved = false;
    for (let j = 0; j < joints.length; j++) {
      const now = joints[j]!.attached() ? 1 : 0;
      if (now !== attached[j]) { attached[j] = now; moved = true; }
    }
    if (moved) { const segments = all.filter(on); parts = { segments, mass: massOf(segments) }; }
    return parts;
  };
}

/**
 * The centre of mass of `parts`, whose masses sum to `mass` (`massOf`), into `centre`, and its
 * velocity into `velocity` when asked (a body's linear velocity is its centre of mass's); `work`
 * carries nothing between calls.
 */
export function massCentreToRef(parts: readonly ReadSegment[], mass: number, centre: Vector3, work: Vector3, velocity?: Vector3): void {
  centre.setAll(0); velocity?.setAll(0);
  for (const part of parts) {
    centre.addInPlace(centreOfToRef(part, work).scaleInPlace(part.rigid.mass));
    if (velocity) velocity.addInPlace(part.body.linearVelocityToRef(work).scaleInPlace(part.rigid.mass));
  }
  centre.scaleInPlace(1 / mass); velocity?.scaleInPlace(1 / mass);
}

/**
 * The angular momentum of `parts` about their centre of mass `centre`, moving at `velocity`
 * (`massCentreToRef`), kg m^2/s, into `out`: each part's mass at its own centre's offset from
 * `centre` and motion relative to `velocity`, and its inertia about its own centre, as it is turned
 * now (`Rigid.tensor`, in the segment frame), times its spin. `offset`, `motion`, `local` and
 * `turn` carry nothing between calls.
 */
export function angularMomentumToRef(parts: readonly ReadSegment[], centre: Vector3, velocity: Vector3, out: Vector3,
  offset: Vector3, motion: Vector3, local: Vector3, turn: Quaternion): void {
  out.setAll(0);
  for (const part of parts) {
    const { mass, tensor: T } = part.rigid, rotation = part.pose.rotation;
    centreOfToRef(part, offset).subtractInPlace(centre);
    part.body.linearVelocityToRef(motion).subtractInPlace(velocity).scaleInPlace(mass);
    out.addInPlace(Vector3.CrossToRef(offset, motion, local));
    // I w: the spin on the segment's own axes, the tensor's product with it there, back to the world.
    part.body.angularVelocityToRef(motion);
    Quaternion.InverseToRef(rotation, turn);
    motion.applyRotationQuaternionToRef(turn, local);
    const { x, y, z } = local;
    local.set(T[0] * x + T[3] * y + T[4] * z, T[3] * x + T[1] * y + T[5] * z, T[4] * x + T[5] * y + T[2] * z);
    out.addInPlace(local.applyRotationQuaternionToRef(rotation, motion));
  }
}

/** `segment`'s point `at` (world): its velocity into `linear`, and the segment's spin into `angular`. */
export function motionAtToRef(segment: ReadSegment, at: Vector3, linear: Vector3, angular: Vector3): void {
  const body = segment.body, c = centreOfToRef(segment, new Vector3());
  body.linearVelocityToRef(linear);
  body.angularVelocityToRef(angular);
  linear.addInPlace(Vector3.Cross(angular, at.subtract(c)));
}
