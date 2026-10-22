import { MOVE } from "../mind/config.ts";
import { choice } from "../mind/fields.ts";
import type { LocomotionPart } from "../mind/locomotion-part.ts";
import { fitsSoles } from "../control/stance-balance.ts";
import { slotList, type ConfigOf, type PartConfig } from "../mind/parts.ts";
import { deepFreeze } from "../state.ts";
import { GAITS, type GaitName } from "./gaits.ts";
import type { Locomotion } from "./locomotion.ts";
import { move, type MoveGait } from "./move.ts";
import { GAIT_CHOICES, isGait } from "./move-rule-part.ts";
import type { MOVE_RULES } from "./move-rules.ts";

/** **A rule of Move's config**, by kind (`MOVE_RULES`): when it chooses its gait. */
export type MoveRuleConfig = ConfigOf<typeof MOVE_RULES>;

/**
 * **Move** (`move`, `skills/move.ts`): the gait (`GAITS`) of the first of `rules` that holds, or
 * `otherwise`'s.
 */
export interface MoveConfig {
  readonly kind: "move";
  readonly rules: readonly MoveRuleConfig[];
  readonly otherwise: GaitName;
}

/** The gaits `config` walks by, each once, in the order its rules and then `otherwise` name them. */
const gaitsOf = (config: MoveConfig): readonly GaitName[] => [...new Set([...config.rules.map((r) => r.gait), config.otherwise])];

/**
 * **Move** (`move`): the legs of the gait it goes by, so it holds that gait's envelope and stops at
 * its stopping. Its gaits are made once each, those whose legs differ only in whether they may run
 * sharing one walk (`MoveGait`); its rules are made as the lookup finds them (`MoveRulePart`).
 */
export const MOVE_PART: LocomotionPart<MoveConfig> = deepFreeze({
  role: "locomotion", label: "Move", stage: "game", defaults: MOVE, keys: { kind: true, rules: true, otherwise: true },
  fields: [choice<MoveConfig, "otherwise">("otherwise", "Otherwise", GAIT_CHOICES)],
  slots: [slotList("rules", "When", "move-rule")], fits: fitsSoles,
  faults: (config) => isGait(config.otherwise) ? [] : [`move: no gait called ${JSON.stringify(config.otherwise)}`],
  make(body, config, legs) {
    const names = gaitsOf(config), built = new Map<string, Locomotion>();
    const gaits = names.map((name): MoveGait => {
      const of: PartConfig = GAITS[name].legs, runs = legs.runs(of);
      const key = JSON.stringify(runs === undefined ? of : { ...of, runs: undefined });
      if (!built.has(key)) built.set(key, legs.make(body, of));
      return { legs: built.get(key)!, ...(runs === undefined ? {} : { runs }) };
    });
    return move(gaits, config.rules.map((r) => legs.parts.of("move-rule", r).make(r, names.indexOf(r.gait))), names.indexOf(config.otherwise));
  },
});
