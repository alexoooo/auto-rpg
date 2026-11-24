/**
 * **The kick's schedule searched on its rung's twin**: each push the kick makes (`KICK_PUSHES`: the
 * kicking hip's drive and brake, its knee's chamber and opening, its ankle, the trunk and the
 * standing leg) a level, a start and a length into the drive, one schedule for either foot; the
 * window it is thrown from; the aimed drive's timing and reach; and how it stands on the one foot. A candidate is those settings over the kick's defaults
 * (`KICK_PATH`) as the research tuning of the drills' Option Mind's kick (`option-drill`,
 * `withTuning`), given whole, so the man's record plays no part. It is played on every foot condition of the Strike drill's `middle-twin` rung at
 * the game's rate, 120 Hz, and scored by the mean of its trials' search scores (`searchScore`: the
 * table's strike value, a fall at its price, a blow short of the bar graded below it). This is the
 * recipe's step 2, what the leg can do: a scale for the kick, not a gate. `--confirm` plays a
 * search's best on the `middle` rung's own conditions at 120 and 480 Hz.
 *
 *   node research/skills/strikes/kick/kick-drill.mjs --out <file.json> [--workers N] [--lambda 16] [--generations 40] [--seed 1] [--from <file.json> [--sigma 0.15]] [--lower <m>]
 *   node research/skills/strikes/kick/kick-drill.mjs --confirm <file.json> [--workers N]
 *
 * Harness: Node, the Strike drill's bout world (`playCase`) on Rapier (`DEFAULT_ENGINE`), 120 Hz;
 * the confirmation 120 and 480 Hz.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import "../../../../tests/harness/preload-data.mjs";
import { cmaSearch } from "../../../cma.mjs";
import { scoreOn, trialPool, withTuning } from "../../../drill-trials.mjs";
import { belowNormal, defaultLanes } from "../../../../scripts/lanes.mjs";
import { EVALUATIONS } from "../../../../src/app/node/evaluation.ts";
import { OPTION_PRESETS } from "../../../../src/entrants/option/mind.ts";
import { optionsOf } from "../../../../src/minds/option/config.ts";
import { partLookup } from "../../../../src/app/catalog.ts";
import { casesOf } from "../../../../src/evaluation/run.ts";
import { caseName } from "../../../../src/evaluation/results.ts";
import { DEFAULT_ENGINE } from "../../../../src/core/physics/engines.ts";
import { isRefused } from "../../../../src/core/refusal.ts";
import { KICK_PATH, KICK_PUSHES } from "../../../../src/skills/strikes/kick/kick/kick.ts";

belowNormal();

/** The searched pushes, and each one's ranges: its level, and its start and length into the drive, s. */
const PUSHES = Object.keys(KICK_PUSHES), LEVEL = [-1, 1], FROM = [0, 0.4], LENGTH = [0, 0.4];
/**
 * Then the window's near edge, m ahead of the body's centre, and its depth, m: an open-loop drive
 * lands about one distance, so the Mind walks there first where the window is narrow.
 */
const NEAR = [0.4, 1.0], DEPTH = [0.03, 0.4];
/** Then the aimed drive's (`KICK_PATH`): when it begins, s, when its knee opens after that, s, how far through the target it aims, m, and how hard it slows onto its goal, rad/s². */
const AIMED = { lead: [0, 0.3], knee: [0, 0.4], through: [0, 0.4], decel: [20, 600] };
/** Then how it stands on the one foot (`KICK_PATH`): the root's pitch held, rad, the stance's response, s, and how far the pelvis is lowered, m. */
const STANDING = { lean: [-0.6, 0.6], transferSeconds: [0.05, 0.4], lower: [0, 0.15] };

/** The drills' Mind with its one kick tuned whole, `KICK_PATH` under `settings`, as a subject given whole, its body holding the kick (not the Warrior's own). */
function subjectWith(settings) {
  const mind = OPTION_PRESETS["option-drill"].config;
  const options = optionsOf(mind, partLookup).map((option) => option.kind === "strike-kick" ? { ...option, skill: { kind: "kick", tuning: { ...KICK_PATH, ...settings } } } : option);
  return { id: "kick", label: "the kick", value: { mind: { ...mind, options }, skill: "kick", variations: ["kick/kick"] } };
}

/** The schedule `x` holds, each push's level (none under 0.05), start and length, and its window. */
function settingsOf(x) {
  const n = 3 * PUSHES.length, near = x[n] ?? KICK_PATH.alongNear, depth = x[n + 1] ?? KICK_PATH.alongFar - KICK_PATH.alongNear;
  const aimed = Object.fromEntries(Object.keys({ ...AIMED, ...STANDING }).map((key, i) => [key, x[n + 2 + i] ?? KICK_PATH[key]]));
  return { ...Object.fromEntries(PUSHES.flatMap((name, i) => [[`${name}Level`, Math.abs(x[3 * i]) > 0.05 ? x[3 * i] : 0], [`${name}From`, x[3 * i + 1]], [`${name}Length`, Math.max(0, x[3 * i + 2])]])),
    alongNear: near, alongFar: near + depth, ...aimed };
}

/** Every foot condition of `protocol`, as trials of the strike judge with the subject the kick's defaults give. */
function trialsOf(protocol) {
  const evaluation = EVALUATIONS.strike, subject = subjectWith({}), [resolved] = evaluation.subjects([subject]);
  const scheduled = casesOf(evaluation, protocol, [resolved], { engine: evaluation.protocols[protocol].engine ?? DEFAULT_ENGINE, schedule: { kind: "all" } });
  if (isRefused(scheduled)) throw new Error(`strike/${protocol}: ${scheduled.refused}`);
  return scheduled.units.flat().filter(({ condition }) => "foot" in condition)
    .map(({ condition }) => ({ drill: "strike", protocol, subject, judge: { judge: "strike" }, condition, name: caseName(condition) }));
}

const { values } = parseArgs({ options: { out: { type: "string" }, workers: { type: "string" }, generations: { type: "string" }, seed: { type: "string" },
  from: { type: "string" }, sigma: { type: "string" }, lambda: { type: "string" }, confirm: { type: "string" }, lower: { type: "string" } } });
const pool = trialPool(Number(values.workers ?? defaultLanes()));
if (values.confirm) {
  const found = JSON.parse(readFileSync(values.confirm, "utf8")), settings = settingsOf(found.best.x), trials = trialsOf("middle"), byRate = {};
  for (const hz of [120, 480]) { const r = await scoreOn(trials, (trial) => withTuning(trial.subject.value, { ...KICK_PATH, ...settings }), { play: pool.play, hz }); byRate[hz] = { ...r, each: undefined }; }
  console.log(JSON.stringify({ settings, byRate }));
  pool.terminate();
  process.exit(0);
}
if (!values.out) throw new Error("--out <file.json>");
const trials = trialsOf("middle-twin"), lo = [], hi = [];
for (const _ of PUSHES) for (const [low, high] of [LEVEL, FROM, LENGTH]) { lo.push(low); hi.push(high); }
for (const [low, high] of [NEAR, DEPTH, ...Object.values(AIMED), ...Object.values(STANDING)]) { lo.push(low); hi.push(high); }
const toX = (u) => u.map((v, i) => lo[i] + (hi[i] - lo[i]) * Math.min(1, Math.max(0, v)));
const from = values.from ? JSON.parse(readFileSync(values.from, "utf8")).best.x : null;
// With no start, the schedule pushes nothing (its levels at none) and the window and the aimed drive are the defaults'.
const defaults = [...PUSHES.flatMap(() => [0, 0, 0]), KICK_PATH.alongNear, KICK_PATH.alongFar - KICK_PATH.alongNear, ...Object.keys({ ...AIMED, ...STANDING }).map((key) => KICK_PATH[key])];
const start = lo.map((l, i) => ((from?.[i] ?? (values.lower !== undefined && i === lo.length - 1 ? Number(values.lower) : defaults[i])) - l) / (hi[i] - l));
console.error(`kick on man: ${trials.length} trials of middle-twin a candidate`);
const { best: found } = await cmaSearch({ n: lo.length, start, sigma: Number(values.sigma ?? (from ? 0.15 : 0.25)), lambda: Number(values.lambda ?? 16),
  generations: Number(values.generations ?? 40), seed: Number(values.seed ?? 1),
  // A candidate none of whose trials counts scores below every one that has one.
  score: async (u) => { const settings = settingsOf(toX(u)), r = await scoreOn(trials, (trial) => withTuning(trial.subject.value, { ...KICK_PATH, ...settings }), { play: pool.play });
    return { ...r, score: r.score ?? -1e3, each: undefined }; },
  onGeneration(entry, { best, mean, log }) {
    console.error(JSON.stringify(entry));
    writeFileSync(values.out, JSON.stringify({ pushes: PUSHES, from: values.from ?? null, trials: trials.length, best: { ...best, x: toX(best.u), settings: settingsOf(toX(best.u)) }, mean: toX(mean), log }));
  } });
pool.terminate();
console.log(JSON.stringify({ best: { score: found.score, g: found.g, r: found.r } }));
process.exit(0);
