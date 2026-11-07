import type { Vec3 } from "../../core/bodies/spec/quantity.ts";
import { dot } from "../../core/bodies/spec/vec.ts";

interface Sample { readonly time: number; readonly position: Vec3; readonly velocity: Vec3 }
interface Plane { readonly point: Vec3; readonly normal: Vec3 }

/** Earliest closing plane crossing under a measured constant acceleration, with sample-age compensation. */
export function predictIntercept(sample: Sample, acceleration: Vec3, plane: Plane, now: number, horizon: number) {
  const age = Math.max(0, now - sample.time);
  const position = sample.position.map((v, k) => v + sample.velocity[k]! * age + acceleration[k]! * age * age / 2) as unknown as Vec3;
  const velocity = sample.velocity.map((v, k) => v + acceleration[k]! * age) as unknown as Vec3;
  const offset = position.map((v, k) => v - plane.point[k]!) as unknown as Vec3;
  const d = dot(offset, plane.normal), v = dot(velocity, plane.normal), a = dot(acceleration, plane.normal);
  if (!(d > 0 && v < 0 && horizon > 0)) return null;
  const discriminant = v * v - 2 * a * d;
  if (discriminant < 0) return null;
  const seconds = 2 * d / (-v + Math.sqrt(discriminant));
  if (!(seconds > 0 && seconds <= horizon) || v + a * seconds >= 0) return null;
  return { seconds, position: position.map((p, k) => p + velocity[k]! * seconds + acceleration[k]! * seconds * seconds / 2) as unknown as Vec3 };
}
