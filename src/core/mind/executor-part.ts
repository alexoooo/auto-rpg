import type { Body } from "../body.ts";
import type { Clock } from "../clock.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Executor } from "../skills/action.ts";
import type { Pose } from "../control/motor.ts";
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

/** **What an executor's maker is handed** beside its config and its actions. */
export interface ExecutorMaking {
  readonly body: Body;
  readonly clock: Clock;
  /** The arms' rest, the mind's guard's (`GuardSkill.posture`): where its blows return. */
  readonly guard: Pose;
  /** Where an action's effector aims at its target (`actionAim`), or null where it has none. */
  readonly resolve: NonNullable<Parameters<typeof kickExecutor>[3]>;
  /** The way an action's effector drives at its target, or null for its own. */
  readonly direction: NonNullable<Parameters<typeof pathExecutor>[3]>["direction"];
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
  make(making: ExecutorMaking, config: C, actions: readonly ActionConfig[]): Executor;
}

/** Fields belonging to path execution cannot silently affect another kind. */
export function noPathSettings(action: ActionConfig): readonly string[] {
  return action.family !== undefined || action.armExtension !== undefined || action.lower !== undefined ? ["settings belong to a path executor"] : [];
}
