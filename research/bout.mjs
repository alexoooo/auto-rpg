// One arena bout in a world of its own (Node, core world, the arena's Rapier, 120 Hz), and its row.
import "../tests/harness/preload-data.mjs";
import { SIDES } from "../src/game/arena/duel.ts";
import { isClash, lifeTaken, woundedIn } from "../src/combat/blows.ts";
import { DEFAULT_ENGINE, isEngineName } from "../src/core/physics/engines.ts";
import { buildBout } from "../src/app/node/evaluation.ts";
import { traceOf } from "../src/evaluation/trace.ts";

/**
 * The engine a bout runs on unless given one: the arena's (`DEFAULT_ENGINE`, which the page loads),
 * or the one `CORE_ENGINE` names when it is set. The stand's own default is another profile.
 */
export const BOUT_ENGINE = process.env.CORE_ENGINE || DEFAULT_ENGINE;
if (!isEngineName(BOUT_ENGINE)) throw new Error(`CORE_ENGINE names no engine: ${BOUT_ENGINE}`);

export const BOUT_HARNESS = `Node, core world (src/core/world/world.ts), ${BOUT_ENGINE}, 120 Hz`;

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
 * - `taken`: the life it lost to them (`lifeTaken`);
 * - `own`: that lost to blows in which its surface was its own bare hand;
 * - `jostled`: that lost to blows in which neither surface was a hand's or an item's;
 * - `ruined`: the arms a blow in which the hand was its surface crippled, and `off`, the hands such a blow took off.
 */
function costOf(blows, duelist) {
  const cost = { taken: 0, own: 0, jostled: 0, ruined: 0, off: 0 };
  for (const blow of blows) {
    const side = blow.sides.find((one) => one.fighter === duelist.id);
    if (!side?.wound) continue;
    const lost = lifeTaken(side);
    cost.taken += lost;
    if (bareHand(side)) {
      cost.own += lost;
      if (side.wound.crippled) cost.ruined++;
      if (side.wound.cut.includes(side.segment)) cost.off++;
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
export async function playBout(recipe, seconds = Infinity, tape = [], { shortfall = false, blows = false, physicsEngine } = {}) {
  const { world, duel, dispose } = await buildBout(recipe, { engine: BOUT_ENGINE, physicsEngine });
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
      fallen: SIDES.filter((side) => duel.duelists[side].body.down),
      tape: duel.tape, recording: duel.recording, digest: trace.digest(),
      // Each side's mean assist over its metered steps, [N, N m].
      assist: SIDES.map((side) => meanOf(duel.duelists[side].body.assist.meter)),
      ...(missed ? { shortfall: missed.map((meter) => meter.row()) } : {}),
    };
  } finally { dispose(); }
}
