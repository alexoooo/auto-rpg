import type { coupledDynamics } from "../build/coupled-dynamics.ts";
import type { MotionConstraint } from "../build/constrained-mass.ts";
import { CONTACT_FRICTION, type PhysicsWorld, type SegmentBody } from "../engine/engine.ts";
import { activeQuadratic } from "../math/active-quadratic.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { motionFrameKey, type MotionCommand } from "./tasks.ts";

export interface ContactTrackingSettings {
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

/**
 * Experimental sticking-contact prediction with unilateral force and inscribed friction bounds.
 * Geometry is measured; a policy may request a frame free of desired support. Motion rows only
 * constrain the model. The actual world receives muscle torques, never these predicted forces.
 * One redundant-load distribution is considered, so rejection does not certify infeasibility.
 * Sliding friction, contact acquisition and joint stops need separate models or planning.
 */
export function contactTracking(physics: PhysicsWorld, frames: ReadonlyMap<string, SegmentBody>, channels: number, settings: ContactTrackingSettings) {
  if (!Number.isSafeInteger(settings.maxPoints) || settings.maxPoints < 1 || !(settings.gap >= 0) || !Number.isFinite(settings.gap)
    || !(settings.minUpNormal > 0 && settings.minUpNormal <= 1) || !(settings.forceTolerance > 0) || !Number.isFinite(settings.forceTolerance)
    || !(dot(physics.gravity, physics.gravity) > 0)) throw new Error("invalid sticking contact settings");
  const config = Object.freeze({ ...settings }), capacity = channels + 5 * config.maxPoints;
  const solver = activeQuadratic(channels, capacity, config), up = normalized(physics.gravity.map((v) => -v) as unknown as Vec3);
  const points: Point[] = [], motionRows: MotionConstraint[] = [];
  const base = new Float64Array(3 * config.maxPoints), response = new Float64Array(3 * config.maxPoints * channels);
  const matrix = new Float64Array(capacity * channels), lower = new Float64Array(capacity), upper = new Float64Array(capacity);
  const H = new Float64Array(channels * channels), gradient = new Float64Array(channels), normalization = new Float64Array(channels);
  const state = { status: "unconstrained" as "unconstrained" | "accepted" | "rejected", points: 0, tension: 0, frictionViolation: 0,
    solve: null as ReturnType<typeof solver.solve> | null, solver: solver.state,
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
    solve(hessian: Float64Array, rhs: Float64Array, scale: Float64Array, lo: Float64Array, hi: Float64Array, candidate: Float64Array): void {
      if (!points.length) return;
      matrix.fill(0);
      for (let i = 0; i < channels; i++) { matrix[i * channels + i] = 1; lower[i] = lo[i]!; upper[i] = hi[i]!; }
      let rows = channels;
      points.forEach((point, p) => coefficients(point).forEach((axis, kind) => {
        let offset = 0; for (let k = 0; k < 3; k++) offset += axis[k]! * base[3 * p + k]!;
        for (let i = 0; i < channels; i++) {
          let value = 0; for (let k = 0; k < 3; k++) value += axis[k]! * response[(3 * p + k) * channels + i]!;
          matrix[rows * channels + i] = value * scale[i]!;
        }
        lower[rows] = kind === 0 ? -offset : -Infinity; upper[rows] = kind === 0 ? Infinity : -offset; rows++;
      }));
      let valid = true;
      for (let r = 0; r < rows; r++) {
        let value = 0; for (let i = 0; i < channels; i++) value += matrix[r * channels + i]! * candidate[i]!;
        if (value < lower[r]! || value > upper[r]!) valid = false;
      }
      if (valid) { state.status = "accepted"; return; }
      for (let i = 0; i < channels; i++) normalization[i] = 1 / Math.sqrt(hessian[i * channels + i]!);
      for (let i = 0; i < channels; i++) {
        gradient[i] = -rhs[i]! * normalization[i]!;
        for (let j = 0; j <= i; j++) H[i * channels + j] = H[j * channels + i] = hessian[i * channels + j]! * normalization[i]! * normalization[j]!;
      }
      for (let r = 0; r < rows; r++) {
        let length = 0;
        for (let i = 0; i < channels; i++) { const k = r * channels + i; matrix[k]! *= normalization[i]!; length += matrix[k]! * matrix[k]!; }
        length = Math.sqrt(length);
        if (length > 0) {
          for (let i = 0; i < channels; i++) matrix[r * channels + i]! /= length;
          lower[r]! /= length; upper[r]! /= length;
        }
      }
      state.solve = solver.solve({ hessian: H, gradient, matrix, lower, upper, rows });
      state.status = state.solve.status === "converged" ? "accepted" : "rejected";
      for (let i = 0; i < channels; i++) candidate[i] = state.status === "accepted" ? solver.state.x[i]! * normalization[i]! : 0;
    },
    verify(model: ReturnType<typeof coupledDynamics>, torque: Float64Array): void {
      if (!points.length || state.status === "rejected") return;
      const multipliers = model.reactionMultipliers(torque), offset = multipliers.length - 3 * points.length;
      points.forEach((point, p) => {
        const force: Vec3 = [multipliers[offset + 3 * p]!, multipliers[offset + 3 * p + 1]!, multipliers[offset + 3 * p + 2]!];
        const normal = dot(force, point.normal), a = dot(force, point.tangent), b = dot(force, point.across);
        state.tension = Math.max(state.tension, -normal);
        state.frictionViolation = Math.max(state.frictionViolation, Math.sqrt(a * a + b * b) - CONTACT_FRICTION * normal);
        state.forces.push({ frame: point.frame, point: [...point.point] as Vec3, force });
      });
      if (!Number.isFinite(state.tension + state.frictionViolation) || state.tension > config.forceTolerance || state.frictionViolation > config.forceTolerance) {
        state.status = "rejected"; torque.fill(0);
      }
    },
    report() { return { status: state.status, points: state.points, tension: state.tension, frictionViolation: state.frictionViolation,
      solve: state.solve ? { ...state.solve } : null, forces: state.forces.map((f) => ({ frame: f.frame, point: [...f.point] as Vec3, force: [...f.force] as Vec3 })) }; },
  };
}
