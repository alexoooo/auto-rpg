/**
 * **The greedy punch**: the whole-body spike's solve (`research/whole-body-spike.mjs`) asked, every
 * step of a blow, to drive the fist's strike point along the line from where the blow began to
 * `through` m past the pad as hard as the muscles allow, and to hold it on that line, in place of
 * a path with a set time. No profile and no timing: what the solve finds from the body as it is.
 *
 * The line's demand is `push` m/s^2 along it, beyond what any muscle gives, so the bounded solve
 * gives what it can; across it, the fist is held to the line with feedback over `fistSeconds`. The
 * channels of `free` are let go of the guard (weight `armWeight`) while the fist is driven. The
 * base is the spike's: the mass centre over the soles' middle and the pelvis's height. `turns`
 * adds the spike's pelvis and chest turns. With `runup`, the fist is first drawn back along the line
 * to that distance from the pad's target, by a goal with feedback and no time, and driven from
 * where it is once it is there. A `trace` setting, a function, is called every step of a driven blow
 * with the time since its order, the fist's travel along the line and its speed there, and the observation.
 *
 *   node research/greedy-punch.mjs --workers 24 --out <file.jsonl> [--models ...] [--hz ...] [--settings '<json>']
 *
 * Harness: as the spike's. A blow's speed is its strike point's over the last 10 cm before the pad
 * first pushes back (`approachSpeed`), its latency the time from the order to that touch.
 */
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { appendFile, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { rigidPoints } from "../src/core/build/rigid.ts";
import { centreOfToRef, pointOfToRef } from "../src/core/control/support.ts";
import { modelSpec } from "../src/core/models.ts";
import { aimOf } from "../src/core/skills/strikes.ts";
import { CORE_ENGINE } from "../tests/harness/core-stand.mjs";
import { COMPETENCY, fullReach } from "./competencies.mjs";
import { approachSpeed } from "./punch-calibration.mjs";
import { punchPad } from "./punch-pad.mjs";
import { guardJoints, holding, localPoint, ORDERED, SPIKE, spikeBody, spikeFigures, ZERO } from "./whole-body-spike.mjs";

/** The greedy blow's settings: its own choices, each varied in the record. */
export const GREEDY = Object.freeze({
  /** The demand along the line, m/s^2; past the pad, m; the fist held to the line over s, and its weight. */
  push: 120, through: 0.2, fistSeconds: 0.05, fistWeight: 3,
  /** Drawn back first to this far from the pad's target along the line, m, held over `windSeconds`, until within `wound` m; none, driven from where it stands. */
  runup: null, windSeconds: 0.06, wound: 0.03,
  /** The channels let go of the guard while the fist is driven, and their weight. */
  free: "arm,trunk", armWeight: 0.001,
  /** The spike's pelvis and chest turns with it. */
  turns: false,
  /** The longest a blow is driven, s; driven on after contact, s; a blow's cycle, s; returned within, m. */
  longest: 0.45, follow: 0.03, cycle: 2, returned: 0.05,
});

const FREE = Object.freeze({ arm: (hand) => `(shoulder|elbow|wrist)\\.${hand}`, trunk: () => "thoracic|lumbar", hips: () => "hip\\.", legs: () => "hip\\.|knee\\.|ankle\\." });
const UP = new Vector3(0, 1, 0);
/** The guard's joint goals with the channels `light` names at `weight`. */
const freed = (joints, light, weight) => joints.map((goal) => light.test(goal.channel) ? { ...goal, weight } : goal);

function greedyPolicy(hand, target, limb, aim, events, state, settings) {
  const side = hand === "right" ? 1 : -1, light = new RegExp(settings.free.split(",").map((f) => FREE[f](hand)).join("|"));
  const sense = new Vector3(side, 0, 0).applyRotationQuaternion(Quaternion.RotationAxis(UP, 0.1)).z > 0 ? 1 : -1;
  const at = localPoint(limb, aim), point = new Vector3(), centre = new Vector3(), spin = new Vector3(), velocity = new Vector3();
  const { punch } = SPIKE;
  const minimumJerk = (t, span) => { const u = Math.max(0, Math.min(1, t / span)), u2 = u * u, u3 = u2 * u;
    return { s: u3 * (10 - 15 * u + 6 * u2), v: (30 * u2 - 60 * u3 + 30 * u2 * u2) / span, a: (60 * u - 180 * u2 + 120 * u3) / (span * span) }; };
  const turn = (from, angle, t, span, weight) => {
    const m = minimumJerk(t, span), q = Quaternion.RotationAxis(UP, sense * angle * m.s).multiply(new Quaternion(...from));
    return { target: [q.x, q.y, q.z, q.w], velocity: [0, sense * angle * m.v, 0], acceleration: [0, sense * angle * m.a, 0], seconds: punch.turnSeconds, weight };
  };
  return (description, guard) => {
    const segments = description.frames.filter((f) => f.kind === "segment");
    return { name: "greedy punch", state, step(observation) {
      const root = observation.segments.find((s) => s.name === "lowerTrunk"), chest = observation.segments.find((s) => s.name === "upperTrunk");
      state.initial ??= { root: [...root.position], rotation: [...root.rotation], chest: [...chest.rotation] };
      const t = observation.time, hold = holding(observation, state.initial, segments), frames = [hold.frame];
      if (state.phase === "guard" && events.length < 3 && t >= ORDERED + settings.cycle * events.length) {
        const from = pointOfToRef(limb, aim, point).asArray(), to = [target[0], target[1], target[2] + settings.through];
        const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
        const unit = to.map((v, k) => (v - from[k]) / length);
        state.phase = settings.runup === null ? "strike" : "wind";
        state.blow = { time: t, from, to, unit, back: settings.runup === null ? null : target.map((v, k) => v - unit[k] * settings.runup) };
        events.push({ time: t, from, contact: null, speed: null, returned: null, peak: 0, history: [] });
      }
      if (state.phase === "wind") {
        pointOfToRef(limb, aim, point);
        const { back, to } = state.blow, miss = Math.hypot(point.x - back[0], point.y - back[1], point.z - back[2]);
        if (miss < settings.wound || t - state.blow.time > settings.longest) {
          const from = point.asArray(), length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
          state.phase = "strike"; state.blow = { ...state.blow, from, unit: to.map((v, k) => (v - from[k]) / length), struck: t };
        } else {
          frames.push({ id: "fist", frame: { kind: "segment", name: limb.spec.name }, at, translation: { target: back, velocity: ZERO, acceleration: ZERO,
            seconds: settings.windSeconds, weight: settings.fistWeight } });
          return { joints: freed(guardJoints(description, guard), light, settings.armWeight), grips: [], centres: [hold.centre], frames };
        }
      }
      if (state.phase === "strike") {
        const s = t - state.blow.time, { from, unit } = state.blow, event = events.at(-1);
        pointOfToRef(limb, aim, point); centreOfToRef(limb, centre);
        limb.body.angularVelocityToRef(spin); limb.body.linearVelocityToRef(velocity);
        velocity.addInPlace(Vector3.Cross(spin, point.subtract(centre)));
        const p = point.asArray(), v = velocity.asArray(), along = (p[0] - from[0]) * unit[0] + (p[1] - from[1]) * unit[1] + (p[2] - from[2]) * unit[2];
        const speed = v[0] * unit[0] + v[1] * unit[1] + v[2] * unit[2];
        event.peak = Math.max(event.peak, speed);
        settings.trace?.({ s, along, speed, point: p, observation });
        frames.push({ id: "fist", frame: { kind: "segment", name: limb.spec.name }, at, translation: {
          target: from.map((x, k) => x + unit[k] * along), velocity: unit.map((u) => u * speed), acceleration: unit.map((u) => u * settings.push),
          seconds: settings.fistSeconds, weight: settings.fistWeight } });
        if (settings.turns) {
          frames.push({ id: "pelvis", frame: { kind: "segment", name: "lowerTrunk" }, at: ZERO, orientation: turn(state.initial.rotation, punch.pelvis, s, punch.seconds, punch.turnWeight) });
          frames.push({ id: "chest", frame: { kind: "segment", name: "upperTrunk" }, at: ZERO, orientation: turn(state.initial.chest, punch.chest, s - punch.lead, punch.seconds, punch.turnWeight) });
        }
        const touched = event.contact !== null && t - event.contact >= settings.follow;
        if (touched || t - (state.blow.struck ?? state.blow.time) > settings.longest) state.phase = "return";
        return { joints: freed(guardJoints(description, guard), light, settings.armWeight), grips: [], centres: [hold.centre], frames };
      }
      if (state.phase === "return" && t - state.blow.time >= settings.cycle - 0.05) state.phase = "guard";
      frames.push({ id: "turn", frame: { kind: "segment", name: "lowerTrunk" }, at: ZERO,
        orientation: { target: state.initial.rotation, velocity: ZERO, acceleration: ZERO, seconds: SPIKE.holdSeconds, weight: SPIKE.rootWeight } });
      return { joints: guardJoints(description, guard), grips: [], centres: [hold.centre], frames };
    } };
  };
}

/** The punch competency's trial under the greedy blow, read as the spike reads its own. */
export async function greedyTrial({ model, hand, hz, actuation = "symmetric", target, mode, seconds = COMPETENCY.punch.seconds, settings = GREEDY }) {
  const spec = modelSpec(model), limb = { spec: spec.segments.find((s) => s.name === `hand.${hand}`) };
  const aim = rigidPoints(spec, limb.spec).get(aimOf(spec, hand)).value, events = [];
  const state = { initial: null, phase: "guard", blow: null };
  let built = null;
  const rig = await spikeBody({ model, held: "empty", hz, actuation }, (description, guard, made) => {
    built = made;
    return greedyPolicy(hand, target, made.segments.get(`hand.${hand}`), aim, events, state, settings)(description, guard);
  });
  const hand_ = built.segments.get(`hand.${hand}`), pad = punchPad(rig.world, [target[0] + (mode === "miss" ? 1 : 0), target[1], target[2]], { face: "compliant" });
  try {
    let down = false;
    for (let i = 0; i < Math.round(seconds * hz); i++) {
      const event = events.at(-1), point = pointOfToRef(hand_, aim, new Vector3());
      if (event && event.contact === null && state.phase !== "guard") event.history.push({ time: rig.world.time, point: point.asArray() });
      if (event && event.contact !== null && event.returned === null && Vector3.Distance(point, new Vector3(...event.from)) < settings.returned) event.returned = rig.world.time - event.time;
      pad.prepare();
      for (const segment of built.segments.values()) pad.load(segment);
      rig.step();
      const reading = pad.read(), last = events.at(-1);
      if (last && last.contact === null && reading.impulse > pad.config.quietImpulse) { last.contact = rig.world.time; last.speed = approachSpeed(last.history); }
      down ||= rig.body.observe().down;
    }
    const blows = events.map(({ time, from, contact, speed, returned, peak }) => ({ ordered: time, from: from.map((v) => +v.toFixed(3)), latency: contact === null ? null : contact - time, speed, returned, peak }));
    const landed = blows.filter((b) => b.latency !== null);
    return { fell: down, success: !down && (mode === "miss" ? landed.length === 0 : landed.length === blows.length && blows.length === 3), blows, ...rig.summary() };
  } finally { pad.dispose(); rig.dispose(); }
}

/** The punch competency's cells for each model and rate, as the spike lays them out. */
function jobs({ models, rates, settings }) {
  const out = [];
  for (const model of models) for (const hz of rates) for (const hand of ["left", "right"]) {
    const [x, height, ahead] = COMPETENCY.punch.place, side = hand === "right" ? x : -x;
    for (const [placement, mode] of [["place", "hit"], ["reach", "hit"], ["place", "miss"]]) out.push({ task: "punch", model, held: "empty", hz, hand, placement, mode,
      target: [side, height, placement === "reach" ? fullReach(model, hand, side, height) : ahead], settings });
  }
  return out;
}

if (!isMainThread && workerData?.greedy) {
  for (const job of workerData.jobs) {
    try { parentPort.postMessage({ job, outcome: await greedyTrial(job) }); }
    catch (error) { parentPort.postMessage({ job, error: String(error?.stack ?? error) }); }
  }
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { workers: { type: "string" }, out: { type: "string" }, models: { type: "string" }, hz: { type: "string" },
    settings: { type: "string", multiple: true } } });
  const variants = (values.settings ?? ["{}"]).map((s) => ({ ...GREEDY, ...JSON.parse(s) }));
  const all = variants.flatMap((settings) => jobs({ models: (values.models ?? "workshop-fighter,workshop-rogue").split(","),
    rates: (values.hz ?? "120,480").split(",").map(Number), settings }));
  const lanes = Math.min(all.length, Number(values.workers ?? Math.max(1, availableParallelism() - 4)));
  const out = values.out ?? `research/runs/greedy-punch-${Date.now()}.jsonl`;
  await writeFile(out, "");
  const order = [...all].sort((a, b) => b.hz - a.hz), rows = [];
  await Promise.all(Array.from({ length: lanes }, (_, lane) => new Promise((settle, fail) => {
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { greedy: true, jobs: order.filter((_, i) => i % lanes === lane) } });
    worker.on("message", async (row) => { rows.push(row); await appendFile(out, `${JSON.stringify(row)}\n`); if (row.error) console.error(row.job, row.error); });
    worker.on("error", fail);
    worker.on("exit", settle);
  })));
  const figures = variants.map((settings) => ({ settings, figures: spikeFigures(rows.filter((r) => !r.error && JSON.stringify(r.job.settings) === JSON.stringify(settings))
    .map((r) => ({ ...r, job: { ...r.job, settings: undefined } }))) }));
  console.log(JSON.stringify({ harness: `Node core world, ${CORE_ENGINE}, ${lanes} workers`, rows: rows.length, errors: rows.filter((r) => r.error).length, figures }, null, 1));
  process.exit(0);
}
