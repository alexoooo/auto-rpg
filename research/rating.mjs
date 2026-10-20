/**
 * **Bradley-Terry strengths on the Elo scale**, fitted to every game at once, so that the order the
 * games were played in counts for nothing: each entrant's strength `s`, the chance `i` beats `j`
 * being `s_i / (s_i + s_j)`, by minorisation-maximisation. A game scores 1 for `i`'s win, 0 for
 * its loss and a half for a draw. Each entrant is given half a game's score spread over half a game
 * against every other, so that one that won or lost every game still has a finite strength.
 *
 * `games` is `{ i, j, score }` by index into `count` entrants; the result is each entrant's rating,
 * `mean + 400 log10 s`, the strengths' geometric mean held at 1.
 */
export function bradleyTerry(count, games, { mean = 1500, iterations = 2000 } = {}) {
  const n = count, s = new Array(n).fill(1), wins = new Array(n).fill(0), played = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const { i, j, score } of games) { wins[i] += score; wins[j] += 1 - score; played[i][j]++; played[j][i]++; }
  for (let k = 0; k < n; k++) { wins[k] += 0.5; for (let m = 0; m < n; m++) if (m !== k) played[k][m] += 0.5 / (n - 1); }
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      let den = 0;
      for (let j = 0; j < n; j++) if (j !== i && played[i][j]) den += played[i][j] / (s[i] + s[j]);
      s[i] = den > 0 ? wins[i] / den : s[i];
    }
    const centre = s.reduce((t, x) => t + Math.log(x), 0) / n;
    for (let i = 0; i < n; i++) s[i] = Math.exp(Math.log(s[i]) - centre);
  }
  return s.map((x) => mean + 400 * Math.log10(x));
}

/** A generator of numbers in [0, 1) from `seed` (mulberry32): the same draws on every machine. */
function draws(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Each entrant's `level` interval (a 95 % one by default) of its `bradleyTerry` rating, from
 * `resamples` refits to the pairings drawn again with replacement: every pair's games stay
 * together, as the pair met. Seeded, so a table is the same each time it is read.
 */
export function ratingIntervals(count, games, { mean = 1500, iterations = 400, resamples = 200, level = .95, seed = 1 } = {}) {
  const pairs = new Map();
  for (const game of games) {
    const key = game.i < game.j ? `${game.i},${game.j}` : `${game.j},${game.i}`;
    if (!pairs.has(key)) pairs.set(key, []);
    pairs.get(key).push(game);
  }
  const groups = [...pairs.values()], next = draws(seed), ratings = Array.from({ length: count }, () => []);
  for (let r = 0; r < resamples; r++) {
    const drawn = [];
    for (let k = 0; k < groups.length; k++) drawn.push(...groups[Math.floor(next() * groups.length)]);
    bradleyTerry(count, drawn, { mean, iterations }).forEach((rating, i) => ratings[i].push(rating));
  }
  const tail = (1 - level) / 2;
  return ratings.map((each) => {
    const sorted = each.sort((a, b) => a - b), at = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
    return [at(tail), at(1 - tail)];
  });
}
