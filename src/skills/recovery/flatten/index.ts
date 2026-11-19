import { technique } from "../shared/bilateral.ts";
import { SIDES } from "../../../core/bodies/bilateral.ts";
import { flatten } from "./flatten/flatten.ts";

/** **Flatten**, a mode of the ground: the body laid flat on the side it lies on (`flatten`), begun on either side. */
export const FLATTEN = technique("flatten", { skillGroup: "Balance", label: "Flatten", sides: SIDES,
  // Two arrows down on a body lying flat.
  icon: "M3 16.5h18v3.5H3ZM7 4h2v5h2.5L8 13.5L4.5 9H7ZM15 4h2v5h2.5L16 13.5L12.5 9H15Z", edges: Object.freeze([]), make: flatten });

declare module "../shared/technique.ts" {
  interface TechniqueConfigs { readonly flatten: { readonly kind: "flatten" } }
}
