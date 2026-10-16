/**
 * **The run's settings searched** (`RunCycleSettings`, `src/core/skills/cycle-run.ts`) through the
 * SIMBICON gait that hands over to it (Node stand, Rapier, 120 Hz), by diagonal CMA-ES in the unit
 * cube (`research/cma.mjs`).
 *
 * Each trial stands the body a second in its guard (`guardPosture`), which holds the arms wherever the gait does not, as a fighter's does, under its
 * character's balance (`balanceCeiling`; `--balance` per cent in its place), at its character's haste (each of `--haste` per cents in its place, its gait timed by `--hasted`, `SimbiconSettings.hasted`) and with each of `--holds` in its right hand (`empty`, or the `club`) as the stance's envelope plays it, asks it forward at a pace for `--seconds`, and credits the
 * speed it made along its heading from when it first went `CREDIT_FROM` m/s to the trial's end, a
 * fall (`FALLEN`) ending the distance: no more than `OVER` past the pace asked, and less by as much as it ran
 * faster than that. A candidate's score is the mean of its trials, over `--models` and `--speeds`,
 * and with `--turns` a trial a model at each rate there: asked `TURN.speed` forward, its face turned
 * at that rate (to the right, or left if negative) through `TURN.angle` from `TURN.at` s, credited the length of its path, and half that
 * if as it ends its way is more than `TURNED` off the face asked; and with `--stops` a trial a model
 * at each pace there, asked it forward and to stop at `STOP.at` s, credited the speed it made until then times
 * the share of the time after it stood, and by as much less as it took longer than `STOP.within` s to
 * come under `STOP.under`, and half that if it ends going faster. With `--winds rate:strength:seed,seed`
 * each trial is walked calm and again in the lab's gusts on each seed (`startWind`), so that a
 * candidate is credited for what it holds through a run's chaos, not for one lucky path.
 *
 *   node research/run-cycle-search.mjs --out .snap/run/a [--models workshop-fighter,workshop-rogue,crypt-skeleton]
 *     [--speeds 3,3.5,4] [--turns 0.4,0.8] [--stops 2,3.5] [--seconds 25] [--generations 60] [--lambda 28] [--sigma 0.1] [--workers 28]
 *     [--start '{"cv":0.3}' | file.json] [--dims accel,brake] [--winds 1:5:1,2] [--holds empty,club] [--balance 25] [--haste 100,150 --hasted 0.5] [--score] [--windows]
 *
 * - `--score` scores the start alone and prints each trial; with `--windows` each trial's speed in
 *   each 2 s window.
 * - Otherwise it searches, and writes each generation to `<out>.jsonl` and the best to `<out>-best.json`.
 *
 * The settings it moves are `DIMS`, or those of them `--dims` names, the rest the start's over the defaults (`RUN_CYCLE`), and three of the
 * walk's (`SimbiconSettings`, `WALK`): `at`, its `run`, the pace past which it runs, `speedup` and `slowdown`.
 */
import { isMainThread, parentPort } from "node:worker_threads";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { cmaSearch, workerPool } from "./cma.mjs";
import { createBody } from "../src/core/body.ts";
import { modelSpec } from "../src/core/models.ts";
import { armed } from "../src/core/human/grip.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { balanceCeiling, balancePercent, rulebook } from "../src/core/rules/rulebook.ts";
import { SIMBICON, simbicon, simbiconWays } from "../src/core/skills/simbicon.ts";
import { RUN_CYCLE, runCycleSettings } from "../src/core/skills/cycle-run.ts";
import { coreStand } from "../tests/harness/core-stand.mjs";
import { TURNED } from "../src/core/control/stance-envelope.ts";
import { startWind } from "../src/lab/wind.ts";
import { guardPosture } from "../src/core/skills/guard.ts";

/** Each setting searched and its range. */
const DIMS = {
  blend: [0, 1], short: [0, 1], swingGain: [0, 0.4], cadenceGain: [0, 0.3], gainsFrom: [2.2, 5], period: [0.8, 1.25], accel: [0.3, 2], brake: [0.3, 4], ahead: [0.1, 1.5],
  lean: [-0.05, 0.45], pelvis: [0.04, 0.2], leanGain: [0, 1], leanMost: [0, 0.6], bank: [-0.5, 1.5], hold: [0.5, 1], settle: [0.02, 0.15], stance: [0.4, 1], swing: [0.3, 1], ankle: [0.2, 1],
  cv: [-0.1, 0.4], cd: [-0.5, 0.8], late: [0.5, 0.95], paceGain: [0, 0.5], paceMost: [0, 0.4],
  contact: [0.1, 0.4], gainSide: [0, 0.4], width: [-0.05, 0.2], cvAnkleSide: [-1, 1], cdSide: [-0.5, 1],
  kneeAdd: [-0.2, 0.4], ankleAdd: [-0.3, 0.2], hipAdd: [-0.3, 0.3], wait: [0.001, 0.2], early: [0.05, 0.3], arms: [0, 3], elbow: [0.3, 1.8],
  at: [0.8, 1.6], speedup: [0.3, 3], slowdown: [0.3, 3],
};
/** The walk's settings it moves (`SimbiconSettings`), by the names it gives them. */
const WALK = ["at", "speedup", "slowdown"];

/** The speed from which a trial's distance counts, m/s: under the walk's top, so a body that runs from a slow walk is credited. */
const CREDIT_FROM = 0.7;
/** How far past the pace asked a trial is credited, m/s; past it, the credit falls by as much again. */
const OVER = 0.2;
/** A trial has fallen once the centre of mass is under this share of its standing height over the soles, or once the body reads itself down. */
const FALLEN = 0.55;
/** A turning trial: the pace asked, m/s, when its face starts to turn, s, and how far it turns, rad. */
const TURN = { speed: 3.5, at: 12, angle: Math.PI / 2 };
/** When a stopping trial is asked to stop, s, how soon after it is credited in full for coming under `under` m/s, s, and that speed. */
const STOP = { at: 12, within: 2, under: 0.5 };

/**
 * One trial: `model` asked `speed` m/s forward for `seconds` under the run `run`, its face turned at
 * `turn` rad/s if given (`TURN`), or asked to stop if `stop` (`STOP`), in the gusts of `wind` if given, holding `held` (`empty` or `club`); its credit, and its 2 s windows' speeds.
 */
async function trial({ model, speed, seconds, turn = 0, stop = false, wind = null, held = "empty", balance = null, haste, hasted = SIMBICON.hasted, run: { at, speedup, slowdown, ...run } }) {
  const own = modelSpec(model, undefined, { haste }), spec = held === "club" ? armed(own, "right", woodenClub()) : own, guard = guardPosture(spec);
  const stand = await coreStand(spec, { ground: true, groundSize: 400, posture: guard });
  const assist = balanceCeiling(balance ?? stand.built.spec.attributes.balance.value, balancePercent(rulebook("arena")));
  const body = createBody(stand.built, stand.world, { servoSeconds: 0.1, measuring: true, assist });
  const blowing = wind && startWind(stand.built, stand.world, { rate: wind.rate, strength: wind.strength }, wind.seed);
  const skill = simbicon(body, { ...SIMBICON, run: at, speedup, slowdown, hasted }, simbiconWays(), runCycleSettings(run));
  let asked = null, goal = null, face = 0;
  body.drive((view, dt) => {
    const d = skill.drive(view, asked, face, dt);
    if (d.kind === "drive") return { posture: { ...guard, ...d.posture }, pushes: d.pushes, stance: null };
    goal = d.goal ?? goal;
    return { posture: guard, pushes: [], stance: view.time > 0 ? goal : null };
  });
  try {
    stand.step(stand.seconds(1));
    const standing = body.view.stance.centre.y - body.view.stance.support.y;
    asked = [speed, 0];
    const steps = stand.seconds(seconds), window = stand.seconds(2), windows = [];
    const turnFrom = stand.seconds(TURN.at), stopAt = stop ? stand.seconds(STOP.at) : steps;
    let from = null, at = 0, z = 0, path = 0, fell = null, under = null, mark = body.view.stance.centre.z;
    for (let i = 1; i <= steps; i++) {
      if (turn !== 0 && i > turnFrom) face = turn > 0 ? Math.min(TURN.angle, face + turn / stand.world.hz) : Math.max(-TURN.angle, face + turn / stand.world.hz);
      if (i === stopAt + 1) asked = null;
      stand.step(1);
      const s = body.view.stance;
      if (from === null && s.velocity.z >= CREDIT_FROM) { from = s.centre.z; at = i; }
      if (from !== null) path += Math.sqrt(s.velocity.x * s.velocity.x + s.velocity.z * s.velocity.z) / stand.world.hz;
      if (i <= stopAt) z = s.centre.z;
      else if (under === null && Math.sqrt(s.velocity.x * s.velocity.x + s.velocity.z * s.velocity.z) < STOP.under) under = (i - stopAt) / stand.world.hz;
      const height = s.centre.y - Math.min(s.soles.left.y, s.soles.right.y);
      if (!Number.isFinite(height) || height < FALLEN * standing || body.view.down) { fell = i / stand.world.hz; break; }
      if (i % window === 0) { windows.push(+((s.centre.z - mark) / 2).toFixed(2)); mark = s.centre.z; }
    }
    const made = from === null ? 0 : (turn !== 0 ? path : z - from) / ((stopAt - at) / stand.world.hz);
    const v = body.view.stance.velocity, off = Math.abs(Math.atan2(v.x, v.z) - face), turned = turn === 0 || fell !== null || off <= TURNED;
    const stood = !stop ? 1 : fell === null ? 1 : Math.max(0, fell - STOP.at) / (seconds - STOP.at), stopped = !stop || (fell === null && v.length() < STOP.under);
    const soon = !stop ? 1 : Math.min(1, STOP.within / (under ?? seconds - STOP.at));
    const credit = (Math.min(made, speed + OVER) - Math.max(0, made - speed - OVER)) * (turned ? 1 : 0.5) * stood * soon * (stopped ? 1 : 0.5);
    return { model, speed, turn, stop, wind: wind?.seed ?? null, held, credit, made: +made.toFixed(3), fell, turned, under, windows };
  } finally { blowing?.dispose(); body.dispose(); stand.dispose(); }
}

if (!isMainThread) {
  parentPort.on("message", async ({ id, x }) => {
    try {
      const trials = [];
      for (const cell of x.cells) trials.push(await trial({ ...cell, run: x.run }));
      parentPort.postMessage({ id, r: { score: trials.reduce((s, t) => s + t.credit, 0) / trials.length, trials } });
    } catch (error) { parentPort.postMessage({ id, r: { score: -1, error: String(error) } }); }
  });
} else {
  const { values: o } = parseArgs({ options: {
    out: { type: "string" }, models: { type: "string", default: "workshop-fighter,workshop-rogue,crypt-skeleton" }, speeds: { type: "string", default: "3,3.5,4" }, turns: { type: "string" }, stops: { type: "string" },
    seconds: { type: "string", default: "25" }, generations: { type: "string", default: "60" }, lambda: { type: "string", default: "28" },
    sigma: { type: "string", default: "0.1" }, workers: { type: "string", default: "28" }, start: { type: "string" }, dims: { type: "string" }, score: { type: "boolean" }, windows: { type: "boolean" }, winds: { type: "string" }, holds: { type: "string", default: "empty" }, balance: { type: "string" }, haste: { type: "string" }, hasted: { type: "string" },
  } });
  const KEYS = o.dims ? o.dims.split(",") : Object.keys(DIMS);
  const WINDS = [null, ...(o.winds ? (([rate, strength, seeds]) => seeds.split(",").map((seed) => ({ rate: Number(rate), strength: Number(strength), seed: Number(seed) })))(o.winds.split(":")) : [])];
  for (const key of KEYS) if (!DIMS[key]) throw new Error(`no setting ${key} is searched`);
  const given = o.start ? JSON.parse(o.start.startsWith("{") ? o.start : readFileSync(o.start, "utf8")) : {};
  const start = { ...RUN_CYCLE, at: SIMBICON.run, speedup: SIMBICON.speedup, slowdown: SIMBICON.slowdown, ...Object.fromEntries(Object.entries(given).filter(([key]) => key in RUN_CYCLE || WALK.includes(key))) };
  const cells = o.models.split(",").flatMap((model) => [...o.speeds.split(",").map((speed) => ({ model, speed: Number(speed), seconds: Number(o.seconds) })),
    ...(o.turns ? o.turns.split(",") : []).map((turn) => ({ model, speed: TURN.speed, turn: Number(turn), seconds: Number(o.seconds) })),
    ...(o.stops ? o.stops.split(",") : []).map((speed) => ({ model, speed: Number(speed), stop: true, seconds: Number(o.seconds) }))]).flatMap((cell) => WINDS.map((wind) => ({ ...cell, wind }))).flatMap((cell) => o.holds.split(",").map((held) => ({ ...cell, held, balance: o.balance === undefined ? null : Number(o.balance),
    ...(o.hasted === undefined ? {} : { hasted: Number(o.hasted) }) }))).flatMap((cell) => o.haste === undefined ? [cell] : o.haste.split(",").map((haste) => ({ ...cell, haste: Number(haste) })));
  const toUnit = (p) => KEYS.map((k) => (p[k] - DIMS[k][0]) / (DIMS[k][1] - DIMS[k][0]));
  const fromUnit = (u) => ({ ...start, ...Object.fromEntries(KEYS.map((k, i) => [k, +(DIMS[k][0] + Math.min(1, Math.max(0, u[i])) * (DIMS[k][1] - DIMS[k][0])).toFixed(4)])) });
  if (o.score) {
    const trials = await Promise.all(cells.map((cell) => trial({ ...cell, run: start })));
    for (const t of trials) console.log(`${t.model}${t.held === "club" ? " with the club" : ""}${t.wind === null ? "" : ` in gusts ${t.wind}`} asked ${t.speed}${t.turn ? ` turning ${t.turn}${t.turned ? "" : " (not turned)"}` : ""}${t.stop ? ` then to stop (under ${STOP.under} after ${t.under} s)` : ""}: made ${t.made} m/s, fell ${t.fell}${o.windows ? `; windows ${t.windows.join(" ")}` : ""}`);
    console.log("score", trials.reduce((s, t) => s + t.credit, 0) / trials.length);
  } else {
    if (!o.out) throw new Error("--out names the search's files");
    const pool = workerPool(new URL(import.meta.url), null, Number(o.workers));
    const { best } = await cmaSearch({ n: KEYS.length, start: toUnit(start), sigma: Number(o.sigma), lambda: Number(o.lambda), generations: Number(o.generations), seed: 1,
      // Each trial is a job of its own, so a generation's trials spread over every worker.
      score: async (u) => {
        const run = fromUnit(u), parts = await Promise.all(cells.map((cell) => pool.evaluate({ cells: [cell], run })));
        if (parts.some((r) => r.error)) return { score: -1, error: parts.find((r) => r.error).error };
        const trials = parts.flatMap((r) => r.trials);
        return { score: trials.reduce((sum, t) => sum + t.credit, 0) / trials.length, trials };
      },
      onGeneration: (entry, { best }) => {
        const line = { ...entry, bestSoFar: +best.score.toFixed(3), trials: best.r?.trials?.map(({ model, speed, turn, stop, wind, held, made, fell, under }) => ({ model, speed, turn, stop, wind, held, made, fell, under })) };
        console.log(JSON.stringify(line));
        appendFileSync(o.out + ".jsonl", JSON.stringify({ ...line, run: fromUnit(best.u) }) + "\n");
        writeFileSync(o.out + "-best.json", JSON.stringify(fromUnit(best.u), null, 1) + "\n");
      } });
    await pool.terminate().catch(() => {});
    console.log("best", best.score);
  }
}
