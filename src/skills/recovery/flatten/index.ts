import { technique } from "../shared/bilateral.ts";
import { SIDES } from "../../../core/bodies/bilateral.ts";
import { flatten } from "./flatten/flatten.ts";

/** **Flatten**, a mode of the ground: the body laid flat on the side it lies on (`flatten`), begun on either side. */
export const FLATTEN = technique("flatten", { label: "Flatten", stage: "game", sides: SIDES, edges: Object.freeze([]), make: flatten });

declare module "../shared/technique.ts" {
  interface TechniqueConfigs { readonly flatten: { readonly kind: "flatten" } }
}
