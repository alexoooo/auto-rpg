import type { EstimateUnit } from "./estimate.ts";
import type { BodyView } from "../../control/body.ts";
import type { Ended, TargetRef } from "./action.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { Aimed } from "./action-aim.ts";
import type { Part, PartConfig } from "../../parts/parts.ts";

/**
 * **An action's aim, made**: where `effector` aims at `target` this step, or null; `ledger` is the
 * body's ended actions. An aim that holds what it chose between steps keeps it in its `state`,
 * and only where its asking keeps (`AimAsking`).
 */
export interface Aim {
  (view: BodyView, target: TargetRef, effector: string, ledger?: readonly Ended[]): Aimed | null;
  readonly state?: object;
}

/**
 * **How a body's aims are being asked**: by its mind's own work, which keeps what an aim finds
 * (`keeps`), or by a reading of the mind (its menu, `keepingNothing`), which answers as the mind's
 * own ask would and keeps nothing.
 */
export interface AimAsking { keeps: boolean }

/** **A body's aims**, made once for its mind: each aiming action's by the action's name, and how they are being asked. */
export interface Aims {
  readonly of: ReadonlyMap<string, Aim>;
  readonly asking: AimAsking;
}

/** What `aims` hold between steps (`Aim.state`): what a mind hangs on its state. */
export const aimsState = (aims: Aims): readonly object[] => [...aims.of.values()].flatMap((aim) => aim.state ? [aim.state] : []);

/** `read` with `aims` keeping nothing they find (`AimAsking`): a reading of a mind moves nothing it keeps. */
export function keepingNothing<T>(aims: Aims | undefined, read: () => T): T {
  if (!aims) return read();
  const keeps = aims.asking.keeps;
  aims.asking.keeps = false;
  try { return read(); } finally { aims.asking.keeps = keeps; }
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
  /** Its aim on a body of `spec`, asked as `asking` says: one that keeps what it finds keeps it only where `asking.keeps`. */
  make(spec: BodySpec, config: C, asking: Readonly<AimAsking>): Aim;
}

declare module "../../parts/lookup.ts" {
  interface RoleParts {
    readonly aim: AimPart;
  }
}
