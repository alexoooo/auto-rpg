import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import type { BodyView } from "../body.ts";
import { fastestTurning, paceToward, turnAt, type StanceEnvelope } from "../control/stance-envelope.ts";
import type { StanceGoal, SwingGoal } from "../control/stance.ts";
import type { MusclePush, Pose } from "../control/motor.ts";
import type { Side } from "../spec/body.ts";
import { STANCE_GAIT } from "../control/stance-tuning.ts";
import { atan2, sin, cos, hypot } from "../math/real.ts";
import { wrap } from "../math/turn.ts";
import type { Skill } from "./skill.ts";

/**
 * How far under its reference height a body's centre of mass is held, m: the height every table
 * of the stance's record was measured at (`docs/reference/stance-tuning.md#stance-height`). A
 * crouch is beyond the stance: asked 8 cm or more lower, a human settles only about 1 cm lower,
 * and falls walking or stopping from there.
 */
export const STANCE_LOWER = 0.03;

/**
 * How long a resumed body's asked height takes to rise from where its centre of mass is to the
 * stance's, s, by a smoothstep: a stance asked its full height at once from a crouch drives the
 * knees straight under a centre of mass that has not come over the feet, and the body falls
 * (`docs/reference/rising.md#the-handover`).
 */
export const RISING_SECONDS = 1.3;

/** How fast the stance's walk is asked to slow to a stop, m/s² (`Locomotion.stopping`): a controller setting. */
export const STANCE_STOPPING = 0.5;

/**
 * **A body's legs, under the stance**: both feet bearing, the centre of mass held `lower` under
 * the height it stands at in the reference pose, the pelvis facing a heading, and walking at a
 * velocity or standing. What it remembers (`LegsMemory`) it keeps in the state it is made with.
 */
interface StanceLegs {
  /**
   * The stance goal for this control step: facing `heading` (rad about up, 0 facing +z, growing to
   * the right), walking at `walk` (m/s, forward along the heading and to its right) or, null,
   * standing. Null before the body's first step, when its reference height is read.
   */
  goal(view: BodyView, heading: number, walk: readonly [forward: number, right: number] | null, lower?: number): StanceGoal | null;
}

interface LegsMemory {
  /** The centre of mass's height over the soles in the reference pose (`BodyView.standing`), m; null before the first step. */
  reference: number | null;
  /** Rising: the height over the soles it was resumed at, m, and when, s of the world's clock; null at its height. */
  rising: { from: number; at: number } | null;
}

function stanceLegs(state: LegsMemory): StanceLegs {
  return {
    goal(view, heading, walk, lower = STANCE_LOWER) {
      // The reference height is the body's (`BodyView.standing`), taken at the first view after a step.
      if (state.reference === null) {
        if (view.time <= view.born) return null;
        state.reference = view.standing;
      }
      let height = state.reference - lower;
      const rising = state.rising;
      if (rising) {
        const u = (view.time - rising.at) / RISING_SECONDS;
        if (u >= 1 || rising.from >= height) state.rising = null;
        else height = rising.from + (height - rising.from) * u * u * (3 - 2 * u);
      }
      // Forward is (sin h, cos h) across the ground; the right, (cos h, -sin h).
      const across = walk
        ? [walk[0] * sin(heading) + walk[1] * cos(heading), walk[0] * cos(heading) - walk[1] * sin(heading)] as const
        : null;
      return { feet: ["left", "right"], centre: null, height, heading, walk: across };
    },
  };
}

/** Where each sole's middle goes, world (x, z), m: a stance taken at a place. */
export type Footing = Readonly<Record<Side, readonly [number, number]>>;

/**
 * **How the feet are placed** (`Locomotion.place`): a foot further than `near` (m) from its place
 * steps there, as a walk's step is taken (`STANCE_GAIT`'s swing time and lift, the weight shifted
 * off it first); one step a foot for each footing asked. `near` is set, not measured
 * (`docs/reference/human-and-strikes.md#placing`).
 */
export const PLACING = { near: 0.02 } as const;

/**
 * **Legs**: what every locomotion part makes, and all a mind's skills ask of its legs. Each
 * control step the legs make an intent's walk and facing the legs' command (`goal`, or `drive`
 * for legs that drive the muscles themselves), and say which way they face and how fast they
 * stop. What a walk under the stance says besides is its own (`StanceWalk`): the readers of it
 * ask whether the legs say it.
 */
export interface Locomotion extends Skill {
  /**
   * The stance goal for `walk` and `face` this control step (null before the body's first step),
   * `destination` m from where the tactics are taking the body, absent where they take it nowhere.
   */
  goal(view: BodyView, walk: readonly [forward: number, right: number] | null, face: number, dt: number, lower?: number, destination?: number): StanceGoal | null;
  /** The heading the legs face, rad: the frame a walk is asked in. */
  readonly heading: number;
  /**
   * How fast it slows to a stop, m/s²: the deceleration the movement pipeline brakes by before a
   * place and a corner (`travelSpeed`, `src/core/mind/travel.ts`); 0 for legs that do not walk, which the speed rule takes nowhere.
   */
  readonly stopping: number;
  /** Its memory (`src/core/state.ts`). */
  readonly state: object;
  /** The walk's speed asked, m/s (0 standing); absent, legs that do not say. */
  readonly pace?: number;
  /** The height the legs hold the centre of mass at, m, null before the body's first step; absent, legs that hold none. */
  readonly reference?: number | null;
  /**
   * What the legs were measured to hold with the body (`StanceEnvelope`), which caps their walk and
   * turn and which tactics plan by (`Sight.envelope`); null or absent where they state none.
   */
  readonly envelope?: StanceEnvelope | null;
  /**
   * The stance goal that sets the feet at `footing` (`StanceWalk.place`); absent, legs that place no
   * feet, which a skill that asks a footing finds standing (`goal` with no walk).
   */
  place?(view: BodyView, footing: Footing, lower?: number): StanceGoal | null;
  /** Whether the feet have been placed at the footing last asked; absent with `place`. */
  readonly placed?: boolean;
  /**
   * The arms' posture as this walk swings them, for the arms no other skill holds (`skillSet`);
   * absent or null, a walk that leaves them in the guard.
   */
  arms?(view: BodyView): Pose | null;
  /**
   * For a walk that runs as well, whether it may run from now on: told not, it walks no faster than
   * its walk, and its envelope is its walk's. Absent, a walk that does not run.
   */
  runs?(may: boolean): void;
  /**
   * In place of `goal`, for a walk that may drive the legs itself: for `walk` and `face` this
   * control step, a stance goal as `goal` gives one, or the legs' own drive (`LegsDrive`). Absent,
   * a walk is the stance's, and the skill set asks `goal`.
   */
  drive?(view: BodyView, walk: readonly [forward: number, right: number] | null, face: number, dt: number, lower?: number, destination?: number): LegsDrive;
}

/**
 * **The stance walk** (`locomotion`): an intent's walk and facing made a stance goal, within what the stance
 * holds with the body (`StanceEnvelope`, `Body.envelope`).
 *
 * - **The walk** is the intent's velocity (forward along the heading and to its right, m/s), its
 *   speed capped at the envelope's fastest walk that way (`paceToward`). None stands.
 * - **The heading** turns toward the intent's facing only while the body walks, as the stance
 *   turns (each step lands its foot facing the heading; standing, a pelvis turned a quarter over
 *   planted feet falls), no faster than the envelope turns at the pace under way (`turnAt`): the
 *   pace last asked, or one asked before it, slowing no faster than the walk is asked to stop
 *   (`STANCE_STOPPING`), so a body braking from a faster walk turns as that walk does. The
 *   envelope's turns were measured from the walk's setting off as well as under way, at the pace
 *   asked. A heading still to turn at a pace the envelope turns none at is walked no faster
 *   than the fastest pace it turns at (`fastestTurning`), or it would never turn.
 *
 * An optional `turnLimit` also bounds heading speed below the envelope's limit. Without an
 * envelope, the walk is uncapped and the heading follows the intent within that optional limit.
 * The unassisted Warrior calibration is recorded in `docs/reference/combat-locomotion.md`.
 *
 * Resumed (`Skill.resume`), it stands facing the way the pelvis faces (read from its left-to-right
 * axis, which says it however far forward the pelvis is pitched), with no footing asked, and
 * asks the height the centre of mass is at, rising to the stance's over `RISING_SECONDS`, its
 * feet where they are. The reference height stays: it is the body's.
 */
export interface StanceWalk extends Locomotion {
  readonly pace: number;
  /** The centre of mass's height over the soles in the reference pose (`BodyView.standing`), m; null before the body's first step. */
  readonly reference: number | null;
  /**
   * The stance goal that sets the feet at `footing`, standing, facing the heading it has: once no
   * step is under way, the foot further from its place steps there, then the other, each once for
   * this footing; one within `PLACING.near` of its place stays. Null before the body's first step.
   */
  place(view: BodyView, footing: Footing, lower?: number): StanceGoal | null;
  /** Whether the feet have been placed at the footing last asked, and stand: set by `place`, cleared by `goal`. */
  readonly placed: boolean;
  /** What this walk was measured to hold with the body (`StanceEnvelope`); null where the body has none. */
  readonly envelope: StanceEnvelope | null;
}

/**
 * **What a walk that drives the legs asks** (`Locomotion.drive`): the stance's goal, or the legs
 * driven with no stance: some freedoms by their muscles alone, as pushes (`MusclePush`), and
 * the rest by the servo, toward the angles of `posture`, laid over the command's.
 */
export type LegsDrive =
  | { readonly kind: "stance"; readonly goal: StanceGoal | null }
  | { readonly kind: "drive"; readonly posture: Pose; readonly pushes: readonly MusclePush[] };

/** **What the locomotion skill remembers.** */
interface LocomotionState extends LegsMemory {
  heading: number;
  pace: number;
  /** The pace under way, m/s: the pace last asked, or one asked before, slowing no faster than `STANCE_STOPPING`. */
  going: number;
  /** Completed time in the current requested walk, capped at the optional startup interval. */
  walkTime?: number;
  placing: Placing | null;
  placed: boolean;
}

/** The footing being placed, the feet that have stepped to it, and the step under way. */
interface Placing {
  footing: Footing;
  stepped: Record<Side, boolean>;
  step: SwingGoal | null;
  lifted: boolean;
}

/** An omitted ceiling retains the envelope; a granted ceiling is finite and positive. */
export function validTurnLimit(turnLimit?: number): boolean {
  return turnLimit === undefined || (Number.isFinite(turnLimit) && turnLimit > 0);
}

/** An optional startup turn ceiling lasts this many seconds of a continuous requested walk. */
export interface TurnStartup { readonly seconds: number; readonly limit: number }

/** A startup interval and ceiling are finite and positive; omitted retains ordinary turning. */
export function validTurnStartup(startup?: TurnStartup): boolean {
  return startup === undefined || (startup !== null && Number.isFinite(startup.seconds) && startup.seconds > 0
    && Number.isFinite(startup.limit) && startup.limit > 0);
}

export function locomotion(envelope: StanceEnvelope | null, turnLimit?: number, turnStartup?: TurnStartup): StanceWalk {
  if (!validTurnLimit(turnLimit)) throw new Error("locomotion turn limit must be finite and positive");
  if (!validTurnStartup(turnStartup)) throw new Error("locomotion turn startup needs a finite positive interval and ceiling");
  const state: LocomotionState = { reference: null, rising: null, heading: 0, pace: 0, going: 0, placing: null, placed: false,
    ...(turnStartup ? { walkTime: 0 } : {}) };
  const legs = stanceLegs(state);
  const acrossScratch = new Vector3();
  const apart = (a: readonly [number, number], b: readonly [number, number]): number => hypot(a[0] - b[0], a[1] - b[1]);
  const place = (view: BodyView, footing: Footing, lower?: number): StanceGoal | null => {
    state.pace = 0;
    state.going = 0;
    if (turnStartup) state.walkTime = 0;
    const base = legs.goal(view, state.heading, null, lower);
    if (!base) return null;
    const s = view.stance, was = state.placing;
    if (was && (apart(was.footing.left, footing.left) > PLACING.near || apart(was.footing.right, footing.right) > PLACING.near)) state.placing = null;
    const placing = state.placing ??= { footing, stepped: { left: false, right: false }, step: null, lifted: false };
    if (placing.step) {
      // A step is over when the stance, having taken it, stands again.
      if (s.phase !== "stand") placing.lifted = true;
      else if (placing.lifted) { placing.stepped[placing.step.foot] = true; placing.step = null; }
      if (placing.step) return { ...base, swing: placing.step };
    }
    state.placed = false;
    // A step of the stance's own under way is finished first.
    if (s.phase !== "stand") return base;
    const off = (foot: Side): number => placing.stepped[foot] ? 0 : apart([s.soles[foot].x, s.soles[foot].z], placing.footing[foot]);
    const foot: Side = off("left") >= off("right") ? "left" : "right";
    if (off(foot) <= PLACING.near) { state.placed = true; return base; }
    placing.step = { foot, to: placing.footing[foot], seconds: STANCE_GAIT.seconds, lift: STANCE_GAIT.lift, shift: true };
    placing.lifted = false;
    return { ...base, swing: placing.step };
  };
  return {
    state, envelope, stopping: STANCE_STOPPING,
    get heading() { return state.heading; },
    get pace() { return state.pace; },
    get reference() { return state.reference; },
    get placed() { return state.placed; },
    resume(view) {
      // The reference pose's left-to-right axis is x, and facing h about up turns it to (cos h, 0, -sin h).
      const across = acrossScratch.set(1, 0, 0).applyRotationQuaternionToRef(view.root.rotation, acrossScratch);
      state.heading = atan2(-across.z, across.x);
      state.pace = 0;
      state.going = 0;
      if (turnStartup) state.walkTime = 0;
      state.placing = null;
      state.placed = false;
      state.rising = { from: view.stance.centre.y - view.stance.support.y, at: view.time };
    },
    place,
    goal(view, walk, face, dt, lower) {
      state.placing = null;
      state.placed = false;
      if (!walk) { state.pace = 0; state.going = Math.max(0, state.going - STANCE_STOPPING * dt); if (turnStartup) state.walkTime = 0; }
      else if (view.time > view.born) {
        const turn = wrap(face - state.heading);
        const startupLimit = turnStartup && state.walkTime! < turnStartup.seconds ? turnStartup.limit : Infinity;
        if (envelope || turnLimit !== undefined || turnStartup) {
          const rate = Math.min(envelope ? turnAt(envelope, Math.max(state.pace, state.going)) : Infinity, turnLimit ?? Infinity, startupLimit) * dt;
          state.heading += Math.max(-rate, Math.min(rate, turn));
        } else state.heading += turn;
        const speed = hypot(walk[0], walk[1]);
        let most = envelope ? paceToward(envelope, walk[0], walk[1]) : Infinity;
        // A heading still to turn at a pace the envelope turns none at is walked at the fastest pace it turns at.
        if (envelope && wrap(face - state.heading) !== 0 && turnAt(envelope, Math.min(speed, most)) === 0) most = Math.min(most, fastestTurning(envelope));
        if (speed > most) walk = [walk[0] * most / speed, walk[1] * most / speed];
        state.pace = Math.min(speed, most);
        state.going = Math.max(state.pace, state.going - STANCE_STOPPING * dt);
        if (turnStartup) state.walkTime = speed > 0 ? Math.min(turnStartup.seconds, state.walkTime! + dt) : 0;
      } else state.pace = hypot(walk[0], walk[1]);
      return legs.goal(view, state.heading, walk, lower);
    },
  };
}
