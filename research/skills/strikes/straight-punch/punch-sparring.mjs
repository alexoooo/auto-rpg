/**
 * **A straight punch searched and judged sparring**: the Warrior's punch against Option Mind
 * fighting back, from the Strike drill's drawn starts (`sparring`, `src/evaluation/strike/cases.ts`).
 *
 * A candidate is a variation of the straight punch (`drive`, `from-guard`) and, where it names
 * them, settings as the punch's research tuning over the body's record (`withTuning`; unsteered,
 * since a tuned punch runs no network, unless it `keepsNetwork`). `--search` moves the settings of `SEARCHED` by diagonal
 * CMA (`cma.mjs`) from the body's record, on the training twin's trials (`sparring-twin`, every
 * `--every`th the Warrior is admitted to), each candidate scored by its trials' mean value as the
 * table values a strike (`trialValue`: the life traded over the action's cycle, a fall adding
 * `FALL_PRICE`, a blow not begun 0), until `--patience` generations pass without a better best.
 *
 * `--bar` judges a candidate on the held-out `sparring` trials the Warrior is admitted to, each
 * start played by it and by the drive as the game has it, against the bar: damage dealt per second
 * (the life its begun punches took from the foe over their cycles) at least `RATE` times the
 * drive's, the low end of its 95 % interval (paired bootstrap over the starts) above `LOW`; the life
 * the striker lost a trial no more than the drive's; and no more falls. It prints PASS or FAIL with
 * each figure.
 *
 *   node research/skills/strikes/straight-punch/punch-sparring.mjs --search --out <file.json> [--variation drive] [--keeps-network] [--every 3] [--lambda 16] [--sigma 0.2] [--patience 30] [--workers N] [--resume]
 *   node research/skills/strikes/straight-punch/punch-sparring.mjs --bar <candidate.json> [--workers N]
 *
 * A candidate file is `{ "variation": "drive", "tuning": { ... }, "keepsNetwork": true }`, or a search's out file, its best.
 * With `keepsNetwork` (`--keeps-network`), the record's network still steers the tuned punch.
 *
 * Harness: Node, the Strike drill's bout world (`playCase`) on Rapier (`DEFAULT_ENGINE`), 120 Hz.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { isMainThread, parentPort, workerData } from "node:worker_threads";
import "../../../../tests/harness/preload-data.mjs";
import { cmaSearch, workerPool } from "../../../cma.mjs";
import { withTuning } from "../../../drill-trials.mjs";
import { EVALUATIONS, playCase } from "../../../../src/app/node/evaluation.ts";
import { DEFAULT_ENGINE } from "../../../../src/core/physics/engines.ts";
import { dataOf } from "../../../../src/core/data/store.ts";
import { strikeTrade } from "../../../../src/evaluation/strike/read.ts";
import { FALL_PRICE, keep, trialValue } from "../../../../src/evaluation/table/judge.ts";

const BODY = "man", SKILL = "straight-punch";
/** The bar: damage dealt per second at least `RATE` times the drive's, the low end of its 95 % interval above `LOW`. */
const RATE = 2, LOW = 1.5;

/**
 * The searched settings and their ranges (`StraightDrive`): the posture beneath the drive (hips,
 * chest turn, lean), when and how far through the arm drives, how soon it opens (`fire`), how it
 * holds its goals (`brake`), how long it runs and recovers, where it is admitted (`reach`, `band`,
 * `pace`); and the record's whole-body schedule (`timed`) scaled in strength (`scale`) and in time
 * (`speed`, its starts and lengths divided by it).
 */
const SEARCHED = Object.freeze([
  ["hips", 0, 0.6], ["turn", 0, 0.43], ["lean", 0, 0.5], ["lead", 0, 0.45], ["through", 0, 0.3], ["fire", 0, 1.2],
  ["brake", 0, 0.3], ["follow", 0, 0.1], ["longest", 0.15, 0.45], ["recover", 0.15, 0.6],
  ["reach", 0.6, 0.95], ["band", 0.02, 0.15], ["pace", 0.3, 1.5], ["scale", 0, 1], ["speed", 0.5, 1.5],
]);

/** The subject a candidate plays as: Option Mind's straight punch, running its variation. */
const subjectName = (variation) => variation === "drive" ? `option/${SKILL}` : `option/${SKILL}+${SKILL}/${variation}`;

/** The Warrior's punch record: the settings a search starts from and a tuning is laid over. */
const record = () => dataOf("straight-punch/drive")[BODY];

/**
 * Settings from a point `u` of the unit cube (`SEARCHED`), over the record's: steered by the
 * record's network where the candidate `keepsNetwork`, unsteered otherwise.
 */
function tuningOf(u, keepsNetwork = false) {
  const base = record().settings, v = Object.fromEntries(SEARCHED.map(([key, low, high], i) => [key, low + u[i] * (high - low)]));
  const { scale, speed, ...settings } = v;
  const timed = Object.fromEntries(Object.entries(base.timed).map(([hand, pushes]) => [hand, pushes.map((push) =>
    ({ ...push, level: push.level * scale, from: push.from / speed, length: push.length / speed }))]));
  return { ...base, ...settings, timed, steered: keepsNetwork && base.steered === true };
}

/** The point of the unit cube the record's own settings are (a schedule at full strength and its own time). */
function startOf() {
  const base = { ...record().settings, scale: 1, speed: 1 };
  return SEARCHED.map(([key, low, high]) => Math.min(1, Math.max(0, (base[key] - low) / (high - low))));
}

/** The protocol's trials the Warrior is admitted to, for `variation`. */
function trialsOf(protocol, variation) {
  const evaluation = EVALUATIONS.strike, cases = evaluation.protocols[protocol], [subject] = evaluation.subjects([subjectName(variation)]);
  return cases.conditions.filter((condition) => condition.model === BODY && cases.faults(subject.value, condition, subject).length === 0);
}

/** One trial played: its outcome, the life it dealt and took, its trade (null where its punch did not begin), whether the striker fell, and its value. */
async function playOne({ protocol, variation, tuning, keepsNetwork, condition }) {
  const evaluation = EVALUATIONS.strike, cases = evaluation.protocols[protocol], [subject] = evaluation.subjects([subjectName(variation)]);
  const value = tuning ? withTuning(subject.value, tuning, keepsNetwork ? { keepsNetwork: true } : {}) : subject.value;
  const world = cases.world([value], condition, cases.engine ?? DEFAULT_ENGINE, [subject]);
  if (world.refused) throw new Error(world.refused);
  const played = await playCase(world, cases.seconds, (built) => cases.read(built, condition));
  if (played.refused) throw new Error(played.refused);
  const r = played.reading, outcome = evaluation.outcome(r).label, kept = keep({ judge: "strike" }, r);
  const dealt = Object.values(r.dealt).reduce((sum, x) => sum + x, 0);
  return { outcome, dealt, taken: r.taken, trade: strikeTrade(r), down: r.down, value: trialValue("strike", { kept, outcome }, FALL_PRICE) };
}

if (!isMainThread && workerData?.punchSparring) {
  parentPort.on("message", async ({ id, x }) => {
    let r; try { r = await playOne(x); } catch (error) { r = { error: String(error?.stack ?? error) }; }
    parentPort.postMessage({ id, r });
  });
}

/** Every trial of `conditions` played by a candidate on `pool`. */
async function playAll(pool, protocol, { variation, tuning, keepsNetwork }, conditions) {
  return Promise.all(conditions.map(async (condition) => {
    const r = await pool.evaluate({ protocol, variation, tuning, keepsNetwork, condition });
    if (r.error) throw new Error(r.error);
    return r;
  }));
}

/** Damage dealt per second over `played`'s begun punches: their life dealt over their cycles. */
const rateOf = (played) => {
  let dealt = 0, cycle = 0;
  for (const one of played) if (one.trade) { dealt += one.dealt; cycle += one.trade.cycle; }
  return cycle > 0 ? dealt / cycle : 0;
};

/** The candidate a file names: its own, or a search's best. */
function candidateIn(path) {
  const file = JSON.parse(readFileSync(path, "utf8"));
  const keepsNetwork = file.keepsNetwork === true;
  return file.best ? { variation: file.variation, tuning: tuningOf(file.best.u, keepsNetwork), keepsNetwork }
    : { variation: file.variation ?? "drive", ...(file.tuning ? { tuning: file.tuning } : {}), keepsNetwork };
}

/** A seeded stream for the bootstrap (mulberry32). */
function stream(seed) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

async function bar(path, workers) {
  const candidate = candidateIn(path), conditions = trialsOf("sparring", candidate.variation);
  const pool = workerPool(fileURLToPath(import.meta.url), { punchSparring: true }, workers);
  try {
    const [mine, drive] = [await playAll(pool, "sparring", candidate, conditions), await playAll(pool, "sparring", { variation: "drive" }, conditions)];
    const ratio = rateOf(mine) / rateOf(drive), random = stream(1), ratios = [];
    for (let k = 0; k < 2000; k++) {
      const picks = conditions.map(() => Math.floor(random() * conditions.length));
      ratios.push(rateOf(picks.map((i) => mine[i])) / rateOf(picks.map((i) => drive[i])));
    }
    ratios.sort((a, b) => a - b);
    const low = ratios[Math.floor(0.025 * ratios.length)], high = ratios[Math.floor(0.975 * ratios.length)];
    const taken = (played) => played.reduce((sum, one) => sum + one.taken, 0) / played.length, falls = (played) => played.filter((one) => one.down).length;
    const begun = (played) => played.filter((one) => one.trade).length, landed = (played) => played.filter((one) => one.outcome === "landed").length;
    const value = (played) => played.reduce((sum, one) => sum + (one.value ?? 0), 0) / played.length;
    const pass = ratio >= RATE && low > LOW && taken(mine) <= taken(drive) && falls(mine) <= falls(drive);
    console.log(`Warrior, held-out sparring, ${conditions.length} starts; candidate ${path} (${candidate.variation}${candidate.tuning ? ", tuned" : ""}) against the drive`);
    console.log(`  damage dealt per second: ${rateOf(mine).toFixed(3)} against ${rateOf(drive).toFixed(3)}, ratio ${ratio.toFixed(2)} (95 % ${low.toFixed(2)} to ${high.toFixed(2)}); bar ${RATE}, low end above ${LOW}`);
    console.log(`  life taken a trial: ${taken(mine).toFixed(3)} against ${taken(drive).toFixed(3)}; falls ${falls(mine)} against ${falls(drive)}`);
    console.log(`  beside: begun ${begun(mine)} against ${begun(drive)}, landed ${landed(mine)} against ${landed(drive)}, the table's value a trial ${value(mine).toFixed(4)} against ${value(drive).toFixed(4)}`);
    console.log(pass ? "PASS" : "FAIL");
  } finally { await pool.terminate(); }
}

async function search({ out, variation, keepsNetwork, every, lambda, sigma, patience, workers, resume }) {
  const conditions = trialsOf("sparring-twin", variation).filter((_, i) => i % every === 0);
  const pool = workerPool(fileURLToPath(import.meta.url), { punchSparring: true }, workers);
  const saved = resume && existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : null;
  let generation = saved?.checkpoint?.generation ?? 0, sinceBest = saved?.sinceBest ?? 0, bestScore = saved?.best?.score ?? -Infinity;
  const write = (body) => { writeFileSync(`${out}.part`, JSON.stringify(body)); renameSync(`${out}.part`, out); };
  console.log(`searching ${SEARCHED.length} settings of the Warrior's ${variation}${keepsNetwork ? ", steered by its record's network," : ""} on ${conditions.length} sparring-twin starts, lambda ${lambda}`);
  try {
    await cmaSearch({ n: SEARCHED.length, start: startOf(), sigma, lambda, generations: Number.MAX_SAFE_INTEGER, seed: 1,
      ...(saved?.checkpoint ? { resume: saved.checkpoint } : {}),
      score: async (u) => {
        const played = await playAll(pool, "sparring-twin", { variation, tuning: tuningOf(u, keepsNetwork), keepsNetwork }, conditions);
        const falls = played.filter((one) => one.down).length, landed = played.filter((one) => one.outcome === "landed").length;
        return { score: played.reduce((sum, one) => sum + (one.value ?? 0), 0) / played.length, rate: rateOf(played), landed, falls };
      },
      onGeneration: (entry, { best, checkpoint }) => {
        generation = entry.g + 1;
        if (best.score > bestScore) { bestScore = best.score; sinceBest = 0; } else sinceBest++;
        write({ variation, keepsNetwork, every, searched: SEARCHED, best, sinceBest, checkpoint, at: new Date().toISOString() });
        console.log(`generation ${generation}: this ${entry.best}, median ${entry.median}, sigma ${entry.sigma}; best ${bestScore.toFixed(4)} (dealt/s ${best.r.rate.toFixed(3)}, landed ${best.r.landed}, falls ${best.r.falls}), ${sinceBest} since it`);
        return sinceBest < patience;
      } });
    console.log(`ended after ${generation} generations, ${sinceBest} since the best`);
  } finally { await pool.terminate(); }
}

if (isMainThread) {
  const { values } = parseArgs({ options: { search: { type: "boolean" }, bar: { type: "string" }, out: { type: "string" }, variation: { type: "string", default: "drive" },
    "keeps-network": { type: "boolean" }, every: { type: "string", default: "3" }, lambda: { type: "string", default: "16" }, sigma: { type: "string", default: "0.2" }, patience: { type: "string", default: "30" },
    workers: { type: "string", default: String(Math.max(1, availableParallelism() - 2)) }, resume: { type: "boolean" } } });
  if (values.bar) await bar(values.bar, Number(values.workers));
  else if (values.search && values.out) await search({ out: values.out, variation: values.variation, keepsNetwork: !!values["keeps-network"], every: Number(values.every), lambda: Number(values.lambda),
    sigma: Number(values.sigma), patience: Number(values.patience), workers: Number(values.workers), resume: !!values.resume });
  else throw new Error("--search --out <file.json>, or --bar <candidate.json>");
}
