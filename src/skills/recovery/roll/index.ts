import { technique } from "../shared/bilateral.ts";
import { rollToFront } from "./roll/roll.ts";

/** **Roll onto front** (`rollToFront`). */
export const ROLL = technique("roll", { label: "Roll onto front", stage: "experimental", sides: Object.freeze(["right"] as const),
  edges: Object.freeze((["back", "right"] as const).map(from => Object.freeze({ from, to: "front" as const }))), make: rollToFront });

declare module "../shared/technique.ts" {
  interface TechniqueConfigs { readonly roll: { readonly kind: "roll" } }
}
