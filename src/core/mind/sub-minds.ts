import { commandable, type BodyView } from "../body.ts";
import { deepFreeze } from "../state.ts";
import type { SubMindConfig } from "./config.ts";
import { lying } from "./lie.ts";
import type { OwnBody } from "./mind.ts";
import { stagedRise } from "./rise/staged.ts";
import { supportRecovery } from "./rise/support-recovery.ts";
import type { Part } from "./parts.ts";
import type { SubMind } from "./sub-mind.ts";
import type { World } from "../world.ts";

/**
 * What makes a sub-mind for a body: its own body, its host's view of it, read each step before the
 * sub-mind is asked anything, and the world the body is in.
 */
export type SubMindMaker = (own: OwnBody, view: BodyView, world: World) => SubMind;

/** A sub-mind of no settings and no slots: what it is called, and which bodies it fits. */
const plain = <K extends SubMindConfig["kind"]>(kind: K, label: string, fits: Part["fits"]): Part<Extract<SubMindConfig, { kind: K }>> =>
  deepFreeze({ role: "sub-mind", label, stage: "game", fields: [], slots: [], defaults: { kind } as Extract<SubMindConfig, { kind: K }>, fits, faults: () => [] });

/**
 * **Every sub-mind, by its kind** (`Part`): what a host's slot may hold. Lying still fits any body;
 * a rise is the human's recipe (`RISE`), for a body that takes the commands it gives.
 */
export const SUB_MIND_PARTS: { readonly [K in SubMindConfig["kind"]]: Part<Extract<SubMindConfig, { kind: K }>> } = Object.freeze({
  lie: plain("lie", "Lie still", () => true),
  "staged-rise": plain("staged-rise", "Rise by stages", (spec) => commandable(spec)),
  "support-recovery": plain("support-recovery", "Rise, then steady", (spec) => commandable(spec)),
});

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
