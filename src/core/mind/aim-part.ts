import type { BodyView } from "../body.ts";
import type { Ended, TargetRef } from "../skills/action.ts";
import type { AttackTuning } from "../skills/attack-path.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Aimed } from "./action-aim.ts";
import type { BlowFamily } from "./intent.ts";
import type { Part, PartConfig } from "./parts.ts";

/** **An action's aim, made**: where `effector` aims at `target` this step, or null; `ledger` is the body's ended actions. */
export type Aim = (view: BodyView, target: TargetRef, effector: string, ledger?: readonly Ended[]) => Aimed | null;

/** **The blow an aim is made for**, where its executor says (`ExecutorPart.blow`): the path's family and the hands' paths. */
export interface AimedBlow {
  readonly family: BlowFamily;
  readonly paths?: AttackTuning;
}

/**
 * **A kind of aim** (`AIMS`): a part of role `aim`, an action's rule for where on its target it
 * strikes (`ActionConfig.aim`), made once a mind's actions are built.
 */
export interface AimPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "aim";
  /** The unit of the estimate its aims give (`Aimed.estimate`), or null where they give none: what estimate selection compares. */
  readonly unit: "opening" | "net" | null;
  /** Whether it aims a blow struck with `effector`; with any unless it says. */
  aimsWith?(effector: string): boolean;
  /** Its aim on a body of `spec`, for `blow` where the executor names one, else a straight blow on the stock paths. */
  make(spec: BodySpec, config: C, blow: AimedBlow | null): Aim;
}
