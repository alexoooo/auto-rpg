/**
 * **What splitting the minds off the world's thread could give** the crowd fight, read before it is
 * built ([minds in parallel](../docs/plans/2026-11-01-parallel-minds.md), step 1): `--threads`
 * worker threads at once, each playing a whole copy of the crowd fight (`crowdFight`, ten Option
 * Mind Warriors), every thread loaded as the split would load the machine. In each, every step is
 * timed whole, the solver's part (`PhysicsWorld.step`) and each body's mind (`Mind.step`: its decisions, skills and motor control) on its
 * own (`research/mind-split-hook.mjs`); the world's part is the step less its minds' (senses,
 * muscles, Rapier, contacts, blows, rules).
 *
 * The step the split would take with `n` mind threads, the bodies dealt round them in turn, is
 * `max(world's part, the dearest thread's minds) + handoff` (`--handoff`, ms: the shared-memory
 * handoff measured spinning, 21 to 23 µs a step). It is read with `n` one less than the threads
 * loaded (a world thread and `n` mind threads), on each copy's own steps, from `--skip` s on; the
 * least over the copies of each figure is printed beside their median, and each copy's worst lag
 * behind real time (`lagOf`, `research/lag.mjs`).
 *
 *   node research/mind-split.mjs [--threads 1,3,4,5] [--cap 60] [--seed 0] [--warm 10] [--skip 2] [--handoff 0.022]
 *
 * Pin it from the shell (`cmd /c start /affinity 55555555 /wait /b node ...`, one logical
 * processor a core): Node cannot pin a thread. Wall time on the machine it runs on: read it on a
 * quiet one. Node, core world, `BOUT_ENGINE`, 120 Hz.
 */
import { register } from "node:module";
import { parseArgs } from "node:util";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

const DT = 1000 / 120;

if (!isMainThread) {
  register("./mind-split-hook.mjs", import.meta.url);
  await import("../tests/harness/preload-data.mjs");
  const { Logger } = await import("@babylonjs/core/Misc/logger.js");
  const { crowdFight } = await import("../src/arena/team-bout.ts");
  const { buildTeamBout } = await import("../src/evaluation/bout.ts");
  const { BOUT_ENGINE } = await import("./bout.mjs");
  Logger.LogLevels = Logger.NoneLogLevel;
  const { seed, cap, warm } = workerData;
  /** One playing to its verdict or `seconds`: each step's wall time, and each body's mind's, ms. */
  const play = async (seconds) => {
    const { world, bout, dispose } = await buildTeamBout({ ...crowdFight(seed), capSeconds: seconds }, { engine: BOUT_ENGINE });
    const index = new Map(), now = new Float64Array(16), totals = [], minds = [], solvers = [];
    const solve = world.physics.step.bind(world.physics);
    let solver = 0;
    world.physics.step = (dt) => { const t = performance.now(); solve(dt); solver = performance.now() - t; };
    globalThis.__mindTime = (built, ms) => {
      if (!index.has(built)) index.set(built, index.size);
      now[index.get(built)] += ms;
    };
    while (bout.verdict === null) {
      now.fill(0);
      const t = performance.now();
      world.step();
      totals.push(performance.now() - t);
      solvers.push(solver);
      minds.push(Array.from(now.subarray(0, index.size)));
    }
    dispose();
    return { totals, minds, solvers, bodies: index.size };
  };
  await play(warm);
  parentPort.postMessage({ ready: true });
  await new Promise((resolve) => parentPort.once("message", resolve));
  parentPort.postMessage(await play(cap));
} else {
  const { values } = parseArgs({ options: {
    threads: { type: "string", default: "1,3,4,5" }, cap: { type: "string", default: "60" }, seed: { type: "string", default: "0" },
    warm: { type: "string", default: "10" }, skip: { type: "string", default: "2" }, handoff: { type: "string", default: "0.022" },
  } });
  const { lagOf } = await import("./lag.mjs");
  const cap = Number(values.cap), seed = Number(values.seed), warm = Number(values.warm), skip = Math.round(Number(values.skip) * 120), handoff = Number(values.handoff);

  /** `count` copies played at once, started together after each warmed its compiler on a playing of its own. */
  const together = async (count) => {
    const workers = Array.from({ length: count }, () => new Worker(new URL(import.meta.url), { workerData: { seed, cap, warm } }));
    const ready = workers.map((worker) => new Promise((resolve, reject) => { worker.once("message", resolve); worker.once("error", reject); }));
    await Promise.all(ready);
    const done = workers.map((worker) => new Promise((resolve, reject) => { worker.once("message", resolve); worker.once("error", reject); }));
    for (const worker of workers) worker.postMessage("go");
    const played = await Promise.all(done);
    await Promise.all(workers.map((worker) => worker.terminate()));
    return played;
  };

  const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
  const median = (v) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const pct = (v, p) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  /** A copy's figures from `skip` on: its step, its world's part, its minds', and the split's step with `n` mind threads. */
  const figures = ({ totals, minds, solvers }, n) => {
    const steps = totals.slice(skip), mindsOf = minds.slice(skip);
    const world = steps.map((t, k) => t - mindsOf[k].reduce((a, b) => a + b, 0));
    const split = steps.map((_, k) => {
      const share = new Float64Array(n);
      mindsOf[k].forEach((ms, b) => { share[b % n] += ms; });
      return Math.max(world[k], ...share) + handoff;
    });
    return { step: mean(steps), world: mean(world), solver: mean(solvers.slice(skip)), minds: mean(steps) - mean(world), split: mean(split), split99: pct(split, .99),
      lag: lagOf(split, DT).lag, lagOne: lagOf(totals, DT, skip).lag };
  };

  console.log(`Node ${process.version}, core world, the crowd fight seed ${seed}, its first ${cap} s, 120 Hz; read from ${values.skip} s; handoff ${handoff} ms; ms\n`);
  for (const count of values.threads.split(",").map(Number)) {
    const played = await together(count);
    const ns = count === 1 ? [1, 2, 3, 4] : [count - 1];
    console.log(`${count} thread${count === 1 ? "" : "s"} loaded, ${played[0].totals.length} steps, ${played[0].bodies} bodies:`);
    for (const n of ns) {
      const rows = played.map((copy) => figures(copy, n)), of = (key) => rows.map((row) => row[key]);
      const fmt = (key, d = 2) => `${Math.min(...of(key)).toFixed(d)} (median ${median(of(key)).toFixed(d)})`;
      console.log(`  ${n} mind thread${n === 1 ? "" : "s"}: one thread's step ${fmt("step")}, world ${fmt("world")} (the solver ${fmt("solver")}), minds ${fmt("minds")}; split step ${fmt("split")}, 99th ${fmt("split99")}; worst lag split ${fmt("lag", 0)}, one thread ${fmt("lagOne", 0)}`);
    }
  }
}
