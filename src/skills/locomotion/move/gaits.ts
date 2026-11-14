import type { GaitName } from "../../framework/skill.ts";
import type { ConfigFor } from "../../../parts/lookup.ts";
import { deepFreeze } from "../../../core/state.ts";

/**
 * **A gait**: what a body gets about by, as Move walks by it (`MoveConfig.gaits`): its name, which
 * a legs goal and Move's rules name it by (`LegsGoal.gait`), its label, and its legs (a gait part's
 * config, `GaitPart`), measured on each body by its envelope
 * (`src/control/stance/stance-envelope.ts`) and its profile (the Gait drill).
 */
export interface Gait {
  readonly name: string;
  readonly label: string;
  readonly legs: ConfigFor<"gait">;
}


/**
 * **The stock gaits**, by name: the game's controllers and their searched settings, none of them a
 * person's to tune. Braced is the stance's walk (`StanceWalkConfig`), the fighting step; the run
 * is the walk and run (`WalkRunConfig`) by its body's record. Move changes between them on the
 * move (`move`).
 */
const GAITS: Readonly<Record<string, { readonly label: string; readonly legs: ConfigFor<"gait"> }>> = deepFreeze({
  "braced": { label: "Braced", legs: { kind: "stance-walk" } },
  "run": { label: "Run", legs: { kind: "walk-run" } },
});

/** **The stock gaits** (`GAITS`) as gaits: what Move walks by where its config names none. */
export const STOCK_GAITS: readonly Gait[] = deepFreeze(Object.entries(GAITS).map(([name, gait]) => ({ name, label: gait.label, legs: gait.legs })));

/** The gait of `gaits` called `name`; null where none is. */
export const gaitNamed = (gaits: readonly Gait[], name: GaitName): Gait | null => gaits.find((gait) => gait.name === name) ?? null;
