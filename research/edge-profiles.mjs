/**
 * **The edges' profiles** (`docs/reference/rising.md#routes-priced`): from the Rise drill's records,
 * both rungs, each body's profile of each edge it was begun on: how many trials began it, how many
 * it took to its posture, the mean seconds a trial ran, done or not, and the positions those not
 * done came to rest in. Stand up prices its routes by them
 * (`src/core/mind/ground/profiles.ts`, `assets/core/edge-profiles.json`).
 *
 *   node research/edge-profiles.mjs [<record.jsonl or run.json> ...] [--write]
 *
 * With none named, the latest record of each rung in `assets/evaluations/rise/`; a run's `--json`
 * file reads as a record.
 */
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const DIR = "assets/evaluations/rise", OUT = new URL("../assets/core/edge-profiles.json", import.meta.url);
const write = process.argv.includes("--write");
const named = process.argv.slice(2).filter((arg) => arg !== "--write");

/** A record's header and lines: a kept record (`.jsonl`), or a run's `--json` file. */
const read = (path) => {
  const text = readFileSync(path, "utf8");
  if (!path.endsWith(".json")) return text.split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line));
  const { header, cases } = JSON.parse(text);
  return [header, ...cases];
};
/** The latest record of each rung: by the time of the commit it was played at. */
function latest() {
  const records = readdirSync(DIR).filter((name) => name.endsWith(".jsonl")).map((name) => {
    const header = read(`${DIR}/${name}`)[0];
    return { path: `${DIR}/${name}`, header, time: Number(execSync(`git log -1 --format=%ct ${header.commit}`).toString().trim()) };
  });
  const byRung = new Map();
  for (const one of records.sort((a, b) => a.time - b.time)) byRung.set(one.header.protocol, one.path);
  return [...byRung.values()];
}

const paths = named.length ? named : latest();
const profiles = {};
for (const path of paths) {
  const [header, ...lines] = read(path);
  if (header.evaluation !== "rise") throw new Error(`${path} is no record of the Rise drill`);
  for (const line of lines) {
    if (line.fault || !line.reading) continue;
    const link = line.reading.links[line.reading.links.length - 1];
    if (!link.entry) continue;
    const model = line.condition.model, mine = (profiles[model] ??= {}), profile = (mine[link.technique] ??= { begun: 0, done: 0, seconds: 0, fails: {} });
    profile.begun++; profile.seconds += link.seconds;
    if (link.end === "done") profile.done++;
    else profile.fails[link.position] = (profile.fails[link.position] ?? 0) + 1;
  }
}
for (const mine of Object.values(profiles)) for (const profile of Object.values(mine)) profile.seconds = Number((profile.seconds / profile.begun).toFixed(3));

const out = { source: { script: "research/edge-profiles.mjs", records: paths }, profiles };
for (const [model, mine] of Object.entries(profiles)) for (const [technique, p] of Object.entries(mine))
  console.log(`${model} ${technique}: done ${p.done} of ${p.begun}, ${p.seconds} s a trial, failures ending ${JSON.stringify(p.fails)}`);
if (write) writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
