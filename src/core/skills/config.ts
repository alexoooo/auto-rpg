import type { ConfigOf, PartConfig } from "../parts/parts.ts";
import type { Region } from "./framework/action.ts";
import type { AIMS } from "./framework/aims.ts";
import type { EXECUTORS } from "./framework/executors.ts";
import type { LOCOMOTIONS } from "./framework/locomotions.ts";
import type { GUARDS } from "./guard/guards.ts";
import type { SUPPORTS } from "./locomotion/supports.ts";

/** **The legs' skill's config**, by kind (`LOCOMOTIONS`). */
export type LocomotionConfig = ConfigOf<typeof LOCOMOTIONS>;

/** **An executor's config**, by kind (`EXECUTORS`): its settings and the name its actions call it by. */
export type ExecutorConfig = ConfigOf<typeof EXECUTORS>;

/** **Any executor's config** (`ExecutorPart`): its kind, of any part of the role a mind may hold, and the name its actions call it by. */
export interface ExecutorEntry extends PartConfig { readonly name: string }

/** **A stock aim's config**, by kind (`AIMS`). */
export type AimConfig = ConfigOf<typeof AIMS>;

/**
 * **A configured action**: its name, the executor that carries it out and the effectors it may
 * strike with. Where its executor aims (`ExecutorPart.aims`), the regions it strikes, in order,
 * and its aim, any part of the role (`AimPart`). Its other settings are its executor's
 * (`ExecutorPart.actionKeys`): the path strike's path (`PathActionConfig`), and `lower`, the
 * support height a low blow is thrown from, which planners read to tell a low blow.
 */
export interface ActionConfig {
  readonly name: string;
  readonly executor: string;
  readonly effectors: readonly string[];
  readonly regions?: readonly Region[];
  readonly aim?: AimConfig | PartConfig;
  readonly lower?: number;
}

/** **A stock guard's config**, by kind (`GUARDS`). */
export type GuardConfig = ConfigOf<typeof GUARDS>;

/** **A stock low support's config**, by kind (`SUPPORTS`). */
export type SupportConfig = ConfigOf<typeof SUPPORTS>;

/** **What a body's skills are made from** (`kitSkills`): its legs, its guard, its low support, its executors and the actions they carry out. */
export interface SkillKit {
  readonly locomotion: LocomotionConfig;
  /** Its navigation, any part of the role (`navigatorOf`): the game's where it names none. */
  readonly navigation?: PartConfig;
  /** Its guard, any part of the role (`GuardPart`): the arms' rest and cover. */
  readonly guard: PartConfig;
  readonly executors: readonly ExecutorEntry[];
  readonly actions: readonly ActionConfig[];
  /** Its low support, any part of the role (`SupportPart`), or none. */
  readonly support: PartConfig | null;
  /** What turns its skills' goals into its muscles' command, any part of the role; the game's (`motorOf`) where it names none. */
  readonly motor?: PartConfig | null;
}
