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
 * - The stomp: the Strike drill's `stomping` rung (`STRIKE_CASES`, `src/evaluation/strike/cases.ts`),
 *   each foot at the middle of a Warrior and a Skeleton lying limp from its gaps, thrown by Option
 *   Mind's stomp (`src/entrants/option/mind.ts`); a trial scores the drill's bar (`barScore`: -3 a
 *   fall, -1 nothing on the mark, 9 landed) and 5 a hit point the stomp dealt.
 * - The sit-back: the Rise drill's techniques that play its record (`front-sit-back`, `sit-back`),
 *   each alone with no mind (`buildTechnique`, `src/evaluation/technique.ts`) on the body holding
 *   each loadout minds are rated on: searched on the drill's `placed` rung (each from its own
 *   position at rest), confirmed on `placed` and `moving` (after the technique before it on the
 *   route) at seeds the drill does not play. The search moves the joint angles its three stages
 *   drive toward, never their times. A trial scores what a stand-up costs in play, s, negated:
 *   the time the technique took where the body stood; its longest run (`TECHNIQUE_LIMITS.run`)
 *   and up to 1 s more where it did not, less by how high the body got (`riseTrial`). A record it
 *   writes leaves the body's ground profiles stale: rebuild them
 *   (`research/skills/recovery/edge-profiles.mjs --model <body> --write`) in the same change, for
 *   the game's Mind; the table reads none.
 * - The roll: the Rise drill's `staged-roll` the same way, on its `placed` rung (from the back
 *   and each side) and confirmed on `placed` and `moving` (after a shove from standing). The
 *   search moves the joint angles the roll's four poses drive toward and each pose's time; its
 *   settings are the body's step-up record (`record`), whose roll poses are the game's
 *   (`ROLL_POSES`) where it has none of its own, and a row it writes keeps how the rest was made.
 *   A trial scores the time the roll took to have the body lying on its front, negated, as the
 *   sit-back's. The step-up's loadout rows (the Warrior's) keep the times they set. Its profiles
 *   are stale after a write, as the sit-back's.
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
 *   node research/skills/skill-search.mjs <skill> <model> --confirm <file.json> [--hz 480] [--write [--from "<what the search started from>"]]
 *
 * Harness: Node on Rapier (`DEFAULT_ENGINE`), each command one step late. The stomp: the bout
 * world (`buildBout`), 120 Hz, or `--hz`'s rate. The sit-back and the roll: the technique world,
 * 120 Hz, the one rate it plays at.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { execSync } from "node:child_process";
import { isMainThread, parentPort, workerData } from "node:worker_threads";
import "../../tests/harness/preload-data.mjs";
import { isRefused } from "../../src/core/refusal.ts";
import { buildBout, buildTechnique, RISE_CASES, STRIKE_CASES } from "../../src/app/node/evaluation.ts";
import { barScore } from "../../src/evaluation/strike/score.ts";
import { REPRESENTATIVE } from "../../src/evaluation/loadouts.ts";
import { TECHNIQUE_LIMITS } from "../../src/evaluation/technique.ts";
import { controllerOf } from "../../src/app/catalog.ts";
import { modelHolding, modelSpec } from "../../src/core/bodies/models.ts";
import { bodyKey } from "../../src/core/bodies/spec/body.ts";
import { DEFAULT_ENGINE } from "../../src/core/physics/engines.ts";
import { GROUND_POSTURES } from "../../src/game/lab/ground-starts.ts";
import { stepUpTuningWith } from "../../src/skills/recovery/implementations/staged/records.ts";
import { ROLL_POSES, SIT_BACK } from "../../src/skills/recovery/implementations/staged/stages.ts";
import { cmaSearch, workerPool } from "../cma.mjs";
import { recordsOf, writeRecord } from "./skill-records.mjs";

/** A mind throwing the stomp with `settings` at the middle of a body lying ahead: Option Mind's stomp, on any body. */
const stomper = (settings) => ({ ...controllerOf({ kind: "option" }).defaults, support: { kind: "support-fold" },
  executors: [{ name: "stomp", kind: "stomp", tuning: settings }],
  actions: [{ name: "stomp", executor: "stomp", effectors: ["foot.right", "foot.left"], regions: [{ kind: "mark", mark: "middle" }], aim: { kind: "centre", lead: 0 } }] });

/** One stomping trial of whole `settings`: the drill's bar and the hit points dealt. */
async function stompTrial(settings, { condition }) {
  const reading = await play(STRIKE_CASES.stomping, { mind: stomper(settings), skill: "stomp" }, condition);
  const dealt = Object.values(reading.dealt).reduce((sum, damage) => sum + damage, 0);
  return { score: barScore(reading, null) + 5 * dealt, outcome: reading.outcome, down: reading.down, dealt, foot: reading.hit?.foot?.speed ?? null };
}

/** The stomping rung's trials on `model`: each foot at each target from each gap. */
const stompTrials = (model, gaps) => STRIKE_CASES.stomping.conditions.filter((c) => c.model === "workshop-fighter")
  .flatMap((c) => gaps.map((gap) => ({ condition: { ...c, model, gap } }))).filter((t, i, all) => all.findIndex((u) => JSON.stringify(u) === JSON.stringify(t)) === i);

/** A sit-back dimension's stage and the channels of its posture it moves, `@` both sides': `"sit back: hip.@ flexion"`. */
const stageChannels = (key) => { const [stage, channel] = key.split(": "); return { stage, channels: channel.includes("@") ? ["left", "right"].map((side) => channel.replace("@", side)) : [channel] }; };

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
 * The Rise drill's trials of `edges` on `model`, holding each loadout minds are rated on: on each
 * of `rungs`, each technique from each position it is begun from (`placed`) or after the technique
 * before it (`moving`), at each of `seeds`; a start the drill refuses is left out.
 */
const riseTrials = (edges) => (model, { rungs, seeds }) => rungs.flatMap((rung) => edges.flatMap((edge) => REPRESENTATIVE.flatMap((loadout) => {
  const carrier = { model, held: loadout.right, ...(loadout.left === "empty" ? {} : { left: loadout.left }) };
  const conditions = rung === "placed" ? GROUND_POSTURES.flatMap((posture) => seeds.map((seed) => ({ ...carrier, posture, seed }))) : seeds.map((seed) => ({ ...carrier, seed }));
  return conditions.filter((condition) => RISE_CASES[rung].faults({ kind: edge }, condition).length === 0).map((condition) => ({ rung, edge, condition }));
})));

/**
 * One Rise trial of `edges`' `settings`: the drill's case, those of its techniques that are `edges`
 * played under the body's step-up tuning with the candidate `as` makes of `settings` in place of
 * its record (`stepUpTuningWith`). Its score is what the technique costs in play, s, negated: its
 * time where it was done (the body stood and stayed up, or lay where the technique takes it);
 * where it was not, its longest run and up to 1 s more, less by how high the middle of the trunk
 * got, as a part of the body's stature.
 */
const riseTrial = (edges, as) => async (settings, { rung, edge, condition }) => {
  const world = RISE_CASES[rung].world([{ kind: edge }], condition, DEFAULT_ENGINE, [{}]);
  if (isRefused(world)) throw new Error(world.refused);
  const one = world.technique, spec = modelHolding(one.model, { left: one.left ?? "empty", right: one.held });
  const tuning = stepUpTuningWith(spec, as(settings));
  const built = await buildTechnique({ ...one, configs: Object.fromEntries(one.chain.filter((name) => edges.includes(name)).map((name) => [name, { kind: name, tuning }])) }, world.engine);
  if (isRefused(built)) throw new Error(built.refused);
  try {
    const trunk = built.body.segments.get("middleTrunk");
    let peak = 0;
    while (!built.ended) { built.world.step(); built.afterStep(); peak = Math.max(peak, trunk.pose.position.y); }
    const link = built.reading().links.at(-1), done = link.end === "done", height = Math.min(1, peak / spec.stature.value);
    return { score: done ? -link.seconds : -(TECHNIQUE_LIMITS.run + 1 - height), end: link.end, seconds: link.seconds, height, down: !done };
  } finally { built.dispose(); }
};

/** The techniques that play the sit-back's record (from the front in one rise, and from hands and knees), and the roll's. */
const SIT_BACK_EDGES = ["front-sit-back", "sit-back"], ROLL_EDGES = ["staged-roll"];

/** The Rise drill's rungs and seeds a technique's search plays, and those its `--confirm` plays: other seeds, and the technique after what comes before it. */
const RISE_SEARCH = { rungs: ["placed"], seeds: [1, 2, 3, 4, 5, 6] }, RISE_CONFIRM = { rungs: ["placed", "moving"], seeds: [7, 8, 9, 10, 11, 12] };
const riseSaid = ({ rungs, seeds }) => `on its ${rungs.join(" and ")} rung${rungs.length > 1 ? "s" : ""} at seeds ${seeds[0]} to ${seeds.at(-1)}`;

/**
 * **What each skill's search plays**: the settings it searches, each with its range (the rest the
 * start's), read from settings by `get` and put into them by `set` where they are not the
 * settings' own keys, and `settle`, what the settings must keep between them; the trials it
 * searches on and confirms on (`search`, `confirm`, as `trials` takes them and `said` words
 * them), a trial's score, the score of a trial that threw (`error`: the worst a trial scores),
 * and what its lost trials are called (`lost`); whether its world takes a rate (`rates`, `--hz`);
 * its settings that are lengths of the body (`lengths`, m), scaled to a body that starts from
 * another's, and heights over the ground toward the target (`heights`, m), kept; and the skill
 * whose record its settings are (`record`), where they are not a record of their own.
 */
export const SEARCHES = {
  stomp: { dims: [["contactSpeed", 3, 14], ["swingSeconds", .1, .4], ["lift", .4, .9], ["over", .6, 1], ["alongNear", .35, .7], ["alongFar", .6, 1], ["chamberSeconds", .4, .8], ["brace", 0, .25]],
    // alongFar kept past alongNear.
    settle: (settings) => "alongFar" in settings && settings.alongFar <= settings.alongNear + .1 ? { ...settings, alongFar: Number((settings.alongNear + .1).toFixed(4)) } : settings,
    trials: stompTrials, search: [.8, 1.2], confirm: [.9, 1, 1.1], said: (gaps) => `from ${gaps.join(", ")} m`, trial: stompTrial, error: -3, lost: "falls", rates: true,
    lengths: ["windup", "alongNear", "alongFar", "across", "returnNear"], heights: ["lift"],
    task: "the Strike drill's stomping rung (each foot at the middle mark of a Warrior and a Skeleton lying limp)" },
  "sit-back": { dims: [["plant: knee.@ flexion", 1.9, 2.2], ["plant: hip.@ flexion", 1.5, 2.1], ["plant: shoulder.@ flexion", 1.2, 2.2], ["plant: elbow.@ flexion", 0, 1.6],
      ["sit back: hip.@ flexion", 1.5, 2.2], ["sit back: shoulder.@ flexion", .2, 1.8], ["sit back: elbow.@ flexion", 0, 1.6], ["sit back: thoracic flexion", -.2, .35], ["sit back: ankle.@ dorsiflexion", 0, .7],
      ["up: hip.@ flexion", .4, .85], ["up: shoulder.@ flexion", 0, 1.4], ["up: thoracic flexion", -.2, .35]],
    get: sitBackAngle, set: sitBackWith,
    trials: riseTrials(SIT_BACK_EDGES), search: RISE_SEARCH, confirm: RISE_CONFIRM, said: riseSaid,
    trial: riseTrial(SIT_BACK_EDGES, (sitBack) => ({ sitBack })), error: -(TECHNIQUE_LIMITS.run + 1), lost: "not stood",
    task: "the Rise drill's front-sit-back and sit-back, each alone on the body holding each rated loadout" },
  // Every channel the game's roll poses drive (`ROLL_POSES`), within each body's range, and each stage's time.
  roll: { dims: [["wind: hip.far flexion", .4, 2], ["wind: hip.far abduction", 0, .55], ["wind: hip.near flexion", -.25, .8], ["wind: shoulder.near flexion", 1.4, 3],
      ["swing: hip.far flexion", .2, 1.8], ["swing: hip.far internal rotation", -.5, .64], ["swing: hip.near abduction", -.2, .55], ["swing: lumbar flexion", 0, .88],
      ["swing: shoulder.far flexion", .4, 2.6], ["swing: shoulder.near flexion", .2, 2.6], ["swing: shoulder.near abduction", .4, 3],
      ["over: hip.far flexion", .4, 2], ["over: hip.far abduction", 0, .55], ["over: shoulder.near flexion", 1.4, 3],
      ["flat: shoulder.near flexion", 1.4, 3], ["flat: shoulder.far internal rotation", -1.5, .4], ["flat: elbow.far flexion", .6, 2.4],
      ["wind: scale", .1, 1.2], ["swing: scale", .3, 2], ["over: scale", .3, 2.4], ["flat: scale", .3, 1.8]],
    get: rollValue, set: rollWith, record: "step-up",
    trials: riseTrials(ROLL_EDGES), search: RISE_SEARCH, confirm: RISE_CONFIRM, said: riseSaid,
    trial: riseTrial(ROLL_EDGES, (stepUp) => ({ stepUp })), error: -(TECHNIQUE_LIMITS.run + 1), lost: "not on the front",
    task: "the Rise drill's staged-roll, alone on the body holding each rated loadout" },
};

/** Play `subject` (a tuning, or a strike subject) on `condition` of `cases` to its reader's end. */
async function play(cases, subject, condition) {
  const world = cases.world([subject], condition, undefined, [{}]);
  if (isRefused(world)) throw new Error(world.refused);
  const built = await buildBout(world.recipe, { hz: workerData?.hz ?? 120 });
  if (isRefused(built)) throw new Error(built.refused);
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

/** Each of `trials` of `settings`, played on the pool, and their mean score. */
async function scored(pool, settings, trials) {
  // Each reading says which trial it is.
  const each = await Promise.all(trials.map(async (trial) => ({ trial, ...await pool.evaluate({ settings, trial }) })));
  const error = each.find((r) => r.error);
  return { score: each.reduce((sum, r) => sum + r.score, 0) / each.length, falls: each.filter((r) => r.felled || r.down).length, each, ...(error ? { error: error.error } : {}) };
}

if (!isMainThread && workerData?.search) {
  const search = SEARCHES[workerData.skill];
  parentPort.on("message", async ({ id, x }) => {
    let r; try { r = await search.trial(x.settings, x.trial); } catch (error) { r = { score: search.error, down: true, error: String(error?.stack ?? error) }; }
    parentPort.postMessage({ id, r });
  });
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values, positionals: [skill, model] } = parseArgs({ allowPositionals: true, options: { out: { type: "string" }, confirm: { type: "string" }, write: { type: "boolean" },
    from: { type: "string" }, generations: { type: "string" }, lambda: { type: "string" }, sigma: { type: "string" }, workers: { type: "string" }, seed: { type: "string" }, resume: { type: "boolean" },
    until: { type: "string" }, patience: { type: "string" }, try: { type: "boolean" }, hz: { type: "string" }, set: { type: "string" }, source: { type: "string" } } });
  const search = SEARCHES[skill];
  if (!search || !model) throw new Error(`usage: <skill> <model>, skill one of ${Object.keys(SEARCHES).join(", ")}`);
  const recordName = search.record ?? skill;
  if (values.hz !== undefined && !search.rates) throw new Error(`${skill}'s trials play at one rate: --hz is not theirs`);
  const workers = Number(values.workers ?? Math.max(1, availableParallelism() - 4));
  const hz = Number(values.hz ?? 120), pool = workerPool(fileURLToPath(import.meta.url), { search: true, skill, hz }, workers);
  const body = bodyKey(modelSpec(model)), started = Date.now();
  if (values.confirm) {
    const found = JSON.parse(readFileSync(values.confirm, "utf8")), trials = search.trials(model, search.confirm);
    // What the best must beat: the record the body plays now, which a search resumed after an install no longer starts from; its start where the body has none.
    const recorded = recordsOf(recordName)[body], record = recorded?.settings, against = record ? "record" : "start";
    const base = await scored(pool, record ?? found.start, trials), best = await scored(pool, found.best.settings, trials);
    const kept = best.score > base.score && best.falls <= base.falls ? "best" : against;
    const report = { skill, body, ...(search.rates ? { hz } : {}), trials: trials.length, on: search.confirm, ...(found.ended ? { ended: found.ended } : {}), against,
      base: { score: base.score, falls: base.falls, each: base.each }, best: { score: best.score, falls: best.falls, each: best.each }, kept,
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
  const start = saved?.start ?? { ...startOf(skill, model, values.source), ...set }, trials = search.trials(model, search.search), lambda = Number(values.lambda ?? 16);
  // With a plateau to end on and no count given, the search runs until it ends on one.
  const generations = Number(values.generations ?? (values.patience === undefined ? 10 : Number.MAX_SAFE_INTEGER));
  const sourceBody = bodyKey(modelSpec(values.source ?? (recordsOf(recordName)[body] ? model : "workshop-fighter")));
  const from = saved?.from ?? (`the ${sourceBody.replace("+toes", "")}'s record${sourceBody === body ? "" : `, its lengths scaled by the body's stature${search.heights ? " and its heights kept" : ""}`}`
    + (set ? ` with ${Object.entries(set).map(([key, value]) => `${key} ${value}`).join(", ")}` : ""));
  if (values.try) {
    const r = await scored(pool, start, trials), seconds = Math.round((Date.now() - started) / 1000);
    save(values.out, JSON.stringify({ skill, body, from, start, lambda: 0, trials: trials.length, dims: search.dims, log: [], seconds, best: { score: r.score, settings: start, falls: r.falls, each: r.each } }));
    console.log(JSON.stringify({ skill, body, start: { score: r.score, falls: r.falls }, seconds }));
    await pool.terminate();
    process.exit(0);
  }
  const until = values.until === undefined ? Infinity : Number(values.until), patience = Number(values.patience ?? Infinity);
  const unit = search.dims.map(([key, lo, hi]) => Math.min(1, Math.max(0, ((search.get ? search.get(start, key) : start[key]) - lo) / (hi - lo))));
  let raised = resume?.best.g ?? 0, bestSoFar = resume?.best.score ?? -Infinity, ended = null;
  console.error(`${skill} on ${body}: ${trials.length} trials a candidate, ${lambda} candidates a generation, ${values.generations === undefined && values.patience !== undefined ? `until ${patience} generations raise nothing` : `${generations} generations`}, ${workers} workers`);
  const { best } = await cmaSearch({ n: search.dims.length, start: unit, sigma: Number(values.sigma ?? .2), lambda, generations, seed: Number(values.seed ?? 1), resume,
    score: (u) => scored(pool, decode(search, start, u), trials),
    onGeneration(entry, { best, checkpoint }) {
      console.error(JSON.stringify({ ...entry, seconds: Math.round((Date.now() - started) / 1000) }));
      if (best.score > bestSoFar) { bestSoFar = best.score; raised = entry.g; }
      // How the search ended, once it has: on its plateau, at `--until`'s score, or at its count of generations with neither reached.
      ended = best.score >= until ? "until" : entry.g - raised >= patience ? "plateau" : entry.g + 1 >= generations ? "generations" : null;
      save(values.out, JSON.stringify({ skill, body, from, start, lambda, trials: trials.length, dims: search.dims, log: checkpoint.log,
        seconds: before + Math.round((Date.now() - started) / 1000), ...(ended ? { ended } : {}),
        best: { score: best.score, settings: decode(search, start, best.u), falls: best.r.falls, each: best.r.each }, checkpoint }));
      if (ended) return false;
    } });
  console.log(JSON.stringify({ skill, body, ended, best: { score: best.score, g: best.g, settings: decode(search, start, best.u) }, seconds: Math.round((Date.now() - started) / 1000) }));
  await pool.terminate();
  process.exit(0);
}
