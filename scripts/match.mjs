/**
 * **The standard match**: two minds over one fixed set of arena bouts, each mind on each side, so
 * that a result read on one machine is the same result on another. Bouts are the same to the bit
 * on every machine (`docs/reference/real-functions.md`), so two runs of one commit and two minds
 * give one digest; a claim that one mind beats another names that digest.
 *
 *   npm run match -- <mind> <mind> [--workers N] [--json <file>]
 *
 * A mind is one a person may pick, by its id (`MINDS`: a preset's, or a kind's with no preset), a
 * JSON file holding a mind's config, or that JSON itself. Each plays the protocol's bodies, loadouts and
 * gaps (`MATCH`) on the left against the other on the right, then the other way round: a mind that
 * wins only from one side shows it. It prints the harness, the commit, each mind's digest, every
 * bout and the score by the conditions it varies; `--json` writes all of it.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { CAP_SECONDS } from "../src/arena/duel.ts";
import { CONTROLLERS, MINDS } from "../src/core/mind/controllers.ts";
import { modelHolding } from "../src/core/models.ts";
import { mindFaults } from "../src/ui/mind-link.ts";
import { BOUT_HARNESS } from "../research/bout.mjs";
import { defaultLanes, playBouts } from "../research/bout-pool.mjs";

/**
 * What a match plays: each body a mind may have against each the other may have, each loadout and
 * each starting gap, by the arena's rules as its page plays them (no limit on time down, its cap).
 * A change here is a new protocol: its digest changes, and no result read under the old is compared.
 */
export const MATCH = Object.freeze({
  bodies: Object.freeze(["workshop-fighter", "workshop-rogue"]),
  held: Object.freeze(["empty", "club"]),
  gaps: Object.freeze([3, 4, 5]),
  capSeconds: CAP_SECONDS,
  recoverySeconds: null,
});

/** A JSON text of `value` with every object's keys in order: two values that say the same are one text. */
const canonical = (value) => JSON.stringify(value, (_, v) => typeof v === "object" && v !== null && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : v);
const digest = (value) => createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex").slice(0, 16);

/**
 * The mind `text` names: a mind's id (`MINDS`), a controller's kind (its defaults), a JSON file or
 * JSON. Refused, with its faults, where it is no mind or does not fit every body and loadout the
 * protocol gives it (`mindFaults`).
 */
export function readMatchMind(text) {
  const named = Object.hasOwn(MINDS, text) ? { label: MINDS[text].label, config: MINDS[text].config }
    : Object.hasOwn(CONTROLLERS, text) ? { label: CONTROLLERS[text].label, config: CONTROLLERS[text].defaults }
    : { label: text, config: JSON.parse(existsSync(text) ? readFileSync(text, "utf8") : text) };
  if (typeof named.config?.kind !== "string" || !Object.hasOwn(CONTROLLERS, named.config.kind)) throw new Error(`${text} is no mind: name a mind (${Object.keys(MINDS).join(", ")}), a kind (${Object.keys(CONTROLLERS).join(", ")}), or a config`);
  for (const body of MATCH.bodies) for (const held of MATCH.held) {
    const faults = mindFaults(named.config, modelHolding(body, held));
    if (faults.length > 0) throw new Error(`${text} on ${body} holding ${held}: ${faults.join("; ")}`);
  }
  return { ...named, digest: digest(named.config) };
}

/** Every bout of `a` against `b` (`readMatchMind`'s): each condition of `MATCH` with `a` on the left, then with `b` there. */
export function matchJobs(a, b) {
  const jobs = [];
  for (const [first, second] of [[a, b], [b, a]]) for (const left of MATCH.bodies) for (const right of MATCH.bodies)
    for (const held of MATCH.held) for (const gap of MATCH.gaps) jobs.push({
      recipe: { left, right, gap, held: { left: held, right: held }, minds: { left: first.config, right: second.config },
        capSeconds: MATCH.capSeconds, recoverySeconds: MATCH.recoverySeconds },
      a: first === a ? "left" : "right",
    });
  return jobs;
}

/**
 * `a`'s score over `rows` (each a bout's `playBout` row with its job's `a`, the side `a` played): a
 * win 1, a draw a half, and its bouts, wins, draws and losses; overall, and by each condition the
 * protocol varies.
 */
export function matchScore(rows) {
  const tally = (of) => {
    const t = { bouts: of.length, wins: 0, draws: 0, losses: 0 };
    for (const row of of) row.winner === null ? t.draws++ : row.winner === row.a ? t.wins++ : t.losses++;
    return { ...t, score: t.bouts ? (t.wins + t.draws / 2) / t.bouts : null };
  };
  const by = (key) => Object.fromEntries([...new Set(rows.map(key))].map((k) => [k, tally(rows.filter((row) => key(row) === k))]));
  const other = (side) => side === "left" ? "right" : "left";
  return {
    all: tally(rows),
    side: by((row) => row.a),
    bodies: by((row) => `${row.recipe[row.a]} v ${row.recipe[other(row.a)]}`),
    held: by((row) => row.recipe.held.left),
    gap: by((row) => String(row.recipe.gap)),
    ending: by((row) => row.winner === null ? "draw" : `${row.winner === row.a ? "won" : "lost"} by ${row.ending}`),
  };
}

/** The commit the match ran at, and whether the working tree differed from it. */
function commit() {
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
  try { return { commit: git("rev-parse", "HEAD"), dirty: git("status", "--porcelain").length > 0 }; }
  catch { return { commit: null, dirty: null }; }
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { workers: { type: "string" }, json: { type: "string" } } });
  if (positionals.length !== 2) throw new Error("name two minds: npm run match -- <mind> <mind>");
  const [a, b] = positionals.map(readMatchMind), jobs = matchJobs(a, b);
  const started = Date.now();
  const played = await playBouts(jobs.map(({ recipe }) => ({ recipe })), Number(values.workers ?? defaultLanes()));
  const rows = played.map((row, i) => ({ ...row, a: jobs[i].a }));
  const record = {
    harness: BOUT_HARNESS, ...commit(), protocol: MATCH, protocolDigest: digest(MATCH),
    minds: { a: { label: a.label, digest: a.digest, config: a.config }, b: { label: b.label, digest: b.digest, config: b.config } },
    digest: digest(rows.map((row) => row.digest).join()),
    score: matchScore(rows),
    bouts: rows.map(({ recipe, a: side, winner, ending, seconds, blows, bars, digest: trace }) =>
      ({ left: recipe.left, right: recipe.right, held: recipe.held.left, gap: recipe.gap, a: side, winner, ending, seconds, blows, bars, digest: trace })),
  };
  console.log(`${BOUT_HARNESS}; ${rows.length} bouts in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  console.log(`commit ${record.commit ?? "unknown"}${record.dirty ? " with changes" : ""}; protocol ${record.protocolDigest}; match ${record.digest}`);
  console.log(`a: ${a.label} (${a.digest}); b: ${b.label} (${b.digest})`);
  console.log("\n| a's body | b's body | Held | Gap, m | a's side | Winner | Ending | Seconds | Blows | a's bar | b's bar |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const row of record.bouts) {
    const bSide = row.a === "left" ? "right" : "left", bars = { left: row.bars[0], right: row.bars[1] };
    console.log(`| ${row[row.a]} | ${row[bSide]} | ${row.held} | ${row.gap} | ${row.a} | ${row.winner === null ? "draw" : row.winner === row.a ? "a" : "b"} | ${row.ending} | ${row.seconds.toFixed(1)} | ${row.blows} | ${bars[row.a].toFixed(2)} | ${bars[bSide].toFixed(2)} |`);
  }
  console.log("\na's score (a win 1, a draw a half), by what the protocol varies:\n\n| Over | Bouts | Won | Drawn | Lost | Score |\n|---|---|---|---|---|---|");
  for (const [over, table] of Object.entries(record.score)) for (const [key, t] of Object.entries(over === "all" ? { all: table } : table))
    console.log(`| ${over === "all" ? "all" : `${over}: ${key}`} | ${t.bouts} | ${t.wins} | ${t.draws} | ${t.losses} | ${t.score.toFixed(3)} |`);
  if (values.json) writeFileSync(values.json, JSON.stringify(record, null, 2) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
