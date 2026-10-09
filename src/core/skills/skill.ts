import type { BodyView } from "../body.ts";
import type { EffectorGoal, MusclePush, Pose } from "../control/motor.ts";
import type { BlowAttack, Intent } from "../mind/intent.ts";
import type { Side } from "../spec/body.ts";
import type { Footing } from "./locomotion.ts";
import type { StrikeReport } from "./strike.ts";
import type { SupportReport } from "./support-fold.ts";

/**
 * **What every skill answers to**: the body was another mind's, and is back as `view` shows it.
 * Whatever the skill had under way is over.
 */
export interface Skill<V = BodyView> {
  resume(view: V): void;
}

/** **What a skill asks of the legs** this step, by kind. */
export type LegsAsk =
  /** The tactics' walk and facing. */
  | { readonly kind: "free" }
  /** No walk: the body stands where it is. */
  | { readonly kind: "hold" }
  /** Walk (forward, right, m/s), or stand, facing `face`. */
  | { readonly kind: "walk"; readonly walk: readonly [number, number] | null; readonly face: number }
  /** Set the feet at `footing` (`Locomotion.place`). */
  | { readonly kind: "place"; readonly footing: Footing };

/** **What a skill claims of the body** this step: what it does with each part it has. */
interface Claim {
  /** Each hand's goal; null leaves the hand to the guard. */
  readonly hands: Readonly<Record<Side, EffectorGoal | null>>;
  /** The posture, or null for the guard's. */
  readonly posture: Pose | null;
  readonly pushes: readonly MusclePush[];
  /** Each hand held closed, for a hand that closes to strike (`closesToStrike`). */
  readonly closed: Readonly<Record<Side, boolean>>;
  readonly legs: LegsAsk;
  /** How far the stance's heading is turned from the legs' to follow a target, rad. */
  readonly steer: number;
}

/** What a blow skill reads of the skills beside it, as this step finds them. */
export interface Around {
  /** The heading the legs face, rad, and whether they have set the feet at the footing last asked. */
  readonly heading: number;
  readonly placed: boolean;
  /** How the support skill is going, or null with none. */
  readonly support: SupportReport | null;
}

/**
 * **A blow skill**: a hand's attack, carried out from wind-up to return. It is given a blow, or
 * none while none is asked or a kick has the body, and claims what it uses.
 */
export interface BlowSkill extends Skill {
  /** This step's claim, or null with no blow asked and none under way. */
  command(view: BodyView, attack: BlowAttack | null, intent: Intent, around: Around, dt: number): Claim | null;
  /** Whether it carries out `attack`: a skill given one it does not refuses it (`Attack`). */
  accepts(attack: BlowAttack): boolean;
  readonly report: StrikeReport;
  /** The hand the guard leaves alone, the last command made. */
  readonly holds: Side | null;
  /** Whether a blow is under way: a kick waits on it. */
  readonly busy: boolean;
  /** How low the stance is asked for the blow under way (`Intent.lower`), or null with none. */
  readonly lower: number | null;
  /** Whether a sub-mind taking the body resumes the skills (`Skills.release`). */
  readonly releases: boolean;
  /** Its memory (`src/core/state.ts`). */
  readonly state: object;
}
