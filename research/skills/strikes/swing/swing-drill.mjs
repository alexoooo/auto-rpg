/**
 * **A swing searched on the Strike drill**: Option Mind's swung blow of `--blow <kind>` (`SWINGS`:
 * `cut`, `club-blow`), its striking hand holding the blow's item and the other the buckler, as the
 * game's loadouts hold them. Each of the swung channels (`swingChannels`: the trunk's turn and bends,
 * the striking arm and its wrist) has a windup angle, a fraction of its range (`Swing.wound`), and a
 * push: a level, a start and a length into the swing (`Swing.timed`); then where it stands to swing
 * (`reach`, the head from the target across the ground), how long the wound stance stands quiet
 * (`settle`), and with `--footing` where each foot steps before it winds (`Swing.footing`). Its
 * window is the record's (`AROUND`: `BAND` deep, `ASIDE` to either side), so the drill walks the
 * body into it from wherever it starts, as a game does. A candidate is played as
 * the drill plays a trial (`drillTrial`, `STRIKE_CASES.still`) on one cell: a body, a hand, a mark,
 * an offset across, at each of the cell's starting gaps and `--rates` (the worst rate counts at
 * each gap and `--targets` body, their mean overall), scored by its striker's bar (`barScore`); with `--near`, a
 * trial with nothing on the mark by how near the face came to its aim. A touch before the swing
 * commits (its windup's) counts as no hit.
 *
 * With `--protocol <rung>`, the trials are that rung's instead (`bonk`: at a target with its arms
 * lowered); with `--other <item>`, the other hand holds that (the buckler where none). With
 * `--feasible`, a bonk that meets its form (`Overhead`: every test but full strength and back to
 * guard) scores 9 and its energy's share of the bar, uncapped, so the search climbs the strongest
 * such blow; any other trial as the bar scores it.
 *
 *   node research/skills/strikes/swing/swing-drill.mjs --blow <kind> --out <file.json> [--model workshop-fighter] [--hand right] [--mark middle] [--across 0[,0.2]] [--gaps 1,1.4] [--targets workshop-fighter,crypt-skeleton]
 *     [--protocol still] [--other buckler] [--feasible] [--footing <behind,right,behind,right>] [--rates 120,480] [--near] [--workers 12] [--lambda <4 workers>] [--generations 60] [--seed 1] [--from <file.json>] [--sigma 0.15]
 *   node research/skills/strikes/swing/swing-drill.mjs --verify <file.json> [--rates 120,480] [--gaps 0.9,1.2,1.5] [--across 0,0.2] [--marks middle,high] [--models ...] [--targets ...]
 *   node research/skills/strikes/swing/swing-drill.mjs --settings <file.json>   the found swing's settings, whole, for `skill-records.mjs`
 *
 * `--from` seeds the search from a search's file, by channel name. `--footing` searches the footing
 * too, the left foot's place then the right's, m; it starts there where `--from`'s search has none.
 *
 * Harness: Node, the bout world (`buildBout`) on Rapier (`DEFAULT_ENGINE`), the drill's layout.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { isMainThread, parentPort, workerData } from "node:worker_threads";
import "../../../../tests/harness/preload-data.mjs";
import { MINDS, partLookup } from "../../../../src/app/catalog.ts";
import { modelSpec } from "../../../../src/core/bodies/models.ts";
import { barScore as scoreOf } from "../../../../src/evaluation/strike/score.ts";
import { SWINGS } from "../../../../src/skills/strikes/swing-part.ts";
import { cmaSearch, workerPool } from "../../../cma.mjs";
import { drillTrial } from "../straight-punch/punch-drill.mjs";

/** The swung channels of `hand`'s swing: the trunk's turn and bends, the striking arm and its wrist. */
export function swingChannels(hand) {
  return ["thoracic rotation right", "lumbar rotation right", "thoracic flexion", "lumbar flexion", "thoracic lateral flexion right", `shoulder.${hand} flexion`, `shoulder.${hand} abduction`,
    `shoulder.${hand} internal rotation`, `elbow.${hand} flexion`, `wrist.${hand} flexion`, `wrist.${hand} radial deviation`, `wrist.${hand} pronation`];
}

/** The searched ranges: a push's start and length, s; where it stands, m; how long the wound stance stands quiet, s. */
const FROM = [0, 0.3], LENGTH = [0, 0.4], REACH = [0.4, 1.3], SETTLE = [0, 0.4];

/** How far inside each end of its range a windup angle stands, a share of the range: a channel held at its stop never counts as wound. */
const WITHIN = 0.05;

/** Where a foot is searched, m: behind the target, and to the right of the way the body faces it. */
const BEHIND = [0.4, 1.3], RIGHT = [-0.5, 0.5];

/** A push weaker than this leaves the schedule. */
const QUIET = 0.05;

/** The window's depth past `reach` and its half-width, m: as deep as a walk into it settles the body, and as wide. */
const BAND = 0.15, ASIDE = 0.15;

/**
 * The swing's settings around its windup, schedule and stand-off: admitted facing the target in
 * its window (`BAND`, `ASIDE`), swung for at most `longest` s; its pace, follow and return the
 * drive's around its schedules (`punch-drill.mjs`'s `AROUND`).
 */
export const AROUND = { pace: 1.021, band: BAND, aside: ASIDE, follow: 0.02, longest: 0.5, recover: 0.376 };

/** Each of `channels`' range on `model`, rad: its least and most angle. */
function rangesOf(model, channels) {
  const spec = modelSpec(model), dofs = new Map(spec.joints.flatMap((joint) => joint.dofs.map((dof) => [`${joint.name} ${dof.positive}`, dof])));
  return channels.map((channel) => {
    const dof = dofs.get(channel);
    if (!dof) throw new Error(`${model} has no ${channel}`);
    return [dof.min.value, dof.max.value];
  });
}

/** The windup, schedule, stand-off, settle and footing (where it has one) `x` holds over `channels` on `model`. */
export function decode(x, model, channels) {
  const ranges = rangesOf(model, channels), wound = {}, timed = [];
  channels.forEach((channel, i) => {
    const [low, high] = ranges[i], [fraction, level, from, length] = x.slice(4 * i, 4 * i + 4);
    wound[channel] = low + (WITHIN + (1 - 2 * WITHIN) * Math.min(1, Math.max(0, fraction))) * (high - low);
    if (Math.abs(level) > QUIET && length > 0) timed.push({ channel, level: Math.max(-1, Math.min(1, level)), from: Math.max(0, from), length });
  });
  const [reach, settle, ...feet] = x.slice(4 * channels.length);
  return { wound, timed, reach, settle: Math.max(0, settle), ...(feet.length === 4 ? { footing: { left: [feet[0], feet[1]], right: [feet[2], feet[3]] } } : {}) };
}

/** `footing` for the other hand: the feet swapped, each to the other side. */
const mirrored = (footing) => ({ left: [footing.right[0], -footing.right[1]], right: [footing.left[0], -footing.left[1]] });

/** The swing's settings, whole, that `decoded` holds for `hand`, its footing mirrored for the other. */
export function settingsOf({ wound, timed, reach, settle, footing }, hand) {
  return { ...AROUND, reach, settle, wound: { left: hand === "left" ? wound : {}, right: hand === "right" ? wound : {} },
    ...(footing ? { footing: hand === "left" ? { left: footing, right: mirrored(footing) } : { left: mirrored(footing), right: footing } } : {}),
    timed: { left: hand === "left" ? timed : [], right: hand === "right" ? timed : [] } };
}

/**
 * Option Mind throwing its swung blow of `blow` alone, so set, `hand` holding its item and the other
 * `held`, at `mark`. A blow its preset has no Option for (the bonk) is thrown by its own Option's
 * defaults (`strike-<blow>`), in the place of the preset's Option of a blow with the same item;
 * such a blow has no profile, and the Mind's own walks (`walk`) are left out: priced by its prior
 * alone, it is worth so little that a walk outbids it as it winds, and the swing is let go.
 */
export function swinger(decoded, hand, blow, mark, held = "buckler") {
  const preset = MINDS.option.config, other = hand === "left" ? "right" : "left", tuning = settingsOf(decoded, hand);
  const owned = preset.options.some((option) => option.kind.startsWith("strike-") && option.skill.kind === blow);
  const own = owned ? null : partLookup.of("option", { kind: `strike-${blow}` }).defaults;
  const options = preset.options.map((option) => !option.kind.startsWith("strike-") ? option
    : option.skill.kind === blow ? { ...option, skill: { ...option.skill, tuning }, regions: [{ kind: "mark", mark }] }
    : own && SWINGS[option.skill.kind]?.item === SWINGS[blow].item ? { ...own, skill: { ...own.skill, tuning }, regions: [{ kind: "mark", mark }] } : option);
  return { mind: { ...preset, options: own ? options.filter((option) => option.kind !== "walk") : options }, skill: blow,
    held: { [hand]: SWINGS[blow].item, [other]: held } };
}

/** With `--near`, how much a trial with nothing on the mark gains for its face's coming within `NEAR` m of its aim: up to `NEARING`, still below any hit's. */
const NEAR = 0.3, NEARING = 0.5;

/** One trial of `decoded` on `cell` from `gap` at `hz`, at a `target` body (the drill's Warrior where none): its score and what it read. */
async function once(decoded, cell, gap, hz, target) {
  const reading = await drillTrial(swinger(decoded, cell.hand, cell.blow, cell.mark, cell.other), { model: cell.model, mark: cell.mark, hand: cell.hand, across: cell.across, gap,
    ...(target ? { target } : {}) }, hz, cell.protocol);
  // A touch before the swing commits is its windup's, not its blow: it scores as a swing that never came.
  if (reading.hit && (reading.committed === null || reading.hit.time < reading.committed)) { reading.hit = null; reading.outcome = "early"; }
  const form = reading.hit?.overhead, formed = cell.feasible && reading.outcome !== "fell" && form && form.short.every((test) => test === "full strength" || test === "back to guard");
  const score = (formed ? 9 + form.share : scoreOf(reading, cell.hand)) + (cell.near && !reading.hit && !reading.down && reading.outcome !== "early" ? NEARING * Math.max(0, 1 - reading.nearest / NEAR) : 0);
  return { score, reading };
}

/**
 * `x` played on `cell` from each of its gaps and offsets across (`acrosses`, its `across` alone where
 * it names none) at each of its targets and rates: the mean over places and targets of each one's
 * worst rate, how many landed at every rate, and the worst trial.
 */
async function trial(x, cell) {
  const decoded = decode(x, cell.model, swingChannels(cell.hand)), each = [];
  for (const across of cell.acrosses ?? [cell.across]) for (const gap of cell.gaps) for (const target of cell.targets ?? [null]) {
    let worst = null;
    for (const hz of cell.rates) {
      const { score, reading } = await once(decoded, { ...cell, across }, gap, hz, target);
      if (worst === null || score < worst.score) worst = { score, hz, gap, across, target, outcome: reading.outcome, nearest: reading.nearest,
        hit: reading.hit && { held: reading.hit.held, energy: reading.hit.energy, mechanism: reading.hit.mechanism, faced: reading.hit.faced, on: reading.hit.on,
          ...(reading.hit.overhead ? { short: reading.hit.overhead.short, bend: reading.hit.bend } : {}),
          time: reading.committed === null ? null : reading.hit.time - reading.committed } };
    }
    each.push(worst);
  }
  return { score: each.reduce((sum, r) => sum + r.score, 0) / each.length, landed: each.filter((r) => r.outcome === "landed").length, gaps: each.length, reach: decoded.reach,
    worst: each.reduce((a, b) => (b.score < a.score ? b : a)) };
}

if (!isMainThread && workerData?.swing) {
  parentPort.on("message", async ({ id, x }) => {
    let r; try { r = await trial(x, workerData.cell); } catch (error) { r = { score: -5, error: String(error?.stack ?? error) }; }
    parentPort.postMessage({ id, r });
  });
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { out: { type: "string" }, blow: { type: "string" }, model: { type: "string" }, hand: { type: "string" }, mark: { type: "string" },
    across: { type: "string" }, workers: { type: "string" }, generations: { type: "string" }, seed: { type: "string" }, from: { type: "string" },
    sigma: { type: "string" }, lambda: { type: "string" }, near: { type: "boolean" }, verify: { type: "string" }, settings: { type: "string" },
    rates: { type: "string" }, gaps: { type: "string" }, marks: { type: "string" }, models: { type: "string" }, targets: { type: "string" },
    protocol: { type: "string" }, other: { type: "string" }, feasible: { type: "boolean" }, footing: { type: "string" } } });
  const list = (text, fallback, parse = String) => text === undefined ? fallback : text.split(",").map(parse);
  if (values.settings) {
    const found = JSON.parse(readFileSync(values.settings, "utf8"));
    console.log(JSON.stringify(settingsOf(decode(found.best.x, found.cell.model, found.channels), found.cell.hand), null, 2));
    process.exit(0);
  }
  if (values.verify) {
    const found = JSON.parse(readFileSync(values.verify, "utf8")), cell = found.cell, decoded = decode(found.best.x, cell.model, found.channels);
    for (const hz of list(values.rates, [120, 480], Number)) for (const model of list(values.models, [cell.model])) for (const mark of list(values.marks, [cell.mark]))
      for (const across of list(values.across, [cell.across], Number)) for (const gap of list(values.gaps, cell.gaps, Number)) for (const target of list(values.targets, cell.targets ?? [null])) {
        const { score, reading } = await once(decoded, { ...cell, model, mark, across, near: false }, gap, hz, target), h = reading.hit;
        console.log(JSON.stringify({ hz, model, target, mark, across, gap, outcome: reading.outcome, score: +score.toFixed(3),
          hit: h && { on: h.on, held: h.held && { value: +h.held.value.toFixed(2), bar: h.held.bar }, energy: +h.energy.toFixed(1), mechanism: h.mechanism, faced: h.faced,
            ...(h.overhead ? { short: h.overhead.short, share: +h.overhead.share.toFixed(2), bend: +(h.bend * 180 / Math.PI).toFixed(0) } : {}),
            after: reading.committed === null ? null : +(h.time - reading.committed).toFixed(3) } }));
      }
    process.exit(0);
  }
  const cell = { blow: values.blow, model: values.model ?? "workshop-fighter", hand: values.hand ?? "right", mark: values.mark ?? "middle", across: Number(values.across?.split(",")[0] ?? 0),
    ...(values.across?.includes(",") ? { acrosses: list(values.across, [], Number) } : {}),
    gaps: list(values.gaps, [1.2], Number), near: !!values.near, rates: list(values.rates, [120], Number), ...(values.targets ? { targets: list(values.targets, []) } : {}),
    protocol: values.protocol ?? "still", other: values.other ?? "buckler", feasible: !!values.feasible };
  if (!Object.hasOwn(SWINGS, cell.blow ?? "")) throw new Error(`--blow names a swing: one of ${Object.keys(SWINGS).join(", ")}`);
  const ranges = rangesOf(cell.model, swingChannels(cell.hand)), lo = [], hi = [];
  for (const _ of ranges) { lo.push(0, -1, FROM[0], LENGTH[0]); hi.push(1, 1, FROM[1], LENGTH[1]); }
  for (const [low, high] of [REACH, SETTLE, ...(values.footing ? [BEHIND, RIGHT, BEHIND, RIGHT] : [])]) { lo.push(low); hi.push(high); }
  const toX = (u) => u.map((v, i) => lo[i] + (hi[i] - lo[i]) * Math.min(1, Math.max(0, v)));
  let start;
  if (values.from) {
    // By channel name, so a search over other channels seeds this one: a channel it lacks starts unpushed at mid-range.
    const found = JSON.parse(readFileSync(values.from, "utf8")), was = found.channels, x = [];
    swingChannels(cell.hand).forEach((channel) => { const k = was.indexOf(channel); x.push(...(k < 0 ? [0.5, 0, 0, 0] : found.best.x.slice(4 * k, 4 * k + 4))); });
    x.push(...found.best.x.slice(4 * was.length, 4 * was.length + 2));
    // A footing its seed lacks starts where `--footing` puts it: behind,right,behind,right, the left foot's then the right's.
    x.push(...found.best.x.slice(4 * was.length + 2, 4 * was.length + 6));
    if (x.length < lo.length) x.push(...values.footing.split(",").map(Number));
    start = lo.map((l, i) => (x[i] - l) / (hi[i] - l));
  }
  const nw = Number(values.workers ?? Math.max(1, availableParallelism() - 4)), generations = Number(values.generations ?? 60);
  const pool = workerPool(fileURLToPath(import.meta.url), { swing: true, cell }, nw);
  const { best: found } = await cmaSearch({ n: lo.length, start, sigma: Number(values.sigma ?? (start ? 0.15 : 0.25)), lambda: Number(values.lambda ?? 4 * nw), generations,
    seed: Number(values.seed ?? 1), score: (u) => pool.evaluate(toX(u)),
    onGeneration(entry, { best, mean, log }) {
      console.error(JSON.stringify(entry));
      if (values.out) writeFileSync(values.out, JSON.stringify({ cell, channels: swingChannels(cell.hand), best: { ...best, x: toX(best.u) }, mean: toX(mean), log }));
    } });
  pool.terminate();
  console.log(JSON.stringify({ cell, best: { score: found.score, g: found.g, r: found.r } }));
  process.exit(0);
}
