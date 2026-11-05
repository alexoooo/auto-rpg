import type { Body } from "../../control/body.ts";
import type { Locomotion } from "../locomotion/locomotion.ts";
import type { GaitName } from "../locomotion/gaits.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import type { KeysOf, Part, PartConfig } from "../../parts/parts.ts";

/** The gaits' legs of any registered kind (`GAIT_PARTS`), as a lookup finds them (`legsOf`, `kit.ts`): how Move makes the gaits it chooses among. */
export interface Legs {
  make(body: Body, config: PartConfig): Locomotion;
  /** Whether legs of `config` may run (`Locomotion.runs`), undefined for legs that are not told. */
  runs(config: PartConfig): boolean | undefined;
  /** The lookup the legs were made with, for the parts their config names (Move's rules). */
  readonly parts: PartLookup;
}

/**
 * **A kind of locomotion**: a part of role `locomotion` that owns its config's type, keys,
 * defaults, faults and fit, and makes a body's legs over its gaits (`GaitPart`). The legs it makes
 * state their limits to the speed rule (`travelSpeed`, `src/skills/intent/travel.ts`): what they hold
 * (`Locomotion.envelope`), how long they go on once asked to slow (`Locomotion.lag`) and how fast
 * they stop (`Locomotion.stopping`).
 */
export interface LocomotionPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "locomotion";
  readonly keys: KeysOf<C>;
  /** The legs' skill of `config` for `body`; `legs` makes its gaits' legs. */
  make(body: Body, config: C, legs: Legs): Locomotion;
  /** The gaits legs of `config` go by, by name (`LegsGoal.gait`), which a walk names; none for legs that go by no gait by name. */
  gaits?(config: C): readonly { readonly name: GaitName; readonly label: string; readonly legs: PartConfig }[];
}

/**
 * **A kind of gait's legs**: a part of role `gait` that owns its config's type, keys, defaults,
 * faults and fit, and makes the walk a gait goes by (`Gait.legs`), which the legs (`LocomotionPart`)
 * go by while the gait is theirs.
 */
export interface GaitPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "gait";
  readonly keys: KeysOf<C>;
  /** Whether legs of `config` may run (`Locomotion.runs`); absent for legs that are not told. */
  runs?(config: C): boolean;
  /** The walk of `config` for `body`. */
  make(body: Body, config: C): Locomotion;
}

declare module "../../parts/lookup.ts" {
  interface RoleParts {
    readonly locomotion: LocomotionPart;
    readonly gait: GaitPart;
  }
}
