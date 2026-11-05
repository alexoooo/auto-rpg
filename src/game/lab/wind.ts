import type { Refused } from "../../core/refusal.ts";
import { Quaternion, Vector3 } from "../../core/math/vector.ts";
import type { BuiltBody } from "../../core/bodies/build/build-body.ts";
import { modelSpec, type BodyModel } from "../../core/bodies/models.ts";
import { randomStream } from "../../core/math/random.ts";
import { cos, sin } from "../../core/math/real.ts";
import type { World } from "../../core/world/world.ts";

/**
 * **The lab's wind**: gusts that push a body from outside, to show whether its walk holds up when
 * pushed. It is the lab's disturbance, as a shove is, and not an assist: nothing meters it against
 * the body's balance.
 *
 * Gusts arrive at random, `rate` a second on average (in each physics step, with the chance
 * `rate` times the step), each from a direction drawn at random about up. A gust's force is level,
 * rises and falls as a half-sine of `strength` N at its peak over `GUST_SECONDS`, and is given each
 * physics step as its impulse (force times the step) at the upper trunk's centre of mass, after the
 * body's control and before the solver, as a shove is (`stance-mode.ts`). Gusts that overlap add.
 *
 * What it draws and what blows are plain data in `state`: the generator's word and the gusts under
 * way. A wind made again with the same seed blows the same gusts at the same steps.
 *
 * This module has no page-only imports, so the Node stand can run it.
 */

/** How long a gust blows, s: rising and falling as a half-sine. */
const GUST_SECONDS = 0.3;

/** How often gusts come, and how hard they blow. */
export interface WindSettings {
  /** Gusts a second, on average. */
  readonly rate: number;
  /** A gust's peak force, N. */
  readonly strength: number;
}

/** **The lab's gusts** on the Warrior: what its Stand-up mode, the falls and the drills blow when they name gusts (`labGusts`). */
export const LAB_GUSTS: WindSettings = Object.freeze({ rate: .7, strength: 45 });

/**
 * **The lab's gusts on `model`'s body**: `LAB_GUSTS` with each gust's force scaled by its mass over
 * the Warrior's (`BodySpec.mass`, without what it holds), so a gust changes every body's speed
 * as much as his.
 */
export const labGusts = (model: BodyModel): WindSettings =>
  ({ rate: LAB_GUSTS.rate, strength: LAB_GUSTS.strength * (modelSpec(model).mass.value / modelSpec("workshop-fighter").mass.value) });

/** Still air. */
export const CALM: WindSettings = Object.freeze({ rate: 0, strength: 0 });

/** A gust under way: when it began, s of the world's clock, and the way it blows, rad about up (0 toward +z, growing to the right). */
interface Gust {
  readonly from: number;
  readonly toward: number;
}

interface WindState {
  /** The generator's word (`randomStream`). */
  word: number;
  /** The world's clock as the wind last blew, s. */
  time: number;
  gusts: Gust[];
  /** The force it gave in the last step, N, world (x, z). */
  force: [number, number];
  /** Gusts begun since it was made. */
  count: number;
}

interface Wind {
  readonly state: WindState;
  /** The settings it blows by now: changed, they hold from the next step. */
  settings: WindSettings;
  dispose(): void;
}

/** The level force of `gusts` at `time`, N, world (x, z), at `strength` N each at its peak. */
function gustForce(gusts: readonly Gust[], time: number, strength: number): [number, number] {
  let x = 0, z = 0;
  for (const gust of gusts) {
    const t = time - gust.from;
    if (t < 0 || t > GUST_SECONDS) continue;
    const f = strength * sin(Math.PI * t / GUST_SECONDS);
    x += f * sin(gust.toward);
    z += f * cos(gust.toward);
  }
  return [x, z];
}

/**
 * The wind's next physics step of `dt` at `time` s: a gust begins with the chance `rate` times
 * `dt`, the gusts over are dropped, and the force for the step is set. Returns the force, N, world (x, z).
 */
export function blow(state: WindState, settings: WindSettings, time: number, dt: number): readonly [number, number] {
  const random = randomStream(0);
  random.state.word = state.word;
  if (random.next() < settings.rate * dt) {
    state.gusts.push({ from: time, toward: 2 * Math.PI * random.next() });
    state.count++;
  }
  state.word = random.state.word;
  state.gusts = state.gusts.filter((gust) => time - gust.from <= GUST_SECONDS);
  state.time = time;
  state.force = gustForce(state.gusts, time, settings.strength);
  return state.force;
}

/** A fresh wind's state, drawing from `seed`. */
function windState(seed: number): WindState {
  return { word: seed >>> 0, time: 0, gusts: [], force: [0, 0], count: 0 };
}

/** Blow on `built`'s upper trunk in `world` by `settings`, drawing from `seed`, until disposed. */
export function startWind(built: BuiltBody, world: World, settings: WindSettings, seed: number): Wind | Refused {
  const trunk = built.segments.get("upperTrunk");
  if (!trunk) return { refused: `${built.spec.model} has no upper trunk for the wind` };
  const state = { ...windState(seed), settings }, turn = new Quaternion(), at = new Vector3(), impulse = new Vector3();
  const wind: Wind = {
    state,
    get settings() { return state.settings; },
    set settings(value) { state.settings = value; },
    dispose: () => hook.dispose(),
  };
  const hook = world.beforeStep(() => {
    const [fx, fz] = blow(state, wind.settings, world.time, world.dt);
    if (fx === 0 && fz === 0) return;
    trunk.pose.rotation.multiplyToRef(Quaternion.Inverse(trunk.rest), turn);
    const com = trunk.rigid.centre, o = trunk.frame.origin;
    at.set(com[0] - o[0], com[1] - o[1], com[2] - o[2]).applyRotationQuaternionToRef(turn, at).addInPlace(trunk.pose.position);
    trunk.body.applyImpulse(impulse.set(fx * world.dt, 0, fz * world.dt), at);
  });
  return wind;
}

/** A gust's force, N, as its slider reads it: with its share of a body of `weight`, N, once one is loaded. */
export const gustText = (strength: number, weight: number): string => weight > 0 ? `${strength} N, ${Math.round(100 * strength / weight)} %` : `${strength} N`;
