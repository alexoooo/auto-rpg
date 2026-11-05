import type { BuiltBody } from "../../core/bodies/build/build-body.ts";
import { groundContact } from "../../control/support.ts";

import type { World } from "../../core/world/world.ts";
import { hypot } from "../../core/math/real.ts";
import { SIDES, type Side } from "../../core/bodies/bilateral.ts";

/**
 * **The lab's gait meter**: what a walk or a run does with its feet, read from the ground's contacts
 * after each physics step, whatever skill drives the legs. A foot is down while the ground pushed on
 * it in the step (`groundContact`). A touchdown is a foot coming down after at least `AIRBORNE` s
 * off the ground, so a foot that skims and settles counts once; its place is the foot's node's.
 *
 * From the time it starts: the steps a second, the mean step (the distance between one touchdown
 * and the one before it, of either foot), and the share of the time on both feet and on none.
 *
 * This module has no page-only imports, so the Node stand can run it (`research/skills/locomotion/locomotion-run.mjs`).
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
  readonly state: object;
  reading(): GaitReading;
  dispose(): void;
}

/** Meter `built`'s feet in `world` from now. */
export function startGaitMeter(built: BuiltBody, world: World): GaitMeter {
  const feet = SIDES.map((side) => ({ side, segment: built.segments.get(`foot.${side}`)! }));
  const state = { off: { left: 0, right: 0 } as Record<Side, number>, seconds: 0, double: 0, flight: 0, touchdowns: 0, stepped: 0, last: null as [number, number] | null };
  const hook = world.afterStep((dt) => {
    let down = 0;
    for (const { side, segment } of feet) {
      if (!built.physics.contactsOf(segment.body).some((c) => groundContact(c, 0.5))) { state.off[side] += dt; continue; }
      down++;
      if (state.off[side] >= AIRBORNE) {
        const p = segment.pose.position;
        if (state.last) state.stepped += hypot(p.x - state.last[0], p.z - state.last[1]);
        state.last = [p.x, p.z];
        state.touchdowns++;
      }
      state.off[side] = 0;
    }
    state.seconds += dt;
    if (down === 2) state.double += dt;
    if (down === 0) state.flight += dt;
  });
  return {
    state, reading: () => ({
      seconds: state.seconds, touchdowns: state.touchdowns, cadence: state.seconds > 0 ? state.touchdowns / state.seconds : 0, step: state.touchdowns > 1 ? state.stepped / (state.touchdowns - 1) : 0,
      double: state.seconds > 0 ? state.double / state.seconds : 0, flight: state.seconds > 0 ? state.flight / state.seconds : 0,
    }),
    dispose: () => hook.dispose(),
  };
}
