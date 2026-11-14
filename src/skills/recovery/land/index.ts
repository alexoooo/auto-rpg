import type { TechniqueRun } from "../shared/technique.ts";
import { technique } from "../shared/bilateral.ts";
import { MODE, NO_EDGES, ONE_SIDE } from "../shared/modes.ts";

/** **Land**, a mode of the ground: the command carried on as it is while the body lands. */
export const LAND_MODE = technique("land", { mode: { kind: "land" }, label: "Land", stage: "game", sides: ONE_SIDE, edges: NO_EDGES,
  make: (): TechniqueRun => ({ ...MODE, state: {}, phase: "land", begin() {}, step: () => null }) });

declare module "../shared/technique.ts" {
  interface TechniqueConfigs {
    readonly land: { readonly kind: "land" };
  }
}
