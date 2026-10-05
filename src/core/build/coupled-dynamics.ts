import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { SegmentBody } from "../engine/engine.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { BuiltBody } from "./build-body.ts";
import { constraintBasis, type MotionConstraint } from "./constrained-mass.ts";
import { bodyDynamics } from "./dynamics.ts";
import { jointAngles } from "./joint-state.ts";

interface AttachedItem { readonly body: SegmentBody; motionConstraints(): readonly MotionConstraint[] }
interface Load { readonly body: SegmentBody; readonly point: Vec3; readonly force: Vec3; readonly moment: Vec3 }
const XYZ: readonly Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], ZERO: Vec3 = [0, 0, 0];
/** Relative rank tolerance after mass whitening, a numeric setting (`docs/reference/coupled-dynamics.md`). */
const RANK_TOLERANCE = 1e-10;
const dot = (a: ArrayLike<number>, b: ArrayLike<number>): number => {
  let sum = 0; for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!; return sum;
};
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const tuple = (v: Vector3): Vec3 => [v.x, v.y, v.z];

/**
 * Instantaneous acceleration model: a floating anatomical tree and separately massive items,
 * constrained by every active grip. The tree supplies its full root/joint mass and velocity bias;
 * items supply world inertia and gyroscopic bias. Mass-whitened constraints retain closed loops
 * without adding penalty springs or counting an item's mass twice. Contacts are explicit loads,
 * not assumed welds. Fixed bodies must be declared by the experiment. Additional motion rows
 * are predictions supplied at update, not constraints installed in the physical world.
 *
 * This model predicts acceleration at the current pose; it does not apply commands or stabilize
 * position error. Returned arrays are detached. Its allocating diagnostic path is not a step-cost
 * optimized controller. `update` freezes the pose, velocities and attachment set for queries.
 */
export function coupledDynamics(built: BuiltBody, gravity: Vec3, items: readonly AttachedItem[] = [], fixed: readonly SegmentBody[] = []) {
  if (gravity.length !== 3 || !gravity.every(Number.isFinite)) throw new Error("invalid coupled gravity");
  const segments = [...built.segments.values()], joints = [...built.joints.values()], registered = [...items];
  const accelerationOfGravity: Vec3 = [...gravity], fixedBodies = [...fixed];
  const members = segments.map((s) => s.body).concat(registered.map((i) => i.body));
  if (new Set(members).size !== members.length || fixed.some((b) => !members.includes(b))) throw new Error("invalid coupled dynamics membership");
  const tree = bodyDynamics(built, accelerationOfGravity), count = joints.reduce((s, j) => s + j.dofs.length, 0), size = 6 + count + 6 * registered.length;
  const byBody = new Map(segments.map((s) => [s.body, s]));
  const byChild = new Map(joints.map((j) => [j.child, j]));
  const channels = joints.flatMap((joint) => joint.dofs.map(() => joint));
  const ancestors = new Map(segments.map((s) => {
    const chain = new Set<typeof joints[number]>();
    for (let j = byChild.get(s); j; j = byChild.get(j.parent)) chain.add(j);
    return [s.body, channels.flatMap((j, i) => chain.has(j) ? [i] : [])] as const;
  }));
  const itemIndex = new Map(registered.map((item, i) => [item.body, 6 + count + 6 * i]));
  const centres = new Map<SegmentBody, Vec3>(), spins = new Map(segments.map((s) => [s, new Vector3()]));
  const drift = new Map<SegmentBody, { centre: Vec3; angular: Vec3; spin: Vec3 }>();
  const basis: number[][] = [], targets: number[] = [];
  let reactionFactor: number[][] = [], reactionRows: { length: number; coefficients: number[] }[] = [], reactionConstraints: MotionConstraint[] = [];
  let lower: number[][] = [], force: number[] = [], constraints: { row: number[]; target: number }[] = [], ready = false;
  const point = new Vector3(), linear = new Vector3(), angular = new Vector3(), rotation = new Quaternion();

  const forward = (value: ArrayLike<number>): number[] => {
    const out = new Array<number>(size);
    for (let r = 0; r < size; r++) {
      let valueAt = value[r]!; for (let c = 0; c < r; c++) valueAt -= lower[r]![c]! * out[c]!;
      out[r] = valueAt / lower[r]![r]!;
    }
    return out;
  };
  const backward = (value: ArrayLike<number>): number[] => {
    const out = new Array<number>(size);
    for (let r = size - 1; r >= 0; r--) {
      let valueAt = value[r]!; for (let c = r + 1; c < size; c++) valueAt -= lower[c]![r]! * out[c]!;
      out[r] = valueAt / lower[r]![r]!;
    }
    return out;
  };
  const rowOf = (entries: MotionConstraint): number[] => {
    const row = new Array<number>(size).fill(0);
    for (const e of entries) {
      if (!members.includes(e.body) || ![...e.point, ...e.linear, ...e.angular].every(Number.isFinite)) throw new Error("invalid coupled motion row");
      const item = itemIndex.get(e.body), origin = item === undefined ? tree.root.centre : centres.get(e.body)!;
      const moment = cross(sub(e.point, origin), e.linear), offset = item ?? 0;
      for (let k = 0; k < 3; k++) { row[offset + k]! += e.angular[k]! + moment[k]!; row[offset + 3 + k]! += e.linear[k]!; }
      if (item === undefined) for (const i of ancestors.get(e.body)!) {
        const m = cross(sub(e.point, tree.pivot(i)), e.linear);
        row[6 + i]! += dot(tree.axis(i), [e.angular[0] + m[0], e.angular[1] + m[1], e.angular[2] + m[2]]);
      }
    }
    return row;
  };
  const driftAt = (body: SegmentBody, at: Vec3): { linear: Vec3; angular: Vec3 } => {
    const d = drift.get(body);
    if (!d) throw new Error("unknown coupled body");
    const r = sub(at, centres.get(body)!), turn = cross(d.angular, r), swing = cross(d.spin, cross(d.spin, r));
    return { linear: [d.centre[0] + turn[0] + swing[0], d.centre[1] + turn[1] + swing[1], d.centre[2] + turn[2] + swing[2]], angular: d.angular };
  };
  const requireReady = () => { if (!ready) throw new Error("coupled dynamics needs update before a query"); };
  const freeMotion = (torque: ArrayLike<number>, loads: readonly Load[]): number[] => {
    requireReady();
    if (torque.length !== count || !Array.from(torque).every(Number.isFinite)) throw new Error("invalid coupled actuator torques");
    const total = [...force];
    for (let i = 0; i < count; i++) total[6 + i]! += torque[i]!;
    for (const load of loads) {
      const row = rowOf([{ body: load.body, point: load.point, linear: load.force, angular: load.moment }]);
      for (let i = 0; i < size; i++) total[i]! += row[i]!;
    }
    return forward(total);
  };

  const reactionMultipliers = (torque: ArrayLike<number>, loads: readonly Load[] = []): number[] => {
  const free = freeMotion(torque, loads), weights = basis.map((b, k) => targets[k]! - dot(b, free));
  for (let r = 0; r < weights.length; r++) {
    for (let c = 0; c < r; c++) weights[r]! -= reactionFactor[r]![c]! * weights[c]!;
    weights[r]! /= reactionFactor[r]![r]!;
  }
  for (let r = weights.length - 1; r >= 0; r--) {
    for (let c = r + 1; c < weights.length; c++) weights[r]! -= reactionFactor[c]![r]! * weights[c]!;
    weights[r]! /= reactionFactor[r]![r]!;
  }
    return reactionRows.map((row) => row.length === 0 ? 0 : dot(row.coefficients, weights) / row.length);
  };

  return {
    channels: count,
    update(motionRows: readonly MotionConstraint[] = []): void {
      ready = false; basis.length = 0; targets.length = 0; drift.clear(); centres.clear();
      for (const s of segments) s.body.angularVelocityToRef(spins.get(s)!);
      tree.update(joints.map((joint) => jointAngles(joint)), { spin: (s) => spins.get(s)! });
      const mass = Array.from({ length: size }, () => new Array<number>(size).fill(0));
      force = new Array<number>(size).fill(0);
      for (let r = 0; r < 6; r++) {
        force[r] = tree.root.gravity[r]! - tree.root.bias[r]!;
        for (let c = 0; c < 6; c++) mass[r]![c] = tree.root.mass[r]![c]!;
        for (let i = 0; i < count; i++) mass[r]![6 + i] = mass[6 + i]![r] = tree.root.coupling[r]![i]!;
      }
      for (let i = 0; i < count; i++) {
        force[6 + i] = tree.gravity[i]! - tree.bias[i]!;
        for (let j = 0; j < count; j++) mass[6 + i]![6 + j] = tree.mass[i]![j]!;
      }
      for (const b of members) {
        point.set(...b.massProperties.centre).applyRotationQuaternionToRef(b.node.rotationQuaternion!, point).addInPlace(b.node.position);
        centres.set(b, tuple(point));
        const segment = byBody.get(b);
        if (segment) {
          tree.driftToRef(segment, point, linear, angular);
          drift.set(b, { centre: tuple(linear), angular: tuple(angular), spin: tuple(spins.get(segment)!) });
        } else {
          b.angularVelocityToRef(angular);
          drift.set(b, { centre: ZERO, angular: ZERO, spin: tuple(angular) });
          const offset = itemIndex.get(b)!, properties = b.massProperties;
          b.node.rotationQuaternion!.multiplyToRef(properties.orientation, rotation);
          const axes = XYZ.map((axis) => tuple(new Vector3(...axis).applyRotationQuaternionToRef(rotation, point)));
          const momentum: number[] = [0, 0, 0];
          for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
            const inertia = axes.reduce((sum, a, k) => sum + properties.moments[k]! * a[r]! * a[c]!, 0);
            mass[offset + r]![offset + c] = inertia;
            momentum[r]! += inertia * [angular.x, angular.y, angular.z][c]!;
          }
          const gyro = cross(tuple(angular), momentum as unknown as Vec3);
          for (let k = 0; k < 3; k++) {
            mass[offset + 3 + k]![offset + 3 + k] = properties.mass;
            force[offset + k] = -gyro[k]!; force[offset + 3 + k] = properties.mass * accelerationOfGravity[k]!;
          }
        }
      }
      lower = mass.map((row) => row.map(() => 0));
      for (let r = 0; r < size; r++) for (let c = 0; c <= r; c++) {
        let v = mass[r]![c]!; for (let k = 0; k < c; k++) v -= lower[r]![k]! * lower[c]![k]!;
        if (r === c && !(v > 0 && Number.isFinite(v))) throw new Error("coupled mass is not positive definite");
        lower[r]![c] = r === c ? Math.sqrt(v) : v / lower[c]![c]!;
      }
      const rows = registered.flatMap((i) => [...i.motionConstraints()]);
      for (const body of fixedBodies) {
        const at = centres.get(body)!;
        // A fixed body's three translations and three spins are explicit external constraints.
        for (const axis of XYZ) rows.push([{ body, point: at, linear: axis, angular: ZERO }], [{ body, point: at, linear: ZERO, angular: axis }]);
      }
      rows.push(...motionRows);
      reactionConstraints = rows.map((row) => row.map((e) => ({ body: e.body, point: [...e.point] as Vec3,
        linear: [...e.linear] as Vec3, angular: [...e.angular] as Vec3 })));
      constraints = rows.map((entries) => ({ row: rowOf(entries), target: -entries.reduce((sum, e) => {
        const d = driftAt(e.body, e.point); return sum + dot(e.linear, d.linear) + dot(e.angular, d.angular);
      }, 0) }));
      const whitened = constraints.map((c) => forward(c.row));
      basis.push(...constraintBasis(whitened, RANK_TOLERANCE));
      // Redundant rows can have slightly inconsistent acceleration targets because the engine's
      // joints retain small relative-velocity errors. Fit all normalized rows, rather than giving
      // whichever rows arrived first authority over the loop's acceleration bias.
      const rank = basis.length, normal = Array.from({ length: rank }, () => new Array<number>(rank).fill(0)), rhs = new Array<number>(rank).fill(0);
      reactionRows = [];
      whitened.forEach((row, index) => {
        const length = Math.sqrt(dot(row, row));
        const coefficients = basis.map((b) => length === 0 ? 0 : dot(row, b) / length);
        reactionRows.push({ length, coefficients });
        if (length === 0) return;
        const target = constraints[index]!.target / length;
        for (let r = 0; r < rank; r++) {
          rhs[r]! += coefficients[r]! * target;
          for (let c = 0; c < rank; c++) normal[r]![c]! += coefficients[r]! * coefficients[c]!;
        }
      });
      for (let r = 0; r < rank; r++) for (let c = 0; c <= r; c++) {
        let value = normal[r]![c]!; for (let k = 0; k < c; k++) value -= normal[r]![k]! * normal[c]![k]!;
        normal[r]![c] = r === c ? Math.sqrt(value) : value / normal[c]![c]!;
      }
      for (let r = 0; r < rank; r++) {
        let value = rhs[r]!; for (let c = 0; c < r; c++) value -= normal[r]![c]! * targets[c]!;
        targets[r] = value / normal[r]![r]!;
      }
      for (let r = rank - 1; r >= 0; r--) {
        let value = targets[r]!; for (let c = r + 1; c < rank; c++) value -= normal[c]![r]! * targets[c]!;
        targets[r] = value / normal[r]![r]!;
      }
      reactionFactor = normal; ready = true;
    },
    solve(torque: ArrayLike<number>, loads: readonly Load[] = []): number[] {
      const motion = freeMotion(torque, loads);
      for (let pass = 0; pass < 2; pass++) for (let k = 0; k < basis.length; k++) {
        const weight = targets[k]! - dot(motion, basis[k]!);
        for (let i = 0; i < size; i++) motion[i]! += weight * basis[k]![i]!;
      }
      return backward(motion);
    },
    /**
     * Reaction multipliers for the chosen constraints, in equipment/pin/supplied-row order.
     * Redundant rows use the minimum norm of mass-whitened row contributions. This is one
     * distribution, not a unilateral/friction feasibility certificate. Negative normal loads
     * remain negative; a contact controller must reject or change an inadmissible assumption.
     */
    reactionMultipliers,
    /** Equivalent body loads for each constraint's reaction multiplier. */
    reactions(torque: ArrayLike<number>, loads: readonly Load[] = []) {
      return reactionMultipliers(torque, loads).map((multiplier, i) => {
        return { multiplier, loads: reactionConstraints[i]!.map((e): Load => ({ body: e.body, point: [...e.point] as Vec3,
          force: e.linear.map((v) => v * multiplier) as unknown as Vec3,
          moment: e.angular.map((v) => v * multiplier) as unknown as Vec3 })) };
      });
    },
    pointAcceleration(body: SegmentBody, at: Vec3, acceleration: ArrayLike<number>) {
      requireReady();
      if (acceleration.length !== size || !Array.from(acceleration).every(Number.isFinite)) throw new Error("invalid coupled acceleration");
      const d = driftAt(body, at);
      return { linear: XYZ.map((axis, k) => dot(rowOf([{ body, point: at, linear: axis, angular: ZERO }]), acceleration) + d.linear[k]!),
        angular: XYZ.map((axis, k) => dot(rowOf([{ body, point: at, linear: ZERO, angular: axis }]), acceleration) + d.angular[k]!) };
    },
    report(acceleration: ArrayLike<number>) {
      requireReady();
      if (acceleration.length !== size || !Array.from(acceleration).every(Number.isFinite)) throw new Error("invalid coupled acceleration");
      return { coordinates: size, constraints: constraints.length, rank: basis.length,
        maxConstraintResidual: constraints.reduce((max, c) => Math.max(max, Math.abs(dot(c.row, acceleration) - c.target)), 0) };
    },
  };
}
