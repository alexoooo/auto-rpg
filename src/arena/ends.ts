import { DAMAGE_END } from "./ends/damage.ts";
import { DOWN_END } from "./ends/down.ts";

/** **Every end rule a bout's recipe may name** (`DuelRecipe.ends`), by its kind: this module holds its imports and this list and nothing else (`caseCoder`). */
export const END_RULES = { damage: DAMAGE_END, down: DOWN_END };
