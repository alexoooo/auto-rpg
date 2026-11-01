/**
 * **A skill's settings searched on one body**, for its record (`SkillRecord`,
 * `src/core/skills/framework/records.ts`): diagonal CMA (`cma.mjs`) over the settings that shape
 * its motion (`SEARCHES`), from the body's record where it has one and the Warrior's where not, the
 * rest held at the start's, each candidate played on its task's trials on that body and scored by
 * their mean. `--confirm` then plays the start and the search's best on fresh trials (other gaps)
 * and keeps the better: the best only where it scores above the start there with no more falls;
 * with `--write`, that is the body's row (`writeRecord`, `research/skill-records.mjs`), saying how it
 * was made.
 *
 * - The front kick: the Strike drill's `kicking` rung (`STRIKE_CASES`, `src/evaluation/strike/cases.ts`),
 *   each foot at the middle of a Warrior, a Skeleton and a Reptile lying limp from two gaps, thrown
 *   by Option Mind's low kick (`src/entrants/option/mind.ts`); a
 *   trial scores the drill's bar (`barScore`: -3 a fall, -1 nothing on the mark, 9 landed) and 5 a
 *   hit point the kick dealt.
 * - The stomp: the Strike drill's `stomping` rung, each foot at the middle of a Warrior and a
 *   Skeleton lying limp from its gaps, thrown by Option Mind's stomp (`src/entrants/option/mind.ts`);
 *   scored as the kick.
 *
 * A body with no record of its own starts from the Warrior's, its lengths (`SEARCHES`' `lengths`,
 * m) scaled by the body's stature over his. `--until` ends the search once its best scores that
 * much, `--patience` once that many generations have not raised it. `--try` plays the start
 * alone on the search's trials and saves it as a search's result (no generation), for `--confirm`
 * to keep where it serves.
 *
 *   node research/skill-search.mjs <skill> <model> --out <file.json> [--generations 10] [--lambda 16] [--sigma 0.2] [--until <score>] [--patience <generations>] [--workers N] [--seed 1] [--resume]
 *   node research/skill-search.mjs <skill> <model> --out <file.json> --try
 *   node research/skill-search.mjs <skill> <model> --confirm <file.json> [--write [--from "<what the search started from>"]]
 *
 * Harness: Node, the bout world (`buildBout`) on Rapier (`DEFAULT_ENGINE`), 120 Hz.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { execSync } from "node:child_process";
import { isMainThread, parentPort, workerData } from "node:worker_threads";
import "../tests/harness/preload-data.mjs";
import { buildBout } from "../src/evaluation/bout.ts";
import { STRIKE_CASES } from "../src/evaluation/strike/cases.ts";
import { barScore } from "../src/evaluation/strike/score.ts";
import { OPTION_MIND } from "../src/core/option/mind.ts";
import { modelSpec } from "../src/core/models.ts";
import { bodyKey } from "../src/core/spec/body.ts";
import { cmaSearch, workerPool } from "./cma.mjs";
import { recordsOf, writeRecord } from "./skill-records.mjs";

const WARRIOR = "workshop-fighter+toes";

/** A mind throwing the front kick with `settings` at the trunk's middle: Option Mind's Skeleton preset's, on any body. */
const kicker = (settings) => ({ ...OPTION_MIND.defaults, support: { kind: "support-fold" },
  executors: [{ name: "low-kick", kind: "front-kick", tuning: settings }],
  actions: [{ name: "low-kick", executor: "low-kick", effectors: ["foot.right", "foot.left"], regions: [{ kind: "mark", mark: "middle" }], aim: { kind: "centre", lead: 0 } }] });

/** One kicking trial of whole `settings`: the drill's bar and the hit points dealt. */
async function kickTrial(settings, { condition }) {
  const reading = await play(STRIKE_CASES.kicking, { mind: kicker(settings), action: "low-kick" }, condition);
  const dealt = reading.contacts.reduce((sum, contact) => sum + contact.damage, 0);
  return { score: barScore(reading, null) + 5 * dealt, outcome: reading.outcome, down: reading.down, dealt };
}

/** A mind throwing the stomp with `settings` at the middle of a body lying ahead: Option Mind's stomp, on any body. */
const stomper = (settings) => ({ ...OPTION_MIND.defaults, support: { kind: "support-fold" },
  executors: [{ name: "stomp", kind: "stomp", tuning: settings }],
  actions: [{ name: "stomp", executor: "stomp", effectors: ["foot.right", "foot.left"], regions: [{ kind: "mark", mark: "middle" }], aim: { kind: "centre", lead: 0 } }] });

/** One stomping trial of whole `settings`: the drill's bar and the hit points dealt. */
async function stompTrial(settings, { condition }) {
  const reading = await play(STRIKE_CASES.stomping, { mind: stomper(settings), action: "stomp" }, condition);
  const dealt = reading.contacts.reduce((sum, contact) => sum + contact.damage, 0);
  return { score: barScore(reading, null) + 5 * dealt, outcome: reading.outcome, down: reading.down, dealt };
}

/** The stomping rung's trials on `model`: each foot at each target from each gap. */
const stompTrials = (model, gaps) => STRIKE_CASES.stomping.conditions.filter((c) => c.model === "workshop-fighter")
  .flatMap((c) => gaps.map((gap) => ({ condition: { ...c, model, gap } }))).filter((t, i, all) => all.findIndex((u) => JSON.stringify(u) === JSON.stringify(t)) === i);

/** The kicking rung's trials on `model`: each foot at each target from each gap. */
const kickTrials = (model, gaps) => STRIKE_CASES.kicking.conditions.filter((c) => c.model === "crypt-skeleton")
  .flatMap((c) => gaps.map((gap) => ({ condition: { ...c, model, gap } }))).filter((t, i, all) => all.findIndex((u) => JSON.stringify(u) === JSON.stringify(t)) === i);

/**
 * **What each skill's search plays**: the settings it searches, each with its range (the rest the
 * start's), the trials it searches on and confirms on (`gaps`, m), a trial's score, and its
 * settings that are lengths (`lengths`, m), scaled to a body that starts from the Warrior's.
 */
const SEARCHES = {
  "front-kick": { dims: [["contactSpeed", 1.5, 9], ["swingSeconds", .2, .5], ["lift", .2, .6], ["windup", 0, .2], ["alongNear", .1, .5], ["alongFar", .4, .9], ["returnNear", .04, .15]],
    trials: kickTrials, search: [.8, 1.2], confirm: [.9, 1, 1.1], trial: kickTrial, lengths: ["lift", "windup", "alongNear", "alongFar", "across", "returnNear"],
    task: "the Strike drill's kicking rung (each foot at the middle mark of a Warrior, a Skeleton and a Reptile lying limp)" },
  stomp: { dims: [["contactSpeed", 3, 9], ["swingSeconds", .15, .4], ["lift", .4, .9], ["over", .6, 1.2], ["alongNear", .35, .7], ["alongFar", .6, 1], ["chamberSeconds", .4, .8]],
    trials: stompTrials, search: [.8, 1.2], confirm: [.9, 1, 1.1], trial: stompTrial, lengths: ["lift", "windup", "alongNear", "alongFar", "across", "returnNear"],
    task: "the Strike drill's stomping rung (each foot at the middle mark of a Warrior and a Skeleton lying limp)" },
};

/** Play `subject` (a tuning, or a strike subject) on `condition` of `cases` to its reader's end. */
async function play(cases, subject, condition) {
  const world = cases.world([subject], condition, undefined, [{}]);
  const built = await buildBout(world.recipe, { hz: 120 });
  try {
    const reader = cases.read(built, condition);
    built.duel.play(world.tape);
    while (!reader.ended) {
      if (built.duel.clock > cases.seconds + 5) throw new Error("the trial ran past its seconds");
      built.world.step();
      reader.afterStep();
    }
    return reader.reading();
  } finally { built.dispose(); }
}

/** The settings a search starts from on `model`: its body's record, else the Warrior's with its lengths scaled by the body's stature over his. */
function startOf(skill, model) {
  const records = recordsOf(skill), spec = modelSpec(model), own = records[bodyKey(spec)];
  if (own) return structuredClone(own.settings);
  const start = structuredClone(records[WARRIOR].settings), scale = spec.stature.value / modelSpec("workshop-fighter").stature.value;
  for (const key of SEARCHES[skill].lengths ?? []) if (typeof start[key] === "number") start[key] = Number((start[key] * scale).toFixed(4));
  return start;
}

/** `settings` with the searched dimensions set from `u` in the unit cube; alongFar kept past alongNear. */
function decode(search, start, u) {
  const out = { ...start };
  search.dims.forEach(([key, lo, hi], i) => { out[key] = Number((lo + (hi - lo) * Math.min(1, Math.max(0, u[i]))).toFixed(4)); });
  if ("alongFar" in out && out.alongFar <= out.alongNear + .1) out.alongFar = Number((out.alongNear + .1).toFixed(4));
  return out;
}

/** Each of `trials` of `settings`, played on the pool, and their mean score. */
async function scored(pool, settings, trials) {
  const each = await Promise.all(trials.map((trial) => pool.evaluate({ settings, trial })));
  const error = each.find((r) => r.error);
  return { score: each.reduce((sum, r) => sum + r.score, 0) / each.length, falls: each.filter((r) => r.felled || r.down).length, each, ...(error ? { error: error.error } : {}) };
}

if (!isMainThread && workerData?.search) {
  const search = SEARCHES[workerData.skill];
  parentPort.on("message", async ({ id, x }) => {
    let r; try { r = await search.trial(x.settings, x.trial); } catch (error) { r = { score: -3, error: String(error?.stack ?? error) }; }
    parentPort.postMessage({ id, r });
  });
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values, positionals: [skill, model] } = parseArgs({ allowPositionals: true, options: { out: { type: "string" }, confirm: { type: "string" }, write: { type: "boolean" },
    from: { type: "string" }, generations: { type: "string" }, lambda: { type: "string" }, sigma: { type: "string" }, workers: { type: "string" }, seed: { type: "string" }, resume: { type: "boolean" },
    until: { type: "string" }, patience: { type: "string" }, try: { type: "boolean" } } });
  const search = SEARCHES[skill];
  if (!search || !model) throw new Error(`usage: <skill> <model>, skill one of ${Object.keys(SEARCHES).join(", ")}`);
  const workers = Number(values.workers ?? Math.max(1, availableParallelism() - 4));
  const pool = workerPool(fileURLToPath(import.meta.url), { search: true, skill }, workers);
  const body = bodyKey(modelSpec(model)), started = Date.now();
  if (values.confirm) {
    const found = JSON.parse(readFileSync(values.confirm, "utf8")), trials = search.trials(model, search.confirm);
    const start = await scored(pool, found.start, trials), best = await scored(pool, found.best.settings, trials);
    const kept = best.score > start.score && best.falls <= start.falls ? "best" : "start";
    const report = { skill, body, trials: trials.length, gaps: search.confirm, start: { score: start.score, falls: start.falls, each: start.each }, best: { score: best.score, falls: best.falls, each: best.each }, kept,
      seconds: Math.round((Date.now() - started) / 1000) };
    console.log(JSON.stringify(report));
    if (values.write) {
      const commit = execSync("git rev-parse --short=8 HEAD").toString().trim(), settings = kept === "best" ? found.best.settings : found.start;
      const fmt = (x) => x.toFixed(3);
      writeRecord(skill, body, `Searched on the ${body.replace("+toes", "")} at ${commit} (research/skill-search.mjs): CMA over ${search.dims.map(([key]) => key).join(", ")} from ${values.from ?? found.from}, `
        + `${found.log.length} generations of ${found.lambda}, on ${search.task} from ${search.search.join(", ")} m, ${found.trials} trials a candidate, ${found.seconds} s; `
        + `on fresh trials from ${search.confirm.join(", ")} m the search's best scored ${fmt(best.score)} (${best.falls} falls) and its start ${fmt(start.score)} (${start.falls} falls): `
        + (kept === "best" ? "the best is kept." : "the start is kept."), settings);
      console.log(`${skill}: ${body}'s row written`);
    }
    await pool.terminate();
    process.exit(0);
  }
  if (!values.out) throw new Error("--out <file.json>");
  const start = startOf(skill, model), trials = search.trials(model, search.search), lambda = Number(values.lambda ?? 16), generations = Number(values.generations ?? 10);
  const from = recordsOf(skill)[body] ? `the ${body.replace("+toes", "")}'s record` : `the Warrior's record${search.lengths ? ", its lengths scaled by the body's stature" : ""}`;
  if (values.try) {
    const r = await scored(pool, start, trials), seconds = Math.round((Date.now() - started) / 1000);
    writeFileSync(values.out, JSON.stringify({ skill, body, from, start, lambda: 0, trials: trials.length, dims: search.dims, log: [], seconds, best: { score: r.score, settings: start, falls: r.falls, each: r.each } }));
    console.log(JSON.stringify({ skill, body, start: { score: r.score, falls: r.falls }, seconds }));
    await pool.terminate();
    process.exit(0);
  }
  const until = values.until === undefined ? Infinity : Number(values.until), patience = Number(values.patience ?? Infinity);
  let raised = 0, bestSoFar = -Infinity;
  const unit = search.dims.map(([key, lo, hi]) => Math.min(1, Math.max(0, (start[key] - lo) / (hi - lo))));
  const saved = values.resume && existsSync(values.out) ? JSON.parse(readFileSync(values.out, "utf8")) : null, resume = saved?.checkpoint, before = saved?.seconds ?? 0;
  console.error(`${skill} on ${body}: ${trials.length} trials a candidate, ${lambda} candidates a generation, ${generations} generations, ${workers} workers`);
  const { best } = await cmaSearch({ n: search.dims.length, start: unit, sigma: Number(values.sigma ?? .2), lambda, generations, seed: Number(values.seed ?? 1), resume,
    score: (u) => scored(pool, decode(search, start, u), trials),
    onGeneration(entry, { best, checkpoint }) {
      console.error(JSON.stringify({ ...entry, seconds: Math.round((Date.now() - started) / 1000) }));
      writeFileSync(values.out, JSON.stringify({ skill, body, from, start, lambda, trials: trials.length, dims: search.dims, log: checkpoint.log,
        seconds: before + Math.round((Date.now() - started) / 1000),
        best: { score: best.score, settings: decode(search, start, best.u), falls: best.r.falls, each: best.r.each }, checkpoint }));
      if (best.score > bestSoFar) { bestSoFar = best.score; raised = entry.g; }
      if (best.score >= until || entry.g - raised >= patience) return false;
    } });
  console.log(JSON.stringify({ skill, body, best: { score: best.score, settings: decode(search, start, best.u) }, seconds: Math.round((Date.now() - started) / 1000) }));
  await pool.terminate();
  process.exit(0);
}
