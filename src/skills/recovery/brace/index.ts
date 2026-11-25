import { POSITIONS } from "../../../control/ground-reading.ts";
import { poseDrive, type TechniqueRun } from "../shared/technique.ts";
import { technique } from "../shared/bilateral.ts";
import { MODE, NO_EDGES, ONE_SIDE } from "../shared/modes.ts";
import { brace } from "./brace/brace.ts";

/** **Brace**, a mode of the ground: the protective flexion held while the body falls or lies (`brace`). */
export const BRACE_MODE = technique("brace", { asSkill: { group: "Balance", ends: POSITIONS }, mode: { braces: true, climbs: null }, label: "Brace", sides: ONE_SIDE, edges: NO_EDGES,
  // A prop over the ground.
  icon: "M12 4.5L20 18.5h-2.7L12 9.2L6.7 18.5H4ZM3 19.5h18v2H3Z",
  make: (own): TechniqueRun => {
    const drive = poseDrive(own.muscles);
    return { ...MODE, state: {}, phase: "brace", begin() {}, step(_g, _senses, control) { brace(drive, control.muscles); return null; } };
  } });

declare module "../shared/technique.ts" {
  interface TechniqueConfigs {
    readonly brace: { readonly kind: "brace" };
  }
}
