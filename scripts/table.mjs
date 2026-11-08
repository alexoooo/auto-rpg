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
 * A reading recorded at an earlier version is judged on its own rows, matched to the protocol's
 * cases by condition, and shown with its record's commit and date.
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
import { DEFAULT_ENGINE } from "../src/core/physics/engines.ts";
import { isRefused } from "../src/core/refusal.ts";
import { casesOf } from "../src/evaluation/run.ts";
import { CONTROLLERS } from "../src/app/catalog.ts";
import { caseNames, partNames } from "../src/app/node/evaluation.ts";
import { EVALUATIONS } from "../src/app/node/evaluation.ts";
import { indexRows, readRecord, recordedSubject } from "../src/evaluation/record.ts";
import { TABLE_BODIES, TABLE_LOADOUTS } from "../src/evaluation/table/cells.ts";
import { TABLE_SKILLS, tableCells } from "../src/app/node/evaluation.ts";
import { baselineOf, personOf, rowsOn, scoreOf, verdictOf } from "../src/evaluation/table/judge.ts";
import { caseCoder, fileTable } from "./build-identity.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Every record of evaluation `id`, oldest first by name. */
function recordsOf(id) {
  const dir = join(ROOT, "assets/evaluations", id);
  const records = existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".jsonl")).sort()
    .map((name) => ({ name, ...readRecord(readFileSync(join(dir, name), "utf8"), name) })) : [];
  indexRows(records.map(record => ({ name: record.name, rows: record.lines })));
  return records;
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
    let subject = null, now = null, fault = null, required = [];
    try {
      subject = evaluation.subjects([reading.subject])[0];
      now = recordedSubject(subject, cases.play, coder.environment.digest, null, (parts) => coder.code(partNames(parts)).own).version.version;
      const scheduled = casesOf(evaluation, reading.protocol, [subject], { engine: cases.engine ?? DEFAULT_ENGINE,
        code: world => coder.code(caseNames(world)).digest, schedule: { kind: "all" } });
      if (isRefused(scheduled)) throw new Error(scheduled.refused);
      required = scheduled.units.flat();
    } catch (error) { fault = error instanceof Error ? error.message : String(error); }
    const wanted = subject ? recordingKey({ value: subject.value, models: subject.models ?? null, character: subject.character ?? null }) : null, holding = [];
    let found = null;
    for (const record of records.get(reading.drill)) {
      if (record.header.protocol !== reading.protocol) continue;
      const held = record.header.subjects.find((one) => one.id === reading.subject) ?? (wanted && record.header.subjects.find((one) => one.models !== undefined && one.character !== undefined && recordingKey({ value: one.value, models: one.models, character: one.character }) === wanted));
      if (!held) continue;
      holding.push({ record, held });
      // A record at the subject's version now wins over a later one at another: names sort a day's records by commit, not by time.
      if (!(found && found.held.version.version === now && held.version.version !== now)) found = { record, held };
    }
    const groups = new Map();
    for (const one of holding) {
      const group = `${one.held.version.version} ${recordingKey(one.record.header.pool)}`;
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(one);
    }
    const versions = [...groups.values()].map(group => ({ ...group.at(-1), files: group.map(one => one.record.name),
      rows: [...indexRows(group.map(({ record, held }) => ({ name: record.name, rows: rowsOf(record, held) }))).values()].map(({ row }) => row) }));
    const selected = found && versions.find(one => one.held.version.version === found.held.version.version
      && recordingKey(one.record.header.pool) === recordingKey(found.record.header.pool));
    const rows = selected?.rows ?? [];
    // A reading at an earlier version stands as of its record: its rows answer the protocol's cases by condition, since their keys name the code they were played on.
    if (found && found.held.version.version !== now) {
      const byCondition = new Map(rows.map(row => [recordingKey(row.condition), row.key]));
      required = required.map(one => ({ ...one, key: byCondition.get(recordingKey(one.condition)) ?? one.key }));
    }
    const keys = new Set(rows.map(row => row.key));
    evidence.set(key, { reading, now, fault, versions, rows, required,
      read: found && { file: found.record.name, files: selected.files, commit: found.record.header.commit.slice(0, 8), date: found.record.header.date, id: found.held.id, version: found.held.version.version,
        current: found.held.version.version === now, complete: required.length > 0 && required.every(one => keys.has(one.key)) } });
  }
  return evidence;
}

const MARK = { met: "met", short: "short", unread: "not read", above: "above", at: "at", below: "below", unbased: "no baseline" };

/** A score in words. */
const scoreText = (score) => score.value === null ? "unavailable" : `${Number(score.value.toFixed(3))} ${score.unit}`;

/** Where a reading was read: its record's commit and date, whether at the version now, and its link. */
const readText = (drill, read) => `${read.commit} ${read.date}${read.current ? ", current" : ", not the version now"}: ${linkOf(drill, read.id, read.version)}`;

/** A met-or-short cell over its readings: unread, short or met; and its lines. */
function metCell(cell, evidence) {
  let state = "met";
  const lines = cell.readings.map((reading) => {
    const found = evidence.get(`${reading.drill} ${reading.protocol} ${reading.subject}`), verdict = verdictOf(reading.judge, rowsOn(cell, reading, found.rows), rowsOn(cell, reading, found.required));
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
    const base = baselineOf(baselines(reading.drill), cell, reading);
    const based = base ? (base.records ?? [base.record]).map(name => records.get(reading.drill).find(record => record.name === name)) : [];
    const baselineRows = based.length && based.every(Boolean) ? [...indexRows(based.map(record => ({ name: record.name, rows: rowsOf(record, { id: base.id }) }))).values()].map(({ row }) => row) : [];
    const then = scoreOf(reading, rowsOn(cell, reading, baselineRows));
    let best = null;
    for (const { rows, held } of found.versions) {
      const score = scoreOf(reading, rowsOn(cell, reading, rows));
      if (score?.value != null && (!best || score.value >= best.score.value)) best = { score, id: held.id, version: held.version.version };
    }
    states.push(now?.value == null ? "unread" : then?.value == null ? "unbased" : now.value < then.value ? "below" : now.value > then.value ? "above" : "at");
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
      if (!found.read?.current || !found.read.complete || rowsOn(cell, reading, found.rows).length === 0 || rowsOn(cell, reading, found.rows).some(row => row.fault !== null)) { console.log(`${named}: no rows to keep`); continue; }
      added.set(reading.drill, [...(added.get(reading.drill) ?? []), { body: cell.body, loadout: loadoutKey(cell.loadout), protocol: reading.protocol, subject: reading.subject,
        record: found.read.file, ...(found.read.files.length > 1 ? { records: found.read.files } : {}), id: found.read.id, version: found.read.version }]);
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
      if (fault || read?.current && read.complete) continue;
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
