/**
 * **Who takes a blow's energy.** The surfaces that met are springs in series under one force, so
 * each stores F^2 / 2k: a surface's share is its compliance over the sum of them all. A rigid
 * surface (null) has no compliance and takes none; where every surface is rigid, nobody does.
 * The list is every layer between the two bodies, in any order; a blow's is the two that touched.
 */
export function energyShares(stiffness: readonly (number | null)[]): number[] {
  const each = stiffness.map(compliance);
  const sum = each.reduce((a, b) => a + b, 0);
  return each.map((c) => (sum > 0 ? c / sum : 0));
}

/** What `energyShares([first, second])` gives `second`, read without its arrays: a blow's priced at each step of a search. */
export function secondShare(first: number | null, second: number | null): number {
  const a = compliance(first), b = compliance(second), sum = 0 + a + b;
  return sum > 0 ? b / sum : 0;
}

/** A surface's compliance, 1/k, m/N: 0 for a rigid one (null). */
function compliance(k: number | null): number {
  if (k !== null && !(k > 0 && Number.isFinite(k))) throw new Error(`a surface's stiffness is a finite N/m over 0, or null for a rigid one, not ${k}`);
  return k === null ? 0 : 1 / k;
}
