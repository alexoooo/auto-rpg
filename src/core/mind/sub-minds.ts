import type { BodyView } from "../body.ts";
import type { SubMindConfig } from "./config.ts";
import { lying } from "./lie.ts";
import type { OwnBody } from "./mind.ts";
import { stagedRise } from "./rise/staged.ts";
import { supportRecovery } from "./rise/support-recovery.ts";
import type { SubMind } from "./sub-mind.ts";
import type { World } from "../world.ts";

/**
 * What makes a sub-mind for a body: its own body, its host's view of it, read each step before the
 * sub-mind is asked anything, and the world the body is in.
 */
export type SubMindMaker = (own: OwnBody, view: BodyView, world: World) => SubMind;

/** The sub-mind `config` names. */
export function subMind(own: OwnBody, view: BodyView, config: SubMindConfig, world: World): SubMind {
  switch (config.kind) {
    case "lie": return lying(own, view);
    case "staged-rise": return stagedRise(own, view);
    case "support-recovery": return supportRecovery(own, view, world);
    default: return unknownKind(config);
  }
}

/** `configs`' sub-minds as a body takes them (`BodyOptions.subs`). */
export const subMindsOf = (configs: readonly SubMindConfig[]): readonly SubMindMaker[] =>
  configs.map((config) => (own: OwnBody, view: BodyView, world: World) => subMind(own, view, config, world));

/** A config's kind no maker knows: a compile error where the union is known, and a thrown one for a config read from a save or a link. */
function unknownKind(config: never): never {
  throw new Error(`no sub-mind of kind ${JSON.stringify((config as { kind?: unknown }).kind)}`);
}
