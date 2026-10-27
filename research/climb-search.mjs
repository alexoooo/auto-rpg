/**
 * **A search for Stand up's steady's climb** (`research/climb.mjs`, the `ramp` variant): diagonal
 * CMA-ES (`research/cma.mjs`) over the climb's timings, lead, lean and reach, the stance's settings
 * and the servo's constant, scored by the mean time from the steady's start to verified standing
 * (`STAND_CHECK`) over a set of starts, a start not verified within `CAP` s counted at `FAIL`.
 * The starts: the placed squat (`research/crouch-steady.mjs`) and the witnesses' hand-overs
 * (`research/rise-witness.mjs`, `assets/research/rise-witness/`). Node stand, core world, Rapier,
 * 120 Hz, calm, no assist.
 *
 *   node research/climb-search.mjs [--model workshop-fighter] [--held empty] [--only squat|witness] [--generations 40] [--workers 16]
 *   node research/climb-search.mjs --score '<variant json>' [--only squat|witness]
 */
import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { humanoidSpec } from "../src/core/human/spec.ts";
import { armedWith } from "../src/core/items/held.ts";
import { acceptedSeeds as squatSeeds, steady } from "./crouch-steady.mjs";
import { witnessTrial } from "./rise-witness.mjs";

/** A start's cap from the steady's start, and a failure's score, s. */
const CAP = 5, FAIL = 6;
/** The witnesses whose hand-overs are starts, and how many of each one's accepted seeds. */
const WITNESSES = [["push-off-bear", 1], ["rock-up-bear", 4]];
/** How many of the squat's accepted seeds are starts. */
const SQUATS = 4;

const lin = (u, lo, hi) => lo + Math.min(1, Math.max(0, u)) * (hi - lo), unlin = (v, lo, hi) => (v - lo) / (hi - lo);
const lg = (u, lo, hi) => Math.exp(Math.log(lo) + Math.min(1, Math.max(0, u)) * Math.log(hi / lo)), unlg = (v, lo, hi) => Math.log(v / lo) / Math.log(hi / lo);

/** A search point's variant. */
export const decode = u => ({
  ramp: { T: lin(u[0], .4, 1.4), delay: lin(u[1], 0, .4), lean: lin(u[2], -.3, 1), reach: lin(u[3], -.5, 1.5), d: lin(u[4], -.03, .08), Tp: lin(u[5], .3, 1.5) },
  tuning: { seconds: { across: lg(u[6], .1, .8), height: lg(u[7], .03, .3), turn: lg(u[8], .06, .6), swing: .04 }, track: lg(u[9], .08, .5),
    ankleSpare: u[10] < .1 ? null : lg((u[10] - .1) / .9, .005, .3) },
  servo: lg(u[11], .04, .3),
});
/** The game's settings, a 0.8 s rise after a 0.1 s shift. */
const START = [unlin(.8, .4, 1.4), unlin(.1, 0, .4), unlin(0, -.3, 1), unlin(0, -.5, 1.5), unlin(0, -.03, .08), unlin(.9, .3, 1.5),
  unlg(.3, .1, .8), unlg(.15, .03, .3), unlg(.15, .06, .6), unlg(.2, .08, .5), .1 + .9 * unlg(.01, .005, .3), unlg(.1, .04, .3)];

/** Every start: `{ kind: "squat", seed }` or `{ kind: "witness", file, seed }`. */
async function starts(model, held) {
  const spec = armedWith(humanoidSpec(model), "right", held), { acceptedSeeds: witnessSeeds } = await import("./rise-witness.mjs");
  const list = squatSeeds(spec, SQUATS).map(seed => ({ kind: "squat", seed }));
  for (const [name, count] of WITNESSES) {
    const best = JSON.parse(await readFile(new URL(`../assets/research/rise-witness/${name}.json`, import.meta.url), "utf8"));
    if (best.model !== model || best.held !== held) continue;
    for (const seed of witnessSeeds(best.move, spec, count)) list.push({ kind: "witness", name, best, seed });
  }
  return list;
}

/** One start's time from the steady's start to verified standing, or `FAIL`. */
async function timeFrom(start, model, held, variant) {
  if (start.kind === "squat") {
    const r = await steady({ model, held, seed: start.seed, variant });
    return r.verified ?? FAIL;
  }
  const { best, seed } = start, handover = best.phases.reduce((s, p) => s + p.duration, 0);
  const r = await witnessTrial({ move: best.move, model, held, seed, u: best.u, hold: 1, cap: handover + CAP, steady: variant });
  return r.verified !== null && !r.fell ? r.verified - r.handover : FAIL;
}

if (!isMainThread && workerData.harness === "climb-search") {
  const list = (await starts(workerData.model, workerData.held)).filter(s => !workerData.only || s.kind === workerData.only);
  parentPort.on("message", async ({ id, x }) => {
    try { parentPort.postMessage({ id, r: { t: await timeFrom(list[x.start], workerData.model, workerData.held, decode(x.u)) } }); }
    catch (error) { parentPort.postMessage({ id, r: { t: FAIL, error: String(error?.stack ?? error) } }); }
  });
} else if (process.argv[1]?.endsWith("climb-search.mjs")) {
  const { values } = parseArgs({ options: { model: { type: "string" }, held: { type: "string" }, generations: { type: "string" }, workers: { type: "string" },
    score: { type: "string" }, sigma: { type: "string" }, only: { type: "string" } } });
  const model = values.model ?? "workshop-fighter", held = values.held ?? "empty", list = (await starts(model, held)).filter(s => !values.only || s.kind === values.only);
  const label = s => s.kind === "squat" ? `squat ${s.seed}` : `${s.name} ${s.seed}`, fmt = t => t >= FAIL ? "-" : t.toFixed(2);
  if (values.score) {
    const variant = JSON.parse(values.score), ts = [];
    for (const s of list) ts.push(await timeFrom(s, model, held, variant));
    console.log(list.map((s, k) => `${label(s)}: ${fmt(ts[k])}`).join(", "), `; mean ${(ts.reduce((a, b) => a + b, 0) / ts.length).toFixed(2)} s`);
  } else {
    const { cmaSearch, workerPool } = await import("./cma.mjs");
    const pool = workerPool(new URL(import.meta.url), { harness: "climb-search", model, held, only: values.only }, Number(values.workers ?? Math.max(1, availableParallelism() - 4)));
    const t0 = Date.now();
    const result = await cmaSearch({ n: START.length, start: START, sigma: Number(values.sigma ?? .2), lambda: 12, generations: Number(values.generations ?? 40), seed: 7,
      score: async u => { const ts = await Promise.all(list.map((_, start) => pool.evaluate({ u, start }).then(r => r.t))); return { score: -ts.reduce((a, b) => a + b, 0) / ts.length, ts }; },
      onGeneration: (entry, search) => console.log(`g${entry.g} ${Math.round((Date.now() - t0) / 1000)} s: mean ${(-entry.best).toFixed(2)} s, best so far ${(-search.best.score).toFixed(2)} s`) });
    await pool.terminate();
    console.log(JSON.stringify(decode(result.best.u)));
    console.log(list.map((s, k) => `${label(s)}: ${fmt(result.best.r.ts[k])}`).join(", "));
  }
}
