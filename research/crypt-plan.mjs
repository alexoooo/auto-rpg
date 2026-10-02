/**
 * What a crypt run's own planning takes of its steps: the hero explores a generated level
 * (`DungeonRun`, no visuals), `--companions` Warriors following it, until the run ends or
 * `--seconds` of it have passed, every step timed with the run's plan inside it
 * (`DungeonRun.plan`: who is built and held, who sees whom, each walker's path). A row is a seed:
 * the step and the plan as their mean, 99th per cent and longest, the steps over a step's length
 * of real time (8.33 ms), the plans over 1 ms and over 4 ms, and the plan's part of the ten
 * slowest steps. The first 2 s are not read.
 *
 *   node research/crypt-plan.mjs [--seeds 1,2,3] [--seconds 90] [--companions 3]
 *
 * Wall time on the machine it runs on: read it on a quiet one.
 */
import { parseArgs } from "node:util";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { DungeonRun } from "../src/dungeon/run.ts";
import { CORE_ENGINE, freshEngine } from "../tests/harness/core-stand.mjs";

const { values } = parseArgs({ options: { seeds: { type: "string", default: "1,2,3" }, seconds: { type: "string", default: "90" }, companions: { type: "string", default: "3" } } });
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

const stats = (v) => {
  const s = [...v].sort((a, b) => a - b);
  return `${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)} / ${s[Math.floor(0.99 * s.length)].toFixed(2)} / ${s.at(-1).toFixed(2)}`;
};
console.log(`Node, a crypt run with no visuals, ${CORE_ENGINE}, 120 Hz; the hero exploring, ${companions.length} with it; to the run's end or ${seconds} s\n`);
console.log("| Seed | The run | Seconds | Bodies built | A step, ms: mean / 99th per cent / longest | The plan in it, ms: mean / 99th per cent / longest | Steps over 8.33 ms | Plans over 1 ms | Plans over 4 ms | The ten slowest steps, ms (the plan's part) |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const seed of values.seeds.split(",").map(Number)) {
  const r = await played(seed);
  const slowest = r.steps.map((v, i) => [v, r.plans[i]]).sort((a, b) => b[0] - a[0]).slice(0, 10);
  console.log(`| ${r.seed} | ${r.status} | ${r.seconds.toFixed(0)} | ${r.built} | ${stats(r.steps)} | ${stats(r.plans)} | ${r.steps.filter((v) => v > 8.33).length} of ${r.steps.length} | ${r.plans.filter((v) => v > 1).length} | ${r.plans.filter((v) => v > 4).length} | ${slowest.map(([v, p]) => `${v.toFixed(1)} (${p.toFixed(1)})`).join(", ")} |`);
}
