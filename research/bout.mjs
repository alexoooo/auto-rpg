// One arena bout in a world of its own (Node, core world, Rapier, 120 Hz), and its row.
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { addArenaSolids } from "../src/arena/room.ts";
import { Duel, SIDES } from "../src/arena/duel.ts";
import { createWorld } from "../src/core/world.ts";
import { freshEngine } from "../tests/harness/core-stand.mjs";
import { traceOf } from "../tests/harness/trace.mjs";

export const BOUT_HARNESS = "Node, core world (src/core/world.ts), Rapier, 120 Hz";

/** A world with the arena's solids and `recipe`'s bout in it. */
export async function buildBout(recipe) {
  const scene = new Scene(new NullEngine());
  const world = createWorld(scene, await freshEngine());
  addArenaSolids(world.physics);
  const duel = new Duel(world, recipe);
  return { world, duel, dispose() { duel.dispose(); world.dispose(); scene.dispose(); } };
}

/**
 * Play `recipe` to its verdict, or `seconds`, giving `tape`'s orders as it steps (`Duel.play`): how
 * it ended, what landed, the orders it was given, and its trace's digest.
 */
export async function playBout(recipe, seconds = Infinity, tape = []) {
  const { world, duel, dispose } = await buildBout(recipe);
  try {
    duel.play(tape);
    const trace = traceOf(SIDES.map((side) => duel.duelists[side].built));
    while (!duel.verdict && duel.clock < seconds) { world.step(); trace.take(); }
    const landed = duel.blows.filter((blow) => !blow.clash);
    return {
      recipe, steps: world.steps, seconds: duel.clock,
      winner: duel.verdict?.winner ?? null, ending: duel.verdict?.ending ?? "none",
      blows: landed.length, wounding: landed.filter((blow) => blow.damage > 0).length, clashes: duel.blows.length - landed.length,
      bars: SIDES.map((side) => duel.duelists[side].pool.bar()),
      fallen: SIDES.filter((side) => duel.duelists[side].skills.report.fallen),
      tape: duel.tape, digest: trace.digest(),
    };
  } finally { dispose(); }
}
