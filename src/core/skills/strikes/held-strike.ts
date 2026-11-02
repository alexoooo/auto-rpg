import { effectorAim } from "../../control/effectors.ts";
import type { Side, BodySpec } from "../../spec/body.ts";
import { segmentOf } from "../../spec/body.ts";

/** What an empty hand holds, by name (`heldIn`). */
export const FIST = "fist";

/** What `hand` of `spec` holds: the item's name, or `FIST`. */
export function heldIn(spec: BodySpec, hand: Side): string {
  return spec.held?.find((h) => h.segment === `hand.${hand}`)?.item.name ?? FIST;
}

/**
 * Whether `hand` of `spec` closes into its fist to strike: it has a fist pose and a point on it to
 * strike with (`strike`), and holds nothing. Every skill set closes such a hand for its blow
 * (`skillSet`).
 */
export function closesToStrike(spec: BodySpec, hand: Side): boolean {
  const segment = segmentOf(spec, `hand.${hand}`);
  return !!segment?.handPoses && !!segment.points?.strike && holdsNothing(spec, segment.name);
}

/** Whether `segment` of `spec` holds nothing. */
export const holdsNothing = (spec: BodySpec, segment: string): boolean => !spec.held?.some((h) => h.segment === segment);

/** The point `hand` of `spec` strikes with: a hand that closes to strike, its fist's `strike`; else its effector's (`effectorAim`). */
export function aimOf(spec: BodySpec, hand: Side): string {
  return closesToStrike(spec, hand) ? "strike" : effectorAim(spec, `hand.${hand}`);
}
