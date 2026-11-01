/**
 * **The table**: every cell of Option Mind on every body (`tableCells`,
 * `src/evaluation/table/cells.ts`), body by loadout by skill, judged from the drills' records
 * against its bar (`verdictOf`), each reading's drill link at the version read and whether that is
 * the subject's version now.
 *
 *   npm run evaluate -- table [--body <model>] [--skill <name>] [--loadout <left,right>] [--play] [--workers N] [--json <file>]
 *
 * A reading is found in the newest record of its drill and protocol that holds its subject, by id
 * or by the same config. `--play` plays each reading whose subject has no record at its version
 * now (`npm run evaluate -- <drill> <subject> --protocol <p> --write`), which plays only the cases
 * no kept row has, so a cell a change did not touch costs nothing.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { recordingKey } from "../src/core/recording.ts";
import { loadoutKey } from "../src/core/items/held.ts";
import { CONTROLLERS } from "../src/entrants/game.ts";
import { partNames } from "../src/evaluation/code.ts";
import { EVALUATIONS } from "../src/evaluation/evaluations.ts";
import { readRecord, recordedSubject } from "../src/evaluation/record.ts";
import { TABLE_BODIES, TABLE_LOADOUTS, TABLE_SKILLS, tableCells } from "../src/evaluation/table/cells.ts";
import { rowsOn, verdictOf } from "../src/evaluation/table/judge.ts";
import { caseCoder, fileTable } from "./build-identity.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

/** Every record of evaluation `id`, oldest first by name. */
function recordsOf(id) {
  const dir = join(ROOT, "assets/evaluations", id);
  return existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".jsonl")).sort()
    .map((name) => ({ name, ...readRecord(readFileSync(join(dir, name), "utf8"), name) })) : [];
}

/** A Ratings link to `subject`'s `version` on `drill`. */
const linkOf = (drill, subject, version) => `?play=ratings&evaluation=${drill}&subject=${encodeURIComponent(subject)}&version=${version}`;

/**
 * Each reading's evidence, by `drill protocol subject`: the subject now and its version, and the
 * newest record holding it (by id, or by the same config) with its rows and the version it read.
 */
function evidenceOf(readings) {
  const evidence = new Map(), coders = new Map(), records = new Map(), table = fileTable();
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
    const wanted = subject ? recordingKey(subject.value) : null;
    let found = null;
    for (const record of records.get(reading.drill)) {
      if (record.header.protocol !== reading.protocol) continue;
      const held = record.header.subjects.find((one) => one.id === reading.subject) ?? (wanted && record.header.subjects.find((one) => recordingKey(one.value) === wanted));
      if (held) found = { record, held };
    }
    const rows = found ? found.record.lines.filter((line) => line.subjects[0] === found.held.id) : [];
    evidence.set(key, { reading, now, fault, rows,
      read: found && { file: found.record.name, commit: found.record.header.commit.slice(0, 8), date: found.record.header.date, id: found.held.id, version: found.held.version.version,
        current: found.held.version.version === now } });
  }
  return evidence;
}

/** One cell's state over its readings: unread, short or met; and its lines. */
function cellOf(cell, evidence) {
  let state = "met";
  const lines = cell.readings.map((reading) => {
    const found = evidence.get(`${reading.drill} ${reading.protocol} ${reading.subject}`), verdict = verdictOf(reading.judge, rowsOn(cell, reading, found.rows));
    if (verdict.state === "unread") state = "unread";
    else if (state === "met" && verdict.state === "short") state = "short";
    const at = found.read ? `${found.read.commit} ${found.read.date}${found.read.current ? ", current" : ", not the version now"}: ${linkOf(reading.drill, found.read.id, found.read.version)}` : "no record";
    return `  ${reading.drill}/${reading.protocol} ${reading.subject}: ${verdict.state}, ${verdict.figures} (${at})${found.fault ? `; ${found.fault}` : ""}`;
  });
  return { state, lines };
}

const MARK = { met: "met", short: "short", unread: "not read" };

/** Print the table for the command line's options, playing first with `--play`. */
export function main() {
  const { values } = parseArgs({ allowPositionals: true, options: {
    body: { type: "string" }, skill: { type: "string" }, loadout: { type: "string" }, play: { type: "boolean" }, workers: { type: "string" }, json: { type: "string" } } });
  const cells = tableCells().filter((cell) => (!values.body || cell.body === values.body) && (!values.skill || cell.skill === values.skill)
    && (!values.loadout || loadoutKey(cell.loadout) === values.loadout));
  const readings = cells.flatMap((cell) => cell.readings);
  let evidence = evidenceOf(readings);
  if (values.play) {
    for (const { reading, read, fault } of evidence.values()) {
      if (fault || read?.current) continue;
      console.log(`playing ${reading.drill} ${reading.protocol} ${reading.subject}`);
      execFileSync(process.execPath, [join(ROOT, "scripts/evaluate.mjs"), reading.drill, reading.subject, "--protocol", reading.protocol, "--write", ...(values.workers ? ["--workers", values.workers] : [])], { cwd: ROOT, stdio: "inherit" });
    }
    evidence = evidenceOf(readings);
  }
  const judged = cells.map((cell) => ({ cell, ...cellOf(cell, evidence) }));
  const skills = TABLE_SKILLS.map((skill) => skill.name).filter((name) => judged.some(({ cell }) => cell.skill === name));
  console.log(`| Body | Loadout | ${skills.join(" | ")} |`);
  console.log(`|---|---|${skills.map(() => "---").join("|")}|`);
  for (const body of TABLE_BODIES) for (const loadout of TABLE_LOADOUTS) {
    const row = judged.filter(({ cell }) => cell.body === body && loadoutKey(cell.loadout) === loadoutKey(loadout));
    if (row.length === 0) continue;
    console.log(`| ${body} | ${loadoutKey(loadout)} | ${skills.map((skill) => MARK[row.find(({ cell }) => cell.skill === skill)?.state] ?? "-").join(" | ")} |`);
  }
  console.log("");
  for (const { cell, state, lines } of judged) console.log(`${cell.body} ${loadoutKey(cell.loadout)} ${cell.skill}: ${MARK[state]} (bar: ${cell.bar})\n${lines.join("\n")}`);
  const counts = Object.fromEntries(Object.keys(MARK).map((state) => [state, judged.filter((one) => one.state === state).length]));
  console.log(`\n${judged.length} cells: ${Object.entries(counts).map(([state, n]) => `${n} ${MARK[state]}`).join(", ")}`);
  if (values.json) writeFileSync(values.json, JSON.stringify(judged.map(({ cell, state, lines }) => ({ body: cell.body, loadout: cell.loadout, skill: cell.skill, state, lines })), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
