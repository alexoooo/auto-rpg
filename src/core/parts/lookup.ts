import type { MotorPart } from "../control/motor-part.ts";
import type { BalancePart } from "../control/balance-part.ts";
import type { Controller } from "../mind/controller.ts";
import type { ExecutorPart } from "../skills/framework/executor-part.ts";
import type { LocomotionPart } from "../skills/framework/locomotion-part.ts";
import type { NavigatorPart } from "../navigation/navigator.ts";
import type { BehaviourPart } from "../tactics/behaviour-part.ts";
import type { TacticsPart } from "../tactics/tactics-part.ts";
import type { PartConfig, Role } from "./parts.ts";
import type { SubMindPart } from "../recovery/sub-mind-part.ts";
import type { TechniquePart } from "../recovery/ground/technique.ts";
import type { GuardPart } from "../skills/guard/guard-part.ts";
import type { SupportPart } from "../skills/locomotion/support-part.ts";
import type { MoveRulePart } from "../skills/locomotion/move-rule-part.ts";
import type { AimPart } from "../skills/framework/aim-part.ts";

/**
 * **Each role's kind of part**: what a lookup of the role gives (`PartLookup.of`), its maker
 * included where the role's parts make themselves. These are the toolkit's roles; a package with
 * roles of its own (the option framework's, `src/core/option/parts.ts`; the quadruped's,
 * `src/core/reptile/parts.ts`) adds them where it declares them, by augmenting this interface, so
 * that no role is named here for one mind or body.
 */
export interface RoleParts {
  readonly mind: Controller;
  readonly "sub-mind": SubMindPart;
  readonly technique: TechniquePart;
  readonly tactics: TacticsPart;
  readonly behaviour: BehaviourPart;
  readonly "move-rule": MoveRulePart;
  readonly navigation: NavigatorPart;
  readonly locomotion: LocomotionPart;
  readonly guard: GuardPart;
  readonly executor: ExecutorPart;
  readonly support: SupportPart;
  readonly motor: MotorPart;
  readonly balance: BalancePart;
  readonly aim: AimPart;
}

/**
 * **The parts a tree may name, by kind** (`partLookup`, `catalog.ts`): what a part whose checks
 * read the parts it names is handed (`Part.fits`, `Part.faults`), and what a mind's host hands
 * its maker (`BodyHost.parts`) for every assembly that builds a part. No part's module reads the
 * registry: it is handed this, so the part a config names, a mind's own included, is the part used.
 */
export interface PartLookup {
  /** The part `config` names; a thrown error where no part has its kind or the part is not of `role`. */
  of<R extends Role>(role: R, config: PartConfig): RoleParts[R];
}
