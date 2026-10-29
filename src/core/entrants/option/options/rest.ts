import type { Resource, TargetRef } from "../../../skills/action.ts";
import type { BodySpec } from "../../../spec/body.ts";
import { deepFreeze } from "../../../state.ts";
import { legsReadiness } from "../../../skills/locomotion.ts";
import { asking, blocked, NOTHING, READY, WHOLE, type Option, type Situation, type Status } from "./option.ts";
import { downTerms, type DownModel } from "./down.ts";
import { here } from "./position.ts";
import type { Terms } from "./value.ts";
import type { Walker } from "./walk.ts";

/**
 * **Rest**: the options that take a resource nothing else is worth more on (the policy's floor,
 * `Chooser`), each worth nothing: what keeping the body as it is brings. Their model leaves the body
 * where it is at once, through nothing it was not already taking.
 */
export const still = (now: Situation): Terms => ({ duration: 0, dealt: 0, taken: now.predictions.danger, orders: 0, exit: here(now) });

/** The parts of a rest option that do nothing: never over, always yielding. */
const RESTING = { rest: true, status: (): Status => "yields", begin() {}, end() {} } as const;

/** **Hold the position**, where the legs can carry the body (`legsReadiness`): the legs where they are, kept out of a fallen body's reach (`Walker.kept`), facing the focus or the way the body faces (`Walker.facing`). */
export function hold(walk: Pick<Walker, "facing" | "kept">): Option {
  return { name: "hold", claims: Object.freeze(["legs"]), state: {}, ...RESTING,
    entry: (now) => legsReadiness(now.sight.view), model: still, step: (now) => ({ asked: walk.kept(now, { move: null, face: walk.facing(now), actions: [] }), holds: NOTHING }) };
}

/**
 * **The hands at their guard**, where the legs can carry the body (`legsReadiness`): each of
 * `hands` (effectors, `hand.left`) it is given (a rest option takes whichever are free, `Chooser`)
 * asked for nothing, its guard the body's.
 */
export function guard(hands: readonly Resource[]): Option {
  return { name: "guard", claims: Object.freeze([...hands]), state: {}, ...RESTING,
    entry: (now) => legsReadiness(now.sight.view), model: still, step: (now) => ({ asked: { move: null, face: now.sight.report.heading, actions: [] }, holds: NOTHING }) };
}

/** **The guard of `spec`'s hands** (`guard`): over its hands (`hand.left`, `hand.right`), none for a body without. */
export const guardOf = (spec: BodySpec): readonly Option[] => {
  const hands = (["hand.left", "hand.right"] as const).filter((hand) => spec.segments.some((segment) => segment.name === hand));
  return hands.length ? [guard(hands)] : [];
};

/** A brace's target: none; the body acts on itself. */
const HERE: TargetRef = deepFreeze({ kind: "point", at: [0, 0, 0] });

/**
 * **Brace**, where the legs cannot carry the body (`legsReadiness`): the whole body, facing the way it faces, held by `by` (an action of the body's
 * and the effector it is asked on, which holds the whole body while it lies: the ground's brace)
 * where it has one, else asked for nothing; priced as the rise `rise` gives now that never stands
 * (`downTerms`), so that down and alive a way up is worth more. Its memory is the instance it asks.
 */
export function brace(rise: (now: Situation) => DownModel, by: { readonly action: string; readonly effector: string } | null): Option {
  const STANDING = blocked("the legs carry the body"), state = { id: null as number | null };
  return { name: "brace", claims: WHOLE, state, ...RESTING,
    begin() { state.id = null; }, end() { state.id = null; },
    entry: (now) => legsReadiness(now.sight.view).kind === "ready" ? STANDING : READY, model: (now) => downTerms({ ...rise(now), stands: 0 }, now.posture)(now),
    step(now) {
      if (!by) return { asked: { move: null, face: now.sight.report.heading, actions: [] }, holds: NOTHING };
      state.id ??= now.sight.instance();
      const asked = { move: null, face: now.sight.report.heading, actions: [{ id: state.id, action: by.action, effector: by.effector, target: HERE }] };
      return { asked, holds: asking(now, asked) };
    } };
}
