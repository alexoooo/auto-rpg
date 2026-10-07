import { KICK_PATH, type KickTuning } from "../skills/kick.ts";
import type { AttackTuning } from "../skills/attack-path.ts";
import type { CombatExecution } from "../skills/combat.ts";
import type { TurnStartup } from "../skills/locomotion.ts";
import type { OpeningTuning } from "./openings.ts";
import type { Covering } from "../skills/guard.ts";
import { deepFreeze } from "../state.ts";
import type { Threat } from "./threat.ts";

/** Lie still while down: ask the muscles for nothing (`lying`, `lie.ts`). */
interface LieConfig { readonly kind: "lie" }

/** Rise by stages (`stagedRise`, `rise/staged.ts`): the recipe is the game's (`RISE`). */
interface StagedRiseConfig { readonly kind: "staged-rise" }

/** Rise by stages, then stand quiet on loaded feet before giving the body back (`supportRecovery`, `rise/support-recovery.ts`). */
interface SupportRecoveryConfig { readonly kind: "support-recovery" }

/** **A sub-mind's config**, by kind: what a host's slot holds, whole, so a sub-mind is configured where it is chosen. */
export type SubMindConfig = LieConfig | StagedRiseConfig | SupportRecoveryConfig;

/**
 * **The recipe fighter**: the searched recipe blows (`skills/strike.ts`) under tactics that seek
 * the foe (`seekFoe`), over the command layers (`recipe-fighter.ts`).
 */
export interface RecipeFighterConfig {
  readonly kind: "recipe-fighter";
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
export type MindConfig = RecipeFighterConfig | PathFighterConfig | DirectMindConfig | QuadrupedConfig;

/** Four-paw crawling, physical jaw snaps and self-righting through the body's own muscles. */
interface QuadrupedConfig { readonly kind: "quadruped" }

export const QUADRUPED: QuadrupedConfig = deepFreeze({ kind: "quadruped" });

/** Joint-feedback experiment: targets in radians and explicit time, speed and activation bounds. */
export interface DirectMindConfig {
  readonly kind: "direct";
  readonly targets: Readonly<Record<string, number>>;
  readonly seconds: number;
  readonly speed: number;
  readonly activation: number;
}

/** The mind every body has unless its fight says otherwise. */
export const FIGHTER: RecipeFighterConfig = deepFreeze({ kind: "recipe-fighter", subs: [{ kind: "lie" }], guard: "pose", aim: "head", range: "close" });

/**
 * **The path fighter**: hand paths chosen against the foe's surfaces and carried out on the
 * strike cycle (`skills/combat.ts`), over the command layers (`path-fighter.ts`).
 */
export interface PathFighterConfig {
  readonly kind: "path-fighter";
  /** The sub-minds it hands its body to, in rank order: the first that wants the body has it. */
  readonly subs: readonly SubMindConfig[];
  readonly hand: "left" | "right" | "alternate";
  /** Reference cover or measured relative-motion prediction; omitted retains the reference. */
  readonly defenseMode?: "reference" | "predictive";
  /** Linear reference, straight/close-hook ranking, or additional measured top-surface overhands. */
  readonly repertoire?: "linear" | "mixed" | "vertical" | "boxing";
  readonly openings?: OpeningTuning;
  readonly paths?: Partial<AttackTuning>;
  readonly execution?: CombatExecution;
  /** Optional either-foot skill, shared by research policies and Arena tactics. */
  readonly kicks?: KickTuning;
  readonly spacing?: number;
  /** Optional reduction of extra spacing after a clean verified miss, m: `docs/reference/combat-range-learning.md`. */
  readonly spacingStep?: number;
  /** Optional heading-speed ceiling, rad/s: `docs/reference/combat-locomotion.md`. */
  readonly turnLimit?: number;
  /** Optional brief heading-speed ceiling while setting off: `docs/reference/combat-turn-startup.md`. */
  readonly turnStartup?: TurnStartup;
  /** One opposite-hand follow-up after a target hit and verified return, with fresh lane and footing checks. */
  readonly combinations?: boolean;
  /** Allow the other hand's follow-up while a contact-free hand moves home; each return is still verified. */
  readonly overlap?: boolean;
  /** Enable observed low-opponent approach and supported strikes; omitted preserves the retained reference. */
  readonly groundGame?: boolean;
}

/** Experimental autonomous combat; promotion is measured by the paired combat harness. */
export const ARENA_FIGHTER: PathFighterConfig = deepFreeze({ kind: "path-fighter", subs: [{ kind: "support-recovery" }], hand: "alternate" });

/** Body-targeting candidate and scope: `docs/reference/arena-combat-evaluation.md#body-targeting-held-out-evaluation`. */
export const ARENA_BRAWLER: PathFighterConfig = deepFreeze({ kind: "path-fighter", subs: [{ kind: "support-recovery" }], hand: "alternate",
  repertoire: "mixed", openings: { head: .3, upperTrunk: 0, middleTrunk: 0 } });

/** Playable grounded profile with both-hand low gates: `docs/reference/ground-combat.md#arena-integration`. */
export const ARENA_SCRAPPER: PathFighterConfig = deepFreeze({ ...ARENA_BRAWLER, groundGame: true });

/** Low-kick development profile: `docs/reference/front-kicks.md#arena-selection`. */
export const ARENA_KICKER: PathFighterConfig = deepFreeze({ ...ARENA_SCRAPPER,
  kicks: { ...KICK_PATH, swingSeconds: .3, contactSpeed: 3 } });
