import type { BuiltBody } from "../core/build/build-body.ts";
import { groundContact } from "../core/control/support.ts";
import type { Side } from "../core/spec/body.ts";
import type { World } from "../core/world.ts";

/**
 * **The lab's gait meter**: what a walk or a run does with its feet, read from the ground's contacts
 * after each physics step, whatever skill drives the legs. A foot is down while the ground pushed on
 * it in the step (`groundContact`). A touchdown is a foot coming down after at least `AIRBORNE` s
 * off the ground, so a foot that skims and settles counts once; its place is the foot's node's.
 *
 * From the time it starts: the steps a second, the mean step (the distance between one touchdown
 * and the one before it, of either foot), and the share of the time on both feet and on none.
 *
 * This module has no page-only imports, so the Node stand can run it (`research/locomotion-run.mjs`).
 */

/** How long a foot is off the ground before it comes down again as a touchdown, s. */
const AIRBORNE = 0.05;

/** What the meter has read since it started. */
export interface GaitReading {
  /** Seconds read. */
  readonly seconds: number;
  readonly touchdowns: number;
  /** Touchdowns a second. */
  readonly cadence: number;
  /** The mean distance between successive touchdowns, m (0 before two). */
  readonly step: number;
  /** The share of the time both feet were down, and neither. */
  readonly double: number;
  readonly flight: number;
}

interface GaitMeter {
  reading(): GaitReading;
  dispose(): void;
}

/** Meter `built`'s feet in `world` from now. */
export function startGaitMeter(built: BuiltBody, world: World): GaitMeter {
  const feet = (["left", "right"] as const).map((side) => ({ side, segment: built.segments.get(`foot.${side}`)! }));
  const off: Record<Side, number> = { left: 0, right: 0 };
  let seconds = 0, double = 0, flight = 0, touchdowns = 0, stepped = 0, last: [number, number] | null = null;
  const hook = world.afterStep((dt) => {
    let down = 0;
    for (const { side, segment } of feet) {
      if (!built.physics.contactsOf(segment.body).some((c) => groundContact(c, 0.5))) { off[side] += dt; continue; }
      down++;
      if (off[side] >= AIRBORNE) {
        const p = segment.node.position;
        if (last) stepped += Math.hypot(p.x - last[0], p.z - last[1]);
        last = [p.x, p.z];
        touchdowns++;
      }
      off[side] = 0;
    }
    seconds += dt;
    if (down === 2) double += dt;
    if (down === 0) flight += dt;
  });
  return {
    reading: () => ({
      seconds, touchdowns, cadence: seconds > 0 ? touchdowns / seconds : 0, step: touchdowns > 1 ? stepped / (touchdowns - 1) : 0,
      double: seconds > 0 ? double / seconds : 0, flight: seconds > 0 ? flight / seconds : 0,
    }),
    dispose: () => hook.dispose(),
  };
}
