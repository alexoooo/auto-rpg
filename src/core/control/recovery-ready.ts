import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyObservation } from "../observation.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { withinSupport } from "./support.ts";

/** Physical handover gate, independent of a recovery policy's stage names or requested poses. */
export function recoveryReady(observation: BodyObservation, supports: readonly {
  readonly segment: string; readonly corners: readonly Vec3[];
}[], settings: { readonly slow: number; readonly minUpNormal: number }): boolean {
  const { slow, minUpNormal } = settings;
  if (!supports.length || supports.some((s) => !s.corners.length) || !(slow > 0) || !Number.isFinite(slow)
    || !(minUpNormal > 0 && minUpNormal <= 1)) return false;
  const contact = observation.contacts.filter((c) => c.fixed !== null && c.impulse > 0);
  if (observation.down || !supports.every((s) => contact.some((c) => c.segment === s.segment && Math.abs(c.normal[1]) >= minUpNormal))
    || contact.some((c) => !supports.some((s) => s.segment === c.segment))) return false;
  if (observation.segments.some((s) => s.velocity.reduce((sum, v) => sum + v * v, 0) >= slow * slow)) return false;
  const [x, , z] = observation.centre;
  const nearest = withinSupport(supports.map((s) => ({ corners: s.corners.map((c) => new Vector3(...c)) })), x, z);
  return nearest[0] === x && nearest[1] === z;
}
