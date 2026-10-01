/**
 * What a crypt run costs a step, over a run: the hero alone explores a generated level
 * (`DungeonRun`, no visuals), `--companions` Warriors following it, until the run ends or `--seconds` of it have passed. A row is a seed:
 * how the run stood at the end, the bodies built and how many of them were out of the fight, and
 * the wall time of a step, as the run's mean and as the mean of its slowest second.
 *
 *   node research/crypt-step.mjs [--seeds 1,2,3,4] [--seconds 120] [--companions 0]
 *
 * Wall time on the machine it runs on, one run at a time: read it on a quiet one.
 */
import { parseArgs } from "node:util";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { DungeonRun } from "../src/dungeon/run.ts";
import { CORE_ENGINE, freshEngine } from "../tests/harness/core-stand.mjs";

const { values } = parseArgs({ options: { seeds: { type: "string", default: "1,2,3,4" }, seconds: { type: "string", default: "120" }, companions: { type: "string", default: "0" } } });
const seconds = Number(values.seconds), companions = Array.from({ length: Number(values.companions) }, () => "workshop-fighter");

async function played(seed) {
  const engine = new NullEngine(), scene = new Scene(engine);
  const run = new DungeonRun(scene, { seed, engine: await freshEngine(), visuals: false, companions });
  // The hero explores by itself in this mode, and fights what it meets.
  run.commands.setMode({ keyboard: false, facing: true });
  const hz = run.world.hz;
  let total = 0, worst = 0, most = 0, steps = 0;
  for (let s = 0; s < seconds && run.status === "playing"; s++) {
    const t = performance.now();
    run.step(hz);
    const ms = (performance.now() - t) / hz;
    total += ms * hz; steps += hz; worst = Math.max(worst, ms);
    most = Math.max(most, run.actors.filter((a) => a.fighter).length);
  }
  const built = run.actors.filter((a) => a.fighter), row = {
    seed, status: run.status, seconds: steps / hz, enemies: run.enemies.length, built: built.length, most,
    out: built.filter((a) => !a.alive).length, mean: total / steps, worst,
  };
  run.dispose(); scene.dispose(); engine.dispose();
  return row;
}

console.log(`Node, a crypt run with no visuals, ${CORE_ENGINE}, 120 Hz; the hero exploring, ${companions.length} with it; to the run's end or ${seconds} s\n`);
console.log("| Seed | The run | Seconds | Enemies | Bodies built at the end | The most built | Out of the fight | A step, ms | In its slowest second, ms | Of real time, % |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const seed of values.seeds.split(",").map(Number)) {
  const r = await played(seed);
  console.log(`| ${r.seed} | ${r.status} | ${r.seconds} | ${r.enemies} | ${r.built} | ${r.most} | ${r.out} | ${r.mean.toFixed(2)} | ${r.worst.toFixed(2)} | ${(r.worst * 120 / 10).toFixed(0)} |`);
}
