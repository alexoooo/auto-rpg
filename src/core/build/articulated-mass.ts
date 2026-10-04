import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { SegmentBody } from "../engine/engine.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { BuiltBody } from "./build-body.ts";
import { attachmentRows, constrainedMass, type MotionConstraint } from "./constrained-mass.ts";
import { jointAngles, motionAxesToRef } from "./joint-state.ts";

interface AttachedItem {
  readonly body: SegmentBody;
  motionConstraints(): readonly MotionConstraint[];
}

/**
 * Floating anatomical joints plus independent items and their active grips. Joint freedoms,
 * limits and ground contacts have the same free-impact interpretation as `contactMass`.
 * Both arms constrain a shared item; release changes the next update's constraint set.
 */
export function articulatedMass(built: BuiltBody, items: readonly AttachedItem[] = []) {
  const registered = [...items], joints = [...built.joints.values()];
  const point = new Vector3(), inverse = new Quaternion(), rotation = new Quaternion();
  const local = joints.map((j) => [j.parent, j.child].map((s): Vec3 => {
    const p = j.spec.centre.value.map((v, k) => v - s.frame.origin[k]!);
    return [s.frame.x, s.frame.y, s.frame.z].map((a) => p[0]! * a[0] + p[1]! * a[1] + p[2]! * a[2]) as unknown as Vec3;
  }));
  const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const XYZ: readonly Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], ZERO: Vec3 = [0, 0, 0];
  const remove = (a: number[], basis: readonly number[][]) => {
    for (let pass = 0; pass < 2; pass++) for (const b of basis) {
      const product = dot(a, b);
      for (let k = 0; k < 3; k++) a[k]! -= product * b[k]!;
    }
  };
  return constrainedMass([...built.segments.values()].map((s) => s.body).concat(registered.map((i) => i.body)), () => {
    const rows: MotionConstraint[] = [];
    joints.forEach((joint, j) => {
      const anchors = [joint.parent, joint.child].map((s, k): Vec3 => {
        point.set(...local[j]![k]!).applyRotationQuaternionToRef(s.node.rotationQuaternion!, point).addInPlace(s.node.position);
        return [point.x, point.y, point.z];
      });
      rows.push(...attachmentRows(joint.parent.body, joint.child.body, anchors[0]!, anchors[1]!, false));
      Quaternion.InverseToRef(joint.parent.rest, inverse);
      joint.parent.node.rotationQuaternion!.multiplyToRef(inverse, rotation);
      const free: number[][] = [];
      for (const a of motionAxesToRef(joint, jointAngles(joint), [])) {
        point.set(...a).applyRotationQuaternionToRef(rotation, point);
        const v = [point.x, point.y, point.z]; remove(v, free);
        const length = Math.sqrt(dot(v, v));
        if (!(length > 1e-10)) throw new Error("joint motion axes are singular");
        free.push(v.map((value) => value / length));
      }
      const all = [...free];
      for (const axis of XYZ) {
        if (all.length === 3) break;
        const v = [...axis]; remove(v, all);
        const length = Math.sqrt(dot(v, v));
        // Relative angular rank tolerance; numerical, as in constraint-mass.md.
        if (length <= 1e-10) continue;
        const angular = v.map((value) => value / length) as unknown as Vec3;
        all.push([...angular]);
        rows.push([
          { body: joint.parent.body, point: anchors[0]!, linear: ZERO, angular },
          { body: joint.child.body, point: anchors[1]!, linear: ZERO, angular: [-angular[0], -angular[1], -angular[2]] },
        ]);
      }
    });
    for (const item of registered) rows.push(...item.motionConstraints());
    return rows;
  });
}
