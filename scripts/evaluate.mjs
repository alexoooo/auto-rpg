/**
 * **Evaluate**: an evaluation's cases for its subjects, each played only where no row has its key,
 * on worker threads; then what the complete rows give each subject, and the evaluation's summary.
 *
 *   npm run evaluate -- <evaluation> [subject ...] [--subjects a,b] [--mind <file.json>] [--protocol <name>]
 *     [--previous <id>] [--shard k/n] [--workers N] [--engine <name>] [--case-minutes 30] [--write] [--json <file>]
 *   npm run match -- <mind> <mind> [...]: the same for `match`
 *
 * A subject is a name the evaluation's catalogue resolves (a mind's id or kind), a JSON file, or
 * JSON; `--mind` names a file to put first. Rows are kept as they come in
 * `research/runs/evaluations/<evaluation>/` (every file there is read, so machines merge by copying)
 * and found again by key, with every record's under `assets/evaluations/<evaluation>/`. `--previous`
 * names the first subject's parent: the newest recorded version of that id, else that subject here.
 * `--write` keeps the run as a record, refused unless every case has a row and the commit holds the
 * environment's files unchanged.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism, hostname } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { Worker } from "node:worker_threads";
import { DEFAULT_ENGINE, isEngineName } from "../src/core/engine/engines.ts";
import { recordingKey } from "../src/core/recording.ts";
import { EVALUATIONS } from "../src/evaluation/evaluations.ts";
import { readRecord, recordedSubject, recordIdentity, recordName, recordText, rowOf, sameRow } from "../src/evaluation/record.ts";
import { casesOf, completePrefix, figuresOf, runEvaluation, runOrder, tableOf } from "../src/evaluation/run.ts";
import { sha256Text } from "../src/evaluation/sha256.ts";
import { BUILD_IDENTITY, environmentOf } from "./build-identity.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

/** The lanes a run takes unless told: all but two of the machine's threads. */
const defaultLanes = () => Math.max(1, availableParallelism() - 2);

/** The subject `text` names: a JSON file or JSON as given whole, else a name for the catalogue. */
function subjectOf(text) {
  if (existsSync(text)) return { id: basename(text).replace(/\.json$/, ""), label: text, value: JSON.parse(readFileSync(text, "utf8")) };
  if (text.trim().startsWith("{")) {
    const value = JSON.parse(text);
    return { id: `json:${sha256Text(recordingKey(value)).slice(0, 8)}`, label: "a JSON mind", value };
  }
  return text;
}

/** Every `.jsonl` file in `directory`, by name, with its text. */
const filesIn = (directory) => existsSync(directory)
  ? readdirSync(directory).filter((name) => name.endsWith(".jsonl")).sort().map((name) => ({ name: join(directory, name), text: readFileSync(join(directory, name), "utf8") }))
  : [];

/** The rows of `sources` by key: two that differ under one key stop the run, naming both. */
function rowsFrom(sources) {
  const rows = new Map(), from = new Map();
  for (const { name, rows: found } of sources) for (const row of found) {
    const had = rows.get(row.key);
    if (had && !sameRow(had, row)) throw new Error(`case ${row.key} reads differently in ${from.get(row.key)} and ${name}`);
    if (!had) { rows.set(row.key, rowOf(row)); from.set(row.key, name); }
  }
  return rows;
}

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();

/** The commit checked out, or null outside a repository. */
function commitOf() {
  try { return git("rev-parse", "HEAD"); } catch { return null; }
}

/** A 95 % estimate as text. */
const estimateText = (estimate) => estimate === null ? "none" : `${estimate.value.toFixed(3)} (${estimate.low.toFixed(3)} to ${estimate.high.toFixed(3)})`;

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    subjects: { type: "string" }, mind: { type: "string", multiple: true }, protocol: { type: "string" }, previous: { type: "string" },
    shard: { type: "string" }, workers: { type: "string" }, engine: { type: "string" }, "case-minutes": { type: "string", default: "30" },
    write: { type: "boolean" }, json: { type: "string" },
  } });
  const [id, ...named] = positionals;
  const evaluation = EVALUATIONS[id];
  if (!evaluation) throw new Error(`name an evaluation: ${Object.keys(EVALUATIONS).join(", ")}`);
  const protocol = values.protocol ?? evaluation.defaultProtocol, cases = evaluation.protocols[protocol];
  if (!cases) throw new Error(`${id} has no protocol ${protocol}: ${Object.keys(evaluation.protocols).join(", ")}`);
  const engine = values.engine ?? process.env.CORE_ENGINE ?? DEFAULT_ENGINE;
  if (!isEngineName(engine)) throw new Error(`no engine ${engine}`);
  const harness = `Node, core world (src/core/world.ts), ${engine}, 120 Hz`;
  const [shardAt, shards] = values.shard ? values.shard.split("/").map(Number) : [1, 1];
  if (!(Number.isInteger(shardAt) && Number.isInteger(shards) && shardAt >= 1 && shardAt <= shards)) throw new Error("--shard is k/n, 1 <= k <= n");

  const choice = [...(values.mind ?? []), ...named, ...(values.subjects ? values.subjects.split(",") : [])].map(subjectOf);
  const subjects = evaluation.subjects(choice);
  const environment = environmentOf();
  const units = casesOf(evaluation, protocol, subjects, { engine, code: environment.digest }), order = runOrder(units);
  const working = join(ROOT, "research/runs/evaluations", id), recordDir = join(ROOT, "assets/evaluations", id);
  const records = filesIn(recordDir).map(({ name, text }) => ({ name, ...readRecord(text, name) }));
  const rows = rowsFrom([
    ...records.map(({ name, lines }) => ({ name, rows: lines })),
    ...filesIn(working).map(({ name, text }) => ({ name, rows: text.split("\n").filter(Boolean).map((line) => JSON.parse(line)) })),
  ]);

  // Play what has no row: this shard's units, in the run order.
  const mine = order.filter((_, k) => k % shards === shardAt - 1), lanes = Number(values.workers ?? defaultLanes());
  const toPlay = mine.flat().filter((one) => !rows.has(one.key)).length, reused = mine.flat().length - toPlay;
  console.log(`${evaluation.title}: ${protocol}; ${harness}; ${units.length} units, ${toPlay} cases to play, ${reused} found${shards > 1 ? `; shard ${shardAt}/${shards}` : ""}`);
  const file = join(working, `${hostname()}${shards > 1 ? `-${shardAt}of${shards}` : ""}.jsonl`), lost = [];
  let played = 0;
  const started = Date.now();
  if (toPlay > 0) {
    mkdirSync(working, { recursive: true });
    await runEvaluation(mine, rows, {
      evaluation: id, protocol, lanes, minutes: Number(values["case-minutes"]),
      spawn: (listen) => {
        const worker = new Worker(new URL("./evaluate-worker.mjs", import.meta.url));
        worker.on("message", listen.answer);
        worker.on("error", (error) => listen.lost(String(error?.stack ?? error)));
        worker.on("exit", (code) => listen.lost(`its worker exited (${code})`));
        return { post: (job) => worker.postMessage(job), terminate: () => void worker.terminate() };
      },
      onRow: (row) => {
        appendFileSync(file, JSON.stringify(row) + "\n");
        rows.set(row.key, row);
        if (++played === Math.min(lanes, toPlay) && toPlay > played)
          console.log(`about ${(((Date.now() - started) / played) * (toPlay - played) / 60_000).toFixed(1)} min more for ${toPlay - played} cases`);
      },
      onLost: (job, reason) => { lost.push({ key: job.key, reason }); console.log(`lost ${job.key}: ${reason}`); },
    });
  }
  const prefix = completePrefix(order, rows), commit = commitOf();
  console.log(`${played} played in ${((Date.now() - started) / 1000).toFixed(0)} s; ${lost.length} lost; commit ${commit ?? "unknown"}; build ${BUILD_IDENTITY}; environment ${environment.digest}`);
  if (prefix < order.length) {
    console.log(`incomplete: ${prefix} of ${order.length} units have every row${lost.length ? "; run again to retry the lost" : ""}`);
    if (values.write) throw new Error("a record needs a row for every case");
    process.exitCode = shards > 1 ? 0 : 1;
    return;
  }

  // The parent of the first subject, when named: the newest recorded version of that id, else that subject here.
  const recorded = subjects.map((subject) => recordedSubject(subject, cases.play, environment.digest, null));
  let parent = null;
  if (values.previous) {
    parent = records.flatMap(({ header }) => header.subjects).filter((one) => one.id === values.previous && one.version.version !== recorded[0].version.version).at(-1)
      ?? recorded.find((one) => one.id === values.previous && one !== recorded[0]) ?? null;
    if (!parent) throw new Error(`no version of ${values.previous} in a record of ${id} or among the subjects`);
    recorded[0] = recordedSubject(subjects[0], cases.play, environment.digest, parent);
  }
  const date = new Date().toISOString().slice(0, 10);
  const header = {
    identity: recordIdentity(BUILD_IDENTITY, engine, harness, cases.play), evaluation: id, protocol, play: cases.play, engine, harness,
    commit, date, schedule: "all", pool: { protocol: recorded[0].version.protocol, environment: environment.digest }, subjects: recorded,
  };
  const lines = units.flat().map(({ subjects: seated, condition, key, code, world }) => ({ subjects: seated, condition, key, code, world, ...rowOf(rows.get(key)) }));
  const { table, faults } = tableOf(subjects, units, rows), figures = figuresOf(evaluation, subjects, units, rows);
  console.log(`protocol ${header.pool.protocol}`);
  for (const one of recorded) console.log(`${one.id}: version ${one.version.version}${one.parent ? `, parent ${one.parent.id} ${one.parent.version.version} (${one.changes.join(", ") || "no change"})` : ""}`);
  console.log("\n| Subject | Figure | Units | Value (95 % interval) |\n|---|---|---|---|");
  for (const f of figures) console.log(`| ${f.subject} | ${f.figure}, ${f.unit} | ${f.units} | ${estimateText(f.estimate)} |`);
  for (const fault of faults) console.log(`fault (${fault.fault.kind}) in ${fault.key}: ${fault.fault.message}`);
  const summary = faults.length ? null : evaluation.summary(table);
  if (summary) console.log("\n" + summary.lines.join("\n"));
  else console.log("\nno summary: a case is a fault");
  if (values.json) writeFileSync(values.json, JSON.stringify({ header, figures, summary: summary?.json ?? null, cases: lines }, null, 2) + "\n");

  if (values.write) {
    if (!commit) throw new Error("a record needs a commit");
    const changed = git("status", "--porcelain", "--", ...environment.files.filter((one) => !one.startsWith("node_modules/")));
    if (changed) throw new Error(`a record's code is its commit's: these differ or are untracked:\n${changed}`);
    const name = join(recordDir, recordName(header, lines)), text = recordText(header, lines);
    if (existsSync(name)) {
      if (readFileSync(name, "utf8") !== text) throw new Error(`${name} exists with other content`);
      console.log(`${name} holds this record already`);
    } else {
      mkdirSync(recordDir, { recursive: true });
      writeFileSync(name, text);
      console.log(`wrote ${name}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
