import type { BodyView } from "../body.ts";
import type { TargetRef } from "../skills/action.ts";
import type { BodySpec } from "../spec/body.ts";
import type { ActionConfig, SkillKit } from "./config.ts";
import type { Aim } from "./aim-part.ts";
import type { PartLookup } from "./lookup.ts";
import type { Orders } from "./orders.ts";
import type { KeysOf, Part, PartConfig } from "./parts.ts";
import type { DecisionCapability, Sight, TacticalDecision, Tactics } from "./tactics.ts";
import type { Skills } from "../skills/skills.ts";
import type { Rulebook } from "../rules/rulebook.ts";

/** An action's own registration supplies measured estimates without exposing its executor kind. */
export interface ActionEstimate {
  readonly unit: "opening" | "net";
  read(view: BodyView, target: TargetRef, effector: string): number | null;
}
export type ActionEstimates = Readonly<Record<string, ActionEstimate>>;

/** What tactics are made for: the body, the fight's rules, the actions it may start and their estimates, a person's orders, a screen's script and the parts the tree names. */
export interface TacticsMaking {
  readonly spec: BodySpec;
  /** The rules the fight is played by (`BodyHost.rules`), which price a blow. */
  readonly rules: Rulebook;
  readonly actions: readonly ActionConfig[];
  readonly estimates: ActionEstimates;
  /** Each aiming action's aim, by the action's name (`configuredAims`): where its blow would land, as its executor aims it. */
  readonly aims: ReadonlyMap<string, Aim>;
  readonly orders: (sight: Sight) => Orders | null;
  /** The screen's script (`MindWiring.script`), for tactics that need one (`Part.needs`). */
  readonly script?: Tactics;
  readonly parts: PartLookup;
}

/**
 * **A kind of tactics** (a planner): a part of role `tactics` that owns its config's type, keys
 * and faults, and makes the tactics a mind is driven by (`driveBy`).
 */
export interface TacticsPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "tactics";
  readonly keys: KeysOf<C>;
  /** What is wrong with how `config` names the mind's actions (`actions`, their names), each a sentence; a planner that holds another asks it (`parts`). */
  actionFaults?(config: C, actions: readonly string[], parts: PartLookup): readonly string[];
  /** Dependencies on the configured skills; a planner holding another delegates to its child's hook. */
  kitFaults?(config: C, kit: SkillKit, parts: PartLookup): readonly string[];
  /** The operational fields every decision supplies; a composite delegates to its child. */
  decisionCapabilities?(config: C, parts: PartLookup): readonly DecisionCapability[];
  /** Prepare the shared kit once, from the innermost part out, reading the active composed decision live. */
  prepareSkills?(making: TacticsMaking, config: C, skills: Skills, decision: () => TacticalDecision | undefined): Skills;
  make(making: TacticsMaking, config: C): Tactics;
}

/** The tactics `config` names, made as `making.parts` finds them. */
export const tacticsOf = <C extends PartConfig>(making: TacticsMaking, config: C): Tactics => making.parts.of("tactics", config).make(making, config);

/** Apply a configured planner's construction adapter, independently of its decision policies. */
export const prepareTacticsSkills = (making: TacticsMaking, config: PartConfig, skills: Skills, decision: () => TacticalDecision | undefined): Skills =>
  making.parts.of("tactics", config).prepareSkills?.(making, config, skills, decision) ?? skills;
