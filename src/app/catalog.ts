import { isRefused } from "../core/refusal.ts";
import type { AttributeOverrides } from "../core/bodies/character-attributes.ts";
import type { Loadout } from "../core/bodies/items/held.ts";
import type { MindConfig } from "../minds/config.ts";
import { modelHoldingChecked, type BodyModel } from "../core/bodies/models.ts";
import { catalogOf, type Catalog, type EntryRule } from "../minds/catalog.ts";
import { toolkitLists } from "./toolkit.ts";
import { ENTRANTS } from "./entrants.ts";

/** **The game's catalog**: the toolkit's kinds of mind and parts, then each entrant's minds, parts and presets (`ENTRANTS`). */
export const GAME: Catalog = catalogOf(() => {
  const toolkit = toolkitLists();
  return { ...toolkit, entrants: ENTRANTS };
});

export const { controllers: CONTROLLERS, minds: MINDS, loadData, controllerOf, allParts, isKind, partOf, partLookup, treeLookup, treeFaults,
  treeScope, treeKinds, treeObeys, phaseLabels, treeData, treeRefusal, unusedParts, stageRefusal, withoutTuning, kindsFor, replacedAt } = GAME;

export { FIGHT_ENTRY, partIn, type EntryRule, type Offered } from "../minds/catalog.ts";

/** **The mind each model plays unless its fight or run says otherwise**, by preset id (`MINDS`): its Option Mind. */
const DEFAULT_MINDS: Readonly<Record<BodyModel, string>> = Object.freeze({
  "workshop-fighter": "option", "workshop-rogue": "option", "crypt-skeleton": "option", reptile: "option", rat: "option",
});

/** The mind a body of `model` plays unless its fight or run says otherwise (`DEFAULT_MINDS`). */
export const defaultMind = (model: BodyModel): MindConfig => MINDS[DEFAULT_MINDS[model]]!.config;

/**
 * **Why `mind` cannot play `model`'s body carrying `loadout`** in a scenario of entry rules
 * `entry`, a sentence, or null where it can: a body that holds nothing carries no loadout; else
 * the mind must fit the body as it holds it and meet the rules (`stageRefusal`). A mind that works
 * only with one loadout says so in a part's `fits`, and is offered with no other.
 */
export function modelRefusal(model: BodyModel, mind: MindConfig, loadout: Loadout, entry: readonly EntryRule[], attributes?: AttributeOverrides): string | null {
  const spec = modelHoldingChecked(model, loadout, attributes);
  return isRefused(spec) ? spec.refused : stageRefusal(spec, mind, entry);
}
