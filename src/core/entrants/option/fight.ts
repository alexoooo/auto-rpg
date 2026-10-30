import { anyBody, slotList, type PartConfig } from "../../mind/parts.ts";
import type { Tactics } from "../../mind/tactics.ts";
import type { TacticsMaking, TacticsPart } from "../../mind/tactics-part.ts";
import { deepFreeze } from "../../state.ts";
import { OPTIONS } from "./options/kinds.ts";

/** **Its own fight** as one tactics: Option Mind deciding by `options` (`OPTIONS` where none are given), with its chooser, legs, executors and rise. */
export interface OptionFightConfig {
  readonly kind: "option-fight";
  readonly options?: readonly PartConfig[];
}

/** What Option Mind makes its tactics for: the toolkit's, and its own tactics deciding by `options` (`optionTactics`). */
export interface OptionMaking extends TacticsMaking {
  readonly fightBy: (options: readonly PartConfig[] | undefined) => Tactics;
}

/** **Its own fight** (`option-fight`): what a drill fights by until its moment (`Controller.fight`); made only within Option Mind, which gives it its chooser, legs and rise. */
export const OPTION_FIGHT: TacticsPart<OptionFightConfig> = deepFreeze({
  role: "tactics", label: "Its own fight", stage: "experimental", fields: [], slots: [slotList("options", "Options", "option")],
  defaults: { kind: "option-fight" }, keys: { kind: true, options: true }, fits: anyBody, faults: () => [],
  uses: (config: OptionFightConfig) => config.options ? [] : OPTIONS,
  make: (making: TacticsMaking, config: OptionFightConfig) => {
    if (!("fightBy" in making)) throw new Error("Option Mind's own fight is made only within an Option Mind");
    return (making as OptionMaking).fightBy(config.options);
  },
});
