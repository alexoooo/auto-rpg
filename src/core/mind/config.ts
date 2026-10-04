import type { Covering } from "../skills/guard.ts";
import { deepFreeze } from "../state.ts";
import type { Threat } from "./threat.ts";

/** Lie still while down: ask the muscles for nothing (`lying`, `lie.ts`). */
interface LieConfig { readonly kind: "lie" }

/** Rise by stages (`stagedRise`, `rise/staged.ts`): the recipe is the game's (`RISE`). */
interface StagedRiseConfig { readonly kind: "staged-rise" }

/** **A sub-mind's config**, by kind: what a host's slot holds, whole, so a sub-mind is configured where it is chosen. */
export type SubMindConfig = LieConfig | StagedRiseConfig;

/** **The fighter**: tactics over skills over the command layers (`createMind`, `minds.ts`). */
export interface FighterMindConfig {
  readonly kind: "fighter";
  /** The sub-minds it hands its body to, in rank order: the first that wants the body has it. */
  readonly subs: readonly SubMindConfig[];
  /** How a hand that does not attack guards: the pose, or a cover of what threatens (`threatOf`, `threat.ts`). */
  readonly guard: "pose" | "cover";
  /** An experiment's cover in place of the one set (`GUARD_COVER`): a sweep's cell. */
  readonly covering?: Covering;
  /** An experiment's threat in place of the one set (`THREAT`): a sweep's cell. */
  readonly threat?: Threat;
  /** What of a foe a fighter attacks: its head; or, of its head and upper trunk, the one its hand's recipe nets more on (`seekFoe`, `fighter.ts`). */
  readonly aim: "head" | "pays";
  /**
   * How near a foe a fighter comes to attack it: walking in to `ATTACK_METRES`; or held at the
   * edge of the foe's reach, attacking when the foe stands in its own blow's window (`seekFoe`, `EDGE`).
   */
  readonly range: "close" | "edge";
  /** An experiment's edge in place of the one set (`EDGE`): a sweep's cell. */
  readonly edge?: { readonly band: number; readonly patience: number };
}

/**
 * **A mind's config**, by kind: plain data, so it rides in a recipe, a save and a link. Each kind
 * of mind declares its own; a fight passes one through and reads nothing in it.
 */
export type MindConfig = FighterMindConfig;

/** The mind every body has unless its fight says otherwise. */
export const FIGHTER: FighterMindConfig = deepFreeze({ kind: "fighter", subs: [{ kind: "lie" }], guard: "pose", aim: "head", range: "close" });
