/**
 * **A skill's settings searched on one body**, for its record (`SkillRecord`,
 * `src/skills/framework/records.ts`): diagonal CMA (`cma.mjs`) over the settings that shape
 * its motion (`SEARCHES`), from the body's record where it has one and the Warrior's where not, the
 * rest held at the start's, each candidate played on its task's trials on that body and scored by
 * their mean. `--confirm` then plays the search's best and what it would replace on fresh trials
 * (other gaps, other seeds): the record the body plays now, or the search's start where the body
 * has none. The best is kept only where it scores above that there and loses no more trials; with
 * `--write`, what is kept is the body's row (`writeRecord`, `research/skills/skill-records.mjs`),
 * saying how it was made, and a record that is kept is left as it is.
 *
 * - The stomp: the table's cells of the body's stomp row (`rowOf`, `research/drill-trials.mjs`;
 *   `--loadout` one cell), each the Strike drill's `stomping` rung (each foot at the middle of each
 *   of the game's foes lying limp), searched on the rung's training twin at 120 Hz and confirmed on
 *   the cells' own cases at 120 and 480 Hz, the worse counting ([the skill
 *   recipe](../../docs/recipes/skill.md#an-options-code): research scores on its drill). A candidate
 *   is the cell's subject, the drills' Option Mind, its stomp so tuned (`withTuning`); a trial scores
 *   its value as the cell values it, a blow short of the bar graded below it (`searchScore`), and the
 *   confirmation keeps a record on the value.
 * - The sit-back: its record drives two ways up (`front-sit-back`, `sit-back`), so it is searched
 *   on the twin of both their table cells on the body, every loadout or `--loadout`'s (the way-up
 *   drill's fresh falls and bouts, `research/skills/recovery/way-up-trials.mjs`), each fall risen by the
 *   drills' Mind with the cell's way up first and every staged way up on the candidate
 *   (`stagedValue`), at 120 Hz, and confirmed on the cells' own falls at 120 and 480 Hz, the worse
 *   counting. The search moves the joint angles its three stages drive toward, never their times.
 *   A trial scores the cell's value negated: the way up's seconds an attempt, one not reaching
 *   where it goes at `ATTEMPT_CAP`; a fall not exercised scores nothing. A record it writes leaves
 *   the body's ground profiles stale: rebuild them
 *   (`research/skills/recovery/edge-profiles.mjs --model <body> --write`) in the same change, for
 *   the game's Mind; the table reads none.
 * - The roll: the same way, on the cells of the ways up its record (the body's step-up record,
 *   `record`) drives, `staged-roll` and `staged-down`. The search moves the joint angles the
 *   roll's four poses drive toward and each pose's time; the record's roll poses are the game's
 *   (`ROLL_POSES`) where it has none of its own, and a row it writes keeps how the rest was made.
 *   The step-up's loadout rows (the Warrior's) keep the times they set. Its profiles are stale
 *   after a write, as the sit-back's.
 *
 * A body with no record of its own starts from the Warrior's (`--source` names another body whose
 * record it starts from, its own or not), its lengths (`SEARCHES`' `lengths`, m) scaled by the
 * body's stature over the source's and its heights (`heights`, m) kept: a height is measured from
 * the ground to a target that is the same for every body, so the same height keeps the source's
 * clearance over it. `--until` ends the search once its best scores that
 * much, `--patience` once that many generations have not raised it (a plateau); with `--patience`
 * and no `--generations` the search has no other end, and runs for as long as it keeps improving.
 * Its out file says how it ended (`ended`: `plateau`, `until`, or `generations` where its count
 * ran out first), and `--resume` goes on from one. `--try` plays the start
 * alone on the search's trials and saves it as a search's result (no generation), for `--confirm`
 * to keep where it serves.
 *
 *   node research/skills/skill-search.mjs <skill> <model> --out <file.json> [--generations 10 | --patience <generations>] [--lambda 16] [--sigma 0.2] [--until <score>] [--workers N] [--seed 1] [--resume]
 *   node research/skills/skill-search.mjs <skill> <model> --out <file.json> --try
 *   ... --source <model>: the start carried over from that body's record
 *   ... --set '{"lift": 0.7}': the start with those settings in its place, for a search or a --try
 *   ... --loadout <left,right>: one loadout's cells of its row, for a search, a --try or a --confirm
 *   node research/skills/skill-search.mjs <skill> <model> --confirm <file.json> [--write [--from "<what the search started from>"]]
 *
 * Harness: Node on Rapier (`DEFAULT_ENGINE`), each command one step late. The stomp: the bout
 * world (`playCase`); the sit-back and the roll: the fall bed (`buildFall`); each searched at
 * 120 Hz, its confirmation 120 and 480 Hz.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { execSync } from "node:child_process";
import { isMainThread, parentPort, workerData } from "node:worker_threads";
import "../../tests/harness/preload-data.mjs";
import { ATTEMPT_CAP } from "../../src/evaluation/way-up/read.ts";
import { modelSpec } from "../../src/core/bodies/models.ts";
import { bodyKey } from "../../src/core/bodies/spec/body.ts";
import { ROLL_POSES, SIT_BACK } from "../../src/skills/recovery/implementations/staged/stages.ts";
import { cmaSearch, workerPool } from "../cma.mjs";
import { CONFIRM_RATES, drillTrials, playTrial, rowOf, searchScore, subjectOf, withTuning } from "../drill-trials.mjs";
import { RECORD_WAYS, stagedValue, tuningOn, wayCells } from "./recovery/way-up-trials.mjs";
import { recordsOf, writeRecord } from "./skill-records.mjs";

/**
 * A strike's trials on `model`: the drill's trials of each cell of the body's row of `skill`
 * (`rowOf`; `loadout`'s cell alone where given), its training twin's (`twin`, the search's) or the
 * cell's own (`cell`, the confirmation's).
 */
const strikeTrials = (skill) => (model, held, loadout) => rowOf({ body: model, skill, ...(loadout ? { loadout } : {}) }).flatMap((cell) => drillTrials(cell, held));

/**
 * One drill trial of a strike's whole `settings` at `hz`: the cell's subject with its skill so
 * tuned (`withTuning`), scored for the search (`searchScore`: the cell's value, a blow short of the
 * bar graded below it), its value as the cell values it beside the score.
 */
async function strikeTrial(settings, trial, hz) {
  const played = await playTrial(trial, withTuning(subjectOf(trial).value, settings), { hz });
  return { score: searchScore(trial, played), value: played.value, outcome: played.outcome, down: !!played.reading.down };
}

/** A sit-back dimension's stage and the channels of its posture it moves, `@` both sides': `"sit back: hip.@ flexion"`. */
const stageChannels = (key) => { const [stage, channel] = key.split(": "); return { stage, channels: channel.includes("@") ? ["left", "right"].map((side) => channel.replace("@", side)) : [channel] }; };

/** A searched posture's anatomical channels, on either side for a bilateral or relative channel; a pose's time has none. */
const postureChannels = (key) => {
  const channel = key.split(": ")[1];
  return channel === "scale" ? [] : /\.(?:@|near|far) /.test(channel)
    ? ["left", "right"].map(side => channel.replace(/\.(?:@|near|far) /, `.${side} `)) : [channel];
};

/** The angle a sit-back's `settings` drive a dimension's channels toward: their own, else the recipe's (`SIT_BACK`). */
function sitBackAngle(settings, key) {
  const { stage, channels } = stageChannels(key);
  return settings.stages[stage]?.posture?.[channels[0]] ?? SIT_BACK.rise.find((one) => one.name === stage).posture[channels[0]] ?? 0;
}

/** `settings` with a dimension's channels driven toward `angle`. */
function sitBackWith(settings, key, angle) {
  const { stage, channels } = stageChannels(key), timing = settings.stages[stage] ?? { scale: 1 };
  return { ...settings, stages: { ...settings.stages, [stage]: { ...timing, posture: { ...timing.posture, ...Object.fromEntries(channels.map((name) => [name, angle])) } } } };
}

/** A roll dimension's stage and what it moves: a channel of the stage's pose, or `scale`, its time's. */
const rollKey = (key) => { const [stage, what] = key.split(": "); return { stage, what }; };

/** The value a step-up's `settings` give a roll dimension: their own, else the game's roll's (`ROLL_POSES`) and a time unscaled. */
function rollValue(settings, key) {
  const { stage, what } = rollKey(key);
  return what === "scale" ? settings.stages[`roll ${stage}`]?.scale ?? 1 : (settings.roll ?? ROLL_POSES)[stage][what] ?? 0;
}

/** `settings` with a roll dimension set to `value`: the roll's poses the game's where the settings have none of their own. */
function rollWith(settings, key, value) {
  const { stage, what } = rollKey(key);
  if (what === "scale") return { ...settings, stages: { ...settings.stages, [`roll ${stage}`]: { ...settings.stages[`roll ${stage}`], scale: value } } };
  const roll = settings.roll ?? ROLL_POSES;
  return { ...settings, roll: { ...roll, [stage]: { ...roll[stage], [what]: value } } };
}

/**
 * A staged record's trials on `model`: the drill's trials of the table's way-up cells of the ways
 * up `record` drives (`RECORD_WAYS`; `loadout`'s cells alone where given), their training twin's
 * (`twin`, the search's) or the cells' own (`cell`, the confirmation's).
 */
const wayUpTrials = (record) => (model, held, loadout) => {
  const cells = wayCells(RECORD_WAYS[record], model, loadout);
  if (cells.length === 0) throw new Error(`the table has no way-up cell of ${RECORD_WAYS[record].join(" or ")} on ${model}${loadout ? ` holding ${loadout}` : ""}`);
  return cells.flatMap((cell) => drillTrials(cell, held));
};

/**
 * One drill trial of a staged record's `settings` (the record `as` makes of them) at `hz`: the
 * cell's subject with every staged way up of its mind on the body's tuning with them
 * (`stagedValue`, `tuningOn`), scored as the cell values it, negated, as lower is better there; no
 * score for a fall not made or not exercised. It ends down where an attempt did not reach.
 */
const wayUpTrial = (as) => async (settings, trial, hz) => {
  const played = await playTrial(trial, stagedValue(subjectOf(trial).value, tuningOn(trial, as(settings))), { hz });
  return { score: played.value === null ? null : -played.value, outcome: played.outcome, down: played.value !== null && played.outcome !== "reached" };
};

/** What a way-up search plays and confirms on, in words. */
const wayUpSaid = (held) => held === "twin" ? "on their cells' training twins (the way-up drill's fresh falls and bouts) at 120 Hz" : "on their cells' own falls at 120 and 480 Hz, the worse counting";

/**
 * **What each skill's search plays**: the settings it searches, each with its range (the rest the
 * start's), read from settings by `get` and put into them by `set` where they are not the
 * settings' own keys, and `settle`, what the settings must keep between them; the trials it
 * searches on and confirms on (`search`, `confirm`, as `trials` takes them and `said` words
 * them), a trial's score, the score of a trial that threw (`error`: the worst a trial scores),
 * and what its lost trials are called (`lost`); the rates its confirmation plays at, the worse
 * counting (`rates`; it searches at the game's, 120 Hz);
 * its settings that are lengths of the body (`lengths`, m), scaled to a body that starts from
 * another's, and heights over the ground toward the target (`heights`, m), kept; and the skill
 * whose record its settings are (`record`), where they are not a record of their own.
 */
export const SEARCHES = {
  stomp: { dims: [["contactSpeed", 3, 14], ["swingSeconds", .1, .4], ["lift", .4, .9], ["over", .6, 1], ["alongNear", .35, .7], ["alongFar", .6, 1], ["chamberSeconds", .4, .8], ["brace", 0, .25]],
    // alongFar kept past alongNear.
    settle: (settings) => "alongFar" in settings && settings.alongFar <= settings.alongNear + .1 ? { ...settings, alongFar: Number((settings.alongNear + .1).toFixed(4)) } : settings,
    trials: strikeTrials("stomp"), search: "twin", confirm: "cell",
    said: (held) => held === "twin" ? "on its cells' training twins at 120 Hz" : "on its cells' own cases at 120 and 480 Hz, the worse counting",
    trial: strikeTrial, error: -3, lost: "falls", rates: CONFIRM_RATES,
    lengths: ["windup", "alongNear", "alongFar", "across", "returnNear"], heights: ["lift"],
    task: "the Strike drill's stomping rung (each foot at the middle mark of each of the game's foes lying limp), the body's stomp row" },
  "sit-back": { dims: [["plant: knee.@ flexion", 1.9, 2.2], ["plant: hip.@ flexion", 1.5, 2.1], ["plant: shoulder.@ flexion", 1.2, 2.2], ["plant: elbow.@ flexion", 0, 1.6],
      ["sit back: hip.@ flexion", 1.5, 2.2], ["sit back: shoulder.@ flexion", .2, 1.8], ["sit back: elbow.@ flexion", 0, 1.6], ["sit back: thoracic flexion", -.2, .35], ["sit back: ankle.@ dorsiflexion", 0, .7],
      ["up: hip.@ flexion", .4, .85], ["up: shoulder.@ flexion", 0, 1.4], ["up: thoracic flexion", -.2, .35]],
    get: sitBackAngle, set: sitBackWith, channels: postureChannels,
    trials: wayUpTrials("sit-back"), search: "twin", confirm: "cell", said: wayUpSaid,
    trial: wayUpTrial((sitBack) => ({ sitBack })), error: -ATTEMPT_CAP, lost: "falls with an attempt not reached", rates: CONFIRM_RATES,
    task: "the way-up cells of front-sit-back and sit-back" },
  // Every channel the game's roll poses drive (`ROLL_POSES`), within each body's range, and each stage's time.
  roll: { dims: [["wind: hip.far flexion", .4, 2], ["wind: hip.far abduction", 0, .55], ["wind: hip.near flexion", -.35, .8], ["wind: shoulder.near flexion", 1.4, 3],
      ["swing: hip.far flexion", .2, 1.8], ["swing: hip.far internal rotation", -.5, .64], ["swing: hip.near abduction", -.2, .55], ["swing: lumbar flexion", 0, .88],
      ["swing: shoulder.far flexion", .4, 2.6], ["swing: shoulder.near flexion", .2, 2.6], ["swing: shoulder.near abduction", .4, 3],
      ["over: hip.far flexion", .4, 2], ["over: hip.far abduction", 0, .55], ["over: shoulder.near flexion", 1.4, 3],
      ["flat: shoulder.near flexion", 1.4, 3], ["flat: shoulder.far internal rotation", -1.5, .4], ["flat: elbow.far flexion", .6, 2.4],
      ["wind: scale", .1, 1.2], ["swing: scale", .3, 2], ["over: scale", .3, 2.4], ["flat: scale", .3, 1.8]],
    get: rollValue, set: rollWith, channels: postureChannels, record: "step-up",
    trials: wayUpTrials("step-up"), search: "twin", confirm: "cell", said: wayUpSaid,
    trial: wayUpTrial((stepUp) => ({ stepUp })), error: -ATTEMPT_CAP, lost: "falls with an attempt not reached", rates: CONFIRM_RATES,
    task: "the way-up cells of staged-roll and staged-down" },
};

/** The search's ranges intersected with every channel they drive on `model`, rounded inward to the decoded angles' precision. */
export function searchOn(skill, model) {
  const search = SEARCHES[skill];
  if (!search?.channels) return search;
  const spec = modelSpec(model), ranges = new Map(spec.joints.flatMap(joint => joint.dofs.map(dof =>
    [`${joint.name} ${dof.positive}`, [dof.min.value + dof.bind.value, dof.max.value + dof.bind.value]])));
  return { ...search, dims: search.dims.map(([key, lo, hi]) => {
    for (const channel of search.channels(key)) {
      const range = ranges.get(channel);
      if (!range) throw new Error(`${skill}'s ${key} asks ${channel}, which ${model} lacks`);
      lo = Math.max(lo, Math.ceil(range[0] * 1e4) / 1e4);
      hi = Math.min(hi, Math.floor(range[1] * 1e4) / 1e4);
    }
    if (lo > hi) throw new Error(`${skill}'s ${key} has no range on ${model}`);
    return [key, lo, hi];
  }) };
}

/**
 * The settings a search starts from on `model`: `source`'s record, else its body's, else the
 * Warrior's; carried from another body, its lengths scaled by the body's stature over the
 * source's, its heights kept.
 */
export function startOf(skill, model, source) {
  const records = recordsOf(SEARCHES[skill].record ?? skill), spec = modelSpec(model), from = source ?? (records[bodyKey(spec)] ? model : "workshop-fighter"), fromSpec = modelSpec(from);
  const start = structuredClone(records[bodyKey(fromSpec)].settings);
  if (bodyKey(fromSpec) === bodyKey(spec)) return start;
  const scale = spec.stature.value / fromSpec.stature.value;
  for (const key of SEARCHES[skill].lengths ?? []) if (typeof start[key] === "number") start[key] = Number((start[key] * scale).toFixed(4));
  return start;
}

/** `settings` with the searched dimensions set from `u` in the unit cube, and what they must keep between them kept (`settle`). */
export function decode(search, start, u) {
  let out = { ...start };
  search.dims.forEach(([key, lo, hi], i) => {
    const value = Number((lo + (hi - lo) * Math.min(1, Math.max(0, u[i]))).toFixed(4));
    out = search.set ? search.set(out, key, value) : { ...out, [key]: value };
  });
  return search.settle?.(out) ?? out;
}

/** `text` written to `file` whole: beside it first, then moved over it, so a search cut off mid-write leaves the last whole one to resume. */
function save(file, text) {
  writeFileSync(`${file}.part`, text);
  renameSync(`${file}.part`, file);
}

/** The mean of `numbers` that are not null; null where none is. */
const meanOf = (numbers) => { const counted = numbers.filter((one) => one !== null && one !== undefined); return counted.length === 0 ? null : counted.reduce((sum, one) => sum + one, 0) / counted.length; };

/**
 * Each of `trials` of `settings`, played on the pool at `hz` (the trial's world's own rate where
 * not given): their mean score, and their mean value as the cell values it where a trial reads one
 * (a strike's), of the trials that count.
 */
async function scored(pool, settings, trials, hz) {
  // Each reading says which trial it is.
  const each = await Promise.all(trials.map(async (trial) => ({ trial, ...await pool.evaluate({ settings, trial, hz }) })));
  const error = each.find((r) => r.error);
  return { score: meanOf(each.map((r) => r.score)), value: meanOf(each.map((r) => r.value)), falls: each.filter((r) => r.felled || r.down).length, each, ...(error ? { error: error.error } : {}) };
}

/**
 * `settings` confirmed on `trials` at each of `rates` (one play at the world's own where none):
 * at each, the trials' value where they read one, else their score; the worse of them, higher
 * better, the one a record is kept on, and the most trials lost at any.
 */
async function confirmed(pool, settings, trials, rates) {
  const byRate = [];
  for (const hz of rates ?? [undefined]) byRate.push({ ...(hz === undefined ? {} : { hz }), ...await scored(pool, settings, trials, hz) });
  const at = (one) => one.value ?? one.score, worst = byRate.reduce((a, b) => at(b) < at(a) ? b : a);
  return { score: at(worst), falls: Math.max(...byRate.map((one) => one.falls)), byRate: byRate.map(({ each: _, ...one }) => one), each: worst.each,
    ...(byRate.find((one) => one.error) ? { error: byRate.find((one) => one.error).error } : {}) };
}

if (!isMainThread && workerData?.search) {
  const search = SEARCHES[workerData.skill];
  parentPort.on("message", async ({ id, x }) => {
    let r; try { r = await search.trial(x.settings, x.trial, x.hz ?? 120); } catch (error) { r = { score: search.error, down: true, error: String(error?.stack ?? error) }; }
    parentPort.postMessage({ id, r });
  });
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values, positionals: [skill, model] } = parseArgs({ allowPositionals: true, options: { out: { type: "string" }, confirm: { type: "string" }, write: { type: "boolean" },
    from: { type: "string" }, generations: { type: "string" }, lambda: { type: "string" }, sigma: { type: "string" }, workers: { type: "string" }, seed: { type: "string" }, resume: { type: "boolean" },
    until: { type: "string" }, patience: { type: "string" }, try: { type: "boolean" }, loadout: { type: "string" }, set: { type: "string" }, source: { type: "string" } } });
  const search = searchOn(skill, model);
  if (!search || !model) throw new Error(`usage: <skill> <model>, skill one of ${Object.keys(SEARCHES).join(", ")}`);
  const recordName = search.record ?? skill;
  if (values.loadout !== undefined && !search.rates) throw new Error(`${skill}'s trials are not a table row's: --loadout is not theirs`);
  const workers = Number(values.workers ?? Math.max(1, availableParallelism() - 4));
  const pool = workerPool(fileURLToPath(import.meta.url), { search: true, skill }, workers);
  const body = bodyKey(modelSpec(model)), started = Date.now();
  if (values.confirm) {
    const found = JSON.parse(readFileSync(values.confirm, "utf8")), trials = search.trials(model, search.confirm, values.loadout ?? found.loadout);
    // What the best must beat: the record the body plays now, which a search resumed after an install no longer starts from; its start where the body has none.
    const recorded = recordsOf(recordName)[body], record = recorded?.settings, against = record ? "record" : "start";
    const base = await confirmed(pool, record ?? found.start, trials, search.rates), best = await confirmed(pool, found.best.settings, trials, search.rates);
    const kept = best.score > base.score && best.falls <= base.falls ? "best" : against;
    const report = { skill, body, ...(search.rates ? { rates: search.rates } : {}), trials: trials.length, on: search.confirm, ...(found.ended ? { ended: found.ended } : {}), against,
      base: { score: base.score, falls: base.falls, byRate: base.byRate, each: base.each }, best: { score: best.score, falls: best.falls, byRate: best.byRate, each: best.each }, kept,
      seconds: Math.round((Date.now() - started) / 1000) };
    console.log(JSON.stringify(report));
    // A trial that threw is a defect, not a lost trial: nothing is kept on it.
    const threw = base.error ?? best.error;
    if (threw) { await pool.terminate(); throw new Error(`a confirming trial threw, nothing is written: ${threw}`); }
    if (values.write && kept === "record") console.log(`${recordName}: ${body}'s record is kept as it is, nothing written`);
    else if (values.write) {
      const commit = execSync("git rev-parse --short=8 HEAD").toString().trim(), settings = kept === "best" ? found.best.settings : found.start;
      const fmt = (x) => x.toFixed(3);
      const made = `Searched on the ${body.replace("+toes", "")} at ${commit} (research/skills/skill-search.mjs): CMA over ${search.dims.map(([key]) => key).join(", ")} from ${values.from ?? found.from}, `
        + `${found.checkpoint?.generation ?? found.log.length} generations of ${found.lambda}, on ${search.task} ${search.said(search.search)}, ${found.trials} trials a candidate, ${found.seconds} s; `
        + `on fresh trials ${search.said(search.confirm)} the search's best scored ${fmt(best.score)} (${best.falls} ${search.lost}) and ${record ? "the record it replaces" : "its start"} ${fmt(base.score)} (${base.falls} ${search.lost}): `
        + (kept === "best" ? "the best is kept." : "the start is kept.");
      // A search of part of a record keeps how the rest of it was made.
      writeRecord(recordName, body, search.record && recorded ? `${recorded.made} Its ${skill}: ${made}` : made, settings);
      console.log(`${recordName}: ${body}'s row written`);
    }
    await pool.terminate();
    process.exit(0);
  }
  if (!values.out) throw new Error("--out <file.json>");
  mkdirSync(dirname(values.out), { recursive: true });
  const set = values.set ? JSON.parse(values.set) : null;
  const saved = values.resume && existsSync(values.out) ? JSON.parse(readFileSync(values.out, "utf8")) : null, resume = saved?.checkpoint, before = saved?.seconds ?? 0;
  if (saved && (saved.skill !== skill || saved.body !== body)) throw new Error(`${values.out} is a search of ${saved.skill} on ${saved.body}, not of ${skill} on ${body}`);
  const loadout = saved?.loadout ?? values.loadout, start = saved?.start ?? { ...startOf(skill, model, values.source), ...set }, trials = search.trials(model, search.search, loadout), lambda = Number(values.lambda ?? 16);
  // With a plateau to end on and no count given, the search runs until it ends on one.
  const generations = Number(values.generations ?? (values.patience === undefined ? 10 : Number.MAX_SAFE_INTEGER));
  const sourceBody = bodyKey(modelSpec(values.source ?? (recordsOf(recordName)[body] ? model : "workshop-fighter")));
  const from = saved?.from ?? (`the ${sourceBody.replace("+toes", "")}'s record${sourceBody === body ? "" : `, its lengths scaled by the body's stature${search.heights ? " and its heights kept" : ""}`}`
    + (set ? ` with ${Object.entries(set).map(([key, value]) => `${key} ${value}`).join(", ")}` : ""));
  if (values.try) {
    const r = await scored(pool, start, trials), seconds = Math.round((Date.now() - started) / 1000);
    save(values.out, JSON.stringify({ skill, body, ...(loadout ? { loadout } : {}), from, start, lambda: 0, trials: trials.length, dims: search.dims, log: [], seconds, best: { score: r.score, settings: start, falls: r.falls, each: r.each } }));
    console.log(JSON.stringify({ skill, body, start: { score: r.score, falls: r.falls }, seconds }));
    await pool.terminate();
    process.exit(0);
  }
  const until = values.until === undefined ? Infinity : Number(values.until), patience = Number(values.patience ?? Infinity);
  const unit = search.dims.map(([key, lo, hi]) => Math.min(1, Math.max(0, ((search.get ? search.get(start, key) : start[key]) - lo) / (hi - lo))));
  let raised = resume?.best.g ?? 0, bestSoFar = resume?.best.score ?? -Infinity, ended = null;
  console.error(`${skill} on ${body}: ${trials.length} trials a candidate, ${lambda} candidates a generation, ${values.generations === undefined && values.patience !== undefined ? `until ${patience} generations raise nothing` : `${generations} generations`}, ${workers} workers`);
  const { best } = await cmaSearch({ n: search.dims.length, start: unit, sigma: Number(values.sigma ?? .2), lambda, generations, seed: Number(values.seed ?? 1), resume,
    // A candidate none of whose trials counts scores as one that threw.
    score: async (u) => { const r = await scored(pool, decode(search, start, u), trials); return { ...r, score: r.score ?? search.error }; },
    onGeneration(entry, { best, checkpoint }) {
      console.error(JSON.stringify({ ...entry, seconds: Math.round((Date.now() - started) / 1000) }));
      if (best.score > bestSoFar) { bestSoFar = best.score; raised = entry.g; }
      // How the search ended, once it has: on its plateau, at `--until`'s score, or at its count of generations with neither reached.
      ended = best.score >= until ? "until" : entry.g - raised >= patience ? "plateau" : entry.g + 1 >= generations ? "generations" : null;
      save(values.out, JSON.stringify({ skill, body, ...(loadout ? { loadout } : {}), from, start, lambda, trials: trials.length, dims: search.dims, log: checkpoint.log,
        seconds: before + Math.round((Date.now() - started) / 1000), ...(ended ? { ended } : {}),
        best: { score: best.score, settings: decode(search, start, best.u), falls: best.r.falls, each: best.r.each }, checkpoint }));
      if (ended) return false;
    } });
  console.log(JSON.stringify({ skill, body, ended, best: { score: best.score, g: best.g, settings: decode(search, start, best.u) }, seconds: Math.round((Date.now() - started) / 1000) }));
  await pool.terminate();
  process.exit(0);
}
