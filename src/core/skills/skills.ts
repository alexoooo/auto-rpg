import type { Body, BodyCommand, BodyView } from "../body.ts";
import type { StanceEnvelope } from "../control/stance-envelope.ts";
import type { Intent } from "../mind/intent.ts";
import type { Tactics } from "../mind/tactics.ts";
import type { ActionAround, ActionStatus, Ended, Readiness, TargetRef } from "./action.ts";
import { skillSet, type Holders, type SkillParts } from "./arbiter.ts";
import { guardPosture, guardSkill, type Covering } from "./guard.ts";
import { locomotion } from "./locomotion.ts";
import type { Skill } from "./skill.ts";
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
  /** The limits its legs state, which the speed rule reads (`travelSpeed`): what a team reads of how fast it goes. */
  readonly gait: GaitLimits;
  readonly state: object;
  instance(): number;
  readiness(view: BodyView, action: string, effector: string, target: TargetRef, around: ActionAround): Readiness;
  release(view: BodyView, reason?: "takeover" | "idle" | "replaced"): void;
}

/** Public execution facts contain no executor-specific counters or motion state. */
export interface SkillReport {
  readonly heading: number;
  readonly pace: number;
  readonly reference: number | null;
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
  return { legs: locomotion(body.envelope), navigation: null, guard: guardSkill(spec, cover),
    executors: [{ name: "recipe", executor: recipeExecutor(spec, ["strike"], { repertoire, placed, steer, guard: guardPosture(spec) }) }],
    actions: [{ name: "strike", executor: "recipe", effectors: ["hand.left", "hand.right"] }] };
}

/** The recipe action's standard services and runtime, with the tactics' state attached for replay. */
export const recipeSkills = (body: Body, tactics: Pick<Tactics, "state" | "engagement"> = {}, options: RecipeOptions = {}): Skills =>
  skillSet(body, tactics, recipeParts(body, options));
