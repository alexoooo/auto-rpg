/**
 * **The tournament**: every mind a person may pick (`MINDS`) on every character it fits, with each
 * representative loadout (`REPRESENTATIVE`) that character holds and the mind can use
 * (`modelSupportsMind`), against every other such entrant, each on each side, by the Arena's rules; rated by Bradley-Terry on the Elo scale,
 * the field's mean 1500 (`bradleyTerry`, `research/rating.mjs`), with a 95 % interval from
 * resampling the pairings (`ratingIntervals`). Bouts are the same on every machine, so a rating
 * is the code's and the protocol's, and an Elo read in the order bouts happened to be played would
 * not be: every game counts at once.
 *
 *   node scripts/tournament.mjs [--workers N] [--minds a,b,...] [--write]
 *
 * Each bout is kept as it ends in `research/runs/tournament/<build>-<protocol>.jsonl`, so a run
 * stopped and started again on the same source content plays only what is missing. `--write` puts the table
 * in `assets/minds/ratings.json` (the Arena's Ratings panel) and each rating in
 * `assets/minds/notes.json` as `"<rating> <yyyy-MM-dd>"`: a character with a loadout its own, and
 * a character, a loadout and the mind the mean of theirs; a note it does not rate is kept.
 *
 * Beside the ratings, never in them, the **unseen** report: every mind on each character and each
 * loadout of the rest of the catalog it fits (`UNSEEN`), against one opponent (`UNSEEN_OPPONENT`)
 * on each side at each gap, its score read as how far the mind carries to a loadout it was not
 * built for. `--write` puts it in the ratings' file beside the table.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { CAP_SECONDS } from "../src/arena/duel.ts";
import { LOADOUTS, REPRESENTATIVE, loadoutKey } from "../src/core/items/held.ts";
import { MINDS } from "../src/core/mind/controllers.ts";
import { BODY_MODELS, modelHolds, modelSupportsMind } from "../src/core/models.ts";
import { BOUT_HARNESS } from "../research/bout.mjs";
import { defaultLanes, playBouts } from "../research/bout-pool.mjs";
import { bradleyTerry, ratingIntervals } from "../research/rating.mjs";
import { BUILD_IDENTITY } from "../src/build-identity.ts";
import { recordingIdentity, requireRecordingIdentity } from "../src/core/recording.ts";

/** How a pair meets: once on each side at each gap, m, to the Arena's time limit, with no limit on lying down. */
export const TOURNAMENT = Object.freeze({ level: "open", loadouts: REPRESENTATIVE, gaps: Object.freeze([4]), capSeconds: CAP_SECONDS, recoverySeconds: null });

/** Every loadout of the catalog no mind is rated on. */
export const UNSEEN = Object.freeze(LOADOUTS.filter((loadout) => !TOURNAMENT.loadouts.includes(loadout)));

/** Whom an unseen entrant meets, on its own character: the sword-and-buckler reference, the Duellist, with sword and buckler. */
export const UNSEEN_OPPONENT = Object.freeze({ mind: "duellist", loadout: REPRESENTATIVE.find((loadout) => loadoutKey(loadout) === "buckler,sword") });

const NOTES = "assets/minds/notes.json", RATINGS = "assets/minds/ratings.json";

/** A JSON text of `value` with every object's keys in order. */
const canonical = (value) => JSON.stringify(value, (_, v) => typeof v === "object" && v !== null && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : v);
const digest = (value) => createHash("sha256").update(canonical(value)).digest("hex").slice(0, 16);

/** Every cached row must belong to this build and tournament before any result is reused. */
export function readTournamentRows(text, identity) {
  return new Map(text.split("\n").filter(Boolean).map(line => {
    const row = JSON.parse(line);
    requireRecordingIdentity(row.identity, identity);
    if (typeof row.key !== "string" || row.level !== TOURNAMENT.level || !["left", "right", null].includes(row.winner)) throw new Error("invalid tournament result row or level");
    return [row.key, row];
  }));
}

/** Every entrant of `minds` (ids of `MINDS`): `{ id, mind, model, loadout }` for each character and loadout of `loadouts` it fits. */
export function tournamentEntrants(minds = Object.keys(MINDS), loadouts = TOURNAMENT.loadouts) {
  return minds.flatMap((mind) => BODY_MODELS.flatMap((model) => loadouts
    .filter((loadout) => (loadout.left === "empty" && loadout.right === "empty" || modelHolds(model)) && modelSupportsMind(model, MINDS[mind].config, loadout))
    .map((loadout) => ({ id: `${mind}/${model}/${loadoutKey(loadout)}`, mind, model, loadout }))));
}

/** Every bout of `entrants`: each pair once with each on the left, at each gap, the pair's indices `i` and `j` and the left's `a`. */
export function tournamentJobs(entrants) {
  const jobs = [];
  for (let i = 0; i < entrants.length; i++) for (let j = i + 1; j < entrants.length; j++) for (const gap of TOURNAMENT.gaps)
    for (const [left, right] of [[i, j], [j, i]]) {
      const l = entrants[left], r = entrants[right];
      const recipe = { level: TOURNAMENT.level, left: l.model, right: r.model, gap, loadouts: { left: l.loadout, right: r.loadout }, minds: { left: MINDS[l.mind].config, right: MINDS[r.mind].config },
        capSeconds: TOURNAMENT.capSeconds, recoverySeconds: TOURNAMENT.recoverySeconds };
      jobs.push({ i: left, j: right, key: `${l.id}|${r.id}|${gap}|${digest(recipe.minds)}`, recipe });
    }
  return jobs;
}

/**
 * Every bout of the unseen report: each of `entrants` against `UNSEEN_OPPONENT` on its own
 * character, where the opponent fits it, on each side at each gap. The entrant is `i`.
 */
export function unseenJobs(entrants) {
  const opponent = MINDS[UNSEEN_OPPONENT.mind].config, jobs = [];
  entrants.forEach((entrant, i) => {
    if (!modelSupportsMind(entrant.model, opponent, UNSEEN_OPPONENT.loadout)) return;
    const minds = { mind: MINDS[entrant.mind].config, opponent };
    for (const gap of TOURNAMENT.gaps) for (const left of [true, false]) {
      const recipe = { level: TOURNAMENT.level, left: entrant.model, right: entrant.model, gap,
        loadouts: left ? { left: entrant.loadout, right: UNSEEN_OPPONENT.loadout } : { left: UNSEEN_OPPONENT.loadout, right: entrant.loadout },
        minds: left ? { left: minds.mind, right: minds.opponent } : { left: minds.opponent, right: minds.mind },
        capSeconds: TOURNAMENT.capSeconds, recoverySeconds: TOURNAMENT.recoverySeconds };
      jobs.push({ i, left, key: `unseen|${entrant.id}|${UNSEEN_OPPONENT.mind}|${gap}|${left ? "left" : "right"}|${digest(recipe.minds)}`, recipe });
    }
  });
  return jobs;
}

/** Each unseen entrant's won, drawn and lost against the opponent over `rows` (`{ i, left, winner }`), in `entrants`' order. */
export function unseenTable(entrants, rows) {
  return entrants.flatMap((entrant, i) => {
    const mine = rows.filter((row) => row.i === i);
    if (mine.length === 0) return [];
    const won = mine.filter((row) => row.winner === (row.left ? "left" : "right")).length, drawn = mine.filter((row) => row.winner === null).length;
    return [{ mind: entrant.mind, model: entrant.model, loadout: entrant.loadout, against: UNSEEN_OPPONENT.mind, bouts: mine.length, wins: won, draws: drawn, losses: mine.length - won - drawn }];
  });
}

/** Each entrant's rating, interval and score over `rows` (`{ i, j, winner }`, `i` on the left), best first. */
export function tournamentTable(entrants, rows) {
  const games = rows.map(({ i, j, winner }) => ({ i, j, score: winner === "left" ? 1 : winner === "right" ? 0 : .5 }));
  const ratings = bradleyTerry(entrants.length, games), intervals = ratingIntervals(entrants.length, games);
  return entrants.map((entrant, k) => {
    let wins = 0, draws = 0, losses = 0;
    for (const { i, j, score } of games) {
      if (i !== k && j !== k) continue;
      const mine = i === k ? score : 1 - score;
      if (mine === 1) wins++; else if (mine === 0) losses++; else draws++;
    }
    return { mind: entrant.mind, model: entrant.model, loadout: entrant.loadout, rating: ratings[k], interval: intervals[k], bouts: wins + draws + losses, wins, draws, losses };
  }).sort((a, b) => b.rating - a.rating);
}

/** `notes` with each rating of `table` written as `"<rating> <date>"` at its leaf, and the means of the leaves above it. */
export function ratedNotes(notes, table, date) {
  const text = (ratings) => `${Math.round(ratings.reduce((t, x) => t + x, 0) / ratings.length)} ${date}`;
  const out = structuredClone(notes);
  for (const mind of [...new Set(table.map((row) => row.mind))]) {
    const rows = table.filter((row) => row.mind === mind), tree = out[mind] ??= {};
    tree.note = text(rows.map((row) => row.rating));
    for (const held of [...new Set(rows.map((row) => loadoutKey(row.loadout)))]) (tree.loadouts ??= {})[held] = text(rows.filter((row) => loadoutKey(row.loadout) === held).map((row) => row.rating));
    for (const model of [...new Set(rows.map((row) => row.model))]) {
      const body = (tree.bodies ??= {})[model] ??= {}, mine = rows.filter((row) => row.model === model);
      body.note = text(mine.map((row) => row.rating));
      for (const row of mine) (body.loadouts ??= {})[loadoutKey(row.loadout)] = text([row.rating]);
    }
  }
  return out;
}

async function main() {
  const { values } = parseArgs({ options: { workers: { type: "string" }, minds: { type: "string" }, write: { type: "boolean", default: false } } });
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
  const commit = git("rev-parse", "HEAD"), dirty = git("status", "--porcelain", "--", "src", "research", "scripts", "assets/core").length > 0;
  if (dirty && values.write) throw new Error("the code differs from its commit: commit it before writing a table the commit is to name");
  const entrants = tournamentEntrants(values.minds?.split(",")), unseen = tournamentEntrants(values.minds?.split(","), UNSEEN);
  const rated = tournamentJobs(entrants), others = unseenJobs(unseen), jobs = [...rated, ...others], protocol = digest({ ...TOURNAMENT, unseen: UNSEEN_OPPONENT });
  const identity = recordingIdentity(BUILD_IDENTITY, "arena-tournament/1", { harness: BOUT_HARNESS, protocol: TOURNAMENT, unseen: UNSEEN_OPPONENT });
  const store = `research/runs/tournament/${BUILD_IDENTITY.slice(7)}-${protocol}.jsonl`;
  mkdirSync(dirname(store), { recursive: true });
  const kept = readTournamentRows(existsSync(store) ? readFileSync(store, "utf8") : "", identity);
  const missing = jobs.filter((job) => !kept.has(job.key)), started = Date.now();
  console.log(`${BOUT_HARNESS}; level ${TOURNAMENT.level}; ${entrants.length} entrants and ${unseen.length} unseen, ${jobs.length} bouts, ${jobs.length - missing.length} kept in ${store}`);
  let done = 0;
  await playBouts(missing.map(({ recipe }) => ({ recipe })), Number(values.workers ?? defaultLanes()), (row, k) => {
    const { key } = missing[k], kept_ = { identity, level: row.recipe.level, key, winner: row.winner, ending: row.ending, seconds: row.seconds, blows: row.blows, bars: row.bars, digest: row.digest };
    appendFileSync(store, JSON.stringify(kept_) + "\n");
    kept.set(key, kept_);
    if (++done % 50 === 0 || done === missing.length) console.log(`${done} of ${missing.length} in ${((Date.now() - started) / 60000).toFixed(1)} min`);
  });
  const rows = rated.map((job) => ({ i: job.i, j: job.j, winner: kept.get(job.key).winner }));
  const table = tournamentTable(entrants, rows), date = new Date().toISOString().slice(0, 10);
  const carried = unseenTable(unseen, others.map((job) => ({ i: job.i, left: job.left, winner: kept.get(job.key).winner })));
  console.log(`\ncommit ${commit}${dirty ? " with changes" : ""}; build ${BUILD_IDENTITY}; protocol ${protocol}; ${date}\n`);
  console.log("| | Mind | Character | Hands (left,right) | Rating | 95 % | Bouts | Won | Drawn | Lost |\n|---|---|---|---|---|---|---|---|---|---|");
  table.forEach((row, k) => console.log(`| ${k + 1} | ${row.mind} | ${row.model} | ${loadoutKey(row.loadout)} | ${row.rating.toFixed(0)} | ${row.interval.map((x) => x.toFixed(0)).join("-")} | ${row.bouts} | ${row.wins} | ${row.draws} | ${row.losses} |`));
  console.log(`
Unseen loadouts, against ${UNSEEN_OPPONENT.mind} with ${loadoutKey(UNSEEN_OPPONENT.loadout)}:

| Mind | Character | Hands (left,right) | Bouts | Won | Drawn | Lost |
|---|---|---|---|---|---|---|`);
  for (const row of carried) console.log(`| ${row.mind} | ${row.model} | ${loadoutKey(row.loadout)} | ${row.bouts} | ${row.wins} | ${row.draws} | ${row.losses} |`);
  if (!values.write) return;
  const rounded = table.map((row) => ({ ...row, rating: Math.round(row.rating), interval: row.interval.map(Math.round) }));
  writeFileSync(RATINGS, JSON.stringify({ identity, level: TOURNAMENT.level, date, commit, harness: BOUT_HARNESS, protocol: `${protocol} ${canonical(TOURNAMENT)}`, entrants: rounded, unseen: carried }, null, 2) + "\n");
  writeFileSync(NOTES, JSON.stringify(ratedNotes(JSON.parse(readFileSync(NOTES, "utf8")), rounded, date), null, 2) + "\n");
  console.log(`\nwrote ${RATINGS} and ${NOTES}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
