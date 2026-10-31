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
 * - The blade's cut and thrust: the blade task (`bladeCases`, `src/evaluation/blade/cases.ts`), a
 *   striker holding sword and buckler at a standing Warrior, its one blow at the high and the
 *   middle mark from three gaps; a trial scores the wound its cuts dealt (`bladeSummary`: each
 *   committed swing's hardest blow of its mechanism on the trunk or head), HP, and -0.5 where the
 *   striker was felled.
 * - The front kick: the Strike drill's `kicking` rung (`STRIKE_CASES`, `src/evaluation/strike/cases.ts`),
 *   each foot at the middle of a Warrior, a Skeleton and a Reptile lying limp from two gaps, thrown
 *   by Option Mind's low kick (the Skeleton preset's, `src/entrants/option-skeleton/index.ts`); a
 *   trial scores the drill's bar (`barScore`: -3 a fall, -1 nothing on the mark, 9 landed) and 5 a
 *   hit point the kick dealt.
 *
 *   node research/skill-search.mjs <skill> <model> --out <file.json> [--generations 10] [--lambda 16] [--sigma 0.2] [--workers N] [--seed 1] [--resume]
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
import { BLADE as BLADE_PROTOCOL, bladeCases } from "../src/evaluation/blade/cases.ts";
import { bladeSummary } from "../src/evaluation/blade/index.ts";
import { STRIKE_CASES } from "../src/evaluation/strike/cases.ts";
import { barScore } from "../src/evaluation/strike/score.ts";
import { OPTION_MIND } from "../src/core/option/mind.ts";
import { modelSpec } from "../src/core/models.ts";
import { bodyKey } from "../src/core/spec/body.ts";
import { cmaSearch, workerPool } from "./cma.mjs";
import { recordsOf, writeRecord } from "./skill-records.mjs";

const WARRIOR = "workshop-fighter+toes";

/** A blade striker's trials on `model`: each mark at each gap. */
function bladeTrials(style) {
  return (model, gaps) => gaps.flatMap((gap) => bladeCases({ ...BLADE_PROTOCOL, models: [model], styles: [style], gap }).conditions.map((condition) => ({ condition, gap })));
}

/** One blade trial of whole `settings`: its wound, HP, or -0.5 where the striker was felled. */
async function bladeTrial(style, settings, { condition, gap }) {
  const cases = bladeCases({ ...BLADE_PROTOCOL, models: [condition.model], styles: [style], gap });
  const reading = await play(cases, settings, condition);
  const summary = bladeSummary(reading);
  return { score: summary.felled ? -0.5 : summary.damage, felled: summary.felled, wound: summary.damage, swings: summary.swings, cut: summary.aligned };
}

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

/** The kicking rung's trials on `model`: each foot at each target from each gap. */
const kickTrials = (model, gaps) => STRIKE_CASES.kicking.conditions.filter((c) => c.model === "crypt-skeleton")
  .flatMap((c) => gaps.map((gap) => ({ condition: { ...c, model, gap } }))).filter((t, i, all) => all.findIndex((u) => JSON.stringify(u) === JSON.stringify(t)) === i);

/**
 * **What each skill's search plays**: the settings it searches, each with its range (the rest the
 * start's), the trials it searches on and confirms on (`gaps`, m) and a trial's score.
 */
const SEARCHES = {
  "blade-cut": { dims: [["chamberSeconds", .2, .7], ["swingSeconds", .2, .7], ["returnSeconds", .3, .8], ["contactSpeed", .3, 3], ["windup", .05, .35], ["through", 0, .15]],
    trials: bladeTrials("cut"), search: [1.2, 1.4, 1.6], confirm: [1.3, 1.5, 1.7], trial: (s, t) => bladeTrial("cut", s, t),
    task: "the blade task's cut (sword and buckler, at a standing Warrior's high and middle marks)" },
  "blade-thrust": { dims: [["chamberSeconds", .2, .7], ["swingSeconds", .2, .7], ["returnSeconds", .3, .8], ["contactSpeed", .3, 3], ["windup", .05, .35], ["through", 0, .15]],
    trials: bladeTrials("thrust"), search: [1.2, 1.4, 1.6], confirm: [1.3, 1.5, 1.7], trial: (s, t) => bladeTrial("thrust", s, t),
    task: "the blade task's thrust (sword and buckler, at a standing Warrior's high and middle marks)" },
  "front-kick": { dims: [["contactSpeed", 1.5, 9], ["swingSeconds", .2, .5], ["lift", .2, .6], ["windup", 0, .2], ["alongNear", .1, .5], ["alongFar", .4, .9], ["returnNear", .04, .15]],
    trials: kickTrials, search: [.8, 1.2], confirm: [.9, 1, 1.1], trial: kickTrial,
    task: "the Strike drill's kicking rung (each foot at the middle mark of a Warrior, a Skeleton and a Reptile lying limp)" },
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

/** The settings a search starts from on `model`: its body's record, else the Warrior's. */
function startOf(skill, model) {
  const records = recordsOf(skill), body = bodyKey(modelSpec(model));
  return structuredClone((records[body] ?? records[WARRIOR]).settings);
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
    from: { type: "string" }, generations: { type: "string" }, lambda: { type: "string" }, sigma: { type: "string" }, workers: { type: "string" }, seed: { type: "string" }, resume: { type: "boolean" } } });
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
  const from = recordsOf(skill)[body] ? `the ${body.replace("+toes", "")}'s record` : "the Warrior's record";
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
    } });
  console.log(JSON.stringify({ skill, body, best: { score: best.score, settings: decode(search, start, best.u) }, seconds: Math.round((Date.now() - started) / 1000) }));
  await pool.terminate();
  process.exit(0);
}
