import { buildBout } from "./bout.ts";
import { buildCrypt } from "./crypt.ts";
import { buildFall } from "./fall.ts";

/**
 * **Every kind of case world's builder**, by its `CaseWorld` kind, which `playCase` (`play.ts`)
 * builds a case's world with. This module holds its imports and this table and nothing else: a
 * case's code reads it as where its world kind's own code begins (`caseCoder`,
 * `scripts/build-identity.mjs`).
 */
export const WORLD_BUILDERS = { bout: buildBout, fall: buildFall, crypt: buildCrypt };
