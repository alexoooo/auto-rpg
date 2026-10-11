/**
 * **The stride's settings searched** on the locomotion test bed (`research/locomotion-run.mjs`:
 * Node stand, Rapier, 120 Hz), by diagonal CMA-ES in the unit cube (`research/cma.mjs`).
 *
 * A candidate's score is the speed it walks and holds: for each body, line and seed, the paces are
 * climbed in turn, each run for `--seconds` under the scorecard's gusts, until one falls; the
 * ladder's speed is the mean speed along the line at the fastest pace held (0 if the first falls).
 * The score is the mean of the ladders' speeds, forward weighted `FORWARD` times another line.
 *
 *   node research/locomotion-search.mjs --out .snap/search/a [--generations 30] [--lambda 12] [--seeds 1,2,3]
 *     [--models workshop-fighter,workshop-rogue] [--lines forward,right,back] [--seconds 15] [--seed 1]
 *     [--start '{"swing":0.34}'] [--dims swing,transfer,...] [--live] [--score '{"swing":0.34}'] [--workers 30]
 *
 * - `--live` scores the start and each dimension at either end of its range, the rest at the start:
 *   whether something reads it, and which way it moves the score.
 * - `--score` scores one setting (merged over the stride's defaults) and prints its ladders.
 * - Otherwise it searches, and writes each generation to `<out>.jsonl` and the best to `<out>-best.json`.
 *
 * The settings the search moves are `DIMS`; the rest are the stride's defaults (`STRIDE`).
 */
import { Worker } from "node:worker_threads";
import { appendFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { cmaSearch } from "./cma.mjs";
import { STRIDE } from "../src/core/skills/stride.ts";

/** Each setting searched and its range; a flag is on above the middle. */
const DIMS = {
  swing: [0.25, 0.45], transfer: [0.01, 0.12], lift: [0.03, 0.09], settle: [0.04, 0.12], width: [0.12, 0.3], longest: [0.6, 1],
  accel: [1, 4], push: [0, 0.4], arms: [0, 2], ramp: [0, 0.2], drive: [0, 1], lengthen: [0, 0.5], lands: "flag",
};

/** How many times another line's ladder the forward one counts. */
const FORWARD = 2;

/** The paces climbed, m/s: the scorecard's lines'. */
const PACES = [0.3, 0.5, 0.7, 1, 1.2, 1.4, 1.7, 2];

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const list = (name, fallback) => arg(name, fallback).split(",");
const models = list("models", "workshop-fighter,workshop-rogue"), lines = list("lines", "forward,right,back");
const seeds = list("seeds", "1,2,3").map(Number), seconds = Number(arg("seconds", "15"));
const dims = arg("dims") ? list("dims") : Object.keys(DIMS), out = arg("out");
const workers = Math.min(Number(arg("workers", String(Math.max(1, availableParallelism() - 2)))), 64);
const start = { ...STRIDE, ...JSON.parse(arg("start", "{}")) };

/** A setting's place in its range, [0, 1]; a flag's, a quarter or three quarters. */
function toUnit(key, value) {
  const range = DIMS[key];
  if (range === "flag") return value ? 0.75 : 0.25;
  return Math.min(1, Math.max(0, ((value ?? range[0]) - range[0]) / (range[1] - range[0])));
}
/** The stride's settings at `u` over `dims`, the rest the start's. */
function settingsAt(u) {
  const settings = { kind: "stride", ...start };
  dims.forEach((key, i) => {
    const range = DIMS[key];
    if (range === "flag") { if (u[i] > 0.5) settings[key] = true; else delete settings[key]; }
    else settings[key] = Number((range[0] + u[i] * (range[1] - range[0])).toFixed(4));
  });
  return settings;
}

const pool = Array.from({ length: workers }, () => new Worker(fileURLToPath(new URL("./locomotion-run.mjs", import.meta.url))));
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

/** A ladder: the paces climbed until a fall; the mean speed along the line at the fastest held, and that pace. */
async function ladder(legs, model, track, seed) {
  let speed = 0, held = 0;
  for (const pace of PACES) {
    const r = await run({ model, track, pace, seed, legs });
    if (r.fell !== null) break;
    speed = r.mean;
    held = pace;
  }
  return { model, track, seed, speed, held };
}

/** A setting's score and its ladders. */
async function score(legs) {
  const ladders = await Promise.all(models.flatMap((model) => lines.flatMap((track) => seeds.map((seed) => ladder(legs, model, track, seed)))));
  const weight = (l) => l.track === "forward" ? FORWARD : 1;
  const total = ladders.reduce((s, l) => s + weight(l) * l.speed, 0) / ladders.reduce((s, l) => s + weight(l), 0);
  const by = {};
  for (const l of ladders) {
    const key = `${l.model.replace("workshop-", "")} ${l.track}`;
    (by[key] ??= []).push(l.speed);
  }
  return { score: total, legs, by: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, Number((v.reduce((a, b) => a + b, 0) / v.length).toFixed(3))])) };
}

const started = Date.now();
const minutes = () => ((Date.now() - started) / 60000).toFixed(1);
try {
  if (arg("score")) {
    const r = await score({ kind: "stride", ...STRIDE, ...JSON.parse(arg("score")) });
    console.log(`score ${r.score.toFixed(3)} in ${minutes()} min; ${JSON.stringify(r.by)}`);
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
  for (const worker of pool) worker.terminate();
}
