import { Vector3 } from "../../../core/math/vector.ts";
import type { BodyView } from "../../../control/body.ts";
import { chainTo, pointAtToRef, specChainTo, type Frame } from "../../../control/kinematics.ts";
import { lowsOf } from "../../../control/ground.ts";
import type { JointKinematics, ReadBody, ReadJoint, ReadSegment } from "../../../core/bodies/read-body.ts";
import { segmentOf, type BodySpec, type SegmentSpec } from "../../../core/bodies/spec/body.ts";
import type { Vec3 } from "../../../core/bodies/spec/quantity.ts";

/** **A tooth**: its contact region's name and its tip, the point of its hull furthest along the way it pierces, body frame, reference pose. */
export interface Tooth { readonly name: string; readonly tip: Vec3 }

/** The teeth of `jaw`: each of its contact regions that pierces (`mechanism` "point") with a hull, and its tip (`Tooth`). */
function teethOf(jaw: SegmentSpec): readonly Tooth[] {
  return (jaw.contacts ?? []).flatMap((contact) => {
    if (contact.surface.directed?.mechanism !== "point" || contact.shape.kind !== "hull") return [];
    const direction = contact.surface.directed.direction.value;
    const projection = (point: Vec3) => point[0] * direction[0] + point[1] * direction[1] + point[2] * direction[2];
    const tip = contact.shape.points.reduce((best, point) => projection(point.value) > projection(best.value) ? point : best).value;
    return [{ name: contact.name, tip }];
  });
}

/**
 * **A body's jaw** as its spec has it: the segment with a `bite` point (`jaw`), the joint it hinges
 * on (`hinge`, its first freedom the jaw's opening), the head that hinge hangs it from, which has a
 * `mouth` point, the head's mouth and the jaw's teeth (`Tooth`), and how its first tooth pierces
 * (`piercing`: the way, in the jaw's frame, and the least alignment with a surface's inward normal).
 */
export interface Jaw {
  readonly jaw: SegmentSpec;
  readonly hinge: JointKinematics;
  readonly head: SegmentSpec;
  readonly mouth: Vec3;
  readonly teeth: readonly Tooth[];
  readonly piercing: { readonly direction: Vec3; readonly alignment: number };
}

/** The jaw of `spec` (`Jaw`); a thrown error for a body with none, which a part refuses first (`fitsJaw`). */
export function jawOf(spec: BodySpec): Jaw {
  const jaw = spec.segments.find((segment) => segment.points?.bite), hinge = jaw && specChainTo(spec, jaw.name).at(-1);
  const head = hinge && segmentOf(spec, hinge.spec.parent), mouth = head?.points?.mouth?.value;
  const pierces = jaw?.contacts?.find((contact) => contact.surface.directed?.mechanism === "point")?.surface.directed;
  if (!jaw || !hinge || !head || !mouth || !pierces) throw new Error(`${spec.model} has no jaw with teeth hinged to a head with a mouth`);
  return { jaw, hinge, head, mouth, teeth: teethOf(jaw), piercing: { direction: pierces.direction.value, alignment: pierces.alignment.value } };
}

/**
 * The jaw of a built body and what it hangs from: the segment with a `bite` point (`lower`), its
 * joint (`hinge`), the head the hinge hangs it from, which has a `mouth` point, the joint that
 * carries the head (`neck`), and its teeth (`Tooth`).
 */
export function mouthOf(built: ReadBody): { readonly lower: ReadSegment; readonly hinge: ReadJoint; readonly head: ReadSegment; readonly neck: ReadJoint; readonly teeth: readonly Tooth[] } {
  const lower = [...built.segments.values()].find((segment) => segment.spec.points?.bite);
  const hinge = lower && chainTo(built, lower).at(-1), head = hinge?.parent, neck = head && chainTo(built, head).at(-1);
  if (!lower || !hinge || !head?.spec.points?.mouth || !neck) throw new Error(`${built.spec.model} has no jaw hinged to a head with a mouth`);
  return { lower, hinge, head, neck, teeth: teethOf(lower.spec) };
}

/** The jaw's physical clearance witnesses in the head's reference frame at the gape `angle`. */
export function gapePoints(lower: ReadSegment, hinge: JointKinematics, angle: number): readonly { readonly at: Vec3; readonly radius: number }[] {
  return lowsOf(lower.spec.shape, lower.frame).map((low) => {
    const point = pointAtToRef([hinge], [[angle]], low.at, new Vector3());
    return { at: [point.x, point.y, point.z] as Vec3, radius: low.radius };
  });
}

const scratch = { mouth: new Vector3(), offset: new Vector3() };

/**
 * **The head's frame in the world** as `view` sees it, into `out`: its turn, and where the body
 * frame's origin would be carried rigidly with it, so a point of the head or of the jaw at a gape
 * (`pointAtToRef` over its hinge), body frame and reference pose, is turned by it and added to it.
 */
export function headFrameToRef(view: BodyView, jaw: Jaw, out: Frame): Frame {
  const head = view.effectors[jaw.head.name];
  if (!head?.points.mouth) throw new Error(`${jaw.head.name} is no effector with a mouth`);
  view.root.rotation.multiplyToRef(head.rotation, out.rotation).normalize();
  const mouth = scratch.mouth.copyFrom(head.points.mouth).applyRotationQuaternionToRef(view.root.rotation, scratch.mouth).addInPlace(view.root.position);
  scratch.offset.set(jaw.mouth[0], jaw.mouth[1], jaw.mouth[2]).applyRotationQuaternionToRef(out.rotation, scratch.offset);
  out.position.copyFrom(mouth).subtractInPlace(scratch.offset);
  return out;
}

/** The world point of the mouth `view` sees, into `out`. */
export function mouthToRef(view: BodyView, jaw: Jaw, out: Vector3): Vector3 {
  const head = view.effectors[jaw.head.name];
  if (!head?.points.mouth) throw new Error(`${jaw.head.name} is no effector with a mouth`);
  return out.copyFrom(head.points.mouth).applyRotationQuaternionToRef(view.root.rotation, out).addInPlace(view.root.position);
}
