/**
 * **The table**: every cell of Option Mind on every body (`tableCells`,
 * `src/evaluation/table/cells.ts`), body by loadout by skill, valued from the drills' results
 * (`src/evaluation/results.ts`) in the game's own terms (`valueOf`): each reading's value now and at
 * its baseline (`baselineOf`), compared trial by trial on the conditions both counted
 * (`compareValues`), with the figures beside it and each drill link. A fall is priced at its body
 * and loadout's time to stand now, the stand-up cell's value, or the fall's cap where that is unread.
 *
 *   npm run evaluate -- table [--body <model>] [--skill <name>] [--loadout <left,right>] [--play] [--fresh] [--baseline] [--workers N] [--json <file>]
 *
 * A reading is its subject's newest result on its drill and protocol. One read at an earlier
 * version, or on cases whose code has changed since, stands as it was read, shown with its commit
 * and date. `--play` plays each reading with no whole result (`npm run evaluate -- <drill>
 * <subject> --protocol <p> --write`); a whole one stands, so a change to the code plays nothing.
 * `--fresh` plays the readings of the cells asked for again on the code now, where their result is
 * not at the version now; the stand-up reading that prices a fall is played again only where a cell
 * asked for reads it. Each reading plays to evaluate's budget and keeps its complete units, so a
 * pass always keeps what it played; one that fails is named at the end and the rest still play.
 * `--baseline` names each reading now as its cell's baseline, where the cell has none, as soon as
 * the reading is whole: a baseline is never overwritten, and the result it names is kept.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { loadoutKey } from "../src/core/bodies/items/held.ts";
import { DEFAULT_ENGINE } from "../src/core/physics/engines.ts";
import { isRefused } from "../src/core/refusal.ts";
import { casesOf } from "../src/evaluation/run.ts";
import { CONTROLLERS } from "../src/app/catalog.ts";
import { caseNames, partNames } from "../src/app/node/evaluation.ts";
import { EVALUATIONS } from "../src/app/node/evaluation.ts";
import { FALL_CAP } from "../src/evaluation/fall.ts";
import { baselineOf, caseName, codeOf, resultOf, versionOf, withBaseline } from "../src/evaluation/results.ts";
import { STAND_UP, TABLE_BODIES, TABLE_LOADOUTS } from "../src/evaluation/table/cells.ts";
import { TABLE_SKILLS, tableCells } from "../src/app/node/evaluation.ts";
import { casesOn, compareValues, resultTrials, unitOf, valueOf } from "../src/evaluation/table/judge.ts";
import { caseCoder, fileTable } from "./build-identity.mjs";
import { resultsOf, writeResults } from "./evaluation-results.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Each drill's results, read once and again after a change. */
const stores = new Map(), storeOf = (drill) => stores.get(drill) ?? stores.set(drill, resultsOf(drill)).get(drill);

/** A Ratings link to `reading`'s result. */
const linkOf = (reading) => `?play=ratings&evaluation=${reading.drill}&protocol=${reading.protocol}&subject=${encodeURIComponent(reading.subject)}`;

/** The key a reading's evidence is kept by. */
const evidenceKey = (reading) => `${reading.drill} ${reading.protocol} ${reading.subject}`;

/** A result's trials, on its list's conditions. */
const trialsOf = (drill, result) => resultTrials(result, storeOf(drill).cases[result.cases] ?? []);

/**
 * Each reading's evidence, by `drill protocol subject`: the protocol's cases for its subject now
 * (each condition with its name), its newest result with its trials, whether that is at the version
 * now (the subject's, and every case's own code) and whether it has a trial for every case now.
 */
function evidenceOf(readings) {
  const evidence = new Map(), coders = new Map(), table = fileTable();
  for (const reading of readings) {
    const key = evidenceKey(reading);
    if (evidence.has(key)) continue;
    const evaluation = EVALUATIONS[reading.drill], cases = evaluation.protocols[reading.protocol];
    if (!coders.has(reading.drill)) coders.set(reading.drill, caseCoder(table, `src/evaluation/${reading.drill}/cases.ts`, Object.keys(CONTROLLERS)));
    const coder = coders.get(reading.drill);
    let now = null, fault = null, required = [];
    try {
      const subject = evaluation.subjects([reading.subject])[0];
      now = versionOf(subject, cases.play, coder.environment.digest, coder.code(partNames(subject.parts)).own);
      const scheduled = casesOf(evaluation, reading.protocol, [subject], { engine: cases.engine ?? DEFAULT_ENGINE,
        code: world => coder.code(caseNames(world)).digest, schedule: { kind: "all" } });
      if (isRefused(scheduled)) throw new Error(scheduled.refused);
      required = scheduled.units.flat();
    } catch (error) { fault = error instanceof Error ? error.message : String(error); }
    const result = resultOf(storeOf(reading.drill), reading.protocol, reading.subject), trials = result ? trialsOf(reading.drill, result) : [];
    const read = new Set(trials.map(trial => trial.at)), named = required.map(one => ({ condition: one.condition, name: caseName(one.condition) }));
    evidence.set(key, { reading, fault, result, trials, required: named,
      current: !!result && result.version === now && required.length > 0 && result.code === codeOf(required.map(one => one.key)),
      complete: required.length > 0 && named.every(one => read.has(one.name)) });
  }
  return evidence;
}

const MARK = { unread: "not read", uncounted: "nothing counted", unbased: "no baseline", better: "better", worse: "worse", within: "within noise", unpaired: "unpaired" };

/** A value in words, in `unit`. */
const valueText = (value, unit) => value === null ? "unvalued" : `${Number(value.toFixed(3))} ${unit.unit}`;

/** A comparison in words: its verdict and the mean difference with its interval, over its pairs. */
const comparisonText = (one) => one.verdict === "unpaired" ? "unpaired"
  : `${MARK[one.verdict]}, ${one.difference >= 0 ? "+" : ""}${Number(one.difference.toFixed(3))} (${Number(one.low.toFixed(3))} to ${Number(one.high.toFixed(3))}) over ${one.pairs} pairs`;

/** Where and when a result was read. */
const readText = (result) => `${result.commit} ${result.date}`;

/** The names of the cases `found` requires on `cell`, and those of `trials` on them. */
function onCell(cell, reading, found) {
  const names = casesOn(cell, reading, found.required).map(one => one.name), wanted = new Set(names);
  return { names, on: (trials) => trials.filter(trial => wanted.has(trial.at)) };
}

/**
 * A cell over its readings, a fall costing `rise` s: each reading valued now and at its baseline.
 * Its state: not read where a reading is not whole now, no baseline where one has none, nothing
 * counted where every reading is whole and no trial of any counts (every blow refused or never
 * begun, every cover unattacked), else every reading's counted trials against their baseline's,
 * paired and pooled (`compareValues`). Its value now, the mean over every counted trial of its
 * readings; and its lines.
 */
function valueCell(cell, evidence, rise) {
  const unit = unitOf(cell.readings[0].judge), pooled = { now: new Map(), then: new Map() }, counted = [];
  let state = null;
  const lines = cell.readings.map((reading) => {
    const found = evidence.get(evidenceKey(reading)), { names, on } = onCell(cell, reading, found);
    const now = valueOf(reading, on(found.trials), names, rise);
    const store = storeOf(reading.drill), base = baselineOf(store, cell.body, loadoutKey(cell.loadout), reading.protocol, reading.subject);
    const based = base && resultOf(store, reading.protocol, reading.subject, base.version);
    const then = based && valueOf(reading, on(trialsOf(reading.drill, based)), names, rise);
    if (!now.whole) state ??= "unread";
    else if (now.trials.size === 0) { /* A whole reading with no trial counted adds nothing to the cell's value. */ }
    else if (!then) state ??= "unbased";
    else for (const [key, value] of now.trials) {
      pooled.now.set(`${evidenceKey(reading)} ${key}`, value);
      if (then.trials.has(key)) pooled.then.set(`${evidenceKey(reading)} ${key}`, then.trials.get(key));
    }
    counted.push(...now.trials.values());
    return [`  ${reading.drill}/${reading.protocol} ${reading.subject}: ${valueText(now.value, unit)}; ${now.figures}`
        + `${found.result ? ` (${readText(found.result)}${found.current ? ", current" : ", not the version now"}: ${linkOf(reading)})` : " (no result)"}${found.fault ? `; ${found.fault}` : ""}`,
      `    baseline ${base ? then ? `${valueText(then.value, unit)}, now ${comparisonText(compareValues(now.trials, then.trials, unit))} (${readText(based)})` : `version ${base.version} not kept` : "none"}`].join("\n");
  });
  if (state === null && counted.length === 0) state = "uncounted";
  const value = state === "unread" || counted.length === 0 ? null : counted.reduce((sum, one) => sum + one, 0) / counted.length;
  return { state: state ?? compareValues(pooled.now, pooled.then, unit).verdict, value, unit, lines };
}

/** The time to stand on each body and loadout of `cells`, s, by `body loadout`: the stand-up cell's value now, the fall's cap where it is unread. */
function risesOf(cells, evidence) {
  const rises = new Map(), found = evidence.get(evidenceKey(STAND_UP));
  for (const cell of cells) {
    const key = `${cell.body} ${loadoutKey(cell.loadout)}`, { names, on } = onCell(cell, STAND_UP, found);
    if (!rises.has(key)) rises.set(key, valueOf(STAND_UP, on(found.trials), names, FALL_CAP).value ?? FALL_CAP);
  }
  return rises;
}

/** Name each reading now of `cells` that `reads` (every one where not given) as its cell's baseline where it has none; say which have one already and which have no trials to name. */
function keepBaselines(cells, evidence, reads = () => true) {
  const changed = new Set();
  for (const cell of cells) {
    for (const reading of cell.readings.filter(reads)) {
      const found = evidence.get(evidenceKey(reading)), store = storeOf(reading.drill), mine = onCell(cell, reading, found).on(found.trials);
      const named = `${cell.body} ${loadoutKey(cell.loadout)} ${reading.drill}/${reading.protocol} ${reading.subject}`;
      if (baselineOf(store, cell.body, loadoutKey(cell.loadout), reading.protocol, reading.subject)) { console.log(`${named}: has a baseline, kept`); continue; }
      if (!found.current || !found.complete || mine.length === 0 || mine.some(trial => trial.kept === null)) { console.log(`${named}: no trials to keep`); continue; }
      stores.set(reading.drill, withBaseline(store, { body: cell.body, loadout: loadoutKey(cell.loadout), protocol: reading.protocol, subject: reading.subject, version: found.result.version }));
      changed.add(reading.drill);
      console.log(`${named}: baseline ${readText(found.result)}`);
    }
  }
  for (const drill of changed) writeResults(drill, stores.get(drill));
}

/** Print the table for the command line's options, playing first with `--play` or `--fresh`, keeping baselines with `--baseline`. */
export function main() {
  const { values } = parseArgs({ allowPositionals: true, options: {
    body: { type: "string" }, skill: { type: "string" }, loadout: { type: "string" }, play: { type: "boolean" }, fresh: { type: "boolean" }, baseline: { type: "boolean" }, workers: { type: "string" }, json: { type: "string" } } });
  const cells = tableCells().filter((cell) => (!values.body || cell.body === values.body) && (!values.skill || cell.skill === values.skill)
    && (!values.loadout || loadoutKey(cell.loadout) === values.loadout));
  // The stand-up reading prices every cell's falls, so it is read whatever the cells asked.
  const readings = [...cells.flatMap((cell) => cell.readings), STAND_UP];
  let evidence = evidenceOf(readings);
  if (values.play || values.fresh) {
    const failed = [], asked = new Set(cells.flatMap((cell) => cell.readings).map(evidenceKey));
    for (const { reading, complete, current, fault } of [...evidence.values()]) {
      const key = evidenceKey(reading);
      // A whole result at an earlier version stands; only `--fresh` plays it again, and only for a cell asked for.
      const stands = complete && (current || !(values.fresh && asked.has(key)));
      if (fault || stands) continue;
      console.log(`playing ${key}`);
      try {
        execFileSync(process.execPath, [join(ROOT, "scripts/evaluate.mjs"), reading.drill, reading.subject, "--protocol", reading.protocol, "--write", ...(values.workers ? ["--workers", values.workers] : [])], { cwd: ROOT, stdio: "inherit" });
      } catch (error) { failed.push(`${key}: ${error instanceof Error ? error.message : String(error)}`); }
      // What this reading kept is read again at once, so its cells' baselines are kept before the next reading plays.
      stores.delete(reading.drill);
      evidence.set(key, evidenceOf([reading]).get(key));
      if (values.baseline) keepBaselines(cells, evidence, (one) => evidenceKey(one) === key);
    }
    for (const one of failed) console.log(`failed ${one}`);
    if (failed.length > 0) process.exitCode = 1;
    stores.clear();
    evidence = evidenceOf(readings);
  }
  if (values.baseline) keepBaselines(cells, evidence);
  const rises = risesOf(cells, evidence);
  const judged = cells.map((cell) => {
    const rise = rises.get(`${cell.body} ${loadoutKey(cell.loadout)}`);
    return { cell, rise, ...valueCell(cell, evidence, rise) };
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
