/**
 * **The kick's schedule searched on its rung's twin**: each push the kick makes (`KICK_PUSHES`: the
 * kicking hip's drive and brake, its knee's chamber and opening, its ankle and the trunk) a level, a start and a length into the drive, one schedule for either foot; the
 * window it is thrown from; the aimed drive's timing and reach; and how it stands on the one foot. A candidate is those settings over the kick's defaults
 * (`KICK_PATH`) as the research tuning of the drills' Option Mind's kick (`option-drill`,
 * `withTuning`), given whole, so the man's record plays no part. It is played on every foot condition of the Strike drill's `middle-twin` rung at
 * the game's rate, 120 Hz, and scored by the mean of its trials' search scores (`searchScore`: the
 * table's strike value, a fall at its price, a blow short of the bar graded below it). This is the
 * recipe's step 1, what the leg can do: a scale for the kick, not a gate. `--confirm` plays a
 * search's best on the `middle` rung's own conditions at 120 and 480 Hz. `--fix` holds the settings
 * it names (a JSON object) out of the search, at those values. `--on-mark` scores only blows that
 * land on the mark (`onMark`): a foot that meets the thighs from below gains nothing. `--rung` names
 * another rung to search on and `--confirm-on` the rungs a confirmation plays (comma-separated), at
 * 120 Hz alone where they are not `middle`: a low kick at a body lying is searched on `stomping-twin`
 * and confirmed on `stomping-sampled` and `sparring-laid`. `--trials N` searches on N of the rung's
 * foot conditions, spread evenly over them (a sampled rung's are drawn at random).
 * `--fix` may name any of the kick's settings, its window's height band among them.
 *
 *   node research/skills/strikes/kick/kick-drill.mjs --out <file.json> [--workers N] [--lambda 16] [--generations 40] [--seed 1] [--from <file.json> [--sigma 0.15]] [--fix '{"hipLevel":0}'] [--on-mark] [--rung middle-twin] [--trials N]
 *   node research/skills/strikes/kick/kick-drill.mjs --confirm <file.json> [--workers N] [--confirm-on middle]
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
import { optionsOf } from "../../../../src/minds/option/assembly/config.ts";
import { partLookup } from "../../../../src/app/catalog.ts";
import { casesOf } from "../../../../src/evaluation/run.ts";
import { caseName } from "../../../../src/evaluation/results.ts";
import { DEFAULT_ENGINE } from "../../../../src/core/physics/engines.ts";
import { isRefused } from "../../../../src/core/refusal.ts";
import { KICK_PATH, KICK_PUSHES } from "../../../../src/skills/strikes/shared/kick.ts";

belowNormal();

/** The searched pushes, and each one's ranges: its level, and its start and length into the drive, s. */
const PUSHES = Object.keys(KICK_PUSHES), LEVEL = [-1, 1], FROM = [0, 0.4], LENGTH = [0, 0.4];
/**
 * Then the window's near edge, m ahead of the body's centre, and its depth, m: an open-loop drive
 * lands about one distance, so the Mind walks there first where the window is narrow.
 */
const NEAR = [0.4, 1.0], DEPTH = [0.03, 0.4];
/** Then the aimed drive's (`KICK_PATH`): when it begins, s, how far out its chamber is, m, when it leaves the chamber after that, s, how far through the target it aims, m, and how hard it slows onto its goal, rad/s². */
const AIMED = { lead: [0, 0.3], chamber: [0, 0.6], knee: [0, 0.4], through: [0, 0.4], decel: [20, 600] };
/** Then how it stands on the one foot (`KICK_PATH`): the root's pitch held, rad, the centre held ahead of the sole, m, the stance's response, s, and how far the pelvis is lowered, m. */
const STANDING = { lean: [-0.6, 0.6], ahead: [-0.05, 0.15], transferSeconds: [0.05, 0.4], lower: [0, 0.15] };

/** The drills' Mind with its one kick tuned whole, `KICK_PATH` under `settings`, as a subject given whole, its body holding the kick (not the Warrior's own). */
function subjectWith(settings) {
  const mind = OPTION_PRESETS["option-drill"].config;
  const options = optionsOf(mind, partLookup).map((option) => option.kind === "strike-kick" ? { ...option, skill: { kind: "kick", tuning: { ...KICK_PATH, ...settings } } } : option);
  return { id: "kick", label: "the kick", value: { mind: { ...mind, options }, skill: "kick", variations: ["kick/kick"] } };
}

/** Each searched dimension, a setting of `KICK_PATH` (the window's `depth` its far edge less its near) and its range. */
const DIMS = [...PUSHES.flatMap((name) => [[`${name}Level`, ...LEVEL], [`${name}From`, ...FROM], [`${name}Length`, ...LENGTH]]),
  ["alongNear", ...NEAR], ["depth", ...DEPTH], ...Object.entries({ ...AIMED, ...STANDING }).map(([key, range]) => [key, ...range])];

/** The settings the point `x` holds: a push's level under 0.05 none, its length at least none, the window's far edge its near edge and depth. */
function settingsOf(x) {
  const named = { ...Object.fromEntries(SEARCHED.map(([key], i) => [key, x[i]])), ...FIXED };
  for (const name of PUSHES) {
    if (Math.abs(named[`${name}Level`]) <= 0.05) named[`${name}Level`] = 0;
    named[`${name}Length`] = Math.max(0, named[`${name}Length`]);
  }
  const { depth, ...settings } = named;
  return { ...settings, alongFar: named.alongNear + depth };
}

/** `settings` as a point: each dimension's setting where they name it, else the kick's defaults' (its schedule pushing nothing). */
const pointOf = (settings) => SEARCHED.map(([key]) => key === "depth" ? (settings.alongFar ?? KICK_PATH.alongFar) - (settings.alongNear ?? KICK_PATH.alongNear) : settings[key] ?? KICK_PATH[key]);

/** Every foot condition of `protocol`, as trials of the strike judge with the subject the kick's defaults give. */
function trialsOf(protocol) {
  const evaluation = EVALUATIONS.strike, subject = subjectWith({}), [resolved] = evaluation.subjects([subject]);
  const scheduled = casesOf(evaluation, protocol, [resolved], { engine: evaluation.protocols[protocol].engine ?? DEFAULT_ENGINE, schedule: { kind: "all" } });
  if (isRefused(scheduled)) throw new Error(`strike/${protocol}: ${scheduled.refused}`);
  return scheduled.units.flat().filter(({ condition }) => "foot" in condition)
    .map(({ condition }) => ({ drill: "strike", protocol, subject, judge: { judge: "strike" }, condition, name: caseName(condition) }));
}

const { values } = parseArgs({ options: { out: { type: "string" }, workers: { type: "string" }, generations: { type: "string" }, seed: { type: "string" },
  from: { type: "string" }, sigma: { type: "string" }, lambda: { type: "string" }, confirm: { type: "string" }, fix: { type: "string" }, "on-mark": { type: "boolean" },
  rung: { type: "string" }, "confirm-on": { type: "string" }, trials: { type: "string" } } });

/**
 * `--on-mark`'s score of a candidate's trials: each trial's search score, less what it traded
 * where its blow did not land on the mark (its score less its value's gain), so a blow elsewhere
 * gains nothing and is graded by how near it came, a loss kept; null where none counts.
 */
function onMark(each) {
  const counted = each.filter((one) => one.score !== null);
  if (counted.length === 0) return null;
  return counted.reduce((sum, one) => sum + (one.outcome === "landed" ? one.score : one.score - Math.max(one.value ?? 0, 0)), 0) / counted.length;
}
/** The settings held out of the search, and the dimensions searched. */
const FIXED = JSON.parse(values.fix ?? "{}"), SEARCHED = DIMS.filter(([key]) => !(key in FIXED));
for (const key of Object.keys(FIXED)) if (!DIMS.some(([dim]) => dim === key) && !(key in KICK_PATH)) throw new Error(`--fix: ${key} is not a kick setting`);
const pool = trialPool(Number(values.workers ?? defaultLanes()));
if (values.confirm) {
  const found = JSON.parse(readFileSync(values.confirm, "utf8")), settings = found.best.settings, byRung = {};
  for (const rung of (values["confirm-on"] ?? "middle").split(",")) {
    const trials = trialsOf(rung), byRate = {};
    for (const hz of rung === "middle" ? [120, 480] : [120]) { const r = await scoreOn(trials, (trial) => withTuning(trial.subject.value, { ...KICK_PATH, ...settings }), { play: pool.play, hz }); byRate[hz] = { ...r, each: undefined }; }
    byRung[rung] = byRate;
  }
  console.log(JSON.stringify({ settings, ...(values["confirm-on"] ? { byRung } : { byRate: byRung.middle }) }));
  pool.terminate();
  process.exit(0);
}
if (!values.out) throw new Error("--out <file.json>");
const RUNG = values.rung ?? "middle-twin", every = trialsOf(RUNG), keep = Math.min(Number(values.trials ?? every.length), every.length);
const trials = Array.from({ length: keep }, (_, k) => every[Math.floor(k * every.length / keep)]), lo = SEARCHED.map(([, low]) => low), hi = SEARCHED.map(([, , high]) => high);
const toX = (u) => u.map((v, i) => lo[i] + (hi[i] - lo[i]) * Math.min(1, Math.max(0, v)));
// From a search's best settings, by name, so a dimension added since starts at its default; with none, from the defaults.
const from = values.from ? JSON.parse(readFileSync(values.from, "utf8")).best.settings : null;
const start = pointOf(from ?? {}).map((x, i) => (x - lo[i]) / (hi[i] - lo[i]));
console.error(`kick on man: ${trials.length} trials of ${RUNG} a candidate`);
const { best: found } = await cmaSearch({ look: { body: "man", variation: "kick/push" }, n: lo.length, start, sigma: Number(values.sigma ?? (from ? 0.15 : 0.25)), lambda: Number(values.lambda ?? 16),
  generations: Number(values.generations ?? 40), seed: Number(values.seed ?? 1),
  // A candidate none of whose trials counts scores below every one that has one.
  score: async (u) => { const settings = settingsOf(toX(u)), r = await scoreOn(trials, (trial) => withTuning(trial.subject.value, { ...KICK_PATH, ...settings }), { play: pool.play });
    return { ...r, score: (values["on-mark"] ? onMark(r.each) : r.score) ?? -1e3, each: undefined }; },
  onGeneration(entry, { best, mean, log }) {
    console.error(JSON.stringify(entry));
    writeFileSync(values.out, JSON.stringify({ pushes: PUSHES, rung: RUNG, from: values.from ?? null, fixed: FIXED, onMark: !!values["on-mark"], trials: trials.length, best: { ...best, x: toX(best.u), settings: settingsOf(toX(best.u)) }, mean: toX(mean), log }));
  } });
pool.terminate();
console.log(JSON.stringify({ best: { score: found.score, g: found.g, r: found.r } }));
process.exit(0);
