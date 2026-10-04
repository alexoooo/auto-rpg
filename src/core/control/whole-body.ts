import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody } from "../build/build-body.ts";
import { coupledDynamics } from "../build/coupled-dynamics.ts";
import { ratesToRef } from "../build/joint-state.ts";
import type { SegmentBody } from "../engine/engine.ts";
import type { createEquipment } from "../equipment.ts";
import { boundedLeastSquaresTo, boundedWork, linearWork, solveLinearTo } from "../math/flat.ts";
import type { MuscleDriver } from "../muscle/driver.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { motionFrameKey, type MotionCommand } from "./tasks.ts";

interface TrackingSettings {
  readonly capacity: number;
  /** Regularization of normalized actuator effort; supplied by the experiment. */
  readonly effortCost: number;
}

/**
 * Experimental weighted acceleration tracking through one bounded torque solve. Equipment
 * contributes its mass once and every captured grip constrains the prediction. Contact forces
 * and joint-stop reactions are not predicted; an obstructed objective remains a measured miss.
 * Fixed bodies are explicit fixture constraints, never external forces applied by this controller.
 * The coupled model uses its diagnostic allocation path; this is not the game's standing controller.
 */
export function wholeBodyTracking(built: BuiltBody, muscles: MuscleDriver, gravity: Vec3,
  items: readonly ReturnType<typeof createEquipment>[], fixed: readonly SegmentBody[], settings: TrackingSettings) {
  if (!Number.isSafeInteger(settings.capacity) || settings.capacity < 1 || !(settings.effortCost > 0) || !Number.isFinite(settings.effortCost)) throw new Error("invalid motion tracking settings");
  const capacity = settings.capacity, effortCost = settings.effortCost;
  const dynamics = coupledDynamics(built, gravity, items, fixed), count = muscles.channels.length;
  const frames = new Map<string, SegmentBody>([...built.segments].map(([name, s]) => [motionFrameKey({ kind: "segment", name }), s.body]));
  for (const item of items) {
    const key = motionFrameKey({ kind: "item", id: item.id });
    if (frames.has(key)) throw new Error("duplicate motion item");
    frames.set(key, item.body);
  }
  const rowCapacity = count + 6 * capacity, A = new Float64Array(rowCapacity * count), target = new Float64Array(rowCapacity);
  const H = new Float64Array(count * count), rhs = new Float64Array(count), unconstrained = new Float64Array(count);
  const lower = new Float64Array(count), upper = new Float64Array(count), scaled = new Float64Array(count), scale = new Float64Array(count);
  const torque = new Float64Array(count), unit = new Float64Array(count), zero = new Float64Array(count);
  const linear = linearWork(count), bounded = boundedWork(count);
  const position = new Vector3(), centre = new Vector3(), velocity = new Vector3(), spin = new Vector3(), lever = new Vector3();
  const inverse = new Quaternion(), error = new Quaternion(), goalTurn = new Quaternion();
  const channels = new Map(muscles.channels.map((c, i) => [c.name, i]));
  const state = { steps: 0, residual: 0, saturated: 0,
    errors: [] as { id: string; position: number | null; orientation: number | null }[] };
  return {
    state,
    /** Validate capacity and names before a host applies any associated grip action. */
    check(command: MotionCommand): void {
      if (command.frames.length > capacity || command.joints.length > count
        || command.frames.some((g) => !frames.has(motionFrameKey(g.frame)))
        || command.joints.some((g) => !channels.has(g.channel))) throw new Error("motion objectives exceed this controller's model or capacity");
    },
    track(command: MotionCommand): Float64Array {
      dynamics.update();
      const base = dynamics.solve(zero), columns: number[][] = [];
      for (let i = 0; i < count; i++) {
        scale[i] = Math.max(muscles.strength(i, -1), muscles.strength(i, 1)) || 1;
        lower[i] = -muscles.strength(i, -1) / scale[i]!;
        upper[i] = muscles.strength(i, 1) / scale[i]!;
        unit[i] = 1;
        columns.push(dynamics.solve(unit).map((v, k) => v - base[k]!));
        unit[i] = 0;
      }
      let rows = 0;
      const add = (values: readonly number[], asked: number, weight: number) => {
        for (let i = 0; i < count; i++) A[rows * count + i] = values[i]! * scale[i]! * weight;
        target[rows++] = asked * weight;
      };
      for (const goal of command.joints) {
        const i = channels.get(goal.channel)!, c = muscles.channels[i]!, first = i - c.index, length = c.joint.dofs.length;
        const angles = Array.from({ length }, (_, k) => muscles.angle(first + k));
        const coefficients = Array.from({ length }, (_, k) => ratesToRef(c.joint, angles,
          Array.from({ length }, (_, j) => k === j ? 1 : 0), [])[c.index]!);
        const baseRate = coefficients.reduce((sum, v, k) => sum + v * base[6 + first + k]!, 0);
        const row = columns.map((column) => coefficients.reduce((sum, v, k) => sum + v * column[6 + first + k]!, 0));
        const rate = 1 / goal.seconds;
        add(row, goal.acceleration + rate * rate * (goal.angle - muscles.angle(i)) + 2 * rate * (goal.rate - muscles.rate(i)) - baseRate, goal.weight);
      }
      state.errors.length = 0;
      const noAcceleration = base.map(() => 0);
      for (const goal of command.frames) {
        const body = frames.get(motionFrameKey(goal.frame))!, node = body.node, rotation = node.rotationQuaternion!;
        position.set(...goal.at).applyRotationQuaternionToRef(rotation, position).addInPlace(node.position);
        centre.set(...body.massProperties.centre).applyRotationQuaternionToRef(rotation, centre).addInPlace(node.position);
        body.angularVelocityToRef(spin); body.linearVelocityToRef(velocity);
        position.subtractToRef(centre, lever); Vector3.CrossToRef(spin, lever, lever); velocity.addInPlace(lever);
        const at: Vec3 = [position.x, position.y, position.z], b = dynamics.pointAcceleration(body, at, base);
        const drift = dynamics.pointAcceleration(body, at, noAcceleration);
        const jacobian = columns.map((column) => {
          const response = dynamics.pointAcceleration(body, at, column);
          return [...response.angular.map((v, k) => v - drift.angular[k]!), ...response.linear.map((v, k) => v - drift.linear[k]!)];
        });
        let positionError: number | null = null, orientationError: number | null = null;
        if (goal.translation) {
          const g = goal.translation, rate = 1 / g.seconds, speed = [velocity.x, velocity.y, velocity.z];
          positionError = 0;
          for (let k = 0; k < 3; k++) {
            const miss = g.target[k]! - at[k]!;
            positionError += miss * miss;
            add(jacobian.map((j) => j[3 + k]!), g.acceleration[k]! + rate * rate * miss + 2 * rate * (g.velocity[k]! - speed[k]!) - b.linear[k]!, g.weight);
          }
          positionError = Math.sqrt(positionError);
        }
        if (goal.orientation) {
          const g = goal.orientation, rate = 1 / g.seconds;
          goalTurn.set(...g.target); Quaternion.InverseToRef(rotation, inverse); goalTurn.multiplyToRef(inverse, error);
          error.normalize();
          const sign = error.w < 0 ? -1 : 1, miss = [sign * error.x, sign * error.y, sign * error.z], speed = [spin.x, spin.y, spin.z];
          orientationError = Math.max(0, 1 - Math.abs(error.w));
          for (let k = 0; k < 3; k++) add(jacobian.map((j) => j[k]!), g.acceleration[k]! + 2 * rate * rate * miss[k]!
            + 2 * rate * (g.velocity[k]! - speed[k]!) - b.angular[k]!, g.weight);
        }
        state.errors.push({ id: goal.id, position: positionError, orientation: orientationError });
      }
      H.fill(0); rhs.fill(0);
      for (let i = 0; i < count; i++) {
        for (let j = 0; j < count; j++) for (let r = 0; r < rows; r++) H[i * count + j]! += A[r * count + i]! * A[r * count + j]!;
        H[i * count + i]! += effortCost;
        for (let r = 0; r < rows; r++) rhs[i]! += A[r * count + i]! * target[r]!;
      }
      solveLinearTo(linear, H, rhs, count, unconstrained);
      boundedLeastSquaresTo(bounded, H, unconstrained, lower, upper, count, scaled);
      state.residual = 0; state.saturated = 0;
      for (let i = 0; i < count; i++) {
        scaled[i] = Math.max(lower[i]!, Math.min(upper[i]!, scaled[i]!));
        torque[i] = scaled[i]! * scale[i]!;
        if (scaled[i] === lower[i] || scaled[i] === upper[i]) state.saturated++;
      }
      for (let r = 0; r < rows; r++) {
        let miss = -target[r]!;
        for (let i = 0; i < count; i++) miss += A[r * count + i]! * scaled[i]!;
        state.residual += miss * miss;
      }
      state.residual = Math.sqrt(state.residual); state.steps++;
      if (!Number.isFinite(state.residual) || !torque.every(Number.isFinite)) throw new Error("nonfinite motion tracking result");
      return torque;
    },
  };
}
