// The decisiveness curve: run the idle probe against every checkpoint a league arm wrote.
// Session 14 of the style set.
//
//   node scripts/probe-snapshots.mjs --dir tournaments/league-anchored [--bouts 4] [--workers 28]
//                                    [--cap 60] [--seed 20260906] [--only 8,16] [--out curve.jsonl]
//                                    [--baseline 9/28] [--terminals maul,mace|all]
//
// **Why this exists beside the rating curve rather than inside it.** On the night of 2026-09-08 the
// three arms were flat on the bar rating -- changes of −0.020 to −0.049 against intervals of ±0.06
// -- and one of them had meanwhile gone from killing a mirrored idle dummy on 32 % of maul bouts to
// 86 %, and from finishing no build reliably to finishing five. Both numbers are correct. The
// rating averages over fifty-two builds and thirty-eight of them cannot finish a bout inside the
// cap, so a mind that doubles its kill rate on the seven mauls barely moves that mean. The rating
// says who wins the pool; this says whether a fight ends. A session that reads only the first will
// conclude a run did nothing on the night it did the one thing it was asked for.
//
// The default seed is the *calibration's* probe seed and not the arm's, on purpose: it makes a row
// here directly comparable to `golem-driver` at 46/208 and to the shipped fit at 10/208, which are
// the two numbers anyone reading a curve wants it placed between.
//
// **`--baseline 9/28` is the test, and it is one test.** The maul class is seven builds, so a row
// at four bouts a build is a count out of twenty eight, and the pre-registered comparison of
// Session 14 is that count against the shipped fit's nine. Fisher's exact, two-sided, because
// twenty eight bouts is far too few for a normal approximation -- twelve of fourteen has a Wald
// interval that runs past one. The threshold the session fixed before the data is p < 0.01 and not
// 0.05, because the curve is a dozen rows across three arms and 0.05 buys a false claim by
// construction. Every other column of a row -- the pool total, the mace rate, always and ever out
// of fifty two -- is descriptive, and the entry reports it without a test.
//
// There is no default baseline. A row probed without one carries `p: null`, which is a different
// fact from a p of 1, and the baseline is named on the command line so that the row a p was
// measured against sits in the shell history beside it.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { VIABLE_TERMINALS } from "../src/golem/viability.ts";
import { parseTerminals, poolFor, poolSentence } from "./train-ppo.mjs";
import { contenderFor, loadLeague, poolPath, roleFromJson } from "./league.mjs";
import { formatIdleProbe, idleProbe } from "./idle-probe.mjs";
import { chosenSnapshots, snapshotIterations } from "./rate-snapshots.mjs";

/** The kill rate of one armed class, or null when the pool has no build carrying it. */
export function classRate(byTerminal, terminal) {
  const group = byTerminal.find((g) => g.terminal === terminal);
  return group === undefined ? null : group.killRate;
}

// --------------------------------------------------------- the test, and the counts it needs

/**
 * The class's table: kills and bouts, not the mean of the per-build rates.
 *
 * `classRate` answers "how decisive is this class" and is what a row prints; a test wants the two
 * integers behind it. They differ when a bout is lost to a crashed worker, and only the integers
 * can be handed to a hypergeometric.
 */
export function classCount(byTerminal, terminal) {
  const group = byTerminal.find((g) => g.terminal === terminal);
  return group === undefined ? null : { kills: group.kills, bouts: group.bouts };
}

// Fisher's exact test, two-sided. The pre-registered comparison of Session 14 is one weapon class
// against a fixed starting row: the maul class is 7 builds, so a probe at 4 bouts a build is 28
// bouts and one at 2 is 14. Counts that small have Wald intervals running past 1 -- 12 of 14 is
// one -- and the quantity is a count of successes out of a fixed number of trials, which is
// exactly the 2x2 case. It lives in the shipped script rather than in a scratch file because a p
// value in docs/measurements.md whose calculator is not in the tree is not reproducible, and
// reproducibility is the one property that document exists for.
const lgamma = (x) => {
  // Lanczos, g = 7, n = 9. Enough for counts in the hundreds; the tables here are in the tens.
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  let a = c[0];
  const t = x - 1 + 7.5;
  for (let i = 1; i < 9; i += 1) a += c[i] / (x - 1 + i);
  return 0.5 * Math.log(2 * Math.PI) + (x - 1 + 0.5) * Math.log(t) - t + Math.log(a);
};
const lchoose = (n, k) => lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);

/** The hypergeometric probability of `a` kills in the first row of a 2x2 with these margins. */
export function tableP(a, rowA, rowB, kills) {
  const n = rowA + rowB;
  return Math.exp(lchoose(rowA, a) + lchoose(rowB, kills - a) - lchoose(n, kills));
}

/**
 * Two-sided p: every table at least as unlikely as the observed one, summed -- the convention R's
 * fisher.test uses, and the reason a one-sided halving of this number is not the same test.
 */
export function fisher(killsA, boutsA, killsB, boutsB) {
  const kills = killsA + killsB;
  const lo = Math.max(0, kills - boutsB);
  const hi = Math.min(boutsA, kills);
  const observed = tableP(killsA, boutsA, boutsB, kills);
  let p = 0;
  for (let a = lo; a <= hi; a += 1) {
    const q = tableP(a, boutsA, boutsB, kills);
    // The tolerance is what makes the two-sided sum symmetric: the mirror table's probability is
    // the observed one to within rounding, and an exact comparison drops it about half the time.
    if (q <= observed * (1 + 1e-9)) p += q;
  }
  return Math.min(1, p);
}

/**
 * `--baseline 9/28`: the fixed row every curve row is tested against, which for Session 14 is the
 * shipped fit's maul class. Refused rather than defaulted, because a baseline chosen after the
 * curve is on screen is the thing the pre-registration exists to prevent.
 */
export function parseBaseline(text) {
  if (text === null || text === undefined) return null;
  const parts = String(text).split("/").map((s) => Number(s.trim()));
  const whole = (n) => Number.isInteger(n) && n >= 0;
  if (parts.length !== 2 || !parts.every(whole) || parts[1] === 0 || parts[0] > parts[1]) {
    throw new Error(`--baseline wants kills/bouts, as in 9/28, and not ${text}`);
  }
  return { kills: parts[0], bouts: parts[1] };
}

/**
 * One curve row: the rollup, the two classes that can finish a bout, and the maul class's table.
 *
 * The table is stored beside the rate because the rate cannot be turned back into it, and a curve
 * whose rows cannot be re-tested is a curve that has to be re-run to answer the next question.
 * `p` is the two-sided Fisher against the baseline row, and is null when no baseline was asked
 * for -- a row that was never tested says so rather than carrying a 1.
 */
export function probeRow(iteration, probe, baseline = null) {
  const maul = classCount(probe.byTerminal, "maul");
  return {
    iteration, kills: probe.kills, bouts: probe.bouts, killRate: probe.killRate,
    always: probe.alwaysBuilds, ever: probe.everBuilds,
    maul: classRate(probe.byTerminal, "maul"), mace: classRate(probe.byTerminal, "mace"),
    maulKills: maul === null ? null : maul.kills, maulBouts: maul === null ? null : maul.bouts,
    p: baseline === null || maul === null ? null
      : fisher(maul.kills, maul.bouts, baseline.kills, baseline.bouts),
    byTerminal: probe.byTerminal,
  };
}

export async function probeSnapshots({
  dir, bouts = 4, workers = 28, cap = 60, seed = 20260906, random = 40, only = null,
  baseline = null, onRow = null, terminals = VIABLE_TERMINALS,
}) {
  const state = loadLeague(dir);
  const pool = poolFor({ seed, random, terminals });
  const chosen = chosenSnapshots(snapshotIterations(dir), only);
  const rows = [];
  for (const iteration of [...chosen, "main"]) {
    const role = iteration === "main"
      ? state.main
      : roleFromJson(JSON.parse(readFileSync(poolPath(dir, iteration), "utf8")));
    const probe = await idleProbe({
      pool, name: "fit", contender: contenderFor(role, false), bouts, workers, cap, seed,
    });
    const row = probeRow(iteration, probe, baseline);
    rows.push(row);
    if (onRow !== null) onRow(row, probe);
  }
  return { state, rows };
}

const percent = (x) => (x === null ? "  --" : `${(x * 100).toFixed(0)}%`.padStart(4));

/** One line a snapshot: the rollup, then the two classes that can finish a bout. */
export function formatProbeRow(row, builds) {
  // The p sits against the maul rate and not at the end of the line, because it is a statement
  // about that one class against the baseline and not about the pool total the row opens with.
  const p = row.p === null || row.p === undefined ? "" : ` p ${row.p.toFixed(4)}`;
  return `  ${String(row.iteration).padStart(5)}: ${String(row.kills).padStart(4)}/${row.bouts}`
    + ` = ${((row.killRate) * 100).toFixed(1).padStart(5)}%   maul ${percent(row.maul)}${p}`
    + `   mace ${percent(row.mace)}   always ${String(row.always).padStart(2)}/${builds}`
    + `   ever ${String(row.ever).padStart(2)}/${builds}`;
}

const isMain = process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const flag = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
  };
  if (flag("dir", "") === "") throw new Error("--dir names the league directory to probe");
  const dir = resolve(flag("dir", ""));
  const seed = Number(flag("seed", 20260906)) >>> 0;
  const random = Number(flag("random", 40));
  const terminals = parseTerminals(flag("terminals", null));
  const builds = poolFor({ seed, random, terminals }).length;
  const only = flag("only", null);
  const out = flag("out", null);
  const baseline = parseBaseline(flag("baseline", null));
  const state = loadLeague(dir);
  const chosen = chosenSnapshots(snapshotIterations(dir), only);
  const against = baseline === null ? ""
    : `, maul class tested against ${baseline.kills}/${baseline.bouts}`;
  console.log(`${dir}: iteration ${state.iteration}, probing ${chosen.length + 1} minds `
    + `over ${builds} builds at seed ${seed}, ${poolSentence(terminals)}, cap ${flag("cap", 60)} s${against}`);
  let last = null;
  const { rows } = await probeSnapshots({
    dir, bouts: Number(flag("bouts", 4)), workers: Number(flag("workers", 28)),
    cap: Number(flag("cap", 60)), seed, random, only, baseline, terminals,
    onRow: (row, probe) => { console.log(formatProbeRow(row, builds)); last = probe; },
  });
  if (last !== null) {
    console.log("");
    console.log(formatIdleProbe({ ...last, name: `${dir}, its last row, greedy` }));
  }
  if (out !== null) {
    writeFileSync(resolve(out), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  }
}
