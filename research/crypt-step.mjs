/**
 * What a crypt run costs a step, over a run: the hero explores a generated level (`DungeonRun`, no
 * visuals), `--companions` Warriors following it, until the run ends or `--seconds` of it have
 * passed. A row is a seed: how the run stood at the end, the bodies built, how many of them were
 * held in the fight (`LEVELS`), how many out of it and how many of those held where they lie, and
 * the wall time of a step, as the run's mean and as the mean of its slowest second.
 *
 * With `--listen` the same run is played twice at once, unheard and heard, a step of each by
 * turns, so the two are read on the machine as it is at that moment and their difference is what
 * hearing costs. Heard is as a page hears it (`hearRun`, `src/dungeon/hearing.ts`): every built
 * body's touches, and its air, asked here every step where a page asks once a frame, by a
 * listener that does nothing with them. The row's first figures are the unheard run's.
 *
 *   node research/crypt-step.mjs [--seeds 1,2,3,4] [--seconds 120] [--companions 0] [--listen]
 *
 * Wall time on the machine it runs on, one row at a time: read it on a quiet one, with the
 * process held to cores of one kind (`docs/reference/play.md`, Hearing in the step, says how). On
 * cores of two kinds a step reads several times longer from one second to the next, and the share
 * between the two runs is lost in it.
 */
import { parseArgs } from "node:util";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { hearRun } from "../src/dungeon/hearing.ts";
import { DungeonRun } from "../src/dungeon/run.ts";
import { CORE_ENGINE, freshEngine } from "../tests/harness/core-stand.mjs";

const { values } = parseArgs({ options: { seeds: { type: "string", default: "1,2,3,4" }, seconds: { type: "string", default: "120" }, companions: { type: "string", default: "0" }, listen: { type: "boolean", default: false } } });
const seconds = Number(values.seconds), companions = Array.from({ length: Number(values.companions) }, () => "workshop-fighter");

/** A run of `seed`, heard or not, and the wall time its steps have taken: all of them, and its slowest second's. */
async function begun(seed, heard) {
  const engine = new NullEngine(), scene = new Scene(engine);
  const run = new DungeonRun(scene, { seed, engine: await freshEngine(), visuals: false, companions });
  // The hero explores by itself in this mode, and fights what it meets.
  run.commands.setMode({ keyboard: false, facing: true });
  const hearing = heard ? hearRun(run, () => {}) : null;
  const airing = hearing ? run.world.afterStep(() => hearing.airs(() => {})) : null;
  return { run, total: 0, worst: 0, dispose() { airing?.dispose(); hearing?.dispose(); run.dispose(); scene.dispose(); engine.dispose(); } };
}

async function played(seed) {
  const sides = [await begun(seed, false), ...(values.listen ? [await begun(seed, true)] : [])];
  const [{ run }] = sides, hz = run.world.hz;
  let most = 0, steps = 0;
  for (let s = 0; s < seconds && run.status === "playing"; s++) {
    const second = sides.map(() => 0);
    for (let i = 0; i < hz; i++) {
      sides.forEach((side, k) => { const t = performance.now(); side.run.step(); second[k] += performance.now() - t; });
    }
    sides.forEach((side, k) => { side.total += second[k]; side.worst = Math.max(side.worst, second[k] / hz); });
    steps += hz;
    most = Math.max(most, run.actors.filter((a) => a.fighter).length);
  }
  const built = run.actors.filter((a) => a.fighter), [unheard, heard] = sides, row = {
    seed, status: run.status, seconds: steps / hz, enemies: run.enemies.length, built: built.length, most,
    held: built.filter((a) => a.held && a.alive).length, out: built.filter((a) => !a.alive).length, lying: built.filter((a) => a.held && !a.alive).length, mean: unheard.total / steps, worst: unheard.worst,
    heard: heard ? { mean: heard.total / steps, worst: heard.worst } : null,
  };
  if (heard && (heard.run.status !== run.status || heard.run.blows.length !== run.blows.length)) throw new Error(`seed ${seed}: heard, the run is another run`);
  for (const side of sides) side.dispose();
  return row;
}

console.log(`Node, a crypt run with no visuals, ${CORE_ENGINE}, 120 Hz; the hero exploring, ${companions.length} with it; to the run's end or ${seconds} s\n`);
const listened = values.listen ? " Heard: a step, ms | In its slowest second, ms | Hearing, % of the unheard step |" : "";
console.log(`| Seed | The run | Seconds | Enemies | Bodies built at the end | The most built | Held | Out of the fight | Of them held | A step, ms | In its slowest second, ms | Of real time, % |${listened}`);
console.log(`|---|---|---|---|---|---|---|---|---|---|---|---|${values.listen ? "---|---|---|" : ""}`);
for (const seed of values.seeds.split(",").map(Number)) {
  const r = await played(seed);
  const heard = r.heard ? ` ${r.heard.mean.toFixed(2)} | ${r.heard.worst.toFixed(2)} | ${((r.heard.mean / r.mean - 1) * 100).toFixed(1)} |` : "";
  console.log(`| ${r.seed} | ${r.status} | ${r.seconds} | ${r.enemies} | ${r.built} | ${r.most} | ${r.held} | ${r.out} | ${r.lying} | ${r.mean.toFixed(2)} | ${r.worst.toFixed(2)} | ${(r.worst * 120 / 10).toFixed(0)} |${heard}`);
}
