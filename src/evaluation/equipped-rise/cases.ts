/**
 * **Equipped falls**: the owner's target's sixteen shoves of the Warrior and the Rogue on sword and
 * buckler, on buckler and club, and on the club, calm air, Balance 0 and Grit 0, a 30 s cap, the
 * stand verified. Not the target, which fixes its loadouts. The riser is a stand-up's mind or a
 * whole mind, on its own character (`Subject.character`); a body it cannot rise as is refused.
 */
import type { Loadout } from "../../core/items/held.ts";
import { presetFitsModel } from "../../core/mind/controller.ts";
import type { MindConfig } from "../../core/mind/config.ts";
import { modelHolding, type HumanoidModel } from "../../core/models.ts";
import { mindFaults } from "../../ui/mind-link.ts";
import { FALL_AFTER, FALL_CAP, fallCases, type BuiltFall, type FallReading } from "../fall.ts";
import type { Cases, Json } from "../evaluation.ts";
import { risingJobs } from "../rising.ts";

/** One equipped fall. */
export type EquippedCondition = {
  readonly model: HumanoidModel; readonly loadout: Loadout; readonly seed: number; readonly start: "shoved"; readonly degrees: number;
  readonly balance: number; readonly grit: number; readonly gusts: boolean; readonly target: false; readonly equipped: true;
};

/** The loadouts compared: sword and buckler, and buckler and club, against the club. */
const LOADOUTS: readonly Loadout[] = Object.freeze([Object.freeze({ left: "buckler", right: "sword" }), Object.freeze({ left: "empty", right: "club" }),
  Object.freeze({ left: "buckler", right: "club" })]);

/** The falls of `conditions` risen by a riser on its own character, refused where its mind does not fit the body holding the fall's loadout. */
function equippedFalls(play: Json, conditions: readonly EquippedCondition[]): Cases<EquippedCondition, FallReading, BuiltFall> {
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

export const EQUIPPED_RISE_CASES: Readonly<Record<string, Cases<EquippedCondition, FallReading, BuiltFall>>> = Object.freeze({
  standard: equippedFalls({ suite: "equipped falls", cap: FALL_CAP, after: FALL_AFTER },
    risingJobs({ loadouts: LOADOUTS, models: ["workshop-fighter", "workshop-rogue"], sub: "support-recovery" })
      .map(({ model, loadout, seed, start, degrees, balance, grit, gusts }): EquippedCondition =>
        ({ model: model!, loadout: loadout!, seed, start: start as "shoved", degrees: degrees!, balance: balance!, grit: grit!, gusts: gusts!, target: false, equipped: true }))),
});
