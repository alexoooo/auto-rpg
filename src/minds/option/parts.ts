import type { NamedSkills } from "./skills.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { OptionEvaluation } from "./model.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import type { KeysOf, Part, PartConfig } from "../../parts/parts.ts";

/**
 * **A kind of chooser**: a part of role `chooser` that owns its config's keys and faults, and makes
 * the chooser over a body's options (`O`), its chances drawn from a seed (`BodyHost.seed`), the
 * parts its slots name found by `parts`. What an option and a chooser (`M`) are is the mind's whose
 * slot holds the part: the lookup gives a chooser of either unread, and the mind reads them as its own.
 */
export interface ChooserPart<C extends PartConfig = PartConfig, O = unknown, M = unknown> extends Part<C> {
  readonly role: "chooser";
  readonly model: string;
  readonly keys: KeysOf<C>;
  /** The chooser over `options`, its chances drawn from `seed`, the parts its slots name found by `parts`, deciding on its body's `phase` (`BodyHost.phase`), 0 unless given. */
  make(config: C, options: readonly O[], seed: number, parts: PartLookup, phase?: number): M;
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
 * **A kind of option**: a part of role `option` that owns its config's keys and faults, and makes
 * the options of its kind a mind decides among from what that mind gives it (`G`). What an option
 * (`O`) and what is given are the mind's whose slot holds the part: the lookup gives the options
 * unread, and the mind reads them as its own.
 */
export interface OptionPart<C extends PartConfig = PartConfig, G = unknown, O = unknown> extends Part<C> {
  readonly role: "option";
  /** Constructor input protocol supplied by the selected prediction model. */
  readonly model: string;
  /** Whether this Option applies to the body and its selected continuous services. */
  applicable?(config: C, body: OptionBody): boolean;
  skills?(config: C, spec: BodySpec, parts: PartLookup, options: readonly PartConfig[]): NamedSkills | null;
  readonly keys: KeysOf<C>;
  /** The options a config of it makes, from what the mind gives (`given`), in their rank order. */
  make(config: C, given: G): readonly O[];
}

/** Construction and editors use the same static Option admission, independent of a fight's state. */
export function optionApplies(config: PartConfig, body: OptionBody): boolean {
  const { spec, parts, options } = body, part = parts.of("option", config);
  return part.fits(spec, config, parts) === null && part.skills?.(config, spec, parts, options) !== null
    && (part.applicable?.(config, body) ?? true);
}

/**
 * **A kind of objective**: a part of role `objective` that owns its config's keys and faults, and
 * makes what an option's model is worth to the body (`V`), read by the mind whose slot holds the part
 * as its own. The percepts and predictions it reads beyond the situation's own it names in `uses`.
 */
export interface ObjectivePart<C extends PartConfig = PartConfig, V = unknown> extends Part<C> {
  readonly role: "objective";
  readonly keys: KeysOf<C>;
  /** The objective a config of it names. */
  make(config: C): V;
}

/**
 * **A kind of predictions**: a part of role `predictions` that owns its config's keys and faults,
 * and makes what builds a mind's decider (`OptionEvaluation`) from what its config predicts by
 * (the tables a drill measured, or none, so each model reads its prior).
 */
export interface PredictionsPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "predictions";
  readonly model: string;
  readonly keys: KeysOf<C>;
  /** What builds a decider (`OptionEvaluation.build`) predicting as `config` says. */
  make(config: C): OptionEvaluation;
}

// The option framework's roles, added to the roles the part lookup knows (`RoleParts`).
declare module "../../parts/lookup.ts" {
  interface RoleParts {
    readonly chooser: ChooserPart;
    readonly option: OptionPart;
    readonly objective: ObjectivePart;
    readonly predictions: PredictionsPart;
  }
}
