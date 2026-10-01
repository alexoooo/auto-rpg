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

/** A built body's weight in `world`, N: its segments' rigid masses, what they hold included, times gravity. */
function weightOf(built, world) {
  return [...built.segments.values()].reduce((sum, segment) => sum + segment.rigid.mass, 0) * Math.hypot(...world.physics.gravity);
}

/** How many steps the last second of a bout is, and what counts as the soles missing: over this force, in weights, or this moment, N m. */
const LAST_STEPS = 120, OVER = { force: 0.05, moment: 5 };

/**
 * What `duelist`'s soles miss of what its stance asks of the ground (`StanceReading.shortfall`),
 * taken after each step: the force's size in the body's weights and the moment's in N m. Its row is
 * the mean of each, the share of steps either is over `OVER`, and the mean of each over the last
 * second taken. Steps after a verdict are not for it: past a fall the ask has no bound.
 */
function shortfallMeter(duelist, world) {
  const weight = weightOf(duelist.built, world), { shortfall } = duelist.body.view.stance;
  const force = [], moment = [];
  const mean = (values) => values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length);
  return {
    take() { force.push(shortfall.force.length() / weight); moment.push(shortfall.moment.length()); },
    row() {
      return {
        force: mean(force), moment: mean(moment),
        over: force.filter((f, k) => f > OVER.force || moment[k] > OVER.moment).length / Math.max(1, force.length),
        lastForce: mean(force.slice(-LAST_STEPS)), lastMoment: mean(moment.slice(-LAST_STEPS)),
      };
    },
  };
}

/**
 * Play `recipe` to its verdict, or `seconds`, giving `tape`'s orders as it steps (`Duel.play`): how
 * it ended, what landed, the orders it was given, and its trace's digest. With `shortfall`, the row
 * gains what each side's soles missed (`shortfallMeter`).
 */
export async function playBout(recipe, seconds = Infinity, tape = [], { shortfall = false } = {}) {
  const { world, duel, dispose } = await buildBout(recipe);
  try {
    duel.play(tape);
    const trace = traceOf(SIDES.map((side) => duel.duelists[side].built));
    const missed = shortfall ? SIDES.map((side) => shortfallMeter(duel.duelists[side], world)) : null;
    while (!duel.verdict && duel.clock < seconds) {
      world.step();
      trace.take();
      if (missed) for (const meter of missed) meter.take();
    }
    const landed = duel.blows.filter((blow) => !blow.clash);
    return {
      recipe, steps: world.steps, seconds: duel.clock,
      winner: duel.verdict?.winner ?? null, ending: duel.verdict?.ending ?? "none",
      blows: landed.length, wounding: landed.filter((blow) => blow.damage > 0).length, clashes: duel.blows.length - landed.length,
      bars: SIDES.map((side) => duel.duelists[side].pool.bar()),
      fallen: SIDES.filter((side) => duel.duelists[side].skills.report.fallen),
      tape: duel.tape, digest: trace.digest(),
      ...(missed ? { shortfall: missed.map((meter) => meter.row()) } : {}),
    };
  } finally { dispose(); }
}
