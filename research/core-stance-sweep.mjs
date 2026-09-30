/**
 * The core stance's batteries over stance tunings (`core-stance-trials.mjs`), each trial on a
 * worker of its own stand: prints, per tuning and human, what the tests read.
 *
 *   node research/core-stance-sweep.mjs --variants '[{}, {"track": 0.15}]' [--batteries stand,edge,step,walk,shove] [--hz 120] [--workers 14]
 *
 * - stand: 5 s 3 cm low in the guard; the centre's stop off the soles' middle, its drift over the
 *   last 2 s, the feet's slide and sink, mm (worst of the two humans' single runs).
 * - edge: a place 30 cm out each of 4 ways; failures (fell, over 15 mm off the held place, 5 mm off
 *   height or 10 mm of slide), the worst stop and slide.
 * - step: each foot 15 and 25 cm forward, 15 back and 10 out; failures by the tests' bars, worst miss.
 * - walk: 0.3 m/s forward, right and back, then stop; failures, the mean speed along.
 * - gait: 0.2, 0.3, 0.4, 0.5 and 0.7 m/s five ways (forward, right, back, left, forward right),
 *   then stop: held (not fallen), on pace (0.8 to 1.25 of the speed along over 3 s, under a quarter
 *   of it across), the mean ratio along of those held, those stopped (under 5 cm/s, standing, 4 s
 *   after), and those held at each speed.
 * - shove: 10 to 60 N s (`--top`) by 5, sixteen ways; the shoves held, and the impulse held each way
 *   (the largest below the first that fell): mean and least.
 */
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import { CORE_STANCE_HARNESS } from "./core-stance-trials.mjs";

const { values } = parseArgs({ options: {
  variants: { type: "string", default: "[{}]" }, batteries: { type: "string", default: "stand,edge,step,walk,shove" },
  hz: { type: "string", default: "120" }, workers: { type: "string" }, models: { type: "string", default: "workshop-rogue,workshop-fighter" },
  top: { type: "string", default: "60" },
} });
const variants = JSON.parse(values.variants), batteries = values.batteries.split(","), hz = Number(values.hz), models = values.models.split(",");
const top = Number(values.top);
const lanes = Number(values.workers ?? Math.max(1, availableParallelism() - 2));

const jobs = [];
variants.forEach((stance, v) => { for (const model of models) {
  const add = (trial, extra) => jobs.push({ v, model, trial, stance, hz, ...extra });
  if (batteries.includes("stand")) add("stand", {});
  if (batteries.includes("edge")) for (const degrees of [0, 90, 180, 270]) add("edge", { degrees });
  if (batteries.includes("step")) for (const foot of ["left", "right"]) for (const [dx, dz] of [[0, 0.15], [0, 0.25], [0, -0.15], [foot === "left" ? -0.1 : 0.1, 0]]) add("step", { foot, dx, dz });
  if (batteries.includes("walk")) for (const degrees of [0, 90, 180]) add("walk", { degrees, speed: 0.3 });
  if (batteries.includes("gait")) for (const speed of [0.2, 0.3, 0.4, 0.5, 0.7]) for (const degrees of [0, 90, 180, 270, 45]) add("walk", { degrees, speed, gait: true });
  if (batteries.includes("shove")) for (let w = 0; w < 16; w++) for (let impulse = 10; impulse <= top; impulse += 5) add("shove", { degrees: 22.5 * w, impulse });
} });

const pool = Array.from({ length: Math.min(lanes, jobs.length) }, () => new Worker(new URL("./core-stance-worker.mjs", import.meta.url)));
const started = Date.now();
let next = 0, done = 0;
await Promise.all(pool.map((worker) => new Promise((resolve, reject) => {
  const feed = () => {
    if (next >= jobs.length) { worker.terminate(); resolve(); return; }
    const id = next++;
    worker.once("message", ({ result, error }) => {
      if (error) { reject(new Error(error)); return; }
      jobs[id].result = result;
      if (++done % 50 === 0) process.stderr.write(`${done}/${jobs.length} in ${((Date.now() - started) / 1000).toFixed(0)} s\n`);
      feed();
    });
    worker.postMessage({ ...jobs[id], id });
  };
  feed();
})));

const mm = (x) => (1000 * x).toFixed(1);
console.log(`${CORE_STANCE_HARNESS}, ${hz} Hz; ${jobs.length} trials in ${((Date.now() - started) / 1000).toFixed(0)} s`);
variants.forEach((stance, v) => { for (const model of models) {
  const of = (trial) => jobs.filter((j) => j.v === v && j.model === model && j.trial === trial).map((j) => ({ ...j, speed_: j.speed, ...j.result }));
  const parts = [];
  for (const r of of("stand")) parts.push(`stand off ${mm(r.off)} low ${mm(r.low)} drift ${mm(r.drift)} slide ${mm(r.slide)} sink ${mm(r.sink)}`);
  const edges = of("edge");
  if (edges.length) {
    const fails = edges.filter((r) => r.fell || r.off > 0.015 || r.low > 0.005 || r.slide > 0.01);
    parts.push(`edge fails ${fails.length}/${edges.length} [${fails.map((r) => r.degrees).join(",")}] worst off ${mm(Math.max(...edges.map((r) => r.off)))} slide ${mm(Math.max(...edges.map((r) => r.slide)))}`);
  }
  const steps = of("step");
  if (steps.length) {
    const fails = steps.filter((r) => r.phases !== "stand shift swing stand" || r.miss > 0.017 || r.turned > 0.05 || r.off > 0.005 || r.low < -0.005 || r.low > 0.05 || r.speed > 0.01 || r.drift > 0.01);
    parts.push(`step fails ${fails.length}/${steps.length} [${fails.map((r) => `${r.foot[0]}${r.dx},${r.dz}`).join(" ")}] worst miss ${mm(Math.max(...steps.map((r) => r.miss)))} drift ${mm(Math.max(...steps.map((r) => r.drift)))}`);
  }
  const walks = of("walk").filter((r) => !r.gait);
  if (walks.length) {
    const fails = walks.filter((r) => r.fell || r.strides < 8 || r.along < 0.21 || r.along > 0.375 || Math.abs(r.across) > 0.075 || r.phase !== "stand" || r.stepped !== 0 || r.off > 0.05);
    parts.push(`walk fails ${fails.length}/${walks.length} [${fails.map((r) => r.degrees).join(",")}] along ${walks.map((r) => r.along.toFixed(3)).join(",")}`);
  }
  const gaits = of("walk").filter((r) => r.gait);
  if (gaits.length) {
    const held = gaits.filter((r) => !r.fell), pace = held.filter((r) => r.along > 0.8 * r.speed_ && r.along < 1.25 * r.speed_ && Math.abs(r.across) < 0.25 * r.speed_);
    const stopped = held.filter((r) => r.speed < 0.05 && r.phase === "stand");
    parts.push(`gait held ${held.length}/${gaits.length} on pace ${pace.length} ratio ${(held.reduce((a, r) => a + r.along / r.speed_, 0) / Math.max(1, held.length)).toFixed(2)} stopped ${stopped.length}`
      + ` held by speed ${[0.2, 0.3, 0.4, 0.5, 0.7].map((s) => held.filter((r) => r.speed_ === s).length).join(",")}`);
  }
  const shoves = of("shove");
  if (shoves.length) {
    const held = shoves.filter((r) => !r.fell).length, ways = [];
    for (let w = 0; w < 16; w++) {
      const way = shoves.filter((r) => r.degrees === 22.5 * w).sort((a, b) => a.impulse - b.impulse);
      const first = way.find((r) => r.fell);
      ways.push(first ? first.impulse - 5 : top);
    }
    parts.push(`shove held ${held}/${shoves.length} mean ${(ways.reduce((a, b) => a + b, 0) / 16).toFixed(1)} least ${Math.min(...ways)} by way ${ways.join(",")}`);
  }
  console.log(`${JSON.stringify(stance)} ${model}: ${parts.join(" | ")}`);
} });
