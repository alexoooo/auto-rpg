import type { BodySpec } from "../spec/body.ts";
import type { ActionConfig, SkillKit } from "../skills/config.ts";
import type { Aim } from "../skills/framework/aim-part.ts";
import type { PartLookup } from "../parts/lookup.ts";
import type { Orders } from "../intent/orders.ts";
import type { KeysOf, Part, PartConfig } from "../parts/parts.ts";
import type { Decider, Script, Sight } from "../mind/decider.ts";
import type { Window } from "../skills/framework/action.ts";
import type { Intent } from "../intent/intent.ts";
import type { Skills } from "../skills/framework/skills.ts";
import type { ActionEstimates } from "../skills/framework/executor-part.ts";
import type { Rulebook } from "../rules/rulebook.ts";

/** Operational facts a planner shares with its layers, independently of inspection reports. */
export interface TacticalDecision {
  readonly focus?: string | null;
  readonly evading?: boolean;
  readonly approach?: Window | null;
}

/** A declared operational field; a null or false value still supplies the capability. */
export type DecisionCapability = keyof TacticalDecision;

/**
 * **Tactics**: the deciders this package makes (`TacticsPart.make`), each publishing this step's
 * operational context (`TacticalDecision`) where its part declares the capabilities, which its
 * layers and the skills it prepared read live.
 */
export type TacticalDecider = Decider<Sight, Intent, TacticalDecision>;

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
  readonly script?: Script;
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
  /**
   * What the tactics ask of the skills they are driven over: the shared kit prepared once, from the
   * innermost part out, reading the active composed decision live through the seam
   * (`decider.decision`); the kit as it is where a part asks nothing.
   */
  prepareSkills?(making: TacticsMaking, config: C, skills: Skills, decider: TacticalDecider): Skills;
  make(making: TacticsMaking, config: C): TacticalDecider;
}

/** The tactics `config` names, made as `making.parts` finds them. */
export const tacticsOf = <C extends PartConfig>(making: TacticsMaking, config: C): TacticalDecider => making.parts.of("tactics", config).make(making, config);

/** `skills` as the tactics `config` names prepare them (`TacticsPart.prepareSkills`), `decider` the tactics they are driven by. */
export const prepareTacticsSkills = (making: TacticsMaking, config: PartConfig, skills: Skills, decider: TacticalDecider): Skills =>
  making.parts.of("tactics", config).prepareSkills?.(making, config, skills, decider) ?? skills;
