/**
 * **A swing searched on its drill's twin**: a body's swung blow of `--skill <cell>` (`cut`, `bonk`:
 * a table cell's skill, `SWINGS`' kind). Each of the swung channels (`swingChannels`: the trunk's
 * turn and bends, the striking arm and its wrist) has a windup angle, a fraction of its range
 * (`Swing.wound`), and a push: a level, a start and a length into the swing (`Swing.timed`); then
 * where it stands to swing (`reach`, the head from the target across the ground), how long the wound
 * stance stands quiet (`settle`), and with `--footing` where each foot steps before it winds
 * (`Swing.footing`); searched for `--hand`, the other hand's its mirror image (`settingsOf`). A
 * candidate is those settings as the skill's research tuning over the body's record (`withTuning`,
 * unsteered), everything else the table's cell's: the drills' Option Mind (`option-drill`), its
 * window, what it holds. It is played on the training twin of every cell of the body's row of the
 * skill (`rowOf`; `--loadout` one cell), the drill's own admission giving each its places, marks
 * and hands, at the game's rate, 120 Hz, and scored by the mean of its trials' search scores
 * (`searchScore`: the cell's value, a blow short of the bar graded below it)
 * ([the skill recipe](../../../../docs/recipes/skill.md#an-options-code): research scores on its
 * drill). `--confirm` plays a search's best and the record the body plays now on the row's cells'
 * own cases at 120 and 480 Hz, the worse counting (`confirmRow`).
 *
 *   node research/skills/strikes/swing/swing-drill.mjs --body workshop-fighter --skill cut|bonk --out <file.json> [--loadout <left,right>] [--hand right]
 *     [--footing <behind,right,behind,right>] [--workers N] [--lambda 16] [--generations 60] [--seed 1] [--from <file.json>] [--sigma 0.15]
 *   node research/skills/strikes/swing/swing-drill.mjs --confirm <file.json> [--workers N]
 *   node research/skills/strikes/swing/swing-drill.mjs --settings <file.json>   the found swing's settings, whole, for `skill-records.mjs`
 *
 * `--from` seeds the search from a search's file, by channel name. `--footing` searches the footing
 * too, the left foot's place then the right's, m; it starts there where `--from`'s search has none.
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
import { modelSpec } from "../../../../src/core/bodies/models.ts";
import { bodyKey } from "../../../../src/core/bodies/spec/body.ts";
import { SWINGS } from "../../../../src/skills/strikes/swing-part.ts";
import { cmaSearch } from "../../../cma.mjs";
import { confirmRow, drillTrials, rowOf, scoreOn, subjectOf, trialPool, withTuning } from "../../../drill-trials.mjs";
import { recordsOf } from "../../skill-records.mjs";

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

/** The table's swung blows this searches: a cell's skill, its swing's kind (`SWINGS`). */
const SKILLS = Object.freeze({ cut: "cut", bonk: "bonk" });

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

/**
 * `channel` of one hand's swing as the other hand swings it, and the sign its angles and pushes take
 * there: the trunk's turn and side bend (named to the right) turn the other way; the arm's channels,
 * mirrored by side in the body, are the other arm's of the same name.
 */
function otherHand(channel, hand, other) {
  if (/ (rotation|lateral flexion) right$/.test(channel) && !/^(shoulder|elbow|wrist)\./.test(channel)) return [channel, -1];
  return [channel.replace(new RegExp(`^(shoulder|elbow|wrist)\\.${hand} `), `$1.${other} `), 1];
}

/**
 * The swing's research tuning that `decoded` holds for `hand`, the other hand's its mirror image
 * (`otherHand`), footing included, its swing unsteered: what a candidate plays over the body's record.
 */
export function settingsOf({ wound, timed, reach, settle, footing }, hand) {
  const other = hand === "left" ? "right" : "left";
  const mirroredWound = Object.fromEntries(Object.entries(wound).map(([channel, angle]) => { const [name, sign] = otherHand(channel, hand, other); return [name, sign * angle]; }));
  const mirroredTimed = timed.map((push) => { const [name, sign] = otherHand(push.channel, hand, other); return { ...push, channel: name, level: sign * push.level }; });
  return { reach, settle, steered: false, wound: { [hand]: wound, [other]: mirroredWound },
    ...(footing ? { footing: { [hand]: footing, [other]: mirrored(footing) } } : {}),
    timed: { [hand]: timed, [other]: mirroredTimed } };
}

/** The settings a search's `x` holds for its `cell`: its tuning (`settingsOf`). */
const tuningOf = (x, cell) => settingsOf(decode(x, cell.body, swingChannels(cell.hand)), cell.hand);

/** Each trial's value with `settings` as its subject's research tuning (`withTuning`), each subject resolved once; the cell's own where null. */
function valuesWith(settings) {
  const values = new Map();
  return (trial) => {
    if (!values.has(trial.subject)) values.set(trial.subject, settings === null ? subjectOf(trial).value : withTuning(subjectOf(trial).value, settings));
    return values.get(trial.subject);
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { out: { type: "string" }, body: { type: "string" }, skill: { type: "string" }, loadout: { type: "string" }, hand: { type: "string" },
    workers: { type: "string" }, generations: { type: "string" }, seed: { type: "string" }, from: { type: "string" }, sigma: { type: "string" }, lambda: { type: "string" },
    confirm: { type: "string" }, settings: { type: "string" }, footing: { type: "string" } } });
  if (values.settings) {
    // Whole, as a record holds them: the body's record the search played over, its tuning over it.
    const found = JSON.parse(readFileSync(values.settings, "utf8")), record = recordsOf(SKILLS[found.cell.skill])[bodyKey(modelSpec(found.cell.body))];
    if (!record) throw new Error(`${found.cell.body} has no ${found.cell.skill} record the search played over`);
    console.log(JSON.stringify({ ...record.settings, ...tuningOf(found.best.x, found.cell) }, null, 2));
    process.exit(0);
  }
  const pool = trialPool(Number(values.workers ?? Math.max(1, availableParallelism() - 4)));
  if (values.confirm) {
    const found = JSON.parse(readFileSync(values.confirm, "utf8")), cells = rowOf(found.cell);
    const best = await confirmRow(cells, valuesWith(tuningOf(found.best.x, found.cell)), { play: pool.play });
    const record = await confirmRow(cells, valuesWith(null), { play: pool.play });
    console.log(JSON.stringify({ cell: found.cell, best, record, kept: best.worse !== null && (record.worse === null || best.worse > record.worse) ? "best" : "record" }));
    pool.terminate();
    process.exit(0);
  }
  if (!values.out || !values.body || !Object.hasOwn(SKILLS, values.skill ?? "")) throw new Error(`--body <model> --skill <${Object.keys(SKILLS).join("|")}> --out <file.json>`);
  if (!Object.hasOwn(SWINGS, SKILLS[values.skill])) throw new Error(`no swing ${SKILLS[values.skill]}: one of ${Object.keys(SWINGS).join(", ")}`);
  const cell = { body: values.body, skill: values.skill, ...(values.loadout ? { loadout: values.loadout } : {}), hand: values.hand ?? "right" };
  const trials = rowOf(cell).flatMap((one) => drillTrials(one, "twin")), channels = swingChannels(cell.hand);
  const ranges = rangesOf(cell.body, channels), lo = [], hi = [];
  for (const _ of ranges) { lo.push(0, -1, FROM[0], LENGTH[0]); hi.push(1, 1, FROM[1], LENGTH[1]); }
  for (const [low, high] of [REACH, SETTLE, ...(values.footing ? [BEHIND, RIGHT, BEHIND, RIGHT] : [])]) { lo.push(low); hi.push(high); }
  const toX = (u) => u.map((v, i) => lo[i] + (hi[i] - lo[i]) * Math.min(1, Math.max(0, v)));
  let start;
  if (values.from) {
    // By channel name, so a search over other channels seeds this one: a channel it lacks starts unpushed at mid-range.
    const found = JSON.parse(readFileSync(values.from, "utf8")), was = found.channels, x = [];
    channels.forEach((channel) => { const k = was.indexOf(channel); x.push(...(k < 0 ? [0.5, 0, 0, 0] : found.best.x.slice(4 * k, 4 * k + 4))); });
    x.push(...found.best.x.slice(4 * was.length, 4 * was.length + 2));
    // A footing its seed lacks starts where `--footing` puts it: behind,right,behind,right, the left foot's then the right's.
    if (values.footing) x.push(...found.best.x.slice(4 * was.length + 2, 4 * was.length + 6));
    if (x.length < lo.length) x.push(...values.footing.split(",").map(Number));
    start = lo.map((l, i) => (x[i] - l) / (hi[i] - l));
  }
  const generations = Number(values.generations ?? 60);
  console.error(`${cell.skill} on ${cell.body}: ${trials.length} trials of the twin a candidate`);
  const { best: found } = await cmaSearch({ n: lo.length, start, sigma: Number(values.sigma ?? (start ? 0.15 : 0.25)), lambda: Number(values.lambda ?? 16), generations,
    seed: Number(values.seed ?? 1),
    // A candidate none of whose trials counts scores below every one that has one.
    score: async (u) => { const r = await scoreOn(trials, valuesWith(tuningOf(toX(u), cell)), { play: pool.play }); return { ...r, score: r.score ?? -1e3, each: undefined }; },
    onGeneration(entry, { best, mean, log }) {
      console.error(JSON.stringify(entry));
      writeFileSync(values.out, JSON.stringify({ cell, channels, trials: trials.length, best: { ...best, x: toX(best.u) }, mean: toX(mean), log }));
    } });
  pool.terminate();
  console.log(JSON.stringify({ cell, best: { score: found.score, g: found.g, r: found.r } }));
  process.exit(0);
}
