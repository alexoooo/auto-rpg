/**
 * **The stride beside a person's walk**, on the locomotion test bed's setup (the Lab's Run on the
 * forward line, Node stand, Rapier, 120 Hz, no wind): per step, from a landing to the next,
 *
 * - each leg joint's power, the delivered torque (`MuscleDriver.pulled`) times the joint's speed,
 *   summed over both legs: its positive and negative work, J/kg, and each joint's share of the
 *   positive work;
 * - the ground's fore-aft impulse, from the body's momentum: braking and propulsion, N s/kg;
 * - the centre of mass's rise and fall, m;
 * - the share of the time on both feet;
 * - the bearing ankle's peak plantarflexion moment, N m/kg, and where in its stance it comes;
 * - the step's length and rate beside a person's at the speed reached (`personStep`).
 *
 *   node research/gait-audit.mjs [--models workshop-fighter,workshop-rogue] [--paces 0.95,1.2]
 *     [--seconds 14] [--from 4] [--stride '{"push":0}'] [--workers 4]
 *
 * A person, as read in this session:
 *
 * - Positive work a step at natural cadence (Winter 1983, 15 adults, inverse dynamics, as Baker's
 *   gait teach-in tabulates it, clinicalgaitanalysis.com/teach-in/speed): the ankle's push-off
 *   0.21 J/kg (54 %), the hip 0.12 J/kg (31 %), the knee 0.06 J/kg (15 %), 0.39 J/kg in all; the
 *   ankle's push-off is 60 to 70 % of the forward propulsive power.
 * - Rota, Caronni, Scarano, Amadei and Tesio 2025, "Plantar flexors are the main engine of walking
 *   in healthy adults", Front. Sports Act. Living 7:1595065: a stride takes 1.09 s at 1.2 m/s, and
 *   between 1.0 and 1.5 m/s the ankle gives 51 % of a leg's positive power and the hip 33 % (a study
 *   it cites).
 * - The ankle's peak power is about 2.5 W/kg (Wang et al. 2019, J NeuroEng Rehabil 16:130).
 *
 * The ankle's peak moment (about 1.2 to 1.4 N m/kg), the 20 % of a cycle on both feet and the rise
 * and fall of 4 to 5 cm were not confirmed from a primary source in this session; the summary
 * prints them as unconfirmed.
 */
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

/** The straight line walked: forward, facing +z, 80 m. */
const LINE = { pieces: [{ kind: "corner", metres: 0, turn: 0 }, { kind: "straight", metres: 80 }], facing: 0 };
/** The ground's side, m. */
const GROUND = 200;
/** A person's figures this compares with: confirmed (`PERSON.confirmed`) and not (`PERSON.unconfirmed`). */
const PERSON = {
  confirmed: { work: { ankle: 0.21, hip: 0.12, knee: 0.06 }, share: { ankle: 0.54, hip: 0.31, knee: 0.15 } },
  unconfirmed: { anklePeak: "1.2-1.4 N m/kg", double: "0.2 of a cycle", rise: "0.04-0.05 m" },
};

const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const round = (x, k = 3) => x === null || x === undefined || !Number.isFinite(x) ? null : +x.toFixed(k);

async function runOnce({ model, pace, seconds, from, stride }) {
  const [{ modelSpec }, { labActor }, { startRun }, { trackOf }, { LAB_PRESETS }, { coreStand }, { STRIDE }, { massCentreToRef }, { personStep }] = await Promise.all([
    import("../src/core/models.ts"), import("../src/lab/actor.ts"), import("../src/lab/run-mode.ts"), import("../src/lab/track.ts"),
    import("../src/lab/scenarios.ts"), import("../tests/harness/core-stand.mjs"), import("../src/core/skills/stride.ts"),
    import("../src/core/control/support.ts"), import("../src/core/human/gait.ts"),
  ]);
  const stand = await coreStand(modelSpec(model), { ground: true, groundSize: GROUND });
  const mind = { ...LAB_PRESETS.script.config, locomotion: { kind: "stride", ...STRIDE, ...stride } };
  const run = startRun(labActor(stand.built, stand.world, { mind, measuring: true }), trackOf(LINE.pieces), { top: pace, facing: LINE.facing });
  const { body } = run, muscles = body.muscles, reading = body.view.stance, dt = stand.world.dt;
  const segments = [...stand.built.segments.values()], mass = segments.reduce((s, x) => s + x.rigid.mass, 0);
  const legs = muscles.channels.flatMap((c, i) => {
    const m = /^(hip|knee|ankle)\.(left|right) (.*)$/.exec(c.name);
    return m ? [{ i, joint: m[1], side: m[2], plantar: m[1] === "ankle" && m[3] === "dorsiflexion" }] : [];
  });
  const centre = new Vector3(), velocity = new Vector3(), p = new Vector3();
  const steps = [];
  let step = null, last = null, swung = null;
  const open = (time, foot) => ({ start: time, foot, from: null, work: { hip: [0, 0], knee: [0, 0], ankle: [0, 0] }, brake: 0, push: 0,
    low: Infinity, high: -Infinity, double: 0, n: 0, ankle: { peak: 0, at: 0 }, place: null });
  const hook = stand.world.afterStep(() => {
    const time = stand.world.time;
    massCentreToRef(segments, mass, centre, p, velocity);
    const v = { ahead: velocity.z, up: velocity.y };
    const phase = reading.phase;
    // A step runs from one landing to the next: the swing's foot coming down.
    const landed = swung !== null && phase !== "swing";
    if (phase === "swing" && body.state.mind.host.motor.stance.step.swing) swung = body.state.mind.host.motor.stance.step.swing.foot;
    if (landed) {
      const sole = reading.soles[swung];
      if (step && time >= from && !body.view.down) { step.end = time; step.place = sole.z; steps.push(step); }
      step = open(time, swung);
      step.from = sole.z;
      swung = null;
    }
    if (step && last && !body.view.down) {
      step.n++;
      if (phase !== "swing") step.double++;
      for (const c of legs) {
        const power = muscles.pulled[c.i] * muscles.speed(c.i) * dt / mass;
        step.work[c.joint][power > 0 ? 0 : 1] += power;
      }
      const ahead = mass * (v.ahead - last.ahead) / dt;
      if (ahead > 0) step.push += ahead * dt / mass; else step.brake -= ahead * dt / mass;
      step.low = Math.min(step.low, centre.y);
      step.high = Math.max(step.high, centre.y);
      // The bearing ankle's plantarflexion moment: the leg whose foot is not swinging, its dorsiflexion channel's torque turned.
      const bearing = phase === "swing" ? (swung === "left" ? "right" : "left") : null;
      for (const c of legs) if (c.plantar && c.side === bearing) {
        const moment = -muscles.pulled[c.i] / mass;
        if (moment > step.ankle.peak) { step.ankle.peak = moment; step.ankle.at = step.n; }
      }
    }
    last = v;
  });
  let frame = run.frame();
  try {
    while (frame.time < seconds && !frame.fallen) { stand.step(stand.seconds(0.1)); frame = run.frame(); }
  } finally { hook.dispose(); run.dispose(); stand.dispose(); }
  const done = steps.filter((s) => s.n > 0), length = mean(done.map((s) => Math.abs(s.place - s.from))), period = mean(done.map((s) => s.end - s.start));
  const work = (joint, k) => mean(done.map((s) => s.work[joint][k]));
  const positive = { hip: work("hip", 0), knee: work("knee", 0), ankle: work("ankle", 0) }, all = positive.hip + positive.knee + positive.ankle;
  const speed = frame.mean, person = personStep(speed ?? 0);
  return {
    model, pace, fell: frame.fallen ? round(frame.time, 2) : null, speed: round(speed), steps: done.length,
    work: Object.fromEntries(["hip", "knee", "ankle"].map((j) => [j, { positive: round(positive[j]), negative: round(work(j, 1)), share: round(positive[j] / all, 2) }])),
    impulse: { brake: round(mean(done.map((s) => s.brake))), push: round(mean(done.map((s) => s.push))) },
    rise: round(mean(done.map((s) => s.high - s.low))),
    double: round(mean(done.map((s) => s.double / s.n)), 2),
    ankle: { peak: round(mean(done.map((s) => s.ankle.peak)), 2), at: round(mean(done.map((s) => s.ankle.at / s.n)), 2) },
    step: { length: round(length), rate: round(1 / period, 2), person: { length: round(person.length), rate: round(person.rate, 2) } },
  };
}

if (!isMainThread) {
  parentPort.on("message", async (job) => {
    try { parentPort.postMessage({ id: job.id, result: await runOnce(job) }); }
    catch (error) { parentPort.postMessage({ id: job.id, error: String(error?.stack ?? error) }); }
  });
} else {
  const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
  const models = arg("models", "workshop-fighter,workshop-rogue").split(","), paces = arg("paces", "0.95,1.2").split(",").map(Number);
  const seconds = Number(arg("seconds", "14")), from = Number(arg("from", "4")), stride = JSON.parse(arg("stride", "{}"));
  const workers = Math.min(Number(arg("workers", String(Math.max(1, availableParallelism() - 2)))), 64);
  const jobs = [];
  for (const model of models) for (const pace of paces) jobs.push({ id: jobs.length, model, pace, seconds, from, stride });
  const results = [];
  await new Promise((resolve, reject) => {
    let next = 0, done = 0;
    const pool = Array.from({ length: Math.min(workers, jobs.length) }, () => new Worker(fileURLToPath(import.meta.url)));
    const feed = (worker) => { if (next < jobs.length) worker.postMessage(jobs[next++]); };
    for (const worker of pool) {
      worker.on("message", ({ id, result, error }) => {
        if (error) { pool.forEach((w) => w.terminate()); reject(new Error(error)); return; }
        results[id] = result;
        if (++done === jobs.length) { pool.forEach((w) => w.terminate()); resolve(); } else feed(worker);
      });
      worker.on("error", reject);
      feed(worker);
    }
  });
  console.log(`Node stand, Rapier, 120 Hz, no wind, the stride on the forward line, ${seconds} s, steps from ${from} s`);
  console.log(`A person (Winter 1983): positive work a step ankle ${PERSON.confirmed.work.ankle}, hip ${PERSON.confirmed.work.hip}, knee ${PERSON.confirmed.work.knee} J/kg`
    + ` (shares ${PERSON.confirmed.share.ankle}/${PERSON.confirmed.share.hip}/${PERSON.confirmed.share.knee}); unconfirmed: ankle peak ${PERSON.unconfirmed.anklePeak},`
    + ` both feet ${PERSON.unconfirmed.double}, rise and fall ${PERSON.unconfirmed.rise}`);
  for (const r of results) {
    console.log(`\n${r.model} asked ${r.pace}: ${r.fell === null ? "held" : `fell at ${r.fell} s`}, ${r.speed} m/s reached, ${r.steps} steps`);
    console.log(`  positive/negative work a step, J/kg (share of positive): ${["ankle", "hip", "knee"].map((j) => `${j} ${r.work[j].positive}/${r.work[j].negative} (${r.work[j].share})`).join("; ")}`);
    console.log(`  fore-aft impulse a step, N s/kg: braking ${r.impulse.brake}, propulsion ${r.impulse.push}`);
    console.log(`  centre of mass rise and fall ${r.rise} m; on both feet ${r.double} of the time; ankle peak ${r.ankle.peak} N m/kg at ${r.ankle.at} of the step`);
    console.log(`  step ${r.step.length} m at ${r.step.rate} a second; a person at this speed ${r.step.person.length} m at ${r.step.person.rate}`);
  }
}
