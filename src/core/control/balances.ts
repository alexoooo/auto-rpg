import { STANCE_BALANCE } from "./stance-balance.ts";

/**
 * **Every kind of balance, by its kind** (`BalancePart`), in the order a picker offers them: what a
 * motor's `balance` slot holds, a line here registering one. This module holds its imports and this
 * list and nothing else: a case's code reads it as where each kind's own code begins (`caseCoder`,
 * `scripts/build-identity.mjs`).
 */
export const BALANCES = { stance: STANCE_BALANCE };
