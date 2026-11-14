import { steadying } from "./steady/steady.ts";
import { MODE, NO_EDGES, ONE_SIDE } from "../shared/modes.ts";
import { type TechniqueRun } from "../shared/technique.ts";
import { technique } from "../shared/bilateral.ts";
import { SUPPORT_REFERENCE } from "../../../control/support-reference.ts";
import { MOTOR_STANCE } from "../../../control/motor-part.ts";

declare module "../shared/technique.ts" {
  interface TechniqueConfigs {
    readonly steady: { readonly kind: "steady" };
  }
}

/** The steady's stage while it climbs from a crouch (`steadying`). */
const CLIMBING = "steady:climb";

/**
 * **The steady**, a mode of the ground: a body on its feet held by its own stance and climbed from
 * a quiet crouch (`steadying`), its stage `steady`, or `steady:climb` while it climbs. Begun with no
 * ground skill carried over, its motor forgets what it had under way.
 */
export const STEADY_MODE = technique("steady", { requires: [SUPPORT_REFERENCE, MOTOR_STANCE], mode: { kind: "steady", climbing: CLIMBING }, label: "Steady", stage: "game", sides: ONE_SIDE, edges: NO_EDGES,
  make: (own, view, _clock, fitted): TechniqueRun => {
    const steady = steadying(own, view, fitted);
    return { ...MODE, state: steady.state, get phase() { return steady.state.climb.on ? CLIMBING : "steady"; },
      begin() { steady.begin(); }, step(_g, _senses, control, dt) { steady.step(control, dt); return null; }, forget() { steady.reset(); } };
  } });
