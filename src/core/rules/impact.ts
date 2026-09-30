/**
 * **What a blow is worth before any rule prices it: the energy it can put into deforming what it
 * meets**, joules. Two bodies meeting at a closing speed v, each moving at the contact as a mass
 * that the contact meets (`src/core/build/contact-mass.ts`), lose at most the kinetic energy of
 * their relative motion, 1/2 mu v^2 with mu = m M / (m + M), and lose all of it when the contact
 * does not bounce.
 *
 * A struck mass of `Infinity` is something nothing moves, and the blow gives up all its own
 * kinetic energy. A contact that is not closing (v <= 0) is worth nothing.
 */
export function impactEnergy(strikerKg: number, struckKg: number, closing: number): number {
  if (!(strikerKg > 0) || !Number.isFinite(strikerKg)) throw new Error(`a striker meets a contact with a positive mass, not ${strikerKg}`);
  if (!(struckKg > 0)) throw new Error(`a struck body meets a contact with a positive mass, not ${struckKg}`);
  if (!Number.isFinite(closing)) throw new Error(`a closing speed is finite, not ${closing}`);
  if (closing <= 0) return 0;
  return reducedMass(strikerKg, struckKg) * closing * closing / 2;
}

/** m M / (m + M), and m when M is `Infinity`. */
export const reducedMass = (strikerKg: number, struckKg: number): number =>
  Number.isFinite(struckKg) ? strikerKg * struckKg / (strikerKg + struckKg) : strikerKg;
