import type { EstimateUnit } from "./estimate.ts";
import type { BodyView } from "../../control/body.ts";
import type { Ended, TargetRef } from "./action.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { Aimed } from "./action-aim.ts";
import type { Part, PartConfig } from "../../parts/parts.ts";

/**
 * **An action's aim, made**: where `effector` aims at `target` this step, or null; `ledger` is the
 * body's ended actions. An aim that holds what it chose between steps keeps it in its `state`.
 */
export interface Aim {
  (view: BodyView, target: TargetRef, effector: string, ledger?: readonly Ended[]): Aimed | null;
  readonly state?: object;
}

/**
 * **A kind of aim** (`AIMS`): a part of role `aim`, an action's rule for where on its target it
 * strikes (`ActionConfig.aim`), made once a mind's actions are built.
 */
export interface AimPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "aim";
  /** The unit of the estimate its aims give (`Aimed.estimate`), or null where they give none: what estimate selection compares. */
  readonly unit: EstimateUnit | null;
  /** Whether it aims a blow struck with `effector`; with any unless it says. */
  aimsWith?(effector: string): boolean;
  /** Its aim on a body of `spec`. */
  make(spec: BodySpec, config: C): Aim;
}

declare module "../../parts/lookup.ts" {
  interface RoleParts {
    readonly aim: AimPart;
  }
}
