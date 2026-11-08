import type { StanceGoal, SwingGoal } from "../../control/stance/goal.ts";
import type { LegsDrive, Locomotion, LocomotionContext } from "../framework/locomotion-part.ts";
import { supportHeight } from "../../control/support-reference.ts";
import { Quaternion, Vector3 } from "../../core/math/vector.ts";

import type { BodyView } from "../../control/body.ts";
import { fastestTurning, heldPace, turnAt, type StanceEnvelope } from "../../control/stance/stance-envelope.ts";
import type { BearingEnd } from "../../core/bodies/spec/body.ts";
import { STANCE_GAIT, type GaitTuning } from "../../control/stance/stance-tuning.ts";
import { atan2, sin, cos, hypot } from "../../core/math/real.ts";
import { wrap } from "../../core/math/turn.ts";
import { deepFreeze } from "../../core/state.ts";
import { onStanceFeet, type SidedAsk, type StanceFeet } from "./stance-feet.ts";
import { ALL_MET, FIELD_BIT, fieldsOf, setIn, type LegsField } from "../framework/skill.ts";
import type { Readiness } from "../framework/action.ts";
import { type Side, SIDES } from "../../core/bodies/bilateral.ts";

/**
 * How far under its reference height a body's centre of mass is held, m: the height the stance's
 * tuned constants (`stance-tuning.ts`) are set at, so a change to it calls for them again. A
 * crouch is beyond the stance: asked much lower, a human settles barely lower and falls walking or
 * stopping from there.
 */
export const STANCE_LOWER = 0.03;

/** The legs' answers to whether they can carry the body: they can, or it is down. */
const LEGS_READY: Readiness = Object.freeze({ kind: "ready" }), LEGS_DOWN: Readiness = Object.freeze({ kind: "blocked", reason: "body is down" });

/**
 * **Whether the legs can carry the body** now, as an executor's readiness answers (`Readiness`): not
 * while it is down (`BodyView.down`).
 */
export const legsReadiness = (view: Pick<BodyView, "down">): Readiness => view.down ? LEGS_DOWN : LEGS_READY;

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

/** Whether `carriage` can be held: a positive width, or none and no stagger; a stagger and lowering finite and not negative. */
export const validCarriage = (carriage: Carriage): boolean =>
  !!carriage && typeof carriage === "object" && !Array.isArray(carriage) && (carriage.width === null ? carriage.stagger === 0 : Number.isFinite(carriage.width) && carriage.width > 0)
  && Number.isFinite(carriage.stagger) && carriage.stagger >= 0 && Number.isFinite(carriage.lower) && carriage.lower >= 0
  && (carriage.lead === "left" || carriage.lead === "right");

/** Idle placement's quiet horizontal speed before beginning a step, m/s. */
const CARRIAGE_STILL = 0.1;
/** Requested horizontal plan speed during an idle placement's weight shift, m/s. */
const IDLE_SHIFT_SPEED = 0.1;
/**
 * How long a body stands still on both feet before it moves them to its neutral footing, s. Set so
 * that a body settling after a rise or a catch step can come to rest first, rather than being set
 * moving again by a shuffle it does not need yet.
 */
const IDLE_SETTLE = 0.6;
/** Mean stationary foot speed, m/s, keeping the leg reaction quiet while the other sole bears. */
const IDLE_FOOT_SPEED = 0.5;

/** A carriage's stride at its requested width, cached per stride and carriage. */
const carriageSteps = new WeakMap<GaitTuning, WeakMap<Carriage, GaitTuning>>();
const stepsOf = (carriage: Carriage, width: number, base = STANCE_GAIT): GaitTuning => {
  let carriages = carriageSteps.get(base);
  if (!carriages) carriageSteps.set(base, carriages = new WeakMap());
  let steps = carriages.get(carriage);
  if (!steps) carriages.set(carriage, steps = deepFreeze({ ...base, width }));
  return steps;
};

/**
 * How long a resumed body's asked height takes to rise from where its centre of mass is to the
 * stance's, s, by a smoothstep: a stance asked its full height at once from a crouch drives the
 * knees straight under a centre of mass that has not come over the feet, and the body falls.
 */
const RISING_SECONDS = 1.3;

/** How fast the stance's walk is asked to slow to a stop, m/sÃ‚Â² (`Locomotion.stopping`): a controller setting. */
export const STANCE_STOPPING = 0.5;

/**
 * How long the stance's walk goes on at its speed once asked to slow, s (`Locomotion.lag`): the step
 * under way lands where it was planned and the next is planned at the pace the walk has come down
 * to, so it goes on through a swing and a double support (`STANCE_GAIT`'s).
 */
const STANCE_LAG = STANCE_GAIT.seconds + (STANCE_GAIT.transfer ?? 0);

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
   * its reference height is read. The walk uses `walkHeading` when supplied; `heading` remains
   * the stance's turning target.
   */
  goal(view: BodyView, heading: number, walk: readonly [forward: number, right: number] | null, height?: number, walkHeading?: number): StanceGoal | null;
}

interface LegsMemory {
  /** The centre of mass's height over the soles in the reference pose (`BodyView.standing`), m; null before the first step. */
  reference: number | null;
  /** Rising: the height over the soles it was resumed at, m, and when, s of the world's clock; null at its height. */
  rising: { from: number; at: number } | null;
  /** The carriage held (`CARRIAGES`, or a configuration's). */
  carriage: Carriage;
}

function stanceLegs(state: LegsMemory, feet: readonly BearingEnd[]): StanceLegs {
  return {
    goal(view, heading, walk, asked, walkHeading = heading) {
      // The reference height is the body's (`BodyView.standing`), taken at the first view after a step.
      if (state.reference === null) {
        if (view.time <= view.born) return null;
        state.reference = supportHeight(view);
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
        ? [walk[0] * sin(walkHeading) + walk[1] * cos(walkHeading), walk[0] * cos(walkHeading) - walk[1] * sin(walkHeading)] as const
        : null;
      return { feet, centre: null, height, heading, walk: across };
    },
  };
}

/** Where each sole's middle goes, world (x, z), m: a stance taken at a place. */
export type Footing = Readonly<Record<Side, readonly [number, number]>>;

/**
 * **How the feet are placed** (`LegsGoal.footing`): a foot further than `near` (m) from its place
 * steps there, as a walk's step is taken (`STANCE_GAIT`'s swing time and lift, the weight shifted
 * off it first); a step that lands short is asked again at the same target.
 */
const PLACING = { near: 0.02 } as const;


/** Construction settings; recovery legs omit idleFooting to keep their supports planted. */
interface WalkOptions {
  /** A configured gait's current stride; omitted leaves stride planning to the motor. */
  readonly gait?: () => GaitTuning | undefined;
  readonly segments: Readonly<Record<Side, string>>;
  readonly turnLimit?: number;
  readonly turnStartup?: TurnStartup;
  readonly carriage?: Carriage;
  readonly idleFooting?: { readonly offsets: Footing; readonly length: number };
}


/**
 * **`stance` as the legs goal `goal` asks it**: its bearing feet, heading, centre, pose, swing and
 * halt where the goal sets them; as it is where the goal sets none, or where there is no stance.
 */
export function completed(stance: StanceGoal | null, goal: SidedAsk): StanceGoal | null {
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
 *   speed capped at the envelope's fastest walk that way (`heldPace`). None stands.
 * - **The heading** turns toward the intent's facing only while the body walks, as the stance
 *   turns (each step lands its foot facing the heading; standing, a pelvis turned a quarter over
 *   planted feet falls), no faster than the envelope turns at the pace under way (`turnAt`): the
 *   pace last asked, or one asked before it, slowing no faster than the walk is asked to stop
 *   (`STANCE_STOPPING`), so a body braking from a faster walk turns as that walk does. The
 *   envelope's turns were measured from the walk's setting off as well as under way, at the pace
 *   asked. A heading still to turn at a pace the envelope turns none at is walked no faster
 *   than the fastest pace it turns at (`fastestTurning`), or it would never turn.
 *
 * An optional `turnLimit` also bounds heading speed below the envelope's limit; it never raises
 * it. Without an envelope, the walk is uncapped and the heading follows the intent within that
 * optional limit.
 *
 * Resumed (`Skill.resume`), it stands facing the way the pelvis faces (read from its left-to-right
 * axis, which says it however far forward the pelvis is pitched), with no footing asked, and
 * asks the height the centre of mass is at, rising to the stance's over `RISING_SECONDS`, its
 * feet where they are. The reference height stays: it is the body's.
 */
interface StanceWalk extends Locomotion {
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
  /** The selected gait's current limits (`StanceEnvelope`); null where the body has none. */
  readonly envelope: StanceEnvelope | null;
}


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
  idle: { seconds: number; target: Footing | null; centre: [number, number] | null };
  /** The centre and the height its last stance goal asked, world (x, z) and over the soles, m; null where it asked none. */
  asked: readonly [number, number] | null;
  askedHeight: number | null;
  /** What of its last goal it did not carry out (`Locomotion.unmet`). */
  unmet: { fields: readonly LegsField[]; centre: number; height: number };
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

/**
 * An optional heading-speed ceiling, `limit` rad/s, for the first `seconds` of a continuous asked
 * walk. Standing, placing a footing, resuming after recovery or a zero-speed ask starts the
 * interval again. Like `turnLimit`, it only lowers the envelope's turn.
 */
export interface TurnStartup { readonly seconds: number; readonly limit: number }

/** A startup interval and ceiling are finite and positive; omitted retains ordinary turning. */
export function validTurnStartup(startup?: TurnStartup): boolean {
  return startup === undefined || (startup !== null && Number.isFinite(startup.seconds) && startup.seconds > 0
    && Number.isFinite(startup.limit) && startup.limit > 0);
}

export function locomotion(feet: StanceFeet, limits: StanceEnvelope | null | (() => StanceEnvelope | null), { gait, turnLimit, turnStartup, carriage = CARRIAGES.square, idleFooting, segments }: WalkOptions): StanceWalk {
  const envelopeNow = (): StanceEnvelope | null => typeof limits === "function" ? limits() : limits;
  if (!validTurnLimit(turnLimit)) throw new Error("locomotion turn limit must be finite and positive");
  if (!validTurnStartup(turnStartup)) throw new Error("locomotion turn startup needs a finite positive interval and ceiling");
  if (!validCarriage(carriage)) throw new Error("locomotion carriage needs a positive width or none, and a finite stagger and lowering");
  const state: LocomotionState = { reference: null, rising: null, carriage, heading: 0, pace: 0, going: 0, placing: null, placed: false, stood: null, idle: { seconds: 0, target: null, centre: null },
    asked: null, askedHeight: null, unmet: { ...ALL_MET }, ...(turnStartup ? { walkTime: 0 } : {}) };
  const names = Object.freeze(Object.keys(feet)), legs = stanceLegs(state, names);
  /** The stance's foot on each side, by name (`StanceFeet`). */
  const ends = { left: names.find((end) => feet[end] === "left")!, right: names.find((end) => feet[end] === "right")! };
  /** The middle of the sole on `side`, world, as the stance last read it (`StanceEnd.middle`). */
  const soleOf = (view: BodyView, side: Side) => view.stance.ends[ends[side]]!.middle;
  const acrossScratch = new Vector3(), footTurn = new Quaternion(), footInverse = new Quaternion();
  /** A sole's yaw relative to a heading (the legs' unless given), rad. Effectors report turns relative to the body frame. */
  const turned = (view: BodyView, side: Side, heading = state.heading): number => {
    const effector = view.effectors?.[segments[side]];
    if (effector) view.root.rotation.multiplyToRef(effector.rotation, footTurn);
    else {
      const observed = view.segments[segments[side]];
      if (!observed) throw new Error(`no physical stance segment ${segments[side]}`);
      const rest = observed.rest;
      Quaternion.InverseToRef(footInverse.set(rest.x, rest.y, rest.z, rest.w), footInverse);
      observed.rotation.multiplyToRef(footInverse, footTurn);
    }
    return Math.abs(wrap(atan2(2 * (footTurn.x * footTurn.z + footTurn.w * footTurn.y),
      1 - 2 * (footTurn.x * footTurn.x + footTurn.y * footTurn.y)) - heading));
  };
  const apart = (a: readonly [number, number], b: readonly [number, number]): number => hypot(a[0] - b[0], a[1] - b[1]);
  /** The heading the body faces: the reference pose's left-to-right axis is x, and facing h about up turns it to (cos h, 0, -sin h). */
  const facing = (view: BodyView): number => {
    const across = acrossScratch.set(1, 0, 0).applyRotationQuaternionToRef(view.root.rotation, acrossScratch);
    return atan2(-across.z, across.x);
  };
  /** Until its first step the stance faces as the body was built. */
  const born = (view: BodyView): void => { if (view.time <= view.born) state.heading = facing(view); };
  const place = (view: BodyView, footing: Footing, height?: number, near: number = PLACING.near, alignment?: number, shiftSpeed?: number): StanceGoal | null => {
    born(view);
    state.pace = 0;
    state.going = 0;
    if (turnStartup) state.walkTime = 0;
    const base = legs.goal(view, state.heading, null, height);
    if (!base) return null;
    const s = view.stance, was = state.placing;
    if (was && (apart(was.footing.left, footing.left) > PLACING.near || apart(was.footing.right, footing.right) > PLACING.near)) state.placing = null;
    const placing = state.placing ??= { footing, stepped: { left: false, right: false }, step: null, lifted: false };
    const error = (foot: Side): number => Math.max(apart([soleOf(view, foot).x, soleOf(view, foot).z], placing.footing[foot]),
      alignment === undefined ? 0 : turned(view, foot) * near / alignment);
    if (placing.step) {
      // The stance ending a swing proves contact, not that the foot reached its place or heading.
      if (s.phase !== "stand") placing.lifted = true;
      else if (placing.lifted && s.ends[placing.step.foot]!.touching) {
        const side = feet[placing.step.foot]!;
        placing.stepped[side] = error(side) <= near;
        placing.step = null;
        // The stance keeps an identical swing completed until its command is released.
        if (!placing.stepped[side]) { state.placed = false; return { ...base, swing: null }; }
      }
      if (placing.step) return { ...base, swing: placing.step };
    }
    state.placed = false;
    // A step of the stance's own under way is finished first.
    if (s.phase !== "stand") return base;
    const off = (foot: Side): number => placing.stepped[foot] ? 0 : error(foot);
    const foot: Side = off("left") >= off("right") ? "left" : "right";
    if (off(foot) <= near) { state.placed = true; return base; }
    // Stationary placement carries the foot gently as well as shifting the body gently.
    const seconds = shiftSpeed === undefined ? STANCE_GAIT.seconds
      : Math.max(STANCE_GAIT.seconds, apart([soleOf(view, foot).x, soleOf(view, foot).z], placing.footing[foot]) / IDLE_FOOT_SPEED);
    placing.step = { foot: ends[foot], to: placing.footing[foot], seconds, lift: STANCE_GAIT.lift, shift: true,
      ...(shiftSpeed === undefined ? {} : { shiftSpeed, capture: "hold" as const }) };
    placing.lifted = false;
    return { ...base, swing: placing.step };
  };
  return {
    state, get envelope() { return envelopeNow(); }, supports: names, stopping: STANCE_STOPPING, lag: STANCE_LAG,
    get lower() { return state.carriage.lower; },
    get heading() { return state.heading; },
    get pace() { return state.pace; },
    get reference() { return state.reference; },
    get placed() { return state.placed; },
    get unmet() { return state.unmet; },
    resume(view) {
      state.heading = facing(view);
      state.pace = 0;
      state.going = 0;
      if (turnStartup) state.walkTime = 0;
      state.placing = null;
      state.placed = false;
      state.stood = null;
      state.idle.seconds = 0; state.idle.target = null; state.idle.centre = null;
      state.asked = null;
      state.askedHeight = null;
      state.unmet.fields = ALL_MET.fields; state.unmet.centre = 0; state.unmet.height = 0;
      state.rising = { from: view.stance.centre.y - view.stance.support.y, at: view.time };
    },
    goal(view, given, dt, context) {
      // The goal's ends made the stance's feet; an end the stance does not stand on is unmet.
      const { goal, refused } = onStanceFeet(given, feet);
      // What the last goal asked, as the stance held it standing; and the gait by name, which the stance walk has none of.
      const s = view.stance, asked = state.asked, height = state.askedHeight, unmet = state.unmet, standing = s.phase === "stand";
      unmet.centre = asked && standing ? hypot(asked[0] - s.place.x, asked[1] - s.place.z) : 0;
      unmet.height = height !== null && standing ? Math.abs(height - s.plan.y) : 0;
      // A heading asked beside a walk is not carried out: the walk's steps turn the stance to its own.
      const carriage = goal.carriage !== undefined && Object.hasOwn(CARRIAGES, goal.carriage) ? CARRIAGES[goal.carriage as keyof typeof CARRIAGES] : undefined;
      const leaves = setIn(goal, FIELD_BIT.gait | (goal.walk && !goal.footing ? FIELD_BIT.heading : 0)
        | (goal.carriage !== undefined && carriage === undefined ? FIELD_BIT.carriage : 0));
      unmet.fields = fieldsOf(leaves | refused);
      if (carriage !== undefined && carriage !== state.carriage) { state.carriage = carriage; state.stood = null; state.idle.target = null; state.idle.centre = null; state.idle.seconds = 0; state.placing = null; }
      const held = state.carriage;
      let stance: StanceGoal | null;
      const settles = idleGoal(view, goal, dt, context);
      if (settles) { stance = settles; state.stood = null; state.placed = false; }
      else if (goal.footing) { state.stood = null; stance = place(view, goal.footing, goal.height); }
      else if (goal.walk === null && held.width !== null && (state.stood || still(view))) {
        // Stopped, the feet are set where the carriage stands them; no footing was asked.
        state.stood ??= footingOf(view, held, held.width);
        stance = place(view, state.stood, goal.height);
        state.placed = false;
      } else { state.stood = null; stance = walking(view, goal.walk, goal.face, dt, goal.height); }
      const stride = gait?.();
      if (stance && (held.width !== null || stride)) stance = { ...stance,
        gait: held.width === null ? stride! : stepsOf(held, held.width, stride) };
      const done = completed(stance, leaves & FIELD_BIT.heading ? { ...goal, heading: undefined } : goal);
      state.asked = done?.centre ?? null;
      state.askedHeight = done ? goal.height ?? null : null;
      return { kind: "stance", goal: done };
    },
  };

  /**
   * Idle settling: after `IDLE_SETTLE` still on both feet, the reference spacing turned to the pelvis's
   * facing about the sole that stays (the one nearer the centre of mass of those turned within
   * 0.2 rad, else the soles' midpoint); off by a quarter sole length or 0.2 rad, the feet step
   * there, each step aimed within 0.05 rad.
   */
  function idleGoal(view: BodyView, goal: SidedAsk, dt: number, context?: LocomotionContext): StanceGoal | null {
    const idle = state.idle, s = view.stance;
    const free = idleFooting && state.carriage.width === null && !view.down && context?.idleSettle !== false && goal.footing === undefined
      && goal.feet === undefined && goal.height === undefined && goal.heading === undefined && goal.centre === undefined
      && goal.pose === undefined && goal.swing === undefined && !goal.halt;
    const reset = (): void => { if (idle.target) state.placing = null; idle.target = null; idle.centre = null; idle.seconds = 0; };
    const boundedPlacement = (): StanceGoal | null => {
      const result = place(view, idle.target!, undefined, Math.min(PLACING.near, idleFooting!.length / 8), 0.05, IDLE_SHIFT_SPEED);
      if (!result) return null;
      idle.centre ??= [s.plan.x, s.plan.z];
      if (s.phase !== "stand") { idle.centre[0] = s.plan.x; idle.centre[1] = s.plan.z; }
      else if (state.placed) {
        // After landing, approach the new support centre rather than snapping the stand's goal
        // to it. The placement remains active until this final weight shift has settled.
        const dx = s.support.x - idle.centre[0], dz = s.support.z - idle.centre[1], distance = hypot(dx, dz);
        const share = distance > 0 ? Math.min(dt / STANCE_GAIT.seconds, IDLE_SHIFT_SPEED * dt / distance) : 0;
        idle.centre[0] += share * dx; idle.centre[1] += share * dz;
      }
      const centre = [idle.centre[0], idle.centre[1]] as const;
      if (state.placed && still(view) && apart(centre, [s.support.x, s.support.z]) <= PLACING.near
        && apart([s.plan.x, s.plan.z], [s.support.x, s.support.z]) <= PLACING.near) reset();
      return { ...result, centre };
    };
    if (!free) { reset(); return null; }
    if (idle.target && s.own) {
      // A catch owns the step until it lands; the placement's own weight shift can lag its plan.
      // That tracking error alone does not cancel a step before its foot lifts.
      reset(); return null;
    }
    if (goal.walk !== null) {
      if (idle.target && s.phase === "swing" && state.placing?.step) return place(view, idle.target, undefined, Math.min(PLACING.near, idleFooting.length / 8), 0.05, IDLE_SHIFT_SPEED);
      reset(); return null;
    }
    if (idle.target) {
      return boundedPlacement();
    }
    if (state.rising || !still(view) || names.some((end) => !s.ends[end]!.touching) || s.own) { idle.seconds = 0; return null; }
    idle.seconds = Math.min(IDLE_SETTLE, idle.seconds + dt);
    if (idle.seconds + dt / 2 < IDLE_SETTLE) return null;
    // The footing is read about a planted sole, which sway never moves: the foot nearer the centre
    // of mass, turned within the tolerance, stays, and the other steps to the reference spacing
    // from it. Where neither is turned within it, about the soles' midpoint, and both step.
    const h = facing(view), rx = cos(h), rz = -sin(h), fx = sin(h), fz = cos(h);
    const sole = (side: Side): readonly [number, number] => [soleOf(view, side).x, soleOf(view, side).z];
    const nearer = (side: Side): number => hypot(soleOf(view, side).x - s.centre.x, soleOf(view, side).z - s.centre.z);
    const level = SIDES.filter(side => turned(view, side, h) <= 0.2);
    const stays: Side | null = level.length === 2 ? (nearer("left") <= nearer("right") ? "left" : "right") : level[0] ?? null;
    const [ax, az] = stays ? idleFooting.offsets[stays] : [0, 0];
    const c = stays ? soleOf(view, stays) : s.support;
    const at = (side: Side): readonly [number, number] => {
      const x = idleFooting.offsets[side][0] - ax, z = idleFooting.offsets[side][1] - az;
      return [c.x + rx * x + fx * z, c.z + rz * x + fz * z];
    };
    const target = { left: at("left"), right: at("right") };
    if (SIDES.every(side => apart(sole(side), target[side]) <= idleFooting.length / 4 && turned(view, side, h) <= 0.2)) return null;
    // A catch can turn the pelvis: settle under its current facing rather than twisting back over planted feet.
    state.heading = h;
    idle.target = target;
    idle.centre = [s.plan.x, s.plan.z];
    state.placing = { footing: target, stepped: { left: stays === "left", right: stays === "right" }, step: null, lifted: false };
    return boundedPlacement();
  }

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
    const envelope = envelopeNow();
    let walk = asked;
    born(view);
    const walkHeading = state.heading;
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
      let most = envelope ? heldPace(envelope, walk[0], walk[1]) : Infinity;
      // A heading still to turn at a pace the envelope turns none at is walked at the fastest pace it turns at.
      if (envelope && wrap(face - state.heading) !== 0 && turnAt(envelope, Math.min(speed, most)) === 0) most = Math.min(most, fastestTurning(envelope));
      if (speed > most) walk = [walk[0] * most / speed, walk[1] * most / speed];
      state.pace = Math.min(speed, most);
      state.going = Math.max(state.pace, state.going - STANCE_STOPPING * dt);
      if (turnStartup) state.walkTime = speed > 0 ? Math.min(turnStartup.seconds, state.walkTime! + dt) : 0;
    } else state.pace = hypot(walk[0], walk[1]);
    return legs.goal(view, state.heading, walk, height, walkHeading);
  }
}
