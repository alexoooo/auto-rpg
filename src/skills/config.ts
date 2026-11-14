import type { ConfigFor } from "../parts/lookup.ts";
import type { Region } from "./framework/action.ts";

/** **The legs' config**, by registered kind. */
export interface LocomotionConfigs {}

/** **A gait's legs' config**, by registered kind. */
export interface GaitConfigs {}

/** **An executor's config**, by registered kind: its settings and the name its actions call it by. */
export interface ExecutorConfigs {}

/** **An executor as a body's skills hold it** (`ExecutorPart`): its config, of any part of the role, and the name its actions call it by. */
export type ExecutorEntry = ConfigFor<"executor"> & { readonly name: string };

/** **A registered aim's config**, by registered kind. */
export interface AimConfigs {}

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
  readonly aim?: ConfigFor<"aim">;
}

/** **A registered guard's config**, by registered kind. */
export interface GuardConfigs {}

/** **A registered low support's config**, by registered kind. */
export interface SupportConfigs {}

declare module "../parts/lookup.ts" {
  interface RoleConfigs {
    readonly locomotion: LocomotionConfigs;
    readonly gait: GaitConfigs;
    readonly executor: ExecutorConfigs;
    readonly aim: AimConfigs;
    readonly guard: GuardConfigs;
    readonly support: SupportConfigs;
  }
}

/** **What a body's skills are made from** (`makeSkills`): its legs, its navigation, its guard, its executors and the actions they carry out, and its low support, each any part of its role. */
export interface SkillParts {
  readonly legs: ConfigFor<"locomotion">;
  readonly navigations: readonly ConfigFor<"navigation">[];
  readonly guards: readonly ConfigFor<"guard">[];
  readonly executors: readonly ExecutorEntry[];
  readonly actions: readonly ActionConfig[];
  /** Every enabled low support (`LowSupportPart`). */
  readonly supports: readonly ConfigFor<"support">[];
}
