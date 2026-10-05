import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { SegmentBody } from "../engine/engine.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { coupledDynamics } from "./coupled-dynamics.ts";
import { constrainedMass, type MotionConstraint } from "./constrained-mass.ts";

interface AngularStop {
  /** Inward angle-rate row; only angular entries are admitted. */
  readonly row: MotionConstraint;
  /** Lower bound on this row's end-step velocity, rad/s, including coordinate curvature. */
  readonly minimumVelocity: number;
  /** Angular impulse threshold, N m s, independent of point-contact impulse units. */
  readonly impulseTolerance: number;
  /** Angle-rate residual tolerance, rad/s. */
  readonly velocityTolerance: number;
}

type Model = ReturnType<typeof coupledDynamics>;
type Load = NonNullable<Parameters<Model["solve"]>[1]>[number];
interface Contact {
  readonly body: SegmentBody;
  readonly point: Vec3;
  readonly normal: Vec3;
  /** Lower bound on end-step relative normal velocity against a fixed plane, m/s. */
  readonly normalVelocity: number;
}
interface Settings {
  readonly dt: number;
  readonly friction: number;
  readonly iterations: number;
  readonly impulseTolerance: number;
  readonly velocityTolerance: number;
  /** Tangent projection metric: coupled response, or the contacting rigid body's unconstrained mobility. */
  readonly frictionMetric?: "coupled" | "rigid-body";
}
const ZERO: Vec3 = [0, 0, 0];
const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const tuple = (v: Vector3): Vec3 => [v.x, v.y, v.z];

/**
 * Diagnostic fixed-plane contact impulse prediction through an updated coupled model. Normal
 * impulses are unilateral; the two-axis stopping impulse is projected onto a friction disk.
 * This is a per-point projected solver law, not a patch/twist model or opposing-slip force.
 * The explicit rigid-body friction metric matches Rapier's local contact update; eliminating
 * joints before choosing a saturated friction direction changes that law. The default coupled
 * metric retains the articulated projection experiment (`docs/reference/contact-projection.md`).
 * Measured velocities are first projected into the model's joint/constraint tangent space.
 * Optional angular stops exchange impulses with contacts in the same coupled solve. Their
 * inward rows may push but never pull; each has its own angular impulse and velocity tolerances.
 * Point lever arms stay fixed during the predicted step. The caller chooses candidate contacts
 * and normal velocity bounds; this function neither discovers contacts nor applies forces.
 *
 * The allocating cold solve has a finite iteration budget and independently checks its fixed
 * point. A non-converged candidate cannot justify a controller action. Distant impacts,
 * acquisition timing and geometry changes within the step remain outside this local model.
 */
export function predictPointContacts(model: Model, torque: ArrayLike<number>, contacts: readonly Contact[],
  loads: readonly Load[], settings: Settings, stops: readonly AngularStop[] = []) {
  const { dt, friction, iterations, impulseTolerance, velocityTolerance } = settings;
  if (!(dt > 0) || !Number.isFinite(dt) || !(friction >= 0) || !Number.isFinite(friction)
    || !Number.isSafeInteger(iterations) || iterations < 1
    || ![impulseTolerance, velocityTolerance].every((v) => v > 0 && Number.isFinite(v))
    || (settings.frictionMetric !== undefined && settings.frictionMetric !== "coupled" && settings.frictionMetric !== "rigid-body")) throw new Error("invalid contact-step settings");
  const stopRows = stops.map((stop) => {
    if (!Number.isFinite(stop.minimumVelocity) || ![stop.impulseTolerance, stop.velocityTolerance].every((v) => v > 0 && Number.isFinite(v))
      || stop.row.length === 0 || stop.row.some((entry) => entry.linear.length !== 3 || entry.angular.length !== 3
        || entry.point.length !== 3 || entry.linear.some((v) => v !== 0))) throw new Error("invalid angular contact-step stop");
    return model.motionRow(stop.row);
  });
  const along = (row: ArrayLike<number>, value: ArrayLike<number>) => {
    let sum = 0; for (let i = 0; i < row.length; i++) sum += row[i]! * value[i]!; return sum;
  };
  const geometry = contacts.map((c) => {
    if (c.point.length !== 3 || c.normal.length !== 3 || ![...c.point, ...c.normal, c.normalVelocity].every(Number.isFinite)) throw new Error("invalid contact-step geometry");
    const length = Math.sqrt(dot(c.normal, c.normal));
    if (!(length > 0) || !Number.isFinite(length)) throw new Error("invalid contact-step normal");
    const normal = c.normal.map((v) => v / length) as unknown as Vec3;
    const reference: Vec3 = Math.abs(normal[0]) < Math.abs(normal[1]) ? [1, 0, 0] : [0, 1, 0];
    const along = dot(reference, normal), raw = reference.map((v, k) => v - along * normal[k]!) as unknown as Vec3;
    const span = Math.sqrt(dot(raw, raw)), tangent = raw.map((v) => v / span) as unknown as Vec3;
    return { ...c, point: [...c.point] as Vec3, axes: [normal, tangent, cross(normal, tangent)] };
  });
  const free = model.solve(torque, loads), unloaded = model.solve(new Array<number>(model.channels).fill(0));
  const localMass = new Map<SegmentBody, ReturnType<typeof constrainedMass>>();
  if (settings.frictionMetric === "rigid-body") for (const { body } of geometry) {
    if (localMass.has(body)) continue;
    const mass = constrainedMass([body], () => []); mass.update(); localMass.set(body, mass);
  }
  const tangentMetrics = settings.frictionMetric === "rigid-body" ? geometry.map((contact) => {
    const mobility = localMass.get(contact.body)!.mobility(contact.body, contact.point), tangents = contact.axes.slice(1);
    return tangents.map((a) => tangents.map((b) => a.reduce((sum, v, i) =>
      sum + v * mobility[i]!.reduce((s, x, j) => s + x * b[j]!, 0), 0)));
  }) : null;
  const projection = model.projectVelocity();
  const rows = geometry.flatMap((contact) => contact.axes.map((axis) => ({ contact, axis }))), contactSize = rows.length, size = contactSize + stops.length;
  const response = Array.from({ length: size }, () => new Float64Array(size)), impulses = new Float64Array(size);
  const baseline = rows.map(({ contact, axis }) => dot(model.pointAcceleration(contact.body, contact.point, unloaded).linear, axis));
  const centre = new Vector3(), angular = new Vector3();
  const initial = geometry.flatMap((contact) => {
    const { body, point } = contact;
    centre.set(...body.massProperties.centre).applyRotationQuaternionToRef(body.node.rotationQuaternion!, centre).addInPlace(body.node.position);
    body.angularVelocityToRef(angular);
    const offset = subtract(point, tuple(centre)), turn = cross(tuple(angular), offset), centripetal = cross(tuple(angular), turn);
    const acceleration = model.pointAcceleration(body, point, free).linear;
    const compatible = model.pointVelocity(body, point, projection.velocity).linear;
    const next = compatible.map((v, k) => v + dt * (acceleration[k]! - centripetal[k]!));
    return contact.axes.map((axis) => dot(next, axis));
  });
  stopRows.forEach((row) => initial.push(along(row.coefficients, projection.velocity) + dt * (along(row.coefficients, free) + row.bias)));
  const zeroTorque = new Array<number>(model.channels).fill(0);
  const column = (col: number, motion: readonly number[]) => {
    rows.forEach(({ contact: at, axis: direction }, row) => {
      response[row]![col] = dot(model.pointAcceleration(at.body, at.point, motion).linear, direction) - baseline[row]!;
    });
    const delta = motion.map((v, i) => v - unloaded[i]!);
    stopRows.forEach((row, i) => { response[contactSize + i]![col] = along(row.coefficients, delta); });
  };
  rows.forEach(({ contact, axis }, col) => {
    const motion = model.solve(zeroTorque, [{ body: contact.body, point: contact.point, force: axis, moment: ZERO }]);
    column(col, motion);
  });
  stops.forEach((stop, i) => {
    column(contactSize + i, model.solve(zeroTorque, stop.row.map((entry) => ({ body: entry.body, point: entry.point, force: entry.linear, moment: entry.angular }))));
    const mobility = response[contactSize + i]![contactSize + i]!;
    if (!(mobility > 0) || !Number.isFinite(mobility)) throw new Error("singular angular contact-step mobility");
  });
  for (let p = 0; p < geometry.length; p++) {
    const i = 3 * p, a = i + 1, b = i + 2;
    const determinant = response[a]![a]! * response[b]![b]! - response[a]![b]! * response[b]![a]!;
    if (!(response[i]![i]! > 0) || !(determinant > 0) || !Number.isFinite(determinant)) throw new Error("singular contact-step mobility");
    if (tangentMetrics) {
      const m = tangentMetrics[p]!, localDeterminant = m[0]![0]! * m[1]![1]! - m[0]![1]! * m[1]![0]!;
      if (!(localDeterminant > 0) || !Number.isFinite(localDeterminant)) throw new Error("singular friction metric");
    }
  }
  const velocity = [...initial];
  const tangentCandidate = (i: number) => {
    const a = i + 1, b = i + 2, metric = tangentMetrics?.[i / 3];
    const aa = metric ? metric[0]![0]! : response[a]![a]!, ab = metric ? metric[0]![1]! : response[a]![b]!;
    const ba = metric ? metric[1]![0]! : response[b]![a]!, bb = metric ? metric[1]![1]! : response[b]![b]!;
    const determinant = aa * bb - ab * ba;
    let x = impulses[a]! - (bb * velocity[a]! - ab * velocity[b]!) / determinant;
    let y = impulses[b]! - (aa * velocity[b]! - ba * velocity[a]!) / determinant;
    const length = Math.sqrt(x * x + y * y), cap = friction * impulses[i]!;
    if (length > cap) { x *= cap / length; y *= cap / length; }
    return [x, y];
  };
  let change = 0, work = 0;
  const add = (col: number, value: number) => {
    const delta = value - impulses[col]!; impulses[col] = value;
    for (let row = 0; row < size; row++) velocity[row]! += response[row]![col]! * delta;
    change = Math.max(change, Math.abs(delta) / (col < contactSize ? impulseTolerance : stops[col - contactSize]!.impulseTolerance));
  };
  for (; work < iterations && size > 0;) {
    change = 0; work++;
    geometry.forEach((contact, p) => {
      const i = 3 * p;
      add(i, Math.max(0, impulses[i]! - (velocity[i]! - contact.normalVelocity) / response[i]![i]!));
    });
    stops.forEach((stop, p) => {
      const i = contactSize + p;
      add(i, Math.max(0, impulses[i]! - (velocity[i]! - stop.minimumVelocity) / response[i]![i]!));
    });
    geometry.forEach((_, p) => { const i = 3 * p, [x, y] = tangentCandidate(i); add(i + 1, x!); add(i + 2, y!); });
    if (change <= 1) break;
  }
  for (let r = 0; r < size; r++) {
    velocity[r] = initial[r]!;
    for (let c = 0; c < size; c++) velocity[r]! += response[r]![c]! * impulses[c]!;
  }
  let normalViolation = 0, impulseResidual = 0, coneViolation = 0;
  const predictions = geometry.map((contact, p) => {
    const i = 3 * p, normal = impulses[i]!, gapVelocity = velocity[i]! - contact.normalVelocity;
    const [x, y] = tangentCandidate(i);
    impulseResidual = Math.max(impulseResidual, Math.abs(x! - impulses[i + 1]!), Math.abs(y! - impulses[i + 2]!));
    normalViolation = Math.max(normalViolation, -gapVelocity, normal > impulseTolerance ? Math.abs(gapVelocity) : 0);
    coneViolation = Math.max(coneViolation, -normal, Math.sqrt(impulses[i + 1]! * impulses[i + 1]! + impulses[i + 2]! * impulses[i + 2]!) - friction * normal);
    const world = (values: ArrayLike<number>): Vec3 => [0, 1, 2].map((k) => contact.axes.reduce((sum, axis, j) => sum + axis[k]! * values[i + j]!, 0)) as unknown as Vec3;
    const slip = Math.sqrt(velocity[i + 1]! * velocity[i + 1]! + velocity[i + 2]! * velocity[i + 2]!);
    return { impulse: world(impulses), velocity: world(velocity), mode: normal <= impulseTolerance ? "free" as const : slip <= velocityTolerance ? "sticking" as const : "sliding" as const };
  });
  const stopPredictions = stops.map((stop, p) => {
    const i = contactSize + p, impulse = impulses[i]!, gapVelocity = velocity[i]! - stop.minimumVelocity;
    const violation = Math.max(0, -gapVelocity, impulse > stop.impulseTolerance ? Math.abs(gapVelocity) : 0);
    return { impulse, velocity: velocity[i]!, violation, mode: impulse > stop.impulseTolerance ? "holding" as const : "free" as const };
  });
  const stopsAccepted = stopPredictions.every((stop, i) => stop.impulse >= -stops[i]!.impulseTolerance && stop.violation <= stops[i]!.velocityTolerance);
  const finite = [...impulses, ...velocity, normalViolation, impulseResidual, coneViolation, ...stopPredictions.map((stop) => stop.violation)].every(Number.isFinite);
  const accepted = finite && stopsAccepted && normalViolation <= velocityTolerance && impulseResidual <= impulseTolerance && coneViolation <= impulseTolerance;
  const status = !finite ? "nonfinite" as const : accepted ? "converged" as const : work >= iterations ? "iteration-limit" as const : "residual" as const;
  const contactLoads = geometry.map((contact, i): Load => ({ body: contact.body, point: contact.point,
    force: predictions[i]!.impulse.map((v) => v / dt) as unknown as Vec3, moment: ZERO }));
  const stopLoads = stops.flatMap((stop, i) => stop.row.map((entry): Load => ({ body: entry.body, point: entry.point,
    force: ZERO, moment: entry.angular.map((v) => v * stopPredictions[i]!.impulse / dt) as unknown as Vec3 })));
  return { status, work, normalViolation, impulseResidual, coneViolation, projection, contacts: predictions, stops: stopPredictions,
    acceleration: finite ? model.solve(torque, [...loads, ...contactLoads, ...stopLoads]) : null };
}
