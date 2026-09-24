// Explicit `.ts` extensions for Node's resolver, as everywhere a harness reaches.
//
// **This file imports no value**, and that is why it is a file: the golem executors under
// `src/golem/` keep the property of importing no value beyond `hands.ts` and `rng.ts` (the header
// of `src/golem/tactics.ts` says why), and `src/options.ts` asks the same question. One rule, one
// copy, reachable from both without dragging `action-primitives.ts`'s Warrior strokes along.
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
 * Standing, both answer exactly what they did before: `them.reach` and nothing. A mind that should
 * not finish -- an executor whose stroke cannot reach the floor -- still gets the point, and the
 * crouch and the envelope decide what arrives.
 */
export const isDowned = (body: Pick<BodyView, "support">): boolean =>
  body.support === "fallen" || body.support === "rising";

/** The reach the stand-off is floored at: the body's own, and none while it is down. */
export const standOffReach = (body: Pick<BodyView, "support" | "reach">): number =>
  isDowned(body) ? 0 : body.reach;

/**
 * Where a stroke at a downed body goes: its live core, written into `into`. Answers false and
 * leaves `into` alone while the body is standing, so a caller keeps its own mark.
 */
export function finishPoint(body: Pick<BodyView, "support" | "vitalPoint">, into: { x: number; y: number; z: number }): boolean {
  if (!isDowned(body)) return false;
  into.x = body.vitalPoint.x; into.y = body.vitalPoint.y; into.z = body.vitalPoint.z;
  return true;
}
