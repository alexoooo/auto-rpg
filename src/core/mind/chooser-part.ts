import type { KeysOf, Part, PartConfig } from "./parts.ts";

/**
 * **A kind of chooser**: a part of role `chooser` that owns its config's keys and faults, and makes
 * the chooser over a body's options (`O`), its chances drawn from a seed (`BodyHost.seed`). What an
 * option and a chooser (`M`) are is the mind's whose slot holds the part: the lookup gives a chooser
 * of either unread, and the mind reads them as its own.
 */
export interface ChooserPart<C extends PartConfig = PartConfig, O = unknown, M = unknown> extends Part<C> {
  readonly role: "chooser";
  readonly keys: KeysOf<C>;
  /** The chooser over `options`, its chances drawn from `seed`. */
  make(config: C, options: readonly O[], seed: number): M;
}
