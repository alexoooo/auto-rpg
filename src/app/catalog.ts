import { isRefused } from "../core/refusal.ts";
import type { MindConfig } from "../minds/catalog/config.ts";
import { modelHoldingChecked, type BodyModel } from "../core/bodies/models.ts";
import type { Loadout } from "../core/bodies/items/held.ts";
import { bodyOf } from "../minds/option/predictions/value/fitted-value.ts";
import type { BodyAsked } from "../game/arena/context.ts";
import { catalogOf, type Catalog, type EntryRule } from "../minds/catalog/catalog.ts";
import { toolkitLists } from "./toolkit.ts";
import { ENTRANTS } from "./entrants.ts";

/** **The game's catalog**: the toolkit's kinds of mind and parts, then each entrant's minds, parts and presets (`ENTRANTS`). */
export const GAME: Catalog = catalogOf(() => {
  const toolkit = toolkitLists();
  return { ...toolkit, entrants: ENTRANTS };
});

export const { controllers: CONTROLLERS, minds: MINDS, loadData, controllerOf, allParts, isKind, skillsFor, partOf, partLookup, treeLookup, treeFaults,
  treeObeys, treeData, kindsFor, replacedAt } = GAME;

export { FIGHT_ENTRY, type EntryRule, type Offered } from "../minds/catalog/catalog.ts";

/**
 * **The mind each model plays unless its fight or run says otherwise**, by preset id (`MINDS`): the
 * Option Mind on the tail's leaf. The rat plays the Mind that presses its attack (`option-presses`),
 * which values the Warrior's life five times its own and a blow sooner more than one later, so it
 * goes back in to bite him where the tail's Mind waits at the edge of his reach.
 */
const DEFAULT_MINDS: Readonly<Record<BodyModel, string>> = Object.freeze({
  man: "option-tail", woman: "option-tail", skeleton: "option-tail", reptile: "option-tail", rat: "option-presses",
});

/**
 * **The mind a body plays where it is not its model's**, by the body's name (`bodyOf`): the
 * empty-handed man plays the Option Mind with its own body priced truer, deciding ten times a
 * second with no reply searched (`option-lean`), measured on him.
 */
const DEFAULT_BODIES: Readonly<Record<string, string>> = Object.freeze({ man: "option-lean" });

/** **The game's own minds**, by preset id: those some body plays unless its fight or run says otherwise, the few the Arena's menu lists. */
export const GAME_MINDS: ReadonlySet<string> = new Set([...Object.values(DEFAULT_MINDS), ...Object.values(DEFAULT_BODIES)]);

/**
 * The mind a body of `model` holding `loadout` plays unless its fight or run says otherwise: its
 * body's (`DEFAULT_BODIES`), else its model's (`DEFAULT_MINDS`).
 */
export function defaultMind(model: BodyModel, loadout: Loadout): MindConfig {
  const spec = modelHoldingChecked(model, loadout), body = isRefused(spec) ? null : bodyOf(spec);
  return MINDS[body !== null && Object.hasOwn(DEFAULT_BODIES, body) ? DEFAULT_BODIES[body]! : DEFAULT_MINDS[model]]!.config;
}

/**
 * **Why `mind` cannot play the body `body` asks** (`BodyAsked`) in a scenario of entry rules
 * `entry`, a sentence, or null where it can: a body that holds nothing carries no loadout; else
 * the mind must fit the body as it holds it and meet the rules (`stageRefusal`). A mind that works
 * only with one loadout says so in a part's `fits`, and is offered with no other.
 */
export function modelRefusal({ model, loadout, attributes, skills }: BodyAsked, mind: MindConfig, entry: readonly EntryRule[]): string | null {
  const spec = modelHoldingChecked(model, loadout, attributes, skills);
  return isRefused(spec) ? spec.refused : GAME.stageRefusal(spec, mind, entry);
}
