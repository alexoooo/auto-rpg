/**
 * What a crypt run's own planning takes of its steps: the hero explores a generated level
 * (`DungeonRun`, no visuals), `--companions` Warriors following it, until the run ends or
 * `--seconds` of it have passed, every step timed with the run's plan inside it
 * (`DungeonRun.plan`: who is built and held, who sees whom, each walker's path). A row is a seed:
 * the step and the plan as their mean, 99th per cent and longest, the steps over a step's length
 * of real time (8.33 ms), the plans over 1 ms and over 4 ms, and the plan's part of the ten
 * slowest steps. The first 2 s are not read.
 *
 * With `--profile` each run is played under V8's CPU profiler in place of the timing, and a row is
 * what a step, the plan and each of the functions under it take in the mean, each with everything
 * it calls: which of the plan's work the time is.
 *
 *   node research/crypt-plan.mjs [--seeds 1,2,3] [--seconds 90] [--companions 3] [--profile]
 *
 * Wall time on the machine it runs on: read it on a quiet one.
 */
import { Session } from "node:inspector/promises";
import { parseArgs } from "node:util";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { DungeonRun } from "../src/dungeon/run.ts";
import { CORE_ENGINE, freshEngine } from "../tests/harness/core-stand.mjs";

const { values } = parseArgs({ options: { seeds: { type: "string", default: "1,2,3" }, seconds: { type: "string", default: "90" }, companions: { type: "string", default: "3" }, profile: { type: "boolean", default: false } } });
const seconds = Number(values.seconds), companions = Array.from({ length: Number(values.companions) }, () => "workshop-fighter");
// Babylon greets every engine it makes on the console.
Logger.LogLevels = Logger.NoneLogLevel;

async function played(seed) {
  const engine = new NullEngine(), scene = new Scene(engine);
  const run = new DungeonRun(scene, { seed, engine: await freshEngine(), visuals: false, companions });
  // The hero explores by itself in this mode, and fights what it meets.
  run.commands.setMode({ keyboard: false, facing: true });
  const plan = run.plan.bind(run);
  let planned = 0;
  run.plan = () => { const t = performance.now(); plan(); planned = performance.now() - t; };
  const steps = [], plans = [];
  for (let i = 0; i < seconds * run.world.hz && run.status === "playing"; i++) {
    const t = performance.now();
    run.step();
    steps.push(performance.now() - t);
    plans.push(planned);
  }
  const row = { seed, status: run.status, seconds: steps.length / run.world.hz, built: run.actors.filter((a) => a.fighter).length, steps: steps.slice(2 * run.world.hz), plans: plans.slice(2 * run.world.hz) };
  run.dispose(); scene.dispose(); engine.dispose();
  return row;
}

/** The plan's functions a profile's row reads, as the profiler names them. */
const READ = ["plan src/dungeon/run.ts", "reveal src/dungeon/map.ts", "canSee src/dungeon/map.ts", "walkable src/dungeon/map.ts",
  "findPath src/dungeon/map.ts", "explorationGoal src/dungeon/map.ts"];

/** One run under the CPU profiler: its steps, and microseconds a step in all of it and in each of `READ`, with everything each calls. */
async function profiled(seed) {
  const engine = new NullEngine(), scene = new Scene(engine);
  const run = new DungeonRun(scene, { seed, engine: await freshEngine(), visuals: false, companions });
  run.commands.setMode({ keyboard: false, facing: true });
  const session = new Session();
  session.connect();
  await session.post("Profiler.enable");
  await session.post("Profiler.setSamplingInterval", { interval: 100 });
  await session.post("Profiler.start");
  let steps = 0;
  for (; steps < seconds * run.world.hz && run.status === "playing"; steps++) run.step();
  const { profile } = await session.post("Profiler.stop");
  session.disconnect();
  const status = run.status;
  run.dispose(); scene.dispose(); engine.dispose();
  const short = (url) => url.replace(/^file:\/\/\/.*?\/(src|tests|research|scripts)\//, "$1/");
  const byId = new Map(profile.nodes.map((node) => [node.id, node])), parent = new Map(), self = new Map(profile.nodes.map((node) => [node.id, 0]));
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  profile.samples.forEach((id, i) => self.set(id, self.get(id) + profile.timeDeltas[i]));
  // A function's time with what it calls: a node's own time to each distinct name above it, once a stack.
  const within = new Map();
  let total = 0;
  for (const node of profile.nodes) {
    const t = self.get(node.id), seen = new Set();
    total += t;
    for (let id = node.id; id !== undefined; id = parent.get(id)) {
      const at = byId.get(id), key = `${at.callFrame.functionName} ${short(at.callFrame.url)}`;
      if (!seen.has(key)) { seen.add(key); within.set(key, (within.get(key) ?? 0) + t); }
    }
  }
  return { seed, status, steps, total: total / steps, read: READ.map((name) => (within.get(name) ?? 0) / steps) };
}

const stats = (v) => {
  const s = [...v].sort((a, b) => a - b);
  return `${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)} / ${s[Math.floor(0.99 * s.length)].toFixed(2)} / ${s.at(-1).toFixed(2)}`;
};
console.log(`Node, a crypt run with no visuals, ${CORE_ENGINE}, 120 Hz; the hero exploring, ${companions.length} with it; to the run's end or ${seconds} s\n`);
if (values.profile) {
  console.log("Under the CPU profiler at 100 us: microseconds a step in the mean, each function with everything it calls\n");
  console.log(`| Seed | The run | Steps | A step | ${READ.map((name) => `\`${name.split(" ")[0]}\``).join(" | ")} |`);
  console.log(`|---|---|---|---|${READ.map(() => "---").join("|")}|`);
  for (const seed of values.seeds.split(",").map(Number)) {
    const r = await profiled(seed);
    console.log(`| ${r.seed} | ${r.status} | ${r.steps} | ${r.total.toFixed(0)} | ${r.read.map((v) => v.toFixed(1)).join(" | ")} |`);
  }
  process.exit(0);
}
console.log("| Seed | The run | Seconds | Bodies built | A step, ms: mean / 99th per cent / longest | The plan in it, ms: mean / 99th per cent / longest | Steps over 8.33 ms | Plans over 1 ms | Plans over 4 ms | The ten slowest steps, ms (the plan's part) |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const seed of values.seeds.split(",").map(Number)) {
  const r = await played(seed);
  const slowest = r.steps.map((v, i) => [v, r.plans[i]]).sort((a, b) => b[0] - a[0]).slice(0, 10);
  console.log(`| ${r.seed} | ${r.status} | ${r.seconds.toFixed(0)} | ${r.built} | ${stats(r.steps)} | ${stats(r.plans)} | ${r.steps.filter((v) => v > 8.33).length} of ${r.steps.length} | ${r.plans.filter((v) => v > 1).length} | ${r.plans.filter((v) => v > 4).length} | ${slowest.map(([v, p]) => `${v.toFixed(1)} (${p.toFixed(1)})`).join(", ")} |`);
}
