import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import type { ConfigFor, PartLookup } from "../../../parts/lookup.ts";
import type { KeysOf, Part, PartConfig } from "../../../parts/parts.ts";
import type { ActionConfig, ExecutorEntry } from "../../../skills/config.ts";
import type { Chooser } from "./chooser.ts";
import type { OptionContext } from "./context.ts";
import type { Objective } from "./objective.ts";
import type { Option } from "./option.ts";
import type { ExchangePredictor, Predictors } from "./predictors.ts";

/**
 * **A kind of chooser**: a part of role `chooser` that owns its config's keys and faults, and makes
 * the chooser over a body's Options, its chances drawn from a seed (`BodyHost.seed`), the parts
 * its slots name found by `parts`.
 */
export interface ChooserPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "chooser";
  readonly keys: KeysOf<C>;
  /**
   * The chooser over `options`, its chances drawn from `seed`, the parts its slots name found by
   * `parts`, for `body`: its model and what it holds (`bodyOf`). A chooser that searches asks
   * `exchange` where the foe is later and how it replies.
   */
  make(making: { readonly config: C; readonly options: readonly Option[]; readonly seed: number; readonly parts: PartLookup; readonly body: string; readonly exchange: ExchangePredictor }): Chooser;
}

/** Static capabilities used when deciding whether a configured Option builds any behavior. */
export interface OptionBody {
  readonly spec: BodySpec;
  readonly parts: PartLookup;
  readonly options: readonly PartConfig[];
  /** The selected locomotion part, or null when the controller does not publish it. */
  readonly legs: PartConfig | null;
}

/**
 * **What an Option's config names of its body's skills** (`OptionPart.skills`), where the body
 * fits what it names: the executors it strikes by and what it asks of each (`ActionConfig`), the
 * ground technique it runs, the low support it strikes from and the navigation its walk goes by.
 */
export interface NamedSkills {
  readonly executors?: readonly ExecutorEntry[];
  readonly actions?: readonly ActionConfig[];
  readonly technique?: ConfigFor<"technique">;
  readonly support?: ConfigFor<"support">;
  readonly navigation?: ConfigFor<"navigation">;
}

/**
 * **A kind of Option**: a part of role `option` that owns its config's keys and faults, and makes
 * the Options of its kind a Mind decides among from what that Mind gives it (`OptionContext`).
 */
export interface OptionPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "option";
  /** Whether this Option applies to the body and its selected continuous services. */
  applicable?(config: C, body: OptionBody): boolean;
  skills?(config: C, spec: BodySpec, parts: PartLookup, options: readonly PartConfig[]): NamedSkills | null;
  /**
   * The effectors its blows strike with on a body of `spec`, as it holds what it holds, or
   * undefined where `config` names no blow of its own: what its mind strikes with (`Controller.strikes`).
   */
  strikes?(spec: BodySpec, config: C, parts: PartLookup): readonly string[] | undefined;
  /** Whether it carries out a person's `Orders`: its mind obeys where an Option of it does (`Controller.obeys`). */
  readonly obeys?: boolean;
  /** Whether its Options keep the body where it stands, striking and covering nothing: a rest, or a way of the ground (`standingOptions`). */
  readonly stands: boolean;
  readonly keys: KeysOf<C>;
  /** The configs a config of it stands for, where it stands for several (`optionsOf`); itself where absent. */
  each?(config: C, parts: PartLookup): readonly ConfigFor<"option">[];
  /** The way off the ground it is, where it is one: an ordinary ascent establishes routes; a fallback serves only the starts no ascent covers. */
  readonly recovery?: { readonly purpose: "ascent" | "fallback"; technique(config: C): ConfigFor<"technique"> };
  /** The Options a config of it makes, from what the Mind gives (`given`), in their rank order. */
  make(config: C, given: OptionContext): readonly Option[];
}

/**
 * **A kind of objective**: a part of role `objective` that owns its config's keys and faults, and
 * makes what an Option's model is worth to the body (`Objective`).
 */
export interface ObjectivePart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "objective";
  readonly keys: KeysOf<C>;
  /** The objective a config of it names. */
  make(config: C): Objective;
}

/**
 * **A kind of predictions**: a part of role `predictions` that owns its config's keys and faults,
 * and makes what a Mind predicts by (`Predictors`) from what its config names (the tables a drill
 * measured, or none, so each model reads its guess; and whether it guesses at all, `Predictors.guesses`).
 */
export interface PredictionsPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "predictions";
  readonly keys: KeysOf<C>;
  /** What a Mind predicts by, as `config` says. */
  make(config: C): Predictors;
}

/** **A chooser's config**, by registered kind. */
export interface ChooserConfigs {}
/** **An Option's config**, by registered kind. */
export interface OptionConfigs {}
/** **An objective's config**, by registered kind. */
export interface ObjectiveConfigs {}
/** **A predictions part's config**, by registered kind. */
export interface PredictionsConfigs {}

// The option framework's roles, added to the roles the part lookup knows (`RoleParts`), each with its configs (`RoleConfigs`).
declare module "../../../parts/lookup.ts" {
  interface RoleParts {
    readonly chooser: ChooserPart;
    readonly option: OptionPart;
    readonly objective: ObjectivePart;
    readonly predictions: PredictionsPart;
  }
  interface RoleConfigs {
    readonly chooser: ChooserConfigs;
    readonly option: OptionConfigs;
    readonly objective: ObjectiveConfigs;
    readonly predictions: PredictionsConfigs;
  }
}
