/**
 * **A drill's training twin** (`Cases.twin`): the protocol a table cell reads, its situations drawn
 * at other points, so research tunes on the twin and the cell's own cases stay held out
 * (`docs/recipes/skill.md`, research scores on its drill). A number the drill lists at several
 * points is drawn halfway between them (`between`); ways spread evenly round the circle are turned
 * half their spacing (`turned`); seeds are the next ones (`later`); a number listed once stays.
 */

/** To a ten-thousandth, so a halfway point reads as written (0.65, not 0.6499999999999999). */
const tidy = (value: number): number => Math.round(value * 1e4) / 1e4;

/** The points halfway between each two neighbours of `points`, in order; `points` itself where it lists one. */
export function between(points: readonly number[]): number[] {
  const sorted = [...new Set(points)].sort((a, b) => a - b);
  return sorted.length < 2 ? sorted : sorted.slice(1).map((point, k) => tidy((sorted[k]! + point) / 2));
}

/** `ways`, degrees spread evenly round the circle, each turned half their spacing. */
export function turned(ways: readonly number[]): number[] {
  const half = 180 / ways.length;
  return ways.map((way) => tidy((way + half) % 360));
}

/** As many seeds as `seeds`, each past the last of them. */
export const later = (seeds: readonly number[]): number[] => seeds.map((_, k) => Math.max(...seeds) + 1 + k);
