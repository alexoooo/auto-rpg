import type { Body, BodyView } from "../../body.ts";
import type { Clock } from "../../clock.ts";
import type { BodySpec } from "../../spec/body.ts";
import type { Executor, TargetRef, TargetResolver } from "./action.ts";
import type { Pose } from "../../spec/pose.ts";
import type { ActionConfig } from "../config.ts";
import type { PartField } from "../../parts/fields.ts";
import type { KeysOf, Part, PartConfig } from "../../parts/parts.ts";
import type { Aimed } from "../../intent/action-aim.ts";
import type { Aim, AimedBlow } from "./aim-part.ts";
import type { Mechanism } from "../../rules/rulebook.ts";

/** An action's own registration supplies measured estimates without exposing its executor kind. */
interface ActionEstimate {
  readonly unit: "opening" | "net";
  read(view: BodyView, target: TargetRef, effector: string): number | null;
}
export type ActionEstimates = Readonly<Record<string, ActionEstimate>>;

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
  /** Where an action's effector aims at its target this step, by the action's aim (`AimPart`); null where it has none. */
  readonly aim: ActionAimer;
}

/** Where `effector` aims at `target` for `action` this step (`Aimed`), or null. */
type ActionAimer = (view: BodyView, target: TargetRef, action: string, effector: string) => Aimed | null;

/** The point `aim` aims at, or null: what an executor that drives at a point reads of it. */
export const aimedPoint = (aim: ActionAimer): TargetResolver => (view, target, action, effector) => aim(view, target, action, effector)?.at ?? null;

/** The way `aim` drives at its point, or null for the executor's own. */
export const aimedWay = (aim: ActionAimer): TargetResolver => (view, target, action, effector) => aim(view, target, action, effector)?.direction ?? null;

/** The keys every action holds, whatever its executor (`ActionConfig`), `lower` aside: an executor that honours it names it in its own. */
export const ACTION_KEYS = Object.freeze(["name", "executor", "effectors", "regions", "aim"]);

/**
 * **A kind of executor**: a part of role `executor` that owns its config's type, keys, defaults,
 * faults, fit, the effectors it strikes with, what its actions may say (`A`) and its maker.
 */
export interface ExecutorPart<C extends NamedConfig = NamedConfig, A extends ActionConfig = ActionConfig> extends Part<C> {
  readonly role: "executor";
  readonly keys: KeysOf<C>;
  readonly effectors: readonly string[];
  /** Whether it aims at a target: where it does, each of its actions names its regions and its aim; where not, neither. */
  readonly aims: boolean;
  /** The keys its actions may hold beside every action's (`ACTION_KEYS`): a key outside both is a fault. */
  readonly actionKeys: readonly string[];
  /** The settings of its actions a person may change, beside the regions and the aim. */
  readonly actionFields?: readonly PartField<A>[];
  /** What an action of it holds of its own, the action's settings: an action of it that holds one fresh starts from them. */
  readonly actionDefaults?: Partial<A>;
  /** What its blow meets a target with, as the rules read the contact (`Mechanism`): blunt where it says none. A drill reads a held item's blow against it. */
  readonly meets?: Mechanism;
  /** Whether it strikes with `effector` of `spec`, as it holds what it holds; with each of its `effectors` unless it says. A mind reads it to throw only the blows its body can (`armedActions`). */
  strikesWith?(spec: BodySpec, config: C, effector: string): boolean;
  /** What is wrong with the settings of its own `action` holds, each a sentence. */
  actionFaults(action: A): readonly string[];
  /** The blow `action` throws from a body of `spec`, where its aim may read it (`AimPart.make`): the path's family and the hands' paths. */
  blow?(spec: BodySpec, config: C, action: A): AimedBlow;
  /** How many blows an action of it throws; one unless it says. */
  blows?(config: C): number;
  estimate?(spec: BodySpec, config: C, action: A, aim: Aim, unit: "opening" | "net" | null): ActionEstimates[string] | null;
  make(making: ExecutorMaking, config: C, actions: readonly A[]): Executor;
}

/** **Actions that aim and hold nothing of their own**: what an executor whose actions are a name, effectors, regions and an aim says of them. */
export const AIMED_ACTIONS = Object.freeze({ aims: true, actionKeys: Object.freeze([]), actionFaults: () => [] }) satisfies Pick<ExecutorPart, "aims" | "actionKeys" | "actionFaults">;
