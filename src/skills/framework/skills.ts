import type { Clearance } from "./navigation.ts";
import type { GaitLimits } from "./locomotion-part.ts";
import type { GaitName } from "./skill.ts";
import type { KitEntry, MenuEntry } from "./menu.ts";
import type { BodyCommand, BodyView } from "../../control/body.ts";
import type { StanceEnvelope } from "../../control/stance/stance-envelope.ts";
import type { Intent } from "./intent.ts";
import { type ActionAround, type ActionStatus, type Ended, type Readiness, type Resource, type TargetRef } from "./action.ts";
import type { Holders, DefaultOwners } from "./arbiter.ts";
import type { LegsUnmet, Skill } from "./skill.ts";
import type { NavigationReport } from "./navigation.ts";

/**
 * **A body's skills, as one object** (`skillSet`). Each control step it turns what the mind asks
 * (`Intent`) into the body's command (`command`). It is made of the skills that are always on
 * (the legs, the guard, the navigation, and low support where the body has it) and the actions,
 * which run when asked and hold the parts of the body they need.
 *
 * What a mind reads and asks of one of them is under its name here (`legs`, `navigation`,
 * `actions`); how each is going is under the same name in `report`. How low support is going an
 * action reads beside it (`ActionAround.support`).
 */
export interface Skills extends Skill {
  /** The body's command this control step, carrying out `intent`. */
  command(view: BodyView, intent: Intent, dt: number): BodyCommand;
  /** End what every skill has under way: the body is another mind's (`takeover`), its mind is idle, or these skills are replaced. */
  release(view: BodyView, reason?: "takeover" | "idle" | "replaced"): void;
  /** Its memory (`src/core/state.ts`), saved and loaded with its mind's. */
  readonly state: object;
  /** How its skills are going, as the last step left them. */
  readonly report: SkillReport;
  readonly legs: SkillsLegs;
  readonly navigation: SkillsNavigation;
  readonly actions: SkillsActions;
}

/** **What a mind reads of its legs** (`Skills.legs`): how fast they can go. */
export interface SkillsLegs {
  /** What the legs were measured to hold with this body, as they go now (`Locomotion.envelope`): their fastest walk, and their turns; null where they state none. */
  readonly envelope: StanceEnvelope | null;
  /** The limits the legs walk by going by `gait` (`Locomotion.limitsOf`); null where they have no such gait. */
  limitsOf(gait: GaitName): GaitLimits | null;
  /**
   * The limits of each gait the legs go by (`Locomotion.gaits`, `limitsOf`), or the legs' own where
   * they go by no gait by name, which the speed rule reads (`travelSpeed`): what a team reads of how
   * fast it can go.
   */
  readonly gaits: readonly GaitLimits[];
}

/** **What a mind reads of its navigation** (`Skills.navigation`). */
export interface SkillsNavigation {
  /** How its planner keeps the body clear of the solids sensed: the policy supplied with the skills. */
  readonly clearance: Clearance;
}

/** **What a mind reads and asks of its actions** (`Skills.actions`): which the body has, whether one can begin, and what it would hold. */
export interface SkillsActions {
  /** The actions the body has (`KitEntry`). */
  readonly kit: readonly KitEntry[];
  /** Its choices as the last step left the body (`menuOf`), from a stance with no walk; reading it changes nothing of the skills. */
  menu(): readonly MenuEntry[];
  /** A new id for an action a mind is about to ask (`Intent.actions`). */
  instance(): number;
  /** Whether `action` can begin with `effector` on `target`, the skills beside it as `around` says. */
  readiness(view: BodyView, action: string, effector: string, target: TargetRef, around: ActionAround): Readiness;
  /** What `action` holds with `effector` once admitted (`Executor.needs`): none for one it does not bind. */
  needs(action: string, effector: string): readonly Resource[];
  /** What an action reads of the skills beside it, as they are now with no walk asked (`ActionAround`). */
  readonly around: ActionAround;
}

/**
 * **How a body's skills are going** (`Skills.report`), as the last step left them: each skill
 * that is always on under its name, the actions under way and ended, and what holds each control
 * of the body. It contains no executor's own counters or motion state.
 */
export interface SkillReport {
  readonly legs: LegsReport;
  readonly guard: GuardReport;
  /** How its navigation is going; absent with none. */
  readonly navigation?: NavigationReport;
  /** The actions under way. */
  readonly actions: readonly ActionStatus[];
  /** The actions that have ended, in order. */
  readonly ledger: readonly Ended[];
  /** What holds each control of the body: an action's id, or `default` where the skills that are always on do. */
  readonly holders: Holders;
  /** Which of the skills that are always on writes each control no action holds. */
  readonly defaultOwners: Readonly<DefaultOwners>;
}

/** **How the legs are going** (`SkillReport.legs`). */
export interface LegsReport {
  /** The way the legs face, rad from +z toward +x (`Locomotion.heading`). */
  readonly heading: number;
  /** The walk's speed asked, m/s (`Locomotion.pace`); absent where the legs say none. */
  readonly pace?: number;
  /** The height the legs hold the centre of mass at, m (`Locomotion.reference`); null before the first step or where the legs hold none. */
  readonly reference: number | null;
  /** What the legs did not carry out of their last goal (`Locomotion.unmet`); all met where the legs say none. */
  readonly unmet: LegsUnmet;
}

/** **How the guard is going** (`SkillReport.guard`). */
export interface GuardReport {
  /** The hands the guard put a cover before a threat with at its last step, by segment (`Intent.guard`). */
  readonly covering: readonly string[];
}
