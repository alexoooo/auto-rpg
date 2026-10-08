/** Shared physical tasks, measured without changing the commands their controllers produce. */
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { freshEngine } from "../tests/harness/core-stand.mjs";
import { createEnvironment } from "../src/core/tasks/environment.ts";
import { createReachTask } from "../src/core/tasks/reach.ts";
import { createCollisionProbe } from "../src/core/tasks/collision.ts";
import { createBarProbe } from "../src/core/tasks/bar.ts";
import { createSupportProbe } from "../src/core/tasks/support.ts";
import { createPostureHoldProbe } from "../src/core/tasks/posture-hold.ts";
import { postureStart } from "./man-posture-starts.mjs";
import { createSupportEntryProbe } from "../src/core/tasks/support-entry.ts";
import { createPointStrikeProbe } from "../src/core/tasks/point-strike.ts";
import { createDefenseProbe } from "../src/core/tasks/defense.ts";
import { saveState, loadState } from "../src/core/state.ts";
import { reachAction, reachFrame } from "../src/core/tasks/reach-policy.ts";
import { HUMANOID_MODELS } from "../src/core/models.ts";
import { RECIPE_FIGHTER } from "../src/core/mind/config.ts";
import { createMind } from "../src/core/mind/minds.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { REPERTOIRE, recipesFor } from "../src/core/skills/strikes.ts";
import { traceOf } from "../tests/harness/trace.mjs";
import { felled, watchFall } from "./core-rise-trials.mjs";
import { evaluateBlow, heldSpec } from "./core-blow.mjs";
import { buildBout } from "./bout.mjs";
import { solverTrial } from "./control-foundation-solvers.mjs";

Logger.LogLevels = Logger.ErrorLogLevel;

/** The task protocol: rates are declared, and split indices occupy disjoint bounded ranges. */
export const FOUNDATION = Object.freeze({ version: 2, samples: 2, watch: 40, bout: 20, recovery: 3,
  split: Object.freeze({ development: 0, "held-out": 1000000 }), maximumSamples: 1000000 });

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const heldName = (held) => held === "club" ? "wooden club" : "fist";
const riseMind = { ...RECIPE_FIGHTER, subs: [{ kind: "staged-rise" }] };
const suites = ["baseline", "recovery", "strike-block", "point-strike", "moving-strike", "defense", "bar", "support", "posture-hold", "support-entry", "integrated", "reach", "ccd", "solver"];

/** Fully specified starts; a seed selects geometry, not a hidden source of simulation noise. */
export function foundationJobs({ suite = "baseline", split = "development", samples = FOUNDATION.samples,
  hz = 120, models = HUMANOID_MODELS, from = 0, actuation = "symmetric", support = "pinned", centreControl = false, continueSeconds = 1, shared = false, jointStops = false, envelope = "boot" } = {}) {
  if (typeof jointStops !== "boolean" || jointStops && !["bar", "point-strike", "moving-strike", "defense"].includes(suite)) throw new Error("joint-stop prediction requires a motion probe suite");
  if (!suites.includes(suite)) throw new Error(`unknown suite ${suite}`);
  if (!["boot", "barefoot"].includes(envelope) || envelope !== "boot" && suite !== "posture-hold") throw new Error("an envelope other than the boot requires the posture-hold suite");
  if (!["symmetric", "directional"].includes(actuation)) throw new Error(`unknown actuation ${actuation}`);
  if (!["pinned", "standing"].includes(support)) throw new Error(`unknown support ${support}`);
  if (typeof centreControl !== "boolean" || !(Number.isFinite(continueSeconds) && continueSeconds > 0)) throw new Error("invalid centre control or continuation");
  if ((centreControl || continueSeconds !== 1) && suite !== "point-strike" && suite !== "moving-strike") throw new Error("centre control and continuation require a point-strike suite");
  if (typeof shared !== "boolean" || (shared && suite !== "point-strike" && suite !== "moving-strike")) throw new Error("shared equipment requires a point-strike suite");
  if (!Object.hasOwn(FOUNDATION.split, split)) throw new Error(`unknown split ${split}`);
  if (!Number.isSafeInteger(samples) || samples < 1 || !Number.isSafeInteger(from) || from < 0
    || from + samples > FOUNDATION.maximumSamples) throw new Error("sample range must stay within its split");
  if (!Number.isSafeInteger(hz) || hz < 120 || hz % 120 !== 0) throw new Error("hz must be a positive multiple of 120");
  if (suite === "reach" && hz !== 120) throw new Error("the reach environment runs at 120 Hz");
  if (!models.length || new Set(models).size !== models.length || models.some((m) => !HUMANOID_MODELS.includes(m))) throw new Error("models must name distinct known bodies");
  const jobs = [];
  const add = (job) => {
    const config = { protocol: FOUNDATION.version, split, hz, actuation, ...(jointStops ? { jointStops } : {}), ...job };
    jobs.push({ ...config, id: hash(config) });
  };
  if (suite === "support-entry") {
    if (split !== "development") throw new Error("support entry witnesses have no held-out dataset");
    for (const model of models) for (const direction of [0, 1, 2, 3]) add({ task: "support-entry", model, direction,
      held: "empty", controller: "support-entry", checkpointSeconds: 2, watchSeconds: 40, sampleHz: 120 });
    return jobs;
  }
  if (suite === "posture-hold") {
    if (split !== "development") throw new Error("installed posture holds have no held-out dataset");
    for (const model of models) for (const posture of ["fours", "half-kneel", "squat"]) for (const servoSeconds of [.1, .03, .01]) {
      add({ task: "posture-hold", model, posture, servoSeconds, speed: 10, activation: 1, held: "empty", controller: "direct",
        checkpointSeconds: 2, watchSeconds: 10, sampleHz: 120, ...(envelope === "boot" ? {} : { envelope }) });
    }
    return jobs;
  }
  if (suite === "solver") {
    if (split !== "development") throw new Error("the fixed solver probes have no held-out dataset");
    for (const representation of ["impulse", "multibody"]) for (const sense of [-1, 1]) add({
      task: "solver", model: "synthetic-rotor", held: "none", representation, sense,
      inertia: 0.02, negative: 0.12, positive: 0.24, speed: 1000, limit: 0.6, steps: hz, coastSteps: hz / 10,
    });
    return jobs;
  }
  if (suite === "ccd") {
    for (let index = from; index < from + samples; index++) {
      const seed = FOUNDATION.split[split] + index;
      const fraction = (((seed + 1) * 2654435761) >>> 0) / 4294967296;
      for (const mode of ["linear", "rotate"]) for (const ccd of [false, true]) add({
        task: "ccd", model: "synthetic-bar", held: "free", seed, mode, ccd,
        shieldHeight: 0.25 + (fraction * 2 - 1) * 0.002, shieldSpeed: -1,
        watchSeconds: 5 / 120, sampleHz: 120,
      });
    }
    return jobs;
  }
  if (suite === "defense") {
    for (const model of models) for (const held of ["empty", "club"]) for (let index = from; index < from + samples; index++) {
      const seed = FOUNDATION.split[split] + index, fraction = (((seed + 1) * 2654435761) >>> 0) / 4294967296;
      for (const hands of ["left", "right", "both"]) for (const variant of ["predict", "pose"]) add({
        model, held, task: "defense", seed, hands, variant, offset: (fraction * 2 - 1) * 0.04,
        angleOffset: (fraction * 2 - 1) * 0.1, watchSeconds: 10, checkpointSeconds: 2.5, sampleHz: 120,
      });
    }
    return jobs;
  }
  if (suite === "point-strike" || suite === "moving-strike") {
    for (const model of models) for (const held of shared ? ["club"] : ["empty", "club"]) for (let index = from; index < from + samples; index++) {
      const seed = FOUNDATION.split[split] + index, fraction = (((seed + 1) * 2654435761) >>> 0) / 4294967296;
      for (const hands of shared ? ["both"] : ["left", "right", "both"]) for (const miss of [false, true]) {
        const variants = suite === "moving-strike" && !miss ? [true, false] : [true];
        for (const tracking of variants) for (const release of shared ? [undefined, "left", "right"] : [undefined]) add({ model, held, task: "point-strike", seed, hands, miss,
          offset: (fraction * 2 - 1) * 0.002, watchSeconds: 7 + continueSeconds, checkpointSeconds: 0.5, sampleHz: 120,
          ...(centreControl ? { centreControl } : {}), ...(continueSeconds !== 1 ? { continueSeconds } : {}),
          ...(shared ? { shared: release ? { release } : {} } : {}),
          ...(suite === "moving-strike" ? { swing: { angle: (fraction * 2 - 1) * 0.12, speed: 0.7, delay: 3 * hz / 120, tracking, braking: true } } : {}) });
      }
    }
    return jobs;
  }
  if (suite === "support") {
    for (const model of models) for (let index = from; index < from + samples; index++) {
      const seed = FOUNDATION.split[split] + index, fraction = (((seed + 1) * 2654435761) >>> 0) / 4294967296;
      for (const side of ["left", "right"]) add({ model, held: "empty", task: "support", seed, side,
        liftOffset: (fraction * 2 - 1) * 0.002, watchSeconds: 12, checkpointSeconds: 2, sampleHz: 120, returnTolerance: 0.01 });
    }
    return jobs;
  }
  if (suite === "bar") {
    for (const model of models) for (let index = from; index < from + samples; index++) {
      const seed = FOUNDATION.split[split] + index, fraction = (((seed + 1) * 2654435761) >>> 0) / 4294967296;
      for (const release of ["left", "right"]) add({ model, held: "shared-club", task: "bar", seed, release,
        offset: (fraction * 2 - 1) * 0.005, watchSeconds: 12, checkpointSeconds: 2, sampleHz: 120,
        captureSeconds: 2, trackingTolerance: 0.03, gripTolerance: 0.002,
        ...(support === "standing" ? { support, forceTolerance: 1e-5 } : {}) });
    }
    return jobs;
  }
  for (const model of models) for (const held of ["empty", "club"]) {
    for (let index = from; index < from + samples; index++) {
      const seed = FOUNDATION.split[split] + index;
      const fraction = (((seed + 1) * 2654435761) >>> 0) / 4294967296;
      const degrees = fraction * 360;
      const gap = 3 + fraction * 2;
      const common = { model, held, seed };
      if (suite === "reach" && held === "empty") for (const controller of ["actuator", "layered"])
        add({ ...common, task: "reach", controller, channel: "elbow.right flexion", target: [0.5, 0.7],
          pin: "lowerTrunk", gravity: true, servoSeconds: 0.1, tolerance: 0.025, holdSteps: 120,
          policyPeriodSteps: 4, maxSteps: 360, speed: 3 });
      if (["baseline", "recovery"].includes(suite)) for (const recovery of ["lie", "staged-rise"])
        add({ ...common, task: "recovery", recovery, degrees, impulse: 1.5, watch: FOUNDATION.watch });
      if (["baseline", "strike-block"].includes(suite)) {
        for (const hand of ["left", "right"]) for (const target of ["place", "offset", "miss"])
          add({ ...common, task: "strike", hand, target, across: target === "offset" ? (fraction * 2 - 1) * 0.12 : 0,
            perturbation: { shift: (fraction * 2 - 1) / 240, scale: 1 + (fraction * 2 - 1) * 0.02 }, recover: FOUNDATION.recovery });
        for (const guard of ["pose", "left-cover", "right-cover"])
          add({ ...common, task: "bout", guard, gap, cap: FOUNDATION.bout });
      }
    }
    if (["baseline", "bar", "integrated"].includes(suite)) add({ model, held, task: "unsupported",
      capability: suite === "integrated" ? "integrated recovery and combat" : "shared two-handed item and grip release" });
  }
  return jobs;
}

/** Count over its own denominator, with a Wilson 95% interval; no observations has no rate. */
export function proportion(successes, count) {
  if (!Number.isInteger(count) || !Number.isInteger(successes) || count < 0 || successes < 0 || successes > count) throw new Error("invalid counts");
  if (!count) return { successes, count, rate: null, interval95: null };
  const p = successes / count, z = 1.959963984540054, d = 1 + z * z / count;
  const centre = (p + z * z / (2 * count)) / d, radius = z * Math.sqrt(p * (1 - p) / count + z * z / (4 * count * count)) / d;
  return { successes, count, rate: p, interval95: [Math.max(0, centre - radius), Math.min(1, centre + radius)] };
}

/** Physical readings after a step. Timing is separate from reproducible simulation metrics. */
function meter(builts, bodies) {
  const trace = traceOf(builts), p = new Vector3(), q = new Vector3(), velocity = new Vector3();
  const anchors = builts.flatMap((built) => [...built.joints.values()].map((joint) => {
    const local = (segment) => {
      const frame = segment.frame, d = joint.spec.centre.value.map((v, i) => v - frame.origin[i]);
      return new Vector3(...[frame.x, frame.y, frame.z].map((axis) => axis.reduce((sum, v, i) => sum + v * d[i], 0)));
    };
    return { joint, a: local(joint.parent), b: local(joint.child) };
  }));
  let steps = 0, separation = 0, fastest = 0, contactImpulse = 0, forceIntegral = 0, momentIntegral = 0;
  const samples = [];
  return {
    take(dt) {
      steps++;
      trace.take();
      for (const { joint, a, b } of anchors) {
        a.applyRotationQuaternionToRef(joint.parent.node.rotationQuaternion, p).addInPlace(joint.parent.node.position);
        b.applyRotationQuaternionToRef(joint.child.node.rotationQuaternion, q).addInPlace(joint.child.node.position);
        separation = Math.max(separation, Vector3.Distance(p, q));
      }
      for (const built of builts) for (const segment of built.segments.values()) {
        fastest = Math.max(fastest, segment.body.linearVelocityToRef(velocity).length());
        for (const contact of built.physics.contactsOf(segment.body, (other) => other === null)) contactImpulse += contact.impulse;
      }
      for (const body of bodies) {
        forceIntegral += body.assist.given.force.length() * dt;
        momentIntegral += body.assist.given.moment.length() * dt;
      }
      if (![separation, fastest, contactImpulse, forceIntegral, momentIntegral].every(Number.isFinite)) throw new Error("invalid physical reading");
    },
    time(milliseconds) { samples.push(milliseconds); },
    row() {
      const sorted = [...samples].sort((a, b) => a - b);
      return { physical: { steps, digest: trace.digest(), maxJointAnchorSeparationMetres: separation,
        peakSegmentSpeed: fastest, groundNormalImpulseNs: contactImpulse,
        assistForceIntegralNs: forceIntegral, assistMomentIntegralNms: momentIntegral },
      timing: { instrumented: true, steps: samples.length, meanStepMs: samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : null,
        p99StepMs: sorted.length ? sorted[Math.ceil(sorted.length * 0.99) - 1] : null } };
    },
  };
}

/** Instrument world steps while preserving the original call order and each completed step. */
function instrument(world, readings) {
  const step = world.step;
  world.step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      const start = performance.now();
      step(1);
      readings.time(performance.now() - start);
      readings.take(world.dt);
    }
  };
}

async function recoveryTrial(job) {
  let readings;
  const fall = await felled(job, (built, world) => {
    const body = createMind(built, world, job.recovery === "staged-rise" ? riseMind : RECIPE_FIGHTER,
      { name: "foundation", orders: () => STAND_ORDERS }).body;
    readings = meter([built], [body]);
    instrument(world, readings);
    return body;
  });
  try {
    const outcome = fall.body.view.down ? watchFall(fall.world, fall.built, fall.body, job.watch)
      : { fell: false, risen: false, seconds: null, up: null };
    return { status: "measured", outcome, ...readings.row(), limits: ["standing is not proof of useful control", "no penetrating-depth or motor-work measurement"] };
  } finally { fall.dispose(); }
}

async function strikeTrial(job) {
  const held = heldName(job.held), spec = heldSpec(job.model, held, job.hand);
  const chosen = recipesFor(REPERTOIRE, spec, job.hand).find((c) => c.recipe.band === "high");
  if (!chosen) return { status: "unsupported", reason: "no high-band recipe for this loadout" };
  let readings, first = null, commit = null, thrown = null, steps = 0;
  const outcome = await evaluateBlow({ model: job.model, held, hand: job.hand, hz: job.hz, actuation: job.actuation,
    strike: chosen.strike, ahead: chosen.recipe.place.ahead, dummy: job.target !== "miss",
    off: { along: 0, across: job.across, up: 0 }, seen: true, perturbation: job.perturbation, recover: job.recover,
    trace(body, blow) {
      readings ??= meter([body.built], [body]);
      readings.take(1 / job.hz); steps++;
      first ??= blow.time;
      if (blow.report.strike.phase === "chamber" || blow.report.strike.phase === "swing") commit ??= blow.time;
      if (blow.report.strike.thrown[job.hand] > 0) thrown ??= blow.time;
    } });
  return { status: "measured", outcome: { ...outcome, preparedSeconds: commit === null ? null : commit - first,
    threwAt: thrown, usefulHit: outcome.done > 0, watchedSeconds: steps / job.hz }, ...readings.row(),
    limits: ["offset is a fixed target disclosed at commitment, not a moving target", "no per-step cost in the blow adapter"] };
}

/** Track preparation from the first active phase to chamber/swing; count each commitment once. */
export function attackAccounting() {
  let active = null;
  const preparations = [];
  return {
    take(phase, time) {
      if (!phase) { active = null; return; }
      active ??= { start: time, committed: false };
      if (!active.committed && (phase === "chamber" || phase === "swing")) {
        active.committed = true;
        preparations.push(time - active.start);
      }
    },
    preparations,
  };
}

async function boutTrial(job) {
  const cover = { ...RECIPE_FIGHTER, guard: "cover" };
  const recipe = { left: job.model, right: job.model, gap: job.gap, cap: job.cap,
    held: { left: job.held, right: job.held },
    minds: { left: job.guard === "left-cover" ? cover : RECIPE_FIGHTER, right: job.guard === "right-cover" ? cover : RECIPE_FIGHTER } };
  const bout = await buildBout(recipe, { hz: job.hz, actuation: job.actuation });
  const sides = [bout.duel.duelists.left, bout.duel.duelists.right];
  const readings = meter(sides.map((s) => s.built), sides.map((s) => s.body));
  const attacks = sides.map(() => attackAccounting());
  instrument(bout.world, readings);
  try {
    while (!bout.duel.verdict && bout.world.time < job.cap) {
      bout.world.step();
      sides.forEach((s, i) => attacks[i].take(s.minded.skills.report.strike.phase, bout.world.time));
    }
    const outcome = { seconds: bout.duel.clock, ending: bout.duel.verdict?.ending ?? "time-limit",
      sides: sides.map((s, i) => {
        const contacts = bout.duel.blows.map((b) => b.sides.find((p) => p.fighter === s.id)).filter(Boolean);
        return { fallen: s.body.view.down, preparations: attacks[i].preparations,
          thrown: { ...s.minded.skills.report.strike.thrown },
          headDamage: contacts.filter((p) => p.segment === "head").reduce((sum, p) => sum + p.damage, 0),
          damage: contacts.reduce((sum, p) => sum + p.damage, 0) };
      }) };
    return { status: "measured", outcome, ...readings.row(), limits: ["falls are not classified as caused by an impact or unforced"] };
  } finally { bout.dispose(); }
}

/** A whole trial in one world; unavailable capabilities are explicit rows, never successes. */
export async function foundationTrial(job) {
  switch (job.task) {
    case "recovery": return recoveryTrial(job);
    case "strike": return strikeTrial(job);
    case "bout": return boutTrial(job);
    case "reach": return reachTrial(job);
    case "ccd": return collisionTrial(job);
    case "solver": return solverTrial(job);
    case "bar": return barTrial(job);
    case "support": return supportTrial(job);
    case "posture-hold": return postureHoldTrial(job);
    case "support-entry": return supportEntryTrial(job);
    case "point-strike": return pointStrikeTrial(job);
    case "defense": return defenseTrial(job);
    case "unsupported": return { status: "unsupported", reason: job.capability };
    default: throw new Error(`unknown foundation task ${job.task}`);
  }
}

function replayedProbe(probe, job) {
  const timings = [];
  const startStep = probe.world.steps;
  const stopMeter = job.jointStops ? { steps: 0, nearSteps: 0, activeSteps: 0, rejectedSteps: 0, maxWork: 0, peakForceViolation: 0, peakAccelerationViolation: 0 } : null;
  const sampleStops = () => {
    if (!stopMeter) return;
    const report = probe.body.report().stops;
    stopMeter.steps++;
    if (report.near) stopMeter.nearSteps++;
    if (report.active.length) stopMeter.activeSteps++;
    if (report.status === "rejected") stopMeter.rejectedSteps++;
    stopMeter.maxWork = Math.max(stopMeter.maxWork, report.work);
    stopMeter.peakForceViolation = Math.max(stopMeter.peakForceViolation, report.forceViolation);
    stopMeter.peakAccelerationViolation = Math.max(stopMeter.peakAccelerationViolation, report.accelerationViolation);
  };
  const state = { world: probe.world.state, ...probe.state, ...(stopMeter ? { stopMeter } : {}) };
    if (stopMeter) for (let i = 0; i < job.checkpointSeconds * job.hz; i++) { probe.world.step(); sampleStops(); }
    else probe.world.step(job.checkpointSeconds * job.hz);
    const saved = { physics: probe.world.physics.save(), state: saveState(state) };
    const branch = (timed) => {
      const trace = createHash("sha256");
      while (!probe.complete && probe.world.steps < startStep + job.watchSeconds * job.hz) {
        const start = performance.now(); probe.world.step();
        if (timed) timings.push(performance.now() - start);
        sampleStops();
        if (probe.world.steps % (job.hz / job.sampleHz) === 0) trace.update(JSON.stringify(probe.body.observe()));
      }
      return { digest: trace.digest("hex"), observation: probe.observe(), stateDigest: hash(saveState(state)) };
    };
    const measured = branch(true);
    probe.world.physics.load(saved.physics); loadState(state, saved.state);
    const replay = branch(false), replayExact = hash(replay) === hash(measured), outcome = measured.observation.task;
    timings.sort((a, b) => a - b);
    return { outcome: { ...outcome, replayExact, digest: measured.digest, stateDigest: measured.stateDigest },
      physical: { assistForceIntegralNs: probe.body.assist.meter.force / job.hz, assistMomentIntegralNms: probe.body.assist.meter.moment / job.hz, ...(stopMeter ? { stops: { ...stopMeter } } : {}) },
      timing: { meanStepMs: timings.reduce((sum, v) => sum + v, 0) / timings.length,
        p95StepMs: timings[Math.floor(timings.length * 0.95)], p99StepMs: timings[Math.floor(timings.length * 0.99)] } };
}

async function defenseTrial(job) {
  const engine = await freshEngine(), rendering = new NullEngine(), scene = new Scene(rendering);
  const probe = createDefenseProbe(scene, engine, job);
  try {
    const result = replayedProbe(probe, job), o = result.outcome;
    const success = probe.complete && o.prepared && !o.fell && o.rejectedSteps === 0 && o.replayExact
      && o.protectedImpulse === 0 && o.guards.every((g) => g.qualifyingContacts > 0);
    return { status: "measured", configuration: probe.configuration, ...result, outcome: { ...o, success },
      limits: ["gravity-driven hinged clubs; not opponent combat", "protected head and upper trunk; other contacts remain reported",
        "summed impulses include sustained loading and are not damage", "necessary reach/time filters do not certify feasibility",
        job.jointStops ? "local near-stop end-step prediction; no distant-impact or sliding model" : "no joint-stop reaction or sliding prediction", "allocating diagnostic dynamics path"] };
  } finally { probe.dispose(); scene.dispose(); rendering.dispose(); }
}

async function pointStrikeTrial(job) {
  const engine = await freshEngine(), rendering = new NullEngine(), scene = new Scene(rendering);
  const probe = createPointStrikeProbe(scene, engine, job);
  try {
    const result = replayedProbe(probe, job), o = result.outcome, settings = probe.configuration.settings;
    const success = probe.complete && !o.fell && o.rejectedSteps === 0 && o.replayExact
      && (!job.shared || o.shared.captured >= 0 && o.shared.peakGripGap < probe.configuration.sharedSettings.gripTolerance && (job.miss || o.shared.sharedHits > 0)
        && (!job.shared.release || o.shared.releasedAt >= 0 && o.shared.releaseContinuous))
      && o.strikes.every((s) => s.returnError < settings.tolerance && (!job.swing || s.targetTravel > 0.1 && s.targetSpeed > 0.5) && (job.miss ? s.contacts === 0
        : s.contacts > 0 && s.peakImpulse > 0 && s.closing > settings.closing));
    return { status: "measured", configuration: probe.configuration, ...result, outcome: { ...o, success },
      limits: [job.swing ? "freely swinging targets; not defense or opponent combat" : "stationary rigid targets; not defense or opponent combat", "position-only guard and return", "no damage or minimum injury-energy gate",
        job.jointStops ? "local near-stop end-step prediction; no distant-impact or sliding model" : "no joint-stop reaction or sliding prediction", "allocating diagnostic dynamics path"] };
  } finally { probe.dispose(); scene.dispose(); rendering.dispose(); }
}

async function supportTrial(job) {
  const engine = await freshEngine(), rendering = new NullEngine(), scene = new Scene(rendering);
  const probe = createSupportProbe(scene, engine, job);
  try {
    const result = replayedProbe(probe, job), o = result.outcome, settings = probe.configuration.settings;
    const success = probe.complete && !o.fell && o.rejectedSteps === 0 && o.replayExact
      && o.peakLift > settings.lift + job.liftOffset - settings.liftTolerance
      && o.flightSteps >= settings.holdSeconds * job.hz && o.returnError < job.returnTolerance
      && o.peakTension <= settings.contact.forceTolerance && o.peakFrictionViolation <= settings.contact.forceTolerance;
    return { status: "measured", configuration: probe.configuration, ...result, outcome: { ...o, success },
      limits: ["initially standing and empty handed; not recovery or locomotion", "horizontal fixed ground", "joint-stop reactions are not predicted", "allocating diagnostic dynamics path"] };
  } finally { probe.dispose(); scene.dispose(); rendering.dispose(); }
}

async function postureHoldTrial(job) {
  if (job.model !== "workshop-fighter") return { status: "unsupported", reason: "no installed posture witness for this body" };
  const engine = await freshEngine(), rendering = new NullEngine(), scene = new Scene(rendering);
  const probe = createPostureHoldProbe(scene, engine, { ...job, ...postureStart(job.envelope ?? "boot", job.posture) });
  try {
    const result = replayedProbe(probe, job), outcome = result.outcome;
    return { status: "measured", configuration: probe.configuration, ...result, outcome: { ...outcome, success: outcome.success && outcome.replayExact },
      limits: [job.envelope ? "the statics' barefoot witness as the start, the boot's mass properties" : "installed empty-handed Warrior pose; no entry, recovery or disturbance", "direct joint feedback without root or contact planning",
        "maximum segment drift includes startup", "fixed development witnesses; no held-out evaluation"] };
  } finally { probe.dispose(); scene.dispose(); rendering.dispose(); }
}

async function supportEntryTrial(job) {
  if (job.model !== "workshop-fighter") return { status: "unsupported", reason: "no support entry witness for this body" };
  const engine = await freshEngine(), rendering = new NullEngine(), scene = new Scene(rendering);
  const probe = createSupportEntryProbe(scene, engine, job);
  try {
    const result = replayedProbe(probe, job), outcome = result.outcome;
    return { status: "measured", configuration: probe.configuration, ...result, outcome: { ...outcome, success: outcome.success && outcome.replayExact },
      limits: ["empty-handed Warrior; no kneeling, standing or useful-control handover", "four fixed development shove directions; no held-out evaluation",
        "forty-second watch starts after the physical fall bootstrap", "ten-second drift gate begins after two seconds of quiet measured support"] };
  } finally { probe.dispose(); scene.dispose(); rendering.dispose(); }
}

async function barTrial(job) {
  const engine = await freshEngine(), rendering = new NullEngine(), scene = new Scene(rendering);
  const probe = createBarProbe(scene, engine, job);
  try {
    const result = replayedProbe(probe, job), outcome = result.outcome;
    const success = outcome.complete && outcome.captured >= 0 && outcome.captured < job.captureSeconds * job.hz
      && outcome.movedError !== null && outcome.movedError < job.trackingTolerance
      && outcome.finalError < job.trackingTolerance && outcome.peakGripGap < job.gripTolerance
      && outcome.contactSteps > 0 && outcome.releaseContinuous && outcome.replayExact && outcome.rejectedSteps === 0
      && (job.support !== "standing" || (!outcome.fell && outcome.supportSteps > 0
        && outcome.peakTension <= job.forceTolerance && outcome.peakFrictionViolation <= job.forceTolerance));
    return { status: "measured", configuration: probe.configuration, ...result,
      outcome: { ...outcome, success },
      limits: [job.support === "standing" ? "measured fixed sticking contacts; no sliding or contact acquisition model" : "pelvis pinned; not standing",
        "not recovery or combat", "return tracks position alone", job.jointStops ? "local near-stop end-step prediction; no distant-impact model" : "joint-stop reactions are not predicted", "allocating diagnostic dynamics path"] };
  } finally { probe.dispose(); scene.dispose(); rendering.dispose(); }
}

async function collisionTrial(job) {
  const engine = await freshEngine(), rendering = new NullEngine(), scene = new Scene(rendering);
  const probe = createCollisionProbe(scene, engine, job), frames = [], timings = [];
  let firstContactStep = null;
  try {
    const saved = { physics: probe.world.physics.save(), state: saveState(probe.world.state) };
    const observe = () => {
      const row = probe.observe();
      if (firstContactStep === null && row.contacts.some((c) => c.shield && c.impulse > 0)) firstContactStep = row.steps;
      return row;
    };
    const steps = Math.round(job.watchSeconds * job.hz), spacing = job.hz / job.sampleHz;
    for (let i = 0; i < steps; i++) {
      const start = performance.now(); probe.world.step(); timings.push(performance.now() - start);
      const row = observe();
      if ((i + 1) % spacing === 0) frames.push(row);
    }
    const end = probe.observe();
    probe.world.physics.load(saved.physics);
    loadState(probe.world.state, saved.state);
    const replay = [];
    for (let i = 0; i < steps; i++) { probe.world.step(); if ((i + 1) % spacing === 0) replay.push(probe.observe()); }
    return { status: "measured", outcome: { contacted: firstContactStep !== null, firstContactStep,
      firstContactSeconds: firstContactStep === null ? null : firstContactStep / job.hz,
      replayExact: hash(frames) === hash(replay), digest: hash(frames), end, frames },
      timing: { steps, meanStepMs: timings.reduce((sum, t) => sum + t, 0) / steps },
      limits: ["synthetic free bodies, no character/controller claim", "contact impulse reads are not integrated contact work",
        "CCD clamping may lose motion before the next step reports a contact", "traces sampled at 120 Hz; contact onset checked each physics step"] };
  } finally { probe.dispose(); scene.dispose(); rendering.dispose(); }
}

async function reachTrial(job) {
  const engine = await freshEngine(), rendering = new NullEngine(), scene = new Scene(rendering);
  let readings;
  const config = { model: job.model, controller: job.controller, actuation: job.actuation, gravity: job.gravity,
    pin: job.pin, channel: job.channel, target: job.target, servoSeconds: job.servoSeconds,
    tolerance: job.tolerance, holdSteps: job.holdSteps, engineRevision: engine.revision };
  const environment = createEnvironment(config, (settings, random) => {
    const task = createReachTask(scene, engine, settings, random);
    readings = meter([task.body.built], [task.body]);
    instrument(task.world, readings);
    return task;
  }, { policyPeriodSteps: job.policyPeriodSteps, maxSteps: job.maxSteps });
  try {
    let result = environment.reset(job.seed);
    const goal = result.observation.goal, frames = [];
    while (!result.terminated && !result.truncated && result.invalid === null) {
      if (result.decisionDue) environment.act(reachAction(result.observation, job.controller, job.servoSeconds, job.speed));
      result = environment.step(1);
      frames.push(reachFrame(result));
    }
    return { status: "measured", outcome: { goal, seconds: result.steps / 120, steps: result.steps,
      terminated: result.terminated, truncated: result.truncated, invalid: result.invalid, ...result.metrics,
      observationDigest: createHash("sha256").update(frames.join("\n")).digest("hex") }, ...readings.row(),
      limits: ["pinned lower trunk: no standing or combat claim", "pin reactions and actuator work are not measured"] };
  } finally { environment.dispose(); scene.dispose(); rendering.dispose(); }
}
