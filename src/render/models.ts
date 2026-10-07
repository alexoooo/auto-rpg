import type { BodyModel } from "../core/models.ts";
import { deepFreeze } from "../core/state.ts";

/**
 * How each model is shown: its name on the screens, whether it wears the human clothing
 * (`wearsClothing`), and the colour its shapes are drawn in where no skin covers them.
 */
export const MODEL_DISPLAY: Readonly<Record<BodyModel, { readonly label: string; readonly clothing: boolean; readonly tint: string }>> = deepFreeze({
  "workshop-fighter": { label: "Warrior", clothing: true, tint: "#8c99a8" },
  "workshop-rogue": { label: "Rogue", clothing: true, tint: "#809e8c" },
  "crypt-skeleton": { label: "Skeleton", clothing: false, tint: "#b8ad94" },
  "reptile": { label: "Reptile", clothing: false, tint: "#78834d" },
});
