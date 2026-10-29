import type { Resource, TargetRef } from "../../../skills/action.ts";
import { deepFreeze } from "../../../state.ts";
import { asking, blocked, READY, WHOLE, type GroundOption, type Situation, type StandingOption } from "./option.ts";
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
const RESTING = { rest: true, exit: () => null, yields: () => true, ended: () => false, begin() {}, end() {}, holds: (): readonly Resource[] => [] } as const;

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

/** A brace's target: none; the body acts on itself. */
const HERE: TargetRef = deepFreeze({ kind: "point", at: [0, 0, 0] });

/**
 * **Brace**, down: the whole body, facing the way it faces, held by `by` (an action of the body's
 * and the effector it is asked on, which holds the whole body while it lies: the ground's brace)
 * where it has one, else asked for nothing; priced as the rise `rise` gives now that never stands
 * (`downTerms`), so that down and alive a way up is worth more. Its memory is the instance it asks.
 */
export function brace(rise: (now: Situation) => DownModel, by: { readonly action: string; readonly effector: string } | null): GroundOption {
  const STANDING = blocked("standing"), state = { id: null as number | null };
  return { name: "brace", posture: "ground", claims: WHOLE, state, ...RESTING,
    begin() { state.id = null; }, end() { state.id = null; }, holds: asking,
    entry: (now) => now.down ? READY : STANDING, model: (now) => downTerms({ ...rise(now), stands: 0 })(now),
    step(now) {
      if (!by) return { move: null, face: now.sight.report.heading, actions: [] };
      state.id ??= now.sight.instance();
      return { move: null, face: now.sight.report.heading, actions: [{ id: state.id, action: by.action, effector: by.effector, target: HERE }] };
    } };
}
