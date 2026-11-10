/**
 * **The table**: every cell of Option Mind on every body (`tableCells`,
 * `src/evaluation/table/cells.ts`), body by loadout by skill, valued from the drills' records in
 * the game's own terms (`valueOf`): each reading's value now, at its baseline (`baselineOf`) and at
 * its best version, compared trial by trial on the conditions both counted (`compareValues`), with
 * the figures beside it and each drill link. A fall is priced at its body and loadout's time to
 * stand now, the stand-up cell's value, or the fall's cap where that is unread.
 *
 *   npm run evaluate -- table [--body <model>] [--skill <name>] [--loadout <left,right>] [--play] [--fresh] [--baseline] [--workers N] [--json <file>]
 *
 * A reading now is found in the newest record of its drill and protocol that holds its subject, by
 * id or by the same config; its best, in whichever such record values it best on the cell.
 * A reading recorded at an earlier version is valued on its own rows, matched to the protocol's
 * cases by condition, and shown with its record's commit and date.
 * `--play` plays each reading that has no whole record (`npm run evaluate -- <drill> <subject>
 * --protocol <p> --write`); a reading recorded at an earlier version is kept as it stands, so a
 * change to the code plays nothing. `--fresh` plays the readings of the cells asked for again on
 * the code now, where their record is at an earlier version; the stand-up reading that prices a
 * fall is played again only where a cell asked for reads it. Each reading plays to evaluate's budget and keeps its
 * complete units, so a pass always keeps what it played; one that fails is named at the end and the
 * rest still play. `--baseline` keeps each reading now as its cell's baseline
 * (`assets/evaluations/<drill>/baselines.json`), where the cell has none, as soon as the reading is
 * whole: a baseline is never overwritten.
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
import { FALL_CAP } from "../src/evaluation/fall.ts";
import { STAND_UP, TABLE_BODIES, TABLE_LOADOUTS } from "../src/evaluation/table/cells.ts";
import { TABLE_SKILLS, tableCells } from "../src/app/node/evaluation.ts";
import { baselineOf, compareValues, rowsOn, unitOf, valueOf } from "../src/evaluation/table/judge.ts";
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

/** The key a reading's evidence is kept by. */
const evidenceKey = (reading) => `${reading.drill} ${reading.protocol} ${reading.subject}`;

/**
 * Each reading's evidence, by `drill protocol subject`: the subject now and its version; every
 * record of its protocol holding it (by id, or by the same config) with the subject as held there;
 * and the newest of them, one at its version now before any other, with its rows and the version
 * it read.
 */
function evidenceOf(readings, records) {
  const evidence = new Map(), coders = new Map(), table = fileTable();
  for (const reading of readings) {
    const key = evidenceKey(reading);
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
    const conditions = new Set(rows.map(row => recordingKey(row.condition)));
    evidence.set(key, { reading, now, fault, versions, rows, required,
      read: found && { file: found.record.name, files: selected.files, commit: found.record.header.commit.slice(0, 8), date: found.record.header.date, id: found.held.id, version: found.held.version.version,
        current: found.held.version.version === now, complete: required.length > 0 && required.every(one => conditions.has(recordingKey(one.condition))) } });
  }
  return evidence;
}

const MARK = { unread: "not read", unbased: "no baseline", better: "better", worse: "worse", within: "within noise", unpaired: "unpaired" };

/** A value in words, in `unit`. */
const valueText = (value, unit) => value === null ? "unvalued" : `${Number(value.toFixed(3))} ${unit.unit}`;

/** A comparison in words: its verdict and the mean difference with its interval, over its pairs. */
const comparisonText = (one) => one.verdict === "unpaired" ? "unpaired"
  : `${MARK[one.verdict]}, ${one.difference >= 0 ? "+" : ""}${Number(one.difference.toFixed(3))} (${Number(one.low.toFixed(3))} to ${Number(one.high.toFixed(3))}) over ${one.pairs} pairs`;

/** Where a reading was read: its record's commit and date, whether at the version now, and its link. */
const readText = (drill, read) => `${read.commit} ${read.date}${read.current ? ", current" : ", not the version now"}: ${linkOf(drill, read.id, read.version)}`;

/** `reading`'s baseline on `cell` (`baselineOf`) and its rows: null rows where its records are gone. */
function baselineRows(cell, reading, records, baselines) {
  const base = baselineOf(baselines(reading.drill), cell, reading);
  const based = base ? (base.records ?? [base.record]).map(name => records.get(reading.drill).find(record => record.name === name)) : [];
  return { base, rows: based.length && based.every(Boolean) ? [...indexRows(based.map(record => ({ name: record.name, rows: rowsOf(record, { id: base.id }) }))).values()].map(({ row }) => row) : null };
}

/**
 * A cell over its readings, a fall costing `rise` s: each reading valued now, at its baseline and at
 * its best version. Its state: not read where a reading has no value now, no baseline where one has
 * none, else every reading's trials against their baseline's, paired and pooled (`compareValues`).
 * Its value now, the mean over every counted trial of its readings; and its lines.
 */
function valueCell(cell, evidence, records, baselines, rise) {
  const unit = unitOf(cell.readings[0].judge), pooled = { now: new Map(), then: new Map() }, counted = [];
  let state = null;
  const lines = cell.readings.map((reading) => {
    const found = evidence.get(evidenceKey(reading)), required = rowsOn(cell, reading, found.required);
    const now = valueOf(reading, rowsOn(cell, reading, found.rows), required, rise);
    const { base, rows } = baselineRows(cell, reading, records, baselines);
    const then = rows && valueOf(reading, rowsOn(cell, reading, rows), required, rise);
    let best = null;
    for (const { rows: kept, held } of found.versions) {
      const one = valueOf(reading, rowsOn(cell, reading, kept), required, rise);
      if (one.value !== null && (!best || (unit.better === "higher" ? one.value >= best.valued.value : one.value <= best.valued.value))) best = { valued: one, id: held.id, version: held.version.version };
    }
    if (now.value === null) state ??= "unread";
    else if (then?.value == null) state ??= "unbased";
    else for (const [key, value] of now.trials) {
      pooled.now.set(`${evidenceKey(reading)} ${key}`, value);
      if (then.trials.has(key)) pooled.then.set(`${evidenceKey(reading)} ${key}`, then.trials.get(key));
    }
    counted.push(...now.trials.values());
    return [`  ${reading.drill}/${reading.protocol} ${reading.subject}: ${valueText(now.value, unit)}; ${now.figures}${found.read ? ` (${readText(reading.drill, found.read)})` : " (no record)"}${found.fault ? `; ${found.fault}` : ""}`,
      `    baseline ${base ? then ? `${valueText(then.value, unit)}, now ${comparisonText(compareValues(now.trials, then.trials, unit))} (${linkOf(reading.drill, base.id, base.version)})` : `${base.record} not found` : "none"}`
        + `; best ${best ? `${valueText(best.valued.value, unit)}, now ${comparisonText(compareValues(now.trials, best.valued.trials, unit))} (${linkOf(reading.drill, best.id, best.version)})` : "none"}`].join("\n");
  });
  const value = state === "unread" || counted.length === 0 ? null : counted.reduce((sum, one) => sum + one, 0) / counted.length;
  return { state: state ?? compareValues(pooled.now, pooled.then, unit).verdict, value, unit, lines };
}

/** The time to stand on each body and loadout of `cells`, s, by `body loadout`: the stand-up cell's value now, the fall's cap where it is unread. */
function risesOf(cells, evidence) {
  const rises = new Map(), found = evidence.get(evidenceKey(STAND_UP));
  for (const cell of cells) {
    const key = `${cell.body} ${loadoutKey(cell.loadout)}`;
    if (!rises.has(key)) rises.set(key, valueOf(STAND_UP, rowsOn(cell, STAND_UP, found.rows), rowsOn(cell, STAND_UP, found.required), FALL_CAP).value ?? FALL_CAP);
  }
  return rises;
}

/** Keep each reading now of `cells` that `reads` (every one where not given) as its cell's baseline where it has none; name those kept already and those with no rows to keep. */
function keepBaselines(cells, evidence, reads = () => true) {
  const added = new Map();
  for (const cell of cells) {
    for (const reading of cell.readings.filter(reads)) {
      const found = evidence.get(evidenceKey(reading)), kept = [...baselinesOf(reading.drill), ...(added.get(reading.drill) ?? [])];
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

/** Print the table for the command line's options, playing first with `--play` or `--fresh`, keeping baselines with `--baseline`. */
export function main() {
  const { values } = parseArgs({ allowPositionals: true, options: {
    body: { type: "string" }, skill: { type: "string" }, loadout: { type: "string" }, play: { type: "boolean" }, fresh: { type: "boolean" }, baseline: { type: "boolean" }, workers: { type: "string" }, json: { type: "string" } } });
  const cells = tableCells().filter((cell) => (!values.body || cell.body === values.body) && (!values.skill || cell.skill === values.skill)
    && (!values.loadout || loadoutKey(cell.loadout) === values.loadout));
  // The stand-up reading prices every cell's falls, so it is read whatever the cells asked.
  const readings = [...cells.flatMap((cell) => cell.readings), STAND_UP];
  let records = new Map(), evidence = evidenceOf(readings, records);
  if (values.play || values.fresh) {
    const failed = [], asked = new Set(cells.flatMap((cell) => cell.readings).map(evidenceKey));
    for (const { reading, read, fault } of [...evidence.values()]) {
      const key = evidenceKey(reading);
      // A whole record at an earlier version stands; only `--fresh` plays it again, and only for a cell asked for.
      const stands = read?.complete && (read.current || !(values.fresh && asked.has(key)));
      if (fault || stands) continue;
      console.log(`playing ${key}`);
      try {
        execFileSync(process.execPath, [join(ROOT, "scripts/evaluate.mjs"), reading.drill, reading.subject, "--protocol", reading.protocol, "--write", ...(values.workers ? ["--workers", values.workers] : [])], { cwd: ROOT, stdio: "inherit" });
      } catch (error) { failed.push(`${key}: ${error instanceof Error ? error.message : String(error)}`); }
      // What this reading kept is read again at once, so its cells' baselines are kept before the next reading plays.
      records.delete(reading.drill);
      evidence.set(key, evidenceOf([reading], records).get(key));
      if (values.baseline) keepBaselines(cells, evidence, (one) => evidenceKey(one) === key);
    }
    for (const one of failed) console.log(`failed ${one}`);
    if (failed.length > 0) process.exitCode = 1;
    records = new Map();
    evidence = evidenceOf(readings, records);
  }
  if (values.baseline) keepBaselines(cells, evidence);
  const baselines = new Map(), baselinesFor = (drill) => baselines.get(drill) ?? baselines.set(drill, baselinesOf(drill)).get(drill);
  const rises = risesOf(cells, evidence);
  const judged = cells.map((cell) => {
    const rise = rises.get(`${cell.body} ${loadoutKey(cell.loadout)}`);
    return { cell, rise, ...valueCell(cell, evidence, records, baselinesFor, rise) };
  });
  const skills = TABLE_SKILLS.map((skill) => skill.name).filter((name) => judged.some(({ cell }) => cell.skill === name));
  console.log(`| Body | Loadout | ${skills.map((name) => `${name}, ${unitOf(judged.find(({ cell }) => cell.skill === name).cell.readings[0].judge).unit}`).join(" | ")} |`);
  console.log(`|---|---|${skills.map(() => "---").join("|")}|`);
  for (const body of TABLE_BODIES) for (const loadout of TABLE_LOADOUTS) {
    const row = judged.filter(({ cell }) => cell.body === body && loadoutKey(cell.loadout) === loadoutKey(loadout));
    if (row.length === 0) continue;
    console.log(`| ${body} | ${loadoutKey(loadout)} | ${skills.map((skill) => {
      const one = row.find(({ cell }) => cell.skill === skill);
      return one ? `${one.value === null ? "-" : Number(one.value.toFixed(2))}, ${MARK[one.state]}` : "-";
    }).join(" | ")} |`);
  }
  console.log("");
  for (const { cell, state, value, unit, rise, lines } of judged)
    console.log(`${cell.body} ${loadoutKey(cell.loadout)} ${cell.skill}: ${valueText(value, unit)}, ${MARK[state]} (${unit.better} is better; ${cell.value}${cell.skill === "stand-up" ? "" : `; a fall's rise ${Number(rise.toFixed(2))} s`})\n${lines.join("\n")}`);
  const counts = Object.entries(MARK).map(([state, mark]) => [mark, judged.filter((one) => one.state === state).length]).filter(([, n]) => n > 0);
  console.log(`\n${judged.length} cells: ${counts.map(([mark, n]) => `${n} ${mark}`).join(", ")}`);
  if (values.json) writeFileSync(values.json, JSON.stringify(judged.map(({ cell, state, value, unit, rise, lines }) => ({ body: cell.body, loadout: cell.loadout, skill: cell.skill, value, unit, rise, state, lines })), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
