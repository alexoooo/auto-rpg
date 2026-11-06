import { effectorAim } from "../../control/effectors.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import { segmentOf } from "../../core/bodies/spec/body.ts";
import type { Side } from "../../core/bodies/bilateral.ts";
import { HAND_CONFIGURATION } from "../../core/bodies/human/hand-configurations.ts";

/** The declared configuration that opens, grips or presents a fist's strike endpoint. */
export function handConfiguration(spec: BodySpec, hand: string, use: "open" | "grip" | "fist"): string | null {
  const configurations = segmentOf(spec, hand)?.configurations;
  if (!configurations) return null;
  const name = use === "fist" ? Object.keys(configurations.aim ?? {}).find(name => configurations.aim![name] === "strike")
    : use === "grip" ? configurations.holding?.configuration : configurations.holding?.release ?? HAND_CONFIGURATION.open;
  return name !== undefined && Object.hasOwn(configurations.shapes, name) ? name : null;
}

/** Configurable hands must declare the actuator meaning the concrete skill consumes. */
export function handConfigurationRefusal(spec: BodySpec, hands: readonly string[], use: "open" | "grip" | "fist"): string | null {
  const missing = hands.find(hand => segmentOf(spec, hand)?.configurations && handConfiguration(spec, hand, use) === null);
  return missing ? `${missing} needs a declared ${use} hand configuration` : null;
}

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
  return handConfiguration(spec, `hand.${hand}`, "fist") !== null && !!segment?.points?.strike && holdsNothing(spec, segment.name);
}

/** Whether `segment` of `spec` holds nothing. */
export const holdsNothing = (spec: BodySpec, segment: string): boolean => !spec.held?.some((h) => h.segment === segment);

/** The point `hand` of `spec` strikes with: a hand that closes to strike, its fist's `strike`; else its effector's (`effectorAim`). */
export function aimOf(spec: BodySpec, hand: Side): string {
  return closesToStrike(spec, hand) ? "strike" : effectorAim(spec, `hand.${hand}`);
}
