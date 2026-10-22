import type { Body, BodyView } from "../body.ts";
import type { Clock } from "../clock.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Executor, TargetRef } from "../skills/action.ts";
import type { Pose } from "../control/motor.ts";
import type { AttackTuning } from "../skills/attack-path.ts";
import type { ActionConfig } from "./config.ts";
import type { KeysOf, Part, PartConfig } from "./parts.ts";
import type { actionAim, Aimed } from "./action-aim.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { ActionEstimates } from "./tactics-part.ts";

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
  /** Where an action's effector aims at its target this step, by the action's aim (`actionAim`); null where it has none. */
  readonly aim: ActionAimer;
}

/** Where `effector` aims at `target` for `action` this step (`Aimed`), or null. */
export type ActionAimer = (view: BodyView, target: TargetRef, action: string, effector: string) => Aimed | null;

/** The point `aim` aims at, or null: what an executor that drives at a point reads of it. */
export const aimedPoint = (aim: ActionAimer) => (view: BodyView, target: TargetRef, action: string, effector: string): Vec3 | null => aim(view, target, action, effector)?.at ?? null;

/** The way `aim` drives at its point, or null for the executor's own. */
export const aimedWay = (aim: ActionAimer) => (view: BodyView, target: TargetRef, action: string, effector: string): Vec3 | null => aim(view, target, action, effector)?.direction ?? null;

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
