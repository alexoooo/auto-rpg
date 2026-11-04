/**
 * **The edges' profiles**: from the Rise drill's records,
 * both rungs, each body's profile of each edge it was begun on, in the profiles' one type
 * (`src/core/skills/framework/profile.ts`, `assets/core/edge-profiles.json`): no foe, its trials those
 * that began the edge, each begun at no range, clear, its velocity not recorded (`Start.velocity`);
 * whether it took the body to its posture, the seconds it ran, done or not, and, not done, that it
 * ended down and the position it came to rest in (`Trial.end`). Each names what it was
 * measured on: the body as the drill builds it (`techniqueSpec`), the technique's config, the
 * harness's rate, and no reaction time (an edge reads no other body). Stand up prices its routes by
 * them (`src/core/recovery/ground/stand-up.ts`).
 *
 *   node research/edge-profiles.mjs [<record.jsonl or run.json> ...] [--write]
 *
 * With none named, the latest record of each rung in `assets/evaluations/rise/`; a run's `--json`
 * file reads as a record.
 */
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { measuredOn, techniqueDigest } from "../src/core/skills/framework/profile.ts";
import { techniqueSpec } from "../src/evaluation/technique.ts";
import { harnessRule } from "../src/evaluation/record.ts";

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
  const rule = harnessRule(header.harness);
  if (!rule) throw new Error(`${path}: no rate in its harness, ${header.harness}`);
  const { hz, delay } = rule;
  for (const line of lines) {
    if (line.fault || !line.reading) continue;
    const link = line.reading.links[line.reading.links.length - 1];
    if (!link.entry) continue;
    const measured = measuredOn(techniqueSpec(line.world.technique), techniqueDigest({ kind: link.technique }), hz, null, hz, delay), key = JSON.stringify(measured);
    const profile = profiles.get(key) ?? { measured, label: `${line.condition.model} ${link.technique}`, trials: [] };
    profiles.set(key, profile);
    const done = link.end === "done";
    profile.trials.push({ start: { range: 0, phase: "clear" }, done, dealt: 0, taken: 0, seconds: round(link.seconds), recovers: null, down: !done, ...(done ? {} : { end: link.position }) });
  }
}

const out = { source: { script: "research/edge-profiles.mjs", records: paths }, profiles: [...profiles.values()].map((p) => ({ measured: p.measured, target: null, trials: p.trials })) };
for (const p of profiles.values()) {
  const done = p.trials.filter((t) => t.done).length, fails = {};
  for (const t of p.trials) if (t.end) fails[t.end] = (fails[t.end] ?? 0) + 1;
  console.log(`${p.label}: done ${done} of ${p.trials.length}, ${round(p.trials.reduce((s, t) => s + t.seconds, 0) / p.trials.length)} s a trial, failures ending ${JSON.stringify(fails)}`);
}
if (write) writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
