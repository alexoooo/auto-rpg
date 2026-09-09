// Rate every checkpoint a league arm wrote, offline, against the same two baselines under common
// random numbers. Session 14 of the style set.
//
//   node scripts/rate-snapshots.mjs --dir tournaments/league-anchored [--bouts 200] [--workers 28]
//                                   [--cap 60] [--random 40] [--only 8,16,24] [--out curve.jsonl]
//                                   [--terminals maul,mace|all]
//
// A league's own `--evaluate` is deliberately coarse: a rating costs bouts the fit could have had,
// so a night at `--evaluate 25` leaves two or three points and no curve. The pool files hold the
// weights of every snapshot the run ever took, so the curve can be bought afterwards at whatever
// the morning can afford, on a machine that is no longer training. That is the whole of this
// script: read the snapshots, rate each one exactly the way the run would have, print a row.
//
// **The rating is the run's own instrument and not a second one.** `ratePolicy` from
// `scripts/train-ppo.mjs` is called with the arm's evaluation pool -- `seed ^ 0xc0f1c0f1`, the same
// derivation `scripts/league.mjs` uses -- so a row printed here is comparable to the rows the run
// printed itself, and to the other arms, and to nothing else. Ratings taken on a different pool
// are a different instrument however similar they look.
//
// The last row is `main`, the live weights out of `league.json` rather than a pool file. On an arm
// that snapshotted on its last iteration those two are the same weights and the row is a repeat;
// on any other arm it is the only rating of where the run actually got to.
//
// **`--terminals` is why this script grew a second pool, on 2026-09-09.** The evaluation pool is
// fifty two draws, and thirty seven of them carry no weapon that has ever finished a fight: not
// "our mind is too weak for them" but nothing has finished them -- `golem-driver`, the hand-written
// reference, kills on fourteen of the fifty two and leaves the dummy's bar at 1.000 on several,
// two of which are unarmed. A bar margin averaged over that pool is three quarters chip damage
// between two minds that both fail to finish, which is how seventy five iterations of self-play
// read as "no change" on an instrument that could not have seen one. `--terminals maul,mace` rates
// on the fifteen bodies where a fight can end, for the same bouts and the same seed.
//
// **It stopped being a flag and became the default on 2026-09-09**, with Session 01 of the learn
// set: absent, `poolFor` draws through `VIABLE_TERMINALS` in `src/golem/viability.ts`, and
// `--terminals all` is how the paragraph above's fifty-two-build pool is asked for. The paragraph
// stands as the reason; what changed is which way round the default sits, because a flag that has
// to be remembered on every run is a rule nothing enforces, and the owner's brief made it a rule.
//
// **A rating is only comparable to another rating on the same pool**, so a row carries the pool it
// was measured on -- the count of builds and the classes kept -- rather than leaving two different
// instruments looking alike in one log file. The unfiltered pool remains what the run's own
// `--evaluate` and `--ship` report, which is what makes it the regression floor: a mind that wins
// the maul bodies by losing the other thirty seven is caught there and nowhere else.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { VIABLE_TERMINALS } from "../src/golem/viability.ts";
import { PPO_LEAGUE, parseTerminals, poolFor, poolSentence, ratePolicy } from "./train-ppo.mjs";
import { loadLeague, poolPath, roleFromJson } from "./league.mjs";

/** The iterations this directory has a checkpoint for, in the order they were taken. */
export function snapshotIterations(dir) {
  return readdirSync(dir)
    .map((f) => /^pool-(\d+)\.json$/.exec(f))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
}

/**
 * Which of them to rate. `--only` is a list and every entry must be a snapshot that exists: a
 * silent filter turns one mistyped iteration into a morning spent rating nothing and noticing
 * late, which is exactly the failure a cheap refusal is for. `none` is the one word it takes
 * instead of numbers, and it means the empty list -- both curves append the live `main` after
 * whatever this returns, so `none` is how a caller asks for that row and no others.
 */
export function chosenSnapshots(snapshots, only) {
  if (only === null || only === undefined) return [...snapshots];
  if (String(only).trim() === "none") return [];
  const wanted = String(only).split(",").map((s) => Number(s.trim()));
  const missing = wanted.filter((n) => !snapshots.includes(n));
  if (missing.length > 0) throw new Error(`no snapshot for iteration ${missing.join(", ")}`);
  return wanted;
}

/**
 * Bouts an opponent, given a budget stated a contender. The budget is spread over the hand-coded
 * league and rounded up to an even number, because a rating is mirrored and an odd count would
 * play one side of one build twice.
 */
export function boutsPerOpponent(perContender, league = PPO_LEAGUE) {
  return Math.max(2, Math.ceil(perContender / league.length / 2) * 2);
}

/**
 * `--terminals maul,mace|all`: the weapon classes to keep. No flag is the viable set.
 *
 * It moved to `scripts/train-ppo.mjs` in Session 01 of the learn set, beside `poolFor`, because
 * four scripts take the same word now and the parser was living downstream of half of them. It is
 * re-exported from where it was written so that no caller and no test changed address.
 */
export { parseTerminals };

export async function rateSnapshots({
  dir, bouts = 200, workers = 28, cap = 60, random = 40, only = null, terminals = VIABLE_TERMINALS,
  onRow = null,
}) {
  const state = loadLeague(dir);
  const pool = poolFor({ seed: (state.seed ^ 0xc0f1c0f1) >>> 0, random, terminals });
  const per = boutsPerOpponent(bouts);
  const chosen = chosenSnapshots(snapshotIterations(dir), only);
  const rows = [];
  for (const iteration of [...chosen, "main"]) {
    const role = iteration === "main"
      ? state.main
      : roleFromJson(JSON.parse(readFileSync(poolPath(dir, iteration), "utf8")));
    const rated = await ratePolicy({
      weights: role.weights, logSigma: role.logSigma, norm: role.norm,
      pool, seed: (state.seed ^ 0xc0f1c0f1) >>> 0, bouts: per, workers, cap, mirror: true, terminals,
    });
    const u = rated.differences.uniform;
    const d = rated.differences.driver;
    const row = {
      iteration, bouts: per, per: rated.per,
      // The pool travels with the row. Two ratings on two pools are two instruments, and a log
      // file that does not say which one a row came from cannot be read six months later.
      pool: { builds: pool.length, terminals: [...terminals] },
      // ^ the classes as asked for, so a row written under the viable default and a row written
      // under `--terminals all` are two instruments a reader can tell apart six months later.
      uniform: { bar: u.bar, sem: u.barSem, d: u.d },
      driver: { bar: d.bar, sem: d.barSem, d: d.d },
      fit: rated.results.fit,
    };
    rows.push(row);
    if (onRow !== null) onRow(row);
  }
  return { state, rows, boutsPerOpponent: per };
}

const signed = (x, places) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(places)}`;

/**
 * One line a snapshot, in the shape the run's own rating block prints.
 *
 * The record at the end is the decisiveness of the rating itself: on the unfiltered pool most of
 * these bouts are draws, and a margin built from draws is a margin built from chip damage.
 */
export function formatRow(row) {
  const { uniform: u, driver: d, fit } = row;
  const played = fit.wins + fit.draws + fit.losses;
  const decided = played === 0 ? 0 : (fit.wins + fit.losses) / played;
  return `  ${String(row.iteration).padStart(5)}: uniform ${signed(u.bar, 4)} ±${(1.96 * u.sem).toFixed(4)} `
    + `d ${signed(u.d, 3)}  |  driver ${signed(d.bar, 4)} ±${(1.96 * d.sem).toFixed(4)} d ${signed(d.d, 3)}`
    + `  |  w/d/l ${fit.wins}/${fit.draws}/${fit.losses} decided ${(decided * 100).toFixed(0)}%`;
}

const isMain = process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const flag = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
  };
  const dir = resolve(flag("dir", ""));
  if (flag("dir", "") === "") throw new Error("--dir names the league directory to rate");
  const bouts = Number(flag("bouts", 200));
  const only = flag("only", null);
  const out = flag("out", null);
  const terminals = parseTerminals(flag("terminals", null));
  const snapshots = snapshotIterations(dir);
  const chosen = chosenSnapshots(snapshots, only);
  const per = boutsPerOpponent(bouts);
  const state = loadLeague(dir);
  const random = Number(flag("random", 40));
  const builds = poolFor({ seed: (state.seed ^ 0xc0f1c0f1) >>> 0, random, terminals }).length;
  const on = poolSentence(terminals);
  console.log(`${dir}: iteration ${state.iteration}, ${snapshots.length} snapshots, rating `
    + `${chosen.length + 1} at ${per} bouts an opponent (${per * PPO_LEAGUE.length} a contender) `
    + `over ${builds} builds, ${on}`);
  const { rows } = await rateSnapshots({
    dir, bouts, workers: Number(flag("workers", 28)), cap: Number(flag("cap", 60)),
    random, only, terminals, onRow: (row) => console.log(formatRow(row)),
  });
  if (out !== null) writeFileSync(resolve(out), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
}
