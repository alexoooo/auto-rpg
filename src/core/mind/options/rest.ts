import type { Resource } from "../../skills/action.ts";
import { blocked, READY, WHOLE, type GroundOption, type Situation, type StandingOption } from "./option.ts";
import { downTerms, type DownModel } from "./down.ts";
import { here } from "./position.ts";
import type { Terms } from "./value.ts";
import type { Walker } from "./walk.ts";

/**
 * **Rest**: the options that take a resource nothing else is worth more on (the policy's floor,
 * `Chooser`), each worth nothing: what keeping the body as it is brings. Their model leaves the body
 * where it is at once, through nothing it was not already taking.
 */
const still = (now: Situation): Terms => ({ duration: 0, dealt: 0, taken: now.danger, orders: 0, exit: here(now) });

/** The parts of a rest option that do nothing: always on offer where it is, never over, always yielding. */
const RESTING = { exit: () => null, yields: () => true, ended: () => false, begin() {}, end() {}, holds: (): readonly Resource[] => [] } as const;

/** **Hold the position**, standing: the legs where they are, facing the focus or the way the body faces (`Walker.facing`). */
export function hold(walk: Pick<Walker, "facing">): StandingOption {
  const DOWN = blocked("down");
  return { name: "hold", posture: "standing", claims: Object.freeze(["legs"]), state: {}, ...RESTING,
    entry: (now) => now.down ? DOWN : READY, model: still, step: (now) => ({ move: null, face: walk.facing(now), actions: [] }) };
}

/** **A hand at its guard**, standing: `hand` (an effector, `hand.left`) asked for nothing, its guard the body's. */
export function guard(hand: Resource): StandingOption {
  const DOWN = blocked("down");
  return { name: `guard ${hand.slice(hand.indexOf(".") + 1)}`, posture: "standing", claims: Object.freeze([hand]), state: {}, ...RESTING,
    entry: (now) => now.down ? DOWN : READY, model: still, step: (now) => ({ move: null, face: now.sight.report.heading, actions: [] }) };
}

/**
 * **Brace**, down: the whole body asked for nothing, facing the way it faces; priced as a rise of
 * `rise` that never stands (`downTerms`), so that down and alive a way up is worth more.
 */
export function brace(rise: DownModel): GroundOption {
  const STANDING = blocked("standing");
  return { name: "brace", posture: "ground", claims: WHOLE, state: {}, ...RESTING,
    entry: (now) => now.down ? READY : STANDING, model: downTerms({ ...rise, stands: 0 }), step: (now) => ({ move: null, face: now.sight.report.heading, actions: [] }) };
}
