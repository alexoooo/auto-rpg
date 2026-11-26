import { GUARD_RESOURCE, type Resource, type TargetRef, LEGS } from "../../../skills/framework/action.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import { deepFreeze } from "../../../core/state.ts";
import { legsReadiness } from "../../../skills/locomotion/shared/locomotion.ts";
import { facedHands } from "../../../core/bodies/items/held.ts";
import type { Cover } from "../../../skills/framework/intent.ts";
import { along, AS_ASKED, AS_IS, NO_BLOW, STAYS, STILL, UNMOVED, upOrDown } from "./outcomes.ts";
import { asking, blocked, READY, standing, NOTHING, WHOLE } from "./readiness.ts";
import type { Ask, Terms, TermSources } from "../contract/terms.ts";
import type { Option, Site, Status } from "../contract/option.ts";
import type { Situation } from "../contract/situation.ts";
import { inReach, threatened } from "../situation/reach-memory.ts";
import { startOf } from "../situation/start.ts";
import { CLINCH_FALLS, clinched } from "../predictions/by-hand.ts";
import type { Walker } from "../contract/context.ts";
import { atan2, hypot } from "../../../core/math/real.ts";

/**
 * **A way of holding** (`holding`): what of the blow coming gets through it, in life, and where
 * each answer of its price comes from, lying and standing (`TermSources`).
 */
export interface Held {
  coming(at: Situation): number;
  readonly lying: TermSources;
  readonly standing: TermSources;
}

/**
 * **Holding as the body is** (`Held`): the whole blow coming gets through. A hold runs for the
 * time it is asked to and throws no blow, and what it takes is the focus's pressure. Lying, it
 * moves nothing. Standing, its falls are the clinch's, which are set by hand.
 */
export const PLAIN: Held = Object.freeze({
  coming: (at: Situation) => at.predictions.danger,
  lying: Object.freeze({ duration: AS_ASKED, dealt: NO_BLOW, taken: "pressure", leaves: STAYS }),
  standing: Object.freeze({ duration: AS_ASKED, dealt: NO_BLOW, taken: "pressure", leaves: CLINCH_FALLS }),
});

/**
 * **Holding the body as it is at `at`** for the seconds `ask` gives (`Ask.until`, none unless
 * given), in the way `held` says (`Held`; as the body is, `PLAIN`, unless given), through what
 * that lets of the blow coming:
 * down, each second costing what a second down in its posture costs (`Predictions.downRate`),
 * leaving it where it lies; standing, under the focus's pressure where it stands (`threatened`),
 * read with the body still, as holding leaves it, the focus moving as it moves (`startOf`): what
 * the body was going at is not carried through a hold; and in a clinch its falls (`clinched`),
 * lying where a fall leaves it (`upOrDown`).
 */
export function holding(at: Situation, ask: Ask, held: Held = PLAIN): Terms {
  const seconds = ask.until ?? 0, coming = held.coming(at);
  if (at.down) return { duration: seconds, dealt: 0, orders: 0, taken: coming + at.predictions.downRate(at.posture) * seconds, outcomes: UNMOVED, from: held.lying };
  const still = startOf({ focus: at.focus, where: at.where, velocity: STILL });
  return { duration: seconds, dealt: 0, orders: 0, taken: coming + threatened(at, seconds, still), outcomes: upOrDown(AS_IS, clinched(at, seconds)), from: held.standing };
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
 * the body stands, where the focus's pressure reaches (`Pressure.edge`, `along`), facing the focus and
 * moving with it; none with no focus or where the body stands out of its reach.
 */
const OUT_OF_REACH: Site = Object.freeze({
  name: "the edge of the foe's reach",
  spot(at: Situation) {
    const focus = at.focus;
    return focus && inReach(at) ? { ...along(at, at.predictions.pressure.edge(at)), velocity: focus.velocity } : null;
  },
});

/**
 * **Hold the position**, where the legs can carry the body (`legsReadiness`; on offer at a state
 * where it stands, `standing`): the legs where they are (`still`). Its site is the nearest spot out
 * of the focus's reach (`OUT_OF_REACH`), where holding costs less.
 */
export function hold(walk: Pick<Walker, "facing" | "kept">): Option {
  return { name: "hold", kind: "hold", claims: LEGS, state: {}, ...RESTING, sites: [OUT_OF_REACH],
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
  return { name: `hold at (${x}, ${z})`, kind: "hold at", claims: LEGS, state: {}, ...RESTING, sites: [site],
    entry: (now) => {
      const legs = legsReadiness(now.sight.view);
      return legs.kind !== "ready" ? legs : off(now) <= within ? READY : AWAY;
    },
    model: (at, ask) => standing(at) && off(at) <= within ? holding(at, ask) : null, step: still(walk) };
}

/**
 * **The hands at their guard**, where the legs can carry the body (`legsReadiness`; on offer at a
 * state where it stands, `standing`), holding it as it is (`holding`): it claims the guard
 * (`GUARD_RESOURCE`) and asks the hands for nothing, its guard the body's; each of `shields` (a hand
 * holding a covering face) between a foe's weapon and the body while one is near
 * (`Situation.ward`), as a shield's guard is held.
 */
function guard(shields: readonly string[]): Option {
  const covers: Record<string, Cover> = {};
  return { name: "guard", kind: "guard", claims: GUARDING, state: {}, ...RESTING,
    entry: (now) => legsReadiness(now.sight.view), model: (at, ask) => standing(at) ? holding(at, ask) : null,
    step: (now) => {
      const asked = { move: null, face: now.sight.report.legs.heading, actions: [] };
      if (!shields.length || !now.ward) return { asked, holds: NOTHING };
      for (const hand of shields) covers[hand] = now.ward;
      return { asked: { ...asked, guard: covers }, holds: NOTHING };
    } };
}

/**
 * **The guard of a body of `spec`** (`guard`), whatever its guard: those of `covering` (the hands
 * its guard covers with, `GuardPart.covers`) holding a covering face its shields (`facedHands`);
 * a body without them holds its guard's posture, shielding nothing.
 */
export const guardOf = (spec: BodySpec, covering: readonly string[]): Option =>
  guard(facedHands(spec).filter((hand) => covering.includes(hand)));

/** What a guard's Options claim: the guard (`GUARD_RESOURCE`). */
export const GUARDING: readonly Resource[] = Object.freeze([GUARD_RESOURCE]);

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
  return { name: "brace", kind: "brace", claims: WHOLE, state, ...RESTING,
    begin() { state.id = null; }, end() { state.id = null; },
    entry: (now) => legsReadiness(now.sight.view).kind === "ready" ? STANDING : READY, model: (at, ask) => at.down ? holding(at, ask) : null,
    step(now) {
      if (!by) return { asked: { move: null, face: now.sight.report.legs.heading, actions: [] }, holds: NOTHING };
      state.id ??= now.sight.actions.instance();
      const asked = { move: null, face: now.sight.report.legs.heading, actions: [{ id: state.id, action: by.action, effector: by.effector, target: HERE }] };
      return { asked, holds: asking(now, asked) };
    } };
}
