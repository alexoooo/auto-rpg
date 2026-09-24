// Walk the hero to the exit on empty levels, headless, and print how long each took. The figures are
// the baseline any change to the dungeon's world or look must reproduce to the hundredth.
//   node scripts/dungeon/sweep.mjs                                   default:1-20:120 multileg:1-5:240
//   node scripts/dungeon/sweep.mjs default:1,7:120 multileg:12:240   those builds and seeds, capped in seconds
//   ... --classic   the classic fixture's levels (tests/fixtures/classic-dungeon.mjs), cursor at (9, 60)
//   ... --visuals   build the run with its visuals, as the page does
// Generated levels send the cursor 30 m past the exit, as the_hero_explores_generated_levels_to_their_exits
// does. Harness: tests/harness/golem-headless-arena.mjs, stepped at 60 Hz by _advancePhysicsEngineStep.
import { createHeadlessArena } from "../../tests/harness/golem-headless-arena.mjs";
import { classicDungeon } from "../../tests/fixtures/classic-dungeon.mjs";
import { DungeonRun } from "../../src/dungeon/run.ts";
import { generateLevel } from "../../src/dungeon/level.ts";
import { CONFIG } from "../../src/config.ts";

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const specs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const classic = flags.has("--classic"), visuals = flags.has("--visuals");

function seedsOf(text) {
  return text.split(",").flatMap((part) => {
    const [from, to] = part.split("-").map(Number);
    return to === undefined ? [from] : Array.from({ length: to - from + 1 }, (_, i) => from + i);
  });
}

const cases = (specs.length ? specs : ["default:1-20:120", "multileg:1-5:240"]).flatMap((spec) => {
  const [build, seeds, cap] = spec.split(":");
  return seedsOf(seeds).map((seed) => ({ build, seed, cap: Number(cap) }));
});

for (const { build, seed, cap } of cases) {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const map = classic ? classicDungeon(seed) : generateLevel(seed).map;
  map.spawns = [];
  const run = new DungeonRun(arena.scene, seed, build, visuals, map);
  const started = performance.now();
  run.commands.setMode({ keyboard: false, facing: true });
  run.commands.cursor = classic ? { x: 9, z: 60 } : { x: map.exit.x, z: map.exit.z + 30 };
  arena.scene.onBeforePhysicsObservable.add(() => run.step(1 / CONFIG.world.physicsHz));
  let frame = 0;
  for (; frame < 60 * cap && run.status === "playing"; frame++) {
    arena.scene._renderId += 1;
    arena.scene._advancePhysicsEngineStep(1000 / 60);
  }
  console.log(`${build} ${seed} ${run.status} ${(frame / 60).toFixed(2)} s sim ${((performance.now() - started) / 1000).toFixed(1)} s wall`);
  run.dispose();
  arena.dispose();
}
