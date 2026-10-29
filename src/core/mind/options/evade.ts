import { blocked, LEGS, READY, type Situation, type StandingOption } from "./option.ts";
import type { Walker } from "./walk.ts";
import type { Terms } from "./value.ts";

/** How long a step back from a blow takes, s, and the share of the blow it takes the head out of. */
const STEP = Object.freeze({ seconds: .5, saves: .8 });

/**
 * **Evade**: step back from the focus, facing it, while a foe's blow is predicted to reach the head
 * (`Situation.incoming`). On offer standing, with a focus, while one is; it has run its course once
 * none is. It is footwork, always yields, and asks for no blow. Its model: a step back (`STEP`) that takes the
 * head out of most of the blow coming, and leaves the body a step farther off.
 */
export function evade(walk: Walker): StandingOption {
  const coming = (now: Situation): boolean => !now.down && !!now.focus && now.incoming !== null;
  const CLEAR = blocked("no blow coming");
  return {
    name: "evade", posture: "standing", layer: "footwork", state: {},
    entry: (now) => coming(now) ? READY : CLEAR,
    exit: () => null,
    holds: () => LEGS,
    yields: () => true,
    ended: (now) => !coming(now),
    begin() {},
    end() {},
    models: { "hand-built": (now): Terms => ({ duration: STEP.seconds, dealt: 0, taken: now.danger * (1 - STEP.saves), orders: 0,
      exit: { apart: now.reach.apart + walk.pace(now) * STEP.seconds, down: 0 } }) },
    step(now) {
      const focus = now.focus!, centre = now.sight.view.stance.centre;
      return { ...walk.toward(now, centre.x - focus.centre.x, centre.z - focus.centre.z, walk.facing(now)), actions: [] };
    },
  };
}
