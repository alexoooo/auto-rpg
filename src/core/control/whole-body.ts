import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody } from "../build/build-body.ts";
import { coupledDynamics } from "../build/coupled-dynamics.ts";
import { rateBiasToRef, ratesToRef } from "../build/joint-state.ts";
import type { PhysicsWorld, SegmentBody } from "../engine/engine.ts";
import type { createEquipment } from "../equipment.ts";
import { boundedLeastSquaresTo, boundedWork, linearWork, solveLinearTo } from "../math/flat.ts";
import type { MuscleDriver } from "../muscle/driver.ts";
import type { ShapeSpec } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { motionAxes, motionFrameKey, type MotionCommand } from "./tasks.ts";
import { contactTracking, type ContactTrackingSettings } from "./contact-tracking.ts";
import { effortBounds, type EffortBound } from "./effort-bounds.ts";
import { checkedJointStopSettings, nearJointStops, type JointStopSettings } from "./joint-stops.ts";

interface TrackingSettings {
  readonly capacity: number;
  /** Regularization of normalized actuator effort; supplied by the experiment. */
  readonly effortCost: number;
  readonly contact?: { readonly physics: PhysicsWorld; readonly settings: ContactTrackingSettings; readonly dt?: number };
  readonly jointStops?: { readonly settings: JointStopSettings; readonly dt: number };
}

/**
 * Experimental weighted acceleration tracking through one bounded torque solve. Equipment
 * contributes its mass once and every captured grip constrains the prediction. Optional measured
 * sticking support checks unilateral/friction forces. Optional near-stop prediction uses unilateral
 * reactions and end-step coordinate bounds; it does not model distant impacts or sliding contacts.
 * Fixed bodies are explicit fixture constraints, never external forces applied by this controller.
 * The coupled model uses its diagnostic allocation path; this is not the game's default controller.
 */
export function wholeBodyTracking(built: BuiltBody, muscles: MuscleDriver, gravity: Vec3,
  items: readonly ReturnType<typeof createEquipment>[], fixed: readonly SegmentBody[], settings: TrackingSettings) {
  if (!Number.isSafeInteger(settings.capacity) || settings.capacity < 1 || !(settings.effortCost > 0) || !Number.isFinite(settings.effortCost)) throw new Error("invalid motion tracking settings");
  const capacity = settings.capacity, effortCost = settings.effortCost;
  const stopSettings = settings.jointStops ? checkedJointStopSettings(settings.jointStops.settings) : null;
  const stopDt = settings.jointStops?.dt ?? 0;
  if (stopSettings && (!(stopDt > 0) || !Number.isFinite(stopDt))) throw new Error("invalid joint-stop tracking step");
  const dynamics = coupledDynamics(built, gravity, items, fixed), count = muscles.channels.length;
  const frames = new Map<string, SegmentBody>([...built.segments].map(([name, s]) => [motionFrameKey({ kind: "segment", name }), s.body]));
  for (const item of items) {
    const key = motionFrameKey({ kind: "item", id: item.id });
    if (frames.has(key)) throw new Error("duplicate motion item");
    frames.set(key, item.body);
  }
  const liftOff = settings.contact?.settings.liftOff ? { ...settings.contact.settings.liftOff } : null;
  const contactPasses = liftOff ? settings.contact!.settings.maxPoints + 1 : 0;
  const radius = (shapes: readonly ShapeSpec[]) => shapes.map((shape) => {
    switch (shape.kind) {
      case "capsule": case "sphere": return shape.radius.value;
      case "box": case "hull": return 0;
      default: { const never: never = shape; throw new Error(`unknown contact shape ${JSON.stringify(never)}`); }
    }
  });
  const radii = new Map([...built.segments].map(([name, s]) => [motionFrameKey({ kind: "segment", name }), radius(s.rigid.shapes)]));
  for (const item of items) radii.set(motionFrameKey({ kind: "item", id: item.id }), radius(item.spec.shapes));
  const contacts = settings.contact ? contactTracking(settings.contact.physics, frames, count, settings.contact.settings,
    (stopSettings ? count : 0) + (liftOff ? settings.contact.settings.maxPoints : 0), { dt: settings.contact.dt ?? 0, radii }) : null;
  const stopEffort = stopSettings && !contacts && count > 0 ? effortBounds(count, count, stopSettings) : null;
  const rowCapacity = count + 6 * capacity, A = new Float64Array(rowCapacity * count), target = new Float64Array(rowCapacity);
  const H = new Float64Array(count * count), rhs = new Float64Array(count), unconstrained = new Float64Array(count);
  const lower = new Float64Array(count), upper = new Float64Array(count), scaled = new Float64Array(count), scale = new Float64Array(count);
  const torque = new Float64Array(count), unit = new Float64Array(count), zero = new Float64Array(count);
  const linear = linearWork(count), bounded = boundedWork(count);
  const position = new Vector3(), centre = new Vector3(), velocity = new Vector3(), spin = new Vector3(), lever = new Vector3();
  const inverse = new Quaternion(), error = new Quaternion(), goalTurn = new Quaternion();
  const channels = new Map(muscles.channels.map((c, i) => [c.name, i]));
  const state = { steps: 0, residual: 0, saturated: 0, contact: contacts?.state ?? null,
    stops: stopSettings ? { status: "unconstrained" as "unconstrained" | "accepted" | "rejected", work: 0,
      near: 0, active: [] as string[], released: [] as string[], forceViolation: 0, accelerationViolation: 0,
      effort: stopEffort?.state ?? null } : null,
    errors: [] as { id: string; position: number | null; orientation: number | null }[] };
  return {
    state,
    report() { return { steps: state.steps, residual: state.residual, saturated: state.saturated,
      errors: state.errors.map((e) => ({ ...e })), contact: contacts?.report() ?? null,
      stops: state.stops ? { status: state.stops.status, work: state.stops.work, near: state.stops.near,
        active: [...state.stops.active], released: [...state.stops.released], forceViolation: state.stops.forceViolation,
        accelerationViolation: state.stops.accelerationViolation, solve: stopEffort?.state.solve ? { ...stopEffort.state.solve } : null } : null }; },
    /** Validate capacity and names before a host applies any associated grip action. */
    check(command: MotionCommand): void {
      if (command.frames.length + (command.centres?.length ?? 0) > capacity || command.joints.length > count
        || command.frames.some((g) => !frames.has(motionFrameKey(g.frame)))
        || command.centres?.some((g) => g.frames.some((f) => !frames.has(motionFrameKey(f))))
        || command.joints.some((g) => !channels.has(g.channel))) throw new Error("motion objectives exceed this controller's model or capacity");
    },
    track(command: MotionCommand): Float64Array {
      const releasedContacts = new Set<string>(); let stopSeeded = false, contactSeeded = !liftOff;
      contacts?.begin();
      const candidates = stopSettings ? nearJointStops(built, stopSettings.margin, stopDt) : [], released = new Set<string>();
      if (state.stops) {
        state.stops.status = "unconstrained"; state.stops.work = 0; state.stops.near = candidates.length;
        state.stops.active.length = 0; state.stops.released.length = 0;
        state.stops.forceViolation = 0; state.stops.accelerationViolation = 0;
      }
      // Free predictions select support and stop rows; retries release rows but retain no-crossing bounds.
      for (let pass = 0; pass <= candidates.length + contactPasses + 1; pass++) {
        const supportRows = contacts?.read(command, releasedContacts, !contactSeeded) ?? [];
        const active = !stopSeeded ? [] : candidates.filter((s) => !released.has(s.id));
        if (active.length) dynamics.update([...active.map((s) => s.row), ...supportRows], [...active.map((s) => s.target), ...(contacts?.targets() ?? [])]);
        else dynamics.update(supportRows, contacts?.targets());
        const base = dynamics.solve(zero), columns: number[][] = [];
        if (supportRows.length) contacts!.base(dynamics.reactionMultipliers(zero));
        for (let i = 0; i < count; i++) {
          scale[i] = Math.max(muscles.strength(i, -1), muscles.strength(i, 1)) || 1;
          lower[i] = -muscles.strength(i, -1) / scale[i]!;
          upper[i] = muscles.strength(i, 1) / scale[i]!;
          unit[i] = 1;
          columns.push(dynamics.solve(unit).map((v, k) => v - base[k]!));
          if (supportRows.length) contacts!.column(i, dynamics.reactionMultipliers(unit));
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
          const rateBias = rateBiasToRef(c.joint, angles, Array.from({ length }, (_, k) => muscles.speed(first + k)), [])[c.index]!;
          const coefficients = Array.from({ length }, (_, k) => ratesToRef(c.joint, angles,
            Array.from({ length }, (_, j) => k === j ? 1 : 0), [])[c.index]!);
          const baseRate = coefficients.reduce((sum, v, k) => sum + v * base[6 + first + k]!, 0);
          const row = columns.map((column) => coefficients.reduce((sum, v, k) => sum + v * column[6 + first + k]!, 0));
          const rate = 1 / goal.seconds;
          add(row, goal.acceleration + rate * rate * (goal.angle - muscles.angle(i)) + 2 * rate * (goal.rate - muscles.rate(i)) - baseRate - rateBias, goal.weight);
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
            for (const k of motionAxes(g.axes)) {
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
        for (const goal of command.centres ?? []) {
          const members = goal.frames.map((frame) => frames.get(motionFrameKey(frame))!);
          const mass = members.reduce((sum, body) => sum + body.massProperties.mass, 0);
          const position = [0, 0, 0], speed = [0, 0, 0];
          const points = members.map((body) => {
            const weight = body.massProperties.mass / mass;
            centre.set(...body.massProperties.centre).applyRotationQuaternionToRef(body.node.rotationQuaternion!, centre).addInPlace(body.node.position);
            body.linearVelocityToRef(velocity);
            const point: Vec3 = [centre.x, centre.y, centre.z], motion = [velocity.x, velocity.y, velocity.z];
            for (let k = 0; k < 3; k++) { position[k]! += weight * point[k]!; speed[k]! += weight * motion[k]!; }
            return { body, weight, point };
          });
          const g = goal.translation, rate = 1 / g.seconds;
          let positionError = 0;
          for (const k of motionAxes(g.axes)) {
            const row = dynamics.motionRow(points.map((p) => ({ body: p.body, point: p.point,
              linear: [k === 0 ? p.weight : 0, k === 1 ? p.weight : 0, k === 2 ? p.weight : 0], angular: [0, 0, 0] })));
            const along = (values: readonly number[]) => row.coefficients.reduce((sum, v, i) => sum + v * values[i]!, 0);
            const miss = g.target[k]! - position[k]!; positionError += miss * miss;
            add(columns.map(along), g.acceleration[k]! + rate * rate * miss + 2 * rate * (g.velocity[k]! - speed[k]!) - along(base) - row.bias, g.weight);
          }
          state.errors.push({ id: goal.id, position: Math.sqrt(positionError), orientation: null });
        }
        H.fill(0); rhs.fill(0);
        for (let i = 0; i < count; i++) {
          for (let j = 0; j < count; j++) for (let r = 0; r < rows; r++) H[i * count + j]! += A[r * count + i]! * A[r * count + j]!;
          H[i * count + i]! += effortCost;
          for (let r = 0; r < rows; r++) rhs[i]! += A[r * count + i]! * target[r]!;
        }
        solveLinearTo(linear, H, rhs, count, unconstrained);
        boundedLeastSquaresTo(bounded, H, unconstrained, lower, upper, count, scaled);
        const extra: EffortBound[] = candidates.filter((s) => released.has(s.id)).map((stop) => {
          const row = dynamics.motionRow(stop.row), along = (a: readonly number[]) => row.coefficients.reduce((sum, v, i) => sum + v * a[i]!, 0);
          return { coefficients: columns.map(along), lower: stop.target - row.bias - along(base), upper: Infinity };
        });
        if (contacts && liftOff && contactSeeded) {
          const pulling = contacts.pulling(dynamics.reactionMultipliers(Array.from(scaled, (v, i) => v * scale[i]!)));
          if (pulling.length) { for (const id of pulling) releasedContacts.add(id); continue; }
          for (const constraint of contacts.releasedRows()) {
            const row = dynamics.motionRow(constraint.row), along = (a: readonly number[]) => row.coefficients.reduce((sum, v, i) => sum + v * a[i]!, 0);
            extra.push({ coefficients: columns.map(along), lower: constraint.target - row.bias - along(base), upper: Infinity });
          }
        }
        contacts?.solve(H, rhs, scale, lower, upper, scaled, extra);
        stopEffort?.solve(H, rhs, scale, lower, upper, scaled, extra);
        state.residual = 0; state.saturated = 0;
        for (let i = 0; i < count; i++) {
          scaled[i] = Math.max(lower[i]!, Math.min(upper[i]!, scaled[i]!));
          torque[i] = scaled[i]! * scale[i]!;
          if (scaled[i] === lower[i] || scaled[i] === upper[i]) state.saturated++;
        }
        contacts?.verify(dynamics, torque, contactSeeded);
        if (contacts && !contactSeeded) {
          contactSeeded = true; let needsContact = false;
          const acceleration = dynamics.solve(torque);
          for (const constraint of contacts.releasedRows()) {
            const row = dynamics.motionRow(constraint.row), value = row.coefficients.reduce((sum, v, i) => sum + v * acceleration[i]!, row.bias) - constraint.target;
            if (value >= -liftOff!.accelerationTolerance) releasedContacts.add(constraint.id); else needsContact = true;
          }
          if (needsContact) continue;
          contacts.verify(dynamics, torque);
        }
        if (state.stops) {
          const report = state.stops; report.work++;
          if (!stopSeeded && candidates.length) {
            stopSeeded = true;
            const free = dynamics.solve(torque);
            for (const stop of candidates) {
              const row = dynamics.motionRow(stop.row), value = row.coefficients.reduce((sum, v, i) => sum + v * free[i]!, row.bias) - stop.target;
              if (value >= -stopSettings!.accelerationTolerance) released.add(stop.id);
            }
            if (released.size < candidates.length) continue;
          }
          report.status = contacts?.state.status === "rejected" || stopEffort?.state.status === "rejected" ? "rejected" : candidates.length ? "accepted" : "unconstrained";
          if (report.status !== "rejected" && candidates.length) {
            const reactions = dynamics.reactionMultipliers(torque), offset = reactions.length - supportRows.length - active.length;
            const pulling = active.filter((_, i) => reactions[offset + i]! < -stopSettings!.forceTolerance);
            if (pulling.length) { for (const stop of pulling) released.add(stop.id); continue; }
            const acceleration = dynamics.solve(torque);
            for (let i = 0; i < active.length; i++) report.forceViolation = Math.max(report.forceViolation, -reactions[offset + i]!);
            for (const stop of candidates) {
              const row = dynamics.motionRow(stop.row), value = row.coefficients.reduce((sum, v, i) => sum + v * acceleration[i]!, row.bias) - stop.target;
              report.accelerationViolation = Math.max(report.accelerationViolation, released.has(stop.id) ? -value : Math.abs(value));
            }
            if (!Number.isFinite(report.forceViolation + report.accelerationViolation) || report.accelerationViolation > stopSettings!.accelerationTolerance) report.status = "rejected";
          }
          report.active = active.map((s) => s.id); report.released = [...released];
          if (report.status === "rejected") { torque.fill(0); contacts?.reject(); }
        }
        if (contacts?.state.status === "rejected" || state.stops?.status === "rejected") { scaled.fill(0); state.saturated = 0; }
        for (let r = 0; r < rows; r++) {
          let miss = -target[r]!;
          for (let i = 0; i < count; i++) miss += A[r * count + i]! * scaled[i]!;
          state.residual += miss * miss;
        }
        state.residual = Math.sqrt(state.residual); state.steps++;
        if (!Number.isFinite(state.residual) || !torque.every(Number.isFinite)) throw new Error("nonfinite motion tracking result");
        return torque;
      }
      throw new Error("contact/stop selection exceeded its finite row bound");
    },
  };
}

/** Any rejected physical prediction makes the tracker's torque candidate inadmissible. */
export function trackingRejected(report: {
  readonly contact: { readonly status: "unconstrained" | "accepted" | "rejected" } | null;
  readonly stops: { readonly status: "unconstrained" | "accepted" | "rejected" } | null;
}): boolean {
  return report.contact?.status === "rejected" || report.stops?.status === "rejected";
}
