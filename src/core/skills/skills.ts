import type { Clearance } from "../mind/clear-step.ts";
import type { Body, BodyCommand, BodyView } from "../body.ts";
import type { StanceEnvelope } from "../control/stance-envelope.ts";
import type { GaitName } from "./gaits.ts";
import type { Intent } from "../mind/intent.ts";
import type { Tactics } from "../mind/tactics.ts";
import { pointTarget, type ActionAround, type ActionStatus, type Ended, type Readiness, type Resource, type TargetRef } from "./action.ts";
import { skillSet, type Holders, type SkillParts } from "./arbiter.ts";
import { guardSkill, type Covering } from "./guard.ts";
import { locomotion } from "./locomotion.ts";
import type { LegsUnmet, Skill } from "./skill.ts";
import { recipeExecutor, type Placed } from "./strike.ts";
import { REPERTOIRE, type Repertoire } from "./strikes.ts";
import type { SupportReport } from "./support-fold.ts";
import type { NavigationReport } from "../mind/navigator.ts";
import type { GaitLimits } from "../mind/travel.ts";

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
  readonly engagement?: Tactics["engagement"];
  readonly support?: SupportReport;
  readonly holders: Holders;
  readonly reservations: Readonly<Record<string, number>>;
  readonly navigation?: NavigationReport;
}

/** Immutable experiment settings for the recipe executor and continuous guard. */
export interface RecipeOptions {
  readonly repertoire?: Repertoire;
  readonly placed?: Placed;
  readonly steer?: number;
  readonly cover?: Covering;
}

/** A named recipe action, continuous locomotion and the unreserved hands' guard. */
function recipeParts(body: Body, { repertoire = REPERTOIRE, placed, steer, cover }: RecipeOptions = {}): SkillParts {
  const spec = body.built.spec;
  const guard = guardSkill(spec, cover);
  return { legs: locomotion(body.envelope), navigation: null, guard,
    executors: [{ name: "recipe", executor: recipeExecutor(spec, ["strike"], { repertoire, placed, steer, guard: guard.posture, resolve: pointTarget }) }],
    actions: [{ name: "strike", executor: "recipe", effectors: ["hand.left", "hand.right"] }] };
}

/** The recipe action's standard services and runtime, with the tactics' state attached for replay. */
export const recipeSkills = (body: Body, tactics: Pick<Tactics, "state" | "engagement"> = {}, options: RecipeOptions = {}): Skills =>
  skillSet(body, tactics, recipeParts(body, options));
