/**
 * **A fixture's heavy work, counted** (`tests/core-step-cost.test.mjs`): run in a process of its
 * own, it registers the call counter (`research/call-count-hook.mjs`) before anything loads, plays
 * each fixture named for `seconds` and prints one line of JSON a fixture: the steps, the
 * body-steps (each step's fighters, summed) and each count.
 *
 *   node tests/harness/heavy-work.mjs <seconds> duel crypt
 *
 * `duel`: Option Mind Warriors, sword against club, 1 m apart on the open stage. `crypt`: a Crypt
 * run, seed 10, the hero exploring.
 */
import { register } from "node:module";

register("../../research/call-count-hook.mjs", import.meta.url);
globalThis.__calls = {};
globalThis.__countWasm = (exports) => exports;

const [given, ...fixtures] = process.argv.slice(2), seconds = Number(given);
if (!(seconds > 0) || fixtures.length === 0) throw new Error("name the seconds and the fixtures: duel, crypt");
await import("./preload-data.mjs");
const { Logger } = await import("@babylonjs/core/Misc/logger.js");
Logger.LogLevels = Logger.NoneLogLevel;

/** The duel's Arena link. */
const DUEL = "?matchup=workshop-fighter,workshop-fighter&control=option,option&left.loadout=empty,sword&right.loadout=empty,club&gap=1";

/** The fixture built: a step, how many fighters it has now, whether it is over, and its disposal. */
async function built(fixture) {
  if (fixture === "duel") {
    const { recipeOf } = await import("../../src/arena/matchup.ts");
    const { buildBout } = await import("../../src/evaluation/bout.ts");
    const { world, duel, dispose } = await buildBout({ ...recipeOf(DUEL, { left: {}, right: {} }, "open"), capSeconds: seconds + 1 }, { engine: "rapier-coordinate" });
    return { step: () => world.step(), bodies: () => 2, over: () => duel.verdict !== null, dispose };
  }
  if (fixture === "crypt") {
    const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
    const { Scene } = await import("@babylonjs/core/scene.js");
    const { DungeonRun } = await import("../../src/dungeon/run.ts");
    const { freshEngine } = await import("./core-stand.mjs");
    const engine = new NullEngine(), scene = new Scene(engine);
    const run = new DungeonRun(scene, { seed: 10, engine: await freshEngine(), visuals: false, companions: [] });
    run.commands.setMode({ keyboard: false, facing: true });
    return { step: () => run.step(), bodies: () => run.actors.filter((actor) => actor.fighter).length, over: () => run.status !== "playing",
      dispose() { run.dispose(); scene.dispose(); engine.dispose(); } };
  }
  throw new Error(`no fixture ${fixture}: duel or crypt`);
}

for (const fixture of fixtures) {
  const one = await built(fixture);
  for (const key of Object.keys(globalThis.__calls)) delete globalThis.__calls[key];
  let steps = 0, bodySteps = 0;
  for (; steps < seconds * 120 && !one.over(); steps++) { one.step(); bodySteps += one.bodies(); }
  one.dispose();
  console.log(JSON.stringify({ fixture, steps, bodySteps, calls: { ...globalThis.__calls } }));
}
