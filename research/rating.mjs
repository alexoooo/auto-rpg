// Glickman's Glicko-2, simultaneous rating periods. No order-dependent Elo updates.
export const initialRating = () => ({ rating: 1500, deviation: 350, volatility: 0.06 });
const SCALE = 173.7178;
const g = (phi) => 1 / Math.sqrt(1 + 3 * phi * phi / Math.PI ** 2);

export function updateRating(player, games, tau = 0.5) {
  const mu = (player.rating - 1500) / SCALE;
  const phi = player.deviation / SCALE;
  if (!games.length) return { ...player, deviation: SCALE * Math.hypot(phi, player.volatility) };
  let information = 0;
  let improvement = 0;
  for (const { opponent, score } of games) {
    if (![0, 0.5, 1].includes(score)) throw new Error("invalid match score");
    const weight = g(opponent.deviation / SCALE);
    const expected = 1 / (1 + Math.exp(-weight * (mu - (opponent.rating - 1500) / SCALE)));
    information += weight ** 2 * expected * (1 - expected);
    improvement += weight * (score - expected);
  }
  const variance = 1 / information;
  const delta = variance * improvement;
  const a = Math.log(player.volatility ** 2);
  const f = (x) => {
    const ex = Math.exp(x);
    const den = phi * phi + variance + ex;
    return ex * (delta * delta - phi * phi - variance - ex) / (2 * den * den) - (x - a) / (tau * tau);
  };
  let A = a;
  let B;
  if (delta * delta > phi * phi + variance) B = Math.log(delta * delta - phi * phi - variance);
  else {
    let k = 1;
    while (f(a - k * tau) < 0) {
      if (++k > 10000) throw new Error("Glicko volatility bracket did not converge");
    }
    B = a - k * tau;
  }
  let fA = f(A), fB = f(B);
  let iterations = 0;
  while (Math.abs(B - A) > 1e-6) {
    if (++iterations > 10000) throw new Error("Glicko volatility did not converge");
    const C = A + (A - B) * fA / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; }
    else fA /= 2;
    B = C; fB = fC;
  }
  const volatility = Math.exp(A / 2);
  const nextPhi = 1 / Math.sqrt(1 / (phi * phi + volatility * volatility) + information);
  return { rating: 1500 + SCALE * (mu + nextPhi * nextPhi * improvement),
    deviation: SCALE * nextPhi, volatility };
}

export function ratePeriod(ratings, results) {
  const games = Object.fromEntries(Object.keys(ratings).map((name) => [name, []]));
  for (const row of [...results].sort((a, b) => a.id.localeCompare(b.id))) {
    if (row.status !== "ok") throw new Error(`cannot rate failed bout ${row.id}`);
    const score = row.winner === null ? 0.5 : row.winner === "left" ? 1 : 0;
    games[row.left].push({ opponent: ratings[row.right], score });
    games[row.right].push({ opponent: ratings[row.left], score: 1 - score });
  }
  return Object.fromEntries(Object.entries(ratings).map(([name, rating]) =>
    [name, updateRating(rating, games[name])]));
}
