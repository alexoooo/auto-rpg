import { isRefused } from "../src/core/refusal.ts";
import "../tests/harness/preload-data.mjs";
/**
 * **Evaluate**: an evaluation's cases for its subjects, each played only where no row has its key,
 * on worker threads; then what the complete rows give each subject, and the evaluation's summary.
 * `--write` keeps what they give as the evaluation's results (`src/evaluation/results.ts`).
 *
 *   npm run evaluate -- <evaluation> [subject ...] [--subjects <id> ...] [--mind <file.json>] [--protocol <name>]
 *     [--against default|<id> ...] [--previous <id>] [--ablate <slot>=<JSON> ...] [--shard k/n] [--workers N] [--engine <name>]
 *     [--case-minutes 30] [--write] [--json <file>]
 *   npm run match -- <mind> <mind> [...]: the same for `match`
 *   npm run evaluate -- tournament --notes: the tournament's standings into assets/minds/notes.json
 *   npm run evaluate -- table [...]: the table of every body, loadout and skill (`scripts/table.mjs`)
 *
 * A subject is a name the evaluation's catalogue resolves (a mind's id or kind), a JSON file, or
 * JSON; `--mind` names a file to put first. A name ending in `+<skill>/<variation>`, one or more, is
 * that subject with its bodies holding those variations in place of their characters' own of the
 * same skills (`variedSubjects`): `strike option/straight-punch+straight-punch/from-guard`. `--against` plays each subject against a panel (the
 * evaluation's own, `default`, or the ids given, one per flag) and not the panel among itself; an evaluation
 * whose schedule is a panel is played no other way. Rows are kept as they come in
 * `.tmp/evaluations/<evaluation>/<commit>/` (every file there is read, so machines on one commit
 * merge by copying), work `npm run clean` deletes once a day untouched, and found again by key: a
 * run on another commit finds none of them. Where a build input differs from the commit or is
 * untracked, no row is kept or found and every case plays. `--previous` names the
 * first subject's baseline, another mind or a mind given whole as a JSON file: against a panel it is
 * the baseline of the panel report, and in a battery the subject's figures are read against it,
 * condition by condition. `--ablate` makes the first subject the `--previous` mind with one slot or
 * setting of its parts replaced by the JSON given: an Option's, by its kind
 * (`options.strike-straight-punch.support=null`, `options.strike-stomp=null` to remove it), or a
 * part passed in under its skills (`tuning.parts.guard={...}`).
 * An evaluation that plays every protocol (`Evaluation.every`: the baseline) plays each in turn, a
 * report and its results each, unless `--protocol` names one.
 * `--engine` (or `CORE_ENGINE`) picks the engine unless the protocol fixes one; the game's, `DEFAULT_ENGINE`, where neither does.
 * `--write` keeps each subject's reading as its newest result on the protocol, with a trial's row
 * where the evaluation names outcomes or the table reads the subject (`keep`), and a contest's
 * standings where the run plays every pair: refused unless a unit is complete and no build input
 * differs from the commit, before or after the run, so the commit a result names is its code's.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism, hostname } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { Worker } from "node:worker_threads";
import { DEFAULT_ENGINE, isEngineName } from "../src/core/physics/engines.ts";
import { recordingKey } from "../src/core/world/recording.ts";
import { EVALUATIONS, tableCells } from "../src/app/node/evaluation.ts";
import { MINDS } from "../src/app/catalog.ts";
import { caseName, harnessOf, rounded, roundedEstimate, withResult, withStandings } from "../src/evaluation/results.ts";
import { indexRows } from "../src/evaluation/rows.ts";
import { standingsOf } from "../src/evaluation/standings.ts";
import { keep } from "../src/evaluation/table/judge.ts";
import { COMMAND_DELAY } from "../src/core/world/world.ts";
import { boutSeedsOf, casesOf, figuresOf, runEvaluation, runOrder, senseDelaysOf, tableOf } from "../src/evaluation/run.ts";
import { batteryComparison, panelReport, slotsOf, verdictOf } from "../src/evaluation/compare.ts";
import { scheduleName } from "../src/evaluation/schedule.ts";
import { ratedNotes } from "../src/evaluation/tournament/notes.ts";
import { BUILD_IDENTITY, uncommittedInputs } from "./build-identity.mjs";
import { resultsOf, writeResults } from "./evaluation-results.mjs";
import { belongsTo, resolveSubjects, subjectOf } from "./evaluation-subjects.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The lanes a run takes unless told: all but two of the machine's threads. */
const defaultLanes = () => Math.max(1, availableParallelism() - 2);

/** Every `.jsonl` file in `directory`, by name, with its text. */
const filesIn = (directory) => existsSync(directory)
  ? readdirSync(directory).filter((name) => name.endsWith(".jsonl")).sort().map((name) => ({ name: join(directory, name), text: readFileSync(join(directory, name), "utf8") }))
  : [];

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();

/** The commit checked out, or null outside a repository. */
function commitOf() {
  try { return git("rev-parse", "HEAD"); } catch { return null; }
}

const NOTES = join(ROOT, "assets/minds/notes.json");

/** The tournament's standings into the notes (`ratedNotes`), each rating at its entrant's leaf, dated as the standings. */
function writeNotes() {
  const evaluation = EVALUATIONS.tournament, standings = resultsOf("tournament").standings.find((one) => one.protocol === evaluation.defaultProtocol);
  if (!standings) throw new Error("the tournament keeps no standings");
  const rated = standings.rows.map((one) => ({ ...one, rating: Math.round(one.rating) }));
  writeFileSync(NOTES, JSON.stringify(ratedNotes(JSON.parse(readFileSync(NOTES, "utf8")), rated, standings.date, Object.keys(MINDS)), null, 2) + "\n");
  console.log(`wrote ${NOTES}: ${rated.length} entrants over the ${standings.bouts} bouts of ${standings.commit} ${standings.date}`);
}

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

/** A 95 % estimate as text. */
const estimateText = (estimate) => estimate === null ? "none" : `${estimate.value.toFixed(3)} (${estimate.low.toFixed(3)} to ${estimate.high.toFixed(3)})`;

/** Bouts a minute the 10-hour tournament played on the desktop (11,726 in about 10 hours): what a run is priced at before it starts. */
const REFERENCE_RATE = 19;

/**
 * The baseline `previous` names for the subjects of `first` (the first subject asked for), each
 * subject's counterpart by its suffix: another mind as it is now, or a mind given whole.
 */
function baselineOf(evaluation, first, previous, chosen) {
  const prefix = typeof first === "string" ? first.split("/")[0] : first.id, named = subjectOf(previous);
  const prior = typeof named === "string" ? named : named.id, mine = chosen.filter((one) => belongsTo(one.id, prefix));
  if (prior === prefix) throw new Error(`--previous names ${prefix} itself: give the previous version as a JSON file`);
  const counterpart = new Map(), all = evaluation.subjects([named]);
  for (const one of mine) {
    const other = `${prior}${one.id.slice(prefix.length)}`;
    if (all.some((each) => each.id === other)) counterpart.set(one.id, other);
  }
  const wanted = new Set(counterpart.values());
  return { baseline: all.filter((each) => wanted.has(each.id)), counterpart };
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
    subjects: { type: "string", multiple: true }, mind: { type: "string", multiple: true }, protocol: { type: "string" }, previous: { type: "string" },
    shard: { type: "string" }, workers: { type: "string" }, engine: { type: "string" }, "case-minutes": { type: "string", default: "30" },
    write: { type: "boolean" }, json: { type: "string" }, against: { type: "string", multiple: true }, notes: { type: "boolean" },
    until: { type: "string" }, budget: { type: "string", default: "10" }, ablate: { type: "string", multiple: true },
  } });
  const [id, ...named] = positionals;
  if (values.notes) {
    if (id !== "tournament") throw new Error("--notes reads the tournament's standings");
    writeNotes();
    return;
  }
  const evaluation = EVALUATIONS[id];
  if (!evaluation) throw new Error(`name an evaluation: ${Object.keys(EVALUATIONS).join(", ")}`);
  const protocols = values.protocol ? [values.protocol] : evaluation.every ? Object.keys(evaluation.protocols) : [evaluation.defaultProtocol];
  for (const protocol of protocols) await runProtocol(evaluation, id, protocol, named, values);
}

/** Play `protocol` of `evaluation` (named `id`) for the subjects `named` and the command's options `values`: report it, and with `--write` keep its results. */
async function runProtocol(evaluation, id, protocol, named, values) {
  const cases = evaluation.protocols[protocol];
  if (!cases) throw new Error(`${id} has no protocol ${protocol}: ${Object.keys(evaluation.protocols).join(", ")}`);
  if (cases.engine && values.engine && values.engine !== cases.engine) throw new Error(`${id} ${protocol} is played on ${cases.engine}`);
  const engine = cases.engine ?? values.engine ?? process.env.CORE_ENGINE ?? DEFAULT_ENGINE;
  if (!isEngineName(engine)) throw new Error(`no engine ${engine}`);
  const harness = harnessOf(engine, cases.timing?.delay ?? COMMAND_DELAY.value, cases.timing?.hz);
  const [shardAt, shards] = values.shard ? values.shard.split("/").map(Number) : [1, 1];
  if (!(Number.isInteger(shardAt) && Number.isInteger(shards) && shardAt >= 1 && shardAt <= shards)) throw new Error("--shard is k/n, 1 <= k <= n");

  const { choice, subjects: chosen } = resolveSubjects(evaluation,
    [...(values.mind ?? []), ...named, ...(values.subjects ?? [])], values.previous, values.ablate);
  let schedule = { kind: "all" }, panel = [];
  if (values.against) {
    const members = [...new Set(values.against.flatMap((id) => id === "default" ? evaluation.analysis.panel ?? [] : [id]))];
    if (!Array.isArray(members) || members.length === 0) throw new Error(`${id} has no default panel`);
    panel = evaluation.subjects(members);
    schedule = { kind: "versus", panel: panel.map((member) => member.id) };
  } else if (evaluation.schedule === "versus") throw new Error(`${id} is played against a panel: --against default, or repeat --against <id>`);
  if (values.until !== undefined && values.until !== "settled") throw new Error("--until takes settled");
  const { baseline, counterpart } = values.previous && values.against ? baselineOf(evaluation, choice[0], values.previous, chosen)
    // A battery plays its baseline beside its subject.
    : { baseline: values.previous && cases.arity === 1 ? evaluation.subjects([subjectOf(values.previous)]) : [], counterpart: new Map() };
  const panelIds = new Set(schedule.panel ?? []), mine = [...chosen, ...baseline].filter((one) => !panelIds.has(one.id));
  const subjects = [...mine.filter((one, k) => mine.findIndex((other) => other.id === one.id) === k), ...panel];
  const rule = evaluation.analysis.settle;
  if (counterpart.size > 0 && !rule) throw new Error(`${id} has no rule to settle a comparison on`);
  const selected = casesOf(evaluation, protocol, subjects, { engine, schedule });
  if (isRefused(selected)) throw new Error(selected.refused);
  const { units, dropped } = selected;
  const pairs = [...counterpart].filter(([subject, other]) => !panelIds.has(subject) && !panelIds.has(other));
  const paired = pairs.length > 0 ? casesOf(evaluation, protocol, subjects, { engine, schedule: { kind: "pairs", pairs } }) : { units: [] };
  if (isRefused(paired)) throw new Error(paired.refused);
  const headToHead = paired.units;
  const slots = slotsOf(units, counterpart, schedule.panel ?? []), order = playOrder(slots, headToHead, [...units, ...headToHead]);
  const defined = new Map([...units, ...headToHead].map((unit, k) => [unit[0].key, k]));
  // Rows are kept under the commit they are played on, and only where it is the code they play.
  const commit = commitOf(), changed = commit ? uncommittedInputs() : [];
  const working = commit && changed.length === 0 ? join(ROOT, ".tmp/evaluations", id, commit.slice(0, 12)) : null;
  if (!working) console.log(`${commit ? `${changed.length} build inputs differ from the commit` : "no commit"}: no row is kept or found, and every case plays`);
  const rows = indexRows((working ? filesIn(working) : []).map(({ name, text }) => ({ name, rows: text.split("\n").filter(Boolean).map((line) => JSON.parse(line)) })));

  // Play what has no row: this shard's units, in the play order, until the budget is spent or, asked, the verdict settles.
  const shard = order.filter((_, k) => k % shards === shardAt - 1), lanes = Number(values.workers ?? defaultLanes()), budget = Number(values.budget);
  if (!(budget > 0)) throw new Error("--budget is minutes, more than 0");
  const toPlay = shard.flat().filter((one) => !rows.has(one.key)).length, reused = shard.flat().length - toPlay;
  console.log(`${evaluation.title}: ${protocol}; ${harness}; ${order.length} units, ${toPlay} cases to play, ${reused} found${shards > 1 ? `; shard ${shardAt}/${shards}` : ""}`);
  if (toPlay > 0) console.log(`about ${(toPlay / REFERENCE_RATE).toFixed(0)} min at the 10-hour tournament's rate (${REFERENCE_RATE} bouts a minute); the budget is ${budget} min${values.until ? ", or until the verdict settles" : ""}`);
  const file = working && join(working, `${hostname()}${shards > 1 ? `-${shardAt}of${shards}` : ""}.jsonl`), lost = [];
  let played = 0, spent = false;
  const started = Date.now(), deadline = started + budget * 60_000;
  /** Whether, asked to stop when settled, the verdict is reached, or every pair is read and it never will be. */
  const settledNow = () => {
    if (values.until !== "settled" || counterpart.size === 0) return false;
    const { read, settled } = verdictOf(slots, rows, evaluation.figures, rule);
    return settled.verdict !== null || read === slots.length;
  };
  if (toPlay > 0) {
    if (working) mkdirSync(working, { recursive: true });
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
        if (file) appendFileSync(file, JSON.stringify(row) + "\n");
        rows.set(row.key, row);
        if (++played === Math.min(lanes, toPlay) && toPlay > played)
          console.log(`about ${(((Date.now() - started) / played) * (toPlay - played) / 60_000).toFixed(1)} min more for ${toPlay - played} cases`);
      },
      onLost: (job, reason) => { lost.push({ key: job.key, reason }); console.log(`lost ${job.key}: ${reason}`); },
    });
  }
  // The complete units in their definition's order, which neither the play order nor the keys change: a summary's digest reads them so.
  const complete = order.filter((unit) => unit.every((one) => rows.has(one.key))).sort((a, b) => defined.get(a[0].key) - defined.get(b[0].key));
  console.log(`${played} played in ${((Date.now() - started) / 1000).toFixed(0)} s; ${lost.length} lost; commit ${commit ?? "unknown"}; build ${BUILD_IDENTITY}`);
  if (complete.length < order.length) console.log(`${complete.length} of ${order.length} units have every row${spent ? "; the budget ran out" : ""}${lost.length ? "; run again to retry the lost" : ""}`);

  const date = new Date().toISOString().slice(0, 10);
  const head = { evaluation: id, protocol, engine, harness, commit, date, schedule: [schedule, ...pairs.length ? [{ kind: "pairs", pairs }] : []].map(scheduleName).join("; "),
    subjects: subjects.map((subject) => ({ id: subject.id, label: subject.label })) };
  const lines = complete.flat().map(({ subjects: seated, condition, world, key }) => ({ subjects: seated, condition, world, ...rows.get(key) }));
  const { faults } = tableOf(subjects, complete, rows), figures = figuresOf(evaluation, subjects, complete, rows);
  // The summary reads the complete units with no fault; a unit with one is named above it and left out.
  const clean = complete.filter((unit) => unit.every((one) => !rows.get(one.key).fault)), { table } = tableOf(subjects, clean, rows);
  const delays = senseDelaysOf(complete);
  if (delays.length > 0) console.log(`reaction time ${delays.map((seconds) => `${seconds} s`).join(", ")}; bout seeds ${boutSeedsOf(complete).join(", ")}`);
  console.log("\n| Subject | Figure | Units | Value (95 % interval) |\n|---|---|---|---|");
  // An evaluation of every protocol reads each figure on its own protocol's readings alone: the others' are empty there.
  for (const f of figures) if (!evaluation.every || f.units > 0) console.log(`| ${f.subject} | ${f.figure}, ${f.unit} | ${f.units} | ${estimateText(f.estimate)} |`);
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
  if (values.json) writeFileSync(values.json, JSON.stringify({ header: head, figures, report, summary: summary?.json ?? null, dropped, cases: lines }, null, 2) + "\n");
  if (lost.length > 0 && shards === 1) process.exitCode = 1;

  if (values.write) {
    if (!commit) throw new Error("a result needs a commit");
    if (lines.length === 0) throw new Error("a result needs a complete unit");
    const differ = [...new Set([...changed, ...uncommittedInputs()])];
    if (differ.length > 0) throw new Error(`a result's code is its commit's: these build inputs differ or are untracked:\n${differ.join("\n")}`);
    const read = { commit: commit.slice(0, 8), date, harness };
    let results = resultsOf(id);
    if (cases.arity === 2) {
      if (schedule.kind !== "all") throw new Error("a contest keeps its standings from a run of every pair: no --against");
      results = withStandings(results, { protocol, ...read, bouts: clean.flat().length, rows: standingsOf(clean.flat().map((one) => ({ subjects: one.subjects, reading: rows.get(one.key).reading }))) });
    } else for (const subject of head.subjects) {
      const mine = complete.flat().filter((one) => one.subjects.length === 0 || one.subjects.includes(subject.id)), played = mine.filter((one) => !rows.get(one.key).fault);
      if (mine.length === 0) continue;
      const judged = TABLE_READINGS.find((one) => one.drill === id && one.protocol === protocol && one.subject === subject.id) ?? null;
      const trials = evaluation.outcome || judged ? trialRows(evaluation, mine.map((one) => rows.get(one.key)), judged) : null;
      results = withResult(results, { protocol, subject: subject.id, label: subject.label, ...read, count: played.length,
        figures: Object.fromEntries(figures.flatMap((one) => one.subject === subject.id && one.estimate ? [[one.figure, roundedEstimate(one.estimate)]] : [])),
        ...trials }, trials ? mine.map((one) => caseName(one.condition)) : undefined);
    }
    writeResults(id, results);
    console.log(`kept in assets/evaluations/${id}.json`);
  }
}

/**
 * Every reading the table makes (`tableCells`), and each one's on its protocol's training twin
 * (`Cases.twin`), research's: a subject either reads keeps what its judge needs of each trial.
 */
const TABLE_READINGS = tableCells().flatMap((cell) => cell.readings).flatMap((reading) => {
  const twin = EVALUATIONS[reading.drill]?.protocols[reading.protocol]?.twin;
  return twin ? [reading, { ...reading, protocol: twin }] : [reading];
});

/**
 * A result's trial rows for the played `rows` of `evaluation` (`Result.trials`): how long each
 * played, its outcome by its index among the outcomes met, and what `judged`, the table's reading
 * of the subject, keeps of it (`keep`) where there is one; null for a fault.
 */
function trialRows(evaluation, rows, judged) {
  const outcomes = [], indexOf = (outcome) => {
    const at = outcomes.findIndex((one) => one.label === outcome.label && one.passed === outcome.passed);
    return at >= 0 ? at : outcomes.push({ label: outcome.label, passed: outcome.passed }) - 1;
  };
  const trials = rows.map((row) => row.fault !== null ? null
    : [row.played === null ? null : rounded(row.played), evaluation.outcome ? indexOf(evaluation.outcome(row.reading)) : null, ...(judged ? keep(judged, row.reading) : [])]);
  return { outcomes, trials };
}

// `table` reads the table of every body, loadout and skill (`scripts/table.mjs`).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === "table") (await import("./table.mjs")).main();
  else await main();
}
