import type { BodyModel } from "../../core/bodies/models.ts";
import { deepFreeze } from "../../core/state.ts";

/**
 * How each model is shown: whether it wears the human clothing (`wearsClothing`), and the colour
 * its shapes are drawn in where no skin covers them. What a page calls it is its character's (`modelLabel`).
 */
export const MODEL_DISPLAY: Readonly<Record<BodyModel, { readonly clothing: boolean; readonly tint: string }>> = deepFreeze({
  man: { clothing: true, tint: "#8c99a8" },
  woman: { clothing: true, tint: "#809e8c" },
  skeleton: { clothing: false, tint: "#b8ad94" },
  "reptile": { clothing: false, tint: "#78834d" },
  "rat": { clothing: false, tint: "#6e6258" },
});
