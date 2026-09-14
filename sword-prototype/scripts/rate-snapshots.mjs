// Rate every checkpoint a league arm wrote, offline, against the same two baselines under common
// random numbers. Session 14 of the style set.
//
//   node scripts/rate-snapshots.mjs --dir tournaments/league-anchored [--bouts 200] [--workers 28]
//                                   [--cap 60] [--random 40] [--only 8,16,24] [--out curve.jsonl]
//                                   [--terminals maul,mace|all] [--pools mirror,random]
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
// **`--pools` replaced `--mirror 1|0` in Session 10 of the learn set, and it is not only a
// rename.** One call rates a snapshot on both arrangements out of one `ratePolicy`, and this
// script writes one row a pool a snapshot with the arrangement inside `pool` rather than beside
// it -- which is where Session 02's curve page keys on it. `--out` with two pools writes two
// files, one a pool, because `readCurve` refuses two pools in one curve file and it is right to:
// a line drawn through thirteen mirrored builds and fifty-two random pairs is a line through two
// instruments. The old flag's argument is the paragraph below and it still stands; what changed is
// that both arrangements are now bought in one pass, so nobody has to remember to buy the second.
//
// **`--mirror 0` is the other pool the learn set reads, and it arrived with Session 06.** Every
// row this script wrote until then was a mirrored one -- one build in both corners -- because that
// is what the league's own `--evaluate` does and a curve has to sit beside the run that made it.
// The set's fourth frozen choice is that the pool that *matters* is random viable pairs: it is the
// pool the screen draws and the one the shipped mind comes thirteenth on, where mirrored it comes
// fifth. Both are wanted and neither replaces the other, so the arrangement is a flag and rides in
// every row beside the pool, for the same reason the pool does: two ratings taken under two
// arrangements are two instruments however alike the rows look.
//
// **Three baselines and not two, since Session 02 of the signal set.** `ratePolicy` now puts
// `golem-fencer` in front of the same bodies from the same seeds as `uniform` and `golem-driver`,
// so every row this script writes carries a `fencer` block: the paired, bout-by-bout margin against
// the mind the screen actually ships, which is the quantity the learn set's criterion was stated on
// and never once measured. A row written before that session has no such block and reads back as
// the row it was, rather than as a fencer column of zeroes.
//
// **The behaviour columns ride the same rows, and that is the point of them.** Session 06's bar is
// two-sided -- an arm has to beat the control on the bar margin *and* halve its near-range stall
// and its retreat outside reach -- and two halves read off two sets of bouts are two instruments
// again. `behaviour` is `ratePolicy`'s own summary of the very bouts the margin was read from.
//
// **A rating is only comparable to another rating on the same pool**, so a row carries the pool it
// was measured on -- the count of builds and the classes kept -- rather than leaving two different
// instruments looking alike in one log file. The unfiltered pool remains what the run's own
// `--evaluate` and `--ship` report, which is what makes it the regression floor: a mind that wins
// the maul bodies by losing the other thirty seven is caught there and nowhere else.
import { appendFileSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { VIABLE_TERMINALS } from "../src/golem/viability.ts";
import {
  PPO_LEAGUE, RATING_POOLS, parseTerminals, poolFor, poolSentence, poolWord, ratePolicy,
} from "./train-ppo.mjs";
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

/**
 * `--pools mirror,random`: the arrangements to rate on, in the order the rows come out.
 *
 * A list and not a boolean because Session 10 of the learn set rates on both, and a list with an
 * order because the order is the order of the rows and a reader of a log file should be able to
 * predict it. A repeat is refused rather than quietly deduplicated: `--pools mirror,mirror` is a
 * caller who meant `mirror,random` and would otherwise pay for the same measurement twice and get
 * a curve file `readCurve` accepts, which is worse than an error.
 */
export function parsePools(text) {
  if (text === null || text === undefined) return [...RATING_POOLS];
  const kept = String(text).split(",").map((s) => s.trim().toLowerCase()).filter((s) => s !== "");
  if (kept.length === 0) throw new Error("--pools wants arrangements, as in mirror,random");
  if (new Set(kept).size !== kept.length) throw new Error(`--pools repeats an arrangement: ${text}`);
  for (const which of kept) {
    if (!RATING_POOLS.includes(which)) {
      throw new Error(`--pools ${which}; this build rates on ${RATING_POOLS.join(" and ")}`);
    }
  }
  return kept;
}

/**
 * Where a curve goes when two arrangements were asked for: the pool's word before the extension.
 *
 * curve.jsonl becomes curve.mirror.jsonl and curve.random.jsonl, and a path with no
 * extension simply gains the word. Split rather than interleaved because `readCurve` refuses two
 * pools in one curve file, which is the right refusal -- a line drawn through thirteen mirrored
 * builds and fifty-two random pairs is a line through two instruments -- and a script that wrote
 * a file its own page will not open would be making the user do the split by hand.
 */
export function curvePath(out, which) {
  const at = out.lastIndexOf(".");
  const slash = Math.max(out.lastIndexOf("/"), out.lastIndexOf("\\"));
  if (at <= slash + 1) return `${out}.${which}`;
  return `${out.slice(0, at)}.${which}${out.slice(at)}`;
}

/**
 * Every file a run will write, resolved before the first bout is collected.
 *
 * **The split is the trap this function exists to make visible.** `--pools mirror,random` writes
 * two files and never the name it was given, and on 2026-09-14 that cost two scripts in one night
 * -- a chained launcher that slept forever waiting on a path nobody writes, and a scorer that
 * refused four arms on the same path for the same reason. Both were written by somebody reading
 * the command rather than the output, which is the only thing that could have told them.
 *
 * So the CLI prints these before it starts, and this is the function a test can point at without
 * paying for a bout. `partial` is where the rows are appended as they land; the run renames it to
 * `path` on the way out, which is what keeps **the final path appearing means the run finished**
 * true for the launchers that wait on it.
 */
export function curveTargets(out, pools) {
  if (out === null || out === undefined) return [];
  const wanted = [...pools];
  if (wanted.length === 0) throw new Error("a rating with an --out was asked for no pools at all");
  return wanted.map((which) => {
    const path = wanted.length === 1 ? out : curvePath(out, which);
    return { which, path, partial: `${path}.partial` };
  });
}

export async function rateSnapshots({
  dir, bouts = 200, workers = 28, cap = 60, random = 40, only = null, terminals = VIABLE_TERMINALS,
  pools = null, mirror = true, onRow = null,
}) {
  const wanted = pools === null ? [mirror ? "mirror" : "random"] : [...pools];
  const state = loadLeague(dir);
  // The pool is handed over class-filtered and `ratePolicy` narrows it again at each arrangement's
  // own `mirror`: `viableMirror` for a mirrored rating, and nothing further for random pairs,
  // which reject at the draw through `viablePair` because a pair predicate cannot be a filter on a
  // list of single builds. Narrowing here instead would make the random rows a rating of thirteen
  // mirrorable bodies drawn two at a time, which is a pool nobody asked for.
  const pool = poolFor({ seed: (state.seed ^ 0xc0f1c0f1) >>> 0, random, terminals, mirror: false });
  const per = boutsPerOpponent(bouts);
  const chosen = chosenSnapshots(snapshotIterations(dir), only);
  const rows = [];
  for (const iteration of [...chosen, "main"]) {
    const role = iteration === "main"
      ? state.main
      : roleFromJson(JSON.parse(readFileSync(poolPath(dir, iteration), "utf8")));
    // One call, both arrangements: the two rows a snapshot writes come off one pass over its
    // weights and out of one seed, so an arm that drifted between them cannot be the explanation
    // for a gap between its own two rows.
    const rated = await ratePolicy({
      weights: role.weights, logSigma: role.logSigma, norm: role.norm,
      pool, seed: (state.seed ^ 0xc0f1c0f1) >>> 0, bouts: per, workers, cap, terminals,
      pools: wanted,
    });
    for (const which of wanted) {
      const on = rated.byPool[which];
      const u = on.differences.uniform;
      const d = on.differences.driver;
      // Session 02 of the signal set: the designed mind the criterion names, on the same bouts as
      // the two columns beside it. Read off `differences` rather than assumed present, because a
      // curve re-read from an older rate file has no such block and a reader that filled it with
      // zeroes would draw a flat line through a measurement nobody took.
      const f = on.differences.fencer ?? null;
      const row = {
        iteration, bouts: per, per: on.per,
        // The pool travels with the row. Two ratings on two pools are two instruments, and a log
        // file that does not say which one a row came from cannot be read six months later. The
        // classes are the ones asked for, so a row written under the viable default and a row
        // written under `--terminals all` are told apart; `mirror` is the same claim about the
        // other axis -- one build in both corners, or two -- and it moved inside this block in
        // Session 10 of the learn set, where `pool` is what Session 02's page keys the label on.
        pool: { builds: on.builds, terminals: [...terminals], mirror: on.mirror },
        // Kept beside it as well, because every row this script wrote between Sessions 06 and 10
        // carried it there and a reader with both in front of them should not have to know when
        // the field moved.
        mirror: on.mirror,
        // `ret` beside `bar` on every baseline, since Experiment T. It is the paired difference
        // in what `GOLEM_REWARD` -- the objective every fit in this record climbed -- paid the two
        // contenders over these same bouts, and it is here because Q measured the objective and
        // the criterion coming apart on one arm and nothing on any rating path could say whether
        // the same thing was true of the mind the criterion names. Now every curve carries both.
        uniform: { bar: u.bar, sem: u.barSem, d: u.d, ret: u.ret, retSem: u.retSem, retD: u.retD },
        driver: { bar: d.bar, sem: d.barSem, d: d.d, ret: d.ret, retSem: d.retSem, retD: d.retD },
        ...(f === null ? {} : { fencer: {
          bar: f.bar, sem: f.barSem, d: f.d, ret: f.ret, retSem: f.retSem, retD: f.retD } }),
        // What the fit and the two baselines *did* over exactly these bouts, so a bar on the margin
        // and a bar on the behaviour are read off one set of bouts rather than two.
        behaviour: on.behaviour,
        // And what the objective paid each of them, term by term. `behaviour` says what a mind did
        // and this says what the table charged it for doing that, which are two different readings
        // of one set of bouts and the second one had never been written down.
        returns: on.returns,
        fit: on.results.fit,
      };
      rows.push(row);
      if (onRow !== null) onRow(row);
    }
  }
  return { state, rows, boutsPerOpponent: per, pools: wanted };
}

const signed = (x, places) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(places)}`;

/**
 * One line a snapshot, in the shape the run's own rating block prints.
 *
 * The record at the end is the decisiveness of the rating itself: on the unfiltered pool most of
 * these bouts are draws, and a margin built from draws is a margin built from chip damage.
 *
 * The stall and retreat seconds are appended only when the row carries a `behaviour` block, which
 * is what lets this print a row written before Session 06 of the learn set as that session found
 * it. A row that has one gets the two numbers the owner's eye asked about, because a rating whose
 * margin improved while its fights got longer is the record's league again and the line should say
 * so where somebody is watching it scroll past.
 */
export function formatRow(row) {
  const { uniform: u, driver: d, fit } = row;
  const played = fit.wins + fit.draws + fit.losses;
  const decided = played === 0 ? 0 : (fit.wins + fit.losses) / played;
  const mine = row.behaviour?.fit ?? null;
  // The arrangement in the line and not only in the row, because two rows a snapshot now scroll
  // past one after the other and a reader watching them go by has to be able to tell which is
  // which without opening the file.
  const on = (row.pool?.mirror ?? row.mirror) === false ? "rand" : "mirr";
  // Printed only where the row has it, so a row this script wrote before Session 02 of the signal
  // set prints as that session found it rather than as a fencer column of nothing.
  const f = row.fencer ?? null;
  return `  ${String(row.iteration).padStart(5)} ${on}: uniform ${signed(u.bar, 4)} ±${(1.96 * u.sem).toFixed(4)} `
    + `d ${signed(u.d, 3)}  |  driver ${signed(d.bar, 4)} ±${(1.96 * d.sem).toFixed(4)} d ${signed(d.d, 3)}`
    + (f === null ? ""
      : `  |  fencer ${signed(f.bar, 4)} ±${(1.96 * f.sem).toFixed(4)} d ${signed(f.d, 3)}`)
    + `  |  w/d/l ${fit.wins}/${fit.draws}/${fit.losses} decided ${(decided * 100).toFixed(0)}%`
    + (mine === null ? ""
      : `  |  stall ${mine.stall.toFixed(2)} s outside ${mine.outside.toFixed(2)} s a bout`);
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
  // `--mirror 1|0` is still read, because the record has commands written down with it in them and
  // a flag that silently becomes a no-op is worse than one that is gone. It is a one-entry
  // `--pools` and the two may not both be passed.
  const mirrorText = flag("mirror", null);
  const poolsText = flag("pools", null);
  if (mirrorText !== null && poolsText !== null) {
    throw new Error("--mirror is a one-entry --pools; pass one of them");
  }
  const pools = mirrorText !== null
    ? [String(mirrorText) === "0" ? "random" : "mirror"]
    : parsePools(poolsText);
  const snapshots = snapshotIterations(dir);
  const chosen = chosenSnapshots(snapshots, only);
  const per = boutsPerOpponent(bouts);
  const state = loadLeague(dir);
  const random = Number(flag("random", 40));
  const on = poolSentence(terminals);
  // One file a pool. `readCurve` refuses two pools in one curve and it is right to, so a caller
  // who asked for both gets curve.jsonl split into curve.mirror.jsonl and
  // curve.random.jsonl rather than a file the page will not open. One pool keeps the name it
  // was given, so every command already written down still writes the file it always wrote.
  //
  // **Resolved before the first bout and printed in the opening line, which is this session's
  // fix.** The split cost two scripts on 2026-09-14: one waited on a file nobody writes and one
  // refused on the same name, and both were written by somebody reading the command rather than
  // the output. A run that names where it will write cannot be guessed wrong about.
  const paths = curveTargets(out === null ? null : resolve(out), pools);
  console.log(`${dir}: iteration ${state.iteration}, ${snapshots.length} snapshots, rating `
    + `${chosen.length + 1} at ${per} bouts an opponent (${per * PPO_LEAGUE.length} a contender) `
    + `${on}, on ${pools.map(poolWord).join(" and ")}`);
  for (const { which, path } of paths) console.log(`  will write ${path} on ${poolWord(which)}`);

  // **A rating's rows are appended to a `.partial` as they land and the file is renamed on the way
  // out**, which is two properties at once and both of them were bought by this night.
  //
  // A 26-point rating is two and a half hours and a 48-point one is nearly five; before this, a
  // kill at hour four left nothing at all, because the whole file was written by one
  // `writeFileSync` after the last row. The rows are now on disk as they are printed, and the
  // rating that lost its rows to a kill on 2026-09-14 would have kept them.
  //
  // And the rename is what keeps the *other* property, which three chained launchers in this
  // session's scratchpad depend on: **the final path appearing means the run finished.** A
  // launcher that waits on rate.jsonl and starts a league when it sees it would have started two
  // and a half hours early against a file that was still being appended to, and the host would
  // have been double-booked by the fix rather than by the defect. `onRow` pushes in the same order
  // `rateSnapshots` pushes into `rows`, so the bytes are the bytes the old path wrote.
  const partial = new Map(paths.map((target) => [target.which, target.partial]));
  for (const handle of partial.values()) writeFileSync(handle, "");
  const { rows } = await rateSnapshots({
    dir, bouts, workers: Number(flag("workers", 28)), cap: Number(flag("cap", 60)),
    random, only, terminals, pools,
    onRow: (row) => {
      console.log(formatRow(row));
      const which = (row.pool?.mirror ?? row.mirror) ? "mirror" : "random";
      const handle = partial.get(which);
      if (handle !== undefined) appendFileSync(handle, `${JSON.stringify(row)}\n`);
    },
  });
  for (const { which, path } of paths) {
    const mine = rows.filter((r) => (r.pool?.mirror ?? r.mirror) === (which === "mirror"));
    renameSync(partial.get(which), path);
    console.log(`  wrote ${path} (${mine.length} rows on ${poolWord(which)})`);
  }
}
