import { deepFreeze } from "../state.ts";

/** Lie still while down: ask the muscles for nothing (`lying`, `lie.ts`). */
interface LieConfig { readonly kind: "lie" }

/** **A sub-mind's config**, by kind: what a host's slot holds, whole, so a sub-mind is configured where it is chosen. */
export type SubMindConfig = LieConfig;

/** **The fighter**: tactics over skills over the command layers (`createMind`, `minds.ts`). */
export interface FighterMindConfig {
  readonly kind: "fighter";
  /** The sub-minds it hands its body to, in rank order: the first that wants the body has it. */
  readonly subs: readonly SubMindConfig[];
}

/**
 * **A mind's config**, by kind: plain data, so it rides in a recipe, a save and a link. Each kind
 * of mind declares its own; a fight passes one through and reads nothing in it.
 */
export type MindConfig = FighterMindConfig;

/** The mind every body has unless its fight says otherwise. */
export const FIGHTER: FighterMindConfig = deepFreeze({ kind: "fighter", subs: [{ kind: "lie" }] });
