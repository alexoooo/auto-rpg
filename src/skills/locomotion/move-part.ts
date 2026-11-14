import { variationFault, variedMake, type Varied } from "../framework/variations.ts";
import type { Body } from "../../control/body.ts";
import type { Legs } from "../framework/locomotion-part.ts";
import type { Locomotion } from "../framework/locomotion-part.ts";
import type { GaitName } from "../framework/skill.ts";
import { choice } from "../../parts/fields.ts";
import type { LocomotionPart } from "../framework/locomotion-part.ts";
import { slotList, type PartConfig } from "../../parts/parts.ts";
import { deepFreeze } from "../../core/state.ts";
import { gaitNamed, STOCK_GAITS, type Gait } from "./gaits.ts";
import { move, type MoveGait } from "./move.ts";
import { GAIT_CHOICES, type MoveRuleConfig } from "./move-rule-part.ts";

/**
 * The legs a body gets about by (`move`): by the gait its legs goal names (`LegsGoal.gait`), the
 * braced fighting step where it names none; no rule chooses one.
 */
export const GOING: MoveConfig = deepFreeze({ kind: "move", rules: [], otherwise: "braced" });

/**
 * **Move** (`move`, `skills/locomotion/move.ts`): of its gaits (`gaits`, the stock ones, `STOCK_GAITS`, where
 * it names none), the one of the first of `rules` that holds, or `otherwise`'s.
 */
export interface MoveConfig extends Varied {
  readonly kind: "move";
  readonly gaits?: readonly Gait[];
  readonly rules: readonly MoveRuleConfig[];
  readonly otherwise: GaitName;
}

/** **The gaits Move walks by** (`MoveConfig.gaits`): its own, else the stock ones (`STOCK_GAITS`). */
const gaitsOfMove = (config: MoveConfig): readonly Gait[] => config.gaits ?? STOCK_GAITS;

/** The gaits `config` walks by, each once, in the order its rules and then `otherwise` name them, then every other of its gaits, which a legs goal may name; a name none of them has left out. */
const gaitsOf = (config: MoveConfig): readonly Gait[] => {
  const gaits = gaitsOfMove(config);
  return [...new Set([...config.rules.map((r) => r.gait), config.otherwise, ...gaits.map((gait) => gait.name)])].flatMap((name) => gaitNamed(gaits, name) ?? []);
};

/** What is wrong with `config`'s gaits: a name empty or twice, legs that name no kind, or a rule or `otherwise` naming a gait it does not have. */
function gaitFaults(config: MoveConfig): readonly string[] {
  const gaits = gaitsOfMove(config), faults: string[] = [];
  if (!Array.isArray(config.rules)) faults.push("rules: a list of move-rule parts");
  if (config.gaits !== undefined && !Array.isArray(config.gaits)) faults.push("gaits: a list of named gait parts");
  if (faults.length) return faults;
  if (!Array.isArray(gaits) || gaits.length === 0) return ["move: a gait to walk by"];
  const names = new Set<string>();
  for (const gait of gaits) {
    if (typeof gait?.name !== "string" || gait.name.length === 0) { faults.push("move: a gait with no name"); continue; }
    if (names.has(gait.name)) faults.push(`move: two gaits called ${JSON.stringify(gait.name)}`);
    names.add(gait.name);
    if (typeof gait.legs?.kind !== "string") faults.push(`move: gait ${JSON.stringify(gait.name)}'s legs, a gait part's config`);
  }
  for (const name of [...config.rules.map((r) => r.gait), config.otherwise]) if (!names.has(name)) faults.push(`move: no gait called ${JSON.stringify(name)}`);
  return faults;
}

/** Move's variations: move. */
const VARIATIONS = {
  move(body: Body, config: MoveConfig, legs: Legs): Locomotion {
    const walked = gaitsOf(config), names = walked.map((gait) => gait.name), built = new Map<string, Locomotion>();
    const gaits = walked.map((gait): MoveGait => {
      const of: PartConfig = gait.legs, key = JSON.stringify(of);
      if (!built.has(key)) built.set(key, legs.make(body, of));
      return { name: gait.name, legs: built.get(key)! };
    });
    return move(gaits, config.rules.map((r) => legs.parts.of("move-rule", r).make(r, names.indexOf(r.gait))), names.indexOf(config.otherwise));
  },
};

/**
 * **Move** (`move`): the legs of the gait it goes by, so it holds that gait's envelope and stops at
 * its stopping. Its gaits are made once for each complete configuration; its rules are made as the lookup finds them (`MoveRulePart`). Its
 * gaits are config (`MoveConfig.gaits`): a new gait is an entry, its legs any gait part's config (`GaitPart`).
 */
export const MOVE_PART = deepFreeze<LocomotionPart<MoveConfig>>({
  role: "locomotion", label: "Move", stage: "game", defaults: GOING, keys: { kind: true, variation: true, gaits: true, rules: true, otherwise: true },
  fields: [choice<MoveConfig, "otherwise">("otherwise", "Otherwise", GAIT_CHOICES)],
  slots: [slotList("rules", "When", "move-rule")],
  children: config => Array.isArray(config.gaits) ? config.gaits.map((gait, i) => ({ path: ["gaits", i, "legs"], role: "gait", config: gait?.legs })) : [],
  // The stock gaits' legs, where it names no gaits of its own.
  supplies: config => config.gaits == null ? STOCK_GAITS.map((gait) => ({ role: "gait" as const, config: gait.legs })) : [],
  fits: (spec, config, parts) => {
    const unheld = variationFault("move", "move", VARIATIONS)(spec, config);
    if (unheld) return unheld;
    for (const gait of gaitsOf(config)) {
      const refusal = parts.of("gait", gait.legs).fits(spec, gait.legs, parts);
      if (refusal) return `${gait.name}: ${refusal}`;
    }
    return null;
  },
  faults: gaitFaults, gaits: gaitsOfMove,
  make: variedMake("move", VARIATIONS, (body, config) => [body.built.spec, config]),
  variations: Object.keys(VARIATIONS),
});

declare module "../config.ts" {
  interface LocomotionConfigs {
    readonly "move": MoveConfig;
  }
}
