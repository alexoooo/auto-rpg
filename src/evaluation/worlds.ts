import { boutWorld } from "./bout.ts";
import { fallWorld } from "./fall.ts";
import { cryptWorld } from "./crypt.ts";
import { loneWorld } from "./lone.ts";
import { techniqueWorld } from "./technique.ts";

/** Each case-world kind's factory, beside the builder it owns. */
export const WORLD_FACTORIES = { bout: boutWorld, fall: fallWorld, crypt: cryptWorld, lone: loneWorld, technique: techniqueWorld };
