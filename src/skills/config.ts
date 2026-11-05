import type { PartConfig } from "../parts/parts.ts";
import type { Region } from "./framework/action.ts";

/** **The legs' config**, by registered kind. */
export interface LocomotionConfigs {}
export type LocomotionConfig = LocomotionConfigs[keyof LocomotionConfigs];

/** **A gait's legs' config**, by registered kind. */
export interface GaitConfigs {}
export type GaitConfig = GaitConfigs[keyof GaitConfigs];

/** **An executor's config**, by registered kind: its settings and the name its actions call it by. */
export interface ExecutorConfigs {}
export type ExecutorConfig = ExecutorConfigs[keyof ExecutorConfigs];

/** **An executor as a body's skills hold it** (`ExecutorPart`): its config, of any part of the role, and the name its actions call it by. */
export interface ExecutorEntry extends PartConfig { readonly name: string }

/** **A registered aim's config**, by registered kind. */
export interface AimConfigs {}
export type AimConfig = AimConfigs[keyof AimConfigs];

/**
 * **An action a body's skills carry out**, as its Options ask it (`NamedSkills.action`): its name,
 * the executor that carries it out (by its name, `ExecutorEntry.name`) and the effectors it may
 * strike with; where its executor aims (`ExecutorPart.aims`), the regions it strikes, in order,
 * and its aim, any part of the role (`AimPart`).
 */
export interface ActionConfig {
  readonly name: string;
  readonly executor: string;
  readonly effectors: readonly string[];
  readonly regions?: readonly Region[];
  readonly aim?: AimConfig | PartConfig;
}

/** **A registered guard's config**, by registered kind. */
export interface GuardConfigs {}
export type GuardConfig = GuardConfigs[keyof GuardConfigs];

/** **A registered low support's config**, by registered kind. */
export interface SupportConfigs {}
export type SupportConfig = SupportConfigs[keyof SupportConfigs];

/** **What a body's skills are made from** (`kitSkills`): its legs, its navigation, its guard, its executors and the actions they carry out, and its low support, each any part of its role. */
export interface SkillKit {
  readonly legs: PartConfig;
  readonly navigation: PartConfig;
  readonly guard: PartConfig;
  readonly executors: readonly ExecutorEntry[];
  readonly actions: readonly ActionConfig[];
  /** Its low support (`SupportPart`), or none. */
  readonly support: PartConfig | null;
}
