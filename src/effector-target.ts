import type { EffectorTarget } from "./body-command.ts";

/** Validate the whole request before touching an actuator; copy so the body owns its held command. */
export function checkedEffectorTarget(target: EffectorTarget): EffectorTarget {
  const p = target.position, q = target.orientation;
  if (![p.x, p.y, p.z, q.x, q.y, q.z, q.w, target.speed, target.force].every(Number.isFinite)) {
    throw new Error("effector target components must be finite");
  }
  const length = Math.hypot(q.x, q.y, q.z, q.w);
  if (!Number.isFinite(length) || length < 1e-12) throw new Error("effector orientation must be a nonzero quaternion");
  const fraction = (value: number) => Math.max(0, Math.min(1, value));
  return { position: { x: p.x, y: p.y, z: p.z }, orientation: { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length },
    speed: fraction(target.speed), force: fraction(target.force) };
}
