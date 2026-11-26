/**
 * **A drill's training twin** (`Cases.twin`): the protocol a table cell reads, its situations drawn
 * at other points, so research tunes on the twin and the cell's own cases stay held out
 * (`docs/recipes/skill.md`, research scores on its drill). Each draw keeps the drill's count, so a
 * twin plays as many trials as its cell: a number the drill lists at several points is drawn as
 * many points across their range, each at the middle of its share of it (`between`); ways spread
 * evenly round the circle are turned half their spacing (`turned`); seeds are the next ones
 * (`later`); a number listed once stays.
 */

/** To a ten-thousandth, so a halfway point reads as written (0.65, not 0.6499999999999999). */
const tidy = (value: number): number => Math.round(value * 1e4) / 1e4;

/**
 * As many points as `points` lists across their range, each at the middle of its equal share of
 * it, in order: none of them one of `points` where those are evenly spaced; `points` itself where it
 * lists one.
 */
export function between(points: readonly number[]): number[] {
  const sorted = [...new Set(points)].sort((a, b) => a - b), low = sorted[0]!, share = (sorted[sorted.length - 1]! - low) / sorted.length;
  return sorted.length < 2 ? sorted : sorted.map((_, k) => tidy(low + (k + 0.5) * share));
}

/** `ways`, degrees spread evenly round the circle, each turned half their spacing. */
export function turned(ways: readonly number[]): number[] {
  const half = 180 / ways.length;
  return ways.map((way) => tidy((way + half) % 360));
}

/** As many seeds as `seeds`, each past the last of them. */
export const later = (seeds: readonly number[]): number[] => seeds.map((_, k) => Math.max(...seeds) + 1 + k);
