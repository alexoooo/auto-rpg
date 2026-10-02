// One arena bout in a world of its own (Node, core world, Rapier, 120 Hz), and its row.
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { addArenaSolids } from "../src/arena/room.ts";
import { Duel, SIDES } from "../src/arena/duel.ts";
import { isClash, woundedIn } from "../src/core/rules/blows.ts";
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

/** An assist's meter as its means, [N, N m]; none metered, none given. */
const meanOf = ({ steps, force, moment }) => steps ? [force / steps, moment / steps] : [0, 0];

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

/** Whether `side` of a blow is a bare hand: a hand's own surface, not what it holds. */
const bareHand = (side) => side.item === null && side.segment.startsWith("hand.");

/**
 * What `blows` cost `duelist`, read from their records:
 * - `taken`: the hit points its parts lost to them;
 * - `own`: those lost to blows in which its surface was its own bare hand;
 * - `jostled`: those lost to blows in which neither surface was a hand's or an item's;
 * - `ruined`: the hands a blow in which the hand was its surface emptied, and `off`, those such a blow took off.
 */
function costOf(blows, duelist) {
  const hp = new Map(duelist.built.spec.segments.map((segment) => [segment.name, duelist.pool.max(segment.name)]));
  const cost = { taken: 0, own: 0, jostled: 0, ruined: 0, off: 0 };
  for (const blow of blows) {
    const side = blow.sides.find((one) => one.fighter === duelist.id);
    if (!side?.wound) continue;
    const lost = side.wound.taken.reduce((sum, { hp: taken }) => sum + taken, 0);
    const had = hp.get(side.segment);
    for (const { part, hp: taken } of side.wound.taken) hp.set(part, hp.get(part) - taken);
    cost.taken += lost;
    if (bareHand(side)) {
      cost.own += lost;
      if (had > 0 && hp.get(side.segment) <= 1e-12) cost.ruined++;
      if (side.wound.severed.includes(side.segment)) cost.off++;
    } else if (blow.sides.every((one) => one.item === null && !one.segment.startsWith("hand."))) cost.jostled += lost;
  }
  return cost;
}

/**
 * Play `recipe` to its verdict, or `seconds`, giving `tape`'s orders as it steps (`Duel.play`): how
 * it ended, what landed and what it cost each side (`costOf`), the orders it was given, each side's mean assist, and its
 * trace's digest. With `shortfall`, the row gains what each side's soles missed (`shortfallMeter`); with `blows`, each blow's
 * energy and its two sides.
 */
export async function playBout(recipe, seconds = Infinity, tape = [], { shortfall = false, blows = false } = {}) {
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
    const landed = duel.blows.filter((blow) => !isClash(blow));
    return {
      recipe, steps: world.steps, seconds: duel.clock,
      winner: duel.verdict?.winner ?? null, ending: duel.verdict?.ending ?? "none",
      blows: landed.length, wounding: landed.filter((blow) => woundedIn(blow).some((side) => side.damage > 0)).length, clashes: duel.blows.length - landed.length,
      bars: SIDES.map((side) => duel.duelists[side].pool.bar()),
      cost: SIDES.map((side) => costOf(duel.blows, duel.duelists[side])),
      ...(blows ? { landed: duel.blows.map(({ time, energy, closing, sides }) => ({ time, energy, closing, sides })) } : {}),
      fallen: SIDES.filter((side) => duel.duelists[side].body.view.down),
      tape: duel.tape, digest: trace.digest(),
      // Each side's mean assist over its metered steps, [N, N m].
      assist: SIDES.map((side) => meanOf(duel.duelists[side].body.assist.meter)),
      ...(missed ? { shortfall: missed.map((meter) => meter.row()) } : {}),
    };
  } finally { dispose(); }
}
