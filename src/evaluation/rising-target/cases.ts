/**
 * **The owner's target's falls**: the Warrior and the Rogue, empty-handed and with the club, each
 * shoved sixteen ways (`risingJobs`), calm air, Balance 0 and Grit 0, a 30 s cap, the stand
 * verified (`docs/reference/rising.md#the-owners-target`).
 */
import type { Held } from "../../core/items/held.ts";
import type { HumanoidModel } from "../../core/models.ts";
import { FALL_AFTER, FALL_CAP, fallCases, type BuiltFall, type FallReading } from "../fall.ts";
import type { Cases } from "../evaluation.ts";
import { risingJobs } from "../rising.ts";

/** One of the target's falls. */
export type TargetCondition = {
  readonly model: HumanoidModel; readonly held: Held; readonly seed: number; readonly start: "shoved"; readonly degrees: number;
  readonly balance: number; readonly grit: number; readonly gusts: boolean; readonly target: true;
};

export const RISING_TARGET_CASES: Readonly<Record<string, Cases<TargetCondition, FallReading, BuiltFall>>> = Object.freeze({
  standard: fallCases({ suite: "the owner's target", cap: FALL_CAP, after: FALL_AFTER },
    risingJobs({ target: true, sub: "support-recovery" }).map(({ model, held, seed, start, degrees, balance, grit, gusts }): TargetCondition =>
      ({ model: model!, held: held!, seed, start: start as "shoved", degrees: degrees!, balance: balance!, grit: grit!, gusts: gusts!, target: true }))),
});
