import type { BodyView } from "../../body.ts";
import { withinActionWindow } from "../../intent/action-window.ts";
import { hypot, sin, cos } from "../../math/real.ts";
import type { Readiness } from "../framework/action.ts";

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
}

/**
 * **A strike's window at `at`**, facing `heading`: the target its stand-off ahead of the head (no
 * nearer than `CROWDED` less, no further than `band` more), within `aside` of the line it faces,
 * the body facing it and moving no faster than `pace`; ready within it, and quiet where `poised`;
 * else the window to walk to.
 */
export function strikeWindow(view: BodyView, at: readonly [number, number, number], heading: number, stand: StrikeStand): Readiness {
  const dx = view.head.x - view.stance.centre.x, dz = view.head.z - view.stance.centre.z;
  const ahead = dx * sin(heading) + dz * cos(heading), across = dx * cos(heading) - dz * sin(heading) + stand.across;
  // Entry permits the configured approach speed and a modest bearing error before settling.
  const window = { at, along: [stand.standOff + ahead - CROWDED, stand.standOff + ahead + stand.band] as const,
    across: [across - stand.aside, across + stand.aside] as const, facing: .4, speed: stand.pace };
  if (!withinActionWindow(view, window, heading) || stand.poised && !quietToStrike(view)) return { kind: "position", window };
  return { kind: "ready", window };
}
