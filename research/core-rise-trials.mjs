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
import { FIGHTER } from "../src/core/mind/config.ts";
import { createMind } from "../src/core/mind/minds.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { lieOf } from "../src/core/mind/rise/staged.ts";
import { RISE } from "../src/core/mind/rise/stages.ts";
import { createWorld } from "../src/core/world.ts";
import { freshEngine } from "../tests/harness/core-stand.mjs";
import { buildBout } from "./bout.mjs";

export const RISE_HARNESS = "Node, core world (src/core/world.ts), Rapier, 120 Hz";
/** How long a fall is watched, s, and how long a body must stay up to have risen, s. */
export const WATCH_SECONDS = 15, UP_SECONDS = 2;
/** How long a body stands before it is shoved, s, how long after the shove a fall is waited for, s, and how long after a fall its thrashing is read from, s. */
const STAND_SECONDS = 1, FALL_SECONDS = 3, LYING_SECONDS = 1;
/** A body none of whose segments' centres of mass moves faster than this is still, m/s. */
const STILL = 0.05;

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
 * Watch a body that is down for `watch` s of `world`'s steps, and give its row: whether it
 * rose and when (`risenAt`), the fastest any of its segments' centres of mass moved from
 * `LYING_SECONDS` after the fall, m/s, the most its stance asked of the ground beyond what its
 * soles gave over the same span, in its weights (`Infinity` once it is not finite), the
 * seconds from the fall to the last step it was not still (`STILL`), how it lay `LYING_SECONDS`
 * after the fall (`lieOf`), the furthest stage of the game's rise (`RISE`) its last attempt's
 * fall reached: its name, "none" if it began none, and null under a mind with no riser; and
 * whether its riser played the rise to its end, its last stage done, within the watch (null
 * under a mind with none); and whether it is up at the watch's last step.
 */
export function watchFall(world, built, body, watch = WATCH_SECONDS) {
  const hz = world.hz, segments = [...built.segments.values()];
  const weight = segments.reduce((sum, segment) => sum + segment.rigid.mass, 0) * Math.hypot(...world.physics.gravity);
  const downs = [body.view.down], velocity = new Vector3(), riser = riserOf(body);
  let peak = 0, asked = 0, last = 0, lie = null, was = riser?.phase, ended = riser ? false : null;
  for (let i = 1; i < Math.round(watch * hz); i++) {
    world.step();
    downs.push(body.view.down);
    // A rise whose last stage is done leaves its riser idle; one given up leaves it lying slack.
    if (riser && was === "rise" && riser.phase === "idle") ended = true;
    was = riser?.phase;
    let fastest = 0;
    for (const segment of segments) fastest = Math.max(fastest, segment.body.linearVelocityToRef(velocity).length());
    if (fastest > STILL) last = i;
    if (i < Math.round(LYING_SECONDS * hz)) continue;
    lie ??= lieOf(body.muscles.dynamics.root.segment);
    peak = Math.max(peak, fastest);
    const ask = body.view.stance.shortfall.force.length() / weight;
    asked = Number.isFinite(ask) ? Math.max(asked, ask) : Infinity;
  }
  const seconds = risenAt(downs, hz);
  return {
    fell: true, risen: seconds !== null, seconds, peak, asked, moved: last / hz, lie,
    stage: riser ? RISE.rise[riser.furthest]?.name ?? "none" : null, ended, up: !downs.at(-1),
  };
}

/** The memory of `body`'s staged riser (`stagedRise`), or null if no sub-mind of its mind is one. */
export const riserOf = (body) => (body.state.mind.subs ?? []).find((sub) => sub && "furthest" in sub) ?? null;

/** The row of a body that did not fall. */
const HELD = Object.freeze({ fell: false, risen: false, seconds: null, peak: null, asked: null, moved: null, lie: null, stage: null, ended: null, up: null });

/** The side of a floor raised over the arena's ground, m: wider than a fall and a rise cross. */
const FLOOR = 12;

/**
 * `model` holding `held` (a key of `LOADOUTS`), built on the arena's ground as the arena builds a
 * body, under the mind `minded(built, world)` makes of it (its `Body`), left `STAND_SECONDS`, and
 * shoved at its middle trunk's centre by `impulse` N s a kilogram of the whole body, `degrees`
 * about up from the way it faces: the world stepped to the first step it is down, or
 * `FALL_SECONDS` if it holds. With `level`, m, it is built on a floor that high over the arena's
 * ground, `FLOOR` m square. The caller disposes.
 */
export async function felled({ model, held, degrees, impulse = 1.5, level = 0, hz = 120 }, minded) {
  const engine = new NullEngine(), scene = new Scene(engine);
  const world = createWorld(scene, await freshEngine(), { hz });
  addArenaSolids(world.physics);
  if (level > 0) world.physics.addFixedBox([0, level / 2, 0], [FLOOR, level, FLOOR]);
  const built = buildBody(LOADOUTS[held](modelSpec(model)), world, { position: [0, level, 0] });
  const body = minded(built, world);
  const dispose = () => { body.dispose(); built.dispose(); world.dispose(); scene.dispose(); engine.dispose(); };
  try {
    world.step(Math.round(STAND_SECONDS * world.hz));
    const mass = [...built.segments.values()].reduce((sum, segment) => sum + segment.rigid.mass, 0);
    const way = degrees * Math.PI / 180, trunk = built.segments.get("middleTrunk");
    trunk.body.applyImpulse(new Vector3(Math.sin(way), 0, Math.cos(way)).scale(impulse * mass), centreOfToRef(trunk, new Vector3()));
    for (let i = 0; i < Math.round(FALL_SECONDS * world.hz) && !body.view.down; i++) world.step();
  } catch (error) { dispose(); throw error; }
  return { world, built, body, dispose };
}

/** How long after its shove a toppled body is held stiff, s: long enough to land. */
const STIFF_SECONDS = 1.5;

/**
 * `felled`, of a body held stiff in its reference pose (every freedom driven to it at full
 * activation) until `STIFF_SECONDS` after the shove, so that it topples in one piece and lands the way it
 * was shoved: on its front shoved forward, which a body that fights the shove does not
 * reliably do. `subs` (sub-mind makers, `BodyOptions.subs`) have it from the next step, in their
 * order; the world is left at the stiffness's last step.
 */
export async function toppled(shove, subs) {
  const until = (world) => Math.round((STAND_SECONDS + STIFF_SECONDS) * world.hz);
  const fall = await felled(shove, (made, into) => {
    const stiff = (own) => ({
      name: "stiff", wants: () => into.steps < until(into), begin() {}, end() {},
      step() {
        own.muscles.activation.fill(1);
        for (let i = 0; i < own.muscles.velocity.length; i++) own.muscles.velocity[i] = Math.max(-3, Math.min(3, -own.muscles.angle(i) / 0.2));
      },
    });
    return createBody(made, into, { servoSeconds: SERVO_SECONDS, subs: [stiff, ...subs] });
  });
  while (fall.world.steps < until(fall.world)) fall.world.step();
  return fall;
}

/**
 * `felled`, under `mind` (a `MindConfig`; the game's, `FIGHTER`, unless given) ordered to stand in
 * guard, and watched `watch` s.
 */
export async function shoved({ mind = FIGHTER, watch = WATCH_SECONDS, ...shove }) {
  const { world, built, body, dispose } = await felled(shove,
    (made, into) => createMind(made, into, mind, { name: "battery", orders: () => STAND_ORDERS }).body);
  try {
    return body.view.down ? watchFall(world, built, body, watch) : HELD;
  } finally { dispose(); }
}

/**
 * `recipe`'s bout played to the first step a side is down; the other side is ordered to stand
 * (`STAND_ORDERS`), and the fallen one is watched `watch` s. With `mind` (a `MindConfig`) both
 * sides have it, in place of the recipe's. Null if nobody falls.
 */
export async function boutFall({ recipe, mind, watch = WATCH_SECONDS }) {
  const { world, duel, dispose } = await buildBout(mind ? { ...recipe, minds: { left: mind, right: mind } } : recipe);
  try {
    const fallen = () => SIDES.find((side) => duel.duelists[side].body.view.down);
    while (!duel.verdict && !fallen()) world.step();
    const side = fallen();
    if (!side) return null;
    duel.order(side === "left" ? "right" : "left", STAND_ORDERS);
    const { built, body } = duel.duelists[side];
    return watchFall(world, built, body, watch);
  } finally { dispose(); }
}

export const TRIALS = { shoved, boutFall };
