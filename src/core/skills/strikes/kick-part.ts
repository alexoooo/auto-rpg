import meta from "../../../../assets/core/front-kick.meta.json" with { type: "json" };
import { deepFreeze } from "../../state.ts";
import { kickPart } from "./kick-records.ts";

/** **The front kick**, its settings each body's (`assets/core/front-kick.json`). */
export const KICK_PART = kickPart("front-kick", "Front kick", deepFreeze(meta.bodies));
