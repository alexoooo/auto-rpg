// Explicit `.ts` extension, for the reason `fighter.ts` gives at length: Node
// runs a TypeScript file by stripping its types, and its ESM resolver insists on
// the extension where Vite does not care.
//
// `action-primitives.ts` is the only run-time import in this file, and that is a property worth
// keeping rather than an accident. It reaches no scene, so a policy can be put in front of a hand-written view in `tests/minds.test.mjs`
// with no Babylon, no scene and no bout anywhere in the graph -- which is what
// makes those tests cost milliseconds instead of seconds. The geometry below is
// therefore written out in scalars on `{ x, y, z }` rather than through
// `Vector3`'s methods: every position a view carries is a `Vector3` in the
// arena, but nothing here needs it to be one, so nothing here demands it.
import type { HandName } from "./hands.ts";
import type { FighterView, Intent } from "./mind.ts";
import { actionStrokeRoll, applyActionPosture, blankThreat, freshIntent, selectThreat,
  type ThreatView } from "./action-primitives.ts";

/**
 * What a mind hands the body: a cursor, a wrist roll, and a posture.
 *
 * **The policies this file was named for are gone.** It held four hand-written humanoid minds --
 * `swinger`, `duelist`, `archer`, `crawler` -- and they went with the Warrior they were written
 * for: their ranges were an arming sword's length in disguise and their stroke geometry a right
 * arm's. What is left is the part that was never about a humanoid at all, and that the golem's
 * tactics go through:
 *
 * - `blankIntent`, the one shape every mind fills in and nothing reallocates;
 * - `postureFor`, the whole-body answer to an action, waist and knees and wrist;
 * - `rollForStroke`, which is the difference between a cut and a slap.
 *
 * The import list is the property worth keeping: `hands.ts` and `mind.ts` for types only, and
 * `action-primitives.ts`. No Babylon, no scene, no bout -- which is what lets
 * `tests/minds.test.mjs` cost milliseconds instead of seconds. The geometry below is therefore
 * written out in scalars on `{ x, y, z }` rather than through `Vector3`'s methods.
 */

/**
 * A fresh intent for a policy to own and overwrite in place.
 *
 * `mind.ts`'s `NEUTRAL` is the same thing frozen, and this is deliberately not a
 * copy of it: importing a *value* from `mind.ts` would make the dependency
 * between the two files run both ways at run time, and a module cycle that
 * happens to work because nobody reads the constant during evaluation is exactly
 * the sort of thing that stops working when somebody moves a line -- in the
 * browser, not in a test. The annotation is what keeps the two shapes married:
 * add a field to `Intent` and this is a compile error rather than a key that is
 * quietly missing.
 *
 * One of these per mind, returned from every `decide` and never reallocated,
 * because `decide` runs 240 times a second per fighter.
 *
 * Exported for the tests, which used to declare their own copies of this shape
 * -- four of them, all plain JS and all untyped, so none of them was a compile
 * error when the intent grew two hands and every one of them handed `undefined`
 * to an arm. A fixture that can silently disagree with the thing it stands for
 * is worse than no fixture.
 */
export const blankIntent = (): Intent => freshIntent();

export type PostureAction = "idle" | "close" | "cover" | "commit" | "recover" | "draw";

/**
 * Procedural whole-body answer to an action policy's decision.
 *
 * The action policy still decides whether to close, cover, strike or draw. This
 * layer owns only the extra degrees of freedom: the waist, knees and wrist
 * orientation. It is deliberately stateless so the body's response limit is
 * the one place posture speed is decided.
 */
export function postureFor(view: FighterView, action: PostureAction, into: Intent): Intent {
  return applyActionPosture(view, action, into, threatHand(view));
}

/**
 * The thing of theirs worth watching.
 *
 * `BodyView.tip` is the primary's and stays the primary's -- see its own note --
 * so a guard built on it is a guard against whichever hand happens to be first,
 * which is the shield if they are carrying one there. This picked the hand that
 * could actually hurt, and the faster of the two when both could.
 *
 * It was a lead-versus-off pick written out here, **byte-identical to a copy in
 * the option layer's `options.ts`** (since retired) and disagreeing with a third in `learning/features.ts` -- so
 * the guard and the learned perception could be looking at different hands, and
 * nothing said so. `selectThreat` is the one answer now, and it can also say
 * "the shaft in the air", which no version of this shape could.
 *
 * **It is a different answer, not the same one refactored.** An empty hand
 * publishes a real speed now and the ranking is not `tipSpeed`, so the hand this
 * policy guards against differs from the one it guarded against at `f789ea4` on
 * about a tenth of the control steps of a sword-and-fist duel and a quarter of a
 * bare-handed one. That is measured, with the win rates either side of it, in
 * `docs/measurements.md` under "Threat selection, reconciled".
 *
 * The scratch is module-level rather than per policy, for the reason this
 * function was module-level: `decide` runs 240 times a second per fighter, both
 * fighters decide synchronously, and neither keeps what it is handed.
 */
const threatScratch = blankThreat();
const threatHand = (view: FighterView): ThreatView => selectThreat(view, threatScratch);

/**
 * The wrist roll that puts the edge along the stroke, from the stroke alone.
 *
 * This is the difference between a cut and a slap, and it is worth deriving
 * rather than guessing, because guessing it wrong is invisible -- the swing looks
 * identical and simply does no damage.
 *
 * `driveAnchor` builds the hand's frame from the aim direction `a`: the edge
 * starts as `e0`, the part of world up perpendicular to `a`, and is then turned
 * about `a` by `roll` toward `z0 = a x e0`. Writing `a` out in the torso's
 * spherical angles, `e0` is exactly `da/d(elevation)` and `z0` works out to
 * `(-cos az, 0, sin az)`, which makes `da/d(azimuth) = -cos(el) * z0`. So a
 * stroke that moves the cursor by `dAz` and `dEl` sends the blade along
 *
 *     v  ~  dEl * e0  -  cos(el) * dAz * z0
 *
 * and the edge lies along `v` when `roll = atan2(-cos(el) * dAz, dEl)`.
 *
 * Measured against that derivation in `.review/swing-probe.mjs`, on the
 * swinger's own stroke: edge alignment at the peak of the swing is **0.955**
 * with this roll, **0.740** with the roll left at zero, and **0.126** with the
 * sign flipped. The damage model raises alignment to the power of
 * `combat.edgeExponent`, which is 2, so those three are worth 91 %, 55 % and 2 %
 * of a full cut. Getting the sign backwards is not a near miss.
 *
 * Folded into +-pi/2 **when the weapon is double-edged**, which the sword is and
 * which was the only case there was: the damage model takes the absolute value
 * of the edge dot product, so `roll` and `roll +- pi` are the same cut, and the
 * short one is the one that stays inside `arm.rollMin/rollMax` and the one the
 * wrist can actually get to.
 *
 * For a single-bitted weapon those two are not the same cut at all -- one of
 * them is the poll -- and the fold picks between them by which is closer to
 * zero, which is to say by nothing. Measured: an axe swung with the fold left in
 * arrived poll-first on **64 %** of the contacts that landed on a body, and a
 * poll scores nothing. Unfolded, the derivation puts the weapon's +X along the
 * direction of travel, which is exactly where a bit belongs.
 *
 * What is left is the wrist. The unfolded answer lives in (-pi, pi] and
 * `arm.rollMin/rollMax` is +-1.4, so a stroke that wants the last half-radian of
 * the turn gets the clamp instead -- and that is not a shortcoming of this
 * function but of the arm, and of every real axeman, who steps round rather than
 * turning a wrist that far. `docs/measurements.md` has what it costs.
 */
export function rollForStroke(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  bothEdges = true,
  hand: HandName = "primary",
): number {
  return actionStrokeRoll(fromX, fromY, toX, toY, bothEdges, hand);
}
