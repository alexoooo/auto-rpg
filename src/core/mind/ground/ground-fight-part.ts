import { deepFreeze } from "../../state.ts";
import { choice, number } from "../fields.ts";
import { takesCommands } from "../parts.ts";
import type { SubMindPart } from "../sub-mind-part.ts";
import { groundFight, type GroundFightConfig } from "./ground-fight.ts";

/** **Fight on the ground** (`groundFight`): it needs the body's completed observations, which its host gives. */
export const GROUND_FIGHT_PART: SubMindPart<GroundFightConfig> = deepFreeze({
  role: "sub-mind", label: "Fight on the ground", stage: "experimental", slots: [],
  fields: [number("reach", "Foe reach", .1, 3, .1, "m"), choice("kicks", "Kicking foot", [["either", "Either"], ["left", "Left"], ["right", "Right"], ["none", "Cover only"]])],
  defaults: { kind: "ground-fight", reach: 1.2, kicks: "either" }, keys: { kind: true, reach: true, kicks: true },
  down: { name: "fight from the ground", seconds: 2, stands: 0, shelter: .3 },
  fits: takesCommands,
  faults: (config) => [...Number.isFinite(config.reach) && config.reach > 0 ? [] : ["reach must be finite and positive"],
    ...["either", "left", "right", "none"].includes(config.kicks) ? [] : ["unknown kicking foot"]],
  make(own, view, config, kit, clock, afterPhysics) {
    if (!afterPhysics) throw new Error("ground fighting needs completed body observations");
    return groundFight(own, view, clock, config, kit, afterPhysics);
  },
});
