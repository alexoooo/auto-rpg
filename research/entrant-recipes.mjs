import { ENTRANTS } from "../src/app/entrants.ts";
import { modelRefusal } from "../src/app/catalog.ts";
import { BODY_MODELS } from "../src/core/bodies/models.ts";
import { LOADOUTS } from "../src/core/bodies/items/held.ts";

/** Every manifest, including hidden presets, on a compatible body, bare hands preferred. */
export function entrantRecipes() {
  return ENTRANTS.map((entrant) => {
    const candidates = [...Object.values(entrant.presets).map((preset) => preset.config), ...(entrant.minds ?? []).map((mind) => mind.defaults)];
    for (const config of candidates) {
      for (const loadout of LOADOUTS) {
        const model = BODY_MODELS.find((body) => modelRefusal(body, config, loadout, []) === null);
        if (model) return { name: `entrant ${entrant.name}`, recipe: { left: model, right: model, entry: [], loadouts: { left: loadout, right: loadout }, minds: { left: config, right: config } } };
      }
    }
    throw new Error(`entrant ${entrant.name} has no preset or mind default compatible with a body and loadout`);
  });
}
