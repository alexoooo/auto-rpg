import { BEATS } from "../../minds/command/beats.ts";
import { CLEARER } from "../../minds/command/clearer.ts";
import { DRILL } from "../../minds/command/drill.ts";
import { INDEPENDENT } from "../../minds/command/independent.ts";
import { MOB } from "../../minds/command/mob.ts";
import { PARTY } from "../../minds/command/party.ts";
import { STAND } from "../../minds/command/stand.ts";

/**
 * **Every Commander, by its kind** (`CommanderEntry`, its defaults' `kind`), in the order a picker
 * offers them: a line here registers one.
 */
export const COMMANDERS = { mob: MOB, independent: INDEPENDENT, party: PARTY, clearer: CLEARER, drill: DRILL, stand: STAND, beats: BEATS };
