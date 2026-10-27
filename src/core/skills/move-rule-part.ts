import { choice, type PartField } from "../mind/fields.ts";
import { anyBody, type KeysOf, type Part, type PartConfig } from "../mind/parts.ts";
import { GAIT_NAMES, GAITS, type GaitName } from "./gaits.ts";
import type { MoveRule } from "./move.ts";

/** Whether `name` is a gait's (`GAITS`): a config read from a save or a link may name any. */
export const isGait = (name: string): name is GaitName => Object.hasOwn(GAITS, name);

/** The gaits as a choice offers them. */
export const GAIT_CHOICES = GAIT_NAMES.map((name): [GaitName, string] => [name, GAITS[name].label]);

/** A rule of Move's config: when it holds, and the gait it chooses then. */
export interface RuleConfig extends PartConfig { readonly gait: GaitName }

/**
 * **A kind of Move rule** (`move`, `skills/move.ts`): a part of role `move-rule` that owns its
 * config's type, keys and faults, and makes the rule that chooses the `gait`th of its Move's gaits.
 */
export interface MoveRulePart<C extends RuleConfig = RuleConfig> extends Part<C> {
  readonly role: "move-rule";
  readonly keys: KeysOf<C>;
  make(config: C, gait: number): MoveRule;
}

/** Condition fields that keep the rule's gait when a person edits them. */
export const withGait = <C>(fields: readonly PartField<C>[]): readonly PartField<C & { readonly gait: GaitName }>[] => fields.map(field => ({ ...field,
  write(config: C & { readonly gait: GaitName }, value: string) {
    const updated = field.write(config, value);
    return updated ? { ...config, ...updated } : null;
  } }));

/** A Move rule's part: its own fields and the gait's choice, its own faults and a gait no gait has, for every body. */
export const moveRulePart = <C extends RuleConfig>(rule: Omit<MoveRulePart<C>, "role" | "stage" | "slots" | "fits">): MoveRulePart<C> => ({
  ...rule, role: "move-rule", stage: "game", slots: [], fits: anyBody, fields: [...rule.fields, choice<C, "gait">("gait", "Gait", GAIT_CHOICES)],
  faults: (config, parts) => [...rule.faults(config, parts), ...isGait(config.gait) ? [] : [`no gait called ${JSON.stringify(config.gait)}`]],
});
