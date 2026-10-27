import type { LocomotionConfig } from "../mind/config.ts";
import { deepFreeze } from "../state.ts";
import { WALK_RUN } from "./walk-run.ts";

/**
 * **The gaits a body gets about by**, by name: what a person chooses between (`MoveConfig`), each
 * the game's controller and its searched settings (`legs`), none of them a person's to tune. A
 * gait's top speed is its controller's envelope, measured on each body with each thing it holds
 * (`src/core/control/stance-envelope.ts`). Braced and the run are one walk and run (`WalkRunConfig`), braced told it
 * may not run, so that Move changes between them at once and a run gives way to the stance's walk
 * at its next landing. A new gait is one entry here.
 */
export const GAITS = deepFreeze({
  "braced": { label: "Braced", legs: { kind: "walk-run", ...WALK_RUN, runs: false } },
  "run": { label: "Run", legs: { kind: "walk-run", ...WALK_RUN } },
} satisfies Readonly<Record<string, { readonly label: string; readonly legs: LocomotionConfig }>>);

/** A gait's name (`GAITS`). */
export type GaitName = keyof typeof GAITS;

/** Every gait's name, in `GAITS`' order. */
export const GAIT_NAMES = Object.freeze(Object.keys(GAITS) as GaitName[]);
