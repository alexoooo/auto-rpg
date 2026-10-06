import type { AttackTuning } from "../skills/attack-path.ts";
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
export type MindConfig = FighterMindConfig | PointFighterConfig | ArenaFighterConfig | DirectMindConfig;

/** Point-space combat over the shared stance and muscle controller. */
export interface PointFighterConfig {
  readonly kind: "point-fighter";
  readonly hand: "left" | "right" | "alternate";
  /** Reference comparison or range-aware engagement; tracked engagement is the default. */
  readonly engagement?: "reference" | "tracked";
  /** Immutable experimental placement, entry-band and target-prediction settings. */
  readonly engagementTuning?: { readonly spacing?: number; readonly entry?: number; readonly prediction?: number };
}

/** Experimental point combat; the right hand can carry the arena club. */
export const POINT_FIGHTER: PointFighterConfig = deepFreeze({ kind: "point-fighter", hand: "right" });

/** Joint-feedback experiment: targets in radians and explicit time, speed and activation bounds. */
export interface DirectMindConfig {
  readonly kind: "direct";
  readonly targets: Readonly<Record<string, number>>;
  readonly seconds: number;
  readonly speed: number;
  readonly activation: number;
}

/** The mind every body has unless its fight says otherwise. */
export const FIGHTER: FighterMindConfig = deepFreeze({ kind: "fighter", subs: [{ kind: "lie" }], guard: "pose", aim: "head", range: "close" });

/** Tactical combat over the same physical body and reusable trajectory executor. */
export interface ArenaFighterConfig {
  readonly kind: "arena-fighter";
  readonly hand: "left" | "right" | "alternate";
  readonly defense?: boolean;
  /** Reference cover or measured relative-motion prediction; omitted retains the reference. */
  readonly defenseMode?: "reference" | "predictive";
  /** Target selection variant, retained for reproducible opponents and ablations. */
  readonly targeting?: "head" | "openings";
  readonly paths?: Partial<AttackTuning>;
  readonly spacing?: number;
}

/** Experimental autonomous combat; promotion is measured by the paired combat harness. */
export const ARENA_FIGHTER: ArenaFighterConfig = deepFreeze({ kind: "arena-fighter", hand: "alternate", targeting: "openings" });
