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
 * each figure; beside them, how many starts only one side lands with the exact two-sided sign test's
 * p on those two counts, the damage ratio and its interval to four places, and the wall-clock
 * seconds each side took to play (the workers' start not among them).
 *
 * `--network <form> --out <file>` writes a network file in the installed layout
 * (`assets/skills/strikes/straight-punch/drive.layout.json`) from the Warrior's record's network,
 * keeping its `normalization` and `actionLimit`, its inputs found by name and its outputs by term,
 * `along` and `channel` there, and prints which rows and columns it set (`FORMS`). A fit (`fit`,
 * `fit-aged`, `fit-spans`) is one layer: it plays the twin's training half steered by the record's
 * network, keeps each decision's inputs and solves by least squares for the network's pushes before
 * tanh, printing the share of each push's variance it holds there. `fit-spans` writes
 * `{ "spans": [{ "from": <drive age, s>, "network": ... }, ...] }`, the punch steered at each decision
 * by the last span whose `from` its drive's age has reached.
 *
 *   node research/skills/strikes/straight-punch/punch-sparring.mjs --search --out <file.json> [--variation drive] [--keeps-network] [--every 3] [--lambda 16] [--sigma 0.2] [--patience 30] [--workers N] [--resume]
 *   node research/skills/strikes/straight-punch/punch-sparring.mjs --bar <candidate.json> [--variation drive] [--on held-out|twin|dev|train] [--workers N]
 *   node research/skills/strikes/straight-punch/punch-sparring.mjs --network <form> --out <file.json> [--variation drive] [--workers N]
 *   node research/skills/strikes/straight-punch/punch-sparring.mjs --commitments [--variation drive] [--out <file.json>] [--workers N]
 *
 * `--variation` names the variation a mode reads and writes: the record a search starts from, a
 * tuning is laid over and a form is written from (the one its part names for it,
 * `PUNCH_PART.reads`), and the variation a network's file steers and `--commitments` plays.
 *
 * `--commitments` reads whether sparring's commitments cover a fight's: it plays the Warrior's
 * `sparring`, `sparring-twin` and `fights` trials steered by the record's network and keeps, of each
 * trial whose punch commits, the layout's inputs at that punch's first decision. It prints each
 * input's range on `sparring` beside its range on `fights`, and how many commitments of `fights` and
 * of the twin hold an input outside `sparring`'s ranges: the twin's count is what another draw of
 * sparring's own starts holds outside them. With `--out`, it writes each rung's commitments, each
 * its trial's outcome and its inputs in the layout's order.
 *
 * `--on twin` plays the training twin, the starts checkpoints are ranked on where a trainer draws
 * from `sparring-drawn`; `--on dev` and `--on train` its halves an environment's `split` keeps out
 * and in, where a trainer draws from the twin. The bar's own starts are held out of all of them.
 * A candidate may be a trained network's file (`policy-<n>.json`), or a file of spans of networks
 * (`fit-spans`): it steers the punch on its record's settings, answering each of its requests as a
 * trainer does.
 * A candidate file is `{ "variation": "drive", "tuning": { ... }, "keepsNetwork": true }`, or a search's out file, its best.
 * The candidate plays every start; the installed drive it is read beside is the Strike drill's
 * case on each start, found in the store of played rows where a row has its key and played and
 * kept where none does (`driveOn`, `scripts/evaluation-rows.mjs`).
 * With `keepsNetwork` (`--keeps-network`), the record's network still steers the tuned punch.
 *
 * Harness: Node, the Strike drill's bout world (`playCase`) on Rapier (`DEFAULT_ENGINE`), 120 Hz.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { isMainThread, parentPort, workerData } from "node:worker_threads";
import "../../../../tests/harness/preload-data.mjs";
import { cmaSearch, workerPool } from "../../../cma.mjs";
import { withTuning } from "../../../drill-trials.mjs";
import { heldOut, learnerIn } from "../../../case-learning-environment.mjs";
import { BOUT_WORLD, EVALUATIONS, loadsOf, playCase, playRow } from "../../../../src/app/node/evaluation.ts";
import { casesOf } from "../../../../src/evaluation/run.ts";
import { oldestOf } from "../../../../src/evaluation/rows.ts";
import { drawFound, originText, rowStore } from "../../../../scripts/evaluation-rows.mjs";
import { recoveryNetwork } from "../../../../src/core/math/learning/recovery-network.ts";
import { answer, pending } from "../../../../src/core/math/learning/learner.ts";
import { DEFAULT_ENGINE } from "../../../../src/core/physics/engines.ts";
import { dataOf } from "../../../../src/core/data/store.ts";
import { PUNCH_PART } from "../../../../src/skills/strikes/straight-punch/index.ts";
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

/** The Warrior's record of `variation`, the one its part names for it (`PUNCH_PART.reads`): the settings a search starts from and a tuning is laid over, and the network that steers it. */
const recordOf = (variation) => dataOf(PUNCH_PART.reads({ kind: SKILL, variation })[0])[BODY];

/**
 * Settings from a point `u` of the unit cube (`SEARCHED`), over `variation`'s record's: steered by
 * the record's network where the candidate `keepsNetwork`, unsteered otherwise.
 */
function tuningOf(u, variation, keepsNetwork = false) {
  const base = recordOf(variation).settings, v = Object.fromEntries(SEARCHED.map(([key, low, high], i) => [key, low + u[i] * (high - low)]));
  const { scale, speed, ...settings } = v;
  const timed = Object.fromEntries(Object.entries(base.timed).map(([hand, pushes]) => [hand, pushes.map((push) =>
    ({ ...push, level: push.level * scale, from: push.from / speed, length: push.length / speed }))]));
  return { ...base, ...settings, timed, steered: keepsNetwork && base.steered === true };
}

/** The point of the unit cube `variation`'s record's own settings are (a schedule at full strength and its own time). */
function startOf(variation) {
  const base = { ...recordOf(variation).settings, scale: 1, speed: 1 };
  return SEARCHED.map(([key, low, high]) => Math.min(1, Math.max(0, (base[key] - low) / (high - low))));
}

/** The protocol's trials the Warrior is admitted to, for `variation`. */
function trialsOf(protocol, variation) {
  const evaluation = EVALUATIONS.strike, cases = evaluation.protocols[protocol], [subject] = evaluation.subjects([subjectName(variation)]);
  return cases.conditions.filter((condition) => condition.model === BODY && cases.faults(subject.value, condition, subject).length === 0);
}

/** The punch's steer layout: its inputs' names and its outputs' terms, as the game reads them. */
const LAYOUT = JSON.parse(readFileSync(fileURLToPath(new URL("../../../../assets/skills/strikes/straight-punch/drive.layout.json", import.meta.url)), "utf8"));

/** The layout's input named `name`: its column. */
function inputAt(name) {
  const i = LAYOUT.inputs.indexOf(name);
  if (i < 0 || LAYOUT.inputs.lastIndexOf(name) !== i) throw new Error(`the layout has no one input ${name}`);
  return i;
}

/** The layout's output whose `term`, `along` and `channel` are `fields`'s (those it names): its row. */
function outputAt(fields) {
  const found = LAYOUT.outputs.flatMap((output, i) => Object.entries(fields).every(([key, v]) => output[key] === v) ? [i] : []);
  if (found.length !== 1) throw new Error(`the layout has ${found.length} outputs ${JSON.stringify(fields)}, not one`);
  return found[0];
}

/** A file's steer: one network, or spans of them chosen by the drive's age (the last whose `from` it has reached). */
function steerOf(file) {
  if (!Array.isArray(file.spans)) return recoveryNetwork(file);
  if (file.spans.length === 0 || file.spans.some((span, k) => !Number.isFinite(span.from) || (k > 0 && !(span.from > file.spans[k - 1].from))))
    throw new Error("a file of spans names them in order of their drive age");
  const age = inputAt("drive age"), spans = file.spans.map((span) => ({ from: span.from, steer: recoveryNetwork(span.network) }));
  return (inputs) => (spans.findLast((span) => span.from <= inputs[age]) ?? spans[0]).steer(inputs);
}

/** Each policy file's steer, as a worker reads it once. */
const policies = new Map();
const policyOf = (path) => { if (!policies.has(path)) policies.set(path, steerOf(JSON.parse(readFileSync(path, "utf8")))); return policies.get(path); };

/** A trial of a punch steered by a trainer, `act` answering its every request, played to its reader's end: its reading. */
async function steeredTrial(cases, world, condition, value, act) {
  const built = await BOUT_WORLD.build(world, {});
  if (built.refused) throw new Error(built.refused);
  try {
    const reader = cases.read(built, condition), { learner } = learnerIn(BOUT_WORLD, built, value);
    BOUT_WORLD.start(built, world);
    while (!reader.ended) {
      if (built.duel.clock > cases.seconds + 1) throw new Error("the trial ran past its seconds");
      built.world.step(); reader.afterStep();
      if (pending(learner)) answer(learner, act(learner.inputs, built.world.time));
    }
    return reader.reading();
  } finally { built.dispose(); }
}

/**
 * One trial played: its outcome, the life it dealt and took, its trade (null where its punch did
 * not begin), whether the striker fell, and its value. With `policy`, a checkpoint's network file
 * steers the punch on its record's settings, as a trainer steers it (`steeredTrial`). With `keeps`,
 * the record's network steers it so, and each decision's inputs come back (`kept`); with `commits`
 * beside it, its punch's commitment alone (`commitmentOf`).
 */
async function playOne({ protocol, variation, tuning, keepsNetwork, policy, keeps, commits, condition }) {
  const evaluation = EVALUATIONS.strike, cases = evaluation.protocols[protocol], [subject] = evaluation.subjects([subjectName(variation)]);
  const value = policy || keeps ? withTuning(subject.value, { ...tuning, steered: true })
    : tuning ? withTuning(subject.value, tuning, keepsNetwork ? { keepsNetwork: true } : {}) : subject.value;
  const world = cases.world([value], condition, cases.engine ?? DEFAULT_ENGINE, [subject]);
  if (world.refused) throw new Error(world.refused);
  let r;
  const kept = keeps ? [] : null, keptAt = [];
  if (keeps) {
    const steer = recoveryNetwork(recordOf(variation).network);
    r = await steeredTrial(cases, world, condition, value, (inputs, at) => { kept.push(inputs.slice()); keptAt.push(at); return steer(inputs); });
  } else if (policy) r = await steeredTrial(cases, world, condition, value, policyOf(policy));
  else {
    const played = await playCase(world, cases.seconds, (built) => cases.read(built, condition));
    if (played.refused) throw new Error(played.refused);
    r = played.reading;
  }
  return { ...readOf(r), ...(commits ? { commitment: commitmentOf(kept, keptAt, r.committed) } : kept ? { kept } : {}) };
}

/** What the judge reads of a trial's reading `r`: its outcome, the life dealt and taken, its trade, whether it ended down, and its value as the table values it. */
function readOf(r) {
  const outcome = EVALUATIONS.strike.outcome(r).label, judged = keep({ judge: "strike" }, r);
  const dealt = Object.values(r.dealt).reduce((sum, x) => sum + x, 0);
  return { outcome, dealt, taken: r.taken, trade: strikeTrade(r), down: r.down, value: trialValue("strike", { kept: judged, outcome }, FALL_PRICE) };
}

/** A case of the Strike drill played as its row (`playRow`), as `npm run evaluate` plays it. */
const playKept = ({ protocol, key, condition, world, seconds }) => playRow(key, world, seconds, (built) => EVALUATIONS.strike.protocols[protocol].read(built, condition));

/**
 * The commitment of a trial's punch: the layout's inputs at the first decision of the swing begun
 * nearest the time its reader has it commit (`committed`, s), and how long after that time the
 * decision was asked, s. A swing's first decision is one whose drive is no older than the decision
 * before it. Null where the punch never committed or no swing was steered.
 */
function commitmentOf(kept, keptAt, committed) {
  if (committed === null || kept.length === 0) return null;
  const age = inputAt("drive age");
  let best = -1;
  kept.forEach((inputs, i) => {
    if (i > 0 && inputs[age] > kept[i - 1][age]) return;
    if (best < 0 || Math.abs(keptAt[i] - committed) < Math.abs(keptAt[best] - committed)) best = i;
  });
  return { inputs: kept[best], late: keptAt[best] - committed };
}

if (!isMainThread && workerData?.punchSparring) {
  parentPort.on("message", async ({ id, x }) => {
    let r; try { r = x.ping ? {} : x.row ? await playKept(x.row) : await playOne(x); } catch (error) { r = { error: String(error?.stack ?? error) }; }
    parentPort.postMessage({ id, r });
  });
}

/** Every trial of `conditions` played by a candidate on `pool`. */
async function playAll(pool, protocol, { variation, tuning, keepsNetwork, policy }, conditions) {
  return Promise.all(conditions.map(async (condition) => {
    const r = await pool.evaluate({ protocol, variation, tuning, keepsNetwork, policy, condition });
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

/** The candidate a file names: its own, or a search's best; a network's file steers `variation`, which a file that names none runs. */
function candidateIn(path, variation) {
  const file = JSON.parse(readFileSync(path, "utf8"));
  const keepsNetwork = file.keepsNetwork === true;
  if ((file.actions !== undefined && file.layers !== undefined) || Array.isArray(file.spans)) return { variation, policy: path };
  return file.best ? { variation: file.variation, tuning: tuningOf(file.best.u, file.variation, keepsNetwork), keepsNetwork }
    : { variation: file.variation ?? variation, ...(file.tuning ? { tuning: file.tuning } : {}), keepsNetwork };
}

/** A seeded stream for the bootstrap (mulberry32). */
function stream(seed) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** The exact two-sided sign test's p on `a` and `b` discordant pairs (1 where there are none). */
function signTest(a, b) {
  const n = a + b, k = Math.min(a, b);
  if (n === 0) return 1;
  let log = -n * Math.LN2, sum = 0;
  for (let i = 0; i <= k; i++) { sum += Math.exp(log); log += Math.log((n - i) / (i + 1)); }
  return Math.min(1, 2 * sum);
}

/**
 * The installed drive's trials on `conditions` of `protocol`: each the Strike drill's case of
 * `option/straight-punch` there, found in the store of played rows by its key (`casesOf`,
 * `rowStore`), and played and kept where no row has it. Beside them, how many were found, the
 * oldest row read, and how many of a few found rows played again read as kept (`drawFound`).
 */
async function driveOn(pool, protocol, conditions) {
  const evaluation = EVALUATIONS.strike, cases = evaluation.protocols[protocol];
  const scheduled = casesOf(evaluation, protocol, evaluation.subjects([subjectName("drive")]), { engine: cases.engine ?? DEFAULT_ENGINE, schedule: { kind: "all" }, loads: loadsOf });
  if (scheduled.refused) throw new Error(scheduled.refused);
  const store = rowStore("strike"), by = new Map(scheduled.units.flat().map((one) => [one.condition, one]));
  const asked = conditions.map((condition) => {
    if (!by.has(condition)) throw new Error(`the drive is not admitted to ${JSON.stringify(condition)}`);
    return by.get(condition);
  });
  const play = async (one) => {
    const row = await pool.evaluate({ row: { protocol, key: one.key, condition: one.condition, world: one.world, seconds: one.seconds } });
    if (row.error) throw new Error(row.error);
    return row;
  };
  const found = asked.filter((one) => store.rows.has(one.key)), { drawn, of } = drawFound(found, store), oldest = oldestOf(found.map((one) => store.rows.get(one.key)));
  const [again] = await Promise.all([Promise.all(drawn.map(play)), ...asked.filter((one) => !store.rows.has(one.key)).map(async (one) => store.keep(await play(one)))]);
  const rows = asked.map((one) => store.rows.get(one.key)), faulted = rows.find((row) => row.fault !== null);
  if (faulted) throw new Error(`the drive's case ${faulted.key}: ${faulted.fault.message}`);
  return { played: rows.map((row) => readOf(row.reading)), lines: [
    `  the drive's side: ${found.length} of ${asked.length} rows found${oldest && !store.current(oldest) ? `, the oldest played on ${originText(oldest.from)}` : ""}`,
    ...(drawn.length > 0 ? [`  ${drawn.length} of the ${of} rows found from other code played again: ${again.filter((row) => row.digest === store.rows.get(row.key).digest).length} read as kept`] : [])] };
}

async function bar(path, workers, on, variation) {
  const candidate = candidateIn(path, variation), protocol = on === "held-out" ? "sparring" : "sparring-twin";
  const conditions = trialsOf(protocol, candidate.variation).filter((condition) => on === "held-out" || on === "twin" || heldOut(condition) === (on === "dev"));
  const pool = workerPool(fileURLToPath(import.meta.url), { punchSparring: true }, workers);
  try {
    await Promise.all(Array.from({ length: workers }, () => pool.evaluate({ ping: true })));
    const timed = async (play) => { const begun = performance.now(), played = await play(); return [played, (performance.now() - begun) / 1000]; };
    const [[mine, mineSeconds], [{ played: drive, lines }, driveSeconds]] = [await timed(() => playAll(pool, protocol, candidate, conditions)), await timed(() => driveOn(pool, protocol, conditions))];
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
    console.log(`Warrior, ${on === "held-out" ? "held-out sparring" : on === "twin" ? "the training twin" : on === "dev" ? "the twin's held-out half (dev)" : "the twin's training half"}, ${conditions.length} starts; candidate ${path} (${candidate.variation}${candidate.tuning ? ", tuned" : ""}${candidate.policy ? ", its policy steering" : ""}) against the drive`);
    console.log(`  damage dealt per second: ${rateOf(mine).toFixed(3)} against ${rateOf(drive).toFixed(3)}, ratio ${ratio.toFixed(2)} (95 % ${low.toFixed(2)} to ${high.toFixed(2)}); bar ${RATE}, low end above ${LOW}`);
    console.log(`  life taken a trial: ${taken(mine).toFixed(3)} against ${taken(drive).toFixed(3)}; falls ${falls(mine)} against ${falls(drive)}`);
    console.log(`  beside: begun ${begun(mine)} against ${begun(drive)}, landed ${landed(mine)} against ${landed(drive)}, the table's value a trial ${value(mine).toFixed(4)} against ${value(drive).toFixed(4)}`);
    const outcomes = (played) => Object.entries(Object.groupBy(played, (one) => one.outcome)).map(([outcome, all]) => `${outcome} ${all.length}`).join(", ");
    console.log(`  outcomes: ${outcomes(mine)}; the drive's: ${outcomes(drive)}`);
    const lands = (one) => one.outcome === "landed";
    const onlyMine = conditions.filter((_, i) => lands(mine[i]) && !lands(drive[i])).length, onlyDrive = conditions.filter((_, i) => !lands(mine[i]) && lands(drive[i])).length;
    console.log(`  landed by one side only: the candidate ${onlyMine}, the drive ${onlyDrive}; exact two-sided sign test p ${signTest(onlyMine, onlyDrive).toPrecision(4)}`);
    console.log(`  damage ratio ${ratio.toFixed(4)} (95 % ${low.toFixed(4)} to ${high.toFixed(4)})`);
    console.log(`  wall-clock to play: the candidate ${mineSeconds.toFixed(1)} s, the drive ${driveSeconds.toFixed(1)} s (${workers} workers, their start not among them)`);
    for (const line of lines) console.log(line);
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
    await cmaSearch({ n: SEARCHED.length, start: startOf(variation), sigma, lambda, generations: Number.MAX_SAFE_INTEGER, seed: 1,
      ...(saved?.checkpoint ? { resume: saved.checkpoint } : {}),
      score: async (u) => {
        const played = await playAll(pool, "sparring-twin", { variation, tuning: tuningOf(u, variation, keepsNetwork), keepsNetwork }, conditions);
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

/** The rung a try is judged on, the draw of its own starts read beside it, and the fights whose commitments it is asked to cover. */
const COVERS = Object.freeze({ reference: "sparring", draw: "sparring-twin", asked: "fights" });

/**
 * Whether sparring's commitments cover the fights' (`--commitments`): each of `COVERS`'s rungs
 * played steered by the record's network, its punches' commitments kept (`commitmentOf`), and each
 * input's range on the reference beside the asked rung's, with how many commitments of the asked
 * rung and of the draw hold an input outside the reference's ranges.
 */
async function commitments(workers, out, variation) {
  const pool = workerPool(fileURLToPath(import.meta.url), { punchSparring: true }, workers);
  const read = {};
  try {
    await Promise.all(Array.from({ length: workers }, () => pool.evaluate({ ping: true })));
    for (const protocol of Object.values(COVERS)) {
      const conditions = trialsOf(protocol, variation), begun = performance.now();
      const played = await Promise.all(conditions.map(async (condition) => {
        const r = await pool.evaluate({ protocol, variation, keeps: true, commits: true, condition });
        if (r.error) throw new Error(r.error);
        return r;
      }));
      const committed = played.filter((one) => one.commitment);
      const outcomes = Object.entries(Object.groupBy(played, (one) => one.outcome)).map(([outcome, all]) => `${outcome} ${all.length}`).join(", ");
      const late = committed.reduce((most, one) => Math.max(most, Math.abs(one.commitment.late)), 0);
      console.log(`${protocol}: ${conditions.length} Warrior trials, ${committed.length} commitments, each at most ${late.toFixed(4)} s from its reader's commit; outcomes: ${outcomes}; ${((performance.now() - begun) / 1000).toFixed(1)} s on ${workers} workers`);
      read[protocol] = committed;
    }
  } finally { await pool.terminate(); }
  if (out) {
    writeFileSync(out, `${JSON.stringify({ inputs: LAYOUT.inputs, ...Object.fromEntries(Object.entries(read).map(([protocol, all]) => [protocol, all.map((one) => ({ outcome: one.outcome, inputs: one.commitment.inputs }))])) })}\n`);
    console.log(`wrote ${out}`);
  }
  const n = LAYOUT.inputs.length, rangeOf = (all) => Array.from({ length: n }, (_, i) => all.reduce(([low, high], one) => [Math.min(low, one.commitment.inputs[i]), Math.max(high, one.commitment.inputs[i])], [Infinity, -Infinity]));
  const reference = rangeOf(read[COVERS.reference]), asked = rangeOf(read[COVERS.asked]);
  const outside = (one) => one.commitment.inputs.flatMap((x, i) => x < reference[i][0] || x > reference[i][1] ? [i] : []);
  const perInput = (all) => { const counts = new Array(n).fill(0); for (const one of all) for (const i of outside(one)) counts[i]++; return counts; };
  const inAsked = perInput(read[COVERS.asked]), inDraw = perInput(read[COVERS.draw]), span = ([low, high]) => low > high ? "none" : `[${low.toFixed(3)}, ${high.toFixed(3)}]`;
  console.log(`input | ${COVERS.reference} range | ${COVERS.asked} range | ${COVERS.asked} outside / ${read[COVERS.asked].length} | ${COVERS.draw} outside / ${read[COVERS.draw].length}`);
  LAYOUT.inputs.forEach((name, i) => console.log(`${name} | ${span(reference[i])} | ${span(asked[i])} | ${inAsked[i]} | ${inDraw[i]}`));
  const summary = (label, all) => {
    const counts = all.map((one) => outside(one).length).sort((a, b) => a - b), some = counts.filter((count) => count > 0).length;
    console.log(`${label}: ${some} of ${all.length} commitments hold an input outside ${COVERS.reference}'s ranges; inputs outside a commitment, of ${n}: median ${counts.length ? counts[Math.floor(counts.length / 2)] : 0}, most ${counts.at(-1) ?? 0}`);
  };
  summary(COVERS.asked, read[COVERS.asked]);
  summary(`${COVERS.asked}, landed`, read[COVERS.asked].filter((one) => one.outcome === "landed"));
  summary(`${COVERS.asked}, not landed`, read[COVERS.asked].filter((one) => one.outcome !== "landed"));
  summary(COVERS.draw, read[COVERS.draw]);
}

/** The fit's 16 inputs: the target from the shoulder, the fist from the target, the fist's and the centre's velocity, and the arm's four angles. */
const FIT_INPUTS = Object.freeze([...["target from shoulder", "fist from target", "fist velocity", "centre velocity"].flatMap((name) => ["across", "up", "ahead"].map((axis) => `${name} ${axis}`)),
  ...["shoulder.right flexion", "shoulder.right abduction", "shoulder.right internal rotation", "elbow.right flexion"].map((channel) => `angle ${channel}`)]);

/** The legs and the stance: each hip, knee and ankle channel's angle and speed, and the four readings of the gait. */
const legInputs = () => [...LAYOUT.inputs.filter((name) => /^(angle|speed) (hip|knee|ankle)\./.test(name)), "near foot bearing", "far foot bearing", "stance shifting", "stance swinging"];

/** `variation`'s record's network as plain data of its own, its normalization and action limit kept. */
const installed = (variation) => JSON.parse(JSON.stringify(recordOf(variation).network));

/** `network`'s layer `k`'s rows of `outputs` (each found by `outputAt`) at zero weights and `bias`. */
function setRows(network, k, outputs, bias) {
  const layer = network.layers[k], rows = outputs.map(outputAt);
  for (const row of rows) { layer.weights[row].fill(0); layer.bias[row] = bias; }
  console.log(`set layer ${k} of ${network.layers.length}, rows ${rows.map((row, i) => `${row} ${JSON.stringify(outputs[i])}`).join(", ")}: weights 0, bias ${bias}`);
  return network;
}

/** `network`'s first layer's columns of the inputs `names` at zero, in every row. */
function zeroColumns(network, names) {
  const columns = names.map(inputAt);
  for (const row of network.layers[0].weights) for (const column of columns) row[column] = 0;
  console.log(`set layer 0, ${columns.length} columns at 0 in every row: ${columns.map((column) => `${column} ${LAYOUT.inputs[column]}`).join(", ")}`);
  return network;
}

/** `network`'s outputs before tanh, as its action limit clamps them, from raw inputs (as `recoveryNetwork` reads, before its tanh). */
function beforeTanh(network) {
  const { mean, scale, clip } = network.normalization, limit = network.actionLimit ?? Infinity;
  return (raw) => {
    let previous = raw.map((x, i) => Math.max(-clip, Math.min(clip, (x - mean[i]) * scale[i])));
    network.layers.forEach((layer, k) => {
      const last = k + 1 === network.layers.length;
      previous = layer.bias.map((bias, i) => {
        let v = bias; const w = layer.weights[i];
        for (let j = 0; j < previous.length; j++) v += w[j] * previous[j];
        return last ? v : Math.max(0, v);
      });
    });
    return previous.slice(0, network.actions).map((v) => Math.max(-limit, Math.min(limit, v)));
  };
}

/** The solution of `a x = b` for a symmetric positive definite `a` (Cholesky). */
function solveSpd(a, b) {
  const n = b.length, l = a.map((row) => row.map(() => 0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let sum = a[i][j];
    for (let k = 0; k < j; k++) sum -= l[i][k] * l[j][k];
    if (i !== j) l[i][j] = sum / l[j][j];
    else if (sum > 0) l[i][i] = Math.sqrt(sum);
    else throw new Error("the least squares' matrix is not positive definite");
  }
  const y = new Array(n).fill(0), x = new Array(n).fill(0);
  for (let i = 0; i < n; i++) { let sum = b[i]; for (let k = 0; k < i; k++) sum -= l[i][k] * y[k]; y[i] = sum / l[i][i]; }
  for (let i = n - 1; i >= 0; i--) { let sum = y[i]; for (let k = i + 1; k < n; k++) sum -= l[k][i] * x[k]; x[i] = sum / l[i][i]; }
  return x;
}

/** The ridge on a fit's weights (not its bias), times its decisions: its conditioning, the normalised inputs being about one in size. */
const RIDGE = 1e-6;

/** The layout's pushes: their rows. */
const pushRows = () => LAYOUT.outputs.flatMap((output, i) => output.term === "pushes" ? [i] : []);

/**
 * One layer in the installed layout, fitted by least squares on `decisions` (each `{ raw, x, y }`:
 * its inputs raw and normalised, and the record's network's outputs before tanh) to the eight pushes,
 * reading the inputs `names`: its other columns, and its heading and centre rows, zero; its walk row
 * zero weights and bias -1.
 */
function fitted(network, decisions, names) {
  const columns = names.map(inputAt), pushes = pushRows(), width = columns.length + 1;
  if (pushes.length !== 8) throw new Error(`the layout has ${pushes.length} pushes, not eight`);
  const ata = Array.from({ length: width }, () => new Array(width).fill(0)), atb = pushes.map(() => new Array(width).fill(0));
  for (const { x, y } of decisions) {
    const f = [...columns.map((c) => x[c]), 1];
    for (let i = 0; i < width; i++) {
      for (let j = 0; j < width; j++) ata[i][j] += f[i] * f[j];
      pushes.forEach((output, p) => { atb[p][i] += f[i] * y[output]; });
    }
  }
  for (let i = 0; i < columns.length; i++) ata[i][i] += RIDGE * decisions.length;
  const solved = atb.map((b) => solveSpd(ata, b));
  const weights = LAYOUT.outputs.map(() => new Array(LAYOUT.inputs.length).fill(0)), bias = LAYOUT.outputs.map(() => 0);
  pushes.forEach((output, p) => { columns.forEach((c, i) => { weights[output][c] = solved[p][i]; }); bias[output] = solved[p][columns.length]; });
  bias[outputAt({ term: "walk" })] = -1;
  return { actions: network.actions, layers: [{ weights, bias }], normalization: network.normalization, actionLimit: network.actionLimit };
}

/** Each push's share of its variance over `decisions` that `steer` (raw inputs to outputs before tanh) holds, printed after `label`. */
function printShares(label, decisions, steer) {
  const steered = decisions.map(({ raw }) => steer(raw));
  const shares = pushRows().map((output) => {
    const mean = decisions.reduce((sum, { y }) => sum + y[output], 0) / decisions.length;
    let residual = 0, total = 0;
    decisions.forEach(({ y }, i) => { residual += (y[output] - steered[i][output]) ** 2; total += (y[output] - mean) ** 2; });
    return `${LAYOUT.outputs[output].channel} ${(total > 0 ? 1 - residual / total : 1).toFixed(3)}`;
  });
  console.log(`${label}, ${decisions.length} decisions; each push's share of its variance held (before tanh, as the action limit clamps it): ${shares.join(", ")}`);
}

/** Each decision on the twin's training half, the record's network steering the punch: its raw and normalised inputs and the network's outputs before tanh. */
async function decisionsOnTrain(network, workers, variation) {
  const conditions = trialsOf("sparring-twin", variation).filter((condition) => !heldOut(condition));
  const pool = workerPool(fileURLToPath(import.meta.url), { punchSparring: true }, workers);
  let played;
  try {
    played = await Promise.all(conditions.map(async (condition) => {
      const r = await pool.evaluate({ protocol: "sparring-twin", variation, keeps: true, condition });
      if (r.error) throw new Error(r.error);
      return r.kept;
    }));
  } finally { await pool.terminate(); }
  const { mean, scale, clip } = network.normalization, target = beforeTanh(network);
  const decisions = played.flat().map((raw) => ({ raw, x: raw.map((v, i) => Math.max(-clip, Math.min(clip, (v - mean[i]) * scale[i]))), y: target(raw) }));
  console.log(`played the twin's training half, ${conditions.length} starts, steered by the record's network: ${decisions.length} decisions`);
  return decisions;
}

/** A one-layer fit of `names` over the training half, its shares printed. */
async function fitForm(names, label, workers, variation) {
  const network = installed(variation), decisions = await decisionsOnTrain(network, workers, variation), fit = fitted(network, decisions, names);
  printShares(label, decisions, beforeTanh(fit));
  return fit;
}

/** How many spans of the drive's age `fit-spans` fits a layer to, each an equal share of the training half's decisions. */
const SPANS = 3;

/** Each form a network file is written in (`--network`), from the record's network of the variation asked. */
const FORMS = {
  installed: async (_workers, variation) => installed(variation),
  "no-stance-asks": async (_workers, variation) => setRows(installed(variation), 2, [{ term: "heading" }, { term: "centre", along: "ahead" }, { term: "centre", along: "across" }], 0),
  "walk-on": async (_workers, variation) => setRows(installed(variation), 2, [{ term: "walk" }], 1),
  "walk-off": async (_workers, variation) => setRows(installed(variation), 2, [{ term: "walk" }], -1),
  "blind-legs": async (_workers, variation) => zeroColumns(installed(variation), legInputs()),
  "fit-inputs": async (_workers, variation) => zeroColumns(installed(variation), LAYOUT.inputs.filter((name) => !FIT_INPUTS.includes(name))),
  fit: async (workers, variation) => fitForm(FIT_INPUTS, "fit", workers, variation),
  "fit-aged": async (workers, variation) => fitForm([...FIT_INPUTS, "drive age"], "fit-aged", workers, variation),
  "fit-spans": async (workers, variation) => {
    const network = installed(variation), decisions = await decisionsOnTrain(network, workers, variation), age = inputAt("drive age");
    const ages = decisions.map(({ raw }) => raw[age]).sort((a, b) => a - b);
    const froms = [Math.min(0, ages[0]), ...Array.from({ length: SPANS - 1 }, (_, k) => ages[Math.floor(((k + 1) * ages.length) / SPANS)])];
    const spanOf = (raw) => froms.findLastIndex((from) => from <= raw[age]);
    const spans = froms.map((from, k) => {
      const mine = decisions.filter(({ raw }) => Math.max(0, spanOf(raw)) === k), fit = fitted(network, mine, FIT_INPUTS);
      printShares(`fit-spans, span ${k + 1}, drive age from ${from.toFixed(4)} s${k + 1 < froms.length ? ` to ${froms[k + 1].toFixed(4)} s` : ""}`, mine, beforeTanh(fit));
      return { from, network: fit };
    });
    const steers = spans.map((span) => beforeTanh(span.network));
    printShares("fit-spans, every decision by its span's layer", decisions, (raw) => steers[Math.max(0, spanOf(raw))](raw));
    return { spans };
  },
};

if (isMainThread) {
  const { values } = parseArgs({ options: { search: { type: "boolean" }, bar: { type: "string" }, out: { type: "string" }, variation: { type: "string", default: "drive" },
    "keeps-network": { type: "boolean" }, on: { type: "string", default: "held-out" }, every: { type: "string", default: "3" }, lambda: { type: "string", default: "16" }, sigma: { type: "string", default: "0.2" }, patience: { type: "string", default: "30" },
    workers: { type: "string", default: String(Math.max(1, availableParallelism() - 2)) }, resume: { type: "boolean" }, network: { type: "string" }, commitments: { type: "boolean" } } });
  if (values.commitments) await commitments(Number(values.workers), values.out, values.variation);
  else if (values.network) {
    const form = Object.hasOwn(FORMS, values.network) ? FORMS[values.network] : null;
    if (!form || !values.out) throw new Error(`--network <${Object.keys(FORMS).join("|")}> --out <file.json>`);
    writeFileSync(values.out, `${JSON.stringify(await form(Number(values.workers), values.variation))}\n`);
    console.log(`wrote ${values.out}`);
  } else if (values.bar) await bar(values.bar, Number(values.workers), values.on, values.variation);
  else if (values.search && values.out) await search({ out: values.out, variation: values.variation, keepsNetwork: !!values["keeps-network"], every: Number(values.every), lambda: Number(values.lambda),
    sigma: Number(values.sigma), patience: Number(values.patience), workers: Number(values.workers), resume: !!values.resume });
  else throw new Error("--search --out <file.json>, --bar <candidate.json>, --network <form> --out <file.json>, or --commitments");
}
