import type { CommanderRegistry } from "../../minds/command/commander.ts";
import type { AttributeOverrides } from "../../core/bodies/character-attributes.ts";
import type { Loadout } from "../../core/bodies/items/held.ts";
import type { MindConfig } from "../../minds/catalog/config.ts";
import type { BodyModel } from "../../core/bodies/models.ts";
import type { Catalog, EntryRule } from "../../minds/catalog/catalog.ts";
import type { TechniquePart } from "../../skills/recovery/shared/technique.ts";
import type { BodySpec, SkillChoices } from "../../core/bodies/spec/body.ts";

/** **A body as a mind is asked to play it**: its model, what it carries, and its character's attributes and skills where they are not its model's own. */
export interface BodyAsked {
  readonly model: BodyModel;
  readonly loadout: Loadout;
  readonly attributes?: AttributeOverrides;
  readonly skills?: SkillChoices;
}

/** The immutable application choices supplied to gameplay and evaluation. */
export interface GameContext {
  readonly catalog: Catalog;
  readonly commanders: CommanderRegistry;
  readonly build: string;
  readonly techniques: Readonly<Record<string, TechniquePart>>;
  defaultMind(model: BodyModel): MindConfig;
  modelRefusal(body: BodyAsked, mind: MindConfig, entry: readonly EntryRule[]): string | null;
}

/** `make` made once a context: whoever asks with the same context is handed the same thing. */
export function perContext<T>(make: (context: GameContext) => T): (context: GameContext) => T {
  const made = new WeakMap<GameContext, T>();
  return (context) => {
    if (!made.has(context)) made.set(context, make(context));
    return made.get(context) as T;
  };
}

/** Why a mind cannot run on this body or satisfy the scenario's entry rules. */
function mindFaults(context: GameContext, config: MindConfig, spec: BodySpec, { entry = [] }: { readonly entry?: readonly EntryRule[] } = {}): readonly string[] {
  const faults = context.catalog.treeFaults(config);
  if (faults.length > 0) return faults;
  const refused = context.catalog.stageRefusal(spec, config, entry);
  return refused === null ? faults : [`the mind cannot play this body: ${refused}`];
}

/**
 * `mindFaults` for a context, each answer kept by the mind's config, the body's spec and the entry
 * rules: a list of cases asks the same mind of the same body once a condition. For callers whose
 * configs and specs are never changed in place.
 */
export const mindFaultsOf = perContext((context) => {
  const kept = new WeakMap<MindConfig, WeakMap<BodySpec, Map<string, readonly string[]>>>();
  return (config: MindConfig, spec: BodySpec, { entry = [] }: { readonly entry?: readonly EntryRule[] } = {}): readonly string[] => {
    if (typeof config !== "object" || config === null) return mindFaults(context, config, spec, { entry });
    let bySpec = kept.get(config);
    if (!bySpec) kept.set(config, bySpec = new WeakMap());
    let byEntry = bySpec.get(spec);
    if (!byEntry) bySpec.set(spec, byEntry = new Map());
    const rules = entry.join(" ");
    let faults = byEntry.get(rules);
    if (!faults) byEntry.set(rules, faults = mindFaults(context, config, spec, { entry }));
    return faults;
  };
});
