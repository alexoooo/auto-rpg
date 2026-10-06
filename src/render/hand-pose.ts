import type { Hand } from "../core/control/motor.ts";

/** A visual action, independent of the skill or screen that asks for it. */
export type HandAction = "relax" | "close" | "fist";

/** Cosmetic transition durations, seconds: `docs/reference/lab.md#fist-presentation`. */
const CLOSING = 0.1, OPENING = 0.25;

/** One character's finger closure. Only simulation steps advance it; rendering reads it. */
export function handPose() {
  const hand = () => ({ action: "relax" as HandAction, from: 0, elapsed: 0, closure: 0 });
  const state = { left: hand(), right: hand() };
  return {
    step(side: Hand, action: HandAction, dt: number) {
      const current = state[side];
      if (current.action !== action) {
        current.from = current.closure; current.elapsed = 0; current.action = action;
      }
      current.elapsed += dt;
      switch (action) {
        case "close": current.closure = current.from + (1 - current.from) * Math.min(1, current.elapsed / CLOSING); break;
        case "fist": current.closure = 1; break;
        case "relax": current.closure = current.from * (1 - Math.min(1, current.elapsed / OPENING)); break;
        default: { const never: never = action; throw new Error(`unknown hand action ${never}`); }
      }
    },
    closure: (side: Hand): number => state[side].closure,
    snapshot: (): Readonly<Record<Hand, number>> => ({ left: state.left.closure, right: state.right.closure }),
  };
}
