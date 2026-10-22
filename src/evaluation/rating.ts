/**
 * **Bradley-Terry strengths on the Elo scale**, fitted to every game at once, so the order games
 * were played in counts for nothing. Computed with the core's own `exp` and `log`, so a table is
 * the same in Node and a page.
 */
import { exp, log } from "../core/math/real.ts";
import { draws } from "./stats.ts";

/** A game between entrants `i` and `j` by index: 1 for `i`'s win, 0 for its loss, a half for a draw. */
export interface Game {
  readonly i: number;
  readonly j: number;
  readonly score: number;
}

/** The natural logarithm of ten, to put a strength on the Elo scale. */
const LN10 = 2.302585092994046;

/**
 * Each entrant's rating, `mean + 400 log10 s`, the strengths' geometric mean held at 1: `s` by
 * minorisation-maximisation, the chance `i` beats `j` being `s_i / (s_i + s_j)`. Each entrant is
 * given half a game drawn, spread over every other, so one that won or lost every game still has a
 * finite strength; a drawn prior keeps the scores equal to the games, so the fit has a solution.
 */
export function bradleyTerry(count: number, games: readonly Game[], { mean = 1500, iterations = 2000 } = {}): number[] {
  const n = count, s = new Array<number>(n).fill(1), wins = new Array<number>(n).fill(0);
  const played = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (const { i, j, score } of games) { wins[i] += score; wins[j] += 1 - score; played[i][j]++; played[j][i]++; }
  for (let k = 0; k < n; k++) { wins[k] += 0.25; for (let m = 0; m < n; m++) if (m !== k) played[k][m] += 0.5 / (n - 1); }
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      let den = 0;
      for (let j = 0; j < n; j++) if (j !== i && played[i][j]) den += played[i][j] / (s[i] + s[j]);
      s[i] = den > 0 ? wins[i] / den : s[i];
    }
    const centre = s.reduce((t, x) => t + log(x), 0) / n;
    for (let i = 0; i < n; i++) s[i] = exp(log(s[i]) - centre);
  }
  return s.map((x) => mean + 400 * log(x) / LN10);
}

/**
 * Each entrant's `level` interval (95 % by default) of its `bradleyTerry` rating, from `resamples`
 * refits to the pairings drawn again with replacement: a pair's games stay together, as the pair
 * met. Seeded, so a table is the same each time it is read.
 */
export function ratingIntervals(count: number, games: readonly Game[], { mean = 1500, iterations = 400, resamples = 200, level = 0.95, seed = 1 } = {}): [number, number][] {
  const pairs = new Map<string, Game[]>();
  for (const game of games) {
    const key = game.i < game.j ? `${game.i},${game.j}` : `${game.j},${game.i}`;
    if (!pairs.has(key)) pairs.set(key, []);
    pairs.get(key)!.push(game);
  }
  const groups = [...pairs.values()], next = draws(seed), ratings = Array.from({ length: count }, () => [] as number[]);
  for (let r = 0; r < resamples; r++) {
    const drawn: Game[] = [];
    for (let k = 0; k < groups.length; k++) drawn.push(...groups[Math.floor(next() * groups.length)]);
    bradleyTerry(count, drawn, { mean, iterations }).forEach((rating, i) => ratings[i].push(rating));
  }
  const tail = (1 - level) / 2;
  return ratings.map((each) => {
    const sorted = each.sort((a, b) => a - b), at = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
    return [at(tail), at(1 - tail)];
  });
}

/** An entrant's rating, its 95 % interval, and its games. */
export interface Rated {
  readonly id: string;
  readonly rating: number;
  readonly interval: readonly [number, number];
  readonly bouts: number;
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
}

/** Each of `ids`' rating over `games` (by index into `ids`), with its interval and record, best first. */
export function ratingTable(ids: readonly string[], games: readonly Game[]): Rated[] {
  const ratings = bradleyTerry(ids.length, games), intervals = ratingIntervals(ids.length, games);
  return ids.map((id, k) => {
    let wins = 0, draws = 0, losses = 0;
    for (const { i, j, score } of games) {
      if (i !== k && j !== k) continue;
      const mine = i === k ? score : 1 - score;
      if (mine === 1) wins++; else if (mine === 0) losses++; else draws++;
    }
    return { id, rating: ratings[k], interval: intervals[k], bouts: wins + draws + losses, wins, draws, losses };
  }).sort((a, b) => b.rating - a.rating);
}
