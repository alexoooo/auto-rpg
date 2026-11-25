import type { Body, BodyView } from "../../control/body.ts";
import type { Clock } from "../../core/world/clock.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { Executor, TargetRef, TargetResolver } from "./action.ts";
import type { Pose } from "../../core/bodies/spec/pose.ts";
import type { ActionConfig } from "../config.ts";
import type { KeysOf, Part, PartConfig } from "../../parts/parts.ts";
import type { Aimed } from "./action-aim.ts";
import type { Mechanism } from "../../combat/rulebook.ts";

/** **What an executor's maker is handed** beside its config and its actions. */
export interface ExecutorMaking {
  readonly body: Body;
  readonly clock: Clock;
  /** The arms' rest, the mind's guard's (`GuardSkill.posture`): where its blows return. */
  readonly guard: Pose;
  /** Where an action's effector aims at its target this step, by the action's aim (`AimPart`); null where it has none. */
  readonly aim: ActionAimer;
}

/** Where `effector` aims at `target` for `action` this step (`Aimed`), or null. */
type ActionAimer = (view: BodyView, target: TargetRef, action: string, effector: string) => Aimed | null;

/** The point `aim` aims at, or null: what an executor that drives at a point reads of it. */
export const aimedPoint = (aim: ActionAimer): TargetResolver => (view, target, action, effector) => aim(view, target, action, effector)?.at ?? null;

/**
 * **A kind of executor**: a part of role `executor` that owns its config's type, keys, defaults,
 * faults, fit, the effectors it strikes with and its maker: a skill an Option names (`skill`), its
 * actions what the Options that name it ask of it.
 */
export interface ExecutorPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "executor";
  readonly keys: KeysOf<C>;
  readonly effectors: readonly string[];
  /** Whether it aims at a target: where it does, each Option that names it names its regions and its aim; where not, neither. */
  readonly aims: boolean;
  /** What its blow meets a target with, as the rules read the contact (`Mechanism`): blunt where it says none. A drill reads a held item's blow against it. */
  readonly meets?: Mechanism;
  /** Whether it strikes with `effector` of `spec`, as it holds what it holds; with each of its `effectors` unless it says. A mind reads it to throw only the blows its body can (`limbsOf`). */
  strikesWith?(spec: BodySpec, config: C, effector: string): boolean;
  /** How many blows an action of it throws; one unless it says. */
  blows?(config: C): number;
  make(making: ExecutorMaking, config: C, actions: readonly ActionConfig[]): Executor;
}

declare module "../../parts/lookup.ts" {
  interface RoleParts {
    readonly executor: ExecutorPart;
  }
}
