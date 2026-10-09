import type { REPTILE_BITE } from "../reptile/tuning.ts";
import { KICK_PATH, type KickTuning } from "../skills/kick.ts";
import type { AttackTuning } from "../skills/attack-path.ts";
import type { CombatExecution, DrivenStrike } from "../skills/combat.ts";
import type { TurnStartup } from "../skills/locomotion.ts";
import { STRAIGHT_PUNCH, type StraightPunch } from "../skills/straight-punch.ts";
import type { ChoosePolicy } from "../skills/choose.ts";
import type { Placed } from "../skills/strike.ts";
import type { Repertoire } from "../skills/strikes.ts";
import type { WholeBodyDrive } from "../skills/whole-body-strike.ts";
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
 * **Tactics that seek the foe** (`seekFoe`, `recipeTactics`): walk at the nearest foe and attack
 * it with the right hand. Its fields are a player's; `tuning` is research's, and never travels in
 * a link.
 */
export interface SeekConfig {
  readonly kind: "seek";
  /** How a hand that does not attack guards: the pose, or a cover of what threatens (`threatOf`, `threat.ts`). */
  readonly guard: "pose" | "cover";
  /** What of a foe a fighter attacks: its head; its upper trunk; or, of its head and upper trunk, the one its hand's recipe nets more on (`seekFoe`, `recipe-tactics.ts`). */
  readonly aim: "head" | "body" | "pays";
  /**
   * How near a foe a fighter comes to attack it: walking in to `ATTACK_METRES`; or held at the
   * edge of the foe's reach, attacking when the foe stands in its own blow's window (`seekFoe`, `EDGE`).
   */
  readonly range: "close" | "edge";
  /** An experiment's settings in place of the ones set: a sweep's cell. */
  readonly tuning?: {
    /** The threat in place of `THREAT`. */
    readonly threat?: Threat;
    /** The edge in place of `EDGE`. */
    readonly edge?: Edge;
  };
}

/**
 * **Tactics that choose openings** (`pathTactics`): a hand path chosen against the foe's surfaces,
 * approached to its working distance and attacked when ready, with covers or evasions. Its fields
 * are a player's; `tuning` is research's, and never travels in a link.
 */
export interface OpeningsConfig {
  readonly kind: "openings";
  /** The hand that attacks, or both in turn. */
  readonly hands: "left" | "right" | "alternate";
  /** Straight blows; straight blows and close hooks ranked together; with measured overhands; or with uppercuts too. */
  readonly strikes: "linear" | "mixed" | "vertical" | "boxing";
  /** The surface the openings favour: the head, or the trunk (`BODY_OPENINGS`). */
  readonly prefers: "head" | "body";
  /** The reference cover, or a cover placed by measured relative-motion prediction (`docs/reference/combat-defense.md`). */
  readonly defence: "cover" | "predictive";
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
    /** Over the openings `prefers` sets. */
    readonly openings?: OpeningTuning;
  };
}

/** **Tactics that carry out the screen's script** (`MindWiring.script`): the Lab's scenario, as its mode writes it. */
interface ScriptConfig { readonly kind: "script" }

/** **Tactics that stand in guard** the way the body faces, whatever is about. */
interface StandConfig { readonly kind: "stand" }

/** Carry out a person's orders while there are any (`Orders`). */
interface FollowOrdersConfig { readonly kind: "follow-orders" }

/** Walk away from the nearest foe, around what is in the way. */
interface FleeConfig { readonly kind: "flee" }

/** Walk to the nearest foe until the centres of mass are within `metres` across the ground. */
interface CloseInConfig { readonly kind: "close-in"; readonly metres: number }

/** Hold `metres` from the nearest foe: walk in from further, back away from nearer. */
interface KeepDistanceConfig { readonly kind: "keep-distance"; readonly metres: number }

/** Strike the nearest foe with `blow`, by `hands`, at what `aim` names, walking in to it. */
interface StrikeConfig {
  readonly kind: "strike";
  readonly hands: "left" | "right" | "alternate";
  readonly aim: SeekConfig["aim"];
  readonly blow: BlowConfig;
}

/** Kick the nearest standing foe's legs with `kick`, by `feet`, walking in to it. */
interface KickConfig { readonly kind: "kick"; readonly feet: "left" | "right" | "alternate"; readonly kick: FrontKickConfig }

/** Guard with the hands that do not attack, as `guard` says. */
interface CoverConfig { readonly kind: "cover"; readonly guard: SeekConfig["guard"] }

/** **A behaviour's config**, by kind: one thing a fighter may want of its body (`behaviours.ts`). */
export type BehaviourConfig = FollowOrdersConfig | FleeConfig | CloseInConfig | KeepDistanceConfig | StrikeConfig | KickConfig | CoverConfig;

/**
 * **Tactics made of behaviours**, in rank order: each step the first behaviour that wants the legs,
 * the attack or a hand's guard has it, and what none wants stands in guard (`behavioursTactics`).
 * What the body can do is what its behaviours carry: a strike its blow, a kick its kick
 * (`fighterSkills`).
 */
export interface BehavioursConfig { readonly kind: "behaviours"; readonly list: readonly BehaviourConfig[] }

/** **Tactics' config**, by kind: what turns what a body sees into its intent. */
export type TacticsConfig = SeekConfig | OpeningsConfig | ScriptConfig | StandConfig | BehavioursConfig;

/** **The walk** within the body's stance envelope (`locomotion`). */
export interface StanceWalkConfig {
  readonly kind: "stance-walk";
  readonly tuning?: {
    /** A heading-speed ceiling, rad/s: `docs/reference/combat-locomotion.md`. */
    readonly turnLimit?: number;
    /** A brief heading-speed ceiling while setting off: `docs/reference/combat-turn-startup.md`. */
    readonly turnStartup?: TurnStartup;
  };
}

/** **The guard**: the arms' posture, and a guarding hand's cover of what the tactics name (`guardSkill`). */
interface CoverGuardConfig {
  readonly kind: "cover-guard";
  readonly tuning?: {
    /** The cover in place of `GUARD_COVER`. */
    readonly covering?: Covering;
  };
}

/** **The recipe strike**: the searched recipe blows for what a hand holds (`recipeStrike`, `skills/strike.ts`). */
interface RecipeStrikeConfig {
  readonly kind: "recipe-strike";
  readonly tuning?: {
    /** Strikes in place of the searched repertoire (`REPERTOIRE`): a search's candidate. */
    readonly repertoire?: Repertoire;
    /** The placed blow in place of `PLACED`: a sweep's cell. */
    readonly placed?: Placed;
    /** The most a blow turns the pelvis in place of `STEER`: a sweep's cell. */
    readonly steer?: number;
  };
}

/** **The path strike**: a hand path carried out on the strike cycle (`pathStrike`, `skills/combat.ts`). */
export interface PathStrikeConfig {
  readonly kind: "path-strike";
  /** Whether a hand may begin while the other is still returning. */
  readonly overlap: boolean;
  readonly tuning?: {
    /** The hands' paths over `ATTACK_PATH`. */
    readonly paths?: Partial<AttackTuning>;
    readonly execution?: CombatExecution;
  };
}

/** **The driven strike** (`DrivenStrike`, `skills/combat.ts`): the path strike with its trunk driven into the swing. */
export interface DrivenStrikeConfig extends DrivenStrike {
  readonly kind: "driven-strike";
  readonly tuning?: PathStrikeConfig["tuning"];
}

/** **The whole-body strike** (`wholeBodyStrike`, `skills/whole-body-strike.ts`): one torque solve over the whole body under a blow, its fist driven by `drive`. */
export interface WholeBodyStrikeConfig {
  readonly kind: "whole-body-strike";
  readonly drive: WholeBodyDrive;
}

/** **The straight punch** (`straightPunch`, `skills/straight-punch.ts`): the arm driven flat out at a lined-up contact pose, its settings these. */
export interface StraightPunchConfig extends StraightPunch {
  readonly kind: "straight-punch";
}

/** **A choice of blows**: each blow begun given to one of `options` by `policy` (`chooseSkill`, `skills/choose.ts`). */
export interface ChooseBlowConfig {
  readonly kind: "choose-blow";
  readonly options: readonly BlowConfig[];
  readonly policy: ChoosePolicy;
}

/** **A blow skill's config**, by kind: what carries out a hand's attack. */
export type BlowConfig = RecipeStrikeConfig | PathStrikeConfig | DrivenStrikeConfig | WholeBodyStrikeConfig | StraightPunchConfig | ChooseBlowConfig;

/** **The front kick** with either foot (`kickSkill`), its swing over `ARENA_KICKS`. */
export interface FrontKickConfig {
  readonly kind: "front-kick";
  readonly tuning?: Partial<KickTuning>;
}

/** **Fighting from low support** (`supportFold`): lowering, folding and rising again. */
interface SupportFoldConfig { readonly kind: "support-fold" }

/** **A skill's config**, by kind, across the fighter's skill slots. */
export type SkillConfig = StanceWalkConfig | CoverGuardConfig | BlowConfig | FrontKickConfig | SupportFoldConfig;

/**
 * **The fighter**: tactics over a skill of each role, under one arbiter (`skillSet`), handing its
 * body to its sub-minds while down (`fighter.ts`). An empty `blow`, `kick` or `support` is a fighter
 * that throws no blow, does not kick, or does not fight from low support. Under behaviours its blow
 * and kick are its behaviours' own, and these three slots are not its (`fighterSkills`).
 */
export interface FighterConfig {
  readonly kind: "fighter";
  readonly tactics: TacticsConfig;
  readonly locomotion: StanceWalkConfig;
  readonly guard: CoverGuardConfig;
  readonly blow: BlowConfig | null;
  readonly kick: FrontKickConfig | null;
  readonly support: SupportFoldConfig | null;
  /** The sub-minds it hands its body to, in rank order: the first that wants the body has it. */
  readonly subs: readonly SubMindConfig[];
}

/**
 * **A mind's config**, by kind: plain data, so it rides in a recipe, a save and a link. Each kind
 * of mind declares its own; a fight passes one through and reads nothing in it.
 */
export type MindConfig = FighterConfig | DirectMindConfig | QuadrupedConfig;

/** Four-paw crawling, physical jaw snaps and self-righting through the body's own muscles. */
interface QuadrupedConfig {
  readonly kind: "quadruped";
  /** Immutable bite cells for physical qualification; retained by recipes and replay. */
  readonly tuning?: { readonly bite?: Partial<typeof REPTILE_BITE> };
}

export const QUADRUPED: QuadrupedConfig = deepFreeze({ kind: "quadruped" });

/** Joint-feedback experiment: targets in radians and explicit time, speed and activation bounds. */
export interface DirectMindConfig {
  readonly kind: "direct";
  readonly targets: Readonly<Record<string, number>>;
  readonly seconds: number;
  readonly speed: number;
  readonly activation: number;
}

/** The seeking tactics as they start: the guard's pose, the head, walking in. */
export const SEEK: SeekConfig = deepFreeze({ kind: "seek", guard: "pose", aim: "head", range: "close" });

/** The opening tactics as they start: both hands in turn, straight blows at the head under the reference cover, no combinations, no spacing. */
export const OPENINGS: OpeningsConfig = deepFreeze({ kind: "openings", hands: "alternate", strikes: "linear", prefers: "head", defence: "cover",
  combinations: "none", spacing: 0, spacingStep: 0 });

/** The mind every body has unless its fight says otherwise: seeking tactics over the recipe strike, lying still once down. */
export const RECIPE_FIGHTER: FighterConfig = deepFreeze({ kind: "fighter", tactics: SEEK, locomotion: { kind: "stance-walk" }, guard: { kind: "cover-guard" },
  blow: { kind: "recipe-strike" }, kick: null, support: null, subs: [{ kind: "lie" }] });

/** The Arena's Classic: the recipe fighter, rising by stages once down. */
export const CLASSIC: FighterConfig = deepFreeze({ ...RECIPE_FIGHTER, subs: [{ kind: "staged-rise" }] });

/** Classic throwing the straight punch: its fist lined up behind the arm, searched in Arena bouts (`research/punch-in-bout.mjs`). */
export const PUNCHER: FighterConfig = deepFreeze({ ...CLASSIC, blow: { kind: "straight-punch", ...STRAIGHT_PUNCH } });

/** Opening scores that favour the trunk over the head: `docs/reference/arena-combat-evaluation.md#body-targeting-held-out-evaluation`. */
export const BODY_OPENINGS: OpeningTuning = deepFreeze({ head: .3, upperTrunk: 0, middleTrunk: 0 });

/** The Arena's low kick: `docs/reference/front-kicks.md#arena-selection`. */
export const ARENA_KICKS: KickTuning = deepFreeze({ ...KICK_PATH, swingSeconds: .3, contactSpeed: 3 });

/** The Arena's Combat: opening tactics over the path strike, straight blows at the head. Promotion is measured by the paired combat harness. */
export const COMBAT: FighterConfig = deepFreeze({ ...RECIPE_FIGHTER, tactics: OPENINGS, blow: { kind: "path-strike", overlap: false }, subs: [{ kind: "support-recovery" }] });

/** Body-targeting candidate and scope: `docs/reference/arena-combat-evaluation.md#body-targeting-held-out-evaluation`. */
export const BRAWLER: FighterConfig = deepFreeze({ ...COMBAT, tactics: { ...OPENINGS, strikes: "mixed", prefers: "body" } });

/** Playable grounded profile with both-hand low gates: `docs/reference/ground-combat.md#arena-integration`. */
export const SCRAPPER: FighterConfig = deepFreeze({ ...BRAWLER, support: { kind: "support-fold" } });

/** Low-kick development profile: `docs/reference/front-kicks.md#arena-selection`. */
export const KICKER: FighterConfig = deepFreeze({ ...SCRAPPER, kick: { kind: "front-kick" } });

/** A fighter of behaviours (`BehavioursConfig`): orders followed first, then `list`, then the hands covering; rising by stages once down. */
const behaving = (list: readonly BehaviourConfig[]): FighterConfig => deepFreeze({ ...CLASSIC, blow: null,
  tactics: { kind: "behaviours", list: [{ kind: "follow-orders" }, ...list, { kind: "cover", guard: "cover" }] } });

/** Behaviours as they start: the foe struck with either hand by the recipe strike. */
export const BEHAVIOURS: FighterConfig = behaving([{ kind: "strike", hands: "alternate", aim: "head", blow: { kind: "recipe-strike" } }]);

/** Runs from the nearest foe, guarding, and never strikes. */
export const RUNNER: FighterConfig = behaving([{ kind: "flee" }]);

/** Walks at the nearest foe and stays on it, guarding, and never strikes. */
export const CHARGER: FighterConfig = behaving([{ kind: "close-in", metres: 0.6 }]);

/** Strikes with the left hand alone. */
export const LEFT_HAND: FighterConfig = behaving([{ kind: "strike", hands: "left", aim: "head", blow: { kind: "recipe-strike" } }]);

/** Kicks and never strikes. */
export const KICKS_ONLY: FighterConfig = behaving([{ kind: "kick", feet: "alternate", kick: { kind: "front-kick" } }]);
