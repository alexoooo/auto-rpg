import { KICK_PATH, type KickTuning } from "../skills/kick.ts";
import type { AttackTuning } from "../skills/attack-path.ts";
import type { CombatExecution } from "../skills/combat.ts";
import type { TurnStartup } from "../skills/locomotion.ts";
import type { OpeningTuning } from "./openings.ts";
import type { Covering } from "../skills/guard.ts";
import { deepFreeze } from "../state.ts";
import type { Threat } from "./threat.ts";
import type { Edge } from "./recipe-tactics.ts";

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
 * the foe (`seekFoe`), over the command layers (`recipe-fighter.ts`). Its fields are a player's;
 * `tuning` is research's, and never travels in a link.
 */
export interface RecipeFighterConfig {
  readonly kind: "recipe-fighter";
  /** The sub-minds it hands its body to, in rank order: the first that wants the body has it. */
  readonly subs: readonly SubMindConfig[];
  /** How a hand that does not attack guards: the pose, or a cover of what threatens (`threatOf`, `threat.ts`). */
  readonly guard: "pose" | "cover";
  /** What of a foe a fighter attacks: its head; or, of its head and upper trunk, the one its hand's recipe nets more on (`seekFoe`, `recipe-tactics.ts`). */
  readonly aim: "head" | "pays";
  /**
   * How near a foe a fighter comes to attack it: walking in to `ATTACK_METRES`; or held at the
   * edge of the foe's reach, attacking when the foe stands in its own blow's window (`seekFoe`, `EDGE`).
   */
  readonly range: "close" | "edge";
  /** An experiment's settings in place of the ones set: a sweep's cell. */
  readonly tuning?: {
    /** The cover in place of `GUARD_COVER`. */
    readonly covering?: Covering;
    /** The threat in place of `THREAT`. */
    readonly threat?: Threat;
    /** The edge in place of `EDGE`. */
    readonly edge?: Edge;
  };
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

/** The mind every body has unless its fight says otherwise: the recipe fighter, lying still once down. */
export const RECIPE_FIGHTER: RecipeFighterConfig = deepFreeze({ kind: "recipe-fighter", subs: [{ kind: "lie" }], guard: "pose", aim: "head", range: "close" });

/** The Arena's Classic: the recipe fighter, rising by stages once down. */
export const CLASSIC: RecipeFighterConfig = deepFreeze({ ...RECIPE_FIGHTER, subs: [{ kind: "staged-rise" }] });

/**
 * **The path fighter**: hand paths chosen against the foe's surfaces and carried out on the
 * strike cycle (`skills/combat.ts`), over the command layers (`path-fighter.ts`). Its fields are
 * a player's, each read once into the settings its tactics and skills share (`resolvePath`);
 * `tuning` is research's, and never travels in a link.
 */
export interface PathFighterConfig {
  readonly kind: "path-fighter";
  /** The sub-minds it hands its body to, in rank order: the first that wants the body has it. */
  readonly subs: readonly SubMindConfig[];
  /** The hand that attacks, or both in turn. */
  readonly hands: "left" | "right" | "alternate";
  /** Straight blows; straight blows and close hooks ranked together; with measured overhands; or with uppercuts too. */
  readonly strikes: "linear" | "mixed" | "vertical" | "boxing";
  /** The surface the openings favour: the head, or the trunk (`BODY_OPENINGS`). */
  readonly prefers: "head" | "body";
  /** The reference cover, or a cover placed by measured relative-motion prediction (`docs/reference/combat-defense.md`). */
  readonly defence: "cover" | "predictive";
  /** Whether it kicks low with either foot (`ARENA_KICKS`). */
  readonly kicks: boolean;
  /** Whether it approaches and strikes an opponent that is low (`docs/reference/ground-combat.md`). */
  readonly ground: boolean;
  /**
   * None; one opposite-hand follow-up after a target hit and verified return, with fresh lane and
   * footing checks; or that follow-up thrown while the contact-free hand still moves home, each
   * return still verified (`docs/reference/combat-overlap.md`). Both need alternate hands.
   */
  readonly combinations: "none" | "follow-up" | "overlap";
  /** Extra distance kept from the foe, m. */
  readonly spacing: number;
  /** How much a clean verified miss takes off the extra spacing, m: `docs/reference/combat-range-learning.md`. */
  readonly spacingStep: number;
  /** An experiment's settings in place of the ones set. */
  readonly tuning?: {
    readonly paths?: Partial<AttackTuning>;
    /** Over `ARENA_KICKS`, for a fighter that kicks. */
    readonly kick?: Partial<KickTuning>;
    readonly execution?: CombatExecution;
    /** Over the openings `prefers` sets. */
    readonly openings?: OpeningTuning;
    /** A heading-speed ceiling, rad/s: `docs/reference/combat-locomotion.md`. */
    readonly turnLimit?: number;
    /** A brief heading-speed ceiling while setting off: `docs/reference/combat-turn-startup.md`. */
    readonly turnStartup?: TurnStartup;
  };
}

/** Opening scores that favour the trunk over the head: `docs/reference/arena-combat-evaluation.md#body-targeting-held-out-evaluation`. */
export const BODY_OPENINGS: OpeningTuning = deepFreeze({ head: .3, upperTrunk: 0, middleTrunk: 0 });

/** The Arena's low kick: `docs/reference/front-kicks.md#arena-selection`. */
export const ARENA_KICKS: KickTuning = deepFreeze({ ...KICK_PATH, swingSeconds: .3, contactSpeed: 3 });

/** The Arena's Combat: straight blows at the head. Promotion is measured by the paired combat harness. */
export const COMBAT: PathFighterConfig = deepFreeze({ kind: "path-fighter", subs: [{ kind: "support-recovery" }], hands: "alternate",
  strikes: "linear", prefers: "head", defence: "cover", kicks: false, ground: false, combinations: "none", spacing: 0, spacingStep: 0 });

/** Body-targeting candidate and scope: `docs/reference/arena-combat-evaluation.md#body-targeting-held-out-evaluation`. */
export const BRAWLER: PathFighterConfig = deepFreeze({ ...COMBAT, strikes: "mixed", prefers: "body" });

/** Playable grounded profile with both-hand low gates: `docs/reference/ground-combat.md#arena-integration`. */
export const SCRAPPER: PathFighterConfig = deepFreeze({ ...BRAWLER, ground: true });

/** Low-kick development profile: `docs/reference/front-kicks.md#arena-selection`. */
export const KICKER: PathFighterConfig = deepFreeze({ ...SCRAPPER, kicks: true });
