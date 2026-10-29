import type { KeysOf, Part, PartConfig } from "./parts.ts";

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
