/**
 * **A timed punch searched on the Strike drill**: the Puncher's straight punch with its drive on a
 * schedule (`StraightPunch.timed`): each of the pushed channels (`ceilingChannels`: the trunk, both
 * legs and the striking arm) a level, a start and a length into the drive, the stance and the arm's
 * aim beneath. A candidate is played as the drill plays a trial (`STRIKE_CASES.still`, its world
 * and its reader, `readStrike`) on one cell: a body, a hand, a mark, an offset across and a gap,
 * the gap searched with the schedule unless given, at each of `--rates` (its worst counts). It is scored by the bar (`BAR`, `read.ts`): a
 * landed blow scores above every other, by its speed and mass past the bar; any other trial by how
 * near its hit came to each of the bar's tests (with `--near`, one with nothing on the mark by how
 * near the fist came to the punch's target, `NEAR`); a fall lowest. The punch is admitted at any range
 * past its arm's (a wide `band`), so where it stands is the cell's.
 *
 *   node research/punch-drill.mjs --out <file.json> [--model workshop-fighter] [--hand right] [--mark middle] [--across 0] [--gap <m>]
 *     [--tune] [--spread "workshop-fighter:0.9,1;workshop-rogue:0.85" [--offsets 0,0.1]] [--rates 120,480] [--without <channel,...>] [--driven] [--fire] [--brake] [--ease] [--chest] [--near] [--heavier <times>] [--workers 12] [--lambda <4 workers>] [--generations 60] [--seed 1] [--from <file.json> [--sigma 0.15]]
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
/** With `--driven`, the striking point's drive (`StraightPunch.driven`): its acceleration, m/s^2, its steer, 1/s, and the way it arrives over, m. */
const ACCEL = [40, 600], STEER = [0, 60], ARRIVE = [0, 0.4];
/** With `--fire`, how near the fist comes to the target before the arm's drive begins, arm lengths (`StraightPunch.fire`). */
const FIRE = [0, 1.2];
/** With `--brake`, how near its goal a channel pushed toward one is held instead, rad (`StraightPunch.brake`). */
const BRAKE = [0, 0.3];

/** With `--ease`, how near its goal a channel's push falls in proportion, rad (`StraightPunch.ease`). */
const EASE = [0.005, 0.095];

/** With `--chest`, the strike's aim: the chest's open surface over the belly's (`SURFACE_AIM`). */
export const CHEST = { kind: "surface", tuning: { upperTrunk: 1, middleTrunk: -1 } };

/** The drive's settings around a schedule: admitted at any range past `reach` of the arm, driven for at most `longest` s. */
export const AROUND = { reach: 0.6, band: 2, settle: 0, chamber: 0, elbow: 0, brake: 0, follow: 0.02, longest: 0.5 };

/**
 * The schedule, the gap and the arm's aim that `x` holds for `hand`, the gap `gap` where given; the
 * channels `without` left off the schedule, so the punch pushes them toward their goals.
 */
export function decode(x, hand, gap, without = new Set(), { driven = true, fire = false, brake = false, ease = false } = {}) {
  const channels = ceilingChannels(hand), n = channels.length * 3;
  const pushes = channels.map((channel, i) => ({ channel, level: Math.abs(x[3 * i]) > 0.05 ? x[3 * i] : 0, from: x[3 * i + 1], length: Math.max(0, x[3 * i + 2]) }))
    .filter((p, i) => !without.has(channels[i]));
  const rest = x.slice(n), searched = gap === undefined;
  const [lead, through, hips, turn, lean, ...more] = rest.slice(searched ? 1 : 0);
  const [accel, steer, arrive] = driven ? more : [], reach = fire ? more[driven ? 3 : 0] : undefined;
  const held = brake ? more[(driven ? 3 : 0) + (fire ? 1 : 0)] : undefined;
  const eased = ease ? more[(driven ? 3 : 0) + (fire ? 1 : 0) + (brake ? 1 : 0)] : undefined;
  return { pushes, gap: searched ? rest[0] : gap, lead, through, beneath: hips === undefined ? {} : { hips, turn, lean },
    ...(accel === undefined ? {} : { driven: { accel, steer, arrive } }), ...(reach === undefined ? {} : { fire: reach }), ...(held === undefined ? {} : { brake: held }), ...(eased === undefined ? {} : { ease: eased }) };
}

/** The Puncher with its punch driven on `pushes` by `hand`, aimed from `lead` s, `through` m past its target; with `aim`, its strike so aimed at the middle mark. */
export function timedPuncher({ pushes, lead, through, beneath, driven, fire, brake, ease }, hand, aim = null) {
  const preset = MINDS.puncher.config, punch = preset.executors[0];
  const actions = aim ? preset.actions.map((action) => action.name === "strike" ? { ...action, aim, regions: [{ kind: "mark", mark: "middle" }] } : action) : preset.actions;
  const executor = { ...punch, ...AROUND, lead, through, ...beneath, ...(driven ? { driven } : {}), ...(fire === undefined ? {} : { fire }), ...(brake === undefined ? {} : { brake }), ...(ease === undefined ? {} : { ease }), timed: { left: hand === "left" ? pushes : [], right: hand === "right" ? pushes : [] } };
  return { mind: { ...preset, actions, executors: [executor] }, action: "strike" };
}

/**
 * A trial's score: a landed blow above 9 by how far inside each of the bar's tests it is, each
 * margin a share of its limit's room up to the test's best, so a search moves off every test's
 * edge, the ones its blows scatter most across included; else up to 8 by how
 * near it came to each test, its speed counted twice, none past the bar, so no test is traded for
 * another's margin, the mass counted `heavier` times within those 8; -1 nothing on the mark; -3 a fall.
 */
export function scoreOf(reading, hand, heavier = 1) {
  if (reading.down) return -3;
  const hit = reading.hit;
  if (!hit) return reading.outcome === "elsewhere" || reading.outcome === "guarded" ? -0.5 : -1;
  const speed = (hit.speed ?? 0) / BAR.speed[hand], mass = hit.kg / BAR.mass[hand];
  const cone = Math.cos(BAR.cone * Math.PI / 180), wide = Math.cos(2 * BAR.cone * Math.PI / 180), unit = (v) => Math.max(0, Math.min(1, v));
  if (reading.outcome === "landed") {
    const room = (value, limit, best) => Math.min(1, Math.max(0, (value - limit) / (best - limit)));
    const along = Math.cos(BAR.along * Math.PI / 180), rad = Math.PI / 180;
    return 9 + room(speed, 1, 1.5) + room(mass, 1, 2) + room(hit.straight, cone, 1) + room(hit.along, along, 1)
      + room(-hit.bend, -BAR.bend * rad, 0) + room(-hit.lean, -BAR.lean * rad, 0) + room(-(hit.time - reading.began), -BAR.within, 0);
  }
  const towards = (cosine) => cosine === null ? 0 : unit((cosine - wide) / (cone - wide));
  const within = (angle, limit) => unit(1 - Math.max(0, angle - limit * Math.PI / 180) / (limit * Math.PI / 180));
  const late = reading.began === null ? 1 : Math.max(0, hit.time - reading.began - BAR.within);
  const lined = (cosine) => cosine === null ? 0 : unit((cosine - Math.cos(2 * BAR.along * Math.PI / 180)) / (Math.cos(BAR.along * Math.PI / 180) - Math.cos(2 * BAR.along * Math.PI / 180)));
  return (2 * Math.min(1, speed) + heavier * Math.min(1, mass) + towards(hit.straight) + lined(hit.along) + within(hit.bend, BAR.bend) + within(hit.lean, BAR.lean)
    + Math.max(0, 1 - late / 0.3)) * 8 / (7 + heavier) - (reading.ended === null ? 0.5 : 0);
}

/**
 * `x`, a schedule for `from`'s hand, made the other hand's in place: each side's channel moved to
 * the other side's, the trunk's turn reversed.
 */
export function mirrored(x, from, to) {
  const source = ceilingChannels(from), target = ceilingChannels(to), copy = [...x];
  const swap = (name) => name.replace(/\.(left|right) /, (_, side) => `.${side === "left" ? "right" : "left"} `);
  source.forEach((channel, i) => {
    const j = target.indexOf(swap(channel));
    if (j < 0) throw new Error(`no mirror of ${channel}`);
    x[3 * j] = /rotation right$/.test(channel) && !channel.includes(".") ? -copy[3 * i] : copy[3 * i];
    x[3 * j + 1] = copy[3 * i + 1]; x[3 * j + 2] = copy[3 * i + 2];
  });
}

/**
 * With `--tune`, the searched knobs over a schedule held fixed: its time scale and shift, s, then
 * the arm's aim (when it begins, s, and how far through, m) and the posture beneath.
 */
const TUNE = [[0.7, 1.4], [-0.1, 0.1], LEAD, THROUGH, HIPS, TURN, LEAN];

/** `base`, a whole schedule's `x`, with `knobs` (`TUNE`'s) set on it for `cell`. */
function tuned(base, knobs, cell) {
  const x = [...base], n = 3 * ceilingChannels(cell.hand).length, [scale, shift, ...rest] = knobs;
  for (let i = 0; i < n; i += 3) { x[i + 1] = Math.max(0, x[i + 1] * scale + shift); x[i + 2] *= scale; }
  rest.forEach((value, k) => { x[n + k] = value; });
  return x;
}

/** The places `--spread` names ("body:gap,gap;body:gap"), each at every offset across of `--offsets`; null without one. */
function spreadOf(text, offsets) {
  if (!text) return null;
  const across = (offsets ?? "0").split(",").map(Number);
  return text.split(";").flatMap((part) => {
    const [model, gaps] = part.split(":");
    return gaps.split(",").map(Number).flatMap((gap) => across.map((offset) => ({ model, gap, across: offset })));
  });
}

/** One drill trial of `subject` on `condition` at `hz`: its reading, and the nearest its fist came to the punch's target through the drive, m. */
export async function drillTrial(subject, condition, hz) {
  const cases = STRIKE_CASES.still, world = cases.world([subject], condition, undefined);
  const built = await buildBout(world.recipe, { hz });
  try {
    const reader = cases.read(built, condition), motion = built.duel.duelists.left.minded.skills.state.actions.executors[0].motion, body = built.duel.duelists.left.body;
    let nearest = Infinity;
    built.duel.play(world.tape);
    while (!reader.ended) {
      if (built.duel.clock > cases.seconds + 1) throw new Error("the trial ran past its seconds");
      built.world.step();
      reader.afterStep();
      if (motion.phase === "swing") {
        const f = body.view.fists[condition.hand].position, t = motion.target;
        nearest = Math.min(nearest, Math.sqrt((f.x - t[0]) * (f.x - t[0]) + (f.y - t[1]) * (f.y - t[1]) + (f.z - t[2]) * (f.z - t[2])));
      }
    }
    return Object.assign(reader.reading(), { nearest });
  } finally { built.dispose(); }
}

/** With `--near`, how much a trial with nothing on the mark gains for its fist's coming within `NEAR` m of the punch's target: up to `NEARING`, still below any hit's. */
const NEAR = 0.25, NEARING = 0.5;

/**
 * `x` played on `cell` at each of its rates, the worst rate's score and what it read there; with a
 * spread, on each of its places (a body, a gap and an offset across), scored by their mean.
 */
async function trial(x, cell) {
  if (cell.base) return trial(tuned(cell.base, x, cell), { ...cell, base: null });
  if (cell.spread) {
    const each = [];
    for (const place of cell.spread) each.push(await trial(x, { ...cell, ...place, spread: null }));
    const landed = each.filter((r) => r.outcome === "landed").length;
    return { score: each.reduce((sum, r) => sum + r.score, 0) / each.length, landed, places: each.length,
      outcomes: each.map((r) => r.outcome), worst: each.reduce((a, b) => (b.score < a.score ? b : a)) };
  }
  const decoded = decode(x, cell.hand, cell.gap ?? undefined, new Set(cell.without ?? []), { driven: !!cell.driven, fire: !!cell.fire, brake: !!cell.brake, ease: !!cell.ease });
  const condition = { model: cell.model, mark: cell.mark, hand: cell.hand, across: cell.across, gap: decoded.gap };
  let worst = null;
  for (const hz of cell.rates) {
    const reading = await drillTrial(timedPuncher(decoded, cell.hand, cell.chest ? CHEST : null), condition, hz);
    const score = scoreOf(reading, cell.hand, cell.heavier) + (cell.near && !reading.hit && !reading.down ? NEARING * Math.max(0, 1 - reading.nearest / NEAR) : 0);
    if (worst === null || score < worst.score) worst = { score, hz, gap: decoded.gap, outcome: reading.outcome, hit: reading.hit && { speed: reading.hit.speed, kg: reading.hit.kg, straight: reading.hit.straight, along: reading.hit.along, bend: reading.hit.bend, lean: reading.hit.lean, on: reading.hit.on, time: reading.began === null ? null : reading.hit.time - reading.began } };
  }
  return worst;
}

if (!isMainThread && workerData?.drill) {
  parentPort.on("message", async ({ id, x }) => {
    let r; try { r = await trial(x, workerData.cell); } catch (error) { r = { score: -5, error: String(error?.stack ?? error) }; }
    parentPort.postMessage({ id, r });
  });
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { out: { type: "string" }, model: { type: "string" }, hand: { type: "string" }, mark: { type: "string" }, across: { type: "string" },
    gap: { type: "string" }, hz: { type: "string" }, workers: { type: "string" }, generations: { type: "string" }, seed: { type: "string" }, from: { type: "string" },
    sigma: { type: "string" }, tune: { type: "boolean" }, spread: { type: "string" }, offsets: { type: "string" }, lambda: { type: "string" }, without: { type: "string" }, driven: { type: "boolean" }, fire: { type: "boolean" }, brake: { type: "boolean" }, ease: { type: "boolean" }, chest: { type: "boolean" }, near: { type: "boolean" }, heavier: { type: "string" }, verify: { type: "string" }, rates: { type: "string" }, gaps: { type: "string" }, marks: { type: "string" }, models: { type: "string" } } });
  if (values.verify) {
    const found = JSON.parse(readFileSync(values.verify, "utf8"));
    const decoded = decode(found.cell.base ? tuned(found.cell.base, found.best.x, found.cell) : found.best.x, found.cell.hand, found.cell.gap ?? undefined, new Set(found.cell.without ?? []), { driven: found.cell.driven !== false, fire: !!found.cell.fire, brake: !!found.cell.brake, ease: !!found.cell.ease });
    const list = (text, fallback, parse = String) => text === undefined ? fallback : text.split(",").map(parse);
    for (const hz of list(values.rates, [120, 480], Number)) for (const model of list(values.models, [found.cell.model])) for (const mark of list(values.marks, [found.cell.mark]))
      for (const across of list(values.across, [found.cell.across], Number)) for (const gap of list(values.gaps, [decoded.gap], Number)) {
        const reading = await drillTrial(timedPuncher(decoded, found.cell.hand, (values.chest ?? found.cell.chest) ? CHEST : null), { model, mark, hand: found.cell.hand, across, gap }, hz);
        const h = reading.hit;
        console.log(JSON.stringify({ hz, model, mark, across, gap: +gap.toFixed(3), outcome: reading.outcome, score: +scoreOf(reading, found.cell.hand).toFixed(3),
          hit: h && { on: h.on, speed: h.speed && +h.speed.toFixed(2), kg: +h.kg.toFixed(2), straight: h.straight && +h.straight.toFixed(3), along: h.along && +h.along.toFixed(3), bend: +h.bend.toFixed(2), lean: +h.lean.toFixed(2), after: reading.began === null ? null : +(h.time - reading.began).toFixed(3) } }));
      }
    process.exit(0);
  }
  const cell = { model: values.model ?? "workshop-fighter", hand: values.hand ?? "right", mark: values.mark ?? "middle", across: Number(values.across ?? 0),
    gap: values.gap === undefined ? (values.spread ? 0 : null) : Number(values.gap), spread: spreadOf(values.spread, values.offsets), without: (values.without ?? "").split(",").filter(Boolean), driven: !!values.driven, fire: !!values.fire, brake: !!values.brake, ease: !!values.ease, chest: !!values.chest, near: !!values.near, heavier: Number(values.heavier ?? 1), rates: (values.rates ?? values.hz ?? "120").split(",").map(Number) };
  const nw = Number(values.workers ?? Math.max(1, availableParallelism() - 4)), generations = Number(values.generations ?? 60);
  const lo = [], hi = [], without = new Set(cell.without);
  for (const channel of ceilingChannels(cell.hand)) { const level = without.has(channel) ? 0 : 1; lo.push(-level, 0, 0); hi.push(level, WINDOW, WINDOW); }
  for (const [low, high] of [...(cell.gap === null ? [GAPS] : []), LEAD, THROUGH, HIPS, TURN, LEAN, ...(cell.driven ? [ACCEL, STEER, ARRIVE] : []), ...(cell.fire ? [FIRE] : []), ...(cell.brake ? [BRAKE] : []), ...(cell.ease ? [EASE] : [])]) { lo.push(low); hi.push(high); }
  if (values.tune) { lo.length = 0; hi.length = 0; for (const [low, high] of TUNE) { lo.push(low); hi.push(high); } }
  const toX = (u) => u.map((v, i) => lo[i] + (hi[i] - lo[i]) * Math.min(1, Math.max(0, v)));
  const fromFile = values.from ? JSON.parse(readFileSync(values.from, "utf8")) : null, from = fromFile ? [...fromFile.best.x] : null;
  if (from && fromFile.cell.gap === null && cell.gap !== null) from.splice(3 * ceilingChannels(cell.hand).length, 1);
  if (from && fromFile.cell.hand !== cell.hand) mirrored(from, fromFile.cell.hand, cell.hand);
  if (values.tune) { cell.base = [...from]; const n = 3 * ceilingChannels(cell.hand).length; from.length = 0; from.push(1, 0, ...cell.base.slice(n, n + 5)); }
  const start = from ? lo.map((l, i) => from[i] === undefined || hi[i] === l ? 0.5 : (from[i] - l) / (hi[i] - l)) : undefined;
  const pool = workerPool(fileURLToPath(import.meta.url), { drill: true, cell }, nw);
  const { best: found } = await cmaSearch({ n: lo.length, start, sigma: Number(values.sigma ?? (from ? 0.15 : 0.25)), lambda: Number(values.lambda ?? 4 * nw), generations, seed: Number(values.seed ?? 1),
    score: (u) => pool.evaluate(toX(u)),
    onGeneration(entry, { best, mean, log }) {
      console.error(JSON.stringify(entry));
      if (values.out) writeFileSync(values.out, JSON.stringify({ cell, from: values.from ?? null, channels: ceilingChannels(cell.hand), best: { ...best, x: toX(best.u) }, mean: toX(mean), log }));
    } });
  pool.terminate();
  console.log(JSON.stringify({ cell, best: { score: found.score, g: found.g, r: found.r } }));
  process.exit(0);
}
