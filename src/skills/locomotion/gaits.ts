import type { PartConfig } from "../../parts/parts.ts";
import { deepFreeze } from "../../core/world/state.ts";

/**
 * **A gait**: what a body gets about by, as Move walks by it (`MoveConfig.gaits`): its name, which
 * a legs goal and Move's rules name it by (`LegsGoal.gait`), its label, and its legs (a gait part's
 * config, `GaitPart`), measured on each body by its envelope
 * (`src/control/stance-envelope.ts`) and its profile (the Gait drill). Two gaits whose legs
 * differ only in whether they may run share one walk, so Move changes between them at once.
 */
export interface Gait {
  readonly name: string;
  readonly label: string;
  readonly legs: PartConfig;
}

/** A gait's name (`Gait.name`). */
export type GaitName = string;

/**
 * **The stock gaits**, by name: the game's controller and its searched settings, none of them a
 * person's to tune. Braced and the run configure the walk and run (`WalkRunConfig`) separately, braced
 * told it may not run. Their implementation shares motion for identical physical settings, so
 * Move changes permission at once while a run finishes its current landing.
 */
const DEFAULT_GAITS = {
  "braced": { label: "Braced", legs: { kind: "walk-run", runs: false } },
  "run": { label: "Run", legs: { kind: "walk-run" } },
};
const GAITS = deepFreeze(DEFAULT_GAITS satisfies Readonly<Record<string, { readonly label: string; readonly legs: PartConfig }>>);

/** **The stock gaits** (`GAITS`) as gaits: what Move walks by where its config names none. */
export const STOCK_GAITS: readonly Gait[] = deepFreeze(Object.entries(GAITS).map(([name, gait]) => ({ name, label: gait.label, legs: gait.legs })));

/** The gait of `gaits` called `name`; null where none is. */
export const gaitNamed = (gaits: readonly Gait[], name: GaitName): Gait | null => gaits.find((gait) => gait.name === name) ?? null;
