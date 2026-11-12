/**
 * **How a fall of the way-up drill reads its way up** (`docs/reference/rising.md#the-way-up-drill`):
 * the attempts at the way up its riser ranks first (`WayUpReading.way`), each reaching where it goes
 * or not, and their value, the seconds an attempt costs.
 */
import type { WayUpReading } from "./cases.ts";

/**
 * **What an attempt that does not reach where its way up goes costs**, s, however soon it failed:
 * the longest a staged way up runs before it times out (step up's whole attempt, `LIMIT` in
 * `src/skills/recovery/implementations/staged/records.ts`).
 */
export const ATTEMPT_CAP = 16;

/**
 * **A fall's attempts at its way up**: how many, and how many reached where it goes (ended `done`)
 * and their seconds together; null for a fall not made (no takeover). A fall made with no attempt
 * at it never reached a posture it begins from.
 */
export interface WayUpAttempts { readonly attempts: number; readonly reached: number; readonly reachedSeconds: number }

/** An attempt as a fall's reading records it: its ground action (`controller`, the technique's name) or technique, how it ended and its seconds. */
type Attempt = { readonly technique?: string; readonly controller?: string; readonly end?: string; readonly seconds: number };

/** **`reading`'s attempts at its way up** (`WayUpAttempts`); null for a fall not made. */
export function wayUpAttempts(reading: Pick<WayUpReading, "takeover" | "attempts" | "way">): WayUpAttempts | null {
  if (reading.takeover === null) return null;
  const mine = (reading.attempts as unknown as readonly Attempt[]).filter((attempt) => (attempt.technique ?? attempt.controller) === reading.way);
  const reached = mine.filter((attempt) => attempt.end === "done");
  return { attempts: mine.length, reached: reached.length, reachedSeconds: reached.reduce((sum, attempt) => sum + attempt.seconds, 0) };
}

/**
 * **A fall's value**, s an attempt: the mean over its attempts at the way up of each one's
 * seconds where it reached where it goes, `ATTEMPT_CAP` where it did not; null for a fall not made
 * or one with no attempt (not exercised).
 */
export const attemptsValue = (one: WayUpAttempts | null): number | null =>
  one === null || one.attempts === 0 ? null : (one.reachedSeconds + (one.attempts - one.reached) * ATTEMPT_CAP) / one.attempts;

/** **What a fall came to for its way up**, in a word: not made, not exercised, every attempt reached, or one failed. */
export function wayUpOutcome(one: WayUpAttempts | null): { readonly label: string; readonly passed: boolean } {
  if (one === null) return { label: "no takeover", passed: false };
  if (one.attempts === 0) return { label: "not exercised", passed: false };
  if (one.reached === one.attempts) return { label: "reached", passed: true };
  return { label: "failed", passed: false };
}
