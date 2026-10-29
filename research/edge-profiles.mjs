/**
 * **The edges' profiles** (`docs/reference/rising.md#routes-priced`): from the Rise drill's records,
 * both rungs, each body's profile of each edge it was begun on, in the profiles' one type
 * (`src/core/mind/profile.ts`, `assets/core/edge-profiles.json`): one cell, no foe, its trials those
 * that began the edge; the share it took the body to its posture, the mean seconds a trial ran, done
 * or not, the share not done (down), and the positions those came to rest in. Each names what it was
 * measured on: the body as the drill builds it (`techniqueSpec`), the technique's config, the
 * harness's rate, and no reaction time (an edge reads no other body). Stand up prices its routes by
 * them (`src/core/mind/ground/stand-up.ts`).
 *
 *   node research/edge-profiles.mjs [<record.jsonl or run.json> ...] [--write]
 *
 * With none named, the latest record of each rung in `assets/evaluations/rise/`; a run's `--json`
 * file reads as a record.
 */
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { measuredOn, techniqueDigest } from "../src/core/mind/profile.ts";
import { techniqueSpec } from "../src/evaluation/technique.ts";

const DIR = "assets/evaluations/rise", OUT = new URL("../assets/core/edge-profiles.json", import.meta.url);
const write = process.argv.includes("--write");
const named = process.argv.slice(2).filter((arg) => arg !== "--write");
/** A mean of seconds as the profiles keep it: to the millisecond. */
const round = (x) => Number(x.toFixed(3));

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
const profiles = new Map();
for (const path of paths) {
  const [header, ...lines] = read(path);
  if (header.evaluation !== "rise") throw new Error(`${path} is no record of the Rise drill`);
  const hz = Number(/(\d+) Hz/.exec(header.harness)?.[1]);
  if (!Number.isFinite(hz)) throw new Error(`${path}: no rate in its harness, ${header.harness}`);
  for (const line of lines) {
    if (line.fault || !line.reading) continue;
    const link = line.reading.links[line.reading.links.length - 1];
    if (!link.entry) continue;
    const measured = measuredOn(techniqueSpec(line.world.technique), techniqueDigest({ kind: link.technique }), hz, null), key = JSON.stringify(measured);
    const profile = profiles.get(key) ?? { measured, label: `${line.condition.model} ${link.technique}`, begun: 0, done: 0, seconds: 0, fails: {} };
    profiles.set(key, profile);
    profile.begun++; profile.seconds += link.seconds;
    if (link.end === "done") profile.done++;
    else profile.fails[link.position] = (profile.fails[link.position] ?? 0) + 1;
  }
}

const out = { source: { script: "research/edge-profiles.mjs", records: paths }, profiles: [...profiles.values()].map((p) => ({ measured: p.measured, target: null,
  cells: [{ range: 0, phase: "clear", trials: p.begun, done: p.done / p.begun, dealt: 0, taken: 0, seconds: round(p.seconds / p.begun),
    down: 1 - p.done / p.begun, ends: Object.entries(p.fails).map(([at, count]) => ({ at, share: count / p.begun })) }] })) };
for (const p of profiles.values())
  console.log(`${p.label}: done ${p.done} of ${p.begun}, ${round(p.seconds / p.begun)} s a trial, failures ending ${JSON.stringify(p.fails)}`);
if (write) writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
