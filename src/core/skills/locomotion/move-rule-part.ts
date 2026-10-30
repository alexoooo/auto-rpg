import { choice, type PartField } from "../../parts/fields.ts";
import { anyBody, type KeysOf, type Part, type PartConfig } from "../../parts/parts.ts";
import { STOCK_GAITS, type GaitName } from "./gaits.ts";
import type { MoveRule } from "./move.ts";

/** The stock gaits (`STOCK_GAITS`) as a choice offers them; a gait a config adds is named in its config. */
export const GAIT_CHOICES = STOCK_GAITS.map((gait): [GaitName, string] => [gait.name, gait.label]);

/** A rule of Move's config: when it holds, and the gait it chooses then. */
interface RuleConfig extends PartConfig { readonly gait: GaitName }

/**
 * **A kind of Move rule** (`move`, `skills/locomotion/move.ts`): a part of role `move-rule` that owns its
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

/** A Move rule's part: its own fields and the gait's choice, and its own faults (its Move says a gait it has not), for every body. */
export const moveRulePart = <C extends RuleConfig>(rule: Omit<MoveRulePart<C>, "role" | "stage" | "slots" | "fits">): MoveRulePart<C> => ({
  ...rule, role: "move-rule", stage: "game", slots: [], fits: anyBody, fields: [...rule.fields, choice<C, "gait">("gait", "Gait", GAIT_CHOICES)],
});
