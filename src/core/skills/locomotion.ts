import type { BodyView } from "../body.ts";
import { turnAt, type StanceEnvelope } from "../control/stance-envelope.ts";
import type { StanceGoal } from "../control/stance.ts";

/**
 * How far under its reference height a body's centre of mass is held, m. Asked 8, 12 or 16 cm
 * lower, each human stood about 1 cm lower, and walking and stopping from there fell (Node stand,
 * 120 Hz), so a crouch is not the stance's yet.
 */
export const STANCE_LOWER = 0.03;

/** How far under the goal's height the centre of mass has fallen when the body has, m. */
const FALLEN = 0.25;

/**
 * How long a walk goes straight after it sets off from standing before its heading turns, s.
 * Turned from its first moment, the heading turned over feet still planted for the walk's first
 * weight shift, and the shift ran away sideways until the Warrior fell, at the first turn after the
 * Routine's strikes in most runs (Node stand, 120 Hz); the envelope's turn rates were measured on a
 * walk already under way.
 */
export const TURN_LEAD = 1;

/**
 * **A body's legs, under the stance**: both feet bearing, the centre of mass held `lower` under
 * the height it was built standing at, the pelvis facing a heading, and walking at a velocity or
 * standing.
 */
export interface StanceLegs {
  /**
   * The stance goal for this control step: facing `heading` (rad about up, 0 facing +z, growing to
   * the right), walking at `walk` (m/s, forward along the heading and to its right) or, null,
   * standing. Null before the body's first step, when its reference height is read.
   */
  goal(view: BodyView, heading: number, walk: readonly [forward: number, right: number] | null, lower?: number): StanceGoal | null;
  /** The centre of mass's height over the soles the body was built standing at, m; null before the first step. */
  readonly reference: number | null;
  /** Whether it has fallen: its centre of mass `FALLEN` under the goal's height, at any step since. */
  readonly fallen: boolean;
}

export function stanceLegs(): StanceLegs {
  let reference: number | null = null, fallen = false;
  return {
    get reference() { return reference; },
    get fallen() { return fallen; },
    goal(view, heading, walk, lower = STANCE_LOWER) {
      const s = view.stance;
      // The reference height is read from the first view, when the body stands as built.
      if (reference === null) {
        if (view.time <= 0) return null;
        reference = s.centre.y - s.support.y;
      }
      const height = reference - lower;
      fallen ||= height - (s.centre.y - s.support.y) > FALLEN;
      // Forward is (sin h, cos h) across the ground; the right, (cos h, -sin h).
      const across = walk
        ? [walk[0] * Math.sin(heading) + walk[1] * Math.cos(heading), walk[0] * Math.cos(heading) - walk[1] * Math.sin(heading)] as const
        : null;
      return { feet: ["left", "right"], centre: null, height, heading, walk: across };
    },
  };
}

/**
 * **The locomotion skill**: an intent's walk and facing made a stance goal, within what the stance
 * holds with the body (`StanceEnvelope`, `CoreBody.envelope`).
 *
 * - **The walk** is the intent's velocity (forward along the heading and to its right, m/s), its
 *   speed capped at the envelope's fastest walk. None stands.
 * - **The heading** turns toward the intent's facing only while the body walks, as the stance
 *   turns (each step lands its foot facing the heading; standing, a pelvis turned a quarter over
 *   planted feet fell), no faster than the envelope turns at the pace the body was last asked to
 *   walk (`turnAt`), and not for `TURN_LEAD` after it sets off.
 *
 * Without an envelope (a body under an experiment's stance tuning, which the envelope did not
 * measure) nothing is capped: the walk and the turn are the intent's.
 */
export interface Locomotion {
  /** The stance goal for `walk` and `face` this control step (null before the body's first step). */
  goal(view: BodyView, walk: readonly [forward: number, right: number] | null, face: number, dt: number, lower?: number): StanceGoal | null;
  /** The heading the stance is asked to face, rad. */
  readonly heading: number;
  /** The walk's speed asked, m/s (0 standing). */
  readonly pace: number;
  readonly reference: number | null;
  readonly fallen: boolean;
}

export function locomotion(envelope: StanceEnvelope | null): Locomotion {
  const legs = stanceLegs();
  let heading = 0, pace = 0, setOff: number | null = null;
  return {
    get heading() { return heading; },
    get pace() { return pace; },
    get reference() { return legs.reference; },
    get fallen() { return legs.fallen; },
    goal(view, walk, face, dt, lower) {
      if (!walk) {
        setOff = null;
        pace = 0;
      } else if (view.time > 0) {
        setOff ??= view.time;
        if (view.time - setOff >= TURN_LEAD) {
          const turn = wrap(face - heading);
          if (envelope) {
            const rate = turnAt(envelope, pace) * dt;
            heading += Math.max(-rate, Math.min(rate, turn));
          } else heading += turn;
        }
        const speed = Math.hypot(walk[0], walk[1]), most = envelope?.walk.value ?? Infinity;
        if (speed > most) walk = [walk[0] * most / speed, walk[1] * most / speed];
        pace = Math.min(speed, most);
      } else pace = Math.hypot(walk[0], walk[1]);
      return legs.goal(view, heading, walk, lower);
    },
  };
}

/** `a` turned into (-pi, pi]. */
export const wrap = (a: number): number => a - 2 * Math.PI * Math.ceil((a - Math.PI) / (2 * Math.PI));
