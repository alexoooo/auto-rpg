import type { TechniqueRun } from "../shared/technique.ts";
import { technique } from "../shared/bilateral.ts";
import { MODE, NO_EDGES, ONE_SIDE } from "../shared/modes.ts";

/** **Land**, a mode of the ground: the command carried on as it is while the body lands. */
export const LAND_MODE = technique("land", { skillGroup: "Balance", mode: { braces: false, climbs: null }, label: "Land", sides: ONE_SIDE, edges: NO_EDGES,
  // An arrow down to the ground.
  icon: "M10 2.5h4v8h4l-6 7l-6-7h4ZM4 19.5h16v2H4Z",
  make: (): TechniqueRun => ({ ...MODE, state: {}, phase: "land", begin() {}, step: () => null }) });

declare module "../shared/technique.ts" {
  interface TechniqueConfigs {
    readonly land: { readonly kind: "land" };
  }
}
