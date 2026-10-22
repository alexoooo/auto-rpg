/**
 * **Equipped falls**: the owner's target's sixteen shoves of the Warrior and the Rogue on sword and
 * buckler and on the club, calm air, Balance 0 and Grit 0, a 30 s cap, the stand verified. Not the
 * target, which fixes its loadouts.
 */
import type { Loadout } from "../../core/items/held.ts";
import type { HumanoidModel } from "../../core/models.ts";
import { FALL_AFTER, FALL_CAP, fallCases, type BuiltFall, type FallReading } from "../fall.ts";
import type { Cases } from "../evaluation.ts";
import { risingJobs } from "../rising.ts";

/** One equipped fall. */
export type EquippedCondition = {
  readonly model: HumanoidModel; readonly loadout: Loadout; readonly seed: number; readonly start: "shoved"; readonly degrees: number;
  readonly balance: number; readonly grit: number; readonly gusts: boolean; readonly target: false; readonly equipped: true;
};

/** The loadouts compared: sword and buckler, against the club. */
const LOADOUTS: readonly Loadout[] = Object.freeze([Object.freeze({ left: "buckler", right: "sword" }), Object.freeze({ left: "empty", right: "club" })]);

export const EQUIPPED_RISE_CASES: Readonly<Record<string, Cases<EquippedCondition, FallReading, BuiltFall>>> = Object.freeze({
  standard: fallCases({ suite: "equipped falls", cap: FALL_CAP, after: FALL_AFTER },
    risingJobs({ loadouts: LOADOUTS, models: ["workshop-fighter", "workshop-rogue"], sub: "support-recovery" })
      .map(({ model, loadout, seed, start, degrees, balance, grit, gusts }): EquippedCondition =>
        ({ model: model!, loadout: loadout!, seed, start: start as "shoved", degrees: degrees!, balance: balance!, grit: grit!, gusts: gusts!, target: false, equipped: true }))),
});
