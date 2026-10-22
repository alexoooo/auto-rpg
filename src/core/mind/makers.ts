import type { Navigator } from "./navigator.ts";
import type { PartConfig } from "./parts.ts";

/**
 * **What makes a mind's parts for its body** from their configs, each by its kind's maker in the
 * registry (`partMakers`, `catalog.ts`): what a mind's host gives its maker (`BodyHost.parts`) and
 * its maker hands each assembly that builds a part, so that the part a config names is the part
 * that runs.
 */
export interface PartMakers {
  /** The navigator `config` names (`NavigatorPart.make`), the game's where it names none. */
  navigator(config: PartConfig | null | undefined): Navigator;
}
