import type { BodyView } from "../core/body.ts";
import type { StanceGoal } from "../core/control/stance.ts";

/**
 * How far under its reference height the lab holds a body's centre of mass, m. Asked 8, 12 or 16 cm
 * lower, each human stood about 1 cm lower, and walking and stopping from there fell (Node stand,
 * 120 Hz), so a crouch is not the stance's yet.
 */
export const STANCE_LOWER = 0.03;

/** How far under the goal's height the centre of mass has fallen when the body has, m. */
const FALLEN = 0.25;

/**
 * **A lab body's legs, under the stance**: both feet bearing, the centre of mass held `lower` under
 * the height it was built standing at, the pelvis facing a heading, and walking at a velocity or
 * standing. The stance mode and the routine both ask the legs this way.
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
