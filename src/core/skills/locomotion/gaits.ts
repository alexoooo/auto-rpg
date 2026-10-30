import type { LocomotionConfig } from "../../mind/config.ts";
import { deepFreeze } from "../../state.ts";
import { WALK_RUN } from "./walk-run.ts";

/**
 * **A gait**: what a body gets about by, as Move walks by it (`MoveConfig.gaits`): its name, which
 * a legs goal and Move's rules name it by (`LegsGoal.gait`), its label, and its legs (a locomotion
 * part's config other than Move's), measured on each body by its envelope
 * (`src/core/control/stance-envelope.ts`) and its profile (the Gait drill). Two gaits whose legs
 * differ only in whether they may run share one walk, so Move changes between them at once.
 */
export interface Gait {
  readonly name: string;
  readonly label: string;
  readonly legs: LocomotionConfig;
}

/** A gait's name (`Gait.name`). */
export type GaitName = string;

/**
 * **The stock gaits**, by name: the game's controller and its searched settings, none of them a
 * person's to tune. Braced and the run are one walk and run (`WalkRunConfig`), braced told it may
 * not run, so that Move changes between them at once and a run gives way to the stance's walk at
 * its next landing.
 */
export const GAITS = deepFreeze({
  "braced": { label: "Braced", legs: { kind: "walk-run", ...WALK_RUN, runs: false } },
  "run": { label: "Run", legs: { kind: "walk-run", ...WALK_RUN } },
} satisfies Readonly<Record<string, { readonly label: string; readonly legs: LocomotionConfig }>>);

/** Every stock gait's name, in `GAITS`' order. */
export const GAIT_NAMES: readonly GaitName[] = Object.freeze(Object.keys(GAITS));

/** **The stock gaits** (`GAITS`) as gaits: what Move walks by where its config names none. */
export const STOCK_GAITS: readonly Gait[] = deepFreeze(Object.entries(GAITS).map(([name, gait]) => ({ name, label: gait.label, legs: gait.legs })));

/** The gait of `gaits` called `name`; null where none is. */
export const gaitNamed = (gaits: readonly Gait[], name: GaitName): Gait | null => gaits.find((gait) => gait.name === name) ?? null;
