/**
 * **The table**: every cell of Option Mind on every body (`tableCells`,
 * `src/evaluation/table/cells.ts`), body by loadout by skill, judged from the drills' records:
 * stand-up and the run met or short (`verdictOf`), every other cell each reading's score
 * (`scoreOf`) now, at its baseline (`baselineOf`) and at its best version, with the person's
 * figure beside a strike's (`personOf`), each with its drill link.
 *
 *   npm run evaluate -- table [--body <model>] [--skill <name>] [--loadout <left,right>] [--play] [--baseline] [--workers N] [--json <file>]
 *
 * A reading now is found in the newest record of its drill and protocol that holds its subject, by
 * id or by the same config; its best, in whichever such record scores it highest on the cell.
 * `--play` plays each reading whose subject has no record at its version now (`npm run evaluate --
 * <drill> <subject> --protocol <p> --write`), which plays only the cases no kept row has, so a cell
 * a change did not touch costs nothing. `--baseline` keeps each scored reading now as its cell's
 * baseline (`assets/evaluations/<drill>/baselines.json`), where the cell has none: a baseline is
 * never overwritten.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { recordingKey } from "../src/core/world/recording.ts";
import { loadoutKey } from "../src/core/bodies/items/held.ts";
import { CONTROLLERS } from "../src/app/catalog.ts";
import { partNames } from "../src/app/node/evaluation.ts";
import { EVALUATIONS } from "../src/app/node/evaluation.ts";
import { readRecord, recordedSubject } from "../src/evaluation/record.ts";
import { TABLE_BODIES, TABLE_LOADOUTS } from "../src/evaluation/table/cells.ts";
import { TABLE_SKILLS, tableCells } from "../src/app/node/evaluation.ts";
import { baselineOf, personOf, rowsOn, scoreOf, verdictOf } from "../src/evaluation/table/judge.ts";
import { caseCoder, fileTable } from "./build-identity.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Every record of evaluation `id`, oldest first by name. */
function recordsOf(id) {
  const dir = join(ROOT, "assets/evaluations", id);
  return existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".jsonl")).sort()
    .map((name) => ({ name, ...readRecord(readFileSync(join(dir, name), "utf8"), name) })) : [];
}

/** Where evaluation `id`'s baselines are kept. */
const baselinesPath = (id) => join(ROOT, "assets/evaluations", id, "baselines.json");

/** Evaluation `id`'s baselines (`Baseline`); none where it keeps none. */
const baselinesOf = (id) => existsSync(baselinesPath(id)) ? JSON.parse(readFileSync(baselinesPath(id), "utf8")) : [];

/** A Ratings link to `subject`'s `version` on `drill`. */
const linkOf = (drill, subject, version) => `?play=ratings&evaluation=${drill}&subject=${encodeURIComponent(subject)}&version=${version}`;

/** The rows of `held`, a subject as `record`'s header holds it. */
const rowsOf = (record, held) => record.lines.filter((line) => line.subjects[0] === held.id);

/**
 * Each reading's evidence, by `drill protocol subject`: the subject now and its version; every
 * record of its protocol holding it (by id, or by the same config) with the subject as held there;
 * and the newest of them, one at its version now before any other, with its rows and the version
 * it read.
 */
function evidenceOf(readings, records) {
  const evidence = new Map(), coders = new Map(), table = fileTable();
  for (const reading of readings) {
    const key = `${reading.drill} ${reading.protocol} ${reading.subject}`;
    if (evidence.has(key)) continue;
    const evaluation = EVALUATIONS[reading.drill], cases = evaluation.protocols[reading.protocol];
    if (!coders.has(reading.drill)) coders.set(reading.drill, caseCoder(table, `src/evaluation/${reading.drill}/cases.ts`, Object.keys(CONTROLLERS)));
    if (!records.has(reading.drill)) records.set(reading.drill, recordsOf(reading.drill));
    const coder = coders.get(reading.drill);
    let subject = null, now = null, fault = null;
    try {
      subject = evaluation.subjects([reading.subject])[0];
      now = recordedSubject(subject, cases.play, coder.environment.digest, null, (parts) => coder.code(partNames(parts)).own).version.version;
    } catch (error) { fault = error instanceof Error ? error.message : String(error); }
    const wanted = subject ? recordingKey(subject.value) : null, holding = [];
    let found = null;
    for (const record of records.get(reading.drill)) {
      if (record.header.protocol !== reading.protocol) continue;
      const held = record.header.subjects.find((one) => one.id === reading.subject) ?? (wanted && record.header.subjects.find((one) => recordingKey(one.value) === wanted));
      if (!held) continue;
      holding.push({ record, held });
      // A record at the subject's version now wins over a later one at another: names sort a day's records by commit, not by time.
      if (!(found && found.held.version.version === now && held.version.version !== now)) found = { record, held };
    }
    evidence.set(key, { reading, now, fault, holding, rows: found ? rowsOf(found.record, found.held) : [],
      read: found && { file: found.record.name, commit: found.record.header.commit.slice(0, 8), date: found.record.header.date, id: found.held.id, version: found.held.version.version,
        current: found.held.version.version === now } });
  }
  return evidence;
}

const MARK = { met: "met", short: "short", unread: "not read", above: "above", at: "at", below: "below", unbased: "no baseline" };

/** A score in words. */
const scoreText = (score) => `${Number(score.value.toFixed(3))} ${score.unit}`;

/** Where a reading was read: its record's commit and date, whether at the version now, and its link. */
const readText = (drill, read) => `${read.commit} ${read.date}${read.current ? ", current" : ", not the version now"}: ${linkOf(drill, read.id, read.version)}`;

/** A met-or-short cell over its readings: unread, short or met; and its lines. */
function metCell(cell, evidence) {
  let state = "met";
  const lines = cell.readings.map((reading) => {
    const found = evidence.get(`${reading.drill} ${reading.protocol} ${reading.subject}`), verdict = verdictOf(reading.judge, rowsOn(cell, reading, found.rows));
    if (verdict.state === "unread") state = "unread";
    else if (state === "met" && verdict.state === "short") state = "short";
    return `  ${reading.drill}/${reading.protocol} ${reading.subject}: ${verdict.state}, ${verdict.figures} (${found.read ? readText(reading.drill, found.read) : "no record"})${found.fault ? `; ${found.fault}` : ""}`;
  });
  return { state, lines };
}

/**
 * A scored cell over its readings, each now, at its baseline and at its best: not read where one
 * has no rows now, no baseline where one has none, else below where one scores under its baseline,
 * above where one scores over it, at where every one scores its baseline; and its lines.
 */
function bestCell(cell, evidence, records, baselines) {
  const states = [];
  const lines = cell.readings.map((reading) => {
    const found = evidence.get(`${reading.drill} ${reading.protocol} ${reading.subject}`), now = scoreOf(reading, rowsOn(cell, reading, found.rows));
    const base = baselineOf(baselines(reading.drill), cell, reading), based = base && records.get(reading.drill).find((record) => record.name === base.record);
    const then = based ? scoreOf(reading, rowsOn(cell, reading, rowsOf(based, { id: base.id }))) : null;
    let best = null;
    for (const { record, held } of found.holding) {
      const score = scoreOf(reading, rowsOn(cell, reading, rowsOf(record, held)));
      if (score && (!best || score.value >= best.score.value)) best = { score, id: held.id, version: held.version.version };
    }
    states.push(!now ? "unread" : !then ? "unbased" : now.value < then.value ? "below" : now.value > then.value ? "above" : "at");
    const person = "hit" in reading ? `; the person's ${personOf(reading.hit)}` : "";
    return [`  ${reading.drill}/${reading.protocol} ${reading.subject}: ${now ? `${scoreText(now)}, ${now.figures} (${readText(reading.drill, found.read)})` : "no rows"}${found.fault ? `; ${found.fault}` : ""}`,
      `    baseline ${base ? then ? `${scoreText(then)} (${linkOf(reading.drill, base.id, base.version)})` : `${base.record} not found` : "none"}`
        + `; best ${best ? `${scoreText(best.score)} (${linkOf(reading.drill, best.id, best.version)})` : "none"}${person}`].join("\n");
  });
  const state = ["unread", "unbased", "below", "above"].find((one) => states.includes(one)) ?? "at";
  return { state, lines };
}

/** Keep each scored reading now of `cells` as its cell's baseline where it has none; name those kept already and those with no record. */
function keepBaselines(cells, evidence) {
  const added = new Map();
  for (const cell of cells) {
    if (cell.kind !== "best") continue;
    for (const reading of cell.readings) {
      const found = evidence.get(`${reading.drill} ${reading.protocol} ${reading.subject}`), kept = [...baselinesOf(reading.drill), ...(added.get(reading.drill) ?? [])];
      const named = `${cell.body} ${loadoutKey(cell.loadout)} ${reading.drill}/${reading.protocol} ${reading.subject}`;
      if (baselineOf(kept, cell, reading)) { console.log(`${named}: has a baseline, kept`); continue; }
      if (!found.read || rowsOn(cell, reading, found.rows).length === 0) { console.log(`${named}: no rows to keep`); continue; }
      added.set(reading.drill, [...(added.get(reading.drill) ?? []), { body: cell.body, loadout: loadoutKey(cell.loadout), protocol: reading.protocol, subject: reading.subject,
        record: found.read.file, id: found.read.id, version: found.read.version }]);
      console.log(`${named}: baseline ${found.read.file}`);
    }
  }
  for (const [drill, entries] of added) writeFileSync(baselinesPath(drill), `${JSON.stringify([...baselinesOf(drill), ...entries], null, 2)}\n`);
}

/** Print the table for the command line's options, playing first with `--play`, keeping baselines with `--baseline`. */
export function main() {
  const { values } = parseArgs({ allowPositionals: true, options: {
    body: { type: "string" }, skill: { type: "string" }, loadout: { type: "string" }, play: { type: "boolean" }, baseline: { type: "boolean" }, workers: { type: "string" }, json: { type: "string" } } });
  const cells = tableCells().filter((cell) => (!values.body || cell.body === values.body) && (!values.skill || cell.skill === values.skill)
    && (!values.loadout || loadoutKey(cell.loadout) === values.loadout));
  const readings = cells.flatMap((cell) => cell.readings);
  let records = new Map(), evidence = evidenceOf(readings, records);
  if (values.play) {
    for (const { reading, read, fault } of evidence.values()) {
      if (fault || read?.current) continue;
      console.log(`playing ${reading.drill} ${reading.protocol} ${reading.subject}`);
      execFileSync(process.execPath, [join(ROOT, "scripts/evaluate.mjs"), reading.drill, reading.subject, "--protocol", reading.protocol, "--write", ...(values.workers ? ["--workers", values.workers] : [])], { cwd: ROOT, stdio: "inherit" });
    }
    records = new Map();
    evidence = evidenceOf(readings, records);
  }
  if (values.baseline) keepBaselines(cells, evidence);
  const baselines = new Map(), baselinesFor = (drill) => baselines.get(drill) ?? baselines.set(drill, baselinesOf(drill)).get(drill);
  const judged = cells.map((cell) => ({ cell, ...cell.kind === "met" ? metCell(cell, evidence) : bestCell(cell, evidence, records, baselinesFor) }));
  const skills = TABLE_SKILLS.map((skill) => skill.name).filter((name) => judged.some(({ cell }) => cell.skill === name));
  console.log(`| Body | Loadout | ${skills.join(" | ")} |`);
  console.log(`|---|---|${skills.map(() => "---").join("|")}|`);
  for (const body of TABLE_BODIES) for (const loadout of TABLE_LOADOUTS) {
    const row = judged.filter(({ cell }) => cell.body === body && loadoutKey(cell.loadout) === loadoutKey(loadout));
    if (row.length === 0) continue;
    console.log(`| ${body} | ${loadoutKey(loadout)} | ${skills.map((skill) => MARK[row.find(({ cell }) => cell.skill === skill)?.state] ?? "-").join(" | ")} |`);
  }
  console.log("");
  for (const { cell, state, lines } of judged) console.log(`${cell.body} ${loadoutKey(cell.loadout)} ${cell.skill}: ${MARK[state]} (${cell.kind === "met" ? "bar" : "score"}: ${cell.bar})\n${lines.join("\n")}`);
  const counts = Object.entries(MARK).map(([state, mark]) => [mark, judged.filter((one) => one.state === state).length]).filter(([, n]) => n > 0);
  console.log(`\n${judged.length} cells: ${counts.map(([mark, n]) => `${n} ${mark}`).join(", ")}`);
  if (values.json) writeFileSync(values.json, JSON.stringify(judged.map(({ cell, state, lines }) => ({ body: cell.body, loadout: cell.loadout, skill: cell.skill, kind: cell.kind, state, lines })), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
