import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Vec3 } from "../spec/quantity.ts";
import type { BuiltBody, BuiltSegment } from "./build-body.ts";
import { motionAxesToRef } from "./joint-state.ts";

/**
 * **The body's dynamics in its joints' speeds**, with its root held: the mass matrix and the
 * generalized force of gravity, at the pose as it stands.
 *
 * The coordinates are the freedoms' speeds, in the muscle driver's order (joints as `built.joints`
 * gives them, each joint's freedoms in turn): each the relative angular velocity along its motor's
 * parent-fixed axis, in its own sense (`joint-state.ts`). A freedom's speed turns everything its
 * joint carries about that freedom's motion axis (`motionAxesToRef`) through the joint's centre,
 * so the kinetic energy is half of u' M u with
 *
 *     M[f][g] = m_f' I m_g + mass (m_f x (c - p_f)) . (m_g x (c - p_g))
 *
 * over what both freedoms move: nothing, unless one joint carries the other, and then the deeper
 * joint's carried segments as one rigid body of that mass, centre c and inertia I about c; p is each
 * freedom's joint centre. A torque on the motor of freedom f does work at the rate of its speed,
 * so M u' = torques + gravity + everything else, with gravity[f] the carried weight along how f
 * moves its centre: mass g . (m_f x (c - p_f)).
 *
 * `mass[f][f]` is the inertia beyond a joint: the segments it carries about the freedom's axis,
 * the parent held.
 *
 * The root is taken to be held still. A root carried or pushed adds its own acceleration to every
 * segment, and that is left to whoever reads the dynamics, as is the part of the motion that goes
 * as the square of the speeds.
 *
 * Poses are read from the nodes (H24): each segment's spec inertia lies along its segment frame
 * (`build-body.ts`), which its node carries.
 */
export interface BodyDynamics {
  /** By freedom, n x n, kg m2. */
  readonly mass: readonly Float64Array[];
  /** By freedom, N m: the torque gravity puts on each freedom's motion. */
  readonly gravity: Float64Array;
  /** Reads the pose as it stands; `angles` by joint, each its freedoms' (`jointAngles`), for the motion axes. */
  update(angles: readonly (readonly number[])[]): void;
}

export function bodyDynamics(built: BuiltBody, gravity: Vec3): BodyDynamics {
  const joints = [...built.joints.values()], segments = [...built.segments.values()];
  const index = new Map(segments.map((segment, i) => [segment, i]));
  const carried = (root: BuiltSegment): number[] =>
    [index.get(root)!, ...joints.filter((joint) => joint.parent === root).flatMap((joint) => carried(joint.child))];
  const beyond = joints.map((joint) => carried(joint.child));
  // Which joint's carried segments two joints both move: the deeper one's, or none (-1).
  const shared = joints.map((a, i) => joints.map((b, j) =>
    i === j ? i : beyond[i]!.includes(index.get(b.child)!) ? j : beyond[j]!.includes(index.get(a.child)!) ? i : -1));
  const freedoms = joints.flatMap((joint, j) => joint.dofs.map((_, k) => ({ joint: j, k })));
  const n = freedoms.length;
  const mass = freedoms.map(() => new Float64Array(n));
  const weight = new Float64Array(n);

  const centreOfMass = segments.map((segment) => local(segment, segment.spec.centreOfMass.value));
  const pivot = joints.map((joint) => local(joint.child, joint.spec.centre.value));
  // Each segment's centre and inertia (xx, yy, zz, xy, xz, yz) in the world; each joint's carried
  // mass, centre and inertia about that centre, its centre, and its freedoms' motion axes in the world.
  const centres = segments.map((): Point => [0, 0, 0]);
  const inertias = segments.map(() => new Float64Array(6));
  const composite = joints.map(() => ({ mass: 0, centre: [0, 0, 0] as Point, inertia: new Float64Array(6) }));
  const pivots = joints.map((): Point => [0, 0, 0]);
  const axes = joints.map((joint) => joint.dofs.map((): Point => [0, 0, 0]));
  const bodyAxes: Vec3[] = [];
  const scratch = { v: new Vector3(), q: new Quaternion(), carry: new Quaternion() };
  const toWorld = (rotation: Quaternion, a: Vec3, out: Point): Point => {
    scratch.v.set(a[0], a[1], a[2]).rotateByQuaternionToRef(rotation, scratch.v);
    out[0] = scratch.v.x; out[1] = scratch.v.y; out[2] = scratch.v.z;
    return out;
  };
  const axis: Point = [0, 0, 0];

  return {
    mass,
    gravity: weight,
    update(angles) {
      segments.forEach((segment, i) => {
        const rotation = segment.node.rotationQuaternion!, p = segment.node.position;
        const c = toWorld(rotation, centreOfMass[i]!, centres[i]!);
        c[0] += p.x; c[1] += p.y; c[2] += p.z;
        const moments = segment.spec.inertia.value, I = inertias[i]!;
        I.fill(0);
        for (let k = 0; k < 3; k++) {
          const a = toWorld(rotation, k === 0 ? X : k === 1 ? Y : Z, axis), m = moments[k]!;
          I[0] += m * a[0] * a[0]; I[1] += m * a[1] * a[1]; I[2] += m * a[2] * a[2];
          I[3] += m * a[0] * a[1]; I[4] += m * a[0] * a[2]; I[5] += m * a[1] * a[2];
        }
      });
      joints.forEach((joint, j) => {
        const body = composite[j]!, C = body.centre, I = body.inertia;
        body.mass = 0; C.fill(0); I.fill(0);
        for (const i of beyond[j]!) {
          const m = segments[i]!.spec.mass.value, c = centres[i]!;
          body.mass += m; C[0] += m * c[0]; C[1] += m * c[1]; C[2] += m * c[2];
        }
        C[0] /= body.mass; C[1] /= body.mass; C[2] /= body.mass;
        for (const i of beyond[j]!) {
          // Each segment's own inertia, and its mass at its centre's offset d: m (|d|^2 E - d d').
          const m = segments[i]!.spec.mass.value, c = centres[i]!, own = inertias[i]!;
          const d0 = c[0] - C[0], d1 = c[1] - C[1], d2 = c[2] - C[2], dd = d0 * d0 + d1 * d1 + d2 * d2;
          I[0] += own[0] + m * (dd - d0 * d0); I[1] += own[1] + m * (dd - d1 * d1); I[2] += own[2] + m * (dd - d2 * d2);
          I[3] += own[3] - m * d0 * d1; I[4] += own[4] - m * d0 * d2; I[5] += own[5] - m * d1 * d2;
        }
        const centre = toWorld(joint.child.node.rotationQuaternion!, pivot[j]!, pivots[j]!), at = joint.child.node.position;
        centre[0] += at.x; centre[1] += at.y; centre[2] += at.z;
        // A body-frame axis as the parent now carries it: P P0^-1 (`joint-state.ts` turns the other way).
        Quaternion.InverseToRef(joint.parent.rest, scratch.q);
        joint.parent.node.rotationQuaternion!.multiplyToRef(scratch.q, scratch.carry);
        motionAxesToRef(joint, angles[j]!, bodyAxes).forEach((a, k) => toWorld(scratch.carry, a, axes[j]![k]!));
      });
      for (let f = 0; f < n; f++) {
        const { joint: a, k } = freedoms[f]!, mf = axes[a]![k]!, pf = pivots[a]!;
        const own = composite[a]!;
        weight[f] = own.mass * tripleProduct(gravity, mf, sub3(own.centre, pf));
        for (let g = f; g < n; g++) {
          const { joint: b, k: l } = freedoms[g]!, D = shared[a]![b]!;
          let value = 0;
          if (D >= 0) {
            const body = composite[D]!, mg = axes[b]![l]!, pg = pivots[b]!, I = body.inertia;
            const Img: Vec3 = [
              I[0] * mg[0] + I[3] * mg[1] + I[4] * mg[2],
              I[3] * mg[0] + I[1] * mg[1] + I[5] * mg[2],
              I[4] * mg[0] + I[5] * mg[1] + I[2] * mg[2],
            ];
            value = dot3(mf, Img) + body.mass * dot3(cross3(mf, sub3(body.centre, pf)), cross3(mg, sub3(body.centre, pg)));
          }
          mass[f]![g] = value; mass[g]![f] = value;
        }
      }
    },
  };
}

/** A working vector, written in place. */
type Point = [number, number, number];

const X: Vec3 = [1, 0, 0], Y: Vec3 = [0, 1, 0], Z: Vec3 = [0, 0, 1];

/** `point`, body frame, in `segment`'s own coordinates: its frame at the reference pose. */
function local(segment: BuiltSegment, point: Vec3): Vec3 {
  const { origin, x, y, z } = segment.frame;
  const d: Vec3 = [point[0] - origin[0], point[1] - origin[1], point[2] - origin[2]];
  return [dot3(d, x), dot3(d, y), dot3(d, z)];
}

const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** g . (m x d): the weight's component along the velocity turning about m gives a point d from the axis. */
const tripleProduct = (g: Vec3, m: Vec3, d: Vec3): number => dot3(g, cross3(m, d));
