import { CONDITIONS } from "../mind/conditions.ts";
import { MOVE } from "../mind/config.ts";
import { choice, type PartField } from "../mind/fields.ts";
import type { LocomotionPart } from "../mind/locomotion-part.ts";
import { anyBody, slotList, takesCommands, type Part, type PartConfig } from "../mind/parts.ts";
import { deepFreeze } from "../state.ts";
import { GAIT_NAMES, GAITS, type GaitName } from "./gaits.ts";
import type { Locomotion } from "./locomotion.ts";
import { distanceRule, move, standingRule, type MoveGait, type MoveRule } from "./move.ts";

/** A rule of Move: while the body is asked to stand, `gait`. */
interface WhenStandingConfig { readonly kind: "when-standing"; readonly gait: GaitName }

/**
 * A rule of Move: while what `of` names is `than` `metres` away, `gait`: the nearest standing
 * foe, where the body's walk is taking it (`Intent.destination`), or the nearest standing body of
 * its own side. Where there is none, it is infinitely far.
 */
interface WhenDistanceConfig {
  readonly kind: "when-distance";
  readonly of: "foe" | "destination" | "ally";
  readonly than: "under" | "over";
  readonly metres: number;
  readonly gait: GaitName;
}

/** **A rule of Move's config**, by kind: when it chooses its gait. */
export type MoveRuleConfig = WhenStandingConfig | WhenDistanceConfig;

/**
 * **Move** (`move`, `skills/move.ts`): the gait (`GAITS`) of the first of `rules` that holds, or
 * `otherwise`'s.
 */
export interface MoveConfig {
  readonly kind: "move";
  readonly rules: readonly MoveRuleConfig[];
  readonly otherwise: GaitName;
}

/** Whether `name` is a gait's (`GAITS`): a config read from a save or a link may name any. */
const isGait = (name: string): name is GaitName => Object.hasOwn(GAITS, name);

/** The gaits as a choice offers them. */
const GAIT_CHOICES = GAIT_NAMES.map((name): [GaitName, string] => [name, GAITS[name].stage === "experimental" ? `${GAITS[name].label} (experimental)` : GAITS[name].label]);

/** A rule part of Move: a gait it chooses, and what is wrong with a config of it. */
const rule = <C extends MoveRuleConfig>(label: string, defaults: C, fields: readonly PartField<C>[], faults: (config: C) => readonly string[] = () => []): Part<C> =>
  ({ role: "move-rule", label, stage: "game", fields: [...fields, choice<C, "gait">("gait", "Gait", GAIT_CHOICES)], slots: [], defaults, fits: anyBody,
    faults: (config) => [...faults(config), ...isGait(config.gait) ? [] : [`no gait called ${JSON.stringify(config.gait)}`]] });

/** Shared condition fields retain the movement rule's selected gait when edited. */
const withGait = <C>(fields: readonly PartField<C>[]): readonly PartField<C & { readonly gait: GaitName }>[] => fields.map(field => ({ ...field,
  write(config: C & { readonly gait: GaitName }, value: string) {
    const updated = field.write(config, value);
    return updated ? { ...config, ...updated } : null;
  } }));

/** **Every rule of Move, by its kind** (`Part`): what Move's rule list holds. */
export const MOVE_RULE_PARTS: { readonly [K in MoveRuleConfig["kind"]]: Part<Extract<MoveRuleConfig, { kind: K }>> } = deepFreeze({
  "when-standing": rule<WhenStandingConfig>("While standing", { kind: "when-standing", gait: "braced" }, withGait(CONDITIONS["when-standing"].fields)),
  "when-distance": rule<WhenDistanceConfig>("While a distance", { kind: "when-distance", of: "foe", than: "under", metres: 5, gait: "braced" }, withGait(CONDITIONS["when-distance"].fields),
    (config) => Number.isFinite(config.metres) && config.metres > 0 ? [] : ["a rule's distance must be finite and positive"]),
});

/** The gaits `config` walks by, each once, in the order its rules and then `otherwise` name them. */
const gaitsOf = (config: MoveConfig): readonly GaitName[] => [...new Set([...config.rules.map((r) => r.gait), config.otherwise])];

/** The rule `config` makes, choosing the `gait`th of its Move's gaits. */
function moveRule(config: MoveRuleConfig, gait: number): MoveRule {
  switch (config.kind) {
    case "when-standing": return standingRule(gait);
    case "when-distance": return distanceRule(gait, config.of, config.than, config.metres);
    default: { const never: never = config; throw new Error(`no rule of kind ${JSON.stringify((never as { kind?: unknown }).kind)}`); }
  }
}

/**
 * **Move** (`move`): the legs of the gait it goes by, so it holds that gait's envelope and stops at
 * its stopping. Its gaits are made once each, those whose legs differ only in whether they may run
 * sharing one walk (`MoveGait`).
 */
export const MOVE_PART: LocomotionPart<MoveConfig> = deepFreeze({
  role: "locomotion", label: "Move", stage: "game", defaults: MOVE, keys: { kind: true, rules: true, otherwise: true },
  fields: [choice<MoveConfig, "otherwise">("otherwise", "Otherwise", GAIT_CHOICES)],
  slots: [slotList("rules", "When", "move-rule")], fits: takesCommands,
  faults: (config) => isGait(config.otherwise) ? [] : [`move: no gait called ${JSON.stringify(config.otherwise)}`],
  make(body, config, legs) {
    const names = gaitsOf(config), built = new Map<string, Locomotion>();
    const gaits = names.map((name): MoveGait => {
      const of: PartConfig = GAITS[name].legs, runs = legs.runs(of);
      const key = JSON.stringify(runs === undefined ? of : { ...of, runs: undefined });
      if (!built.has(key)) built.set(key, legs.make(body, of));
      return { legs: built.get(key)!, ...(runs === undefined ? {} : { runs }) };
    });
    return move(gaits, config.rules.map((r) => moveRule(r, names.indexOf(r.gait))), names.indexOf(config.otherwise));
  },
});
