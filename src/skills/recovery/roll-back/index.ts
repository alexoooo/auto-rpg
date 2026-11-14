import { technique } from "../shared/bilateral.ts";
import { rollBack } from "./roll-back/roll-back.ts";

/** **Roll onto back** (`rollBack`). */
export const ROLL_BACK = technique("roll-back", { skillGroup: "Stand-up", label: "Roll onto back", stage: "experimental", sides: Object.freeze(["right"] as const),
  edges: Object.freeze([Object.freeze({ from: "front" as const, to: "back" as const })]), make: rollBack });

declare module "../shared/technique.ts" {
  interface TechniqueConfigs { readonly "roll-back": { readonly kind: "roll-back" } }
}
