import type { MusclePush } from "../../control/motor.ts";

/**
 * **A push on a schedule**: `channel` driven flat out from `from` s into a stroke for `length` s,
 * at `level` of its muscles' strength, its sign the push's sense. A control step the window covers
 * in part pushes for that part (its level times the share of the step covered), so a schedule asks
 * the same impulse at every rate.
 */
export interface TimedPush { readonly channel: string; readonly level: number; readonly from: number; readonly length: number }

/** Whether `push` is a timed push: a level from -1 to 1, its window finite and not negative. */
export const validPush = (push: TimedPush): boolean => typeof push.channel === "string" && [push.level, push.from, push.length].every(Number.isFinite)
  && Math.abs(push.level) <= 1 && push.from >= 0 && push.length >= 0;

/**
 * The share of a control step, from `since` s into a stroke for `step` s, that falls from `from` to
 * `to`; with no step, whether `since` does.
 */
export const stepShare = (since: number, step: number, from: number, to: number): number => step > 0
  ? Math.max(0, Math.min(since + step, to) - Math.max(since, from)) / step
  : since >= from && since < to ? 1 : 0;

/** **The pushes `schedule` asks of the step from `since` s into its stroke**, `step` s long, onto `pushes`. */
export function timedPushes(schedule: readonly TimedPush[], since: number, step: number, pushes: MusclePush[]): void {
  for (const p of schedule) {
    const part = stepShare(since, step, p.from, p.from + p.length);
    if (part > 0 && p.level !== 0) pushes.push({ channel: p.channel, sense: p.level > 0 ? 1 : -1, level: Math.abs(p.level) * part });
  }
}
