import { initialRating, ratePeriod } from "./rating.mjs";
import { completeRounds } from "./schedule.mjs";

const empty = () => ({ bouts: 0, wins: 0, draws: 0, losses: 0, score: 0, seconds: 0,
  overtime: 0, attackRate: 0, retreatFraction: 0, blockRate: 0, range: [0, 0, 0, 0] });
function add(cell, row, side) {
  const score = row.winner === null ? 0.5 : row.winner === side ? 1 : 0;
  cell.bouts++; cell.wins += score === 1; cell.draws += score === 0.5; cell.losses += score === 0;
  cell.score += score; cell.seconds += row.seconds; cell.overtime += row.overtime ? 1 : 0;
  const d = row.sides[side].descriptors;
  for (const key of ["attackRate", "retreatFraction", "blockRate"]) cell[key] += d[key];
  d.range.forEach((value, i) => { cell.range[i] += value; });
}
function normalized(cell) {
  return { ...cell, score: cell.score / cell.bouts, seconds: cell.seconds / cell.bouts,
    attackRate: cell.attackRate / cell.bouts, retreatFraction: cell.retreatFraction / cell.bouts,
    blockRate: cell.blockRate / cell.bouts, range: cell.range.map((n) => n / cell.bouts) };
}
export function summarize(manifest, jobs, results) {
  const rounds = completeRounds(jobs, results);
  let ratings = Object.fromEntries(manifest.policies.map((name) => [name, initialRating()]));
  for (const round of rounds) ratings = ratePeriod(ratings, round);
  const rows = rounds.flat();
  const policies = {};
  for (const name of manifest.policies) {
    const total = empty(), sides = { left: empty(), right: empty() }, matchups = {}, builds = {};
    for (const row of rows) for (const side of ["left", "right"]) if (row[side] === name) {
      const other = side === "left" ? "right" : "left";
      add(total, row, side); add(sides[side], row, side);
      add(matchups[row[other]] ??= empty(), row, side);
      add(builds[row[`${side}Build`]] ??= empty(), row, side);
    }
    policies[name] = { ...ratings[name], provisional: rounds.length < 4 || ratings[name].deviation > 100,
      ...normalized(total), sides: Object.fromEntries(Object.entries(sides).map(([k, v]) => [k, normalized(v)])),
      matchups: Object.fromEntries(Object.entries(matchups).map(([k, v]) => [k, normalized(v)])),
      builds: Object.fromEntries(Object.entries(builds).map(([k, v]) => [k, normalized(v)])) };
  }
  return { version: 1, fingerprint: manifest.fingerprint, protocol: manifest.protocol,
    completedRounds: rounds.length, ratedBouts: rows.length, completedBouts: results.filter((r) => r.status === "ok").length,
    scheduledBouts: jobs.length, failures: results.filter((r) => r.status !== "ok"), policies };
}

export function markdownReport(report) {
  if (!report.completedRounds) return `# Current AI league\n\nHarness: tests/harness/bout-runner.mjs.\n\nNo complete balanced rating round yet; ${report.completedBouts} completed bouts, ${report.failures.length} failures. No ratings published.\n`;
  const lines = ["# Current AI league", "", "Harness: `tests/harness/bout-runner.mjs`, fresh Havok per bout, supported locomotion.", "",
    `${report.completedRounds} complete rating rounds; ${report.ratedBouts} rated bouts; ${report.failures.length} failed bouts.`, "",
    "Only complete balanced rounds contribute to ratings. Scores include half a point for a draw.", "",
    "| Policy | Glicko-2 | RD | Score | Draws | Attack/s | Retreat | Blocks/s |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"];
  for (const [name, p] of Object.entries(report.policies).sort((a, b) => b[1].rating - a[1].rating)) {
    lines.push(`| ${name} | ${Math.round(p.rating)}${p.provisional ? " provisional" : ""} | ${p.deviation.toFixed(1)} | ${(100 * p.score).toFixed(1)}% | ${p.draws} | ${p.attackRate.toFixed(2)} | ${(100 * p.retreatFraction).toFixed(1)}% | ${p.blockRate.toFixed(2)} |`);
  }
  lines.push("", "Full matchup, build, side, overtime and behavior breakdowns are in `summary.json`.", "");
  return lines.join("\n");
}
