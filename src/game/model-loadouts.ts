import type { BodyModel } from "../core/bodies/models.ts";
import { LOADOUTS, type Held, type Loadout } from "../core/bodies/items/held.ts";

/** Default equipment selected by the game's model roster. */
const EQUIPMENT: Readonly<Record<BodyModel, Held>> = Object.freeze({
  "workshop-fighter": "sword", "workshop-rogue": "sword", "crypt-skeleton": "sword", reptile: "empty", rat: "empty",
});

/** The game's equipment choice where a setup supplies none. */
export const modelInfo = (model: BodyModel): { readonly held: Held } => ({ held: EQUIPMENT[model] });

/** Both hands under the game's default equipment choice. */
export const modelLoadout = (model: BodyModel): Loadout => LOADOUTS.find((loadout) => loadout.left === "empty" && loadout.right === EQUIPMENT[model])!;
