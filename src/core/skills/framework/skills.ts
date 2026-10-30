import type { KitEntry, MenuEntry } from "./menu.ts";
import type { Clearance } from "../../navigation/clear-step.ts";
import type { Body, BodyCommand, BodyView } from "../../body.ts";
import type { StanceEnvelope } from "../../control/stance-envelope.ts";
import type { GaitName } from "../locomotion/gaits.ts";
import type { Intent } from "../../intent/intent.ts";
import type { Tactics } from "../../tactics/tactics.ts";
import { type ActionAround, type ActionStatus, type Ended, type Readiness, type Resource, type TargetRef } from "./action.ts";
import { skillSet, type Holders } from "./arbiter.ts";
import { guardSkill } from "../guard/guard.ts";
import { locomotion } from "../locomotion/locomotion.ts";
import { stanceFeetOf, type LegsUnmet, type Skill } from "./skill.ts";
import type { SupportReport } from "../locomotion/support-fold.ts";
import type { NavigationReport } from "../../navigation/navigator.ts";
import type { GaitLimits } from "../../intent/travel.ts";

/** The body's sole action runtime composes discrete commitments with continuous services. */
export interface Skills extends Skill {
  command(view: BodyView, intent: Intent, dt: number): BodyCommand;
  readonly report: SkillReport;
  readonly envelope: StanceEnvelope | null;
  /** What its legs hold going by `gait` (`Locomotion.envelopeOf`); null where they have no such gait or state none. */
  envelopeOf(gait: GaitName): StanceEnvelope | null;
  /** The limits its legs state, which the speed rule reads (`travelSpeed`): what a team reads of how fast it goes. */
  readonly gait: GaitLimits;
  /** How its planner keeps the body clear of the solids sensed: its navigator's (`Navigator`), or the stock navigators' where it has none (`stockClearance`). */
  readonly clearance: Clearance;
  readonly state: object;
  instance(): number;
  readiness(view: BodyView, action: string, effector: string, target: TargetRef, around: ActionAround): Readiness;
  /** The actions the body has (`KitEntry`). */
  readonly kit: readonly KitEntry[];
  /** Its choices as the last step left the body (`menuOf`), from a stance with no walk; reading it changes nothing. */
  menu(): readonly MenuEntry[];
  /** What `action` holds with `effector` once admitted (`Executor.needs`): none for one it does not bind. */
  needs(action: string, effector: string): readonly Resource[];
  release(view: BodyView, reason?: "takeover" | "idle" | "replaced"): void;
}

/** Public execution facts contain no executor-specific counters or motion state. */
export interface SkillReport {
  readonly heading: number;
  /** The walk's speed asked, m/s (`Locomotion.pace`); absent where the legs say none. */
  readonly pace?: number;
  /** The height the legs hold the centre of mass at, m (`Locomotion.reference`); null before the first step or where the legs hold none. */
  readonly reference: number | null;
  /** What the legs did not carry out of their last goal (`Locomotion.unmet`); all met where the legs say none. */
  readonly legs: LegsUnmet;
  readonly actions: readonly ActionStatus[];
  readonly ledger: readonly Ended[];
  /** The hands its guard put a cover before a threat with at its last step, by segment (`Intent.guard`). */
  readonly covering: readonly string[];
  readonly engagement?: Tactics["engagement"];
  readonly support?: SupportReport;
  readonly holders: Holders;
  readonly reservations: Readonly<Record<string, number>>;
  readonly navigation?: NavigationReport;
}

/** Continuous locomotion and the guard, with no action: a body's skills where its tactics throw nothing. */
export const standingSkills = (body: Body, tactics: Pick<Tactics, "state" | "engagement"> = {}): Skills =>
  skillSet(body, tactics, { legs: locomotion(stanceFeetOf(body.built.spec), body.envelope), navigation: null, guard: guardSkill(body.built.spec), executors: [], actions: [] });
