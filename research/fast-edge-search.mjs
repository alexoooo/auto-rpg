/**
 * **A fast edge, searched across its starts** (`docs/reference/rising.md#the-fast-edges`): a phased
 * rise (`phasedRun`, `src/core/mind/ground/phased-rise.ts`) from step 2's witness
 * (`research/rise-witness.mjs`), its phases and its hold searched together so that it takes the body
 * to a crouch quiet on both feet from several starts, not one. Each candidate is played as the Rise
 * drill plays an edge (`buildTechnique`, `src/evaluation/technique.ts`, its run passed in): placed in
 * the edge's posture at rest (`TECHNIQUE_SPREAD`), and after the route's edges before it (down from
 * the front). Node stand, core world, Rapier, 120 Hz, calm, no assist.
 *
 * A trial scores 2 and the share of `CAP` left once the edge is done; short of it, under 1: the best
 * reading held `HELD` s of the feet's share of the weight, the soles flat and the body still,
 * multiplied. A candidate scores the mean of its trials whose edge was begun. Diagonal CMA-ES
 * (`research/cma.mjs`) from the witness.
 *
 *   node research/fast-edge-search.mjs --edge push-off --out .tmp/<task>/push-off
 *     [--model workshop-fighter] [--seeds 3] [--generations 60] [--workers 12] [--sigma .1]
 *   node research/fast-edge-search.mjs --replay <best.json> [--seeds 6] [--write]
 *
 * `--write` puts the replayed rise in `assets/core/fast-edges.json` for its body.
 */
import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { execSync } from "node:child_process";
import { cmaSearch, workerPool } from "./cma.mjs";
import { phases as witnessPhases } from "./rise-witness.mjs";
import "../tests/harness/preload-data.mjs";
import { buildTechnique, techniqueSpec } from "../src/evaluation/technique.ts";
import { groundReading } from "../src/core/mind/ground/reading.ts";
import { phasedRun } from "../src/core/mind/ground/phased-rise.ts";
import { fastEntry } from "../src/core/mind/ground/fast-edges.ts";

/**
 * Each edge: its posture, the witness it is searched from, that witness's move and its phases' kinds,
 * how many of them it keeps (the next one, a bear phase, seeds the hold from the last kept), and its
 * starts beside the placed one: after the route's edges before it from lying, or shoved from standing
 * toward the directions that land the body there.
 */
const EDGES = {
  "push-off": { from: "fours", witness: "assets/research/rise-witness/push-off-bear.json", move: "push-off-bear", kinds: ["bear", "bear", "bear", "bear"], kept: 3,
    other: (seed) => ({ start: { kind: "placed", posture: "front" }, chain: ["staged-down"] }) },
  "rock-up": { from: "back", witness: "assets/research/rise-witness/rock-up-bear.json", move: "rock-up-bear", kinds: ["pose", "pose", "bear", "bear"], kept: 3,
    other: (seed) => ({ start: { kind: "shoved", degrees: [180, 157.5, 202.5, 135, 225, 112.5][(seed - 1) % 6] }, chain: [] }) },
};
/** The length of a phase's part of a candidate: its searched channels, then its settings (`research/rise-witness.mjs`). */
const SEGMENT = { pose: 12, bear: 19 };
const offsetOf = (kinds, k) => kinds.slice(0, k).reduce((sum, kind) => sum + SEGMENT[kind], 0);
/** The time to the quiet crouch a done trial is scored against, s; how long a partial reading must hold, s; the speed at which it counts nothing, m/s. */
const CAP = 4, HELD = .1, STILL = .5;

/** A candidate's rise: the witness's move decoded from `u`, its first `kept` phases timed and the next held. */
function riseOf(edge, spec, u) {
  const { move, kept, from } = EDGES[edge], decoded = witnessPhases(move, spec, u);
  const fromWitness = EDGES[edge].kinds;
  if (fromWitness[kept] !== "bear" || fromWitness[kept - 1] !== "bear") throw new Error("a hold is seeded by a bear phase");
  const plain = ({ seed: _seed, ...phase }) => phase;
  return { from, phases: decoded.slice(0, kept).map(plain), hold: { ...plain(decoded[kept]), duration: 0 } };
}

/**
 * The hold's seed settings in the search's unit cube (`research/rise-witness.mjs`'s bear settings:
 * duration, response, pitch, toward, height, along, up, shin, hand, foot): a crouch borne on both
 * feet alone, 0.75 of standing high, over their middle and still, the pelvis at 0.4 rad, at 0.35 s.
 */
const HOLD_SEED = [0, Math.log(.35 / .08) / Math.log(10), (.4 + .6) / 2.2, .5, (.75 - .2) / .85, .5, 1 / 3, 0, 0, .5];
/** The searched channels of a bear phase, before its settings. */
const CHANNELS = 9;

/** The search's start: the witness's own phases, the hold its last kept one's channels at `HOLD_SEED`. */
function startOf(edge, witness) {
  const { kept, kinds } = EDGES[edge], u = witness.u.slice(0, offsetOf(kinds, kept)), last = offsetOf(kinds, kept - 1);
  return [...u, ...witness.u.slice(last, last + CHANNELS), ...HOLD_SEED];
}

/** The starts a candidate is played from: placed in the edge's posture, and its other start (`EDGES`), seeds 1 to `seeds` each. */
const startsOf = (edge, seeds) => Array.from({ length: seeds }, (_, k) => k + 1).flatMap(seed => {
  const other = EDGES[edge].other(seed);
  return [{ seed, start: { kind: "placed", posture: EDGES[edge].from }, chain: [edge] }, { seed, start: other.start, chain: [...other.chain, edge] }];
});

/** One trial of `rise` from `start`: its score, whether the edge was begun, and its reading. */
export async function edgeTrial({ edge, model, held = "empty", rise, start }) {
  const link = start.chain.length - 1;
  let built, run = null;
  try { built = await buildTechnique({ model, held, seed: start.seed, start: start.start, chain: start.chain }, "rapier",
    (k, own, view) => k === link ? (run = phasedRun(own, view, rise, fastEntry(EDGES[edge].from))) : null); }
  catch (error) { return { refused: String(error.message ?? error) }; }
  const reader = groundReading(built.body, built.world.dt), window = new Float64Array(Math.round(HELD / built.world.dt));
  let steps = 0, progress = 0;
  try {
    while (!built.ended) {
      built.world.step(); built.afterStep();
      const g = reader.read();
      if (!(run?.state.elapsed > 0)) continue;
      const feet = Math.min(1, g.footLoad[0] + g.footLoad[1]), flat = (g.flat[0] + g.flat[1]) / 2;
      window[steps++ % window.length] = feet * (.25 + .75 * flat) * Math.max(0, 1 - Math.sqrt(g.velocity.lengthSquared()) / STILL);
      if (steps >= window.length) progress = Math.max(progress, Math.min(...window));
    }
    const reading = built.reading().links[link];
    const score = reading.end === "done" ? 2 + Math.max(0, CAP - reading.seconds) / CAP : .9 * progress;
    return { score, begun: reading.entry !== null, end: reading.end, seconds: +reading.seconds.toFixed(3), speed: reading.entry ? +reading.entry.speed.toFixed(2) : null };
  } finally { built.dispose(); }
}

/** A candidate's score over the starts: the mean of the trials whose edge was begun. */
async function candidate({ edge, model, held, seeds, u }) {
  const spec = techniqueSpec({ model, held }), rise = riseOf(edge, spec, u), trials = [];
  for (const start of startsOf(edge, seeds)) trials.push({ ...await edgeTrial({ edge, model, held, rise, start }), seed: start.seed, from: start.chain.length > 1 ? "route" : start.start.kind });
  const begun = trials.filter(t => t.begun);
  return { score: begun.length ? begun.reduce((s, t) => s + t.score, 0) / begun.length : 0,
    done: begun.filter(t => t.end === "done").length, begun: begun.length, trials };
}

if (!isMainThread && workerData?.harness === "fast-edge") {
  parentPort.on("message", async ({ id, x }) => {
    try { parentPort.postMessage({ id, r: await candidate({ ...workerData, u: x }) }); }
    catch (error) { parentPort.postMessage({ id, r: { score: 0, error: String(error?.stack ?? error) } }); }
  });
} else if (process.argv[1]?.endsWith("fast-edge-search.mjs")) {
  const { values } = parseArgs({ options: { edge: { type: "string" }, out: { type: "string" }, model: { type: "string" }, held: { type: "string" },
    seeds: { type: "string" }, generations: { type: "string" }, workers: { type: "string" }, sigma: { type: "string" },
    replay: { type: "string" }, write: { type: "boolean" } } });
  if (values.replay) {
    const best = JSON.parse(await readFile(values.replay, "utf8"));
    const r = await candidate({ edge: best.edge, model: best.model, held: best.held, seeds: Number(values.seeds ?? 6), u: best.u });
    for (const t of r.trials) console.log(JSON.stringify(t));
    console.log(JSON.stringify({ score: +r.score.toFixed(3), done: r.done, begun: r.begun }));
    if (values.write) {
      const path = new URL("../assets/core/fast-edges.json", import.meta.url), data = JSON.parse(await readFile(path, "utf8"));
      const spec = techniqueSpec({ model: best.model, held: best.held });
      data.edges[best.model] = { ...data.edges[best.model], [best.edge]: riseOf(best.edge, spec, best.u) };
      data.source = { script: "research/fast-edge-search.mjs", commit: execSync("git rev-parse --short=8 HEAD").toString().trim() };
      await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
    }
  } else {
    const edge = values.edge, model = values.model ?? "workshop-fighter", held = values.held ?? "empty", seeds = Number(values.seeds ?? 3);
    if (!EDGES[edge]) throw new Error(`--edge is one of ${Object.keys(EDGES).join(", ")}`);
    if (!values.out) throw new Error("--out names the search's files");
    const witness = JSON.parse(await readFile(EDGES[edge].witness, "utf8")), start = startOf(edge, witness);
    await mkdir(dirname(values.out), { recursive: true });
    const workers = Number(values.workers ?? Math.max(1, availableParallelism() - 4));
    const pool = workerPool(new URL(import.meta.url), { harness: "fast-edge", edge, model, held, seeds }, workers), t0 = Date.now();
    try {
      const result = await cmaSearch({ n: start.length, start, sigma: Number(values.sigma ?? .1), lambda: workers, generations: Number(values.generations ?? 60), seed: 7,
        score: u => pool.evaluate(u),
        async onGeneration(entry, progress) {
          const seconds = Math.round((Date.now() - t0) / 1000), r = progress.best.r;
          await writeFile(`${values.out}.best.json`, JSON.stringify({ edge, model, held, seeds, score: progress.best.score, u: progress.best.u, r }));
          await appendFile(`${values.out}.jsonl`, JSON.stringify({ ...entry, bestSoFar: +progress.best.score.toFixed(4), done: r.done, begun: r.begun, s: seconds }) + "\n");
          console.log(JSON.stringify({ g: entry.g, best: entry.best, median: entry.median, sigma: entry.sigma, bestSoFar: +progress.best.score.toFixed(3), done: r.done, begun: r.begun, s: seconds }));
        } });
      console.log(JSON.stringify({ best: result.best.score, done: result.best.r.done, begun: result.best.r.begun }));
    } finally { await pool.terminate(); }
  }
}
