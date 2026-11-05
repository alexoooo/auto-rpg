import type { CommanderRegistry } from "../../minds/command/commander.ts";
import type { AttributeOverrides } from "../../core/bodies/character-attributes.ts";
import type { Loadout } from "../../core/bodies/items/held.ts";
import type { MindConfig } from "../../minds/config.ts";
import type { BodyModel } from "../../core/bodies/models.ts";
import type { Catalog, EntryRule } from "../../minds/catalog.ts";
import type { TechniquePart } from "../../skills/recovery/technique.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";

/** The immutable application choices supplied to gameplay and evaluation. */
export interface GameContext {
  readonly catalog: Catalog;
  readonly commanders: CommanderRegistry;
  readonly build: string;
  readonly techniques: Readonly<Record<string, TechniquePart>>;
  defaultMind(model: BodyModel): MindConfig;
  modelRefusal(model: BodyModel, mind: MindConfig, loadout: Loadout, entry: readonly EntryRule[], attributes?: AttributeOverrides): string | null;
}

/** Why a mind cannot run on this body or satisfy the scenario's entry rules. */
export function mindFaults(context: GameContext, config: MindConfig, spec: BodySpec, { entry = [] }: { readonly entry?: readonly EntryRule[] } = {}): readonly string[] {
  const faults = context.catalog.treeFaults(config);
  if (faults.length > 0) return faults;
  const refused = context.catalog.stageRefusal(spec, config, entry);
  return refused === null ? faults : [`the mind cannot play this body: ${refused}`];
}
