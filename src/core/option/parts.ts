import type { PartLookup } from "../parts/lookup.ts";
import type { KeysOf, Part, PartConfig } from "../parts/parts.ts";

/**
 * **A kind of chooser**: a part of role `chooser` that owns its config's keys and faults, and makes
 * the chooser over a body's options (`O`), its chances drawn from a seed (`BodyHost.seed`), the
 * parts its slots name found by `parts`. What an option and a chooser (`M`) are is the mind's whose
 * slot holds the part: the lookup gives a chooser of either unread, and the mind reads them as its own.
 */
export interface ChooserPart<C extends PartConfig = PartConfig, O = unknown, M = unknown> extends Part<C> {
  readonly role: "chooser";
  readonly keys: KeysOf<C>;
  /** The chooser over `options`, its chances drawn from `seed`, the parts its slots name found by `parts`. */
  make(config: C, options: readonly O[], seed: number, parts: PartLookup): M;
}

/**
 * **A kind of option**: a part of role `option` that owns its config's keys and faults, and makes
 * the options of its kind a mind decides among from what that mind gives it (`G`). What an option
 * (`O`) and what is given are the mind's whose slot holds the part: the lookup gives the options
 * unread, and the mind reads them as its own.
 */
export interface OptionPart<C extends PartConfig = PartConfig, G = unknown, O = unknown> extends Part<C> {
  readonly role: "option";
  readonly keys: KeysOf<C>;
  /** The options a config of it makes, from what the mind gives (`given`), in their rank order. */
  make(config: C, given: G): readonly O[];
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
 * **A kind of percept**: a part of role `percept` that owns its config's keys and faults, and makes
 * a reading of what the body senses (`P`), which a situation reads where an option or an objective
 * asks for it by its config (`Situation.perceive`); the part that asks names it in `uses`.
 */
export interface PerceptPart<C extends PartConfig = PartConfig, P = unknown> extends Part<C> {
  readonly role: "percept";
  readonly keys: KeysOf<C>;
  /** The percept a config of it names. */
  make(config: C): P;
}

/**
 * **A kind of prediction**: a part of role `prediction` that owns its config's keys and faults, and
 * makes what a situation predicts from what the body senses and the data it was given (`P`), read
 * where an option or an objective asks for it by its config (`Situation.predict`); the part that
 * asks names it in `uses`.
 */
export interface PredictionPart<C extends PartConfig = PartConfig, P = unknown> extends Part<C> {
  readonly role: "prediction";
  readonly keys: KeysOf<C>;
  /** The prediction a config of it names. */
  make(config: C): P;
}

/**
 * **A kind of predictions**: a part of role `predictions` that owns its config's keys and faults,
 * and makes the data a mind predicts from (`T`: the tables a drill measured, or none, so each model
 * reads its prior), read by the mind whose slot holds the part as its own.
 */
export interface PredictionsPart<C extends PartConfig = PartConfig, T = unknown> extends Part<C> {
  readonly role: "predictions";
  readonly keys: KeysOf<C>;
  /** The data a config of it predicts from. */
  make(config: C): T;
}

// The option framework's roles, added to the roles the part lookup knows (`RoleParts`).
declare module "../parts/lookup.ts" {
  interface RoleParts {
    readonly chooser: ChooserPart;
    readonly option: OptionPart;
    readonly objective: ObjectivePart;
    readonly percept: PerceptPart;
    readonly prediction: PredictionPart;
    readonly predictions: PredictionsPart;
  }
}
