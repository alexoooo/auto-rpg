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
 * **A kind of position value**: a part of role `position` that owns its config's keys and faults,
 * and makes what a place is worth (`V`), read by the mind whose slot holds the part as its own.
 */
export interface PositionPart<C extends PartConfig = PartConfig, V = unknown> extends Part<C> {
  readonly role: "position";
  readonly keys: KeysOf<C>;
  /** The position value a config of it names. */
  make(config: C): V;
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
    readonly position: PositionPart;
    readonly predictions: PredictionsPart;
  }
}
