// The decisiveness curve: run the idle probe against every checkpoint a league arm wrote.
// Session 14 of the style set.
//
//   node scripts/probe-snapshots.mjs --dir tournaments/league-anchored [--bouts 4] [--workers 28]
//                                    [--cap 60] [--seed 20260906] [--only 8,16] [--out curve.jsonl]
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
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { buildPool } from "./tournament.mjs";
import { contenderFor, loadLeague, poolPath, roleFromJson } from "./league.mjs";
import { formatIdleProbe, idleProbe } from "./idle-probe.mjs";
import { chosenSnapshots, snapshotIterations } from "./rate-snapshots.mjs";

/** The kill rate of one armed class, or null when the pool has no build carrying it. */
export function classRate(byTerminal, terminal) {
  const group = byTerminal.find((g) => g.terminal === terminal);
  return group === undefined ? null : group.killRate;
}

export async function probeSnapshots({
  dir, bouts = 4, workers = 28, cap = 60, seed = 20260906, random = 40, only = null, onRow = null,
}) {
  const state = loadLeague(dir);
  const pool = buildPool({ seed, random });
  const chosen = chosenSnapshots(snapshotIterations(dir), only);
  const rows = [];
  for (const iteration of [...chosen, "main"]) {
    const role = iteration === "main"
      ? state.main
      : roleFromJson(JSON.parse(readFileSync(poolPath(dir, iteration), "utf8")));
    const probe = await idleProbe({
      pool, name: "fit", contender: contenderFor(role, false), bouts, workers, cap, seed,
    });
    const row = {
      iteration, kills: probe.kills, bouts: probe.bouts, killRate: probe.killRate,
      always: probe.alwaysBuilds, ever: probe.everBuilds,
      maul: classRate(probe.byTerminal, "maul"), mace: classRate(probe.byTerminal, "mace"),
      byTerminal: probe.byTerminal,
    };
    rows.push(row);
    if (onRow !== null) onRow(row, probe);
  }
  return { state, rows };
}

const percent = (x) => (x === null ? "  --" : `${(x * 100).toFixed(0)}%`.padStart(4));

/** One line a snapshot: the rollup, then the two classes that can finish a bout. */
export function formatProbeRow(row, builds) {
  return `  ${String(row.iteration).padStart(5)}: ${String(row.kills).padStart(4)}/${row.bouts}`
    + ` = ${((row.killRate) * 100).toFixed(1).padStart(5)}%   maul ${percent(row.maul)}`
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
  const builds = buildPool({ seed, random }).length;
  const only = flag("only", null);
  const out = flag("out", null);
  const state = loadLeague(dir);
  const chosen = chosenSnapshots(snapshotIterations(dir), only);
  console.log(`${dir}: iteration ${state.iteration}, probing ${chosen.length + 1} minds `
    + `over ${builds} builds at seed ${seed}, cap ${flag("cap", 60)} s`);
  let last = null;
  const { rows } = await probeSnapshots({
    dir, bouts: Number(flag("bouts", 4)), workers: Number(flag("workers", 28)),
    cap: Number(flag("cap", 60)), seed, random, only,
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
