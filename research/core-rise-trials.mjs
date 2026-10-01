/**
 * The battery of falls, one world each (Node, the core's world, Rapier, 120 Hz): a body felled by a
 * shove or in a bout, and watched for whether it gets up. Each trial returns a plain row;
 * `research/core-rise.mjs` runs them and prints the table (`docs/reference/rising.md#battery`).
 */
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scene } from "@babylonjs/core/scene.js";
import { SIDES } from "../src/arena/duel.ts";
import { addArenaSolids } from "../src/arena/room.ts";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { armed } from "../src/core/human/grip.ts";
import { modelSpec } from "../src/core/human/spec.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { fighterTactics } from "../src/core/mind/fighter.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { driveBy } from "../src/core/mind/tactics.ts";
import { createWorld } from "../src/core/world.ts";
import { freshEngine } from "../tests/harness/core-stand.mjs";
import { buildBout } from "./bout.mjs";

export const RISE_HARNESS = "Node, core world (src/core/world.ts), Rapier, 120 Hz";
/** How long a fall is watched, s, and how long a body must stay up to have risen, s. */
export const WATCH_SECONDS = 15, UP_SECONDS = 2;
/** How long a body stands before it is shoved, s, how long after the shove a fall is waited for, s, and how long after a fall its thrashing is read from, s. */
const STAND_SECONDS = 1, FALL_SECONDS = 3, LYING_SECONDS = 1;

/** What a shoved body holds, by name: a weapon added to the game is a row added here. */
export const LOADOUTS = Object.freeze({
  club: (spec) => armed(spec, "right", woodenClub()),
  empty: (spec) => spec,
});

/**
 * When `downs` (one a step from the fall, whether the body is down) first shows `UP_SECONDS` up
 * running: the seconds from the fall to the start of that run, or null.
 */
export function risenAt(downs, hz) {
  const run = Math.round(UP_SECONDS * hz);
  let from = 0;
  for (let i = 0; i < downs.length; i++) {
    if (downs[i]) from = i + 1;
    else if (i + 1 - from >= run) return from / hz;
  }
  return null;
}

/**
 * Watch a body that is down for `WATCH_SECONDS` of `world`'s steps, and give its row: whether it
 * rose and when (`risenAt`), the fastest any of its segments' centres of mass moved from
 * `LYING_SECONDS` after the fall, m/s, and the most its stance asked of the ground beyond what its
 * soles gave over the same span, in its weights (`Infinity` once it is not finite).
 */
function watched(world, built, body) {
  const hz = world.hz, segments = [...built.segments.values()];
  const weight = segments.reduce((sum, segment) => sum + segment.rigid.mass, 0) * Math.hypot(...world.physics.gravity);
  const downs = [body.view.down], velocity = new Vector3();
  let peak = 0, asked = 0;
  for (let i = 1; i < Math.round(WATCH_SECONDS * hz); i++) {
    world.step();
    downs.push(body.view.down);
    if (i < Math.round(LYING_SECONDS * hz)) continue;
    for (const segment of segments) peak = Math.max(peak, segment.body.linearVelocityToRef(velocity).length());
    const ask = body.view.stance.shortfall.force.length() / weight;
    asked = Number.isFinite(ask) ? Math.max(asked, ask) : Infinity;
  }
  const seconds = risenAt(downs, hz);
  return { fell: true, risen: seconds !== null, seconds, peak, asked };
}

/** The row of a body that did not fall. */
const HELD = Object.freeze({ fell: false, risen: false, seconds: null, peak: null, asked: null });

/**
 * `model` holding `held` (a key of `LOADOUTS`), built on the arena's ground as the arena builds a
 * body and ordered to stand in guard, shoved at its middle trunk's centre by `impulse` N s a
 * kilogram of the whole body, `degrees` about up from the way it faces, and watched.
 */
export async function shoved({ model, held, degrees, impulse = 1.5 }) {
  const scene = new Scene(new NullEngine());
  const world = createWorld(scene, await freshEngine());
  addArenaSolids(world.physics);
  const built = buildBody(LOADOUTS[held](modelSpec(model)), world, { position: [0, 0, 0] });
  const body = createBody(built, world, { servoSeconds: SERVO_SECONDS });
  try {
    driveBy(body, fighterTactics("battery", () => STAND_ORDERS));
    world.step(Math.round(STAND_SECONDS * world.hz));
    const mass = [...built.segments.values()].reduce((sum, segment) => sum + segment.rigid.mass, 0);
    const way = degrees * Math.PI / 180, trunk = built.segments.get("middleTrunk");
    trunk.body.applyImpulse(new Vector3(Math.sin(way), 0, Math.cos(way)).scale(impulse * mass), centreOfToRef(trunk, new Vector3()));
    for (let i = 0; i < Math.round(FALL_SECONDS * world.hz) && !body.view.down; i++) world.step();
    return body.view.down ? watched(world, built, body) : HELD;
  } finally { body.dispose(); built.dispose(); world.dispose(); scene.dispose(); }
}

/**
 * `recipe`'s bout played to the first step a side is down; the other side is ordered to stand
 * (`STAND_ORDERS`), and the fallen one is watched. Null if nobody falls.
 */
export async function boutFall({ recipe }) {
  const { world, duel, dispose } = await buildBout(recipe);
  try {
    const fallen = () => SIDES.find((side) => duel.duelists[side].body.view.down);
    while (!duel.verdict && !fallen()) world.step();
    const side = fallen();
    if (!side) return null;
    duel.order(side === "left" ? "right" : "left", STAND_ORDERS);
    const { built, body } = duel.duelists[side];
    return watched(world, built, body);
  } finally { dispose(); }
}

export const TRIALS = { shoved, boutFall };
