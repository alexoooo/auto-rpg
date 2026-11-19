import { regaining } from "./regain/regain.ts";
import { MODE, NO_EDGES, ONE_SIDE } from "../shared/modes.ts";
import { type TechniqueRun } from "../shared/technique.ts";
import { technique } from "../shared/bilateral.ts";
import { SUPPORT_REFERENCE } from "../../../control/support-reference.ts";
import { MOTOR_STANCE } from "../../../control/motor-part.ts";

declare module "../shared/technique.ts" {
  interface TechniqueConfigs {
    readonly regain: { readonly kind: "regain" };
  }
}

/** The regain's stage while it climbs from a crouch (`regaining`). */
const CLIMBING = "regain:climb";

/**
 * **The regain**, a mode of the ground: a body on its feet held by its own stance and climbed from
 * a quiet crouch (`regaining`), its stage `regain`, or `regain:climb` while it climbs. Begun with no
 * ground skill carried over, its motor forgets what it had under way.
 */
export const REGAIN_MODE = technique("regain", { skillGroup: "Balance", requires: [SUPPORT_REFERENCE, MOTOR_STANCE], mode: { braces: false, climbs: CLIMBING }, label: "Regain", stage: "game", sides: ONE_SIDE, edges: NO_EDGES,
  make: (own, view, _clock, fitted): TechniqueRun => {
    const regain = regaining(own, view, fitted);
    return { ...MODE, state: regain.state, get phase() { return regain.state.climb.on ? CLIMBING : "regain"; },
      begin() { regain.begin(); }, step(_g, _senses, control, dt) { regain.step(control, dt); return null; }, forget() { regain.reset(); } };
  } });
