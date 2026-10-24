/**
 * **A timed punch searched on the Strike drill**: the Puncher's straight punch with its drive on a
 * schedule (`StraightPunch.timed`): each of the pushed channels (`ceilingChannels`: the trunk, both
 * legs and the striking arm) a level, a start and a length into the drive, the stance and the arm's
 * aim beneath. A candidate is played as the drill plays a trial (`STRIKE_CASES.still`, its world
 * and its reader, `readStrike`) on one cell: a body, a hand, a mark, an offset across and a gap,
 * the gap searched with the schedule unless given. It is scored by the bar (`BAR`, `read.ts`): a
 * landed blow scores above every other, by its speed and mass past the bar; any other trial by how
 * near its hit came to each of the bar's tests; a fall lowest. The punch is admitted at any range
 * past its arm's (a wide `band`), so where it stands is the cell's.
 *
 *   node research/punch-drill.mjs --out <file.json> [--model workshop-fighter] [--hand right] [--mark middle] [--across 0] [--gap <m>]
 *     [--hz 120] [--workers 12] [--generations 60] [--seed 1] [--from <file.json> [--sigma 0.15]]
 *   node research/punch-drill.mjs --verify <file.json> [--rates 120,480] [--gaps 0.9,1,1.1] [--across 0,0.2] [--marks middle,high] [--models ...]
 *
 * Harness: Node, the bout world (`buildBout`) on Rapier (`DEFAULT_ENGINE`), the drill's layout.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { MINDS } from "../src/core/mind/controllers.ts";
import { STRAIGHT_PUNCH } from "../src/core/skills/straight-punch.ts";
import { buildBout } from "../src/evaluation/bout.ts";
import { STRIKE_CASES } from "../src/evaluation/strike/cases.ts";
import { BAR } from "../src/evaluation/strike/read.ts";
import { cmaSearch, workerPool } from "./cma.mjs";

/** The pushed channels, as the punch's ceiling pushes them (`punch-ceiling.mjs`): the trunk, both legs and the striking arm. */
export function ceilingChannels(hand) {
  return ["thoracic rotation right", "lumbar rotation right", "thoracic flexion", "lumbar flexion",
    ...["left", "right"].flatMap((side) => [`hip.${side} flexion`, `hip.${side} abduction`, `hip.${side} internal rotation`, `knee.${side} flexion`, `ankle.${side} dorsiflexion`]),
    `shoulder.${hand} flexion`, `shoulder.${hand} abduction`, `shoulder.${hand} internal rotation`, `elbow.${hand} flexion`];
}

/**
 * The searched ranges: each channel's level, start and length, s; then the gap, m, when it is
 * searched; then when the arm's aim begins, s, and how far past the target it aims, m; then the
 * posture beneath, the hips' turn, the chest's and the trunk's lean, rad (`StraightPunch`).
 */
const WINDOW = 0.45, GAPS = [0.75, 1.3], LEAD = [0, 0.45], THROUGH = [0, 0.3], HIPS = [0, 0.6], TURN = [0, 0.43], LEAN = [0, 0.5];

/** The drive's settings around a schedule: admitted at any range past `reach` of the arm, driven for at most `longest` s. */
const AROUND = { reach: 0.3, band: 2, settle: 0, chamber: 0, elbow: 0, brake: 0, follow: 0.02, longest: 0.5 };

/** The schedule, the gap and the arm's aim that `x` holds for `hand`, the gap `gap` where given. */
export function decode(x, hand, gap) {
  const channels = ceilingChannels(hand), n = channels.length * 3;
  const pushes = channels.map((channel, i) => ({ channel, level: x[3 * i], from: x[3 * i + 1], length: Math.max(0, x[3 * i + 2]) })).filter((p) => Math.abs(p.level) > 0.05);
  const rest = x.slice(n), searched = gap === undefined;
  const [lead, through, hips, turn, lean] = rest.slice(searched ? 1 : 0);
  return { pushes, gap: searched ? rest[0] : gap, lead, through, beneath: hips === undefined ? {} : { hips, turn, lean } };
}

/** The Puncher with its punch driven on `pushes` by `hand`, aimed from `lead` s, `through` m past its target. */
export function timedPuncher({ pushes, lead, through, beneath }, hand) {
  const preset = MINDS.puncher.config, punch = preset.executors[0];
  const executor = { ...punch, ...AROUND, lead, through, ...beneath, timed: { left: hand === "left" ? pushes : [], right: hand === "right" ? pushes : [] } };
  return { mind: { ...preset, executors: [executor] }, action: "strike" };
}

/**
 * A trial's score: a landed blow above 6 by its speed and mass past the bar; else up to 5.6 by how
 * near it came to each test, its speed counted twice and past the bar; -1 nothing on the mark; -3 a fall.
 */
export function scoreOf(reading, hand) {
  if (reading.down) return -3;
  const hit = reading.hit;
  if (!hit) return reading.outcome === "elsewhere" ? -0.5 : -1;
  const speed = (hit.speed ?? 0) / BAR.speed[hand], mass = hit.kg / BAR.mass[hand];
  if (reading.outcome === "landed") return 6 + Math.min(speed - 1, 0.5) + Math.min(mass - 1, 0.5);
  const cone = Math.cos(BAR.cone * Math.PI / 180), wide = Math.cos(2 * BAR.cone * Math.PI / 180);
  const straight = hit.straight === null ? 0 : Math.max(0, Math.min(1, (hit.straight - wide) / (cone - wide)));
  const late = reading.began === null ? 1 : Math.max(0, hit.time - reading.began - BAR.within);
  return 2 * Math.min(1.3, speed) + Math.min(1, mass) + straight + Math.max(0, 1 - late / 0.3) - (reading.ended === null ? 0.5 : 0);
}

/** One drill trial of `subject` on `condition` at `hz`: its reading. */
export async function drillTrial(subject, condition, hz) {
  const cases = STRIKE_CASES.still, world = cases.world([subject], condition, undefined);
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

/** `x` played on `cell`: its score and what it read. */
async function trial(x, cell) {
  const decoded = decode(x, cell.hand, cell.gap ?? undefined);
  const condition = { model: cell.model, mark: cell.mark, hand: cell.hand, across: cell.across, gap: decoded.gap };
  const reading = await drillTrial(timedPuncher(decoded, cell.hand), condition, cell.hz);
  return { score: scoreOf(reading, cell.hand), gap: decoded.gap, outcome: reading.outcome, hit: reading.hit && { speed: reading.hit.speed, kg: reading.hit.kg, straight: reading.hit.straight, on: reading.hit.on, time: reading.began === null ? null : reading.hit.time - reading.began } };
}

if (!isMainThread && workerData?.drill) {
  parentPort.on("message", async ({ id, x }) => {
    let r; try { r = await trial(x, workerData.cell); } catch (error) { r = { score: -5, error: String(error?.stack ?? error) }; }
    parentPort.postMessage({ id, r });
  });
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { out: { type: "string" }, model: { type: "string" }, hand: { type: "string" }, mark: { type: "string" }, across: { type: "string" },
    gap: { type: "string" }, hz: { type: "string" }, workers: { type: "string" }, generations: { type: "string" }, seed: { type: "string" }, from: { type: "string" },
    sigma: { type: "string" }, verify: { type: "string" }, rates: { type: "string" }, gaps: { type: "string" }, marks: { type: "string" }, models: { type: "string" } } });
  if (values.verify) {
    const found = JSON.parse(readFileSync(values.verify, "utf8")), decoded = decode(found.best.x, found.cell.hand, found.cell.gap ?? undefined);
    const list = (text, fallback, parse = String) => text === undefined ? fallback : text.split(",").map(parse);
    for (const hz of list(values.rates, [120, 480], Number)) for (const model of list(values.models, [found.cell.model])) for (const mark of list(values.marks, [found.cell.mark]))
      for (const across of list(values.across, [found.cell.across], Number)) for (const gap of list(values.gaps, [decoded.gap], Number)) {
        const reading = await drillTrial(timedPuncher(decoded, found.cell.hand), { model, mark, hand: found.cell.hand, across, gap }, hz);
        const h = reading.hit;
        console.log(JSON.stringify({ hz, model, mark, across, gap: +gap.toFixed(3), outcome: reading.outcome, score: +scoreOf(reading, found.cell.hand).toFixed(3),
          hit: h && { on: h.on, speed: h.speed && +h.speed.toFixed(2), kg: +h.kg.toFixed(2), straight: h.straight && +h.straight.toFixed(3), after: reading.began === null ? null : +(h.time - reading.began).toFixed(3) } }));
      }
    process.exit(0);
  }
  const cell = { model: values.model ?? "workshop-fighter", hand: values.hand ?? "right", mark: values.mark ?? "middle", across: Number(values.across ?? 0),
    gap: values.gap === undefined ? null : Number(values.gap), hz: Number(values.hz ?? 120) };
  const nw = Number(values.workers ?? Math.max(1, availableParallelism() - 4)), generations = Number(values.generations ?? 60);
  const lo = [], hi = [];
  for (let i = 0; i < ceilingChannels(cell.hand).length; i++) { lo.push(-1, 0, 0); hi.push(1, WINDOW, WINDOW); }
  for (const [low, high] of [...(cell.gap === null ? [GAPS] : []), LEAD, THROUGH, HIPS, TURN, LEAN]) { lo.push(low); hi.push(high); }
  const pool = workerPool(fileURLToPath(import.meta.url), { drill: true, cell }, nw);
  const toX = (u) => u.map((v, i) => lo[i] + (hi[i] - lo[i]) * Math.min(1, Math.max(0, v)));
  const from = values.from ? JSON.parse(readFileSync(values.from, "utf8")).best.x : null;
  const start = from ? lo.map((l, i) => from[i] === undefined ? 0.5 : (from[i] - l) / (hi[i] - l)) : undefined;
  const { best: found } = await cmaSearch({ n: lo.length, start, sigma: Number(values.sigma ?? (from ? 0.15 : 0.25)), lambda: 4 * nw, generations, seed: Number(values.seed ?? 1),
    score: (u) => pool.evaluate(toX(u)),
    onGeneration(entry, { best, mean, log }) {
      console.error(JSON.stringify(entry));
      if (values.out) writeFileSync(values.out, JSON.stringify({ cell, from: values.from ?? null, channels: ceilingChannels(cell.hand), best: { ...best, x: toX(best.u) }, mean: toX(mean), log }));
    } });
  pool.terminate();
  console.log(JSON.stringify({ cell, best: { score: found.score, g: found.g, r: found.r } }));
  process.exit(0);
}
