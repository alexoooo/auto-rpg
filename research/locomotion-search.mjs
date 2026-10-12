/**
 * **The stride's, the run's or a SIMBICON way's settings searched** on the locomotion test bed (`research/locomotion-run.mjs`:
 * Node stand, Rapier, 120 Hz), by diagonal CMA-ES in the unit cube (`research/cma.mjs`).
 *
 * A candidate's score is the speed it walks and holds: for each body, line and seed, the paces are
 * climbed in turn, each run for `--seconds` under the scorecard's gusts, until one falls; the
 * ladder's speed is the mean speed along the line at the fastest pace held (0 if the first falls).
 * The score is the mean of the ladders' speeds, forward weighted `FORWARD` times another line.
 *
 *   node research/locomotion-search.mjs --out .snap/search/a [--generations 30] [--lambda 12] [--seeds 1,2,3]
 *     [--models workshop-fighter,workshop-rogue] [--lines forward,right,back] [--seconds 15] [--seed 1]
 *     [--start '{"swing":0.34}'] [--dims swing,transfer,...] [--live] [--score '{"swing":0.34}'] [--workers 30] [--kind run]
 *     [--kind simbicon --way forward|back|side|all] [--objective battery [--turns] | played | both]
 *
 * - `--live` scores the start and each dimension at either end of its range, the rest at the start:
 *   whether something reads it, and which way it moves the score.
 * - `--score` scores one setting (merged over the defaults) and prints its means by body and line, and
 *   with `--ladders` each ladder.
 * - Otherwise it searches, and writes each generation to `<out>.jsonl` and the best to `<out>-best.json`.
 *
 * The settings the search moves are `DIMS`; the rest are the stride's defaults (`STRIDE`). With
 * `--kind run`, the run's (`RUN_DIMS`, `RUN`), on the forward line, its paces `RUN_PACES`.
 *
 * With `--kind simbicon`, the SIMBICON walk's gait one way (`--way`: `forward` on the forward line,
 * `back` on the back line, `side` on the right and left), forward's as its settings and the others
 * as the part's tuning over their defaults (`WAY_DIMS`). A pace holds only if the walk also went as
 * asked (`wentAsAsked`: along the line at least `WENT.along` of the pace), and the start's ladders
 * are a floor: each pace a body's line, or its square, holds short of the start's on its worst seed
 * costs `HELD_COST` of the score. And a walk must stop: on each body, line and seed it walks at
 * `STOP.pace` and is asked to stand after `STOP.after` s, calm; each that falls, or still goes faster
 * than `STOP.rest` over the run's last second, costs `STOP_COST`.
 *
 * With `--objective battery` a SIMBICON candidate is scored instead on the envelope's walk battery
 * (`walk` in `core-stance-trials.mjs`: from standing, each way at each speed for 8 s, then a stop,
 * with each thing a fight puts in the right hand), calm: on each body each way of `BATTERY.ways`
 * climbs `BATTERY.speeds` while every hold walks as asked, no faster than `OVER`, and stops without
 * falling, and earns each step of speed times the holds' mean `quality`, up to and including the first it
 * did not hold whole; the score is the mean of the ways' credits, each weighted `BATTERY.weight`,
 * over the ways the searched way's gait reads (`--ways` names others), and with `--turns` its turns'
 * (`TURNS`).
 *
 * With `--objective played` a SIMBICON candidate is scored on the Lab's Run as it plays it
 * (`locomotion-run.mjs --played`: under the body's measured envelope, which the candidate did not
 * make): on each body each of `PLAYED.tracks` at each of its paces, calm and in each gust, for
 * `PLAYED.seconds`; the score is the mean speed made along the track, a fall stopping the body where
 * it fell. Its winds' seeds are not the ones the Run's bed is read on. With `--way all` it searches
 * every way's gait at once, each setting named for its way (`forward.cv`, `side.cv`, `back.cv`), and
 * the walk's speed-up and swerve (`ALL_EXTRA`).
 *
 * With `--objective both` the score is the battery's and the played objective's together: the
 * battery holds a candidate to setting off, going as asked and stopping, which the Run under the
 * envelope as measured does not see, and the Run to its gusts and bends, which the battery does not.
 */
import { Worker } from "node:worker_threads";
import { appendFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { cmaSearch } from "./cma.mjs";
import { STRIDE } from "../src/core/skills/stride.ts";
import { RUN } from "../src/core/skills/run.ts";
import { SIMBICON, simbiconWays } from "../src/core/skills/simbicon.ts";
import { TURNED, WENT, wentAsAsked } from "../src/core/control/stance-envelope.ts";
import { HELD } from "../src/core/items/held.ts";

/** Each setting searched and its range; a flag is on above the middle. */
const DIMS = {
  swing: [0.25, 0.45], transfer: [0.01, 0.12], lift: [0.03, 0.09], settle: [0.04, 0.12], width: [0.12, 0.3], longest: [0.6, 1],
  accel: [1, 4], push: [0, 0.4], arms: [0, 2], ramp: [0, 0.2], drive: [0, 1], lengthen: [0, 0.5], lands: "flag",
  lever: [0.1, 1], launch: [0, 0.6], lead: [0, 0.15], momentum: "flag",
};

/** The run's settings searched and their ranges; a lever of 0 is the stance's own. */
const RUN_DIMS = {
  contact: [0.15, 0.4], flight: [0.2, 0.8], lift: [0.05, 0.2], settle: [0.03, 0.1], width: [0.1, 0.35], gain: [0, 0.3],
  accel: [0.5, 4], drop: [0, 0.15], arms: [0, 4], drive: [0, 1], lever: [0, 1],
};

/** A SIMBICON way's settings searched and their ranges (`SimbiconWay`). */
const WAY_DIMS = {
  swingHip: [-0.2, 0.8], swingHipLate: [-0.3, 0.4], swingSpread: [-0.3, 0.2], swingKnee: [0.4, 1.6], swingKneeLate: [0, 0.5],
  swingAnkle: [-0.1, 0.35], swingAnkleLate: [-0.1, 0.35], stanceKnee: [0, 0.4], stanceKneeLate: [0, 0.4], stanceAnkle: [-0.4, 0.2],
  cvAnkle: [0, 1], lean: [-0.2, 0.2], cd: [-0.5, 0.5], cv: [-0.2, 0.8], cdLate: [-0.5, 0.5], cvLate: [-0.2, 0.6],
  cdSide: [-0.5, 0.5], cvSide: [-0.3, 0.5], lead: [-0.2, 0.4], leadSide: [0, 0.5], width: [0.05, 0.3],
};

/** The ways `--way all` searches together, and the gait's settings it searches with them. */
const ALL_WAYS = ["forward", "side", "back"];
const ALL_EXTRA = { speedup: [0.3, 1], swerve: [0.2, 1.5] };
const ALL_DIMS = { ...Object.fromEntries(ALL_WAYS.flatMap((w) => Object.entries(WAY_DIMS).map(([key, range]) => [`${w}.${key}`, range]))), ...ALL_EXTRA };

/**
 * The played objective's runs: its tracks, the paces asked (the envelope caps each way), its winds
 * (rate a second, strength N, seed: calm, then gusts on seeds the Run's bed is not read on) and each
 * run's length, s.
 */
const PLAYED = { tracks: ["circle", "shuttle", "square"], paces: [0.5, 1, 1.5], winds: [[0, 0, 0], [1, 20, 11], [1, 20, 12], [1, 20, 13]], seconds: 40 };

/** The score a SIMBICON way loses for each pace a body's line or square holds short of the start's, m/s. */
const HELD_COST = 1;

/** A SIMBICON way's stop: the pace walked, m/s, when it is asked to stand and how long it has to, s, and the most it may then go, m/s. */
const STOP = { pace: 0.3, after: 6, seconds: 12, rest: 0.1 };

/** The score a SIMBICON way loses for each stop that falls or does not come to rest. */
const STOP_COST = 1;

/** The paces a run climbs, m/s. */
const RUN_PACES = [1, 1.5, 2, 2.5, 3];

/** How many times another line's ladder the forward one counts. */
const FORWARD = 2;

/**
 * The battery objective's speeds climbed, m/s; its ways, degrees to the right of forward; and each
 * way's weight: forward most, for the Run's circle and shuttle walk forward.
 */
/**
 * How near a battery hold came to walking as asked, [0, 1]: 0 if it fell; else each of `wentAsAsked`'s
 * bounds and `OVER`'s ceiling on the pace made, missed by a share of its tolerance, takes that share off.
 * A walk made far faster than asked overshoots every corner of the Run's square.
 */
const OVER = { share: 1.3, plus: 0.15 };
function quality(r, asked) {
  if (r.fell) return 0;
  const short = (WENT.along * asked - r.along) / ((1 - WENT.along) * asked), wide = (Math.abs(r.across) - WENT.across * asked) / (WENT.across * asked);
  const over = (r.along - (OVER.share * asked + OVER.plus)) / (0.5 * asked + 0.3);
  return Math.max(0, 1 - Math.max(0, short) - Math.max(0, wide) - Math.max(0, over));
}
const BATTERY = { speeds: [0.2, 0.3, 0.4, 0.5, 0.7, 1, 1.2, 1.4, 1.7, 2], ways: [0, 90, 180, 270, 45], weight: { 0: 2, 90: 1, 180: 1, 270: 1, 45: 0.5 } };

/**
 * With `--turns`, the turn battery's cells the battery objective climbs as well (`turn` in
 * `core-stance-trials.mjs`: walking forward at each speed, the heading turned half round, both ways,
 * with each thing a fight holds, begun as the walk sets off and under way): at each speed the rates,
 * each earning its step of rate times the turns' mean `turnQuality`, up to and including the first
 * not held whole; their mean credit, rad/s, adds `weight` times itself to the score. The Run's shuttle
 * turns slow and tight, its circle at speed.
 */
const TURNS = { speeds: [0.3, 0.7, 1.2], rates: [0.35, 0.5, 0.7, 1, 1.4], afters: [0, 3], weight: 1 };
/** How near a turn came to holding, [0, 1]: 0 if it fell; else less the share of `TURNED` its facing lagged past it. */
const turnQuality = (r) => r.fell ? 0 : Math.max(0, 1 - Math.max(0, r.lag - TURNED) / TURNED);

/** The paces climbed, m/s: the scorecard's lines'. */
const PACES = [0.3, 0.5, 0.7, 1, 1.2, 1.4, 1.7, 2];

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const list = (name, fallback) => arg(name, fallback).split(",");
const objective = arg("objective", "bed"), turning = process.argv.includes("--turns");
const kind = arg("kind", "stride"), running = kind === "run", way = kind === "simbicon" ? arg("way", "back") : null;
const SPACE = running ? RUN_DIMS : way === "all" ? ALL_DIMS : way ? WAY_DIMS : DIMS, LADDER = running ? RUN_PACES : PACES;
const BASE = running ? RUN : way === "all" ? allOf(SIMBICON, simbiconWays()) : way === "forward" ? wayOf(SIMBICON) : way ? simbiconWays()[way] : STRIDE;
const models = list("models", way ? "workshop-fighter" : "workshop-fighter,workshop-rogue");
const lines = list("lines", running || way === "forward" ? "forward" : way === "back" ? "back" : way ? "right,left" : "forward,right,back");
const seeds = list("seeds", "1,2,3").map(Number), seconds = Number(arg("seconds", "15"));
const dims = arg("dims") ? list("dims") : Object.keys(SPACE), out = arg("out");
const workers = Math.min(Number(arg("workers", String(Math.max(1, availableParallelism() - 2)))), 64);
const start = { ...BASE, ...JSON.parse(arg("start", "{}")) };
/** The battery's ways a candidate is scored on: `--ways`, else those its way's gait reads (forward's, forward and between forward and the side). */
const batteryWays = arg("ways") ? list("ways").map(Number) : way === "back" ? [180] : way === "side" ? [90, 270, 45] : way === "forward" ? [0, 45] : BATTERY.ways;

/** A setting's place in its range, [0, 1]; a flag's, a quarter or three quarters. */
function toUnit(key, value) {
  const range = SPACE[key];
  if (range === "flag") return value ? 0.75 : 0.25;
  return Math.min(1, Math.max(0, ((value ?? range[0]) - range[0]) / (range[1] - range[0])));
}
/** The legs of `values`: the skill's settings, or a SIMBICON walk with them as forward's settings or another way's tuning. */
const legsOf = (values) => way === "all" ? allLegs(values) : way === "forward" ? { kind, ...SIMBICON, ...values } : way ? { kind, ...SIMBICON, tuning: { [way]: values } } : { kind, ...values };
/** Every way's settings and the extras of a SIMBICON gait (`settings`, with `ways` its other ways' tuning), named as `--way all` searches them. */
function allOf(settings, ways) {
  const of = { forward: wayOf(settings), ...ways };
  return { ...Object.fromEntries(ALL_WAYS.flatMap((w) => Object.keys(WAY_DIMS).map((key) => [`${w}.${key}`, of[w][key]]))), ...Object.fromEntries(Object.keys(ALL_EXTRA).map((key) => [key, settings[key]])) };
}
/** The SIMBICON legs of `values` named as `--way all` searches them. */
function allLegs(values) {
  const forward = {}, tuning = { side: {}, back: {} }, extra = {};
  for (const [name, value] of Object.entries(values)) {
    const dot = name.indexOf("."), w = dot < 0 ? null : name.slice(0, dot), key = name.slice(dot + 1);
    if (w === "forward") forward[key] = value; else if (w) tuning[w][key] = value; else extra[name] = value;
  }
  return { kind, ...SIMBICON, ...extra, ...forward, tuning };
}
/** A SIMBICON gait's settings that a way changes. */
function wayOf(settings) { return Object.fromEntries(Object.keys(WAY_DIMS).map((key) => [key, settings[key]])); }
/** The settings at `u` over `dims`, the rest the start's. */
function settingsAt(u) {
  const settings = { ...start };
  dims.forEach((key, i) => {
    const range = SPACE[key];
    if (range === "flag") { if (u[i] > 0.5) settings[key] = true; else delete settings[key]; }
    else settings[key] = Number((range[0] + u[i] * (range[1] - range[0])).toFixed(4));
  });
  return legsOf(settings);
}

const pool = objective === "battery" ? [] : Array.from({ length: workers }, () => new Worker(fileURLToPath(new URL("./locomotion-run.mjs", import.meta.url))));
const idle = [...pool], queue = [], waiting = new Map();
let nextId = 0;
const pump = () => { while (idle.length && queue.length) { const job = queue.shift(); idle.pop().postMessage(job); } };
for (const worker of pool) worker.on("message", ({ id, result, error }) => {
  const done = waiting.get(id);
  waiting.delete(id);
  idle.push(worker);
  pump();
  if (error) done.reject(new Error(error)); else done.resolve(result);
});
/** One run on the bed. */
const run = (job) => new Promise((resolve, reject) => {
  const id = nextId++;
  waiting.set(id, { resolve, reject });
  queue.push({ id, side: 6, radius: 4, stance: null, physique: null, sole: false, probe: null, wind: { rate: 1, strength: 20 }, seconds, ...job });
  pump();
});

const trialPool = objective === "battery" || objective === "both" ? Array.from({ length: workers }, () => new Worker(fileURLToPath(new URL("./core-stance-worker.mjs", import.meta.url)))) : [];
const trialIdle = [...trialPool], trialQueue = [], trialWaiting = new Map();
const trialPump = () => { while (trialIdle.length && trialQueue.length) { const job = trialQueue.shift(); trialIdle.pop().postMessage(job); } };
for (const worker of trialPool) worker.on("message", ({ id, result, error }) => {
  const done = trialWaiting.get(id);
  trialWaiting.delete(id);
  trialIdle.push(worker);
  trialPump();
  if (error) done.reject(new Error(error)); else done.resolve(result);
});
/** One trial of the walk battery. */
const trial = (job) => new Promise((resolve, reject) => {
  const id = nextId++;
  trialWaiting.set(id, { resolve, reject });
  trialQueue.push({ id, trial: "walk", hz: 120, stance: {}, ...job });
  trialPump();
});

/** A way of the battery on one body: its credit, and the fastest speed every hold held. */
async function batteryLadder(legs, model, degrees) {
  let credit = 0, last = 0, fastest = 0;
  for (const speed of BATTERY.speeds) {
    const results = await Promise.all(HELD.map((held) => trial({ model, degrees, speed, held, legs })));
    const share = results.reduce((sum, r) => sum + quality(r, speed), 0) / HELD.length;
    credit += (speed - last) * share;
    last = speed;
    if (share < 1) break;
    fastest = speed;
  }
  return { model, degrees, credit, fastest };
}

/** A speed of the turn battery on one body: its credit, and the fastest rate every turn held. */
async function turnLadder(legs, model, speed) {
  let credit = 0, last = 0, fastest = 0;
  for (const rate of TURNS.rates) {
    const results = await Promise.all(HELD.flatMap((held) => [1, -1].flatMap((sense) => TURNS.afters.map((after) => trial({ trial: "turn", model, speed, rate, sense, held, after, legs })))));
    const share = results.reduce((sum, r) => sum + turnQuality(r), 0) / results.length;
    credit += (rate - last) * share;
    last = rate;
    if (share < 1) break;
    fastest = rate;
  }
  return { model, speed, credit, fastest };
}

/** A candidate's battery score: its ways' credits, weighted, with its turns' if asked, and each body's fastest each way and each turn. */
async function batteryScore(legs) {
  const [ladders, turns] = await Promise.all([
    Promise.all(models.flatMap((model) => batteryWays.map((degrees) => batteryLadder(legs, model, degrees)))),
    turning ? Promise.all(models.flatMap((model) => TURNS.speeds.map((speed) => turnLadder(legs, model, speed)))) : [],
  ]);
  const walked = ladders.reduce((s, l) => s + BATTERY.weight[l.degrees] * l.credit, 0) / ladders.reduce((s, l) => s + BATTERY.weight[l.degrees], 0);
  const total = walked + (turning ? TURNS.weight * turns.reduce((s, t) => s + t.credit, 0) / turns.length : 0);
  const by = Object.fromEntries(models.map((model) => [model.replace("workshop-", ""), batteryWays.map((d) => ladders.find((l) => l.model === model && l.degrees === d).fastest).join(",")
    + (turning ? ` turns ${TURNS.speeds.map((v) => turns.find((t) => t.model === model && t.speed === v).fastest).join(",")}` : "")]));
  return { score: total, legs, by, ladders, turns };
}

/** A candidate's played score: the mean speed it made on the Run's tracks (`PLAYED`), and each body's mean on each track. */
async function playedScore(legs) {
  const runs = await Promise.all(models.flatMap((model) => PLAYED.tracks.flatMap((track) => PLAYED.paces.flatMap((pace) => PLAYED.winds.map(async ([rate, strength, seed]) => {
    const r = await run({ model, track, pace, seed, legs, played: true, seconds: PLAYED.seconds, wind: { rate, strength } });
    return { model, track, made: r.fell === null ? r.mean : r.mean * r.fell / PLAYED.seconds, fell: r.fell !== null };
  })))));
  const by = {};
  for (const model of models) for (const track of PLAYED.tracks) {
    const mine = runs.filter((r) => r.model === model && r.track === track);
    by[`${model.replace("workshop-", "")} ${track}`] = `${(mine.reduce((sum, r) => sum + r.made, 0) / mine.length).toFixed(2)}/${mine.filter((r) => r.fell).length}`;
  }
  return { score: runs.reduce((sum, r) => sum + r.made, 0) / runs.length, legs, by };
}

/** A ladder: the paces climbed until a fall; the mean speed along the line at the fastest held, and that pace. */
async function ladder(legs, model, track, seed) {
  let speed = 0, held = 0;
  for (const pace of LADDER) {
    const r = await run({ model, track, pace, seed, legs });
    if (r.fell !== null || (way && !wentAsAsked(r.mean, 0, pace))) break;
    speed = r.mean;
    held = pace;
  }
  return { model, track, seed, speed, held };
}

/** Each body's and line's fastest pace held on its worst seed. */
function heldOf(ladders) {
  const held = {};
  for (const l of ladders) held[`${l.model} ${l.track}`] = Math.min(held[`${l.model} ${l.track}`] ?? Infinity, l.held);
  return held;
}
/** The start's `heldOf`, which a SIMBICON way's candidate is held to. */
let heldStart = null;

/** A setting's score and its ladders. */
async function score(legs) {
  if (objective === "battery") return batteryScore(legs);
  if (objective === "played") return playedScore(legs);
  if (objective === "both") {
    const [walked, played] = await Promise.all([batteryScore(legs), playedScore(legs)]);
    return { score: walked.score + played.score, legs, by: { battery: Number(walked.score.toFixed(3)), played: Number(played.score.toFixed(3)), ...walked.by, ...played.by }, ladders: walked.ladders, turns: walked.turns };
  }
  const tracks = way && !lines.includes("square") ? [...lines, "square"] : lines;
  const [all, stops] = await Promise.all([
    Promise.all(models.flatMap((model) => tracks.flatMap((track) => seeds.map((seed) => ladder(legs, model, track, seed))))),
    way ? Promise.all(models.flatMap((model) => lines.flatMap((track) => seeds.map((seed) =>
      run({ model, track, pace: STOP.pace, seed, legs, seconds: STOP.seconds, stop: STOP.after, wind: { rate: 0, strength: 0 } }))))) : [],
  ]);
  const unstopped = stops.filter((r) => r.fell !== null || r.rest > STOP.rest).length;
  const ladders = all.filter((l) => lines.includes(l.track)), held = heldOf(all);
  const weight = (l) => l.track === "forward" ? FORWARD : 1;
  const short = heldStart ? Object.keys(held).reduce((s, key) => s + Math.max(0, heldStart[key] - held[key]), 0) : 0;
  const total = ladders.reduce((s, l) => s + weight(l) * l.speed, 0) / ladders.reduce((s, l) => s + weight(l), 0) - HELD_COST * short - STOP_COST * unstopped;
  const by = {};
  for (const l of ladders) {
    const key = `${l.model.replace("workshop-", "")} ${l.track}`;
    (by[key] ??= []).push(l.speed);
  }
  const means = Object.entries(by).map(([k, v]) => [k, Number((v.reduce((a, b) => a + b, 0) / v.length).toFixed(3))]);
  return { score: total, legs, by: Object.fromEntries(way ? [...means, ["held", held], ["unstopped", unstopped]] : means), ladders, held };
}

const started = Date.now();
const minutes = () => ((Date.now() - started) / 60000).toFixed(1);
try {
  if (way && objective === "bed") heldStart = (await score(legsOf(start))).held;
  if (arg("score")) {
    const r = await score(legsOf({ ...BASE, ...JSON.parse(arg("score")) }));
    console.log(`score ${r.score.toFixed(3)} in ${minutes()} min; ${JSON.stringify(r.by)}`);
    if (process.argv.includes("--ladders")) console.log(JSON.stringify(r.ladders));
  } else if (process.argv.includes("--live")) {
    const u0 = dims.map((key) => toUnit(key, start[key]));
    const base = await score(settingsAt(u0));
    console.log(`start ${base.score.toFixed(3)} ${JSON.stringify(base.by)}`);
    const ends = await Promise.all(dims.flatMap((key, i) => [0, 1].map(async (end) => {
      const u = u0.slice();
      u[i] = end;
      return { key, end, r: await score(settingsAt(u)) };
    })));
    for (const key of dims) {
      const [lo, hi] = [0, 1].map((end) => ends.find((e) => e.key === key && e.end === end).r);
      console.log(`${key}: low ${lo.score.toFixed(3)} high ${hi.score.toFixed(3)} (${JSON.stringify(lo.legs[key] ?? null)} / ${JSON.stringify(hi.legs[key] ?? null)})`);
    }
    console.log(`${minutes()} min`);
  } else {
    if (!out) throw new Error("--out names the search");
    const result = await cmaSearch({
      n: dims.length, start: dims.map((key) => toUnit(key, start[key])), sigma: Number(arg("sigma", "0.25")),
      lambda: Number(arg("lambda", "12")), generations: Number(arg("generations", "30")), seed: Number(arg("seed", "1")),
      score: (u) => score(settingsAt(u)),
      onGeneration: (entry, search) => {
        appendFileSync(`${out}.jsonl`, `${JSON.stringify({ ...entry, minutes: Number(minutes()), best: search.best.r })}\n`);
        writeFileSync(`${out}-best.json`, JSON.stringify(search.best.r, null, 1));
        console.log(`g${entry.g} best ${entry.best?.toFixed?.(3) ?? entry.best} median ${entry.median?.toFixed?.(3) ?? entry.median} | so far ${search.best.score.toFixed(3)} ${JSON.stringify(search.best.r.by)} (${minutes()} min)`);
      },
    });
    console.log(`best ${result.best.score.toFixed(3)} at generation ${result.best.g}: ${JSON.stringify(result.best.r.legs)}`);
  }
} finally {
  for (const worker of [...pool, ...trialPool]) worker.terminate();
}
