/**
 * **The measuring command** (the measured-mind plan's rules 2 and 4): given what is in hand, one
 * matchup, it plays its bouts, adds their rows to the fight record (`record.mjs`) and fits that
 * matchup's bodies' entries from the record's rows of it alone.
 *
 *   npm run measure -- <entrant> [<entrant>] [--protocol measuring] [--again] [--workers N] [--write]
 *
 * An entrant is the tournament's (`mind/body/left,right`: `option-lean/man/empty,empty`); one
 * entrant is its mirror. It plays the tournament's `--protocol` (`measuring` unless named: draws no
 * reading is played on) with the first entrant on the left, and with two entrants each on each
 * side, on as many workers as the machine spares (`defaultLanes`). It plays only the bouts the
 * record has no row of, so a run stopped partway (by its PID) goes on where it stopped when run
 * again; `--again` plays them all again, the old rows kept and counting for less, each half as much
 * for each newer row of its bout. Its price is said from its first chunk, before the rest.
 *
 * Then each fit (`FITS`) is fitted to the matchup's rows and its held-out readings said. It refuses
 * to write (`--write`) a fit that moves what any other pairing of bodies reads, since those bodies
 * had no rows added (rule 2); a fit is written only to where the game reads it, and the commit and
 * the inventory say what it moved.
 *
 * It refuses to start without an entrant, and has no way to run on everything (rule 4).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { defaultLanes, simulationWorker } from "../../scripts/lanes.mjs";
import { commitOf, uncommittedInputs } from "../../scripts/build-identity.mjs";
import { workerJobs } from "../worker-jobs.mjs";
import { folderOf, keyOf, keysIn, readingOf, rowsIn, rowText } from "./record.mjs";
import { fitValue, followed, HORIZONS, readValue } from "./value-fit.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const USAGE = "usage: npm run measure -- <entrant> [<entrant>] [--protocol measuring] [--again] [--workers N] [--write]\n  an entrant is mind/body/left,right, as option-lean/man/empty,empty";

const { values: flags, positionals } = parseArgs({ allowPositionals: true, options: {
  protocol: { type: "string", default: "measuring" }, again: { type: "boolean", default: false }, workers: { type: "string" }, write: { type: "boolean", default: false },
} });
if (positionals.length < 1 || positionals.length > 2) { console.error(USAGE); process.exit(1); }

await import("../../tests/harness/preload-data.mjs");
const { EVALUATIONS } = await import("../../src/app/node/evaluation.ts");
const { FEATURES, featuresOf } = await import("../../src/minds/option/predictions/value/fitted-value.ts");
const { digestOf, playedOnce } = await import("../skills/profile-origin.mjs");
const { treesAt } = await import("../../src/minds/option/predictions/value/boosted-trees.ts");

const tournament = EVALUATIONS.tournament, cases = tournament.protocols[flags.protocol];
if (!cases) throw new Error(`the tournament has no protocol ${flags.protocol}: ${Object.keys(tournament.protocols).join(", ")}`);
const entrants = positionals.map((id) => {
  if (id.split("/").length !== 3) throw new Error(`${id} is no entrant\n${USAGE}`);
  const [one] = tournament.subjects([id]);
  return one;
});
const [a, b = a] = entrants, folder = folderOf([a.id, b.id]), matchup = a.id === b.id ? `${a.id}'s mirror` : `${a.id} against ${b.id}`;

/**
 * **What is fitted from the record**: each its name, the asset the game reads it from, how it is
 * fitted to a matchup's states, what the asset in place reads of the same states held out where it
 * reads them (`inPlace`), and what each pairing of bodies reads of it (`readings`: by "own
 * against foe", a digest of what is read), so a fit that moves another pairing is refused.
 */
const FITS = [{
  name: "the fitted value (assets/minds/fitted-value.json)",
  asset: "assets/minds/fitted-value.json",
  fit(record) {
    const { models, fitted, held } = fitValue(record.states, FEATURES.length, (line) => console.log(`  ${line}`));
    const origin = `research/minds/measure.mjs: ${fitted} states of ${matchup} on ${record.protocols.join(" and ")}, played at ${record.commits.join(" and ")} (.cache/record/${folder.split(/[\\/]/).pop()}), ${held} held out`;
    return { origin, from: { minds: record.played }, bodies: [...record.bodies].sort(), features: FEATURES, horizons: HORIZONS, models };
  },
  inPlace(value, record) {
    if (JSON.stringify(value.horizons) !== JSON.stringify(HORIZONS)) return console.log(`  the asset in place reads other horizons (${value.horizons.join(", ")} s)`);
    if (![...record.pairings].some((pairing) => this.readings(value).has(pairing))) return console.log("  the asset in place reads none of these pairings");
    console.log(`  the asset in place (${value.origin}), on the same states:`);
    readValue(value.models, record.states, treesAt, (line) => console.log(`  ${line}`));
  },
  // A body reads it against a foe where both are among its bodies (`fittedOn`).
  readings: (value) => new Map(value.bodies.flatMap((own) => value.bodies.map((foe) => [`${own} against ${foe}`, digestOf(value.models)]))),
}];

// Play: each condition with the first on the left, and the second there too where they differ.
const jobs = (a.id === b.id ? [[a, b]] : [[a, b], [b, a]]).flatMap(([left, right]) =>
  cases.conditions.map((_, index) => ({ key: keyOf(flags.protocol, index, left.id, right.id), protocol: flags.protocol, index, entrants: [left, right] })));
const kept = await keysIn(folder), toPlay = flags.again ? jobs : jobs.filter((job) => !kept.has(job.key));
console.log(`${matchup} on ${flags.protocol}: ${jobs.length} bouts, ${jobs.filter((job) => kept.has(job.key)).length} in the record, ${toPlay.length} to play`);
if (toPlay.length > 0) await play(toPlay);

// Fit.
const record = await statesOf(folder);
console.log(`the record: ${record.states.length} states of ${record.bouts.size} bouts, ${record.held} of them held out, the bodies ${[...record.bodies].join(" and ")}`);
if (record.held === 0 || record.held === record.bouts.size) { console.log("nothing fitted: a fit needs bouts both fitted and held out"); process.exit(0); }
let refused = false;
for (const fit of FITS) {
  console.log(`\n${fit.name}:`);
  const path = join(ROOT, fit.asset), was = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
  if (was) fit.inPlace(was, record);
  console.log("  fitted to the record:");
  const made = fit.fit(record), before = was ? fit.readings(was) : new Map(), after = fit.readings(made);
  const inHand = record.pairings;
  const moved = [...new Set([...before.keys(), ...after.keys()])].filter((pairing) => !inHand.has(pairing) && before.get(pairing) !== after.get(pairing)).sort();
  const changed = [...inHand].filter((pairing) => before.get(pairing) !== after.get(pairing));
  console.log(`  it moves ${changed.length ? changed.join(", ") : "nothing"} in hand`);
  if (moved.length) { refused = true; console.log(`  refused: it would move ${moved.join(", ")}, which had no rows added (rule 2); nothing written`); continue; }
  if (!flags.write) { console.log(`  not written (--write writes ${fit.asset})`); continue; }
  writeFileSync(path, JSON.stringify(made) + "\n");
  console.log(`  wrote ${fit.asset}: ${made.origin}`);
}
process.exit(refused ? 1 : 0);

/** Play `jobs` on the workers, each row kept as it comes, and say the price from the first chunk. */
async function play(jobs) {
  const lanes = flags.workers ? Number(flags.workers) : defaultLanes(), commit = commitOf(), changed = (commit ? uncommittedInputs() : []).length > 0, file = join(folder, `${hostname()}.jsonl`);
  const chunk = Math.min(lanes, jobs.length), from = performance.now();
  let done = 0;
  mkdirSync(folder, { recursive: true });
  console.log(`playing on ${lanes} workers at ${commit ?? "no commit"}${changed ? " with build inputs changed" : ""}; stop it by its PID (${process.pid}) and run it again to go on`);
  await workerJobs(jobs, { lanes, create: () => simulationWorker(new URL("./record-worker.mjs", import.meta.url)),
    result: ({ result }, job) => {
      appendFileSync(file, rowText({ key: job.key, ...result, commit, changed, date: new Date().toISOString() }) + "\n");
      done++;
      const seconds = (performance.now() - from) / 1000;
      console.log(`${job.key}: ${result.roots.length} roots, ${result.end.toFixed(1)} s (${done} of ${jobs.length})`);
      if (done === chunk && jobs.length > chunk) {
        const each = seconds / chunk * lanes, rest = (jobs.length - done) * each / lanes;
        console.log(`the price, from the first ${chunk}: ${(each).toFixed(0)} worker-seconds a bout, so about ${(rest / 60).toFixed(0)} min more for the other ${jobs.length - done}`);
      }
      return null;
    } });
  console.log(`played ${jobs.length} bouts in ${((performance.now() - from) / 60000).toFixed(1)} min`);
}

/**
 * **The record's states for the fits** in `folder`: each root as the fitted value reads it, both
 * sides', with what followed it over each horizon, whether its bout is held out (`HELD`), and its
 * weight (half for each newer row of its bout); with the bodies, the pairings of them that played
 * (`own against foe`, each way), the bouts and the Minds that played.
 */
async function statesOf(folder) {
  const rows = [], newer = new Map();
  for await (const row of rowsIn(folder)) {
    const states = row.roots.map((root) => ({ x: featuresOf(readingOf(root)), after: HORIZONS.map((h) => followed(row.lives, row.end, root.side, root.t, h)) }));    rows.push({ key: row.key, date: row.date, bout: `${row.protocol}/${row.index}`, sides: row.sides, commit: row.commit, changed: row.changed, states });
    (newer.get(row.key) ?? newer.set(row.key, []).get(row.key)).push(row.date);
  }
  const states = [], bodies = new Set(), pairings = new Set(), bouts = new Set(), played = [], commits = new Set(), protocols = new Set();
  let held = 0;
  for (const row of rows) {
    const weight = 0.5 ** newer.get(row.key).filter((date) => date > row.date).length, out = HELD(row.bout);
    for (const side of Object.values(row.sides)) { bodies.add(side.body); played.push(side.played); }
    pairings.add(`${row.sides.left.body} against ${row.sides.right.body}`).add(`${row.sides.right.body} against ${row.sides.left.body}`);
    bouts.add(row.key); protocols.add(row.bout.split("/")[0]); commits.add(`${row.commit}${row.changed ? " with build inputs changed" : ""}`);
    if (out) held++;
    for (const state of row.states) states.push({ ...state, held: out, weight });
  }
  return { states, bodies, pairings, bouts, held, protocols: [...protocols].sort(), played: playedOnce(played), commits: [...commits] };
}

/** The bouts held out of a fit: one condition in five, by a hash of its protocol and place, both side orders together. */
function HELD(bout) { let h = 0; for (const c of bout) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 5 === 0; }
