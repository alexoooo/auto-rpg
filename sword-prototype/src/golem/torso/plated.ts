import { TORSO_PLATED } from "../config.ts";
import { torsoModule, type TorsoModuleDefinition } from "./torso.ts";

/**
 * `torso.plated`: the heavier trunk, narrower at the waist, with armour on the core.
 *
 * Four physical differences from `torso.plain` and no cosmetic ones. It is 70 % heavier against
 * the *same* waist motor, which is frozen rule 4 doing its job -- weight comes from a finite
 * force budget against real mass, so this option lags and rocks more because it is heavier and
 * not because a number was tuned to make it feel that way. It leans two thirds as far and twists
 * three fifths as far. It takes 34 % of a scored blow off its core rather than 10 %, through
 * `armouredDamage` in `src/scoring.ts` at the `Combatant.applyDamage` seam, which is the same
 * rule the plain torso runs with a different number. And it is broader and taller, so it holds
 * its effectors 40 mm wider and 20 mm higher -- more reach and more cover, paid for in mass.
 *
 * The one visible difference, the thickness of the armour slabs, is computed from `coreArmour`
 * in `torsoShell` rather than chosen, so it cannot drift away from what the armour actually does.
 */
export const torsoPlated: TorsoModuleDefinition =
  torsoModule("torso.plated", "plated trunk", TORSO_PLATED);
