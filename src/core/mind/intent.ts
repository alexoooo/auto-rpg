import type { Hand } from "../control/motor.ts";
import type { Vec3 } from "../spec/quantity.ts";

/**
 * **What a mind asks of its body**, each control step: how to move, which way to face, and what
 * each hand does. It is the vocabulary a person's keys and an AI share (a person never commands
 * muscles), and it names no joint, pose or push: the skills
 * (`src/core/skills/skills.ts`) decide how the body does it, and say how it is going
 * (`SkillReport`).
 */
export interface Intent {
  /**
   * Walk at this velocity, m/s: forward along the body's heading and to its right; its speed is
   * capped at the body's fastest walk (`CoreBody.envelope`). Null stands.
   */
  readonly move: readonly [forward: number, right: number] | null;
  /** Face this way, rad about up (0 faces +z, growing to the right); the body turns toward it as its walk allows. */
  readonly face: number;
  readonly hands: Readonly<Record<Hand, HandAction>>;
  /** How far under its standing height to hold the centre of mass, m; `STANCE_LOWER` when not given. */
  readonly lower?: number;
}

/**
 * What a hand does: guard, or attack a point (world), with whatever the hand holds. An attack is
 * the skill's to carry out: it chooses the blow for what the hand holds, brings the body to its
 * range, and throws it (`SkillReport.strike` says where it is).
 */
export type HandAction =
  | { readonly kind: "guard" }
  | { readonly kind: "attack"; readonly target: Vec3 };

export const GUARD_ACTION: HandAction = Object.freeze({ kind: "guard" });

/** Standing in guard, facing `face`. */
export const standIntent = (face = 0): Intent => ({ move: null, face, hands: { left: GUARD_ACTION, right: GUARD_ACTION } });
