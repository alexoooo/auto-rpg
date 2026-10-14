import type { Situation, StandingOption } from "./option.ts";
import type { Walker } from "./walk.ts";

/**
 * **Evade**: step back from the focus, facing it, while a foe's blow is predicted to reach the head
 * (`Situation.incoming`). On offer standing, with a focus, while one is; it has run its course once
 * none is. It always yields, and asks for no blow.
 */
export function evade(walk: Walker): StandingOption {
  const coming = (now: Situation): boolean => !now.down && !!now.focus && now.incoming !== null;
  return {
    name: "evade", posture: "standing", state: {},
    available: coming,
    yields: () => true,
    ended: (now) => !coming(now),
    begin() {},
    end() {},
    step(now) {
      const focus = now.focus!, centre = now.sight.view.stance.centre;
      return { ...walk.toward(now, centre.x - focus.centre.x, centre.z - focus.centre.z, walk.facing(now)), actions: [] };
    },
  };
}
