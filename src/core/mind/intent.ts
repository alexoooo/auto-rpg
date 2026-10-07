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
  /**
   * What each hand covers (`Cover`), or null to hold the guard's pose. The guard skill puts what
   * the hand covers with between the threat and the place guarded (`src/core/skills/guard.ts`); a
   * hand an attack has does not guard.
   */
  readonly guard: Readonly<Record<Side, Cover | null>>;
  /** How far under its standing height to hold the centre of mass, m; `STANCE_LOWER` when not given. */
  readonly lower?: number;
  /** The one attack asked for (`Attack`), or null. */
  readonly attack: Attack | null;
}

/** What a guarding hand covers: where the threat is, and the place of its own body it is kept from; world, m. */
export interface Cover {
  readonly threat: Vec3;
  readonly guarded: Vec3;
  /** Optional observed arrival time limits the guard's shared tracking duration. */
  readonly seconds?: number;
}

/** No hand covers anything: each holds the guard's pose. */
export const NO_COVER: Intent["guard"] = Object.freeze({ left: null, right: null });

/**
 * **An attack**, by what it is made with: a blow of a hand or a kick of a foot, at a point (world,
 * m). `targetId` names what is attacked, by the identity its contact reports
 * (`contactResponse`): only its touch may admit the blow's bounded follow-through. The skills carry
 * it out, and refuse a kind they do not: a blow with no `path` is the recipe skill's, which chooses
 * the blow for what the hand holds and brings the body to its range (`src/core/skills/strike.ts`);
 * one with a path is the path skill's (`combatSkills`), as is a kick.
 */
export type Attack = BlowAttack | KickAttack;

export interface BlowAttack {
  readonly kind: "blow";
  readonly hand: Side;
  readonly target: Vec3;
  readonly targetId?: string;
  readonly path?: BlowPath;
}

/** The path a blow takes: its family, and optionally its world direction at contact and its arm's style. */
export interface BlowPath {
  readonly family: BlowFamily;
  /** World direction at contact; the path skill applies its measured speed. */
  readonly direction?: Vec3;
  /** Arm-extension style in [0,1]; the path skill bounds it to the body: `docs/reference/combat-arm-style.md`. */
  readonly armExtension?: number;
}

export type BlowFamily = "straight" | "cross" | "hook" | "downward" | "overhand" | "uppercut";

/** A named foot and an observed world point; no joint or engine prescription. */
export interface KickAttack {
  readonly kind: "kick";
  readonly foot: Side;
  readonly target: Vec3;
  readonly targetId?: string;
}

/** Standing in guard, facing `face`. */
export const standIntent = (face = 0): Intent => ({ move: null, face, guard: NO_COVER, attack: null });

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
