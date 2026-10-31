import meta from "../../../../assets/core/stomp.meta.json" with { type: "json" };
import { deepFreeze } from "../../state.ts";
import { kickPart } from "./kick-records.ts";

/**
 * **The stomp**: the front kick's executor, its stroke down from a high chamber on a body lying
 * ahead, its settings each body's (`assets/core/stomp.json`; the Warrior's,
 * [stomp settings](../../../../docs/reference/front-kicks.md#stomp-settings)).
 */
export const STOMP_PART = kickPart("stomp", "Stomp", deepFreeze(meta.bodies));
