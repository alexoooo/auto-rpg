import type { ConfigOf, PartConfig } from "../parts/parts.ts";
import type { Region } from "./framework/action.ts";
import type { AIMS } from "./framework/aims.ts";
import type { EXECUTORS } from "./framework/executors.ts";
import type { LOCOMOTIONS } from "./framework/locomotions.ts";
import type { GAIT_PARTS } from "./framework/gait-parts.ts";
import type { GUARDS } from "./guard/guards.ts";
import type { SUPPORTS } from "./locomotion/supports.ts";

/** **The legs' config**, by kind (`LOCOMOTIONS`). */
export type LocomotionConfig = ConfigOf<typeof LOCOMOTIONS>;

/** **A gait's legs' config**, by kind (`GAIT_PARTS`). */
export type GaitConfig = ConfigOf<typeof GAIT_PARTS>;

/** **An executor's config**, by kind (`EXECUTORS`): its settings and the name its actions call it by. */
export type ExecutorConfig = ConfigOf<typeof EXECUTORS>;

/** **An executor as a body's skills hold it** (`ExecutorPart`): its config, of any part of the role, and the name its actions call it by. */
export interface ExecutorEntry extends PartConfig { readonly name: string }

/** **A stock aim's config**, by kind (`AIMS`). */
export type AimConfig = ConfigOf<typeof AIMS>;

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

/** **A stock guard's config**, by kind (`GUARDS`). */
export type GuardConfig = ConfigOf<typeof GUARDS>;

/** **A stock low support's config**, by kind (`SUPPORTS`). */
export type SupportConfig = ConfigOf<typeof SUPPORTS>;

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
