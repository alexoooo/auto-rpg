import type { coupledDynamics } from "../build/coupled-dynamics.ts";
import { constraintBasis, type MotionConstraint } from "../build/constrained-mass.ts";
import { CONTACT_FRICTION, type PhysicsWorld, type SegmentBody } from "../engine/engine.ts";
import { activeQuadratic } from "../math/active-quadratic.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { checkEffortBounds, type EffortBound } from "./effort-bounds.ts";
import { motionFrameKey, type MotionCommand } from "./tasks.ts";

export interface ContactTrackingSettings {
  readonly redistributionCost?: number;
  readonly maxPoints: number;
  readonly gap: number;
  readonly minUpNormal: number;
  readonly forceTolerance: number;
  readonly iterations: number;
  readonly absoluteTolerance: number;
  readonly relativeTolerance: number;
}

interface Point { readonly frame: string; readonly point: Vec3; readonly normal: Vec3; readonly tangent: Vec3; readonly across: Vec3 }
const XYZ: readonly Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], ZERO: Vec3 = [0, 0, 0];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalized = (v: Vec3): Vec3 => { const length = Math.sqrt(dot(v, v)); return [v[0] / length, v[1] / length, v[2] / length]; };
/** Relative wrench rank and absolute unit-vector residual thresholds: numeric settings (`docs/reference/contact-distribution.md`). */
const DISTRIBUTION_RANK = 1e-10;

/** Force redistributions that preserve each contacted body's net force and moment. */
function distributionModes(points: readonly Point[]): number[][] {
  const modes: number[][] = [];
  for (const frame of new Set(points.map((p) => p.frame))) {
    const selected = points.flatMap((p, i) => p.frame === frame ? [i] : []), size = 3 * selected.length;
    const origin = points[selected[0]!]!.point, rows = Array.from({ length: 6 }, () => new Array<number>(size).fill(0));
    selected.forEach((p, i) => {
      const at = points[p]!.point.map((v, k) => v - origin[k]!) as unknown as Vec3;
      for (let k = 0; k < 3; k++) {
        rows[k]![3 * i + k] = 1;
        const moment = cross(at, XYZ[k]!);
        for (let j = 0; j < 3; j++) rows[3 + j]![3 * i + k] = moment[j]!;
      }
    });
    const basis = constraintBasis(rows, DISTRIBUTION_RANK), remaining: number[][] = [];
    for (let i = 0; i < size; i++) {
      const v = new Array<number>(size).fill(0); v[i] = 1;
      for (let pass = 0; pass < 2; pass++) for (const q of basis) {
        let along = 0; for (let j = 0; j < size; j++) along += v[j]! * q[j]!;
        for (let j = 0; j < size; j++) v[j]! -= along * q[j]!;
      }
      if (v.reduce((sum, x) => sum + x * x, 0) > DISTRIBUTION_RANK * DISTRIBUTION_RANK) remaining.push(v);
    }
    for (const mode of constraintBasis(remaining, DISTRIBUTION_RANK)) {
      const full = new Array<number>(3 * points.length).fill(0);
      selected.forEach((p, i) => { for (let k = 0; k < 3; k++) full[3 * p + k] = mode[3 * i + k]!; }); modes.push(full);
    }
  }
  return modes;
}

/**
 * Experimental sticking-contact prediction with unilateral force and inscribed friction bounds.
 * Geometry is measured; a policy may request a frame free of desired support. Motion rows only
 * constrain the model. The actual world receives muscle torques, never these predicted forces.
 * Optional force redistribution preserves each body's wrench. Cross-body load redistribution
 * remains restricted to the torque response, so rejection does not certify infeasibility.
 * Additional affine effort rows can share this solve. Sliding friction, contact acquisition and
 * selection of joint stops need separate models or planning.
 */
export function contactTracking(physics: PhysicsWorld, frames: ReadonlyMap<string, SegmentBody>, channels: number, settings: ContactTrackingSettings, extraCapacity = 0) {
  if (!Number.isSafeInteger(extraCapacity) || extraCapacity < 0 || !Number.isSafeInteger(settings.maxPoints) || settings.maxPoints < 1 || !(settings.gap >= 0) || !Number.isFinite(settings.gap)
    || !(settings.minUpNormal > 0 && settings.minUpNormal <= 1) || !(settings.forceTolerance > 0) || !Number.isFinite(settings.forceTolerance)
    || !(dot(physics.gravity, physics.gravity) > 0)) throw new Error("invalid sticking contact settings");
  if (settings.redistributionCost !== undefined && !(Number.isFinite(settings.redistributionCost) && settings.redistributionCost > 0)) throw new Error("invalid contact redistribution cost");
  const config = Object.freeze({ ...settings }), capacity = channels + 5 * config.maxPoints + extraCapacity;
  let size = channels, solver = activeQuadratic(size, capacity, config);
  const up = normalized(physics.gravity.map((v) => -v) as unknown as Vec3);
  const forceScale = [...frames.values()].reduce((sum, body) => sum + body.massProperties.mass, 0) * Math.sqrt(dot(physics.gravity, physics.gravity));
  let modes: number[][] = [];
  const points: Point[] = [], motionRows: MotionConstraint[] = [];
  const base = new Float64Array(3 * config.maxPoints), response = new Float64Array(3 * config.maxPoints * channels);
  let matrix = new Float64Array(capacity * size);
  const lower = new Float64Array(capacity), upper = new Float64Array(capacity);
  let H = new Float64Array(size * size), gradient = new Float64Array(size), normalization = new Float64Array(size);
  const state = { status: "unconstrained" as "unconstrained" | "accepted" | "rejected", points: 0, tension: 0, frictionViolation: 0,
    solve: null as ReturnType<typeof solver.solve> | null,
    solver: { x: new Float64Array(channels + (config.redistributionCost === undefined ? 0 : 3 * config.maxPoints)), dual: new Float64Array(capacity) },
    redistribution: [] as number[],
    forces: [] as { frame: string; point: Vec3; force: Vec3 }[] };
  const coefficients = (point: Point): readonly Vec3[] => {
    const fraction = CONTACT_FRICTION / Math.sqrt(2);
    return [point.normal, ...[point.tangent, point.across].flatMap((t): Vec3[] => [
      [t[0] - fraction * point.normal[0], t[1] - fraction * point.normal[1], t[2] - fraction * point.normal[2]],
      [-t[0] - fraction * point.normal[0], -t[1] - fraction * point.normal[1], -t[2] - fraction * point.normal[2]]])];
  };
  return {
    state,
    read(command: MotionCommand): readonly MotionConstraint[] {
      points.length = 0; motionRows.length = 0; state.solve = null; state.forces.length = 0;
      state.status = "unconstrained"; state.tension = 0; state.frictionViolation = 0;
      const free = new Set(command.supports?.filter((s) => s.mode === "free").map((s) => motionFrameKey(s.frame)));
      for (const [frame, body] of frames) {
        if (free.has(frame)) continue;
        for (const manifold of physics.contactManifoldsOf(body, (other) => other === null)) {
          const normal = normalized(manifold.normal.map((v) => -v) as unknown as Vec3);
          if (dot(normal, up) < config.minUpNormal) continue;
          const axis: Vec3 = Math.abs(normal[0]) < Math.abs(normal[1]) ? XYZ[0]! : XYZ[1]!;
          const along = dot(axis, normal), tangent = normalized(axis.map((v, k) => v - along * normal[k]!) as unknown as Vec3), across = cross(tangent, normal);
          for (const point of manifold.points) {
            if (point.distance > config.gap) continue;
            if (points.length === config.maxPoints) throw new Error("sticking contact model capacity exceeded");
            points.push({ frame, point: point.point, normal, tangent, across });
            for (const direction of XYZ) motionRows.push([{ body, point: point.point, linear: direction, angular: ZERO }]);
          }
        }
      }
      modes = config.redistributionCost === undefined ? [] : distributionModes(points);
      if (size !== channels + modes.length) {
        size = channels + modes.length; solver = activeQuadratic(size, capacity, config);
        matrix = new Float64Array(capacity * size); H = new Float64Array(size * size);
        gradient = new Float64Array(size); normalization = new Float64Array(size);
      }
      state.redistribution = new Array<number>(3 * points.length).fill(0);
      state.points = points.length;
      return motionRows;
    },
    base(multipliers: readonly number[]): void {
      const offset = multipliers.length - 3 * points.length;
      for (let r = 0; r < 3 * points.length; r++) base[r] = multipliers[offset + r]!;
    },
    column(i: number, multipliers: readonly number[]): void {
      const offset = multipliers.length - 3 * points.length;
      for (let r = 0; r < 3 * points.length; r++) response[r * channels + i] = multipliers[offset + r]! - base[r]!;
    },
    solve(hessian: Float64Array, rhs: Float64Array, scale: Float64Array, lo: Float64Array, hi: Float64Array, candidate: Float64Array, extra: readonly EffortBound[] = []): void {
      checkEffortBounds(extra, channels, extraCapacity);
      if (!points.length && !extra.length) return;
      matrix.fill(0);
      for (let i = 0; i < channels; i++) { matrix[i * size + i] = 1; lower[i] = lo[i]!; upper[i] = hi[i]!; }
      let rows = channels;
      points.forEach((point, p) => coefficients(point).forEach((axis, kind) => {
        let offset = 0; for (let k = 0; k < 3; k++) offset += axis[k]! * base[3 * p + k]!;
        for (let i = 0; i < channels; i++) {
          let value = 0; for (let k = 0; k < 3; k++) value += axis[k]! * response[(3 * p + k) * channels + i]!;
          matrix[rows * size + i] = value * scale[i]!;
        }
        modes.forEach((mode, i) => {
          let value = 0; for (let k = 0; k < 3; k++) value += axis[k]! * mode[3 * p + k]!;
          matrix[rows * size + channels + i] = value * forceScale;
        });
        lower[rows] = kind === 0 ? -offset : -Infinity; upper[rows] = kind === 0 ? Infinity : -offset; rows++;
      }));
      for (const bound of extra) {
        for (let i = 0; i < channels; i++) matrix[rows * size + i] = bound.coefficients[i]! * scale[i]!;
        lower[rows] = bound.lower; upper[rows] = bound.upper; rows++;
      }
      let valid = true;
      for (let r = 0; r < rows; r++) {
        let value = 0; for (let i = 0; i < channels; i++) value += matrix[r * size + i]! * candidate[i]!;
        if (value < lower[r]! || value > upper[r]!) valid = false;
      }
      if (valid) { state.status = "accepted"; return; }
      H.fill(0); gradient.fill(0);
      for (let i = 0; i < size; i++) normalization[i] = 1 / Math.sqrt(i < channels ? hessian[i * channels + i]! : config.redistributionCost!);
      for (let i = 0; i < channels; i++) {
        gradient[i] = -rhs[i]! * normalization[i]!;
        for (let j = 0; j <= i; j++) H[i * size + j] = H[j * size + i] = hessian[i * channels + j]! * normalization[i]! * normalization[j]!;
      }
      for (let i = channels; i < size; i++) H[i * size + i] = 1;
      for (let r = 0; r < rows; r++) {
        let length = 0;
        for (let i = 0; i < size; i++) { const k = r * size + i; matrix[k]! *= normalization[i]!; length += matrix[k]! * matrix[k]!; }
        length = Math.sqrt(length);
        if (length > 0) {
          for (let i = 0; i < size; i++) matrix[r * size + i]! /= length;
          lower[r]! /= length; upper[r]! /= length;
        }
      }
      state.solve = solver.solve({ hessian: H, gradient, matrix, lower, upper, rows });
      state.solver.x.fill(0); state.solver.x.set(solver.state.x); state.solver.dual.set(solver.state.dual);
      state.status = state.solve.status === "converged" ? "accepted" : "rejected";
      for (let i = 0; i < channels; i++) candidate[i] = state.status === "accepted" ? solver.state.x[i]! * normalization[i]! : 0;
      if (state.status === "accepted") modes.forEach((mode, i) => {
        const value = solver.state.x[channels + i]! * normalization[channels + i]! * forceScale;
        for (let r = 0; r < mode.length; r++) state.redistribution[r]! += value * mode[r]!;
      });
    },
    verify(model: ReturnType<typeof coupledDynamics>, torque: Float64Array): void {
      if (!points.length || state.status === "rejected") return;
      const multipliers = model.reactionMultipliers(torque), offset = multipliers.length - 3 * points.length;
      points.forEach((point, p) => {
        const force = [0, 1, 2].map((k) => multipliers[offset + 3 * p + k]! + state.redistribution[3 * p + k]!) as unknown as Vec3;
        const normal = dot(force, point.normal), a = dot(force, point.tangent), b = dot(force, point.across);
        state.tension = Math.max(state.tension, -normal);
        state.frictionViolation = Math.max(state.frictionViolation, Math.sqrt(a * a + b * b) - CONTACT_FRICTION * normal);
        state.forces.push({ frame: point.frame, point: [...point.point] as Vec3, force });
      });
      if (!Number.isFinite(state.tension + state.frictionViolation) || state.tension > config.forceTolerance || state.frictionViolation > config.forceTolerance) {
        state.status = "rejected"; torque.fill(0);
      }
    },
    /** A coupled physical constraint rejects the candidate after the contact solve. */
    reject(): void { state.status = "rejected"; state.forces.length = 0; },
    report() { return { status: state.status, points: state.points, tension: state.tension, frictionViolation: state.frictionViolation,
      solve: state.solve ? { ...state.solve } : null, forces: state.forces.map((f) => ({ frame: f.frame, point: [...f.point] as Vec3, force: [...f.force] as Vec3 })) }; },
  };
}
