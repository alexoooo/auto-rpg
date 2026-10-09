/**
 * **The whole-body spike** (`docs/reference/whole-body-spike.md`): can one bounded torque solve over
 * the coupled dynamics, with the ground's contacts and the joints' stops (`wholeBodyTracking`,
 * `src/core/control/whole-body.ts`, through `createMotionBody`), carry a body that stands on free
 * feet under the stand competency's shoves, and throws an explosive punch at the punch
 * competency's pad, sequenced pelvis, trunk, arm, unassisted, at 120 and 480 Hz, within a step
 * budget for two fighters in real time?
 *
 * Nothing holds the root: the feet stand on the ground and the solve keeps every contact force it
 * asks for pushing and within friction (`ContactTrackingSettings`), or rejects the step, which
 * zeroes its torques. Its goals: the mass centre over the soles' middle (x, z), the pelvis's height
 * 4 cm under where it was built and its turn, and every joint toward the guard (`guardPosture`),
 * the knees bent. The punch adds the pelvis's and the chest's turn that brings the striking
 * shoulder forward, and the fist's path to a point `through` past the pad, each a minimum-jerk
 * profile, the chest `lead` after the pelvis and the fist `lead` after the chest.
 *
 *   node research/whole-body-spike.mjs --workers 24 --out <file.jsonl>   every cell, stand and punch
 *   node research/whole-body-spike.mjs --task punch --models workshop-fighter --hz 120 --held empty --out <file>
 *   node research/whole-body-spike.mjs --timing                          one body alone, ms a step
 *
 * Harness: Node, core world, Rapier (`tests/harness/core-stand.mjs`'s engine), the body built in
 * its guard (`poseAngles`). A cell's figures are read by the competencies' rules
 * (`research/competencies.mjs`): the stand's level by `fastestHeld`, the punch's speed over the
 * last 10 cm (`approachSpeed`).
 */
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scene } from "@babylonjs/core/scene.js";
import { appendFile, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { buildBody } from "../src/core/build/build-body.ts";
import { rigidPoints } from "../src/core/build/rigid.ts";
import { poseAngles } from "../src/core/control/kinematics.ts";
import { centreOfToRef, pointOfToRef } from "../src/core/control/support.ts";
import { fastestHeld } from "../src/core/control/stance-envelope.ts";
import { armed } from "../src/core/human/grip.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { createMotionBody } from "../src/core/mind/motion.ts";
import { modelSpec } from "../src/core/models.ts";
import { guardPosture } from "../src/core/skills/guard.ts";
import { aimOf } from "../src/core/skills/strikes.ts";
import { guardJoints, holdGoals, localPoint, minimumJerk, trunkTurn, turnSense, WHOLE_BODY } from "../src/core/skills/whole-body-strike.ts";
import { createWorld } from "../src/core/world.ts";
import { CORE_ENGINE, freshEngine } from "../tests/harness/core-stand.mjs";
import { bodyMass, COMPETENCY, fullReach, THRESHOLDS } from "./competencies.mjs";
import { approachSpeed } from "./punch-calibration.mjs";
import { punchPad } from "./punch-pad.mjs";

Logger.LogLevels = Logger.ErrorLogLevel;

/** The spike's settings: the whole-body strike's (`WHOLE_BODY`), the record's "Settings". */
export const SPIKE = WHOLE_BODY;

export const ZERO = Object.freeze([0, 0, 0]);
/** When the first punch is ordered, s, as the competency's stands (`ORDERED`). */
export const ORDERED = 2;
/** How long a stand settles before its shove, s, as `shove` does. */
const SETTLE = 1.5;
/** How far under its settled height the mass centre may sink before the body is down, m, as `shove` reads. */
const SINK = 0.25;

/**
 * `model` holding `held` ("empty" or "club" in the right hand) on the ground at `hz`, built in its
 * guard and driven by the whole-body tracker under `policy(model, guard)`. Returns the world, the
 * body and a stepper that reads each step's wall time and the tracker's report.
 */
export async function spikeBody({ model, held, hz, actuation }, policy) {
  const engine = new NullEngine(), scene = new Scene(engine);
  const world = createWorld(scene, await freshEngine(), { hz, actuation });
  world.physics.addFixedBox([0, -0.5, 0], [20, 1, 20]);
  const spec = held === "club" ? armed(modelSpec(model), "right", woodenClub()) : modelSpec(model);
  const guard = guardPosture(spec), built = buildBody(spec, world, { position: [0, 0, 0], joints: poseAngles(spec, guard) });
  const body = createMotionBody(built, world, (description) => policy(description, guard, built),
    { items: [], grants: [], fixed: [], capacity: SPIKE.capacity, effortCost: SPIKE.effortCost, contact: SPIKE.contact });
  const reading = { steps: 0, milliseconds: 0, worst: 0, rejected: 0, saturated: 0, residual: 0 };
  return {
    world, built, body, reading,
    step() {
      const began = performance.now();
      world.step();
      const took = performance.now() - began, report = body.report();
      reading.steps++; reading.milliseconds += took; reading.worst = Math.max(reading.worst, took);
      if (report.contact?.status === "rejected") reading.rejected++;
      reading.saturated += report.saturated; reading.residual += report.residual;
    },
    summary: () => ({ steps: reading.steps, msPerStep: reading.milliseconds / reading.steps, worstMs: reading.worst,
      rejected: reading.rejected, saturated: reading.saturated / reading.steps, residual: reading.residual / reading.steps }),
    dispose() { body.dispose(); built.dispose(); world.dispose(); scene.dispose(); engine.dispose(); },
  };
}

export { guardJoints, localPoint };

/** The goals every step holds (`holdGoals`): the mass centre over the soles' middle, and the pelvis `lower` under its height as built. */
export function holding(observation, initial, segments) {
  const feet = ["left", "right"].map((side) => observation.segments.find((s) => s.name === `foot.${side}`));
  return holdGoals([(feet[0].centre[0] + feet[1].centre[0]) / 2, 0, (feet[0].centre[2] + feet[1].centre[2]) / 2], initial.root[1] - SPIKE.lower, segments);
}

/** The stance alone: the guard, the centre over the soles, the pelvis level and turned as built. */
function standPolicy(description, guard) {
  const joints = guardJoints(description, guard), segments = description.frames.filter((f) => f.kind === "segment");
  const state = { initial: null };
  return { name: "whole-body stance", state, step(observation) {
    const root = observation.segments.find((s) => s.name === "lowerTrunk");
    state.initial ??= { root: [...root.position], rotation: [...root.rotation] };
    const hold = holding(observation, state.initial, segments);
    return { joints, grips: [], centres: [hold.centre], frames: [hold.frame, { id: "turn", frame: { kind: "segment", name: "lowerTrunk" }, at: ZERO,
      orientation: { target: state.initial.rotation, velocity: ZERO, acceleration: ZERO, seconds: SPIKE.holdSeconds, weight: SPIKE.rootWeight } }] };
  } };
}

/**
 * The stand competency's trial on the spike: settled `SETTLE` s, shoved at the middle trunk's
 * centre by `impulse` N s, `degrees` about up from the way it faces, and watched `watch` s; down if
 * it is down or its mass centre sinks `SINK` m under where it settled.
 */
export async function standTrial({ model, held, hz, actuation = "symmetric", impulse, degrees, watch }) {
  const rig = await spikeBody({ model, held, hz, actuation }, standPolicy);
  try {
    for (let i = 0; i < Math.round(SETTLE * hz); i++) rig.step();
    const settled = rig.body.observe().centre[1], trunk = rig.built.segments.get("middleTrunk"), way = degrees * Math.PI / 180;
    trunk.body.applyImpulse(new Vector3(impulse * Math.sin(way), 0, impulse * Math.cos(way)), centreOfToRef(trunk, new Vector3()));
    let low = 0, down = false;
    for (let i = 0; i < Math.round(watch * hz) && !down; i++) {
      rig.step();
      const o = rig.body.observe();
      low = Math.max(low, settled - o.centre[1]);
      down = o.down || low > SINK;
    }
    return { fell: down, success: !down, low, ...rig.summary() };
  } finally { rig.dispose(); }
}

/**
 * The punch: the stance, and from `ORDERED` s a blow every `cycle` s, three in all. A blow turns the
 * pelvis and then the chest to bring the striking shoulder forward and drives the fist's strike
 * point along a minimum-jerk path from where it stands to `through` m past `target`, until
 * `follow` s after it touches or the path is done; then it returns to the guard. Its `state` is the
 * caller's, which reads the phase from it.
 */
function punchPolicy(hand, target, limb, aim, events, state) {
  const { punch } = SPIKE, arm = new RegExp(`(shoulder|elbow|wrist)\\.${hand}`), sense = turnSense(hand);
  const turn = (from, angle, t, span, weight) => trunkTurn(from, sense, angle, t, span, weight);
  const at = localPoint(limb, aim), to = [target[0], target[1], target[2] + punch.through];
  return (description, guard) => {
    const segments = description.frames.filter((f) => f.kind === "segment");
    return { name: "whole-body punch", state, step(observation) {
      const root = observation.segments.find((s) => s.name === "lowerTrunk"), chest = observation.segments.find((s) => s.name === "upperTrunk");
      state.initial ??= { root: [...root.position], rotation: [...root.rotation], chest: [...chest.rotation] };
      const t = observation.time, hold = holding(observation, state.initial, segments), frames = [hold.frame];
      if (state.phase === "guard" && events.length < 3 && t >= ORDERED + punch.cycle * events.length) {
        const from = pointOfToRef(limb, aim, new Vector3()).asArray();
        state.phase = "strike"; state.blow = { time: t, from };
        events.push({ time: t, from, contact: null, speed: null, returned: null, history: [] });
      }
      if (state.phase === "strike") {
        const s = t - state.blow.time, from = state.blow.from, m = minimumJerk(s - 2 * punch.lead, punch.seconds), event = events.at(-1);
        frames.push({ id: "pelvis", frame: { kind: "segment", name: "lowerTrunk" }, at: ZERO, orientation: turn(state.initial.rotation, punch.pelvis, s, punch.seconds, punch.turnWeight) });
        frames.push({ id: "chest", frame: { kind: "segment", name: "upperTrunk" }, at: ZERO, orientation: turn(state.initial.chest, punch.chest, s - punch.lead, punch.seconds, punch.turnWeight) });
        frames.push({ id: "fist", frame: { kind: "segment", name: limb.spec.name }, at, translation: { target: from.map((v, k) => v + (to[k] - v) * m.s),
          velocity: from.map((v, k) => (to[k] - v) * m.v), acceleration: from.map((v, k) => (to[k] - v) * m.a), seconds: punch.fistSeconds, weight: punch.fistWeight } });
        const done = s > 2 * punch.lead + punch.seconds + punch.follow, touched = event.contact !== null && t - event.contact >= punch.follow;
        if (done || touched) state.phase = "return";
        return { joints: guardJoints(description, guard, arm, punch.armWeight), grips: [], centres: [hold.centre], frames };
      }
      if (state.phase === "return" && t - state.blow.time >= punch.cycle - 0.05) state.phase = "guard";
      frames.push({ id: "turn", frame: { kind: "segment", name: "lowerTrunk" }, at: ZERO,
        orientation: { target: state.initial.rotation, velocity: ZERO, acceleration: ZERO, seconds: SPIKE.holdSeconds, weight: SPIKE.rootWeight } });
      return { joints: guardJoints(description, guard), grips: [], centres: [hold.centre], frames };
    } };
  };
}

/**
 * The punch competency's trial on the spike: `model`'s `hand` at the pad at `target` (x, height,
 * ahead), or 1 m aside of it with `mode` "miss", three blows over `seconds` s. Each blow's speed
 * over its last 10 cm before the pad first pushes back (`approachSpeed`), its time from the order to
 * that touch, and whether the fist came back within `returned` m of where it stood before the blow
 * within the cycle.
 */
export async function punchTrial({ model, hand, hz, actuation = "symmetric", target, mode, seconds = COMPETENCY.punch.seconds }) {
  const spec = modelSpec(model), limb = { spec: spec.segments.find((s) => s.name === `hand.${hand}`) };
  const aim = rigidPoints(spec, limb.spec).get(aimOf(spec, hand)).value, events = [];
  const state = { initial: null, phase: "guard", blow: null };
  let built = null;
  const rig = await spikeBody({ model, held: "empty", hz, actuation }, (description, guard, made) => {
    built = made;
    return punchPolicy(hand, target, made.segments.get(`hand.${hand}`), aim, events, state)(description, guard);
  });
  const hand_ = built.segments.get(`hand.${hand}`), pad = punchPad(rig.world, [target[0] + (mode === "miss" ? 1 : 0), target[1], target[2]], { face: "compliant" });
  try {
    let down = false;
    for (let i = 0; i < Math.round(seconds * hz); i++) {
      const event = events.at(-1), point = pointOfToRef(hand_, aim, new Vector3());
      if (event && event.contact === null && state.phase !== "guard") event.history.push({ time: rig.world.time, point: point.asArray() });
      if (event && event.contact !== null && event.returned === null && Vector3.Distance(point, new Vector3(...event.from)) < SPIKE.punch.returned) event.returned = rig.world.time - event.time;
      pad.prepare();
      for (const segment of built.segments.values()) pad.load(segment);
      rig.step();
      const reading = pad.read(), last = events.at(-1);
      if (last && last.contact === null && reading.impulse > pad.config.quietImpulse) {
        last.contact = rig.world.time; last.speed = approachSpeed(last.history);
      }
      down ||= rig.body.observe().down;
    }
    const blows = events.map(({ time, contact, speed, returned }) => ({ ordered: time, latency: contact === null ? null : contact - time, speed, returned }));
    const landed = blows.filter((b) => b.latency !== null);
    return { fell: down, success: !down && (mode === "miss" ? landed.length === 0 : landed.length === blows.length && blows.length === 3), blows, ...rig.summary() };
  } finally { pad.dispose(); rig.dispose(); }
}

/** The cells: each workshop model, empty-handed and with the club, at each rate. */
const MODELS = Object.freeze(["workshop-fighter", "workshop-rogue"]), HELD = Object.freeze(["empty", "club"]), RATES = Object.freeze([120, 480]);

/** Every job of the spike: the stand's ladder of shoves in every direction, and the punch's three placements. */
export function spikeJobs({ models = MODELS, rates = RATES, tasks = ["stand", "punch"], helds = HELD } = {}) {
  const jobs = [];
  for (const model of models) for (const hz of rates) for (const held of helds) {
    if (tasks.includes("stand")) {
      const { levels, ways, watch } = COMPETENCY.stand, mass = bodyMass(model);
      for (const level of levels) for (let k = 0; k < ways; k++) jobs.push({ task: "stand", model, held, hz, level, impulse: level * mass, degrees: k * 360 / ways, watch });
    }
    if (tasks.includes("punch") && held === "empty") for (const hand of ["left", "right"]) {
      const [x, height, ahead] = COMPETENCY.punch.place, side = hand === "right" ? x : -x;
      for (const [placement, mode] of [["place", "hit"], ["reach", "hit"], ["place", "miss"]]) jobs.push({ task: "punch", model, held, hz, hand, placement, mode,
        target: [side, height, placement === "reach" ? fullReach(model, hand, side, height) : ahead] });
    }
  }
  return jobs;
}

async function run(job) {
  switch (job.task) {
    case "stand": return standTrial(job);
    case "punch": return punchTrial(job);
    default: throw new Error(`unknown spike task ${job.task}`);
  }
}

/**
 * A cell's figures, by the competencies' rules: the stand's level (`fastestHeld`) against its
 * threshold; the punch's slowest landed blow, its latest touch, its falls and returns.
 */
export function spikeFigures(rows) {
  const cells = new Map();
  for (const row of rows) {
    const key = [row.job.task, row.job.model, row.job.held, row.job.hz].join("/");
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(row);
  }
  const mean = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  return [...cells].map(([key, rs]) => {
    const [task, model, held, hz] = key.split("/"), cost = { msPerStep: mean(rs.map((r) => r.outcome.msPerStep)),
      worstMs: Math.max(...rs.map((r) => r.outcome.worstMs)), rejected: rs.reduce((a, r) => a + r.outcome.rejected, 0), steps: rs.reduce((a, r) => a + r.outcome.steps, 0) };
    if (task === "stand") {
      const { levels, ways } = COMPETENCY.stand, at = levels.map((level) => rs.filter((r) => r.job.level === level));
      const level = fastestHeld({ speeds: levels, ways, held: at.map((r) => r.filter((x) => x.outcome.success).length) });
      return { task, model, held, hz: Number(hz), level, meets: level >= THRESHOLDS.stand.level,
        levels: levels.map((l, i) => ({ level: l, held: at[i].filter((x) => x.outcome.success).length, count: at[i].length })), ...cost };
    }
    const hits = rs.filter((r) => r.job.mode === "hit"), blows = hits.flatMap((r) => r.outcome.blows), landed = blows.filter((b) => b.latency !== null);
    const speeds = landed.map((b) => b.speed).filter((s) => s !== null), threshold = THRESHOLDS.punch;
    const meets = rs.every((r) => r.outcome.success) && speeds.length === landed.length && landed.length >= threshold.landed * blows.length
      && Math.min(...speeds) >= threshold.speed && Math.max(...landed.map((b) => b.latency)) <= threshold.latency;
    return { task, model, held, hz: Number(hz), meets, success: rs.filter((r) => r.outcome.success).length, count: rs.length,
      fell: rs.filter((r) => r.outcome.fell).length, landed: landed.length, blows: blows.length,
      speed: mean(speeds), slowest: speeds.length ? Math.min(...speeds) : null, fastest: speeds.length ? Math.max(...speeds) : null,
      latency: mean(landed.map((b) => b.latency)), returned: blows.filter((b) => b.returned !== null).length, ...cost };
  });
}

/** One body alone, standing 5 s and then punching, at each rate: ms a step on a quiet machine. */
async function timing() {
  const out = [];
  for (const hz of RATES) for (const model of MODELS) {
    const stand = await standTrial({ model, held: "empty", hz, impulse: 0, degrees: 0, watch: 5 });
    const [x, height, ahead] = COMPETENCY.punch.place;
    const punch = await punchTrial({ model, hand: "right", hz, target: [x, height, ahead], mode: "hit" });
    out.push({ model, hz, stand: { msPerStep: stand.msPerStep, worstMs: stand.worstMs }, punch: { msPerStep: punch.msPerStep, worstMs: punch.worstMs } });
  }
  return out;
}

if (!isMainThread && workerData?.spike) {
  for (const job of workerData.jobs) {
    try { parentPort.postMessage({ job, outcome: await run(job) }); }
    catch (error) { parentPort.postMessage({ job, error: String(error?.stack ?? error) }); }
  }
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { workers: { type: "string" }, out: { type: "string" }, models: { type: "string" },
    hz: { type: "string" }, task: { type: "string" }, held: { type: "string" }, timing: { type: "boolean" } } });
  if (values.timing) {
    console.log(JSON.stringify({ harness: `Node core world, ${CORE_ENGINE}, one body alone`, timing: await timing() }, null, 1));
    process.exit(0);
  }
  const jobs = spikeJobs({ ...(values.models ? { models: values.models.split(",") } : {}), ...(values.hz ? { rates: values.hz.split(",").map(Number) } : {}),
    ...(values.task ? { tasks: values.task.split(",") } : {}), ...(values.held ? { helds: values.held.split(",") } : {}) });
  const lanes = Math.min(jobs.length, Number(values.workers ?? Math.max(1, availableParallelism() - 4)));
  const out = values.out ?? `research/runs/whole-body-spike-${Date.now()}.jsonl`;
  await writeFile(out, "");
  // Longest first: a lane at 480 Hz takes four times one at 120.
  const order = [...jobs].sort((a, b) => b.hz - a.hz), rows = [];
  let done = 0;
  await Promise.all(Array.from({ length: lanes }, (_, lane) => new Promise((settle, fail) => {
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { spike: true, jobs: order.filter((_, i) => i % lanes === lane) } });
    worker.on("message", async (row) => {
      rows.push(row); done++;
      await appendFile(out, `${JSON.stringify(row)}\n`);
      if (row.error) console.error(row.job, row.error);
      if (done % 20 === 0) console.error(`${done}/${jobs.length}`);
    });
    worker.on("error", fail);
    worker.on("exit", settle);
  })));
  console.log(JSON.stringify({ harness: `Node core world, ${CORE_ENGINE}, ${lanes} workers`, rows: rows.length, errors: rows.filter((r) => r.error).length,
    figures: spikeFigures(rows.filter((r) => !r.error)) }, null, 1));
  process.exit(0);
}
