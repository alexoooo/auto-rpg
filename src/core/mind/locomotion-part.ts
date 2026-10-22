import type { Body } from "../body.ts";
import type { Locomotion } from "../skills/locomotion.ts";
import type { PartLookup } from "./lookup.ts";
import type { KeysOf, Part, PartConfig } from "./parts.ts";

/** Legs of any registered kind (`LOCOMOTIONS`), as a lookup finds them (`legsOf`, `kit.ts`): how Move makes the gaits it chooses among. */
export interface Legs {
  make(body: Body, config: PartConfig): Locomotion;
  /** Whether legs of `config` may run (`Locomotion.runs`), undefined for legs that are not told. */
  runs(config: PartConfig): boolean | undefined;
  /** The lookup the legs were made with, for the parts their config names (Move's rules). */
  readonly parts: PartLookup;
}

/**
 * **A kind of locomotion**: a part of role `locomotion` that owns its config's type, keys,
 * defaults, faults and fit, and makes the legs' skill. The legs it makes state their limits to the
 * speed rule (`travelSpeed`, `src/core/mind/travel.ts`): what they hold (`Locomotion.envelope`) and
 * how fast they stop (`Locomotion.stopping`).
 */
export interface LocomotionPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "locomotion";
  readonly keys: KeysOf<C>;
  /** Whether legs of `config` may run (`Locomotion.runs`); absent for legs that are not told. */
  runs?(config: C): boolean;
  /** The legs' skill of `config` for `body`; `legs` makes another kind's, as Move's gaits are. */
  make(body: Body, config: C, legs: Legs): Locomotion;
}
