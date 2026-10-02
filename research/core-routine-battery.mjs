/**
 * The lab routine (`src/lab/routine.ts`) run from seeded starts, per stance tuning: each run
 * strikes at `--targets` targets a loop (the Routine's ten unless given; none is the walk alone)
 * drawn from its seed, pushes the middle trunk at 0.5 s by `--impulse` N s (default 3) in a
 * direction the seed picks (the golden angle times the seed), then runs up to `--loops` loops (default 5), a fall (the lower
 * trunk under 0.5 m) or `LOOP_SECONDS` a loop. Each run on a worker of its own stand (Node core
 * stand, Rapier). Prints, per tuning and human, the loops completed of those possible, the runs
 * that stood through, where the falls came (what the routine was doing), and for each strike
 * thrown at a target how many landed a blow, its peak fist speed (mean and least, m/s) and where
 * the head stood from its recipe's place (least and most, cm, each way). What the strikes did to their targets is
 * `research/core-targets.mjs`'s to tell.
 *
 *   node research/core-routine-battery.mjs --variants '[{}, {"boundedSwing": false}]' [--seeds 12] [--loops 5] [--targets 10] [--hz 120] [--impulse 3] [--workers 14] [--list]
 *
 * `--list` prints each run's seed, loops and fall too.
 */

/** Seconds a loop may take before the run is called stuck: a loop of ten targets is about 65 s. */
const LOOP_SECONDS = 120;
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import { BODY_MODELS } from "../src/core/human/spec.ts";

if (isMainThread) {
  const { values } = parseArgs({ options: {
    variants: { type: "string", default: "[{}]" }, seeds: { type: "string", default: "12" }, loops: { type: "string", default: "5" },
    impulse: { type: "string", default: "3" }, targets: { type: "string" }, hz: { type: "string", default: "120" }, workers: { type: "string" },
    models: { type: "string", default: "workshop-rogue,workshop-fighter" }, list: { type: "boolean", default: false },
  } });
  const variants = JSON.parse(values.variants), models = values.models.split(","), seeds = Number(values.seeds);
  for (const model of models) if (!BODY_MODELS.includes(model)) throw new Error(`--models names no body: ${model} (one of ${BODY_MODELS.join(", ")})`);
  const loops = Number(values.loops), targets = values.targets === undefined ? undefined : Number(values.targets), impulse = Number(values.impulse), hz = Number(values.hz);
  const lanes = Number(values.workers ?? Math.max(1, availableParallelism() - 2));
  const jobs = [];
  variants.forEach((stance, v) => { for (const model of models) for (let seed = 1; seed <= seeds; seed++) jobs.push({ v, model, seed, stance, loops, targets, impulse, hz }); });
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
  console.log(`Lab routine from ${seeds} seeded starts (${impulse} N s at 0.5 s), up to ${loops} loops of ${targets ?? "its own"} targets, each run's its seed's; Node core stand, Rapier, ${hz} Hz`);
  variants.forEach((stance, v) => {
    for (const model of models) {
      const mine = jobs.filter((job) => job.v === v && job.model === model), runs = mine.map((job) => job.result);
      if (values.list) console.log(mine.map((job) => `  seed ${job.seed}: ${job.result.loops}${job.result.fell ? ` fell ${job.result.fell}` : ""}${job.result.stuck ? " stuck" : ""}`).join("\n"));
      const falls = new Map();
      for (const run of runs) if (run.fell) falls.set(run.fell, (falls.get(run.fell) ?? 0) + 1);
      console.log(`${JSON.stringify(stance)} ${model}: ${runs.reduce((sum, run) => sum + run.loops, 0)} of ${runs.length * loops} loops, `
        + `${runs.filter((run) => !run.fell).length} of ${runs.length} stood through; falls ${[...falls].map(([at, n]) => `${at} ${n}`).join(", ") || "none"}`
        + `; stuck ${runs.filter((run) => run.stuck).length}`);
      const strikes = Map.groupBy(runs.flatMap((run) => run.strikes), (s) => s.name);
      for (const [name, all] of strikes) {
        const peaks = all.map((s) => s.peak);
        const range = (way) => `${(100 * Math.min(...all.map((s) => s.off[way]))).toFixed(1)} to ${(100 * Math.max(...all.map((s) => s.off[way]))).toFixed(1)}`;
        console.log(`    ${name}: ${all.length} thrown, ${all.filter((s) => s.landed).length} landed, peak ${(peaks.reduce((a, b) => a + b, 0) / peaks.length).toFixed(2)} mean, `
          + `${Math.min(...peaks).toFixed(2)} least; off ${range("along")} along, ${range("across")} across`);
      }
    }
  });
} else {
  const [{ Logger }, { Vector3 }, { modelSpec }, { labActor }, { startRoutine }, { coreStand }] = await Promise.all([
    import("@babylonjs/core/Misc/logger.js"), import("@babylonjs/core/Maths/math.vector.js"), import("../src/core/human/spec.ts"),
    import("../src/lab/actor.ts"), import("../src/lab/routine.ts"), import("../tests/harness/core-stand.mjs")]);
  Logger.LogLevels = Logger.ErrorLogLevel;
  parentPort.on("message", async ({ model, seed, stance, loops, targets, impulse, hz }) => {
    try {
      const stand = await coreStand(modelSpec(model), { ground: true, hz });
      const routine = startRoutine(labActor(stand.built, stand.world, { stance }), { seed, targets });
      const lower = stand.built.segments.get("lowerTrunk"), middle = stand.built.segments.get("middleTrunk");
      const way = (seed * 2.399963) % (2 * Math.PI), push = stand.seconds(0.5), most = stand.seconds(LOOP_SECONDS * loops);
      let fell = null, doing = routine.doing();
      for (let t = 0; routine.tactics.loops < loops && t < most; t++) {
        if (t === push) middle.body.applyImpulse(new Vector3(impulse * Math.sin(way), 0, impulse * Math.cos(way)), middle.node.position);
        stand.step(1);
        // What it was doing as it began to fall.
        if (!routine.body.view.down) doing = routine.doing();
        if (lower.node.position.y < 0.5) { fell = `${doing} at ${routine.time().toFixed(1)} s`; break; }
      }
      const result = {
        loops: routine.tactics.loops, fell, stuck: !fell && routine.tactics.loops < loops,
        strikes: routine.readings.flatMap((r) => r.strike ? [{ name: r.strike.name, peak: r.strike.peak, off: { ...r.strike.off }, landed: r.blow !== null }] : []),
      };
      routine.dispose();
      stand.dispose();
      parentPort.postMessage({ result });
    } catch (error) { parentPort.postMessage({ error: String(error?.stack ?? error) }); }
  });
}
