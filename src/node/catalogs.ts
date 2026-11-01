import type { Catalog } from "../core/parts/catalog.ts";
import { TOOLKIT_CATALOG } from "../core/toolkit.ts";
import { GAME } from "../entrants/game.ts";

/** **The catalogs a mind apart is made from**, by name, the same in the world's thread and in each mind's: the game's (`GAME`) and the toolkit's (`TOOLKIT_CATALOG`). */
export const MIND_CATALOGS: Readonly<Record<string, Catalog>> = Object.freeze({ game: GAME, toolkit: TOOLKIT_CATALOG });
