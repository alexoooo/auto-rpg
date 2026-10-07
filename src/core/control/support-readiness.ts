import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody } from "../build/build-body.ts";
import { footStatesOf, groundContact, readSupport, withinSupport } from "./support.ts";

/** Physical readiness limits, independent of anatomy: `docs/reference/punch-stability.md#readiness-settings`. */
export const STRIKE_SUPPORT = Object.freeze({ normal: .9, footGap: .015, slow: .35, hold: .05 });

/** Trusted physical adapter; its detached readings are shared by strike preparation and transfer. */
export function supportReadiness(built: BuiltBody) {
  const feet = footStatesOf(built), middle = new Vector3();
  const state = { loads: { left: 0, right: 0 }, flat: { left: false, right: false },
    centred: false, speed: 0, otherSupport: false, quiet: 0 };
  const soles = new Set(feet.map(f => f.segment.body));
  return { state, read(centre: Vector3, velocity: Vector3, dt: number) {
    readSupport(feet, feet, middle);
    for (const foot of feet) {
      state.loads[foot.side] = 0;
      for (const c of built.physics.contactsOf(foot.segment.body))
        if (groundContact(c, STRIKE_SUPPORT.normal)) state.loads[foot.side] += -c.normal[1] * c.impulse;
      state.flat[foot.side] = Math.max(...foot.corners.map(c => c.y)) - Math.min(...foot.corners.map(c => c.y)) <= STRIKE_SUPPORT.footGap;
    }
    const near = withinSupport(feet, centre.x, centre.z);
    state.centred = near[0] === centre.x && near[1] === centre.z;
    state.speed = velocity.length(); state.otherSupport = false;
    for (const part of built.segments.values()) if (!soles.has(part.body)
      && built.physics.contactsOf(part.body).some(c => groundContact(c, STRIKE_SUPPORT.normal))) state.otherSupport = true;
    state.quiet = plantedSupport(state) ? state.quiet + dt : 0;
  } };
}

/** Both feet carry a quiet upright striking base, with no substitute ground support. */
export function plantedSupport(reading: ReturnType<typeof supportReadiness>["state"]): boolean {
  return bearingSupport(reading) && reading.speed <= STRIKE_SUPPORT.slow;
}

/** The committed stroke retains ground support while its centre of mass is allowed to accelerate. */
export function bearingSupport(reading: ReturnType<typeof supportReadiness>["state"]): boolean {
  return reading.loads.left > 0 && reading.loads.right > 0 && reading.flat.left && reading.flat.right
    && reading.centred && !reading.otherSupport;
}
