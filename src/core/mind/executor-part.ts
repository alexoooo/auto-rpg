import type { Body } from "../body.ts";
import type { Clock } from "../clock.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Executor } from "../skills/action.ts";
import type { AttackTuning } from "../skills/attack-path.ts";
import type { ActionConfig } from "./config.ts";
import type { KeysOf, Part, PartConfig } from "./parts.ts";
import type { actionAim } from "./action-aim.ts";
import type { ActionEstimates } from "./action-tactics.ts";
import type { kickExecutor } from "../skills/kick.ts";
import type { pathExecutor } from "../skills/combat.ts";

/** An executor's config: its kind and the name a fighter's actions call it by. */
interface NamedConfig extends PartConfig {
  readonly name: string;
}

/**
 * **A kind of executor**: a part of role `executor` that owns its config's type, keys, defaults,
 * faults, fit, the effectors it strikes with, what its actions may say and its maker.
 */
export interface ExecutorPart<C extends NamedConfig = NamedConfig> extends Part<C> {
  readonly role: "executor";
  readonly keys: KeysOf<C>;
  readonly effectors: readonly string[];
  /** Whether it strikes with `effector` of `spec`, as it holds what it holds; with each of its `effectors` unless it says. A mind reads it to throw only the blows its body can (`armedActions`). */
  strikesWith?(spec: BodySpec, config: C, effector: string): boolean;
  actionFaults(action: ActionConfig): readonly string[];
  paths?(config: C): AttackTuning;
  estimate?(spec: BodySpec, config: C, action: ActionConfig, aim: ReturnType<typeof actionAim>): ActionEstimates[string] | null;
  make(body: Body, clock: Clock, config: C, actions: readonly ActionConfig[],
    resolve: NonNullable<Parameters<typeof kickExecutor>[3]>, direction: NonNullable<Parameters<typeof pathExecutor>[2]>["direction"]): Executor;
}

/** Fields belonging to path execution cannot silently affect another kind. */
export function noPathSettings(action: ActionConfig): readonly string[] {
  return action.family !== undefined || action.armExtension !== undefined || action.lower !== undefined ? ["settings belong to a path executor"] : [];
}
