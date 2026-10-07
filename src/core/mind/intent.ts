import type { Vec3 } from "../spec/quantity.ts";
import type { Side } from "../spec/body.ts";

/**
 * **What tactics ask of their body**, each control step: how to move, which way to face, and what
 * each hand does. It is the vocabulary a person's keys and an AI share (a person never commands
 * muscles), and it names no joint, pose or push: the skills
 * (`src/core/skills/skills.ts`) decide how the body does it, and say how it is going
 * (`SkillReport`).
 */
export interface Intent {
  /**
   * Walk at this velocity, m/s: forward along the body's heading and to its right; its speed is
   * capped at the body's fastest walk (`Body.envelope`). Null stands.
   */
  readonly move: readonly [forward: number, right: number] | null;
  /** Face this way, rad about up (0 faces +z, growing to the right); the body turns toward it as its walk allows. */
  readonly face: number;
  readonly hands: Readonly<Record<Side, HandAction>>;
  /** How far under its standing height to hold the centre of mass, m; `STANCE_LOWER` when not given. */
  readonly lower?: number;
  /** A committed combat action, executed by the common combat skill when configured. */
  readonly combat?: CombatAction | null;
  /** A foot attack; the common skill acquires support and verifies the complete landing. */
  readonly kick?: KickAction | null;
}

/** What a guarding hand covers: where the threat is, and the place of its own body it is kept from; world, m. */
export interface Cover {
  readonly threat: Vec3;
  readonly guarded: Vec3;
  /** Optional observed arrival time limits the guard's shared tracking duration. */
  readonly seconds?: number;
}

/**
 * What a hand does: guard, or attack a point (world), with whatever the hand holds. An attack is
 * the skill's to carry out: it chooses the blow for what the hand holds, brings the body to its
 * range, and throws it (`SkillReport.strike` says where it is). So is a guard with a cover: the
 * skill puts what the hand covers with between the threat and the place guarded
 * (`src/core/skills/guard.ts`); a guard with none holds the guard's pose.
 */
export type HandAction =
  | { readonly kind: "guard"; readonly cover?: Cover }
  | { readonly kind: "attack"; readonly target: Vec3 };

export const GUARD_ACTION: HandAction = Object.freeze({ kind: "guard" });

/** Standing in guard, facing `face`. */
export const standIntent = (face = 0): Intent => ({ move: null, face, hands: { left: GUARD_ACTION, right: GUARD_ACTION } });

/** **The hand a fighter attacks with next**, by `mode`: the one it names, or each in turn, the right first, by the blows begun so far (`cycles`). */
export function nextHand(mode: Side | "alternate", cycles: number): Side {
  switch (mode) {
    case "left": case "right": return mode;
    case "alternate": return cycles % 2 === 0 ? "right" : "left";
    default: { const never: never = mode; throw new Error(`no hand ${JSON.stringify(never)}`); }
  }
}

/** The optional arm style is finite and bounded; omitted inherits the executor preference. */
export function validArmExtension(extension = 0): boolean {
  return Number.isFinite(extension) && extension >= 0 && extension <= 1;
}

/** A hand, observed world target and path family; no motor or anatomy prescription. */
export interface CombatAction {
  /** Observed identity whose contact may admit a bounded follow-through. */
  readonly targetId?: string;
  readonly hand: Side;
  readonly target: Vec3;
  readonly family: "straight" | "cross" | "hook" | "downward" | "overhand" | "uppercut";
  /** Optional world direction at contact; the shared executor applies the measured speed. */
  readonly direction?: Vec3;
  /** Optional arm-extension style in [0,1]; the shared executor bounds it to the body: `docs/reference/combat-arm-style.md`. */
  readonly armExtension?: number;
}

/** A named foot and observed world point; no joint or engine prescription. */
export interface KickAction {
  readonly foot: Side;
  readonly target: Vec3;
  readonly targetId?: string;
}
