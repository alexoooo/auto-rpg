import type { AttributeOverrides } from "../core/character-attributes.ts";
import type { Loadout } from "../core/items/held.ts";
import type { MindConfig } from "../core/mind/config.ts";
import { modelHolding, modelHolds, type BodyModel } from "../core/models.ts";
import { catalogOf, type Catalog, type EntryRule } from "../core/parts/catalog.ts";
import { toolkitLists } from "../core/toolkit.ts";
import { ENTRANTS } from "./index.ts";

/** **The game's catalog**: the toolkit's kinds of mind and parts, then each entrant's minds, parts and presets (`ENTRANTS`). */
export const GAME: Catalog = catalogOf(() => {
  const toolkit = toolkitLists();
  return { ...toolkit, entrants: ENTRANTS };
});

export const { controllers: CONTROLLERS, minds: MINDS, controllerOf, allParts, isKind, partOf, scriptedBy, takesScript, partLookup, treeLookup, treeFaults,
  treeScope, treeKinds, treeObeys, phaseLabels, treeData, treeRefusal, stageRefusal, withoutTuning, kindsFor, replacedAt } = GAME;

export { FIGHT_ENTRY, partIn, type EntryRule, type Offered } from "../core/parts/catalog.ts";

/** **The mind each model plays unless a fight says otherwise**, by preset id (`MINDS`). */
const DEFAULT_MINDS: Readonly<Record<BodyModel, string>> = Object.freeze({
  "workshop-fighter": "duellist", "workshop-rogue": "duellist", "crypt-skeleton": "duellist", reptile: "crawl",
});

/** The mind a body of `model` plays unless its fight says otherwise (`DEFAULT_MINDS`). */
export const defaultMind = (model: BodyModel): MindConfig => MINDS[DEFAULT_MINDS[model]]!.config;

/**
 * **Why `mind` cannot play `model`'s body carrying `loadout`** in a scenario of entry rules
 * `entry`, a sentence, or null where it can: a body that holds nothing carries no loadout; else
 * the mind must fit the body as it holds it and meet the rules (`stageRefusal`). A mind that works
 * only with one loadout says so in a part's `fits`, and is offered with no other.
 */
export function modelRefusal(model: BodyModel, mind: MindConfig, loadout: Loadout, entry: readonly EntryRule[], attributes?: AttributeOverrides): string | null {
  if (![loadout.left, loadout.right].every((item) => item === "empty") && !modelHolds(model)) return `${model} holds nothing`;
  return stageRefusal(modelHolding(model, loadout, attributes), mind, entry);
}
