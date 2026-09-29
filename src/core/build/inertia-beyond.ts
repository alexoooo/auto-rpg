import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Vec3 } from "../spec/quantity.ts";
import type { BuiltBody, BuiltSegment } from "./build-body.ts";

/**
 * **The inertia beyond each joint**: the child and every segment it carries, as one rigid body,
 * about the joint's centre and along each freedom's parent-fixed axis, at the pose as it stands.
 * It is what a torque at the joint turns while the parent is held; with the parent free, less.
 *
 * Each segment adds its own inertia about that axis (the spec's principal moments, which lie along
 * the segment frame, `build-body.ts`) and its mass at its centre's distance from the axis. Poses are
 * read from the nodes (H24).
 */
export interface InertiaBeyond {
  /** By joint, in `built.joints`' order, then by freedom: kg m2. */
  readonly about: readonly (readonly number[])[];
  /** Reads the pose as it stands. */
  update(): void;
}

export function inertiaBeyond(built: BuiltBody): InertiaBeyond {
  const joints = [...built.joints.values()];
  const segments = [...built.segments.values()];
  const index = new Map(segments.map((segment, i) => [segment, i]));
  const carried = (root: BuiltSegment): number[] =>
    [index.get(root)!, ...joints.filter((joint) => joint.parent === root).flatMap((joint) => carried(joint.child))];
  const beyond = joints.map((joint) => carried(joint.child));
  const centreOfMass = segments.map((segment) => v3(local(segment, segment.spec.centreOfMass.value)));
  const pivot = joints.map((joint) => v3(local(joint.child, joint.spec.centre.value)));
  const axes = joints.map((joint) => joint.dofs.map((_, k) => v3([joint.axes.x, joint.axes.y, joint.axes.z][k]!)));
  const about = joints.map((joint) => joint.dofs.map(() => 0));
  // Each segment's centre of mass in the world, and its node's rotation undone.
  const centres = segments.map(() => new Vector3());
  const inverses = segments.map(() => new Quaternion());
  const scratch = { centre: new Vector3(), axis: new Vector3(), inSegment: new Vector3(), d: new Vector3(), q: new Quaternion(), carry: new Quaternion() };
  return {
    about,
    update() {
      segments.forEach((segment, i) => {
        const rotation = segment.node.rotationQuaternion!;
        centreOfMass[i]!.rotateByQuaternionToRef(rotation, centres[i]!).addInPlace(segment.node.position);
        Quaternion.InverseToRef(rotation, inverses[i]!);
      });
      joints.forEach((joint, n) => {
        const { centre, axis, inSegment, d, q, carry } = scratch;
        pivot[n]!.rotateByQuaternionToRef(joint.child.node.rotationQuaternion!, centre).addInPlace(joint.child.node.position);
        // The body-frame axis as the parent now carries it: P P0^-1 (`joint-state.ts` turns the other way).
        Quaternion.InverseToRef(joint.parent.rest, q);
        joint.parent.node.rotationQuaternion!.multiplyToRef(q, carry);
        axes[n]!.forEach((a, k) => {
          a.rotateByQuaternionToRef(carry, axis);
          let sum = 0;
          for (const i of beyond[n]!) {
            const segment = segments[i]!, moments = segment.spec.inertia.value, mass = segment.spec.mass.value;
            axis.rotateByQuaternionToRef(inverses[i]!, inSegment);
            centres[i]!.subtractToRef(centre, d);
            const along = Vector3.Dot(d, axis);
            sum += moments[0] * inSegment.x ** 2 + moments[1] * inSegment.y ** 2 + moments[2] * inSegment.z ** 2
              + mass * (d.lengthSquared() - along * along);
          }
          about[n]![k] = sum;
        });
      });
    },
  };
}

/** `point`, body frame, in `segment`'s own coordinates: its frame at the reference pose. */
function local(segment: BuiltSegment, point: Vec3): Vec3 {
  const { origin, x, y, z } = segment.frame;
  const d: Vec3 = [point[0] - origin[0], point[1] - origin[1], point[2] - origin[2]];
  const dot = (a: Vec3): number => d[0] * a[0] + d[1] * a[1] + d[2] * a[2];
  return [dot(x), dot(y), dot(z)];
}

const v3 = (a: Vec3): Vector3 => new Vector3(a[0], a[1], a[2]);
