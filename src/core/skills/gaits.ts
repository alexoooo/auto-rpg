import type { LocomotionConfig } from "../mind/config.ts";
import { deepFreeze } from "../state.ts";
import { SIMBICON } from "./simbicon.ts";
import { STRIDE } from "./stride.ts";

/**
 * **The gaits a body gets about by**, by name: what a person chooses between (`MoveConfig`), each
 * the game's controller and its searched settings (`legs`), none of them a person's to tune. A
 * gait's top speed is its controller's envelope, measured on each body with each thing it holds
 * (`src/core/control/stance-envelope.ts`); its stage says whether it is the game's or research
 * offered beside it. The walk and the run are one SIMBICON walk, told whether it may run
 * (`SimbiconConfig.runs`), and Move changes between them at once. A new gait is one entry here.
 */
export const GAITS = deepFreeze({
  "braced": { label: "Braced", stage: "game", legs: { kind: "stance-walk" } },
  "walk": { label: "Walk", stage: "game", legs: { kind: "simbicon", ...SIMBICON, runs: false } },
  "run": { label: "Run", stage: "game", legs: { kind: "simbicon", ...SIMBICON } },
  "stride": { label: "Stride", stage: "experimental", legs: { kind: "stride", ...STRIDE } },
} satisfies Readonly<Record<string, { readonly label: string; readonly stage: "game" | "experimental"; readonly legs: LocomotionConfig }>>);

/** A gait's name (`GAITS`). */
export type GaitName = keyof typeof GAITS;

/** Every gait's name, in `GAITS`' order. */
export const GAIT_NAMES = Object.freeze(Object.keys(GAITS) as GaitName[]);
