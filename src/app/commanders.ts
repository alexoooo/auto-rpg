import { COMMANDERS } from "./registration/commanders.ts";
import { commanderOf as lookupCommander } from "../minds/command/commander.ts";

export { COMMANDERS };
/** The application menus use the same registered Commander entries as each game's context. */
export const commanderOf = (kind: string) => lookupCommander(COMMANDERS, kind);
