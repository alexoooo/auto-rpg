import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import type { BodyView } from "../body.ts";
import { fastestTurning, paceToward, turnAt, type StanceEnvelope } from "../control/stance-envelope.ts";
import type { StanceGoal, SwingGoal } from "../control/stance.ts";
import type { MusclePush, Pose } from "../control/motor.ts";
import type { Side } from "../spec/body.ts";
import { STANCE_GAIT, type GaitTuning } from "../control/stance-tuning.ts";
import { atan2, sin, cos, hypot } from "../math/real.ts";
import { wrap } from "../math/turn.ts";
import { deepFreeze } from "../state.ts";
import type { LegsAsked, LegsGoal, Skill } from "./skill.ts";

/**
 * How far under its reference height a body's centre of mass is held, m: the height every table
 * of the stance's record was measured at (`docs/reference/stance-tuning.md#stance-height`). A
 * crouch is beyond the stance: asked 8 cm or more lower, a human settles only about 1 cm lower,
 * and falls walking or stopping from there.
 */
export const STANCE_LOWER = 0.03;

/**
 * **A carriage**: a fighting pose the legs hold standing, as data. `width`, the soles' middles'
 * distance apart across the heading, m, which a walk keeps as its steps' width (`GaitTuning.width`);
 * null for the feet where they stand and the walk's own width (the square stance the body is built
 * in). `stagger`, how far the `lead` foot's sole stands ahead of the other's along the heading, m,
 * which a walk does not keep. `lower`, the centre of mass's lowering under its reference height, m.
 */
export interface Carriage {
  readonly width: number | null;
  readonly stagger: number;
  readonly lead: Side;
  readonly lower: number;
}

/** **The carriages**, by name: the square stance the body is built in. Another is one entry here. */
export const CARRIAGES = deepFreeze({
  square: { width: null, stagger: 0, lead: "left", lower: STANCE_LOWER },
} satisfies Readonly<Record<string, Carriage>>);

/** A carriage's name (`CARRIAGES`). */
export type CarriageName = keyof typeof CARRIAGES;

/** Whether `carriage` can be held: a positive width, or none and no stagger; a stagger and lowering finite and not negative. */
export const validCarriage = (carriage: Carriage): boolean =>
  (carriage.width === null ? carriage.stagger === 0 : Number.isFinite(carriage.width) && carriage.width > 0)
  && Number.isFinite(carriage.stagger) && carriage.stagger >= 0 && Number.isFinite(carriage.lower) && carriage.lower >= 0
  && (carriage.lead === "left" || carriage.lead === "right");

/** The speed of the centre of mass across the ground under which a stopped walk takes its carriage's footing, m/s. */
export const CARRIAGE_STILL = 0.1;

/** A carriage's walk: the stance's steps (`STANCE_GAIT`) at its width; made once a carriage. */
const carriageSteps = new WeakMap<Carriage, GaitTuning>();
const stepsOf = (carriage: Carriage, width: number): GaitTuning => {
  let steps = carriageSteps.get(carriage);
  if (!steps) carriageSteps.set(carriage, steps = deepFreeze({ ...STANCE_GAIT, width }));
  return steps;
};

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
 * **A body's legs, under the stance**: both feet bearing, the centre of mass held at a height
 * (its carriage's `lower` under the height it stands at in the reference pose, where none is asked), the
 * pelvis facing a heading, and walking at a velocity or standing. What it remembers (`LegsMemory`)
 * it keeps in the state it is made with.
 */
interface StanceLegs {
  /**
   * The stance goal for this control step: facing `heading` (rad about up, 0 facing +z, growing to
   * the right), walking at `walk` (m/s, forward along the heading and to its right) or, null,
   * standing, the centre of mass `height` over the soles. Null before the body's first step, when
   * its reference height is read.
   */
  goal(view: BodyView, heading: number, walk: readonly [forward: number, right: number] | null, height?: number): StanceGoal | null;
}

interface LegsMemory {
  /** The centre of mass's height over the soles in the reference pose (`BodyView.standing`), m; null before the first step. */
  reference: number | null;
  /** Rising: the height over the soles it was resumed at, m, and when, s of the world's clock; null at its height. */
  rising: { from: number; at: number } | null;
  /** The carriage held (`CARRIAGES`, or a configuration's). */
  carriage: Carriage;
}

function stanceLegs(state: LegsMemory): StanceLegs {
  return {
    goal(view, heading, walk, asked) {
      // The reference height is the body's (`BodyView.standing`), taken at the first view after a step.
      if (state.reference === null) {
        if (view.time <= view.born) return null;
        state.reference = view.standing;
      }
      let height = asked ?? state.reference - state.carriage.lower;
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
 * **How the feet are placed** (`LegsGoal.footing`): a foot further than `near` (m) from its place
 * steps there, as a walk's step is taken (`STANCE_GAIT`'s swing time and lift, the weight shifted
 * off it first); one step a foot for each footing asked. `near` is set, not measured
 * (`docs/reference/human-and-strikes.md#placing`).
 */
export const PLACING = { near: 0.02 } as const;

/**
 * **Legs**: what every locomotion part makes, and all a mind's skills ask of its legs. Each
 * control step the legs complete the legs goal (`goal`) as the legs' command, and say which way
 * they face and how fast they stop. What a walk under the stance says besides is its own
 * (`StanceWalk`): the readers of it ask whether the legs say it.
 */
export interface Locomotion extends Skill {
  /**
   * The legs goal `goal` completed this control step: the stance goal that carries out what it
   * sets and fills what it leaves out from its walk (`completed`), null before the body's first
   * step; or, for legs that drive themselves, their own drive (`LegsDrive`), which carries out
   * none of the stance's fields. Asked a `footing`, legs that place no feet stand.
   */
  goal(view: BodyView, goal: LegsAsked, dt: number): LegsDrive;
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
  /** Whether the feet have been placed at the footing last asked; absent, legs that place no feet. */
  readonly placed?: boolean;
  /**
   * How far short of the centre its last goal asked the stance held the centre of mass, m: the
   * asked place to the one the bearing soles hold (`StanceReading.place`), read standing; 0 with
   * no centre asked, or while a step is under way. Absent, legs that hold no centre.
   */
  readonly centreShort?: number;
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
}

/**
 * **`stance` as the legs goal `goal` asks it**: its bearing feet, heading, centre, pose, swing and
 * halt where the goal sets them; as it is where the goal sets none, or where there is no stance.
 */
export function completed(stance: StanceGoal | null, goal: LegsGoal): StanceGoal | null {
  if (!stance || goal.feet === undefined && goal.heading === undefined && goal.centre === undefined && goal.pose === undefined
    && goal.swing === undefined && !goal.halt) return stance;
  return { ...stance, ...(goal.feet === undefined ? {} : { feet: goal.feet }), ...(goal.halt ? { halt: true } : {}),
    ...(goal.heading === undefined ? {} : { heading: goal.heading }), ...(goal.centre === undefined ? {} : { centre: goal.centre }),
    ...(goal.pose === undefined ? {} : { pose: goal.pose }), ...(goal.swing === undefined ? {} : { swing: goal.swing }) };
}

/** The stance goal a legs' command asks (`LegsDrive`), or none where the legs drive themselves. */
export const stanceOf = (drive: LegsDrive): StanceGoal | null => drive.kind === "stance" ? drive.goal : null;

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
   * Whether the feet have been placed at the footing last asked, and stand: set while a goal asks a
   * footing, cleared by one that asks none. A footing is placed standing, facing the heading the
   * legs have: once no step is under way, the foot further from its place steps there, then the
   * other, each once for this footing; one within `PLACING.near` of its place stays.
   */
  readonly placed: boolean;
  /** What this walk was measured to hold with the body (`StanceEnvelope`); null where the body has none. */
  readonly envelope: StanceEnvelope | null;
}

/**
 * **What the legs ask** (`Locomotion.goal`): the stance's goal, or the legs
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
  /** Where the carriage's feet stand, taken where the walk last stopped; null walking, or in a carriage of no width. */
  stood: Footing | null;
  /** The centre its last stance goal asked, world (x, z), m; null where it asked none. */
  asked: readonly [number, number] | null;
  /** How far short of `asked` the stance held the centre of mass, m (`Locomotion.centreShort`). */
  short: number;
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

export function locomotion(envelope: StanceEnvelope | null, turnLimit?: number, turnStartup?: TurnStartup, carriage: Carriage = CARRIAGES.square): StanceWalk {
  if (!validTurnLimit(turnLimit)) throw new Error("locomotion turn limit must be finite and positive");
  if (!validTurnStartup(turnStartup)) throw new Error("locomotion turn startup needs a finite positive interval and ceiling");
  if (!validCarriage(carriage)) throw new Error("locomotion carriage needs a positive width or none, and a finite stagger and lowering");
  const state: LocomotionState = { reference: null, rising: null, carriage, heading: 0, pace: 0, going: 0, placing: null, placed: false, stood: null,
    asked: null, short: 0, ...(turnStartup ? { walkTime: 0 } : {}) };
  const legs = stanceLegs(state);
  const acrossScratch = new Vector3();
  const apart = (a: readonly [number, number], b: readonly [number, number]): number => hypot(a[0] - b[0], a[1] - b[1]);
  /** The heading the body faces: the reference pose's left-to-right axis is x, and facing h about up turns it to (cos h, 0, -sin h). */
  const facing = (view: BodyView): number => {
    const across = acrossScratch.set(1, 0, 0).applyRotationQuaternionToRef(view.root.rotation, acrossScratch);
    return atan2(-across.z, across.x);
  };
  /** Until its first step the stance faces as the body was built. */
  const born = (view: BodyView): void => { if (view.time <= view.born) state.heading = facing(view); };
  const place = (view: BodyView, footing: Footing, height?: number): StanceGoal | null => {
    born(view);
    state.pace = 0;
    state.going = 0;
    if (turnStartup) state.walkTime = 0;
    const base = legs.goal(view, state.heading, null, height);
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
    get centreShort() { return state.short; },
    resume(view) {
      state.heading = facing(view);
      state.pace = 0;
      state.going = 0;
      if (turnStartup) state.walkTime = 0;
      state.placing = null;
      state.placed = false;
      state.stood = null;
      state.asked = null;
      state.short = 0;
      state.rising = { from: view.stance.centre.y - view.stance.support.y, at: view.time };
    },
    goal(view, goal, dt) {
      const s = view.stance, asked = state.asked;
      state.short = asked && s.phase === "stand" ? hypot(asked[0] - s.place.x, asked[1] - s.place.z) : 0;
      if (goal.carriage !== undefined && CARRIAGES[goal.carriage] !== state.carriage) { state.carriage = CARRIAGES[goal.carriage]; state.stood = null; }
      const held = state.carriage;
      let stance: StanceGoal | null;
      if (goal.footing) { state.stood = null; stance = place(view, goal.footing, goal.height); }
      else if (goal.walk === null && held.width !== null && (state.stood || still(view))) {
        // Stopped, the feet are set where the carriage stands them; no footing was asked.
        state.stood ??= footingOf(view, held, held.width);
        stance = place(view, state.stood, goal.height);
        state.placed = false;
      } else { state.stood = null; stance = walking(view, goal.walk, goal.face, dt, goal.height); }
      if (stance && held.width !== null) stance = { ...stance, gait: stepsOf(held, held.width) };
      const done = completed(stance, goal);
      state.asked = done?.centre ?? null;
      return { kind: "stance", goal: done };
    },
  };

  /** Whether the body stands still enough to take its carriage's footing: no step under way, and slower than `CARRIAGE_STILL`. */
  function still(view: BodyView): boolean {
    const s = view.stance;
    return view.time > view.born && s.phase === "stand" && hypot(s.velocity.x, s.velocity.z) < CARRIAGE_STILL;
  }

  /** Where `held` stands the soles' middles about the centre of mass across the ground, facing the legs' heading. */
  function footingOf(view: BodyView, held: Carriage, width: number): Footing {
    const c = view.stance.centre, h = state.heading, fx = sin(h), fz = cos(h), rx = cos(h), rz = -sin(h);
    const ahead = (side: Side) => (side === held.lead ? held.stagger : -held.stagger) / 2, across = (side: Side) => side === "left" ? -width / 2 : width / 2;
    const at = (side: Side): readonly [number, number] => [c.x + rx * across(side) + fx * ahead(side), c.z + rz * across(side) + fz * ahead(side)];
    return { left: at("left"), right: at("right") };
  }

  /** The stance goal walking at `asked` toward `face`, or standing (`StanceWalk`). */
  function walking(view: BodyView, asked: readonly [number, number] | null, face: number, dt: number, height?: number): StanceGoal | null {
    let walk = asked;
    born(view);
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
    return legs.goal(view, state.heading, walk, height);
  }
}
