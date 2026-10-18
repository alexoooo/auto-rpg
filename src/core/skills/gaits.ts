import type { LocomotionConfig } from "../mind/config.ts";
import { deepFreeze } from "../state.ts";
import { SIMBICON } from "./simbicon.ts";
import { STRIDE } from "./stride.ts";
import { WALK_RUN } from "./walk-run.ts";

/**
 * **The gaits a body gets about by**, by name: what a person chooses between (`MoveConfig`), each
 * the game's controller and its searched settings (`legs`), none of them a person's to tune. A
 * gait's top speed is its controller's envelope, measured on each body with each thing it holds
 * (`src/core/control/stance-envelope.ts`); its stage says whether it is the game's or research
 * offered beside it. Braced and the run are one walk and run (`WalkRunConfig`), braced told it
 * may not run, so that Move changes between them at once and a run gives way to the stance's walk
 * at its next landing. The SIMBICON walk and its run, which drive the legs themselves, are offered
 * beside them the same way, to be compared with them. A new gait is one entry here.
 */
export const GAITS = deepFreeze({
  "braced": { label: "Braced", stage: "game", legs: { kind: "walk-run", ...WALK_RUN, runs: false } },
  "run": { label: "Run", stage: "game", legs: { kind: "walk-run", ...WALK_RUN } },
  "simbicon-walk": { label: "SIMBICON walk", stage: "game", legs: { kind: "simbicon", ...SIMBICON, runs: false } },
  "simbicon-run": { label: "SIMBICON run", stage: "game", legs: { kind: "simbicon", ...SIMBICON } },
  "stride": { label: "Stride", stage: "experimental", legs: { kind: "stride", ...STRIDE } },
} satisfies Readonly<Record<string, { readonly label: string; readonly stage: "game" | "experimental"; readonly legs: LocomotionConfig }>>);

/** A gait's name (`GAITS`). */
export type GaitName = keyof typeof GAITS;

/** Every gait's name, in `GAITS`' order. */
export const GAIT_NAMES = Object.freeze(Object.keys(GAITS) as GaitName[]);
