import type { BodyView } from "../../control/body.ts";
import { withinActionWindow } from "../intent/action-window.ts";
import { hypot, sin, cos } from "../../core/math/real.ts";
import type { Readiness } from "../framework/action.ts";
import type { BodySense } from "../../core/bodies/senses.ts";
import { sensedNearest } from "../locomotion/navigation/sensed-bounds.ts";

/** How far nearer than its stand-off a foe may come before a strike backs out from it, m. */
export const CROWDED = 0.05;

/**
 * The fastest its centre of mass may move across the ground, m/s, for a stance shifting its weight
 * for a step to count as set: a stroke begun from a shift while the body still carries its walk
 * throws it over.
 */
const SHIFTING_PACE = 0.25;

/** Whether the body stands quiet enough to begin a stroke: standing, or shifting its weight no faster than `SHIFTING_PACE`. */
export const quietToStrike = (view: BodyView): boolean =>
  view.stance.phase === "stand" || view.stance.phase === "shift" && hypot(view.stance.velocity.x, view.stance.velocity.z) < SHIFTING_PACE;

/** Where a strike is thrown from (`strikeWindow`): its stand-off and how far past it, to either side and how fast it may be, and whether the stance must be quiet. */
export interface StrikeStand {
  /** How far across the ground the head stands from the target, facing it, m. */
  readonly standOff: number;
  /** How much further it may stand, m, and how far to either side of the line it faces. */
  readonly band: number;
  readonly aside: number;
  /** How far the line is set across from the head, m (a shoulder's, where the strike is squared to it). */
  readonly across: number;
  /** The fastest the body may move to be admitted, m/s; and whether its stance must be quiet (`quietToStrike`). */
  readonly pace: number;
  readonly poised: boolean;
  /** The least distance ahead of the stance centre the target may be for the two bodies to stand clear (`clearAhead`), m. */
  readonly clear: number;
  /** The body the target is on, where it is on one (`Window.on`). */
  readonly on?: string;
}

/**
 * **How far ahead of the stance centre, facing `heading`, the mark `at` must be for the striker's
 * body to stand clear of `foe`'s**, m: how far the striker stands out ahead of its centre
 * (`ahead`, `bodyAhead`) less how far ahead of the mark the foe's body comes nearest
 * (`sensedNearest`), each body's own colliders as they stand, what they hold left out; 0 where
 * the mark is on no body.
 */
export function clearAhead(view: BodyView, at: readonly [number, number, number], heading: number, foe: BodySense | null,
  ahead: (view: BodyView, ax: number, az: number) => number): number {
  if (!foe) return 0;
  const ax = sin(heading), az = cos(heading);
  return ahead(view, ax, az) - sensedNearest(foe, at[0], at[2], ax, az);
}

/**
 * **A strike's window at `at`**, facing `heading`: the target its stand-off ahead of the head, or
 * as near as keeps the bodies clear where that is farther (no nearer than `CROWDED` less, no
 * further than `band` more), within `aside` of the line it faces,
 * the body facing it and moving no faster than `pace`, on the body `on` names where it names one; ready within it, and quiet where `poised`;
 * else the window to walk to.
 */
export function strikeWindow(view: BodyView, at: readonly [number, number, number], heading: number, stand: StrikeStand): Readiness {
  const dx = view.head.x - view.stance.centre.x, dz = view.head.z - view.stance.centre.z;
  const ahead = dx * sin(heading) + dz * cos(heading), across = dx * cos(heading) - dz * sin(heading) + stand.across;
  // Entry permits the configured approach speed and a modest bearing error before settling.
  const near = Math.max(stand.standOff + ahead, stand.clear + CROWDED);
  const window = { at, along: [near - CROWDED, near + stand.band] as const,
    across: [across - stand.aside, across + stand.aside] as const, facing: .4, speed: stand.pace, ...(stand.on === undefined ? {} : { on: stand.on }) };
  if (!withinActionWindow(view, window, heading) || stand.poised && !quietToStrike(view)) return { kind: "position", window };
  return { kind: "ready", window };
}
