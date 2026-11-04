/**
 * **The stand-up target's falls**: every body in every rated loadout (`REPRESENTATIVE`), each
 * shoved sixteen ways (`risingJobs`), calm air, Balance 0 and Grit 0, a 30 s cap, the stand
 * verified (`docs/reference/rising.md#the-owners-target`). Protocol `fresh`: the same shoved
 * halfway between those directions (`FRESH_OFFSET`). The riser is a stand-up's mind or a whole
 * mind, on its own character (`Subject.character`); a body it cannot rise as, holding the fall's
 * loadout, is refused.
 */
import type { Loadout } from "../../core/items/held.ts";
import { presetFitsModel } from "../../core/mind/controller.ts";
import type { MindConfig } from "../../core/mind/config.ts";
import { modelHolding, type HumanoidModel } from "../../core/models.ts";
import { mindFaults } from "../../ui/mind-link.ts";
import { FALL_AFTER, FALL_CAP, fallCases, type BuiltFall, type FallReading } from "../fall.ts";
import type { Cases, Json } from "../evaluation.ts";
import { FRESH_OFFSET, risingJobs } from "../rising.ts";

/** One of the target's falls. */
export type TargetCondition = {
  readonly model: HumanoidModel; readonly loadout: Loadout; readonly seed: number; readonly start: "shoved"; readonly degrees: number;
  readonly balance: number; readonly grit: number; readonly gusts: boolean; readonly target: true;
};

/** The target's falls with its shoves turned by `offset` degrees. */
const targetFalls = (offset: number): TargetCondition[] => risingJobs({ target: true, offset }).map(({ model, loadout, seed, start, degrees, balance, grit, gusts }): TargetCondition =>
  ({ model: model!, loadout: loadout!, seed, start: start as "shoved", degrees: degrees!, balance: balance!, grit: grit!, gusts: gusts!, target: true }));

/** `conditions` risen by a riser on its own character, refused where its mind does not fit the body holding the fall's loadout. */
function targetCases(play: Json, conditions: readonly TargetCondition[]): Cases<TargetCondition, FallReading, BuiltFall> {
  const inner = fallCases(play, conditions);
  return { ...inner,
    faults: (value, condition, subject) => {
      const bed = inner.faults?.(value, condition, subject) ?? [];
      if (bed.length) return bed;
      if (!presetFitsModel(subject ?? {}, condition.model)) return [`named calibration allows ${subject?.models?.join(", ") || "no bodies"}; ${condition.model} is unavailable`];
      return mindFaults(value as unknown as MindConfig, modelHolding(condition.model, condition.loadout, subject?.character), { entry: [] });
    },
    world: (values, condition, engine, characters) => {
      const world = inner.world(values, condition, engine, characters), character = characters[0];
      return world.kind === "fall" && character && Object.keys(character).length > 0 ? { ...world, fall: { ...world.fall, character } } : world;
    } };
}

export const RISING_TARGET_CASES: Readonly<Record<string, Cases<TargetCondition, FallReading, BuiltFall>>> = Object.freeze({
  standard: targetCases({ suite: "the owner's target", cap: FALL_CAP, after: FALL_AFTER }, targetFalls(0)),
  fresh: targetCases({ suite: "the owner's target's fresh falls", cap: FALL_CAP, after: FALL_AFTER }, targetFalls(FRESH_OFFSET)),
});
