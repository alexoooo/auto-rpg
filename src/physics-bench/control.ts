import { GRAVITY, sideAway, worldInertia, type Model } from "./model.ts";
import type { V3 } from "./math.ts";

/**
 * **The one controller every engine runs**: a joint servo computed in JavaScript from the state each
 * engine hands back, at the control rate, held over the engine's sub-steps as world torques. No
 * engine's own motors are used.
 *
 * The state is 13 numbers a segment (`STRIDE`): centre of mass (world), orientation as the rotation
 * from the reference pose ([x, y, z, w]), the centre of mass's velocity and the angular velocity
 * (world). For each joint:
 *
 * - its relative rotation R = Rp^-1 Rc, in the parent's reference frame; the target
 *   Rt = rot(a1, t1) rot(a2, t2) rot(a3, t3) from the target angles in freedom order; the error e is
 *   the rotation vector of R Rt^-1; each freedom's rate u is its axis a along the relative angular
 *   velocity;
 * - each freedom asks for the critically damped acceleration of its error at time constant `T`,
 *   about the goal's own motion: `accel - (a.e) / T^2 - 2 (u - rate) / T`;
 * - **the torques are those accelerations times the joint-space inertia** (`M a`), plus gravity's
 *   moment of the side the joint holds up (`sideAway`), each clamped to the muscle's isometric peak
 *   (`Dof.peakPositive`, `peakNegative`). This is the core's servo (`src/core/control/servo.ts`)
 *   without its bias term (the motion under way) and without its re-solve around a clamped freedom;
 * - the torque is applied +t on the child and -t on the parent, world frame.
 *
 * M is taken from the state each step: a freedom turns the side it holds up about its axis through
 * its joint, and M = sum over segments of J^T diag(m, I) J, applied to the accelerations without
 * forming it (Jacobian, segment inertia, Jacobian transpose). T is the core's servo constant
 * (`SERVO_SECONDS`, 0.1 s: twelve steps at 120 Hz).
 *
 * Why M and not a gain a joint: a joint servo whose gains are sized to the inertia each joint holds
 * up (kp = I/T^2, kd = 2I/T) was tried first. At 120 Hz it rang on every light segment between two
 * heavy joints, in every engine: case A's shank, between an ankle of kd 1540 N m s/rad and a knee of
 * 604, flipped the ankle's torque between +155 and -45 N m every step from the second step, and the
 * leg fell within 0.8 s in MuJoCo at 16 sub-steps (1920 Hz), in Havok at 4 and 16, and in Rapier.
 * The core rejected the same law for the same reason (`servo.ts`, "each joint's torque from its own
 * inertia"). Given through M, each mode of the chain moves at its own inertia.
 *
 * A stance foot is read as the ground (`Placement.grounded`): at its reference orientation and still.
 * Read as itself, the ankle's torque answers the foot's own rocking, which is the engine's to show.
 */
export const STRIDE = 13;
export const SERVO_T = 0.1;

export interface ControlJoint {
  readonly name: string;
  readonly parent: number;
  readonly child: number;
  readonly centre: V3;
  readonly parentCom: V3;
  readonly axes: readonly V3[];
  readonly peakPositive: Float64Array;
  readonly peakNegative: Float64Array;
  readonly distal: Int32Array;
  /** Each distal segment's share of its load this joint carries (`Placement.share`). */
  readonly distalShare: Float64Array;
  readonly onParent: boolean;
  readonly gravity: boolean;
  /** Controller joint indices whose centres a shared load is split between (`Placement.shareAt`), or -1. */
  readonly shareFrom: number;
  readonly shareTo: number;
  /** Whether the parent or the child is read as the ground: at its reference orientation, still. */
  readonly parentGrounded: boolean;
  readonly childGrounded: boolean;
  /** Index of this joint's first freedom in the controller's freedom list. */
  readonly first: number;
  /** Target angles, rates and accelerations, rad; the scenario writes them. */
  readonly target: Float64Array;
  readonly rate: Float64Array;
  readonly accel: Float64Array;
}

export interface Controller {
  readonly joints: readonly ControlJoint[];
  readonly byName: ReadonlyMap<string, ControlJoint>;
  /** Per segment world torque, 3 a segment, written by `compute`. */
  readonly torques: Float64Array;
  /** Each freedom's torque, clamped, from the last `compute`, N m. */
  readonly dofTorques: Float64Array;
  compute(state: Float64Array): void;
}

export interface Placement {
  readonly model: Model;
  /** Index of the model's first segment in the scene's segment list. */
  readonly base: number;
  /** The segment the joint's load is held from (its side is not held up), by joint index. */
  readonly root: (joint: number) => number;
  /** Whether the joint's gravity moment is fed forward. */
  readonly gravity: (joint: number) => boolean;
  /** A prefix for joint names, so several models share a controller. */
  readonly prefix?: string;
  /** Segments (model indices) the law reads as the ground: a stance foot. */
  readonly grounded?: readonly number[];
  /**
   * The share of a segment's load (its inertia and weight) the joint carries, model indices; 1 when
   * not given, and 0 leaves the segment off the joint's side. Two stance legs each carry half of the
   * body above them, and none of the other leg: the pelvis then moves as the mean of what the two legs
   * ask of it, and the torques are that weighted Jacobian's J^T M J.
   */
  readonly share?: (joint: number, segment: number) => number;
  /**
   * Where a shared load acts for the joint: two joints (model indices), its own leg's hip and the
   * other's. Half the weight of a body held by two hips reaches each through that hip, with half of
   * its moment about their midpoint; for the joint that is the shared weight shifted by half the
   * difference of the two centres. Without it each leg would feed forward the whole shared weight
   * cantilevered at its own centre, and the two legs squeeze the pelvis between them.
   */
  readonly shareAt?: (joint: number) => readonly [number, number] | undefined;
}

export function createController(placements: readonly Placement[], nSegments: number, masses: Float64Array, T = SERVO_T): Controller {
  const joints: ControlJoint[] = [];
  const restInertia = new Float64Array(9 * nSegments);
  const sidesOf: [number, number][][] = Array.from({ length: nSegments }, () => []);
  let nd = 0;
  for (const p of placements) {
    const jointBase = joints.length;
    p.model.segments.forEach((s, i) => restInertia.set(worldInertia(s), 9 * (i + p.base)));
    p.model.joints.forEach((j, ji) => {
      const side = sideAway(p.model, ji, p.root(ji));
      const shared = side.segments.map((s): [number, number] => [s, p.share ? p.share(ji, s) : 1]).filter(([, w]) => w > 0);
      const n = j.dofs.length;
      for (let k = 0; k < n; k++) for (const [s, w] of shared) sidesOf[s + p.base]!.push([nd + k, w]);
      joints.push({
        name: `${p.prefix ?? ""}${j.name}`,
        parent: j.parent < 0 ? -1 : j.parent + p.base, child: j.child + p.base,
        centre: j.centre, parentCom: j.parent < 0 ? j.centre : p.model.segments[j.parent]!.com,
        axes: j.dofs.map((d) => d.axis),
        peakPositive: Float64Array.from(j.dofs.map((d) => d.peakPositive)),
        peakNegative: Float64Array.from(j.dofs.map((d) => d.peakNegative)),
        distal: Int32Array.from(shared.map(([s]) => s + p.base)), distalShare: Float64Array.from(shared.map(([, w]) => w)), onParent: side.onParent, gravity: p.gravity(ji),
        shareFrom: p.shareAt?.(ji) ? jointBase + p.shareAt(ji)![0] : -1, shareTo: p.shareAt?.(ji) ? jointBase + p.shareAt(ji)![1] : -1,
        parentGrounded: j.parent >= 0 && (p.grounded ?? []).includes(j.parent), childGrounded: (p.grounded ?? []).includes(j.child),
        first: nd,
        target: new Float64Array(n), rate: new Float64Array(n), accel: new Float64Array(n),
      });
      nd += n;
    });
  }
  // Segment -> the freedoms whose side it is on, flattened.
  const segStart = new Int32Array(nSegments + 1);
  for (let s = 0; s < nSegments; s++) segStart[s + 1] = segStart[s]! + sidesOf[s]!.length;
  const segDofs = Int32Array.from(sidesOf.flatMap((x) => x.map(([d]) => d)));
  const segShare = Float64Array.from(sidesOf.flatMap((x) => x.map(([, w]) => w)));
  const torques = new Float64Array(3 * nSegments);
  const dofTorques = new Float64Array(nd);
  // Per freedom: world axis signed toward the side it turns, the joint's world point, the asked
  // acceleration, the gravity moment, and the joint-space torque.
  const axis = new Float64Array(3 * nd), point = new Float64Array(3 * nd);
  const want = new Float64Array(nd), grav = new Float64Array(nd), tau = new Float64Array(nd);
  const n2 = 1 / (T * T), n1 = 2 / T;
  const s = new Float64Array(16);
  const jointPoint = new Float64Array(3 * joints.length);

  function compute(state: Float64Array): void {
    // Every joint's world point first: a shared load is placed off two of them.
    for (let q = 0; q < joints.length; q++) {
      const j = joints[q]!;
      if (j.parent >= 0) {
        const o = j.parent * STRIDE, g = j.parentGrounded;
        rotate(g ? 0 : state[o + 3]!, g ? 0 : state[o + 4]!, g ? 0 : state[o + 5]!, g ? 1 : state[o + 6]!,
          j.centre[0] - j.parentCom[0], j.centre[1] - j.parentCom[1], j.centre[2] - j.parentCom[2], s, 0);
        jointPoint[3 * q] = state[o]! + s[0]!; jointPoint[3 * q + 1] = state[o + 1]! + s[1]!; jointPoint[3 * q + 2] = state[o + 2]! + s[2]!;
      } else {
        jointPoint[3 * q] = j.centre[0]; jointPoint[3 * q + 1] = j.centre[1]; jointPoint[3 * q + 2] = j.centre[2];
      }
    }
    for (let q = 0; q < joints.length; q++) {
      const j = joints[q]!;
      let px = 0, py = 0, pz = 0, pw = 1, wpx = 0, wpy = 0, wpz = 0;
      const jx = jointPoint[3 * q]!, jy = jointPoint[3 * q + 1]!, jz = jointPoint[3 * q + 2]!;
      if (j.parent >= 0 && !j.parentGrounded) {
        const o = j.parent * STRIDE;
        px = state[o + 3]!; py = state[o + 4]!; pz = state[o + 5]!; pw = state[o + 6]!;
        wpx = state[o + 10]!; wpy = state[o + 11]!; wpz = state[o + 12]!;
      }
      const c = j.child * STRIDE, g = j.childGrounded;
      const cx = g ? 0 : state[c + 3]!, cy = g ? 0 : state[c + 4]!, cz = g ? 0 : state[c + 5]!, cw = g ? 1 : state[c + 6]!;
      const wcx = g ? 0 : state[c + 10]!, wcy = g ? 0 : state[c + 11]!, wcz = g ? 0 : state[c + 12]!;
      // R = conj(Rp) * Rc
      const rx = pw * cx - px * cw - py * cz + pz * cy;
      const ry = pw * cy + px * cz - py * cw - pz * cx;
      const rz = pw * cz - px * cy + py * cx - pz * cw;
      const rw = pw * cw + px * cx + py * cy + pz * cz;
      // Rt = prod rot(a_k, t_k)
      let tx = 0, ty = 0, tz = 0, tw = 1;
      for (let k = 0; k < j.axes.length; k++) {
        const a = j.axes[k]!, h = j.target[k]! / 2, sn = Math.sin(h), cs = Math.cos(h);
        const bx = a[0] * sn, by = a[1] * sn, bz = a[2] * sn, bw = cs;
        const nx = tw * bx + tx * bw + ty * bz - tz * by;
        const ny = tw * by - tx * bz + ty * bw + tz * bx;
        const nz = tw * bz + tx * by - ty * bx + tz * bw;
        const nw = tw * bw - tx * bx - ty * by - tz * bz;
        tx = nx; ty = ny; tz = nz; tw = nw;
      }
      // E = R * conj(Rt), as a rotation vector.
      let ex = -rw * tx + rx * tw - ry * tz + rz * ty;
      let ey = -rw * ty + rx * tz + ry * tw - rz * tx;
      let ez = -rw * tz - rx * ty + ry * tx + rz * tw;
      let ew = rw * tw + rx * tx + ry * ty + rz * tz;
      if (ew < 0) { ex = -ex; ey = -ey; ez = -ez; ew = -ew; }
      const vn = Math.hypot(ex, ey, ez);
      const f = vn < 1e-12 ? 2 : (2 * Math.atan2(vn, ew)) / vn;
      ex *= f; ey *= f; ez *= f;
      // Relative angular velocity in the parent's reference frame.
      rotate(-px, -py, -pz, pw, wcx - wpx, wcy - wpy, wcz - wpz, s, 3);
      // Gravity's moment of the side held up, as the torque the child must be given, world.
      let gx = 0, gz = 0;
      if (j.gravity) {
        // A shared load's shift: half the difference of the two centres it is split between.
        const hx = j.shareFrom < 0 ? 0 : 0.5 * (jointPoint[3 * j.shareFrom]! - jointPoint[3 * j.shareTo]!);
        const hz = j.shareFrom < 0 ? 0 : 0.5 * (jointPoint[3 * j.shareFrom + 2]! - jointPoint[3 * j.shareTo + 2]!);
        for (let d = 0; d < j.distal.length; d++) {
          const i = j.distal[d]!, o = i * STRIDE, w = j.distalShare[d]!, mg = masses[i]! * GRAVITY * w;
          const shift = w < 1 ? 1 : 0;
          // (c - p) x (0, -mg, 0) = (mg (c - p)z, 0, -mg (c - p)x)
          gx += mg * (state[o + 2]! + shift * hz - jz);
          gz -= mg * (state[o]! + shift * hx - jx);
        }
        if (!j.onParent) { gx = -gx; gz = -gz; }
      }
      const sign = j.onParent ? -1 : 1;
      for (let k = 0; k < j.axes.length; k++) {
        const a = j.axes[k]!, d = j.first + k;
        rotate(px, py, pz, pw, a[0], a[1], a[2], s, 6);
        axis[3 * d] = sign * s[6]!; axis[3 * d + 1] = sign * s[7]!; axis[3 * d + 2] = sign * s[8]!;
        point[3 * d] = jx; point[3 * d + 1] = jy; point[3 * d + 2] = jz;
        const err = a[0] * ex + a[1] * ey + a[2] * ez, u = a[0] * s[3]! + a[1] * s[4]! + a[2] * s[5]!;
        want[d] = j.accel[k]! - n2 * err - n1 * (u - j.rate[k]!);
        grav[d] = s[6]! * gx + s[8]! * gz;
      }
    }
    // tau = J^T diag(m, I) J want, a segment at a time. A freedom turns its side about its signed
    // axis through its joint; its generalized force on a segment is the axis along the segment's
    // turning and the axis x arm along its centre's.
    tau.fill(0);
    for (let seg = 0; seg < nSegments; seg++) {
      const lo = segStart[seg]!, hi = segStart[seg + 1]!;
      if (lo === hi) continue;
      const o = seg * STRIDE, cx = state[o]!, cy = state[o + 1]!, cz = state[o + 2]!;
      let vx = 0, vy = 0, vz = 0, wx = 0, wy = 0, wz = 0;
      for (let q = lo; q < hi; q++) {
        const d = segDofs[q]!, ax = axis[3 * d]!, ay = axis[3 * d + 1]!, az = axis[3 * d + 2]!, w = want[d]! * segShare[q]!;
        const rx = cx - point[3 * d]!, ry = cy - point[3 * d + 1]!, rz = cz - point[3 * d + 2]!;
        vx += (ay * rz - az * ry) * w; vy += (az * rx - ax * rz) * w; vz += (ax * ry - ay * rx) * w;
        wx += ax * w; wy += ay * w; wz += az * w;
      }
      const m = masses[seg]!;
      vx *= m; vy *= m; vz *= m;
      // I W = R I0 R^T W, R the segment's turn from its reference pose.
      const qx = state[o + 3]!, qy = state[o + 4]!, qz = state[o + 5]!, qw = state[o + 6]!;
      rotate(-qx, -qy, -qz, qw, wx, wy, wz, s, 0);
      const I = seg * 9;
      const lx = restInertia[I]! * s[0]! + restInertia[I + 1]! * s[1]! + restInertia[I + 2]! * s[2]!;
      const ly = restInertia[I + 3]! * s[0]! + restInertia[I + 4]! * s[1]! + restInertia[I + 5]! * s[2]!;
      const lz = restInertia[I + 6]! * s[0]! + restInertia[I + 7]! * s[1]! + restInertia[I + 8]! * s[2]!;
      rotate(qx, qy, qz, qw, lx, ly, lz, s, 3);
      const Lx = s[3]!, Ly = s[4]!, Lz = s[5]!;
      for (let q = lo; q < hi; q++) {
        const d = segDofs[q]!, ax = axis[3 * d]!, ay = axis[3 * d + 1]!, az = axis[3 * d + 2]!, w = segShare[q]!;
        const rx = cx - point[3 * d]!, ry = cy - point[3 * d + 1]!, rz = cz - point[3 * d + 2]!;
        tau[d] += w * ((ay * rz - az * ry) * vx + (az * rx - ax * rz) * vy + (ax * ry - ay * rx) * vz + ax * Lx + ay * Ly + az * Lz);
      }
    }
    // Clamp and hand over: + on the child, - on the parent.
    torques.fill(0);
    for (const j of joints) {
      const sign = j.onParent ? -1 : 1;
      let lx = 0, ly = 0, lz = 0;
      for (let k = 0; k < j.axes.length; k++) {
        const d = j.first + k;
        // tau is the force conjugate to the freedom's rate u = a.(w_child - w_parent), which is the
        // joint's torque t (power t u) whichever side it turns; the stored axis is signed toward that side.
        let t = tau[d]! + grav[d]!;
        if (t > j.peakPositive[k]!) t = j.peakPositive[k]!;
        else if (t < -j.peakNegative[k]!) t = -j.peakNegative[k]!;
        dofTorques[d] = t;
        lx += t * sign * axis[3 * d]!; ly += t * sign * axis[3 * d + 1]!; lz += t * sign * axis[3 * d + 2]!;
      }
      const tc = j.child * 3;
      torques[tc] += lx; torques[tc + 1] += ly; torques[tc + 2] += lz;
      if (j.parent >= 0) {
        const tp = j.parent * 3;
        torques[tp] -= lx; torques[tp + 1] -= ly; torques[tp + 2] -= lz;
      }
    }
  }
  return { joints, byName: new Map(joints.map((j) => [j.name, j])), torques, dofTorques, compute };
}

/** (vx, vy, vz) turned by the unit quaternion (x, y, z, w), into out[at..at+2]. */
function rotate(x: number, y: number, z: number, w: number, vx: number, vy: number, vz: number, out: Float64Array, at: number): void {
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  out[at] = vx + w * tx + y * tz - z * ty;
  out[at + 1] = vy + w * ty + z * tx - x * tz;
  out[at + 2] = vz + w * tz + x * ty - y * tx;
}

/**
 * A freedom's angle as the controller reads it: the component along its axis of the rotation vector
 * of the joint's relative rotation (exact for a joint of one freedom).
 */
export function dofAngle(state: Float64Array, j: ControlJoint, k: number): number {
  const q = (i: number): [number, number, number, number] => i < 0 ? [0, 0, 0, 1]
    : [state[i * STRIDE + 3]!, state[i * STRIDE + 4]!, state[i * STRIDE + 5]!, state[i * STRIDE + 6]!];
  const [px, py, pz, pw] = q(j.parent), [cx, cy, cz, cw] = q(j.child);
  let rx = pw * cx - px * cw - py * cz + pz * cy;
  let ry = pw * cy + px * cz - py * cw - pz * cx;
  let rz = pw * cz - px * cy + py * cx - pz * cw;
  let rw = pw * cw + px * cx + py * cy + pz * cz;
  if (rw < 0) { rx = -rx; ry = -ry; rz = -rz; rw = -rw; }
  const vn = Math.hypot(rx, ry, rz);
  const f = vn < 1e-12 ? 2 : (2 * Math.atan2(vn, rw)) / vn;
  const a = j.axes[k]!;
  return f * (a[0] * rx + a[1] * ry + a[2] * rz);
}
