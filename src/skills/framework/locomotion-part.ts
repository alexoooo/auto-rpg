import type { StanceGoal } from "../../control/stance/goal.ts";
import type { GaitName, Skill, LegsAsked, LegsUnmet } from "./skill.ts";
import type { Body, BodyView, BodyCommand } from "../../control/body.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import type { KeysOf, Part, PartConfig } from "../../parts/parts.ts";
import type { BearingEnd } from "../../core/bodies/spec/body.ts";
import type { StanceEnvelope } from "../../control/stance/stance-envelope.ts";
import type { Pose } from "../../core/bodies/spec/pose.ts";
import type { SupportGoal } from "../../control/supported-motor.ts";
import type { MusclePush } from "../../control/motor.ts";
import type { BodyControl } from "../../core/bodies/body-control.ts";

/** The gaits' legs of any registered kind (`GAIT_PARTS`), as a lookup finds them (`legsOf`, `kit.ts`): how Move makes the gaits it chooses among. */
export interface Legs {
  make(body: Body, config: PartConfig): Locomotion;
  /** The lookup the legs were made with, for the parts their config names (Move's rules). */
  readonly parts: PartLookup;
}

/**
 * **A kind of locomotion**: a part of role `locomotion` that owns its config's type, keys,
 * defaults, faults and fit, and makes a body's legs over its gaits (`GaitPart`). The legs it makes
 * state their limits to the speed rule (`travelSpeed`, `src/skills/locomotion/travel.ts`): what they hold
 * (`Locomotion.envelope`), how long they go on once asked to slow (`Locomotion.lag`) and how fast
 * they stop (`Locomotion.stopping`).
 */
export interface LocomotionPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "locomotion";
  readonly keys: KeysOf<C>;
  /** The legs' skill of `config` for `body`; `legs` makes its gaits' legs. */
  make(body: Body, config: C, legs: Legs): Locomotion;
  /** The gaits legs of `config` go by, by name (`LegsGoal.gait`), which a walk names; none for legs that go by no gait by name. */
  gaits?(config: C): readonly { readonly name: GaitName; readonly label: string; readonly legs: PartConfig }[];
}

/**
 * **A kind of gait's legs**: a part of role `gait` that owns its config's type, keys, defaults,
 * faults and fit, and makes the walk a gait goes by (`Gait.legs`), which the legs (`LocomotionPart`)
 * go by while the gait is theirs.
 */
export interface GaitPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "gait";
  readonly keys: KeysOf<C>;
  /** The walk of `config` for `body`. */
  make(body: Body, config: C): Locomotion;
}

declare module "../../parts/lookup.ts" {
  interface RoleParts {
    readonly locomotion: LocomotionPart;
    readonly gait: GaitPart;
  }
}

/** Whether discrete skills leave the stance available for default settling this step. */
export interface LocomotionContext { readonly idleSettle: boolean }

/**
 * **Legs**: what every locomotion part makes, and all a mind's skills ask of its legs. Each
 * control step the legs complete the legs goal (`goal`) as the legs' command, and say which way
 * they face and how fast they stop. What a walk under the stance says besides is its own
 * (`StanceWalk`): the readers of it ask whether the legs say it.
 */
export interface Locomotion extends Skill {
  /** The ends whose limb controls belong to this locomotion service, fixed at construction. */
  readonly supports: readonly BearingEnd[];
  /** The default lowering of its centre of mass below the body's reference height, m. */
  readonly lower: number;
  /**
   * The legs goal `goal` completed this control step: the stance goal that carries out what it
   * sets and fills what it leaves out from its walk (`completed`), null before the body's first
   * step; or, for legs that drive themselves, their own drive (`LegsDrive`), which carries out
   * none of the stance's fields. Asked a `footing`, legs that place no feet stand.
   */
  goal(view: BodyView, goal: LegsAsked, dt: number, context?: LocomotionContext): LegsDrive;
  /**
   * The body back as `view` shows it (`Skill.resume`); with `heading`, taken over on the move from
   * other legs that walked by that heading, rad, which it walks by in place of the pelvis's facing.
   */
  resume(view: BodyView, heading?: number): void;
  /** The heading the legs face, rad: the frame a walk is asked in. */
  readonly heading: number;
  /**
   * How fast it slows to a stop, m/sÃ‚Â²: the deceleration the movement pipeline brakes by before a
   * place and a corner (`travelSpeed`, `src/skills/locomotion/travel.ts`); 0 for legs that do not walk, which the speed rule takes nowhere.
   */
  readonly stopping: number;
  /**
   * How long it goes on at its speed once asked to slow, s, before it slows at `stopping`: what the
   * speed rule counts before a place and a corner (`travelSpeed`).
   */
  readonly lag: number;
  /** Its memory (`src/core/state.ts`). */
  readonly state: object;
  /** The walk's speed asked, m/s (0 standing); absent, legs that do not say. */
  readonly pace?: number;
  /** The height the legs hold the centre of mass at, m, null before the body's first step; absent, legs that hold none. */
  readonly reference?: number | null;
  /**
   * What the legs were measured to hold with the body (`StanceEnvelope`), which caps their walk and
   * turn and which minds plan by (`SkillsLegs.envelope`); null or absent where they state none.
   */
  readonly envelope?: StanceEnvelope | null;
  /** Whether the feet have been placed at the footing last asked; absent, legs that place no feet. */
  readonly placed?: boolean;
  /** What of its last goal it did not carry out (`LegsUnmet`); absent, legs that say none. */
  readonly unmet?: LegsUnmet;
  /** The gait it walks by now, for legs that walk by gaits by name (`GAITS`); absent, legs that have none. */
  readonly gait?: GaitName;
  /** The gaits it walks by, by name, for legs that walk by gaits by name; absent, legs that have none. */
  readonly gaits?: readonly GaitName[];
  /** The limits it walks by going by `gait` (`GaitLimits`), for legs that walk by gaits by name; null where it has no such gait. */
  limitsOf?(gait: GaitName): GaitLimits | null;
  /**
   * The arms' posture as this walk swings them, for the arms no other skill holds (`skillSet`);
   * absent or null, a walk that leaves them in the guard.
   */
  arms?(view: BodyView): Pose | null;
}

/**
 * **What the legs ask** (`Locomotion.goal`): the stance's goal; the body held over the ends it
 * bears on as their gait asks (`SupportGoal`, `BodyCommand.support`); or the legs driven with no
 * stance: some freedoms by their muscles alone, as pushes (`MusclePush`), and the rest by the
 * servo, toward the angles of `posture`, laid over the command's; legs that hold the body low on
 * purpose say the centre of mass's height they hold it at (`held`, `BodyCommand.held`).
 */
export type LegsDrive =
  | { readonly kind: "stance"; readonly goal: StanceGoal | null }
  | { readonly kind: "support"; readonly goal: SupportGoal | null }
  | { readonly kind: "drive"; readonly posture: Pose; readonly pushes: readonly MusclePush[]; readonly held?: number; readonly assist?: BodyControl["assist"]; readonly configurations?: BodyCommand["configurations"] };

/** What the speed rule reads of the gait the body goes by: what it holds, how long it goes on once asked to slow, and how fast it stops. */
export type GaitLimits = Pick<Locomotion, "envelope" | "stopping" | "lag">;
