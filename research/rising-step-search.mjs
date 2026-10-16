/**
 * **Step up's settings searched** on the target battery's falls (Node stand, Rapier, 120 Hz, Balance 0):
 * diagonal CMA-ES (`research/cma.mjs`) over `StepUpTuning` (`src/core/mind/ground/step-up.ts`) in the
 * unit cube, each candidate run through Stand up with Step up alone on every fall of its battery.
 *
 *   node research/rising-step-search.mjs --out research/runs/rising/step-w --models workshop-fighter
 *     [--held empty,club] [--directions 8] [--offset 11.25] [--cap 14] [--generations 200] [--workers 24]
 *     [--start <tuning.json>] [--sigma .12] [--factor 1]
 *   node research/rising-step-search.mjs --score <tuning.json, or "" for the model's own> [--models ...] [--held ...] [--directions 16] [--offset 0]
 *
 * A fall's score is 2 and the share of the cap left when it is verified standing (the target's
 * reading: quiet standing, then 2 s standing and a 1 s walk), else under 1: how far through the
 * rise's stages it got, and whether the stance took the body. A shove that leaves the body standing
 * is not scored. Training directions are offset from the target's (`--offset`), which `--score`
 * reads at 0. A candidate's score is the mean over its falls. A search's fall ends when Step up's
 * first attempt fails; `--score` reads the whole battery as the target does, retries and all.
 * `--factor` scales every muscle's strength: a discover-then-constrain experiment, never the game's.
 */
import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { availableParallelism } from "node:os";
import { cmaSearch, workerPool } from "./cma.mjs";
import { RISE } from "../src/core/mind/rise/stages.ts";
import { STEP_UP, stepUp } from "../src/core/mind/ground/step-up.ts";
import { standUp } from "../src/core/mind/ground/stand-up.ts";
import { TECHNIQUES } from "../src/core/mind/ground/techniques.ts";
import { risingTrial } from "./rising-trial.mjs";

const log = (u, lo, hi) => Math.exp(Math.log(lo) + Math.min(1, Math.max(0, u)) * (Math.log(hi) - Math.log(lo)));
const unlog = (v, lo, hi) => Math.min(1, Math.max(0, Math.log(v / lo) / Math.log(hi / lo)));
/** Each dimension's range, searched on a log scale: a pose stage's time scale, a bearing stage's, and its completion. */
const POSE = [.1, 2], BEAR = [.4, 2.5], SPEED = [.05, .8], NEAR = [.03, .25], TURN = [.08, .6];
const STAGES = [...RISE.roll.back.map(s => [`roll ${s.name}`, "pose"]), ...RISE.rise.map(s => [s.name, s.kind])];
const DIMENSIONS = [["settle.seconds", [.05, .6]], ["settle.speed", [.05, .5]], ["climb", [.3, 2]],
  ...STAGES.flatMap(([name, kind]) => kind === "pose" ? [[`${name}:scale`, POSE]]
    : [[`${name}:scale`, BEAR], [`${name}:speed`, SPEED], [`${name}:near`, NEAR], [`${name}:turn`, TURN]])];
/** A bearing stage's completion where its tuning names none: the staged player's own. */
const PLAYER = { speed: .1, near: .05, turn: .15 };

export function stepTuning(u) {
  const v = Object.fromEntries(DIMENSIONS.map(([name, [lo, hi]], i) => [name, log(u[i], lo, hi)]));
  return { settle: { seconds: v["settle.seconds"], speed: v["settle.speed"] }, climb: v.climb,
    stages: Object.fromEntries(STAGES.map(([name, kind]) => [name, kind === "pose" ? { scale: v[`${name}:scale`] }
      : { scale: v[`${name}:scale`], progress: { speed: v[`${name}:speed`], near: v[`${name}:near`], turn: v[`${name}:turn`] } }])) };
}
export function stepUnit(tuning) {
  return DIMENSIONS.map(([name, [lo, hi]]) => {
    const [stage, key] = name.split(":");
    const value = name === "settle.seconds" ? tuning.settle.seconds : name === "settle.speed" ? tuning.settle.speed : name === "climb" ? tuning.climb
      : key === "scale" ? tuning.stages[stage]?.scale ?? 1 : tuning.stages[stage]?.progress?.[key] ?? PLAYER[key];
    return unlog(value, lo, hi);
  });
}

/** Where in the whole rise a part-way entry begins. */
const JOINED = { whole: 0, fours: RISE.rise.findIndex(s => s.name === "fours"), "half-kneel": RISE.rise.findIndex(s => s.name === "half kneel") };

/** One target fall under Step up with `tuning`; scored as the header says. */
export async function stepFall({ tuning, cap = 14, first = true, ...job }) {
  let furthest = -1, steady = 0, failed = false;
  const registry = { ...TECHNIQUES, "step-up": { ...TECHNIQUES["step-up"], make: (own, view, world) => {
    const run = stepUp(own, view, world, tuning), step = run.step;
    return Object.defineProperties({}, { ...Object.getOwnPropertyDescriptors(run), step: { value(g, senses, dt) {
      const end = step(g, senses, dt), s = run.state;
      if (end !== null && end !== "done") failed = true;
      if (s.phase === "steady") steady = 1;
      else { const rise = s.rises[s.entry]; if (rise.phase === "rise") furthest = Math.max(furthest, rise.stage + JOINED[s.entry]); }
      return end;
    } } });
  } } };
  const subs = [(own, view, world) => standUp(own, view, world, { kind: "stand-up", techniques: ["step-up"] }, registry)];
  const r = await risingTrial({ seed: 1, start: "shoved", balance: 0, grit: 0, gusts: false, target: true, sub: "stand-up", techniques: ["step-up"], cap, ...job }, { subs, stop: (world, built, actor) => { job.watch?.(world, built, actor); return first && failed; } });
  const score = r.stood ? 2 + Math.max(0, cap - r.verified) / cap
    : r.takeover === null ? null : .9 * (Math.max(0, furthest) + steady + (r.verified !== null ? 1 : 0)) / (RISE.rise.length + 2);
  return { model: job.model, held: job.held, degrees: job.degrees, stood: r.stood, status: r.status, verified: r.verified, takeover: r.takeover, furthest, score,
    ...(job.trail ? { trail: r.trail, attempts: r.attempts } : {}) };
}

/** The battery's falls: each model, loadout and direction. */
export function stepJobs({ models, held, directions, offset, cap, factor }) {
  return models.flatMap(model => held.flatMap(h => Array.from({ length: directions }, (_, d) => ({ model, held: h, degrees: offset + d * 360 / directions, cap, factor }))));
}

function options(argv) {
  const o = { out: null, score: null, models: ["workshop-fighter"], held: ["empty", "club"], directions: 8, offset: 11.25, cap: 14, factor: 1,
    generations: 200, workers: Math.max(1, availableParallelism() - 8), start: null, sigma: .12 };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, ""), value = argv[i + 1];
    if (!(key in o)) throw new Error(`unknown option --${key}`);
    o[key] = key === "models" || key === "held" ? value.split(",") : typeof o[key] === "number" ? Number(value) : value;
  }
  if (o.score !== null && !argv.includes("--offset")) o.offset = 0;
  if (o.score !== null && !argv.includes("--directions")) o.directions = 16;
  return o;
}

async function main() {
  const o = options(process.argv.slice(2)), jobs = stepJobs(o);
  const tuningIn = async file => file ? JSON.parse(await readFile(file, "utf8")).tuning : STEP_UP[o.models[0]];
  if (o.score !== null) {
    const tuning = await tuningIn(o.score), pool = workerPool(new URL("./rising-step-worker.mjs", import.meta.url), { tuning }, Math.min(o.workers, jobs.length));
    try {
      const rows = await Promise.all(jobs.map(job => pool.evaluate(job)));
      for (const row of rows) console.log(JSON.stringify(row));
      const falls = rows.filter(r => r.score !== null), times = falls.map(r => r.stood ? r.verified : o.cap).sort((a, b) => a - b);
      console.log(JSON.stringify({ falls: falls.length, stood: falls.filter(r => r.stood).length, within6: falls.filter(r => r.stood && r.verified <= 6).length,
        median: times[Math.floor((times.length - 1) / 2)], noTakeover: rows.length - falls.length }));
    } finally { await pool.terminate(); }
    return;
  }
  if (!o.out) throw new Error("--out names the search's files");
  await mkdir(dirname(o.out), { recursive: true });
  let resume;
  try { resume = JSON.parse(await readFile(`${o.out}.ckpt.json`, "utf8")); } catch { resume = undefined; }
  const pool = workerPool(new URL("./rising-step-worker.mjs", import.meta.url), { jobs }, o.workers), t0 = Date.now();
  try {
    const result = await cmaSearch({ n: DIMENSIONS.length, start: stepUnit(await tuningIn(o.start)), sigma: o.sigma, lambda: o.workers, generations: o.generations, seed: 7, resume,
      score: u => pool.evaluate(u),
      async onGeneration(entry, progress) {
        await writeFile(`${o.out}.ckpt.json`, JSON.stringify(progress.checkpoint));
        await writeFile(`${o.out}.best.json`, JSON.stringify({ options: o, tuning: stepTuning(progress.best.u), ...progress.best }));
        await appendFile(`${o.out}.jsonl`, JSON.stringify({ ...entry, bestSoFar: +progress.best.score.toFixed(4), r: progress.best.r, s: Math.round((Date.now() - t0) / 1000) }) + "\n");
      } });
    console.log(JSON.stringify({ best: result.best.score, r: result.best.r }));
  } finally { await pool.terminate(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error); process.exitCode = 1; });
