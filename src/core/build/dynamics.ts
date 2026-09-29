import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Vec3 } from "../spec/quantity.ts";
import type { BuiltBody, BuiltSegment } from "./build-body.ts";
import { GIMBAL_COSINE, motionAxesToRef } from "./joint-state.ts";

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
 * **The part that goes as the square of the speeds** (`bias`), given the segments' spins: what
 * the motion already under way asks of each freedom, so that M u' + bias = torques + gravity +
 * contacts. It is the carried segments' inertial wrench about the joint's centre, along the
 * freedom's axis, with every joint's speeds held (u' = 0), found from the root out: a child turns
 * as its parent does plus its joint's relative spin, whose axes its parent carries round
 * (`w_p x w_rel`, and a two-freedom joint's first axis leaning as its second angle turns), and
 * each centre swings about the joint centre it hangs from. A fast forearm throws the hand at the
 * wrist through this term, which the angles and the mass matrix cannot see.
 *
 * It leaves out each segment's gyroscopic torque, w x I w, because Havok does: a free body keeps
 * its angular velocity in the world, not its angular momentum. A box of inertia 0.010, 0.002 and
 * 0.006 kg m2 spun at (3, 5, 1) rad/s, no gravity, read (3, 5, 1) a second later at 120, 960 and
 * 1920 Hz while its angular momentum swung from (0.030, 0.010, 0.006) to (-0.004, 0.032, -0.001)
 * N m s in half a second (Node, `createWorld`). On the dynamics test's chain, let go turning at up
 * to 20 rad/s with no gravity or damping, the joints' accelerations in the steps between contacts
 * read within a few per cent of -M^-1 bias without the term, and a step's error was 10 % of its
 * acceleration at the median against 18 % with it (1920 Hz).
 *
 * The root is taken to be held still: its spin enters the bias, but a root carried or pushed adds
 * its own acceleration to every segment, and that is left to whoever reads the dynamics.
 *
 * Poses are read from the nodes (H24): each segment's spec inertia lies along its segment frame
 * (`build-body.ts`), which its node carries.
 */
export interface BodyDynamics {
  /** By freedom, n x n, kg m2. */
  readonly mass: readonly Float64Array[];
  /** By freedom, N m: the torque gravity puts on each freedom's motion. */
  readonly gravity: Float64Array;
  /** By freedom, N m: the torque the motion under way needs with no joint's speed changing; zero unless `update` is given `motion`. */
  readonly bias: Float64Array;
  /**
   * Reads the pose as it stands; `angles` by joint, each its freedoms' (`jointAngles`), for the
   * motion axes. With `motion`, the joints' speeds (by joint, each its freedoms') and each
   * segment's angular velocity (world frame, rad/s), it reads `bias` too.
   */
  update(angles: readonly (readonly number[])[], motion?: BodyMotion): void;
}

/** What `BodyDynamics.update` reads for `bias`. */
export interface BodyMotion {
  readonly speeds: readonly (readonly number[])[];
  readonly spin: (segment: BuiltSegment) => Vector3;
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
  const bias = new Float64Array(n);
  // From the root out: each joint after the one its parent hangs from.
  const byChild = new Map(joints.map((joint, j) => [joint.child, j]));
  const depth = (j: number): number => { const up = byChild.get(joints[j]!.parent); return up === undefined ? 0 : 1 + depth(up); };
  const outward = joints.map((_, j) => j).sort((a, b) => depth(a) - depth(b));
  const parentOf = joints.map((joint) => index.get(joint.parent)!), childOf = joints.map((joint) => index.get(joint.child)!);
  const roots = segments.map((_, i) => i).filter((i) => !childOf.includes(i));
  // Each segment's spin, and its angular and linear acceleration and inertial wrench with every joint's speed held.
  const spins = segments.map((): Point => [0, 0, 0]);
  const alpha = segments.map((): Point => [0, 0, 0]), accel = segments.map((): Point => [0, 0, 0]);
  const force = segments.map((): Point => [0, 0, 0]), moment = segments.map((): Point => [0, 0, 0]);
  const leanAxis = joints.map((): Point => [0, 0, 0]);

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
    scratch.v.set(a[0], a[1], a[2]).applyRotationQuaternionToRef(rotation, scratch.v);
    out[0] = scratch.v.x; out[1] = scratch.v.y; out[2] = scratch.v.z;
    return out;
  };
  const axis: Point = [0, 0, 0];

  const velocityProducts = (angles: readonly (readonly number[])[], { speeds, spin }: BodyMotion): void => {
    segments.forEach((segment, i) => {
      const w = spin(segment), o = spins[i]!;
      o[0] = w.x; o[1] = w.y; o[2] = w.z;
    });
    for (const i of roots) { alpha[i]!.fill(0); accel[i]!.fill(0); }
    for (const j of outward) {
      const p = parentOf[j]!, c = childOf[j]!, P = pivots[j]!;
      const wp = spins[p]!, wc = spins[c]!;
      // The child's spin changes as the parent carries the joint's axes round, and a two-freedom
      // joint's first axis (X - tan b Z) leans as b turns: d/dt of -tan b is -b'/cos^2 b.
      const turn = cross3(wp, sub3(wc, wp));
      const a = alpha[c]!, ap = alpha[p]!;
      a[0] = ap[0] + turn[0]; a[1] = ap[1] + turn[1]; a[2] = ap[2] + turn[2];
      const { dofs } = joints[j]!;
      if (dofs.length === 2) {
        const b = dofs[1]!.sign * angles[j]![1]!, cos = Math.cos(b);
        const held = Math.abs(cos) < GIMBAL_COSINE ? (cos < 0 ? -GIMBAL_COSINE : GIMBAL_COSINE) : cos;
        const lean = -speeds[j]![0]! * dofs[1]!.sign * speeds[j]![1]! / (held * held), z = leanAxis[j]!;
        a[0] += lean * z[0]; a[1] += lean * z[1]; a[2] += lean * z[2];
      }
      // The joint centre as the parent swings it, then the child's centre about it.
      const fromParent = sub3(P, centres[p]!), toChild = sub3(centres[c]!, P);
      const at = add3(accel[p]!, add3(cross3(ap, fromParent), cross3(wp, cross3(wp, fromParent))));
      const own = add3(at, add3(cross3(a, toChild), cross3(wc, cross3(wc, toChild))));
      const out = accel[c]!;
      out[0] = own[0]; out[1] = own[1]; out[2] = own[2];
    }
    segments.forEach((segment, i) => {
      const m = segment.spec.mass.value, a = accel[i]!, F = force[i]!, N = moment[i]!;
      F[0] = m * a[0]; F[1] = m * a[1]; F[2] = m * a[2];
      // Havok's bodies turn without the gyroscopic torque (w x I w), so it is not asked for.
      const Ia = inertiaTimes(inertias[i]!, alpha[i]!);
      N[0] = Ia[0]; N[1] = Ia[1]; N[2] = Ia[2];
    });
    for (let f = 0; f < n; f++) {
      const { joint: j, k } = freedoms[f]!, mf = axes[j]![k]!, P = pivots[j]!;
      let wx = 0, wy = 0, wz = 0;
      for (const i of beyond[j]!) {
        const rf = cross3(sub3(centres[i]!, P), force[i]!), N = moment[i]!;
        wx += rf[0] + N[0]; wy += rf[1] + N[1]; wz += rf[2] + N[2];
      }
      bias[f] = mf[0] * wx + mf[1] * wy + mf[2] * wz;
    }
  };

  return {
    mass,
    gravity: weight,
    bias,
    update(angles, motion) {
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
        if (motion && joint.dofs.length === 2) toWorld(scratch.carry, signed(joint.axes.z, joint.dofs[0]!.sign), leanAxis[j]!);
      });
      if (motion) velocityProducts(angles, motion);
      else bias.fill(0);
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

const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const signed = (a: Vec3, sign: number): Vec3 => [sign * a[0], sign * a[1], sign * a[2]];
/** A symmetric inertia (xx, yy, zz, xy, xz, yz) times a vector. */
const inertiaTimes = (I: Float64Array, v: Vec3): Vec3 => [
  I[0]! * v[0] + I[3]! * v[1] + I[4]! * v[2],
  I[3]! * v[0] + I[1]! * v[1] + I[5]! * v[2],
  I[4]! * v[0] + I[5]! * v[1] + I[2]! * v[2],
];
const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** g . (m x d): the weight's component along the velocity turning about m gives a point d from the axis. */
const tripleProduct = (g: Vec3, m: Vec3, d: Vec3): number => dot3(g, cross3(m, d));
