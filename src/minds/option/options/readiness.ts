import { BODY_RESOURCE, type Resource, hasResource, type Readiness } from "../../../skills/framework/action.ts";
import type { Option, Asked } from "../contract/option.ts";
import type { Situation } from "../contract/situation.ts";
import { SETTLED } from "../../../skills/intent/action-window.ts";
import { hypot } from "../../../core/math/real.ts";

/** What a choice that holds nothing holds. */
export const NOTHING: readonly Resource[] = Object.freeze([]);

/** All the resources as a claim: it overlaps every other (`overlaps`). */
export const WHOLE: readonly Resource[] = Object.freeze([BODY_RESOURCE]);

/** Whether `choice` is on offer now: its entry admits. */
export const onOffer = (choice: Option, now: Situation): boolean => choice.entry(now).kind === "ready";

/**
 * **Whether the body stands at `at`**: not down, and borne by its feet with no rise of its own
 * holding it otherwise (`posture` standing): where an Option that begins standing is on offer.
 */
export const standing = (at: Situation): boolean => !at.down && at.posture === "standing";

/**
 * **Whether the body stands still at `at`**: its stance standing, not in a step (`stride`), and its
 * centre moving no faster than a standing body's once its sway has died out (`SETTLED`).
 */
export const still = (at: Situation): boolean => at.stride === "stand" && hypot(at.velocity.x, at.velocity.z) <= SETTLED;

/** An entry or exit that admits. */
export const READY: Readiness = Object.freeze({ kind: "ready" });

/** An entry or exit that does not admit, for `reason`: made once, as the options are. */
export const blocked = (reason: string): Readiness => Object.freeze({ kind: "blocked", reason });

/** What a step's asks hold (`SkillsActions.needs`): each blow continued, what it holds; each asked anew, what it will. */
export function asking(now: Situation, asked: Asked): readonly Resource[] {
  const held: Resource[] = [];
  for (const request of asked.actions) {
    const live = now.sight.report.actions.find((action) => action.id === request.id);
    for (const resource of live ? live.holds : now.sight.actions.needs(request.action, request.effector)) if (!hasResource(held, resource)) held.push(resource);
  }
  return held;
}
