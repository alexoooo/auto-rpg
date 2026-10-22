import { CLEARER } from "./clearer.ts";
import { INDEPENDENT } from "./independent.ts";
import { MOB } from "./mob.ts";
import { PARTY } from "./party.ts";

/**
 * **Every Commander, by its kind** (`CommanderEntry`, its defaults' `kind`), in the order a picker
 * offers them: a line here registers one. This module holds its imports and this list and nothing
 * else: a case's code reads it as where each kind's own code begins (`caseCoder`,
 * `scripts/build-identity.mjs`).
 */
export const COMMANDERS = { mob: MOB, independent: INDEPENDENT, party: PARTY, clearer: CLEARER };
