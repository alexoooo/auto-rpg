/**
 * **Who takes a blow's energy.** The surfaces that met are springs in series under one force, so
 * each stores F^2 / 2k: a surface's share is its compliance over the sum of them all. A rigid
 * surface (null) has no compliance and takes none; where every surface is rigid, nobody does.
 * The list is every layer between the two bodies, in any order: today, the two that touched.
 */
export function energyShares(stiffness: readonly (number | null)[]): number[] {
  const compliance = stiffness.map((k) => {
    if (k !== null && !(k > 0 && Number.isFinite(k))) throw new Error(`a surface's stiffness is a finite N/m over 0, or null for a rigid one, not ${k}`);
    return k === null ? 0 : 1 / k;
  });
  const sum = compliance.reduce((a, b) => a + b, 0);
  return compliance.map((c) => (sum > 0 ? c / sum : 0));
}
