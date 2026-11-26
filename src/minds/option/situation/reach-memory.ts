import type { ReachMemory, Situation } from "../contract/situation.ts";
import { startOf } from "./start.ts";

/**
 * How near a range may come to a reach and still read as at its edge, m: the rounding of one range
 * found by two routes (a spot placed at the edge of a reach, then measured back from where it is).
 */
const ROUNDING = 1e-9;

/** **Whether `range` m is within `reach` m**: short of it; a range at its edge, rounding aside (`ROUNDING`), is out of it. */
export const within = (range: number, reach: number): boolean => range < reach - ROUNDING;

/** **Whether the body at `now` is within the focus's reach** (`Pressure.edge`). */
export const inReach = (now: Situation): boolean => within(now.range, now.predictions.pressure.edge(now));

/**
 * **What a body's reader keeps of the focus's reach**: for each foe, the seconds a blow it has not
 * begun would still take to reach the body (its grace), and when that was counted. Within the foe's
 * reach the grace is spent as time passes, out of it restored as time passes, never past the foe's
 * latency (`Pressure.latency`), which a foe first seen gives whole. It is counted when a decision
 * reads it (`graceAt`), the body taken as within or out of reach since the last count as it is now.
 */
export function reachMemory(): ReachMemory {
  const state: Record<string, { grace: number; at: number }> = {};
  return {
    state,
    /** The grace at `now`'s focus, counted to `now`. */
    grace(now: Situation): number {
      const focus = now.focus, latency = now.predictions.pressure.latency;
      if (!focus || !Number.isFinite(latency)) return latency;
      let kept = state[focus.id];
      if (!kept) kept = state[focus.id] = { grace: latency, at: now.time };
      if (kept.at !== now.time) {
        const dt = now.time - kept.at;
        kept.grace = inReach(now) ? Math.max(0, kept.grace - dt) : Math.min(latency, kept.grace + dt);
        kept.at = now.time;
      }
      return Math.min(kept.grace, latency);
    },
  };
}

/**
 * **The seconds before the focus's pressure reaches the body at `now`**: what a state an Option
 * leaves the body in carries (`Situation.grace`); else, at the state now, what its reader keeps
 * (`reachMemory`, `Situation.reached`).
 */
export const graceAt = (now: Situation): number => now.grace ?? now.reached.grace(now);

/**
 * **The own life `seconds` s cost under the focus's pressure** (`Pressure.dealt`), standing
 * where it stands at `now`, the two moving at `velocity` (`startOf`; the start's at `now` unless
 * given): none of the first s of its grace (`graceAt`), before a blow not yet begun reaches it.
 */
export const threatened = (now: Situation, seconds: number, velocity = startOf(now)): number =>
  now.predictions.pressure.dealt(now, { apart: now.range, velocity, seconds: Math.max(0, seconds - graceAt(now)), from: 0 });
