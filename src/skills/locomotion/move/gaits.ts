import type { GaitName } from "../../framework/skill.ts";
import type { PartLookup } from "../../../parts/lookup.ts";
import type { Gait } from "../../framework/locomotion-part.ts";
import { deepFreeze } from "../../../core/state.ts";
import { STANCE_SPANS } from "../../framework/profile/nearest.ts";
import { type StanceNumbers } from "../../framework/profile/profile.ts";

/**
 * **The stock gaits** among `parts`: every registered gait part's own (`GaitPart.gaits`), in the
 * order registered; what Move walks by where its config names none. A body walks by those whose
 * variation its character holds, and Move changes between them on the move (`move`).
 */
export const stockGaits = (parts: PartLookup): readonly Gait[] => parts.candidates("gait").flatMap((legs) => parts.of("gait", legs).gaits);

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
