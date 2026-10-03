import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Vec3 } from "../spec/quantity.ts";
import type { BuiltBody, BuiltSegment } from "./build-body.ts";
import { motionAxesToRef } from "./joint-state.ts";
import { hasProducts } from "./rigid.ts";

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
 * (`w_p x w_rel`; a two-freedom joint's axes lean as its angles turn, but their leans cancel,
 * `motionAxesToRef`), and each centre swings about the joint centre it hangs from. A fast forearm throws the hand at the
 * wrist through this term, which the angles and the mass matrix cannot see.
 *
 * It includes each segment's gyroscopic torque, w x I w, because the engine does: Rapier keeps a
 * free body's angular momentum, not its spin (`research/core-rapier-probe.mjs` spins a box to show
 * it).
 *
 * The joints' rows take the root to be held still: its spin enters the bias, but a root carried or
 * pushed adds its own acceleration to every segment. **The root's own rows** (`root`) carry that:
 * with the root's spin w and its centre of mass's velocity v (world) as six more speeds, the body
 * moves as
 *
 *     [ root.mass      root.coupling ] [ a_root ]   [ root.bias ]   [ wrench on the root ]   [ root.gravity ]
 *     [ root.coupling'     mass      ] [   u'   ] + [   bias    ] = [       torques        ] + [   gravity    ] + contacts
 *
 * a_root being the root's angular acceleration and its centre's (the rows in that order), and the
 * root's wrench its moment about its centre of mass and its force. The bias of every row is taken
 * with the root's own acceleration zero, so the joints' rows are the same with the root held or
 * free. A contact's generalized force is its wrench carried along each speed's motion: for a force
 * f at a point x of a segment, and a moment n on it, f and (x - c_root) x f + n on the root's rows,
 * and m . n + (m x (x - p)) . f on a freedom that moves the segment (motion axis m, centre p).
 *
 * Poses are read from the nodes' `position` and `rotationQuaternion`, not a world matrix, which
 * Babylon caches per render id: each segment's spec inertia lies along its segment frame
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
   * motion axes. With `motion`, each segment's angular velocity (world frame, rad/s), it reads
   * `bias` too.
   */
  update(angles: readonly (readonly number[])[], motion?: BodyMotion): void;
  /** The root's rows, as last read. */
  readonly root: RootDynamics;
  /** Freedom f's motion axis, world, as last read. */
  axis(f: number): readonly [number, number, number];
  /** Freedom f's joint's centre, world, as last read. */
  pivot(f: number): readonly [number, number, number];
  /**
   * What `segment`'s point `point` (world) accelerates at with no speed's change, the root's
   * included, into `linear`, and the segment's angular acceleration into `angular`: the part of
   * its motion that goes as the square of the speeds. Zero unless `update` was given `motion`.
   */
  driftToRef(segment: BuiltSegment, point: Vector3, linear: Vector3, angular: Vector3): void;
}

/**
 * The root's rows of the body's dynamics (`BodyDynamics`): its six speeds are its spin and its
 * centre of mass's velocity, world, in that order.
 */
interface RootDynamics {
  /** The segment no joint carries. */
  readonly segment: BuiltSegment;
  /** Its centre of mass, world, as last read. */
  readonly centre: readonly [number, number, number];
  /** 6 x 6: the whole body's inertia in the root's speeds, kg m2, kg m and kg. */
  readonly mass: readonly Float64Array[];
  /** 6 x n: each root speed's product with each freedom's. */
  readonly coupling: readonly Float64Array[];
  /** 6: gravity's moment about the root's centre and its force, N m and N. */
  readonly gravity: Float64Array;
  /** 6: the whole body's inertial wrench with no speed's change, about the root's centre. */
  readonly bias: Float64Array;
}

/** What `BodyDynamics.update` reads for `bias`. */
interface BodyMotion {
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
  if (roots.length !== 1) throw new Error(`${built.spec.model} has ${roots.length} segments no joint carries, not one`);
  const rootIndex = roots[0]!;
  const root = { segment: segments[rootIndex]!, centre: [0, 0, 0] as Point, mass: [0, 1, 2, 3, 4, 5].map(() => new Float64Array(6)),
    coupling: [0, 1, 2, 3, 4, 5].map(() => new Float64Array(n)), gravity: new Float64Array(6), bias: new Float64Array(6) };
  const whole = { centre: [0, 0, 0] as Point, inertia: new Float64Array(6), mass: segments.reduce((sum, s) => sum + s.rigid.mass, 0) };
  // Each segment's spin, and its angular and linear acceleration and inertial wrench with every joint's speed held.
  const spins = segments.map((): Point => [0, 0, 0]);
  const alpha = segments.map((): Point => [0, 0, 0]), accel = segments.map((): Point => [0, 0, 0]);
  const force = segments.map((): Point => [0, 0, 0]), moment = segments.map((): Point => [0, 0, 0]);

  const centreOfMass = segments.map((segment) => local(segment, segment.rigid.centre));
  const pivot = joints.map((joint) => local(joint.child, joint.spec.centre.value));
  // Each segment's centre and inertia (xx, yy, zz, xy, xz, yz) in the world; each joint's carried
  // mass, centre and inertia about that centre, its centre, and its freedoms' motion axes in the world.
  const centres = segments.map((): Point => [0, 0, 0]);
  const inertias = segments.map(() => new Float64Array(6));
  const composite = joints.map(() => ({ mass: 0, centre: [0, 0, 0] as Point, inertia: new Float64Array(6) }));
  const pivots = joints.map((): Point => [0, 0, 0]);
  const axes = joints.map((joint) => joint.dofs.map((): Point => [0, 0, 0]));
  const bodyAxes: [number, number, number][] = [];
  const scratch = { v: new Vector3(), q: new Quaternion(), carry: new Quaternion() };
  const toWorld = (rotation: Quaternion, a: Vec3, out: Point): Point => {
    scratch.v.set(a[0], a[1], a[2]).applyRotationQuaternionToRef(rotation, scratch.v);
    out[0] = scratch.v.x; out[1] = scratch.v.y; out[2] = scratch.v.z;
    return out;
  };
  const turned: Point[] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  // What the reads below work in, each point written before it is read.
  const work = {
    a: [0, 0, 0] as Point, b: [0, 0, 0] as Point, c: [0, 0, 0] as Point, d: [0, 0, 0] as Point, e: [0, 0, 0] as Point,
    full: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] as Point[], skew: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] as Point[],
  };

  const velocityProducts = ({ spin }: BodyMotion): void => {
    const { a: u, b: v, c: w, d: x, e: y } = work;
    for (let i = 0; i < segments.length; i++) {
      const s = spin(segments[i]!), o = spins[i]!;
      o[0] = s.x; o[1] = s.y; o[2] = s.z;
    }
    for (const i of roots) { alpha[i]!.fill(0); accel[i]!.fill(0); }
    for (const j of outward) {
      const p = parentOf[j]!, c = childOf[j]!, P = pivots[j]!;
      const wp = spins[p]!, wc = spins[c]!;
      // The child's spin changes as the parent carries the joint's axes round.
      const turn = crossTo(wp, subTo(wc, wp, u), v);
      const a = alpha[c]!, ap = alpha[p]!;
      a[0] = ap[0] + turn[0]; a[1] = ap[1] + turn[1]; a[2] = ap[2] + turn[2];
      // The joint centre as the parent swings it, then the child's centre about it.
      const fromParent = subTo(P, centres[p]!, u);
      const at = addTo(accel[p]!, addTo(crossTo(ap, fromParent, v), crossTo(wp, crossTo(wp, fromParent, w), x), y), w);
      const toChild = subTo(centres[c]!, P, u);
      addTo(at, addTo(crossTo(a, toChild, v), crossTo(wc, crossTo(wc, toChild, x), y), x), accel[c]!);
    }
    for (let i = 0; i < segments.length; i++) {
      const m = segments[i]!.rigid.mass, a = accel[i]!, F = force[i]!, N = moment[i]!;
      F[0] = m * a[0]; F[1] = m * a[1]; F[2] = m * a[2];
      // I a + w x I w: the engine's bodies keep their angular momentum.
      const Ia = inertiaTimesTo(inertias[i]!, alpha[i]!, u), s = spins[i]!, gyro = crossTo(s, inertiaTimesTo(inertias[i]!, s, v), w);
      N[0] = Ia[0] + gyro[0]; N[1] = Ia[1] + gyro[1]; N[2] = Ia[2] + gyro[2];
    }
    for (let f = 0; f < n; f++) {
      const { joint: j, k } = freedoms[f]!, mf = axes[j]![k]!, P = pivots[j]!;
      let wx = 0, wy = 0, wz = 0;
      for (const i of beyond[j]!) {
        const rf = crossTo(subTo(centres[i]!, P, u), force[i]!, v), N = moment[i]!;
        wx += rf[0] + N[0]; wy += rf[1] + N[1]; wz += rf[2] + N[2];
      }
      bias[f] = mf[0] * wx + mf[1] * wy + mf[2] * wz;
    }
    const b = root.bias, p0 = root.centre;
    b.fill(0);
    for (let i = 0; i < segments.length; i++) {
      const F = force[i]!, rf = crossTo(subTo(centres[i]!, p0, u), F, v), N = moment[i]!;
      b[0] += rf[0] + N[0]; b[1] += rf[1] + N[1]; b[2] += rf[2] + N[2];
      b[3] += F[0]; b[4] += F[1]; b[5] += F[2];
    }
  };

  return {
    mass,
    gravity: weight,
    bias,
    root,
    axis: (f) => axes[freedoms[f]!.joint]![freedoms[f]!.k]!,
    pivot: (f) => pivots[freedoms[f]!.joint]!,
    driftToRef(segment, point, linear, angular) {
      const i = index.get(segment)!, c = centres[i]!, a = accel[i]!, al = alpha[i]!, w = spins[i]!, r = work.a;
      r[0] = point.x - c[0]; r[1] = point.y - c[1]; r[2] = point.z - c[2];
      const turn = addTo(crossTo(al, r, work.b), crossTo(w, crossTo(w, r, work.c), work.d), work.e);
      linear.set(a[0] + turn[0], a[1] + turn[1], a[2] + turn[2]);
      angular.set(al[0], al[1], al[2]);
    },
    update(angles, motion) {
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i]!, rotation = segment.node.rotationQuaternion!, p = segment.node.position;
        const c = toWorld(rotation, centreOfMass[i]!, centres[i]!);
        c[0] += p.x; c[1] += p.y; c[2] += p.z;
        // R T R' from the segment frame's axes as they are now: each entry's two axes' outer product.
        const T = segment.rigid.tensor, I = inertias[i]!;
        I.fill(0);
        for (let k = 0; k < 3; k++) toWorld(rotation, k === 0 ? X : k === 1 ? Y : Z, turned[k]!);
        for (let k = 0; k < 3; k++) {
          const a = turned[k]!, m = T[k]!;
          I[0] += m * a[0] * a[0]; I[1] += m * a[1] * a[1]; I[2] += m * a[2] * a[2];
          I[3] += m * a[0] * a[1]; I[4] += m * a[0] * a[2]; I[5] += m * a[1] * a[2];
        }
        if (hasProducts(T)) {
          for (const [k, l, e] of PRODUCTS) {
            const a = turned[k]!, b = turned[l]!, m = T[e]!;
            // The entry and its mirror: m (a b' + b a').
            I[0] += 2 * m * a[0] * b[0]; I[1] += 2 * m * a[1] * b[1]; I[2] += 2 * m * a[2] * b[2];
            I[3] += m * (a[0] * b[1] + b[0] * a[1]); I[4] += m * (a[0] * b[2] + b[0] * a[2]); I[5] += m * (a[1] * b[2] + b[1] * a[2]);
          }
        }
      }
      for (let j = 0; j < joints.length; j++) {
        const joint = joints[j]!, body = composite[j]!, C = body.centre, I = body.inertia;
        body.mass = 0; C.fill(0); I.fill(0);
        for (const i of beyond[j]!) {
          const m = segments[i]!.rigid.mass, c = centres[i]!;
          body.mass += m; C[0] += m * c[0]; C[1] += m * c[1]; C[2] += m * c[2];
        }
        C[0] /= body.mass; C[1] /= body.mass; C[2] /= body.mass;
        for (const i of beyond[j]!) {
          // Each segment's own inertia, and its mass at its centre's offset d: m (|d|^2 E - d d').
          const m = segments[i]!.rigid.mass, c = centres[i]!, own = inertias[i]!;
          const d0 = c[0] - C[0], d1 = c[1] - C[1], d2 = c[2] - C[2], dd = d0 * d0 + d1 * d1 + d2 * d2;
          I[0] += own[0] + m * (dd - d0 * d0); I[1] += own[1] + m * (dd - d1 * d1); I[2] += own[2] + m * (dd - d2 * d2);
          I[3] += own[3] - m * d0 * d1; I[4] += own[4] - m * d0 * d2; I[5] += own[5] - m * d1 * d2;
        }
        const centre = toWorld(joint.child.node.rotationQuaternion!, pivot[j]!, pivots[j]!), at = joint.child.node.position;
        centre[0] += at.x; centre[1] += at.y; centre[2] += at.z;
        // A body-frame axis as the parent now carries it: P P0^-1 (`joint-state.ts` turns the other way).
        Quaternion.InverseToRef(joint.parent.rest, scratch.q);
        joint.parent.node.rotationQuaternion!.multiplyToRef(scratch.q, scratch.carry);
        motionAxesToRef(joint, angles[j]!, bodyAxes);
        for (let k = 0; k < bodyAxes.length; k++) toWorld(scratch.carry, bodyAxes[k]!, axes[j]![k]!);
      }
      // The whole body about its centre of mass, and the root's rows about the root's centre.
      {
        const C = whole.centre, I = whole.inertia;
        C.fill(0); I.fill(0);
        for (let i = 0; i < segments.length; i++) { const m = segments[i]!.rigid.mass, c = centres[i]!; C[0] += m * c[0]; C[1] += m * c[1]; C[2] += m * c[2]; }
        C[0] /= whole.mass; C[1] /= whole.mass; C[2] /= whole.mass;
        for (let i = 0; i < segments.length; i++) {
          const m = segments[i]!.rigid.mass, c = centres[i]!, own = inertias[i]!;
          const d0 = c[0] - C[0], d1 = c[1] - C[1], d2 = c[2] - C[2], dd = d0 * d0 + d1 * d1 + d2 * d2;
          I[0] += own[0] + m * (dd - d0 * d0); I[1] += own[1] + m * (dd - d1 * d1); I[2] += own[2] + m * (dd - d2 * d2);
          I[3] += own[3] - m * d0 * d1; I[4] += own[4] - m * d0 * d2; I[5] += own[5] - m * d1 * d2;
        }
        const p0 = root.centre, c0 = centres[rootIndex]!, M = whole.mass;
        p0[0] = c0[0]; p0[1] = c0[1]; p0[2] = c0[2];
        const d = subTo(C, p0, work.a), dd = dot3(d, d), A = root.mass;
        // The spin's rows: the inertia about the root's centre, and M [d]x against the velocity.
        const { full, skew } = work;
        full[0]![0] = I[0]!; full[0]![1] = I[3]!; full[0]![2] = I[4]!;
        full[1]![0] = I[3]!; full[1]![1] = I[1]!; full[1]![2] = I[5]!;
        full[2]![0] = I[4]!; full[2]![1] = I[5]!; full[2]![2] = I[2]!;
        skew[0]![0] = 0; skew[0]![1] = -d[2]; skew[0]![2] = d[1];
        skew[1]![0] = d[2]; skew[1]![1] = 0; skew[1]![2] = -d[0];
        skew[2]![0] = -d[1]; skew[2]![1] = d[0]; skew[2]![2] = 0;
        for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) {
          A[r]![s] = full[r]![s]! + M * ((r === s ? dd : 0) - d[r]! * d[s]!);
          A[r]![3 + s] = M * skew[r]![s]!;
          A[3 + s]![r] = M * skew[r]![s]!;
          A[3 + r]![3 + s] = r === s ? M : 0;
        }
        const weightMoment = crossTo(d, gravity, work.b);
        for (let r = 0; r < 3; r++) { root.gravity[r] = M * weightMoment[r]!; root.gravity[3 + r] = M * gravity[r]!; }
        for (let f = 0; f < n; f++) {
          // What freedom f moves, as one body: its momentum per unit speed, and that momentum's moment
          // about the root's centre with the body's own spin.
          const { joint: j, k } = freedoms[f]!, mf = axes[j]![k]!, body = composite[j]!;
          const swept = crossTo(mf, subTo(body.centre, pivots[j]!, work.c), work.d), lin = work.c;
          lin[0] = body.mass * swept[0]; lin[1] = body.mass * swept[1]; lin[2] = body.mass * swept[2];
          const ang = addTo(inertiaTimesTo(body.inertia, mf, work.a), crossTo(subTo(body.centre, p0, work.d), lin, work.e), work.d);
          for (let r = 0; r < 3; r++) { root.coupling[r]![f] = ang[r]!; root.coupling[3 + r]![f] = lin[r]!; }
        }
      }
      if (motion) velocityProducts(motion);
      else { bias.fill(0); root.bias.fill(0); for (const a of accel) a.fill(0); for (const a of alpha) a.fill(0); spins.forEach((s) => s.fill(0)); }
      for (let f = 0; f < n; f++) {
        const { joint: a, k } = freedoms[f]!, mf = axes[a]![k]!, pf = pivots[a]!;
        const own = composite[a]!;
        weight[f] = own.mass * dot3(gravity, crossTo(mf, subTo(own.centre, pf, work.a), work.b));
        for (let g = f; g < n; g++) {
          const { joint: b, k: l } = freedoms[g]!, D = shared[a]![b]!;
          let value = 0;
          if (D >= 0) {
            const body = composite[D]!, mg = axes[b]![l]!, pg = pivots[b]!;
            const Img = inertiaTimesTo(body.inertia, mg, work.a);
            value = dot3(mf, Img) + body.mass * dot3(crossTo(mf, subTo(body.centre, pf, work.b), work.c), crossTo(mg, subTo(body.centre, pg, work.b), work.d));
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
/** A tensor's products: the two axes each is between, and its entry (`Tensor`). */
const PRODUCTS = [[0, 1, 3], [0, 2, 4], [1, 2, 5]] as const;

/** `point`, body frame, in `segment`'s own coordinates: its frame at the reference pose. */
function local(segment: BuiltSegment, point: Vec3): Vec3 {
  const { origin, x, y, z } = segment.frame;
  const d: Vec3 = [point[0] - origin[0], point[1] - origin[1], point[2] - origin[2]];
  return [dot3(d, x), dot3(d, y), dot3(d, z)];
}

const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** a + b, into `out`. */
function addTo(a: Vec3, b: Vec3, out: Point): Point {
  const x = a[0] + b[0], y = a[1] + b[1], z = a[2] + b[2];
  out[0] = x; out[1] = y; out[2] = z;
  return out;
}
/** a - b, into `out`. */
function subTo(a: Vec3, b: Vec3, out: Point): Point {
  const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2];
  out[0] = x; out[1] = y; out[2] = z;
  return out;
}
/** a x b, into `out`. */
function crossTo(a: Vec3, b: Vec3, out: Point): Point {
  const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0];
  out[0] = x; out[1] = y; out[2] = z;
  return out;
}
/** A symmetric inertia (xx, yy, zz, xy, xz, yz) times a vector, into `out`. */
function inertiaTimesTo(I: Float64Array, v: Vec3, out: Point): Point {
  const x = I[0]! * v[0] + I[3]! * v[1] + I[4]! * v[2], y = I[3]! * v[0] + I[1]! * v[1] + I[5]! * v[2], z = I[4]! * v[0] + I[5]! * v[1] + I[2]! * v[2];
  out[0] = x; out[1] = y; out[2] = z;
  return out;
}
