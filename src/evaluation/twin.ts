/**
 * **A drill's training twin** (`Cases.twin`): the protocol a table cell reads, its situations drawn
 * at other points, so research tunes on the twin and the cell's own cases stay held out
 * (`docs/recipes/skill.md`, research scores on its drill). Each draw keeps the drill's count, so a
 * twin plays as many trials as its cell, none of them the cell's: a number the drill lists at
 * several points is drawn halfway between each two neighbours and half a spacing past the last
 * (`between`); ways spread evenly round the circle are turned half their spacing (`turned`); seeds
 * are the next ones (`later`); a number listed once stays.
 */

/** To a ten-thousandth, so a halfway point reads as written (0.65, not 0.6499999999999999). */
const tidy = (value: number): number => Math.round(value * 1e4) / 1e4;

/**
 * As many points as `points` lists, none of them one of its: each halfway to the next, and the
 * last half its spacing from the one before past it, in order; `points` itself where it lists one.
 */
export function between(points: readonly number[]): number[] {
  const sorted = [...new Set(points)].sort((a, b) => a - b), last = sorted.length - 1;
  return sorted.length < 2 ? sorted : sorted.map((point, k) => tidy(k < last ? (point + sorted[k + 1]!) / 2 : point + (point - sorted[k - 1]!) / 2));
}

/** `ways`, degrees spread evenly round the circle, each turned half their spacing. */
export function turned(ways: readonly number[]): number[] {
  const half = 180 / ways.length;
  return ways.map((way) => tidy((way + half) % 360));
}

/** As many seeds as `seeds`, each past the last of them. */
export const later = (seeds: readonly number[]): number[] => seeds.map((_, k) => Math.max(...seeds) + 1 + k);
