import type { BodyView } from "../body.ts";
import { turnAt, type StanceEnvelope } from "../control/stance-envelope.ts";
import type { Foot, StanceGoal, SwingGoal } from "../control/stance.ts";
import { STANCE_GAIT } from "../control/stance-tuning.ts";
import { sin, cos, hypot } from "../math/real.ts";

/**
 * How far under its reference height a body's centre of mass is held, m: the height every table
 * of the stance's record was measured at (`docs/reference/stance-tuning.md#stance-height`). A
 * crouch is beyond the stance: asked 8 cm or more lower, a human settles only about 1 cm lower,
 * and falls walking or stopping from there.
 */
export const STANCE_LOWER = 0.03;

/**
 * How long a walk goes straight after it sets off from standing before its heading turns, s. A
 * heading turned over feet still planted for the walk's first weight shift runs the shift away
 * sideways until the body falls; the envelope's turn rates are a walk's already under way. Set,
 * not swept (`docs/reference/human-and-strikes.md#turn-lead`).
 */
export const TURN_LEAD = 1;

/**
 * **A body's legs, under the stance**: both feet bearing, the centre of mass held `lower` under
 * the height it was built standing at, the pelvis facing a heading, and walking at a velocity or
 * standing. What it remembers (`LegsMemory`) it keeps in the state it is made with.
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
  /** The centre of mass's height over the soles the body was built standing at, m; null before the first step. */
  reference: number | null;
}

function stanceLegs(state: LegsMemory): StanceLegs {
  return {
    goal(view, heading, walk, lower = STANCE_LOWER) {
      const s = view.stance;
      // The reference height is read from the first view after a step, the body standing as built.
      if (state.reference === null) {
        if (view.time <= 0) return null;
        state.reference = s.centre.y - s.support.y;
      }
      const height = state.reference - lower;
      // Forward is (sin h, cos h) across the ground; the right, (cos h, -sin h).
      const across = walk
        ? [walk[0] * sin(heading) + walk[1] * cos(heading), walk[0] * cos(heading) - walk[1] * sin(heading)] as const
        : null;
      return { feet: ["left", "right"], centre: null, height, heading, walk: across };
    },
  };
}

/** Where each sole's middle goes, world (x, z), m: a stance taken at a place. */
export type Footing = Readonly<Record<Foot, readonly [number, number]>>;

/**
 * **How the feet are placed** (`Locomotion.place`): a foot further than `near` (m) from its place
 * steps there, as a walk's step is taken (`STANCE_GAIT`'s swing time and lift, the weight shifted
 * off it first); one step a foot for each footing asked. `near` is set, not measured
 * (`docs/reference/human-and-strikes.md#placing`).
 */
export const PLACING = { near: 0.02 } as const;

/**
 * **The locomotion skill**: an intent's walk and facing made a stance goal, within what the stance
 * holds with the body (`StanceEnvelope`, `Body.envelope`).
 *
 * - **The walk** is the intent's velocity (forward along the heading and to its right, m/s), its
 *   speed capped at the envelope's fastest walk. None stands.
 * - **The heading** turns toward the intent's facing only while the body walks, as the stance
 *   turns (each step lands its foot facing the heading; standing, a pelvis turned a quarter over
 *   planted feet falls), no faster than the envelope turns at the pace the body was last asked to
 *   walk (`turnAt`), and not for `TURN_LEAD` after it sets off.
 *
 * Without an envelope (a body under an experiment's stance tuning, which the envelope did not
 * measure) nothing is capped: the walk and the turn are the intent's.
 */
interface Locomotion {
  /** The stance goal for `walk` and `face` this control step (null before the body's first step). */
  goal(view: BodyView, walk: readonly [forward: number, right: number] | null, face: number, dt: number, lower?: number): StanceGoal | null;
  /** The heading the stance is asked to face, rad. */
  readonly heading: number;
  /** The walk's speed asked, m/s (0 standing). */
  readonly pace: number;
  readonly reference: number | null;
  /**
   * The stance goal that sets the feet at `footing`, standing, facing the heading it has: once no
   * step is under way, the foot further from its place steps there, then the other, each once for
   * this footing; one within `PLACING.near` of its place stays. Null before the body's first step.
   */
  place(view: BodyView, footing: Footing, lower?: number): StanceGoal | null;
  /** Whether the feet have been placed at the footing last asked, and stand: set by `place`, cleared by `goal`. */
  readonly placed: boolean;
  /** Its memory (`src/core/state.ts`). */
  readonly state: object;
}

/** **What the locomotion skill remembers.** */
interface LocomotionState extends LegsMemory {
  heading: number;
  pace: number;
  /** When the walk under way set off, s of the world's clock; null standing. */
  setOff: number | null;
  placing: Placing | null;
  placed: boolean;
}

/** The footing being placed, the feet that have stepped to it, and the step under way. */
interface Placing {
  footing: Footing;
  stepped: Record<Foot, boolean>;
  step: SwingGoal | null;
  lifted: boolean;
}

export function locomotion(envelope: StanceEnvelope | null): Locomotion {
  const state: LocomotionState = { reference: null, heading: 0, pace: 0, setOff: null, placing: null, placed: false };
  const legs = stanceLegs(state);
  const apart = (a: readonly [number, number], b: readonly [number, number]): number => hypot(a[0] - b[0], a[1] - b[1]);
  return {
    state,
    get heading() { return state.heading; },
    get pace() { return state.pace; },
    get reference() { return state.reference; },
    get placed() { return state.placed; },
    place(view, footing, lower) {
      state.setOff = null;
      state.pace = 0;
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
      const off = (foot: Foot): number => placing.stepped[foot] ? 0 : apart([s.soles[foot].x, s.soles[foot].z], placing.footing[foot]);
      const foot: Foot = off("left") >= off("right") ? "left" : "right";
      if (off(foot) <= PLACING.near) { state.placed = true; return base; }
      placing.step = { foot, to: placing.footing[foot], seconds: STANCE_GAIT.seconds, lift: STANCE_GAIT.lift, shift: true };
      placing.lifted = false;
      return { ...base, swing: placing.step };
    },
    goal(view, walk, face, dt, lower) {
      state.placing = null;
      state.placed = false;
      if (!walk) {
        state.setOff = null;
        state.pace = 0;
      } else if (view.time > 0) {
        state.setOff ??= view.time;
        if (view.time - state.setOff >= TURN_LEAD) {
          const turn = wrap(face - state.heading);
          if (envelope) {
            const rate = turnAt(envelope, state.pace) * dt;
            state.heading += Math.max(-rate, Math.min(rate, turn));
          } else state.heading += turn;
        }
        const speed = hypot(walk[0], walk[1]), most = envelope?.walk.value ?? Infinity;
        if (speed > most) walk = [walk[0] * most / speed, walk[1] * most / speed];
        state.pace = Math.min(speed, most);
      } else state.pace = hypot(walk[0], walk[1]);
      return legs.goal(view, state.heading, walk, lower);
    },
  };
}

/** `a` turned into (-pi, pi]. */
export const wrap = (a: number): number => a - 2 * Math.PI * Math.ceil((a - Math.PI) / (2 * Math.PI));
