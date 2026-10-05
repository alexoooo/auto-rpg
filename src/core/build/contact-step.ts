import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { SegmentBody } from "../engine/engine.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { coupledDynamics } from "./coupled-dynamics.ts";

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
}
const ZERO: Vec3 = [0, 0, 0];
const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const tuple = (v: Vector3): Vec3 => [v.x, v.y, v.z];

/**
 * Diagnostic fixed-plane contact impulse prediction through an updated coupled model. Normal
 * impulses are unilateral; the two-axis stopping impulse is projected onto a friction disk.
 * This is the per-point projected solver law, not a patch/twist model or opposing-slip force.
 * Point lever arms stay fixed during the predicted step. The caller chooses candidate contacts
 * and normal velocity bounds; this function neither discovers contacts nor applies forces.
 *
 * The allocating cold solve has a finite iteration budget and independently checks its fixed
 * point. A non-converged candidate cannot justify a controller action. Distant impacts,
 * acquisition timing and geometry changes within the step remain outside this local model.
 */
export function predictPointContacts(model: Model, torque: ArrayLike<number>, contacts: readonly Contact[],
  loads: readonly Load[], settings: Settings) {
  const { dt, friction, iterations, impulseTolerance, velocityTolerance } = settings;
  if (!(dt > 0) || !Number.isFinite(dt) || !(friction >= 0) || !Number.isFinite(friction)
    || !Number.isSafeInteger(iterations) || iterations < 1
    || ![impulseTolerance, velocityTolerance].every((v) => v > 0 && Number.isFinite(v))) throw new Error("invalid contact-step settings");
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
  const rows = geometry.flatMap((contact) => contact.axes.map((axis) => ({ contact, axis }))), size = rows.length;
  const response = Array.from({ length: size }, () => new Float64Array(size)), impulses = new Float64Array(size);
  const baseline = rows.map(({ contact, axis }) => dot(model.pointAcceleration(contact.body, contact.point, unloaded).linear, axis));
  const centre = new Vector3(), linear = new Vector3(), angular = new Vector3();
  const initial = geometry.flatMap((contact) => {
    const { body, point } = contact;
    centre.set(...body.massProperties.centre).applyRotationQuaternionToRef(body.node.rotationQuaternion!, centre).addInPlace(body.node.position);
    body.linearVelocityToRef(linear); body.angularVelocityToRef(angular);
    const offset = subtract(point, tuple(centre)), turn = cross(tuple(angular), offset), centripetal = cross(tuple(angular), turn);
    const acceleration = model.pointAcceleration(body, point, free).linear;
    const next = tuple(linear).map((v, k) => v + turn[k]! + dt * (acceleration[k]! - centripetal[k]!));
    return contact.axes.map((axis) => dot(next, axis));
  });
  const zeroTorque = new Array<number>(model.channels).fill(0);
  rows.forEach(({ contact, axis }, col) => {
    const motion = model.solve(zeroTorque, [{ body: contact.body, point: contact.point, force: axis, moment: ZERO }]);
    rows.forEach(({ contact: at, axis: direction }, row) => {
      response[row]![col] = dot(model.pointAcceleration(at.body, at.point, motion).linear, direction) - baseline[row]!;
    });
  });
  for (let p = 0; p < geometry.length; p++) {
    const i = 3 * p, a = i + 1, b = i + 2;
    const determinant = response[a]![a]! * response[b]![b]! - response[a]![b]! * response[b]![a]!;
    if (!(response[i]![i]! > 0) || !(determinant > 0) || !Number.isFinite(determinant)) throw new Error("singular contact-step mobility");
  }
  const velocity = [...initial];
  const tangentCandidate = (i: number) => {
    const a = i + 1, b = i + 2, aa = response[a]![a]!, ab = response[a]![b]!, ba = response[b]![a]!, bb = response[b]![b]!;
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
    change = Math.max(change, Math.abs(delta));
  };
  for (; work < iterations && size > 0;) {
    change = 0; work++;
    geometry.forEach((contact, p) => {
      const i = 3 * p;
      add(i, Math.max(0, impulses[i]! - (velocity[i]! - contact.normalVelocity) / response[i]![i]!));
    });
    geometry.forEach((_, p) => { const i = 3 * p, [x, y] = tangentCandidate(i); add(i + 1, x!); add(i + 2, y!); });
    if (change <= impulseTolerance) break;
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
  const finite = [...impulses, ...velocity, normalViolation, impulseResidual, coneViolation].every(Number.isFinite);
  const accepted = finite && normalViolation <= velocityTolerance && impulseResidual <= impulseTolerance && coneViolation <= impulseTolerance;
  const status = !finite ? "nonfinite" as const : accepted ? "converged" as const : work >= iterations ? "iteration-limit" as const : "residual" as const;
  const contactLoads = geometry.map((contact, i): Load => ({ body: contact.body, point: contact.point,
    force: predictions[i]!.impulse.map((v) => v / dt) as unknown as Vec3, moment: ZERO }));
  return { status, work, normalViolation, impulseResidual, coneViolation, contacts: predictions,
    acceleration: finite ? model.solve(torque, [...loads, ...contactLoads]) : null };
}
