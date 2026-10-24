/**
 * **Evaluate**: an evaluation's cases for its subjects, each played only where no row has its key,
 * on worker threads; then what the complete rows give each subject, and the evaluation's summary.
 *
 *   npm run evaluate -- <evaluation> [subject ...] [--subjects a,b] [--mind <file.json>] [--protocol <name>]
 *     [--against default|<id,...>] [--previous <id>] [--ablate <slot>=<JSON> ...] [--shard k/n] [--workers N] [--engine <name>]
 *     [--case-minutes 30] [--write] [--json <file>]
 *   npm run match -- <mind> <mind> [...]: the same for `match`
 *   npm run evaluate -- tournament --notes: the newest tournament pool's ratings into assets/minds/notes.json
 *   npm run evaluate -- --import <provenance.json>: an old tournament run as records (`evaluation-import.mjs`), then its notes
 *
 * A subject is a name the evaluation's catalogue resolves (a mind's id or kind), a JSON file, or
 * JSON; `--mind` names a file to put first. `--against` plays each subject against a panel (the
 * evaluation's own, `default`, or the ids given) and not the panel among itself; an evaluation
 * whose schedule is a panel is played no other way. Rows are kept as they come in
 * `research/runs/evaluations/<evaluation>/` (every file there is read, so machines merge by copying)
 * and found again by key, with every record's under `assets/evaluations/<evaluation>/`. `--previous`
 * names the first subject's parent: the newest recorded version of that id, else that subject here;
 * against a panel it is the baseline of the panel report, and in a battery the subject's figures are
 * read against it, condition by condition. `--ablate` makes the first subject the `--previous` mind
 * with one slot of its skills (`SkillKit`) replaced by the JSON given: `support=null`, `guard={...}`,
 * or one named executor or action, `actions.<name>=null` to remove it.
 * Baseline configurations run on current code. Historical implementations are compared from
 * their saved records with `npm run compare`, without rebuilding them here.
 * `--engine` (or `CORE_ENGINE`) picks the engine unless the protocol fixes one, as the falls fix Rapier.
 * `--write` keeps the run as a record, refused unless every case has a row and the commit holds the
 * files of every case's code unchanged (`caseCoder`).
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
import { CONTROLLERS, MINDS } from "../src/core/mind/controllers.ts";
import { poolsOf } from "../src/evaluation/history.ts";
import { readRecord, recordedSubject, recordIdentity, recordName, recordText, rowOf, sameRow } from "../src/evaluation/record.ts";
import { casesOf, figuresOf, runEvaluation, runOrder, tableOf } from "../src/evaluation/run.ts";
import { batteryComparison, panelReport, slotsOf, verdictOf } from "../src/evaluation/compare.ts";
import { scheduleName } from "../src/evaluation/schedule.ts";
import { tableRatings } from "../src/evaluation/tournament/index.ts";
import { ratedNotes } from "../src/evaluation/tournament/notes.ts";
import { caseNames, partNames } from "../src/evaluation/code.ts";
import { BUILD_IDENTITY, caseCoder, fileTable } from "./build-identity.mjs";
import { importRun } from "./evaluation-import.mjs";
import { belongsTo, resolveSubjects, subjectOf } from "./evaluation-subjects.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

/** The lanes a run takes unless told: all but two of the machine's threads. */
const defaultLanes = () => Math.max(1, availableParallelism() - 2);

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
    // A row that says how long it played is kept over one from before rows said it.
    if (!had || had.played === null && row.played != null) { rows.set(row.key, rowOf(row)); from.set(row.key, name); }
  }
  return rows;
}

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();

/** The commit checked out, or null outside a repository. */
function commitOf() {
  try { return git("rev-parse", "HEAD"); } catch { return null; }
}

/** Every record of evaluation `id`, oldest first by name, read and checked. */
const recordsOf = (id) => filesIn(join(ROOT, "assets/evaluations", id)).map(({ name, text }) => ({ name, ...readRecord(text, name) }));

/** Keep `header` and `lines` as a record of their evaluation: refused where its name holds other content. */
function writeRecord(header, lines) {
  const dir = join(ROOT, "assets/evaluations", header.evaluation), name = join(dir, recordName(header, lines)), text = recordText(header, lines);
  if (existsSync(name)) {
    if (readFileSync(name, "utf8") !== text) throw new Error(`${name} exists with other content`);
    console.log(`${name} holds this record already`);
    return;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(name, text);
  console.log(`wrote ${name}`);
}

const NOTES = join(ROOT, "assets/minds/notes.json");

/**
 * The ratings of the newest tournament record's pool (`poolsOf`), every distinct case of its
 * records once and one strength per version, into the notes (`ratedNotes`) at each id's newest
 * version, dated as the newest record.
 */
function writeNotes() {
  const records = recordsOf("tournament"), newest = records.at(-1);
  if (!newest) throw new Error("no tournament record");
  const pool = poolsOf(records).find((one) => one.key === recordingKey(newest.header.pool));
  const cases = pool.cases.filter(({ line }) => !line.fault).map(({ line, subjects }) => ({ ...line, subjects }));
  const versions = [...new Set(cases.flatMap((line) => line.subjects))].sort();
  const newestOf = new Map([...pool.newest].map(([id, version]) => [version, id]));
  const rated = tableRatings({ subjects: versions.map((one) => ({ id: one })), cases }).flatMap((one) => newestOf.has(one.id) ? [{ ...one, id: newestOf.get(one.id), rating: Math.round(one.rating) }] : []);
  const ids = rated.map((one) => one.id);
  writeFileSync(NOTES, JSON.stringify(ratedNotes(JSON.parse(readFileSync(NOTES, "utf8")), rated, newest.header.date, Object.keys(MINDS)), null, 2) + "\n");
  console.log(`wrote ${NOTES}: ${ids.length} entrants over ${cases.length} bouts of ${basename(newest.name)}'s pool`);
}

/** A 95 % estimate as text. */
/** What `dropped` (`casesOf`) left unplayed, a line for each subject or pair: how many conditions, and every reason once. */
function droppedLines(dropped) {
  const by = new Map();
  for (const one of dropped) {
    const seated = one.subjects.join(" v "), entry = by.get(seated) ?? { count: 0, reasons: new Set() };
    entry.count++; for (const reason of one.reasons) entry.reasons.add(reason);
    by.set(seated, entry);
  }
  return [...by].map(([seated, { count, reasons }]) => `dropped for ${seated}: ${count} condition${count === 1 ? "" : "s"}; ${[...reasons].join("; ")}`);
}

const estimateText = (estimate) => estimate === null ? "none" : `${estimate.value.toFixed(3)} (${estimate.low.toFixed(3)} to ${estimate.high.toFixed(3)})`;

/** Bouts a minute the 10-hour tournament played on the desktop (11,726 in about 10 hours): what a run is priced at before it starts. */
const REFERENCE_RATE = 19;

/**
 * The baseline `previous` names for the subjects of `first` (the first subject asked for), each
 * subject's counterpart by its suffix: another mind as it is now, a mind given whole, or, when it
 * names the subject's own id, that id's newest recorded value that differs from today's, played as
 * given whole (`revived`, each with the recorded version as its parent).
 */
function baselineOf(evaluation, first, previous, chosen, records) {
  const prefix = typeof first === "string" ? first.split("/")[0] : first.id, named = subjectOf(previous);
  const prior = typeof named === "string" ? named : named.id, mine = chosen.filter((one) => belongsTo(one.id, prefix));
  const counterpart = new Map(), revived = new Map();
  if (prior !== prefix) {
    const all = evaluation.subjects([named]);
    for (const one of mine) {
      const other = `${prior}${one.id.slice(prefix.length)}`;
      if (all.some((each) => each.id === other)) counterpart.set(one.id, other);
    }
    const wanted = new Set(counterpart.values());
    return { baseline: all.filter((each) => wanted.has(each.id)), counterpart, revived };
  }
  const baseline = [];
  for (const one of mine) {
    const old = records.flatMap(({ header }) => header.subjects)
      .filter((each) => each.id === one.id && each.value !== null && recordingKey(each.value) !== recordingKey(one.value)).at(-1);
    if (!old) continue;
    const tag = old.version.version.slice(0, 8), id = `${prefix}@${tag}${one.id.slice(prefix.length)}`;
    baseline.push({ id, label: `${old.label} (${tag})`, value: old.value, parts: [] });
    counterpart.set(one.id, id);
    revived.set(one.id, old);
  }
  if (baseline.length === 0) throw new Error(`no earlier value of ${prefix} in a record of ${evaluation.id}: give the previous version as a JSON file`);
  return { baseline, counterpart, revived };
}

/**
 * The order units are played in: each slot's two units in the slots' order, the head-to-head units
 * spread among them, then the rest in the run order; a unit once.
 */
function playOrder(slots, headToHead, units) {
  const order = [], seen = new Set(), add = (unit) => { if (!seen.has(unit[0].key)) { seen.add(unit[0].key); order.push(unit); } };
  const direct = runOrder(headToHead), every = slots.length / Math.max(1, direct.length);
  let next = 0;
  slots.forEach((slot, k) => {
    add(slot.mine); add(slot.theirs);
    while (next < direct.length && next * every <= k) add(direct[next++]);
  });
  direct.slice(next).forEach(add);
  runOrder(units).forEach(add);
  return order;
}

/** A panel report as lines to print: the verdict, then each figure, by member and condition, the worst pairs, stalemates and the head-to-head. */
function reportLines(report, rule, { spent, lost }) {
  const { settled, read, of } = report, number = (x) => x.toFixed(3);
  const state = settled.verdict !== null ? `settled: ${settled.verdict} (${rule.figure}, by ${rule.delta}) at pair ${settled.at} of ${of}`
    : read === of ? `inconclusive: every pair read (${of})`
    : spent ? `inconclusive: the budget ran out at pair ${read} of ${of}`
    : `incomplete: pair ${read + 1} of ${of} has a row missing${lost ? " (lost)" : ""}`;
  return [
    `Panel report: ${state}; ${report.faults} with a fault left out.`, "",
    "| Figure | Subject | Baseline | Difference (95 % interval) |", "|---|---|---|---|",
    ...report.figures.map((f) => `| ${f.figure}, ${f.unit} | ${estimateText(f.subject)} | ${estimateText(f.baseline)} | ${estimateText(f.difference)} |`),
    "", `By member and by condition (${rule.figure}):`, "", "| Held | Pairs | Subject | Baseline | Difference |", "|---|---|---|---|---|",
    ...[...report.members, ...report.conditions].map((h) => `| ${h.by} | ${h.pairs} | ${number(h.subject)} | ${number(h.baseline)} | ${number(h.subject - h.baseline)} |`),
    "", `Worst pairs (${rule.figure}):`, "", "| Subject | Member | Condition | Subject | Baseline |", "|---|---|---|---|---|",
    ...report.worst.map((w) => `| ${w.subject} | ${w.member} | ${recordingKey(w.condition)} | ${number(w.mine)} | ${number(w.theirs)} |`),
    "", `Stalemates (at the cap, both bars full): subject ${estimateText(report.stalemates.subject)}, baseline ${estimateText(report.stalemates.baseline)}`,
    `Head-to-head, subject against baseline on each kit both fit: ${report.headToHead.map((h) => `${h.figure} ${estimateText(h.value)}`).join("; ")} over ${report.headToHead[0]?.pairs ?? 0} pairs`,
  ];
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    subjects: { type: "string" }, mind: { type: "string", multiple: true }, protocol: { type: "string" }, previous: { type: "string" },
    shard: { type: "string" }, workers: { type: "string" }, engine: { type: "string" }, "case-minutes": { type: "string", default: "30" },
    write: { type: "boolean" }, json: { type: "string" }, against: { type: "string" }, import: { type: "string" }, notes: { type: "boolean" },
    until: { type: "string" }, budget: { type: "string", default: "10" }, ablate: { type: "string", multiple: true },
  } });
  if (values.import) {
    for (const { header, lines } of importRun(values.import, ROOT)) writeRecord(header, lines);
    writeNotes();
    return;
  }
  const [id, ...named] = positionals;
  if (values.notes) {
    if (id !== "tournament") throw new Error("--notes reads the tournament's records");
    writeNotes();
    return;
  }
  const evaluation = EVALUATIONS[id];
  if (!evaluation) throw new Error(`name an evaluation: ${Object.keys(EVALUATIONS).join(", ")}`);
  const protocol = values.protocol ?? evaluation.defaultProtocol, cases = evaluation.protocols[protocol];
  if (!cases) throw new Error(`${id} has no protocol ${protocol}: ${Object.keys(evaluation.protocols).join(", ")}`);
  if (cases.engine && values.engine && values.engine !== cases.engine) throw new Error(`${id} ${protocol} is played on ${cases.engine}`);
  const engine = cases.engine ?? values.engine ?? process.env.CORE_ENGINE ?? DEFAULT_ENGINE;
  if (!isEngineName(engine)) throw new Error(`no engine ${engine}`);
  const harness = `Node, core world (src/core/world.ts), ${engine}, 120 Hz`;
  const [shardAt, shards] = values.shard ? values.shard.split("/").map(Number) : [1, 1];
  if (!(Number.isInteger(shardAt) && Number.isInteger(shards) && shardAt >= 1 && shardAt <= shards)) throw new Error("--shard is k/n, 1 <= k <= n");

  const { choice, subjects: chosen } = resolveSubjects(evaluation,
    [...(values.mind ?? []), ...named, ...(values.subjects ? values.subjects.split(",") : [])], values.previous, values.ablate);
  let schedule = { kind: "all" }, panel = [];
  if (values.against) {
    const members = values.against === "default" ? evaluation.analysis.panel : values.against.split(",");
    if (!Array.isArray(members) || members.length === 0) throw new Error(`${id} has no default panel`);
    panel = evaluation.subjects(members);
    schedule = { kind: "versus", panel: panel.map((member) => member.id) };
  } else if (evaluation.schedule === "versus") throw new Error(`${id} is played against a panel: --against default, or --against <id,...>`);
  if (values.until !== undefined && values.until !== "settled") throw new Error("--until takes settled");
  const records = recordsOf(id);
  const { baseline, counterpart, revived } = values.previous && values.against ? baselineOf(evaluation, choice[0], values.previous, chosen, records)
    // A battery plays its baseline beside its subject.
    : { baseline: values.previous && cases.arity === 1 ? evaluation.subjects([subjectOf(values.previous)]) : [], counterpart: new Map(), revived: new Map() };
  if (revived.size > 0) console.log("Baseline configurations run on current code; npm run compare reads historical implementation results from saved records.");
  const panelIds = new Set(schedule.panel ?? []), mine = [...chosen, ...baseline].filter((one) => !panelIds.has(one.id));
  const subjects = [...mine.filter((one, k) => mine.findIndex((other) => other.id === one.id) === k), ...panel];
  const coder = caseCoder(fileTable(), `src/evaluation/${id}/cases.ts`, Object.keys(CONTROLLERS)), environment = coder.environment;
  const code = (world) => coder.code(caseNames(world)).digest, ownCode = (parts) => coder.code(partNames(parts)).own;
  const rule = evaluation.analysis.settle;
  if (counterpart.size > 0 && !rule) throw new Error(`${id} has no rule to settle a comparison on`);
  const { units, dropped } = casesOf(evaluation, protocol, subjects, { engine, code, schedule });
  const pairs = [...counterpart].filter(([subject, other]) => !panelIds.has(subject) && !panelIds.has(other));
  const headToHead = pairs.length > 0 ? casesOf(evaluation, protocol, subjects, { engine, code, schedule: { kind: "pairs", pairs } }).units : [];
  const slots = slotsOf(units, counterpart, schedule.panel ?? []), order = playOrder(slots, headToHead, [...units, ...headToHead]);
  const defined = new Map([...units, ...headToHead].map((unit, k) => [unit[0].key, k]));
  const working = join(ROOT, "research/runs/evaluations", id);
  const rows = rowsFrom([
    ...records.map(({ name, lines }) => ({ name, rows: lines })),
    ...filesIn(working).map(({ name, text }) => ({ name, rows: text.split("\n").filter(Boolean).map((line) => JSON.parse(line)) })),
  ]);

  // Play what has no row: this shard's units, in the play order, until the budget is spent or, asked, the verdict settles.
  const shard = order.filter((_, k) => k % shards === shardAt - 1), lanes = Number(values.workers ?? defaultLanes()), budget = Number(values.budget);
  if (!(budget > 0)) throw new Error("--budget is minutes, more than 0");
  const toPlay = shard.flat().filter((one) => !rows.has(one.key)).length, reused = shard.flat().length - toPlay;
  console.log(`${evaluation.title}: ${protocol}; ${harness}; ${order.length} units, ${toPlay} cases to play, ${reused} found${shards > 1 ? `; shard ${shardAt}/${shards}` : ""}`);
  if (toPlay > 0) console.log(`about ${(toPlay / REFERENCE_RATE).toFixed(0)} min at the 10-hour tournament's rate (${REFERENCE_RATE} bouts a minute); the budget is ${budget} min${values.until ? ", or until the verdict settles" : ""}`);
  const file = join(working, `${hostname()}${shards > 1 ? `-${shardAt}of${shards}` : ""}.jsonl`), lost = [];
  let played = 0, spent = false;
  const started = Date.now(), deadline = started + budget * 60_000;
  /** Whether, asked to stop when settled, the verdict is reached, or every pair is read and it never will be. */
  const settledNow = () => {
    if (values.until !== "settled" || counterpart.size === 0) return false;
    const { read, settled } = verdictOf(slots, rows, evaluation.figures, rule);
    return settled.verdict !== null || read === slots.length;
  };
  if (toPlay > 0) {
    mkdirSync(working, { recursive: true });
    await runEvaluation(shard, rows, {
      evaluation: id, protocol, lanes, minutes: Number(values["case-minutes"]),
      stop: () => (spent ||= Date.now() >= deadline) || settledNow(),
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
  // The complete units in their definition's order, which neither the play order nor the keys change: a summary's digest reads them so.
  const complete = order.filter((unit) => unit.every((one) => rows.has(one.key))).sort((a, b) => defined.get(a[0].key) - defined.get(b[0].key)), commit = commitOf();
  console.log(`${played} played in ${((Date.now() - started) / 1000).toFixed(0)} s; ${lost.length} lost; commit ${commit ?? "unknown"}; build ${BUILD_IDENTITY}; environment ${environment.digest}`);
  if (complete.length < order.length) console.log(`${complete.length} of ${order.length} units have every row${spent ? "; the budget ran out" : ""}${lost.length ? "; run again to retry the lost" : ""}`);

  // Each subject's version; its parent its counterpart's, or, asked without a panel, the newest recorded version of that id.
  const recorded = new Map(subjects.map((subject) => [subject.id, recordedSubject(subject, cases.play, environment.digest, null, ownCode)]));
  for (const [subject, other] of counterpart)
    recorded.set(subject, recordedSubject(subjects.find((one) => one.id === subject), cases.play, environment.digest, revived.get(subject) ?? recorded.get(other), ownCode));
  if (values.previous && counterpart.size === 0) {
    const first = recorded.get(subjects[0].id);
    const previous = baseline[0]?.id ?? values.previous;
    const parent = records.flatMap(({ header }) => header.subjects).filter((one) => one.id === previous && one.version.version !== first.version.version).at(-1)
      ?? [...recorded.values()].find((one) => one.id === previous && one !== first) ?? null;
    if (!parent) throw new Error(`no version of ${previous} in a record of ${id} or among the subjects`);
    recorded.set(subjects[0].id, recordedSubject(subjects[0], cases.play, environment.digest, parent, ownCode));
  }
  const date = new Date().toISOString().slice(0, 10), heads = [...recorded.values()];
  const header = {
    identity: recordIdentity(BUILD_IDENTITY, engine, harness, cases.play), evaluation: id, protocol, play: cases.play, engine, harness,
    commit, date, schedule: [schedule, ...pairs.length ? [{ kind: "pairs", pairs }] : []].map(scheduleName).join("; "),
    pool: { protocol: heads[0].version.protocol, environment: environment.digest }, subjects: heads,
  };
  const lines = complete.flat().map(({ subjects: seated, condition, key, code, world }) => ({ subjects: seated, condition, key, code, world, ...rowOf(rows.get(key)) }));
  const { faults } = tableOf(subjects, complete, rows), figures = figuresOf(evaluation, subjects, complete, rows);
  // The summary reads the complete units with no fault; a unit with one is named above it and left out.
  const clean = complete.filter((unit) => unit.every((one) => !rows.get(one.key).fault)), { table } = tableOf(subjects, clean, rows);
  console.log(`protocol ${header.pool.protocol}`);
  for (const one of heads) console.log(`${one.id}: version ${one.version.version}${one.parent ? `, parent ${one.parent.id} ${one.parent.version.version} (${one.changes.join(", ") || "no change"})` : ""}`);
  console.log("\n| Subject | Figure | Units | Value (95 % interval) |\n|---|---|---|---|");
  for (const f of figures) console.log(`| ${f.subject} | ${f.figure}, ${f.unit} | ${f.units} | ${estimateText(f.estimate)} |`);
  for (const fault of faults) console.log(`fault (${fault.fault.kind}) in ${fault.key}: ${fault.fault.message}`);
  for (const line of droppedLines(dropped)) console.log(line);
  const report = counterpart.size > 0 ? panelReport(slots, headToHead, rows, evaluation.figures, rule) : null;
  if (report) console.log("\n" + reportLines(report, rule, { spent, lost: lost.length }).join("\n"));
  if (cases.arity === 1 && values.previous && baseline.length > 0 && baseline[0].id !== subjects[0].id) {
    const compared = batteryComparison(table, subjects[0].id, baseline[0].id, evaluation.figures);
    console.log(`\n${subjects[0].id} less ${baseline[0].id}, condition by condition, over the ${compared.conditions} both played` +
      `${compared.only.subject + compared.only.baseline ? ` (${compared.only.subject} the subject's alone, ${compared.only.baseline} the baseline's)` : ""}:\n`);
    console.log("| Figure | Better | Pairs | Difference (95 % interval) |\n|---|---|---|---|");
    for (const f of compared.figures) console.log(`| ${f.figure}, ${f.unit} | ${f.better} | ${f.pairs} | ${estimateText(f.difference)} |`);
  }
  const summary = clean.length === 0 ? null : evaluation.summary(table);
  if (clean.length < complete.length) console.log(`\n${complete.length - clean.length} of ${complete.length} complete units have a fault and are left out of the summary`);
  if (summary) console.log("\n" + summary.lines.join("\n"));
  else console.log(`\nno summary: ${complete.length === 0 ? "no unit is complete" : "every complete unit has a fault"}`);
  if (values.json) writeFileSync(values.json, JSON.stringify({ header, figures, report, summary: summary?.json ?? null, dropped, cases: lines }, null, 2) + "\n");
  if (lost.length > 0 && shards === 1) process.exitCode = 1;

  if (values.write) {
    if (!commit) throw new Error("a record needs a commit");
    if (lines.length === 0) throw new Error("a record needs a complete unit");
    const files = new Set(lines.flatMap(({ world }) => coder.code(caseNames(world)).files));
    const changed = git("status", "--porcelain", "--", ...[...files].filter((one) => !one.startsWith("node_modules/")));
    if (changed) throw new Error(`a record's code is its commit's: these differ or are untracked:\n${changed}`);
    writeRecord(header, lines);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
