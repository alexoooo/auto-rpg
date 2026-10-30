import type { ConditionConfig } from "../intent/conditions.ts";
import type { ConfigOf, PartConfig } from "../parts/parts.ts";
import type { SkillKit } from "../skills/config.ts";
import { deepFreeze } from "../state.ts";
import type { BEHAVIOURS as BEHAVIOUR_LIST } from "./behaviours.ts";
import type { PLANNERS } from "./planners.ts";

/** Focus is selected once for all behaviours in a control step. */
export type FocusRuleConfig = { readonly kind: "ordered" | "current" } | { readonly kind: "nearest"; readonly prefer: "standing" | "standing-first" };

/** A selector chooses configured action names and retains a choice within bounded patience. */
export type SelectorConfig = ({ readonly kind: "first-ready" | "rotate" | "scored" | "estimate" }
  | { readonly kind: "rules"; readonly rules: readonly { readonly when: ConditionConfig; readonly actions: readonly string[] }[]; readonly otherwise: readonly string[] })
  & { readonly rethink: number; readonly patience: number };

/** **A behaviour's config**, by kind (`BEHAVIOURS`): one part of the shared tactical intent. */
export type BehaviourConfig = ConfigOf<typeof BEHAVIOUR_LIST>;

/** Ranked behaviours share focus, selection and action instances. */
export interface BehavioursConfig {
  readonly kind: "behaviours";
  readonly target: readonly FocusRuleConfig[];
  readonly choose: SelectorConfig;
  readonly list: readonly BehaviourConfig[];
}

/** **The tactics' config**, by kind (`PLANNERS`). */
export type TacticsConfig = ConfigOf<typeof PLANNERS>;

/** A fighter shares named executors across its configured actions. */
export interface FighterConfig extends SkillKit {
  readonly kind: "fighter";
  readonly tactics: TacticsConfig;
  /** The sub-minds it hands its body to, in rank order: the first that wants the body has it. */
  readonly subs: readonly PartConfig[];
}

/** Shared defaults keep ordered focus before the current and nearest standing foe. */
export const FIGHTING: BehavioursConfig = deepFreeze({ kind: "behaviours",
  target: [{ kind: "ordered" }, { kind: "current" }, { kind: "nearest", prefer: "standing-first" }],
  choose: { kind: "first-ready", rethink: .2, patience: 2 },
  list: [{ kind: "follow-orders" }, { kind: "clear-of-fallen" }, { kind: "attack" }, { kind: "approach" }, { kind: "cover", guard: "pose" }] });
