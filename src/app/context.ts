import { COMMANDERS } from "./registration/commanders.ts";
import type { GameContext } from "../game/arena/context.ts";
import { TECHNIQUES } from "./registration/techniques.ts";
import { GAME, defaultMind, modelRefusal } from "./catalog.ts";

/** One application composition, shared by its page, Node entry and workers. */
export const applicationContext = (build: string): GameContext => Object.freeze({ catalog: GAME, commanders: COMMANDERS, build, techniques: TECHNIQUES, defaultMind, modelRefusal });
