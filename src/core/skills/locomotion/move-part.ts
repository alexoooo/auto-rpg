import { choice } from "../../parts/fields.ts";
import type { LocomotionPart } from "../framework/locomotion-part.ts";
import { fitsSoles } from "../../control/stance-balance.ts";
import { slotList, type ConfigOf, type PartConfig } from "../../parts/parts.ts";
import { deepFreeze } from "../../state.ts";
import { gaitNamed, STOCK_GAITS, type Gait, type GaitName } from "./gaits.ts";
import type { Locomotion } from "./locomotion.ts";
import { move, type MoveGait } from "./move.ts";
import { GAIT_CHOICES } from "./move-rule-part.ts";
import type { MOVE_RULES } from "./move-rules.ts";

/**
 * The legs a body gets about by (`move`): the fighting step (braced) while it stands or a standing
 * foe is within 5 m; otherwise the walk and run free to run, which runs once the speed the rule asks
 * (`travelSpeed`, `src/core/intent/travel.ts`) is past its run's. The run slows at its `brake`
 * (0.47 m/s²): from the pace it runs from (1.3 m/s) it stops in about 1.8 m, and closing on a foe
 * that closes too, in twice that, so it is walking by the time a fight's reach is near. At 2 m two
 * Arena fighters opened 4 m apart run into each other and one falls. Near a standing body of its own
 * side it walks in the fighting step within 8.5 m: the run states it stops at 0.2 m/s²
 * (`Locomotion.stopping`), so from the pace it runs from it stops in 4.2 m, and closing on one that
 * closes too, in twice that; at 5 m four crossing paths ran into each other and fell. The fighting
 * step keeps clear of it (`crowdWalk`, `src/core/navigation/crowd.ts`). The last 5 m to its
 * destination is walked in the fighting step too, which stops where it is sent where the run carries
 * past it.
 */
export const MOVE: MoveConfig = deepFreeze({ kind: "move",
  rules: [{ kind: "when-standing", gait: "braced" }, { kind: "when-distance", of: "foe", than: "under", metres: 5, gait: "braced" },
    { kind: "when-distance", of: "ally", than: "under", metres: 8.5, gait: "braced" }, { kind: "when-distance", of: "destination", than: "under", metres: 5, gait: "braced" }],
  otherwise: "run" });

/** **A rule of Move's config**, by kind (`MOVE_RULES`): when it chooses its gait. */
export type MoveRuleConfig = ConfigOf<typeof MOVE_RULES>;

/**
 * **Move** (`move`, `skills/locomotion/move.ts`): of its gaits (`gaits`, the stock ones, `STOCK_GAITS`, where
 * it names none), the one of the first of `rules` that holds, or `otherwise`'s.
 */
export interface MoveConfig {
  readonly kind: "move";
  readonly gaits?: readonly Gait[];
  readonly rules: readonly MoveRuleConfig[];
  readonly otherwise: GaitName;
}

/** **The gaits Move walks by** (`MoveConfig.gaits`): its own, else the stock ones (`STOCK_GAITS`). */
export const gaitsOfMove = (config: MoveConfig): readonly Gait[] => config.gaits ?? STOCK_GAITS;

/** The gaits `config` walks by, each once, in the order its rules and then `otherwise` name them, then every other of its gaits, which a legs goal may name; a name none of them has left out. */
const gaitsOf = (config: MoveConfig): readonly Gait[] => {
  const gaits = gaitsOfMove(config);
  return [...new Set([...config.rules.map((r) => r.gait), config.otherwise, ...gaits.map((gait) => gait.name)])].flatMap((name) => gaitNamed(gaits, name) ?? []);
};

/** What is wrong with `config`'s gaits: a name empty or twice, legs that are Move's own, or a rule or `otherwise` naming a gait it does not have. */
function gaitFaults(config: MoveConfig): readonly string[] {
  const gaits = gaitsOfMove(config), faults: string[] = [];
  if (!Array.isArray(gaits) || gaits.length === 0) return ["move: a gait to walk by"];
  const names = new Set<string>();
  for (const gait of gaits) {
    if (typeof gait?.name !== "string" || gait.name.length === 0) { faults.push("move: a gait with no name"); continue; }
    if (names.has(gait.name)) faults.push(`move: two gaits called ${JSON.stringify(gait.name)}`);
    names.add(gait.name);
    if (typeof gait.legs?.kind !== "string" || gait.legs.kind === "move") faults.push(`move: gait ${JSON.stringify(gait.name)}'s legs, a walk other than Move`);
  }
  for (const name of [...config.rules.map((r) => r.gait), config.otherwise]) if (!names.has(name)) faults.push(`move: no gait called ${JSON.stringify(name)}`);
  return faults;
}

/**
 * **Move** (`move`): the legs of the gait it goes by, so it holds that gait's envelope and stops at
 * its stopping. Its gaits are made once each, those whose legs differ only in whether they may run
 * sharing one walk (`MoveGait`); its rules are made as the lookup finds them (`MoveRulePart`). Its
 * gaits are config (`MoveConfig.gaits`): a new gait is an entry, its legs any walk's config.
 */
export const MOVE_PART: LocomotionPart<MoveConfig> = deepFreeze({
  role: "locomotion", label: "Move", stage: "game", defaults: MOVE, keys: { kind: true, gaits: true, rules: true, otherwise: true },
  fields: [choice<MoveConfig, "otherwise">("otherwise", "Otherwise", GAIT_CHOICES)],
  slots: [slotList("rules", "When", "move-rule")], fits: fitsSoles, uses: (config) => gaitsOf(config).map((gait) => gait.legs),
  faults: gaitFaults,
  make(body, config, legs) {
    const walked = gaitsOf(config), names = walked.map((gait) => gait.name), built = new Map<string, Locomotion>();
    const gaits = walked.map((gait): MoveGait => {
      const of: PartConfig = gait.legs, runs = legs.runs(of);
      const key = JSON.stringify(runs === undefined ? of : { ...of, runs: undefined });
      if (!built.has(key)) built.set(key, legs.make(body, of));
      return { name: gait.name, legs: built.get(key)!, ...(runs === undefined ? {} : { runs }) };
    });
    return move(gaits, config.rules.map((r) => legs.parts.of("move-rule", r).make(r, names.indexOf(r.gait))), names.indexOf(config.otherwise));
  },
});
