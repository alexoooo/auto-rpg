import { segmentResource } from "../../skills/framework/action.ts";
import type { TargetRef } from "../../skills/framework/action.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import { deepFreeze } from "../../core/world/state.ts";
import { legsReadiness } from "../../skills/locomotion/locomotion.ts";
import { shieldHands } from "../../skills/intent/cover-hand.ts";
import type { Cover } from "../../skills/intent/intent.ts";
import { along, asking, blocked, LEGS, READY, standing, type Ask, type Option, type Site, type Situation } from "./option.ts";
import { NOTHING, WHOLE, type Status } from "../choice.ts";
import { edgeOf, threatened } from "./percepts.ts";
import { AS_IS, clinched, UNMOVED, upOrDown, type Terms } from "./value.ts";
import type { Walker } from "./walk.ts";
import { atan2, hypot } from "../../core/math/real.ts";

/**
 * **Holding the body as it is at `at`** for the seconds `ask` gives (`Ask.until`, none unless
 * given), through `coming` of the blow coming (the whole, `Predictions.danger`, unless given):
 * down, each second costing what a second down in its posture costs (`Predictions.downRate`),
 * leaving it where it lies; standing, under the focus's pressure where it stands (`threatened`),
 * and in a clinch its falls (`clinched`), lying where a fall leaves it (`upOrDown`).
 */
export function holding(at: Situation, ask: Ask | undefined, coming = at.predictions.danger): Terms {
  const seconds = ask?.until ?? 0;
  if (at.down) return { duration: seconds, dealt: 0, orders: 0, taken: coming + at.predictions.downRate(at.posture) * seconds, outcomes: UNMOVED };
  return { duration: seconds, dealt: 0, orders: 0, taken: coming + threatened(at, seconds), outcomes: upOrDown(AS_IS, clinched(at, seconds)) };
}

/**
 * **Rest**: the options that take a resource nothing else is worth more on (the policy's floor,
 * `Chooser`): what keeping the body as it is brings (`holding`). Each runs as long as it is held
 * (`Option.open`), never over, always yielding.
 */
const RESTING = { rest: true, open: true, status: (): Status => "yields", begin() {}, end() {} } as const;

/** What holding asks of the legs: where they are, kept out of a fallen body's reach (`Walker.kept`), facing the focus or the way the body faces (`Walker.facing`). */
const still = (walk: Pick<Walker, "facing" | "kept">) => (now: Situation) => ({ asked: walk.kept(now, { move: null, face: walk.facing(now), actions: [] }), holds: NOTHING });

/**
 * **Out of the focus's reach**, holding's site (`Site`): on the line from the focus through where
 * the body stands, where the focus's pressure reaches (`edgeOf`, `along`), facing the focus and
 * moving with it; none with no focus or where the body stands out of its reach.
 */
const OUT_OF_REACH: Site = Object.freeze({
  name: "the edge of the foe's reach",
  spot(at: Situation) {
    const focus = at.focus, edge = edgeOf(at, at.predictions.pressure);
    return focus && at.range < edge ? { ...along(at, edge), velocity: focus.velocity } : null;
  },
});

/**
 * **Hold the position**, where the legs can carry the body (`legsReadiness`; on offer at a state
 * where it stands, `standing`): the legs where they are (`still`). Its site is the nearest spot out
 * of the focus's reach (`OUT_OF_REACH`), where holding costs less.
 */
export function hold(walk: Pick<Walker, "facing" | "kept">): Option {
  return { name: "hold", claims: LEGS, state: {}, ...RESTING, sites: [OUT_OF_REACH],
    entry: (now) => legsReadiness(now.sight.view), model: (at, ask) => standing(at) ? holding(at, ask) : null, step: still(walk) };
}

/**
 * **Hold at a place**, (`x`, `z`) m on the ground, where the legs can carry the body there
 * (`legsReadiness`; on offer at a state where it stands within `within` m of it, `standing`): the
 * legs where they are (`still`). Its site is the place, the body there within `within`, facing its
 * way there.
 */
export function holdAt(x: number, z: number, within: number, walk: Pick<Walker, "facing" | "kept">): Option {
  const AWAY = blocked("away from its place"), off = (at: Situation): number => hypot(x - at.where.x, z - at.where.z);
  const site: Site = Object.freeze({ name: `(${x}, ${z})`,
    spot: (at: Situation) => ({ x, z, near: within, face: off(at) > 0 ? atan2(x - at.where.x, z - at.where.z) : at.where.face }) });
  return { name: `hold at (${x}, ${z})`, claims: LEGS, state: {}, ...RESTING, sites: [site],
    entry: (now) => {
      const legs = legsReadiness(now.sight.view);
      return legs.kind !== "ready" ? legs : off(now) <= within ? READY : AWAY;
    },
    model: (at, ask) => standing(at) && off(at) <= within ? holding(at, ask) : null, step: still(walk) };
}

/**
 * **The hands at their guard**, where the legs can carry the body (`legsReadiness`; on offer at a
 * state where it stands, `standing`), holding it as it is (`holding`): each of
 * `hands` (effectors, `hand.left`) it is given (a rest option takes whichever are free, `Chooser`)
 * asked for nothing, its guard the body's; each of `shields` among them (a hand holding a covering
 * face) between a foe's weapon and the body while one is near (`Situation.ward`), as a shield's
 * guard is held.
 */
export function guard(hands: readonly string[], shields: readonly string[] = []): Option {
  const covers: Record<string, Cover> = {};
  return { name: "guard", claims: Object.freeze(hands.map(segmentResource)), state: {}, ...RESTING,
    entry: (now) => legsReadiness(now.sight.view), model: (at, ask) => standing(at) ? holding(at, ask) : null,
    step: (now) => {
      const asked = { move: null, face: now.sight.report.heading, actions: [] };
      if (!shields.length || !now.ward) return { asked, holds: NOTHING };
      for (const hand of shields) covers[hand] = now.ward;
      return { asked: { ...asked, guard: covers }, holds: NOTHING };
    } };
}

/** **The guard of `spec`'s hands** (`guard`): over its hands (`hand.left`, `hand.right`), those holding a covering face its shields (`shieldHands`); none for a body without. */
export const guardOf = (spec: BodySpec): readonly Option[] => {
  const hands = (["hand.left", "hand.right"] as const).filter((hand) => spec.segments.some((segment) => segment.name === hand));
  return hands.length ? [guard(hands, shieldHands(spec).filter((hand) => (hands as readonly string[]).includes(hand)))] : [];
};

/** A brace's target: none; the body acts on itself. */
const HERE: TargetRef = deepFreeze({ kind: "point", at: [0, 0, 0] });

/**
 * **Brace**, where the legs cannot carry the body (`legsReadiness`; on offer at a state where it is
 * down): the whole body, facing the way it faces, held by `by` (an action of the body's and the
 * effector it is asked on, which holds the whole body while it lies: the ground's brace) where it
 * has one, else asked for nothing; priced as lying where it lies (`holding`). Its memory is the
 * instance it asks.
 */
export function brace(by: { readonly action: string; readonly effector: string } | null): Option {
  const STANDING = blocked("the legs carry the body"), state = { id: null as number | null };
  return { name: "brace", claims: WHOLE, state, ...RESTING,
    begin() { state.id = null; }, end() { state.id = null; },
    entry: (now) => legsReadiness(now.sight.view).kind === "ready" ? STANDING : READY, model: (at, ask) => at.down ? holding(at, ask) : null,
    step(now) {
      if (!by) return { asked: { move: null, face: now.sight.report.heading, actions: [] }, holds: NOTHING };
      state.id ??= now.sight.instance();
      const asked = { move: null, face: now.sight.report.heading, actions: [{ id: state.id, action: by.action, effector: by.effector, target: HERE }] };
      return { asked, holds: asking(now, asked) };
    } };
}
