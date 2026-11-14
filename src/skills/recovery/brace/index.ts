import { poseDrive, type TechniqueRun } from "../shared/technique.ts";
import { technique } from "../shared/bilateral.ts";
import { MODE, NO_EDGES, ONE_SIDE } from "../shared/modes.ts";
import { brace } from "./brace/brace.ts";

/** **Brace**, a mode of the ground: the protective flexion held while the body falls or lies (`brace`). */
export const BRACE_MODE = technique("brace", { skillGroup: "Balance", mode: { kind: "brace" }, label: "Brace", stage: "game", sides: ONE_SIDE, edges: NO_EDGES,
  make: (own): TechniqueRun => {
    const drive = poseDrive(own.muscles);
    return { ...MODE, state: {}, phase: "brace", begin() {}, step(_g, _senses, control) { brace(drive, control.muscles); return null; } };
  } });

declare module "../shared/technique.ts" {
  interface TechniqueConfigs {
    readonly brace: { readonly kind: "brace" };
  }
}
