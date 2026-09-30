/**
 * The lab routine (`src/core-lab/routine.ts`) run from seeded starts, per stance tuning: each run
 * pushes the middle trunk at 0.5 s by `--impulse` N s (default 3) in a direction the seed picks (the
 * golden angle times the seed), then runs up to `--loops` loops (default 5) or a fall (the lower
 * trunk under 0.5 m). Each run on a worker of its own stand (Node core stand, Rapier). Prints, per
 * tuning and human, the loops completed of those possible, the runs that stood through, and where
 * the falls came (the routine's step index and kind).
 *
 *   node research/core-routine-battery.mjs --variants '[{}, {"boundedSwing": false}]' [--seeds 12] [--loops 5] [--hz 120] [--workers 14]
 */
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";

if (isMainThread) {
  const { values } = parseArgs({ options: {
    variants: { type: "string", default: "[{}]" }, seeds: { type: "string", default: "12" }, loops: { type: "string", default: "5" },
    impulse: { type: "string", default: "3" }, hz: { type: "string", default: "120" }, workers: { type: "string" },
    models: { type: "string", default: "workshop-rogue,workshop-fighter" },
  } });
  const variants = JSON.parse(values.variants), models = values.models.split(","), seeds = Number(values.seeds);
  const loops = Number(values.loops), impulse = Number(values.impulse), hz = Number(values.hz);
  const lanes = Number(values.workers ?? Math.max(1, availableParallelism() - 2));
  const jobs = [];
  variants.forEach((stance, v) => { for (const model of models) for (let seed = 1; seed <= seeds; seed++) jobs.push({ v, model, seed, stance, loops, impulse, hz }); });
  const started = Date.now();
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(lanes, jobs.length) }, () => new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url));
    const feed = () => {
      if (next >= jobs.length) { worker.terminate(); resolve(); return; }
      const id = next++;
      worker.once("message", ({ result, error }) => {
        if (error) { reject(new Error(error)); return; }
        jobs[id].result = result;
        if (++done % 10 === 0) process.stderr.write(`${done}/${jobs.length} in ${((Date.now() - started) / 1000).toFixed(0)} s\n`);
        feed();
      });
      worker.postMessage(jobs[id]);
    };
    feed();
  })));
  console.log(`Lab routine from ${seeds} seeded starts (${impulse} N s at 0.5 s), up to ${loops} loops; Node core stand, Rapier, ${hz} Hz`);
  variants.forEach((stance, v) => {
    for (const model of models) {
      const runs = jobs.filter((job) => job.v === v && job.model === model).map((job) => job.result);
      const falls = new Map();
      for (const run of runs) if (run.fell) falls.set(run.fell, (falls.get(run.fell) ?? 0) + 1);
      console.log(`${JSON.stringify(stance)} ${model}: ${runs.reduce((sum, run) => sum + run.loops, 0)} of ${runs.length * loops} loops, `
        + `${runs.filter((run) => !run.fell).length} of ${runs.length} stood through; falls ${[...falls].map(([at, n]) => `${at} ${n}`).join(", ") || "none"}`);
    }
  });
} else {
  const [{ Logger }, { Vector3 }, { humanSpec }, { startRoutine, ROUTINE }, { coreStand }] = await Promise.all([
    import("@babylonjs/core/Misc/logger.js"), import("@babylonjs/core/Maths/math.vector.js"), import("../src/core/human/spec.ts"),
    import("../src/core-lab/routine.ts"), import("../tests/harness/core-stand.mjs")]);
  Logger.LogLevels = Logger.ErrorLogLevel;
  parentPort.on("message", async ({ model, seed, stance, loops, impulse, hz }) => {
    try {
      const stand = await coreStand(humanSpec(model), { ground: true, hz });
      const routine = startRoutine(stand.built, stand.world, ROUTINE, stance);
      const lower = stand.built.segments.get("lowerTrunk"), middle = stand.built.segments.get("middleTrunk");
      const way = (seed * 2.399963) % (2 * Math.PI), push = stand.seconds(0.5);
      let loop = 0, last = 0, fell = null;
      for (let t = 0; loop < loops; t++) {
        if (t === push) middle.body.applyImpulse(new Vector3(impulse * Math.sin(way), 0, impulse * Math.cos(way)), middle.node.position);
        stand.step(1);
        const s = routine.state();
        if (s.stepIndex < last) loop++;
        last = s.stepIndex;
        if (lower.node.position.y < 0.5) { fell = `${s.stepIndex}:${s.step.kind}`; break; }
      }
      routine.dispose();
      stand.dispose();
      parentPort.postMessage({ result: { loops: loop, fell } });
    } catch (error) { parentPort.postMessage({ error: String(error?.stack ?? error) }); }
  });
}
