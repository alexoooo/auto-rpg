/**
 * **A club blow searched on the Strike drill**: a recipe (`assets/core/strikes.json`'s shape: a
 * chamber pose and its time, a push on each freedom a club blow may push, `CLUB_BLOW`, and how far
 * ahead its target stands) thrown by Option Mind on the toed Warrior holding the buckler and the
 * club, through the recipe strike (`recipe-strike`, its repertoire the candidate alone). A
 * candidate is played as the drill plays a trial (`STRIKE_CASES.still`, its world and its reader)
 * on each place of a spread (gaps and offsets across, at the band's mark), and scored by the bar's
 * score (`barScore`: a held item's blow by its energy, `BAR.held`), each place's worst over the
 * rates it is played at, the mean over the spread; a fall lowest. Diagonal CMA-ES (`cma.mjs`),
 * from a recipe of the repertoire or a search's output.
 *
 *   node research/club-drill.mjs --band high|middle --out <file.json> [--from <model>:<band>|<file.json>] [--sigma 0.15]
 *     [--gaps 0.6,0.8,1,1.2] [--across 0,0.2] [--rates 120,480] [--generations 40] [--workers 28] [--lambda <n>] [--seed 1]
 *   node research/club-drill.mjs --verify <file.json> [--gaps 0.6,...,1.3] [--across 0,0.2] [--rates 120,480]
 *   node research/club-drill.mjs --recipe <file.json>   prints the found recipe as the repertoire takes it
 *
 * Harness: Node, the bout world (`buildBout`) on Rapier (`DEFAULT_ENGINE`), the drill's layout.
 */
import "../tests/harness/preload-data.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { MINDS } from "../src/core/mind/controllers.ts";
import { REPERTOIRE } from "../src/core/skills/strikes.ts";
import { buildBout } from "../src/evaluation/bout.ts";
import { STRIKE_CASES } from "../src/evaluation/strike/cases.ts";
import { barScore } from "../src/evaluation/strike/score.ts";
import { cmaSearch, workerPool } from "./cma.mjs";
import { decodeHeld, dimensionsHeld, encodeHeld, heldSpec } from "./core-blow.mjs";

/** The body the recipe is for, what it holds, and the item's name in the repertoire. */
const MODEL = "workshop-fighter", KEY = "workshop-fighter+toes", HELD = "wooden club", LOADOUT = Object.freeze({ left: "buckler", right: "club" });
/** The repertoire's recipe on the flat-footed Warrior for `band`: where a search starts, and whose place's height and window a candidate keeps. */
const reference = (band) => REPERTOIRE.find((r) => r.model === MODEL && r.held === HELD && r.band === band);
/** The ranges the recipe's numbers are read against: the Warrior's joints, the club in its right hand. */
const SPEC = heldSpec(MODEL, HELD, "right");

/** The recipe `x` (numbers in [-1, 1]) stands for in `band`, as the repertoire holds one, found as `found` says. */
export function recipeOf(x, band, found) {
  const { strike, distance } = decodeHeld(HELD, x, SPEC, "right"), ref = reference(band);
  return { model: KEY, held: HELD, band, strike, place: { ahead: distance, up: ref.place.up }, found, window: ref.window, net: ref.net };
}

/** Option Mind holding the buckler and the club, its club blow (`club-blow`) at `band`'s mark thrown by `recipe` alone, as the Strike drill's subject. */
export function clubSubject(recipe) {
  const base = MINDS.option.config, mark = recipe.band === "high" ? "high" : "middle";
  const mind = { ...base, executors: base.executors.map((one) => one.name === "club" ? { ...one, tuning: { ...one.tuning, repertoire: [recipe] } } : one),
    actions: base.actions.map((one) => one.name === "club-blow" ? { ...one, regions: [{ kind: "mark", mark }] } : one) };
  if (!mind.executors.some((one) => one.name === "club")) throw new Error("Option Mind has no club executor to search the blow of");
  return { mind, action: "club-blow", held: LOADOUT };
}

/** One drill trial of `subject` on `condition` at `hz`: its reading. */
export async function drillTrial(subject, condition, hz) {
  const cases = STRIKE_CASES.still, world = cases.world([subject], condition, undefined, [subject.character]);
  const built = await buildBout(world.recipe, { hz });
  try {
    const reader = cases.read(built, condition);
    built.duel.play(world.tape);
    while (!reader.ended) {
      if (built.duel.clock > cases.seconds + 1) throw new Error("the trial ran past its seconds");
      built.world.step();
      reader.afterStep();
    }
    return reader.reading();
  } finally { built.dispose(); }
}

/**
 * `recipe` on every place of `cell`'s spread at each of its rates (120 Hz where it names none): the
 * mean of each place's worst score over the rates, how many places landed at every rate, and each
 * place's worst outcome and energy.
 */
async function spreadTrial(recipe, cell) {
  const subject = clubSubject(recipe), mark = recipe.band === "high" ? "high" : "middle", each = [];
  for (const gap of cell.gaps) for (const across of cell.across) {
    let worst = null;
    for (const hz of cell.rates ?? [120]) {
      const reading = await drillTrial(subject, { model: MODEL, mark, hand: "right", across, gap }, hz), score = barScore(reading, "right");
      if (worst === null || score < worst.score) worst = { score, outcome: reading.outcome, energy: reading.hit ? +reading.hit.energy.toFixed(1) : null };
    }
    each.push(worst);
  }
  return { score: each.reduce((sum, r) => sum + r.score, 0) / each.length, landed: each.filter((r) => r.outcome === "landed").length, places: each.length,
    outcomes: each.map((r) => `${r.outcome}${r.energy === null ? "" : `:${r.energy}`}`) };
}

if (!isMainThread && workerData?.club) {
  parentPort.on("message", async ({ id, x }) => {
    let r; try { r = await spreadTrial(recipeOf(x, workerData.cell.band, "candidate"), workerData.cell); } catch (error) { r = { score: -5, error: String(error?.stack ?? error) }; }
    parentPort.postMessage({ id, r });
  });
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { band: { type: "string" }, out: { type: "string" }, from: { type: "string" }, sigma: { type: "string" }, gaps: { type: "string" },
    across: { type: "string" }, generations: { type: "string" }, workers: { type: "string" }, lambda: { type: "string" }, seed: { type: "string" },
    verify: { type: "string" }, rates: { type: "string" }, recipe: { type: "string" } } });
  const list = (text, fallback) => text === undefined ? fallback : text.split(",").map(Number);
  if (values.recipe) {
    const found = JSON.parse(readFileSync(values.recipe, "utf8"));
    console.log(JSON.stringify(recipeOf(found.best.x, found.cell.band, found.found)));
    process.exit(0);
  }
  if (values.verify) {
    const found = JSON.parse(readFileSync(values.verify, "utf8")), recipe = recipeOf(found.best.x, found.cell.band, found.found), subject = clubSubject(recipe);
    const mark = recipe.band === "high" ? "high" : "middle", tally = {};
    for (const hz of list(values.rates, [120])) for (const across of list(values.across, [0, .2])) for (const gap of list(values.gaps, [.6, .7, .8, .9, 1, 1.1, 1.2, 1.3])) {
      const reading = await drillTrial(subject, { model: MODEL, mark, hand: "right", across, gap }, hz), h = reading.hit;
      tally[`${hz} ${reading.outcome}`] = (tally[`${hz} ${reading.outcome}`] ?? 0) + 1;
      console.log(JSON.stringify({ hz, across, gap, outcome: reading.outcome, on: h?.on ?? null, energy: h ? +h.energy.toFixed(1) : null, speed: h?.speed ? +h.speed.toFixed(1) : null,
        after: h && reading.began !== null ? +(h.time - reading.began).toFixed(2) : null, down: reading.down }));
    }
    console.log(JSON.stringify(tally));
    process.exit(0);
  }
  const band = values.band ?? "high";
  if (!reference(band)) throw new Error(`--band is high or middle, not ${band}`);
  const cell = { band, gaps: list(values.gaps, [.6, .8, 1, 1.2]), across: list(values.across, [0, .2]), rates: list(values.rates, [120]) };
  const n = dimensionsHeld(HELD, "right"), nw = Number(values.workers ?? Math.max(1, availableParallelism() - 4)), generations = Number(values.generations ?? 40);
  /** The start, numbers in [-1, 1]: a repertoire recipe (`<model>:<band>`) or a search's best. */
  const from = (() => {
    const named = values.from ?? `${MODEL}:${band}`, [model, of] = named.split(":");
    try { return JSON.parse(readFileSync(named, "utf8")).best.x; } catch { /* a recipe's name */ }
    const recipe = REPERTOIRE.find((r) => r.model === model && r.held === HELD && r.band === of);
    if (!recipe) throw new Error(`--from names no club recipe or search: ${named}`);
    return encodeHeld(HELD, recipe.strike, recipe.place.ahead, SPEC);
  })();
  const found = `research/club-drill.mjs --band ${band} --from ${values.from ?? `${MODEL}:${band}`} --gaps ${cell.gaps} --across ${cell.across} --rates ${cell.rates} --seed ${values.seed ?? 1}`;
  const pool = workerPool(fileURLToPath(import.meta.url), { club: true, cell }, nw);
  const toX = (u) => u.map((v) => 2 * Math.min(1, Math.max(0, v)) - 1);
  const { best } = await cmaSearch({ n, start: from.map((v) => (v + 1) / 2), sigma: Number(values.sigma ?? .15), lambda: Number(values.lambda ?? 2 * nw), generations, seed: Number(values.seed ?? 1),
    score: (u) => pool.evaluate(toX(u)),
    onGeneration(entry, { best: top, log }) {
      console.error(JSON.stringify({ ...entry, best: top.score, landed: top.r?.landed, outcomes: top.r?.outcomes }));
      if (values.out) writeFileSync(values.out, JSON.stringify({ cell, found, from: values.from ?? null, best: { ...top, x: toX(top.u) }, log }));
    } });
  await pool.terminate();
  console.log(JSON.stringify({ cell, best: { score: best.score, g: best.g, r: best.r } }));
  process.exit(0);
}
