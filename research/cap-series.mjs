/**
 * **The cap from bar series**: for shorter caps, how many of the tournament records' bouts keep
 * their outcome there (an earlier ending, else the fuller bar, as `Duel` decides at its cap) and how
 * many matchups (a pair at a condition, both sides) keep their standing, with Wilson intervals, and
 * the simulated time a pair takes. Reads every record line with a bar series (`readBout`).
 *
 *   node research/cap-series.mjs [folder of records, assets/evaluations/tournament unless given]
 *
 * A shorter cap is chosen when its matchups' interval lies above `KEEP`; 120 s stays when every
 * shorter cap's lies below; otherwise the rows are not yet enough.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CAP_SECONDS } from "../src/arena/duel.ts";
import { SERIES_SECONDS } from "../src/evaluation/contest.ts";
import { readRecord } from "../src/evaluation/record.ts";
import { wilson } from "../src/evaluation/stats.ts";

/** The share of matchups a shorter cap must keep. */
const KEEP = 0.95;
/** The caps read, s: multiples of the series' spacing. */
const CAPS = [30, 40, 50, 60, 90];

const dir = process.argv[2] ?? "assets/evaluations/tournament";
const lines = new Map();
for (const name of readdirSync(dir).filter((one) => one.endsWith(".jsonl")))
  for (const line of readRecord(readFileSync(join(dir, name), "utf8"), name).lines) if (!line.fault && line.reading.series) lines.set(line.key, line);
const bouts = [...lines.values()];
const short = bouts.filter(({ reading }) => reading.series.at(-1)[0] !== reading.bars[0] || reading.series.at(-1)[1] !== reading.bars[1]);
if (short.length) throw new Error(`${short.length} series do not end at their reading's bars`);

const units = new Map();
for (const bout of bouts) {
  const key = `${[...bout.subjects].sort().join("|")} ${JSON.stringify(bout.condition)}`;
  units.set(key, [...(units.get(key) ?? []), bout]);
}
const matchups = [...units.values()].filter((unit) => unit.length === 2);
if (matchups.length === 0) { console.log(`no matchup in ${dir} has a bar series: the cap stays ${CAP_SECONDS} s until reports are recorded`); process.exit(0); }

/** A bout's winner had its cap been `t`. */
const winnerAt = ({ reading }, t) => {
  if (reading.seconds <= t) return reading.winner;
  const [left, right] = reading.series[t / SERIES_SECONDS - 1];
  return left > right ? "left" : right > left ? "right" : null;
};
const scoreOf = (winner) => winner === null ? 0.5 : winner === "left" ? 1 : 0;
/** The sign of the first-seated subject's pair score, its winners given by `winner`. */
const standing = (unit, winner) => {
  const first = unit[0].subjects[0], score = unit.reduce((sum, bout) => sum + (bout.subjects[0] === first ? scoreOf(winner(bout)) : 1 - scoreOf(winner(bout))), 0) / 2;
  return Math.sign(score - 0.5);
};
const share = (estimate) => `${estimate.value.toFixed(3)} (${estimate.low.toFixed(3)} to ${estimate.high.toFixed(3)})`;

console.log(`${bouts.length} bouts with a series, ${matchups.length} matchups; ${bouts.filter(({ reading }) => reading.ending === "time").length} at the ${CAP_SECONDS} s cap\n`);
console.log("| Cap, s | Bouts keeping their outcome | Matchups keeping their standing | Simulated s a pair |\n|---|---|---|---|");
const rows = CAPS.map((t) => {
  const kept = wilson(bouts.filter((bout) => winnerAt(bout, t) === bout.reading.winner).length, bouts.length);
  const standingKept = wilson(matchups.filter((unit) => standing(unit, (bout) => winnerAt(bout, t)) === standing(unit, (bout) => bout.reading.winner)).length, matchups.length);
  const seconds = matchups.reduce((sum, unit) => sum + unit.reduce((s, bout) => s + Math.min(t, bout.reading.seconds), 0), 0) / matchups.length;
  console.log(`| ${t} | ${share(kept)} | ${share(standingKept)} | ${seconds.toFixed(0)} |`);
  return { t, standingKept };
});
const chosen = rows.find(({ standingKept }) => standingKept.low >= KEEP);
console.log(`\n${chosen ? `the cap can be ${chosen.t} s`
  : rows.every(({ standingKept }) => standingKept.high < KEEP) ? `the cap stays ${CAP_SECONDS} s`
  : "not yet enough rows: a shorter cap's interval straddles the bar"}`);
