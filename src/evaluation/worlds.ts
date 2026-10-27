import { BOUT_WORLD } from "./bout.ts";
import { CRYPT_WORLD } from "./crypt.ts";
import { FALL_WORLD } from "./fall.ts";
import { LONE_WORLD } from "./lone.ts";
import { TECHNIQUE_WORLD } from "./technique.ts";

/**
 * **Every kind of case world** (`WorldKind`), by its `CaseWorld` kind, which `playCase` (`play.ts`)
 * builds and steps a case's world with. This module holds its imports and this table and nothing else: a
 * case's code reads it as where its world kind's own code begins (`caseCoder`,
 * `scripts/build-identity.mjs`).
 */
export const WORLD_BUILDERS = { bout: BOUT_WORLD, fall: FALL_WORLD, crypt: CRYPT_WORLD, lone: LONE_WORLD, technique: TECHNIQUE_WORLD };
