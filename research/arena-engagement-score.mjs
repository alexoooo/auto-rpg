/** Paired physical comparisons retain every case and use actual elapsed-time and attempt denominators. */
export function engagementComparison(reference, candidate, { earlyVictory = false } = {}) {
  const key = r => JSON.stringify([r.config.held, r.config.hand, r.config.motion, r.config.gap, r.config.mirror, r.config.seconds ?? 40, r.config.cadence ?? { walk: 2, rest: 2 }]);
  const keys = reference.map(key).sort();
  if (JSON.stringify(keys) !== JSON.stringify(candidate.map(key).sort()) || new Set(keys).size !== keys.length) throw new Error("engagement comparisons require the same unique cases");
  const summarize = rows => {
    const total = { cases: rows.length, seconds: 0, attempts: 0, usefulReturns: 0, falls: 0, timeouts: 0 };
    for (const row of rows) {
      total.seconds += row.simulatedSeconds; total.attempts += row.attempts; total.usefulReturns += row.usefulReturns;
      total.falls += row.falls; total.timeouts += row.timeouts;
    }
    return { ...total, usefulPerSecond: total.seconds > 0 ? total.usefulReturns / total.seconds : 0,
      fallsPerSecond: total.seconds > 0 ? total.falls / total.seconds : 0,
      timeoutsPerAttempt: total.attempts > 0 ? total.timeouts / total.attempts : 0 };
  };
  const baseline = summarize(reference), measured = summarize(candidate), failures = [], earlyVictories = [];
  if (!candidate.length || !(measured.seconds > 0)) failures.push("no measured cases");
  if (!(measured.usefulPerSecond > baseline.usefulPerSecond)) failures.push("useful return rate did not improve");
  if (measured.fallsPerSecond > baseline.fallsPerSecond) failures.push("fall rate increased");
  if (measured.timeoutsPerAttempt > baseline.timeoutsPerAttempt) failures.push("phase timeout rate increased");
  for (const row of candidate) {
    if (row.attempts === 0 || row.usefulReturns === 0) failures.push(`${key(row)} never completed a useful cycle`);
    if (row.config.motion !== "stationary" && row.config.motion !== "lateral") continue;
    const won = row.verdict?.winner === (row.config.mirror ? "right" : "left") && row.verdict?.ending !== "time";
    if (row.falls > 0 || (row.usefulReturns < 3 && !(earlyVictory && won && row.usefulReturns > 0))) failures.push(`${key(row)} failed the repeatability gate`);
    else if (row.usefulReturns < 3) earlyVictories.push(key(row));
  }
  return { eligible: failures.length === 0, earlyVictory, baseline, candidate: measured, failures, earlyVictories };
}
