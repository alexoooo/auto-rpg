/**
 * **A timed blow searched on its drill's twin**: a body's straight punch (`--skill punch`) or a held
 * blow driven straight (`--skill thrust`: the sword thrust), its drive on a schedule
 * (`StraightDrive.timed`): each of the pushed channels (`ceilingChannels`: the trunk, both legs and
 * the striking arm, a held blow's wrist beside it) a level, a start and a length into the drive,
 * searched for `--hand` and mirrored to the other hand (`mirrored`), the arm's aim and the posture
 * beneath. A candidate is those settings as the skill's research tuning over the body's record
 * (`withTuning`, unsteered), everything else the table's cell's: the drills' Option Mind
 * (`option-drill`), its window, what it holds. It is played on the training twin of every cell of
 * the body's row of the skill (`rowOf`; `--loadout` one cell), the drill's own admission giving
 * each its places, marks and hands, at the game's rate, 120 Hz, and scored by the mean of its
 * trials' search scores (`searchScore`: the cell's value, a blow short of the bar graded below it)
 * ([the skill recipe](../../../../docs/recipes/skill.md#an-options-code): research scores on its
 * drill). `--confirm` plays a search's best and the record the body plays now on the row's cells'
 * own cases at 120 and 480 Hz, the worse counting (`confirmRow`).
 *
 * Feasibility (the recipe's step 2) is searched the same way with the channels pushed free
 * (`--free`: a channel pushed under `FREE` leaves the schedule) or some left off it (`--without`);
 * with `--fire`, `--brake` and `--chamber`, the drive's fire, brake and chamber are searched too;
 * with `--tune`, only a schedule's time scale and shift and its aim and posture, over `--from`'s.
 *
 *   node research/skills/strikes/straight-punch/punch-drill.mjs --body man --skill punch|thrust --out <file.json> [--loadout <left,right>] [--hand right]
 *     [--tune] [--without <channel,...>] [--fire] [--brake] [--free] [--chamber [--chamber-range <m,m>]] [--workers N] [--lambda 16] [--generations 60] [--seed 1] [--from <file.json> [--sigma 0.15]]
 *   node research/skills/strikes/straight-punch/punch-drill.mjs --confirm <file.json> [--workers N]
 *
 * Harness: Node, the Strike drill's bout world (`playCase`) on Rapier (`DEFAULT_ENGINE`), 120 Hz;
 * the confirmation 120 and 480 Hz.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import "../../../../tests/harness/preload-data.mjs";
import { SIDES } from "../../../../src/core/bodies/bilateral.ts";
import { cmaSearch } from "../../../cma.mjs";
import { confirmRow, drillTrials, rowOf, scoreOn, subjectOf, trialPool, withTuning } from "../../../drill-trials.mjs";

/** The pushed channels, as the punch's ceiling pushes them (`punch-ceiling.mjs`): the trunk, both legs and the striking arm; with `wrist`, its wrist's too. */
export function ceilingChannels(hand, wrist = false) {
  return ["thoracic rotation right", "lumbar rotation right", "thoracic flexion", "lumbar flexion",
    ...SIDES.flatMap((side) => [`hip.${side} flexion`, `hip.${side} abduction`, `hip.${side} internal rotation`, `knee.${side} flexion`, `ankle.${side} dorsiflexion`]),
    `shoulder.${hand} flexion`, `shoulder.${hand} abduction`, `shoulder.${hand} internal rotation`, `elbow.${hand} flexion`,
    ...(wrist ? [`wrist.${hand} flexion`, `wrist.${hand} radial deviation`, `wrist.${hand} pronation`] : [])];
}

/**
 * The searched ranges: each channel's level, start and length, s; then when the arm's aim begins,
 * s, and how far past the target it aims, m; then the posture beneath, the hips' turn, the chest's
 * and the trunk's lean, rad (`StraightDrive`).
 */
const WINDOW = 0.45, LEAD = [0, 0.45], THROUGH = [0, 0.3], HIPS = [0, 0.6], TURN = [0, 0.43], LEAN = [0, 0.5];
/** With `--free`, a channel whose level is under this leaves the schedule, pushed toward its goal as the punch pushes a channel it does not schedule. */
const FREE = 0.25;
/** With `--fire`, how near the fist comes to the target before the arm's drive begins, arm lengths (`StraightDrive.fire`). */
const FIRE = [0, 1.2];
/** With `--chamber`, where the striking point is set before the drive, m from the shoulder on its line to the target (behind the shoulder where negative, a held blow drawn back), and how long it stands there, s (`StraightDrive.chamber`, `settle`). */
const CHAMBER = [-0.4, 1.2], SETTLE = [0, 0.8];
/** With `--brake`, how near its goal a channel pushed toward one is held instead, rad (`StraightDrive.brake`). */
const BRAKE = [0, 0.3];

/** The cell's skill as the table names it, and the executor its subject drills. */
export const SKILLS = Object.freeze({ punch: "straight-punch", thrust: "sword-thrust" });

/** The schedule, the arm's aim and the posture that `x` holds for `hand`; the channels `without` left off the schedule, so the punch pushes them toward their goals. */
export function decode(x, hand, without = new Set(), { fire = false, brake = false, wrist = false, free = false, chamber = false } = {}) {
  const channels = ceilingChannels(hand, wrist), n = channels.length * 3;
  const pushes = channels.map((channel, i) => ({ channel, level: Math.abs(x[3 * i]) > 0.05 ? x[3 * i] : 0, from: x[3 * i + 1], length: Math.max(0, x[3 * i + 2]) }))
    .filter((p, i) => !without.has(channels[i]) && !(free && Math.abs(p.level) < FREE));
  const [lead, through, hips, turn, lean, ...more] = x.slice(n);
  const reach = fire ? more[0] : undefined, held = brake ? more[fire ? 1 : 0] : undefined;
  const set = (fire ? 1 : 0) + (brake ? 1 : 0), posed = chamber ? { chamber: more[set], settle: more[set + 1] } : {};
  return { pushes, lead, through, beneath: hips === undefined ? posed : { hips, turn, lean, ...posed },
    ...(reach === undefined ? {} : { fire: reach }), ...(held === undefined ? {} : { brake: held }) };
}

/**
 * `x`, a schedule for `from`'s hand, made the other hand's in place: each side's channel moved to
 * the other side's, the trunk's turn reversed.
 */
export function mirrored(x, from, to, wrist = false) {
  const source = ceilingChannels(from, wrist), target = ceilingChannels(to, wrist), copy = [...x];
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
  const x = [...base], n = 3 * ceilingChannels(cell.hand, cell.wrist).length, [scale, shift, ...rest] = knobs;
  for (let i = 0; i < n; i += 3) { x[i + 1] = Math.max(0, x[i + 1] * scale + shift); x[i + 2] *= scale; }
  rest.forEach((value, k) => { x[n + k] = value; });
  return x;
}

/**
 * **The settings `x` holds for `search`** (its `cell`: the searched hand, the channels left off, its
 * flags), whole for both hands, the other hand's its mirror image: the research tuning a candidate
 * plays over the body's record, its drive unsteered (the schedule alone).
 */
export function settingsOf(x, search) {
  const { hand, without = [], fire, brake, wrist, free, chamber } = search, flags = { fire: !!fire, brake: !!brake, wrist: !!wrist, free: !!free, chamber: !!chamber };
  const whole = search.base ? tuned(search.base, x, search) : x;
  const sided = (side) => {
    const y = [...whole];
    if (side !== hand) mirrored(y, hand, side, flags.wrist);
    return decode(y, side, new Set(without.map((c) => side === hand ? c : c.replace(`.${hand} `, `.${side} `))), flags);
  };
  const right = sided("right"), left = sided("left");
  return { lead: right.lead, through: right.through, ...right.beneath, ...(right.fire === undefined ? {} : { fire: right.fire }),
    ...(right.brake === undefined ? {} : { brake: right.brake }), steered: false, timed: { left: left.pushes, right: right.pushes } };
}

/** Each trial's value with `settings` as its subject's research tuning (`withTuning`), each subject resolved once. */
function valuesWith(settings) {
  const values = new Map();
  return (trial) => {
    if (!values.has(trial.subject)) values.set(trial.subject, settings === null ? subjectOf(trial).value : withTuning(subjectOf(trial).value, settings));
    return values.get(trial.subject);
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { out: { type: "string" }, body: { type: "string" }, skill: { type: "string" }, loadout: { type: "string" }, hand: { type: "string" },
    workers: { type: "string" }, generations: { type: "string" }, seed: { type: "string" }, from: { type: "string" }, sigma: { type: "string" }, tune: { type: "boolean" },
    lambda: { type: "string" }, without: { type: "string" }, fire: { type: "boolean" }, brake: { type: "boolean" }, confirm: { type: "string" }, free: { type: "boolean" },
    chamber: { type: "boolean" }, "chamber-range": { type: "string" } } });
  const pool = trialPool(Number(values.workers ?? Math.max(1, availableParallelism() - 4)));
  if (values.confirm) {
    const found = JSON.parse(readFileSync(values.confirm, "utf8")), cells = rowOf(found.cell);
    const best = await confirmRow(cells, valuesWith(settingsOf(found.best.x, found.cell)), { play: pool.play });
    const record = await confirmRow(cells, valuesWith(null), { play: pool.play });
    console.log(JSON.stringify({ cell: found.cell, best, record, kept: best.worse !== null && (record.worse === null || best.worse > record.worse) ? "best" : "record" }));
    pool.terminate();
    process.exit(0);
  }
  if (!values.out || !values.body || !Object.hasOwn(SKILLS, values.skill ?? "")) throw new Error(`--body <model> --skill <${Object.keys(SKILLS).join("|")}> --out <file.json>`);
  const blow = SKILLS[values.skill] === "straight-punch" ? null : SKILLS[values.skill];
  const cell = { body: values.body, skill: values.skill, ...(values.loadout ? { loadout: values.loadout } : {}), hand: values.hand ?? "right",
    without: (values.without ?? "").split(",").filter(Boolean), fire: !!values.fire, brake: !!values.brake, wrist: !!blow, free: !!values.free, chamber: !!values.chamber };
  const trials = rowOf(cell).flatMap((one) => drillTrials(one, "twin")), channels = ceilingChannels(cell.hand, cell.wrist);
  const generations = Number(values.generations ?? 60), lo = [], hi = [], without = new Set(cell.without);
  for (const channel of channels) { const level = without.has(channel) ? 0 : 1; lo.push(-level, 0, 0); hi.push(level, WINDOW, WINDOW); }
  for (const [low, high] of [LEAD, THROUGH, HIPS, TURN, LEAN, ...(cell.fire ? [FIRE] : []), ...(cell.brake ? [BRAKE] : []),
    ...(cell.chamber ? [values["chamber-range"] ? values["chamber-range"].split(",").map(Number) : CHAMBER, SETTLE] : [])]) { lo.push(low); hi.push(high); }
  if (values.tune) { lo.length = 0; hi.length = 0; for (const [low, high] of TUNE) { lo.push(low); hi.push(high); } }
  const toX = (u) => u.map((v, i) => lo[i] + (hi[i] - lo[i]) * Math.min(1, Math.max(0, v)));
  const fromFile = values.from ? JSON.parse(readFileSync(values.from, "utf8")) : null, from = fromFile ? [...fromFile.best.x] : null;
  // A search that searched its gap with the schedule (one before the drill's twin set the places) holds it after the channels.
  if (from && fromFile.cell.gap === null) from.splice(3 * channels.length, 1);
  if (from && fromFile.cell.hand !== cell.hand) mirrored(from, fromFile.cell.hand, cell.hand, cell.wrist);
  if (values.tune) { if (!from) throw new Error("--tune tunes --from's schedule"); cell.base = [...from]; const n = 3 * channels.length; from.length = 0; from.push(1, 0, ...cell.base.slice(n, n + 5)); }
  const start = from ? lo.map((l, i) => from[i] === undefined || hi[i] === l ? 0.5 : (from[i] - l) / (hi[i] - l)) : undefined;
  console.error(`${cell.skill} on ${cell.body}: ${trials.length} trials of the twin a candidate`);
  const { best: found } = await cmaSearch({ n: lo.length, start, sigma: Number(values.sigma ?? (from ? 0.15 : 0.25)), lambda: Number(values.lambda ?? 16), generations, seed: Number(values.seed ?? 1),
    // A candidate none of whose trials counts scores below every one that has one.
    score: async (u) => { const r = await scoreOn(trials, valuesWith(settingsOf(toX(u), cell)), { play: pool.play }); return { ...r, score: r.score ?? -1e3, each: undefined }; },
    onGeneration(entry, { best, mean, log }) {
      console.error(JSON.stringify(entry));
      writeFileSync(values.out, JSON.stringify({ cell, from: values.from ?? null, channels, trials: trials.length, best: { ...best, x: toX(best.u) }, mean: toX(mean), log }));
    } });
  pool.terminate();
  console.log(JSON.stringify({ cell, best: { score: found.score, g: found.g, r: found.r } }));
  process.exit(0);
}
