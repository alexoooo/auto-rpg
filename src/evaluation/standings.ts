/** **A contest's standings** (`Standing`, `results.ts`) from its bouts. */
import { isStalemate } from "./compare.ts";
import type { BoutReading } from "./contest.ts";
import { ratingTable } from "./rating.ts";
import { rounded, type Standing } from "./results.ts";

/**
 * Each entrant's standing over `bouts`, best first: its Bradley-Terry rating on the Elo scale with
 * its 95 % interval (`ratingTable`), and its games, mean score, mean margin and stalemates from its
 * own side.
 */
export function standingsOf(bouts: readonly { readonly subjects: readonly string[]; readonly reading: BoutReading }[]): Standing[] {
  const ids = [...new Set(bouts.flatMap(({ subjects }) => subjects))].sort(), index = new Map(ids.map((id, k) => [id, k]));
  const rated = ratingTable(ids, bouts.map(({ subjects: [left, right], reading }) => ({ i: index.get(left!)!, j: index.get(right!)!, score: reading.score })));
  return rated.map((one) => {
    let score = 0, margin = 0, stalemates = 0;
    for (const { subjects, reading } of bouts) {
      const seat = subjects.indexOf(one.id);
      if (seat < 0) continue;
      score += seat === 0 ? reading.score : 1 - reading.score;
      margin += seat === 0 ? reading.margin : -reading.margin;
      if (isStalemate(reading)) stalemates++;
    }
    return { id: one.id, rating: rounded(one.rating), low: rounded(one.interval[0]), high: rounded(one.interval[1]), bouts: one.bouts, wins: one.wins, draws: one.draws, losses: one.losses,
      score: rounded(score / one.bouts), margin: rounded(margin / one.bouts), stalemates };
  }).sort((a, b) => b.rating - a.rating);
}
