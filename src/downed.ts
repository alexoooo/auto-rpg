// Explicit `.ts` extensions for Node's resolver, as everywhere a harness reaches.
//
// **This file imports no value**, and that is why it is a file: the golem executors under
// `src/golem/` keep the property of importing no value beyond `hands.ts` and `rng.ts` (the header
// of `src/golem/tactics.ts` says why), and the option layer (`src/options.ts`, retired in skill
// ceiling session 06) asked the same question. One rule, one copy, reachable from every executor
// without dragging `action-primitives.ts` along.
import type { BodyView } from "./mind.ts";

/**
 * **Finishing a downed body** (physical contact session 03): the one rule every executor asks, rather
 * than four copies of it.
 *
 * A body is down while its support state is `fallen` or `rising` (`BodyView.support`). Until this
 * session no mind could tell: the view said nothing of it, the stand-off was floored at the other
 * body's full reach whether it was standing or lying, and every aim read a standing height. While
 * the body in front is down:
 *
 * - `standOffReach` is zero, so the hold floors at the attacker's own ranges and not at the reach of
 *   an arm that is lying on the floor;
 * - `finishPoint` is its live core (`BodyView.vitalPoint`), so the range is measured to it and the
 *   stroke goes to it, and the crouch every golem executor derives from its aim follows it down.
 *
 * Standing, the stand-off is the two bodies' own (`standOffReach` below) and there is no point. A mind that should
 * not finish -- an executor whose stroke cannot reach the floor -- still gets the point, and the
 * crouch and the envelope decide what arrives.
 */
export const isDowned = (body: Pick<BodyView, "support">): boolean =>
  body.support === "fallen" || body.support === "rising";

/**
 * How many times the other body's mass a body has to be before it closes on it rather than standing
 * off (physical contact session 09). Chosen on the owner's behalf, not swept: at 1.5 every stone
 * build stands off from every other -- the widest pair, the wheel against the plain biped, is 1.33
 * -- while stone presses a human (2.2) and a skeleton (8), a human presses a skeleton (3.7), and the
 * all-max giant presses every x1 body (3.8 against stone).
 */
export const PRESS_MASS_RATIO = 1.5;

/**
 * Whether this body heavily outweighs the one in front, and closes to push range rather than keeping
 * a distance (physical contact session 09). Mass is what a shove is divided by, so nothing the lighter
 * body can push with moves this one much, and everything this one pushes with moves it a lot. Never
 * against a downed body, which is finished rather than pushed.
 *
 * **One rule, played either side.** Both corners read it off the same two published masses, so the
 * heavier one presses and the lighter one does not, whichever mind is on which.
 */
export const presses = (self: Pick<BodyView, "massKg">, them: Pick<BodyView, "support" | "massKg">): boolean =>
  !isDowned(them) && self.massKg >= PRESS_MASS_RATIO * them.massKg;

/**
 * The reach the stand-off is floored at.
 *
 * - **None while the other body is down**, or while this one presses it: it closes.
 * - **Its own reach when the other outreaches it** (physical contact session 09). A stand-off outside
 *   a longer arm is a distance this body cannot strike from, so it holds where its own arm lands --
 *   exactly where it would hold in its own mirror. Before this a human stood 1.6 m off an idle stone
 *   body and dealt it nothing in 40 s.
 * - **Their reach otherwise**, as it always was: a body that outreaches, or matches, the other keeps
 *   out of its arm.
 */
export const standOffReach = (
  self: Pick<BodyView, "reach" | "massKg">,
  them: Pick<BodyView, "support" | "reach" | "massKg">,
): number => {
  if (isDowned(them) || presses(self, them)) return 0;
  return Math.min(them.reach, self.reach);
};

/**
 * Where a stroke at a downed body goes: its live core, written into `into`. Answers false and
 * leaves `into` alone while the body is standing, so a caller keeps its own mark.
 */
export function finishPoint(body: Pick<BodyView, "support" | "vitalPoint">, into: { x: number; y: number; z: number }): boolean {
  if (!isDowned(body)) return false;
  into.x = body.vitalPoint.x; into.y = body.vitalPoint.y; into.z = body.vitalPoint.z;
  return true;
}
