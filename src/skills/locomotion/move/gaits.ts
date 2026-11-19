import type { GaitName } from "../../framework/skill.ts";
import type { ConfigFor } from "../../../parts/lookup.ts";
import { deepFreeze } from "../../../core/state.ts";
import { STANCE_SPANS, type StanceNumbers } from "../../framework/profile.ts";

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
 * person's to tune. Braced is the stance's walk (`StanceWalkConfig`), the fighting step; the
 * footwork is that walk's variation started with the other foot; staggered, its variation in the
 * staggered carriage (`STAGGERED`); the run is the walk and run (`WalkRunConfig`) by its body's record.
 * A body walks by those whose variation its character holds, and Move changes between them on the
 * move (`move`).
 */
const GAITS: Readonly<Record<string, { readonly label: string; readonly legs: ConfigFor<"gait"> }>> = deepFreeze({
  "braced": { label: "Braced", legs: { kind: "stance-walk", variation: "stance-walk" } },
  "footwork": { label: "Footwork", legs: { kind: "stance-walk", variation: "footwork" } },
  "staggered": { label: "Staggered", legs: { kind: "stance-walk", variation: "staggered" } },
  "run": { label: "Run", legs: { kind: "walk-run" } },
});

/** **The stock gaits** (`GAITS`) as gaits: what Move walks by where its config names none. */
export const STOCK_GAITS: readonly Gait[] = deepFreeze(Object.entries(GAITS).map(([name, gait]) => ({ name, label: gait.label, legs: gait.legs })));

/**
 * **How a body walking by a gait stands** (`StanceNumbers`), by the gait's legs (`kind/variation`)
 * and the body's model: the mean over the Strike drill's `sparring-stances` trials of each Warrior
 * square or staggered, 5,287 and 5,269 bodies (sd 0.10 m stagger, 0.11 width, 0.015 and 0.020
 * height). What a walk by it leaves the body standing at in a search (`Leaves.stance`); a gait or
 * body none was measured walking by has none.
 */
const GAIT_STANCES: Readonly<Record<string, Readonly<Record<string, StanceNumbers>>>> = deepFreeze({
  "stance-walk/stance-walk": { man: { stagger: -.008, width: .279, height: .967 } },
  "stance-walk/staggered": { man: { stagger: -.01, width: .283, height: .922 } },
});

/** How a body of `model` walking on `legs` stands (`GAIT_STANCES`); null where none was measured. */
export const gaitStance = (legs: { readonly kind: string; readonly variation?: string }, model: string): StanceNumbers | null =>
  GAIT_STANCES[`${legs.kind}/${legs.variation ?? legs.kind}`]?.[model] ?? null;

/**
 * **The carriage a body of `model` standing at `numbers` is in**: the gait stance measured on its
 * model nearest them (`GAIT_STANCES`, each number over its span, `STANCE_SPANS`); `numbers` where
 * none was measured. A body read so stands as a walk in its carriage would leave it, so the states
 * after that walk ask what the state before it asked.
 */
export function carriageOf(model: string, numbers: StanceNumbers): StanceNumbers {
  let nearest: StanceNumbers = numbers, least = Infinity;
  for (const by of Object.values(GAIT_STANCES)) {
    const one = by[model];
    if (!one) continue;
    let squared = 0;
    for (const key of ["stagger", "width", "height"] as const) { const d = (one[key] - numbers[key]) / STANCE_SPANS[key]; squared += d * d; }
    if (squared < least) { least = squared; nearest = one; }
  }
  return nearest;
}

/** The gait of `gaits` called `name`; null where none is. */
export const gaitNamed = (gaits: readonly Gait[], name: GaitName): Gait | null => gaits.find((gait) => gait.name === name) ?? null;
