import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";

import { CONFIG } from "./config.ts";
import type { UnitSelectionRules } from "./bout.ts";
import { BROOT_PROFILE, Fighter, type FighterMaterials, type Limb } from "./fighter.ts";
import { KAYKIT_KNIGHT_METRICS, KAYKIT_KNIGHT_PROFILE } from "./kaykit-profile.ts";
import type { Striking } from "./combat.ts";
import type { ControlEndpoint } from "./control-host.ts";
import type { SupportedLocomotionPort } from "./supported-locomotion.ts";
import type { StabilityEvent } from "./supported-locomotion-state.ts";
import type { HumanoidHumanSource } from "./humanoid-control.ts";
import { handsFor, isWeaponKind, WEAPON_KINDS, type WeaponKind } from "./hands.ts";
import { POLICIES, splitMind, type HandName, type Mind } from "./mind.ts";
import type { Side } from "./physics.ts";
import { Centipede, CENTIPEDE_BITE_REACH, CENTIPEDE_CROWN, CENTIPEDE_RADIUS, CENTIPEDE_SEGMENTS } from "./bodies/centipede.ts";
import { ARBALEST_CONSTRUCT_PROFILE, Construct, HUMANOID_CONSTRUCT_PROFILE,
  TWINBLADE_CONSTRUCT_PROFILE } from "./construct/construct.ts";
import { arbalestBlueprint, arbalestControl, arbalestProgram,
  ARBALEST_SENSORS } from "./construct/arbalest.ts";
import { humanoidBlueprint, humanoidControl, humanoidProgram, HUMANOID_SENSORS } from "./construct/humanoid.ts";
import { twinbladeBlueprint, twinbladeControl, twinbladeProgram,
  TWINBLADE_SENSORS } from "./construct/twinblade.ts";
import { wardenBlueprint } from "./construct/warden.ts";

/** A body kind accepted at the setup boundary. */
export type UnitKind = "warrior" | "broot" | "centipede" | "kaykit-knight" | "bronze-warden" |
  "swordbearer-effigy" | "twinblade-effigy" | "arbalest-effigy";

export interface UnitLoadout {
  readonly primary: WeaponKind;
  readonly secondary: WeaponKind;
}

export interface AnatomyDefinition {
  readonly parts: readonly string[];
  readonly vitalityWeights: Readonly<Record<string, number>>;
}

export interface CombatantBuild {
  readonly scene: Scene;
  readonly side: Side;
  readonly origin: Vector3;
  readonly facing: number;
  readonly mind?: Mind;
  readonly loadout?: Record<HandName, WeaponKind>;
  readonly materials: FighterMaterials;
  readonly human?: HumanoidHumanSource;
  readonly policyName?: string;
  readonly policySeed?: number;
  readonly humanActive?: boolean;
}

/**
 * The common body seam. Warrior is its only implementation in this session;
 * keeping the name independent of Fighter lets later units enter through the
 * registry instead of making the host switch on their kind.
 */
export interface Combatant {
  readonly kind: UnitKind;
  readonly side: Side;
  readonly control: ControlEndpoint;
  readonly locomotion?: SupportedLocomotionPort | null;
  /** Explicit old-body capability ports; null bodies do not impersonate a humanoid. */
  readonly articulated: Fighter | null;
  readonly limbs: Limb[];
  readonly strikers: Striking[];
  readonly costume: readonly AbstractMesh[];
  readonly alive: boolean;
  readonly vitality: number;
  lockTarget: Vector3 | null;
  observe(opponent: Combatant, clock: number): void;
  describe(into: import("./mind.ts").BodyView): void;
  /**
   * Write every shaft of this body's that is still in the air into `into`,
   * starting at `at`, and answer where the next writer should start.
   *
   * A cursor rather than a returned array, because the two bodies in a bout
   * publish into **one** list and neither may allocate: the caller clears the
   * logical length, hands the list to each side in turn, and trims it to the
   * total. Each body keeps its own pool of records per `owner` role -- the same
   * shaft is `self` in its owner's view and `opponent` in the other's, and one
   * pool serving both roles would have the second `observe` of a step rewrite
   * the label the first one published.
   *
   * A body with nothing to loose answers `at` and writes nothing.
   */
  publishProjectiles(
    into: import("./mind.ts").ProjectileView[],
    at: number,
    owner: "self" | "opponent",
  ): number;
  nearestPartTo(point: Vector3): number;
  stepProjectiles(dt: number): void;
  feetPosition(): Vector3;
  centre(): Vector3;
  aimPoint(): Vector3;
  owns(mesh: AbstractMesh): boolean;
  limbFor(body: PhysicsBody): Limb | undefined;
  /** Compound bodies may resolve a blueprint-owned damage leaf from the contact point. */
  damageTargetFor?(body: PhysicsBody, point: Vector3): Limb | undefined;
  /** Body-owned armour may transform raw scoring damage into authoritative applied damage. */
  applyDamage?(target: Limb, rawDamage: number): number;
  /** Authored hit transfer only; collision callbacks queue it for the next safe control edge. */
  queueStabilityEvent?(event: StabilityEvent): void;
  parriedBy(body: PhysicsBody, point?: Vector3): { readonly kind: WeaponKind } | null;
  sever(limb: Limb, direction: Vector3): void;
  stopFighting(): void;
  dispose(): void;
  /** Stable body points the host protects from room occlusion. */
  occlusionPoints(): readonly Vector3[];
}

export interface UnitDefinition extends UnitSelectionRules {
  readonly kind: UnitKind;
  readonly label: string;
  /** The picker-visible union; `loadouts` is the authoritative pair rule. */
  readonly equipment: readonly WeaponKind[];
  readonly loadouts: readonly UnitLoadout[];
  readonly defaultLoadout: UnitLoadout;
  readonly hands: 0 | 2;
  /** Null means every policy can drive the body's articulated input surface. */
  readonly compatiblePolicies: readonly string[] | null;
  readonly driverOptions: readonly { readonly name: string; readonly label: string }[];
  readonly humanAdapter: boolean;
  readonly controlSurface: string;
  readonly defaultPolicy: string;
  readonly anatomy: AnatomyDefinition;
  readonly reach: number;
  readonly crownHeight: number;
  readonly vitalHeight: number;
  readonly collisionRadius: number;
  /** Humanoid compatibility only; construct endpoints build their own typed drivers. */
  readonly createPolicy: ((name: string, seed?: number) => Mind) | null;
  build(ctx: CombatantBuild): Combatant;
}

const freezeLoadouts = (loadouts: UnitLoadout[]): readonly UnitLoadout[] =>
  Object.freeze(loadouts.map((loadout) => Object.freeze(loadout)));

/*
 * These are exactly the pairs the pre-registry picker could reach. A
 * two-handed kind fills both hands; every pair of zero/one-handed kinds remains
 * independent. Writing the rule here makes the old surface explicit without
 * expanding it when a unit with an authored fixed grip enters the registry.
 */
const humanoidLoadouts = freezeLoadouts(WEAPON_KINDS.flatMap((primary) =>
  WEAPON_KINDS.flatMap((secondary) => {
    const primaryTakesTwo = handsFor(primary) === 2;
    const secondaryTakesTwo = handsFor(secondary) === 2;
    const allowed = primaryTakesTwo || secondaryTakesTwo
      ? primary === secondary && primaryTakesTwo
      : true;
    return allowed ? [{ primary, secondary }] : [];
  })
));
const humanoidDefault = Object.freeze<UnitLoadout>({ primary: "sword", secondary: "empty" });
const emptyLoadout = Object.freeze<UnitLoadout>({ primary: "empty", secondary: "empty" });
const kaykitKnightLoadout = Object.freeze<UnitLoadout>({ primary: "sword", secondary: "buckler" });

const warriorParts = Object.freeze(Object.keys(CONFIG.body.vitalWeight));
const drivers = (names: readonly string[] | null) => Object.freeze(POLICIES
  .filter((policy) => names === null || names.includes(policy.name))
  .map(({ name, label }) => Object.freeze({ name, label })));
const policyFactory = (unit: string, options: readonly { readonly name: string }[]) =>
  (name: string, seed?: number): Mind => {
    if (!options.some((option) => option.name === name)) {
      throw new Error(`unit "${unit}" does not support policy "${name}"`);
    }
    const policy = POLICIES.find((candidate) => candidate.name === name);
    if (!policy) throw new Error(`unit "${unit}" declares unknown policy "${name}"`);
    return policy.create(seed);
  };
const initialMind = (ctx: CombatantBuild, definition: UnitDefinition): Mind => {
  if (ctx.mind) return ctx.mind;
  if (!definition.createPolicy) throw new Error(`control surface ${definition.controlSurface} has no humanoid Mind factory`);
  const policy = definition.createPolicy(ctx.policyName ?? definition.defaultPolicy, ctx.policySeed);
  if (!ctx.humanActive) return policy;
  if (!ctx.human || !definition.humanAdapter) {
    throw new Error(`control surface ${definition.controlSurface} has no human adapter`);
  }
  return splitMind(ctx.human.mind, policy, ctx.human.ownership);
};
const initialLoadout = (ctx: CombatantBuild, definition: UnitDefinition): Record<HandName, WeaponKind> =>
  ctx.loadout ?? { primary: definition.defaultLoadout.primary, secondary: definition.defaultLoadout.secondary };

const warrior: UnitDefinition = Object.freeze({
  kind: "warrior",
  label: "Warrior",
  equipment: WEAPON_KINDS,
  loadouts: humanoidLoadouts,
  defaultLoadout: humanoidDefault,
  hands: 2,
  compatiblePolicies: null,
  driverOptions: drivers(null),
  humanAdapter: true,
  controlSurface: "humanoid-v1",
  defaultPolicy: "idle",
  anatomy: Object.freeze({
    parts: warriorParts,
    vitalityWeights: CONFIG.body.vitalWeight,
  }),
  reach: CONFIG.arm.reachNeutral,
  crownHeight: CONFIG.body.headCentre + CONFIG.body.headRadius,
  vitalHeight: CONFIG.body.torsoCentre,
  collisionRadius: CONFIG.body.pelvisRadius,
  createPolicy: (name: string, seed?: number) => policyFactory("warrior", warrior.driverOptions)(name, seed),
  build: (ctx: CombatantBuild) => new Fighter(ctx.scene, {
    side: ctx.side,
    origin: ctx.origin,
    facing: ctx.facing,
    mind: initialMind(ctx, warrior),
    human: ctx.human,
    controlPolicies: warrior.driverOptions,
    controlPolicyName: ctx.policyName,
    controlPolicyFactory: warrior.createPolicy ?? undefined,
    loadout: initialLoadout(ctx, warrior),
  }, ctx.materials),
});

const broot: UnitDefinition = Object.freeze({
  kind: "broot",
  label: "Broot",
  equipment: WEAPON_KINDS,
  loadouts: humanoidLoadouts,
  defaultLoadout: humanoidDefault,
  hands: 2,
  compatiblePolicies: null,
  driverOptions: drivers(null),
  humanAdapter: true,
  controlSurface: "humanoid-v1",
  defaultPolicy: "idle",
  anatomy: Object.freeze({
    parts: warriorParts,
    vitalityWeights: CONFIG.body.vitalWeight,
  }),
  reach: CONFIG.arm.reachNeutral * BROOT_PROFILE.scale,
  crownHeight: (CONFIG.body.headCentre + CONFIG.body.headRadius) * BROOT_PROFILE.scale,
  vitalHeight: CONFIG.body.torsoCentre * BROOT_PROFILE.scale,
  collisionRadius: CONFIG.body.pelvisRadius * BROOT_PROFILE.scale,
  createPolicy: (name: string, seed?: number) => policyFactory("broot", broot.driverOptions)(name, seed),
  build: (ctx: CombatantBuild) => new Fighter(ctx.scene, {
    side: ctx.side,
    origin: ctx.origin,
    facing: ctx.facing,
    mind: initialMind(ctx, broot),
    human: ctx.human,
    controlPolicies: broot.driverOptions,
    controlPolicyName: ctx.policyName,
    controlPolicyFactory: broot.createPolicy ?? undefined,
    loadout: initialLoadout(ctx, broot),
    profile: BROOT_PROFILE,
  }, ctx.materials),
});

const centipedeParts = Object.freeze([
  "head",
  ...Array.from({ length: CENTIPEDE_SEGMENTS }, (_, index) => `segment${index + 1}`),
]);
const centipedeWeights = Object.freeze(Object.fromEntries(
  centipedeParts.map((key) => [key, key === "head" ? 0 : 0.125]),
));
const centipede: UnitDefinition = Object.freeze({
  kind: "centipede",
  label: "Centipede",
  // `empty` is the setup sentinel, not equipment: both controls are disabled.
  equipment: Object.freeze(["empty"] as WeaponKind[]),
  loadouts: freezeLoadouts([{ primary: "empty", secondary: "empty" }]),
  defaultLoadout: emptyLoadout,
  hands: 0,
  compatiblePolicies: Object.freeze(["crawler"]),
  driverOptions: drivers(["crawler"]),
  humanAdapter: true,
  controlSurface: "humanoid-v1",
  defaultPolicy: "crawler",
  anatomy: Object.freeze({ parts: centipedeParts, vitalityWeights: centipedeWeights }),
  reach: CENTIPEDE_BITE_REACH,
  crownHeight: CENTIPEDE_CROWN,
  vitalHeight: CENTIPEDE_CROWN * 0.55,
  collisionRadius: CENTIPEDE_RADIUS,
  createPolicy: (name: string, seed?: number) => policyFactory("centipede", centipede.driverOptions)(name, seed),
  build: (ctx: CombatantBuild) => new Centipede({ ...ctx, mind: initialMind(ctx, centipede),
    loadout: initialLoadout(ctx, centipede) }),
});

const kaykitKnight: UnitDefinition = Object.freeze({
  kind: "kaykit-knight",
  label: "KayKit Knight (Experimental)",
  equipment: Object.freeze(["sword", "buckler"] as WeaponKind[]),
  loadouts: freezeLoadouts([{ primary: "sword", secondary: "buckler" }]),
  defaultLoadout: kaykitKnightLoadout,
  hands: 2,
  compatiblePolicies: Object.freeze(["idle", "swinger", "duelist"]),
  driverOptions: drivers(["idle", "swinger", "duelist"]),
  humanAdapter: true,
  controlSurface: "humanoid-v1",
  defaultPolicy: "idle",
  anatomy: Object.freeze({
    parts: warriorParts,
    vitalityWeights: CONFIG.body.vitalWeight,
  }),
  reach: KAYKIT_KNIGHT_METRICS.reach,
  crownHeight: KAYKIT_KNIGHT_METRICS.crownHeight,
  vitalHeight: KAYKIT_KNIGHT_METRICS.vitalHeight,
  collisionRadius: KAYKIT_KNIGHT_METRICS.collisionRadius,
  createPolicy: (name: string, seed?: number) => policyFactory("kaykit-knight", kaykitKnight.driverOptions)(name, seed),
  build: (ctx: CombatantBuild) => new Fighter(ctx.scene, {
    side: ctx.side,
    origin: ctx.origin,
    facing: ctx.facing,
    mind: initialMind(ctx, kaykitKnight),
    human: ctx.human,
    controlPolicies: kaykitKnight.driverOptions,
    controlPolicyName: ctx.policyName,
    controlPolicyFactory: kaykitKnight.createPolicy ?? undefined,
    loadout: initialLoadout(ctx, kaykitKnight),
    profile: KAYKIT_KNIGHT_PROFILE,
  }, ctx.materials),
});

const wardenModel = wardenBlueprint("crossbow");
const wardenParts = Object.freeze(wardenModel.parts.map(({ id }) => id));
const wardenWeights = Object.freeze(Object.fromEntries(
  wardenModel.parts.map(({ id, vitalityWeight }) => [id, vitalityWeight]),
));
const bronzeWarden: UnitDefinition = Object.freeze({
  kind: "bronze-warden",
  label: "Bronze Warden (Experimental)",
  equipment: Object.freeze(["empty"] as WeaponKind[]),
  loadouts: freezeLoadouts([{ primary: "empty", secondary: "empty" }]),
  defaultLoadout: emptyLoadout,
  hands: 0,
  compatiblePolicies: Object.freeze(["construct-hold", "warden-authored"]),
  driverOptions: Object.freeze([
    Object.freeze({ name: "construct-hold", label: "Hold" }),
    Object.freeze({ name: "warden-authored", label: "Warden Mind" }),
  ]),
  humanAdapter: false,
  controlSurface: "construct-v1",
  defaultPolicy: "warden-authored",
  anatomy: Object.freeze({ parts: wardenParts, vitalityWeights: wardenWeights }),
  reach: 1.4,
  crownHeight: 1.9,
  vitalHeight: 1.33,
  collisionRadius: 0.72,
  createPolicy: null,
  build: (ctx: CombatantBuild) => new Construct(ctx),
});

const humanoidModel = humanoidBlueprint();
const swordbearerEffigy: UnitDefinition = Object.freeze({
  kind: "swordbearer-effigy",
  label: "Swordbearer Effigy (Experimental)",
  equipment: Object.freeze(["empty"] as WeaponKind[]),
  loadouts: freezeLoadouts([{ primary: "empty", secondary: "empty" }]),
  defaultLoadout: emptyLoadout,
  hands: 0,
  compatiblePolicies: Object.freeze(["construct-hold", "humanoid-authored"]),
  driverOptions: Object.freeze([
    Object.freeze({ name: "construct-hold", label: "Hold" }),
    Object.freeze({ name: "humanoid-authored", label: "Effigy Mind" }),
  ]),
  humanAdapter: false,
  controlSurface: "construct-humanoid-v1",
  defaultPolicy: "humanoid-authored",
  anatomy: Object.freeze({ parts: Object.freeze(humanoidModel.parts.map(({ id }) => id)),
    vitalityWeights: Object.freeze(Object.fromEntries(humanoidModel.parts.map(({ id, vitalityWeight }) => [id, vitalityWeight]))) }),
  reach: HUMANOID_CONSTRUCT_PROFILE.reach,
  crownHeight: HUMANOID_CONSTRUCT_PROFILE.crownHeight,
  vitalHeight: HUMANOID_CONSTRUCT_PROFILE.vitalHeight,
  collisionRadius: HUMANOID_CONSTRUCT_PROFILE.collisionRadius,
  createPolicy: null,
  build: (ctx: CombatantBuild) => new Construct(ctx, { blueprint: humanoidBlueprint(), control: humanoidControl(),
    program: humanoidProgram(), sensors: HUMANOID_SENSORS, profile: HUMANOID_CONSTRUCT_PROFILE }),
});

const twinbladeModel = twinbladeBlueprint();
const twinbladeEffigy: UnitDefinition = Object.freeze({
  kind: "twinblade-effigy",
  label: "Twinblade Effigy (Mechanical A/B)",
  equipment: Object.freeze(["empty"] as WeaponKind[]),
  loadouts: freezeLoadouts([{ primary: "empty", secondary: "empty" }]),
  defaultLoadout: emptyLoadout,
  hands: 0,
  compatiblePolicies: Object.freeze(["construct-hold", "humanoid-authored"]),
  driverOptions: Object.freeze([
    Object.freeze({ name: "construct-hold", label: "Hold" }),
    Object.freeze({ name: "humanoid-authored", label: "Existing right-arm Mind" }),
  ]),
  humanAdapter: false,
  controlSurface: "construct-twinblade-v1",
  defaultPolicy: "humanoid-authored",
  anatomy: Object.freeze({ parts: Object.freeze(twinbladeModel.parts.map(({ id }) => id)),
    vitalityWeights: Object.freeze(Object.fromEntries(twinbladeModel.parts
      .map(({ id, vitalityWeight }) => [id, vitalityWeight]))) }),
  reach: TWINBLADE_CONSTRUCT_PROFILE.reach,
  crownHeight: TWINBLADE_CONSTRUCT_PROFILE.crownHeight,
  vitalHeight: TWINBLADE_CONSTRUCT_PROFILE.vitalHeight,
  collisionRadius: TWINBLADE_CONSTRUCT_PROFILE.collisionRadius,
  createPolicy: null,
  build: (ctx: CombatantBuild) => new Construct(ctx, { blueprint: twinbladeBlueprint(),
    control: twinbladeControl(), program: twinbladeProgram(), sensors: TWINBLADE_SENSORS,
    profile: TWINBLADE_CONSTRUCT_PROFILE }),
});

const arbalestModel = arbalestBlueprint();
const arbalestEffigy: UnitDefinition = Object.freeze({
  kind: "arbalest-effigy",
  label: "Arbalest Effigy (Mechanical A/B)",
  equipment: Object.freeze(["empty"] as WeaponKind[]),
  loadouts: freezeLoadouts([{ primary: "empty", secondary: "empty" }]),
  defaultLoadout: emptyLoadout,
  hands: 0,
  compatiblePolicies: Object.freeze(["construct-hold", "humanoid-authored"]),
  driverOptions: Object.freeze([
    Object.freeze({ name: "construct-hold", label: "Hold" }),
    Object.freeze({ name: "humanoid-authored", label: "Arbalest Mind" }),
  ]),
  humanAdapter: false,
  controlSurface: "construct-arbalest-v1",
  defaultPolicy: "humanoid-authored",
  anatomy: Object.freeze({ parts: Object.freeze(arbalestModel.parts.map(({ id }) => id)),
    vitalityWeights: Object.freeze(Object.fromEntries(arbalestModel.parts
      .map(({ id, vitalityWeight }) => [id, vitalityWeight]))) }),
  reach: ARBALEST_CONSTRUCT_PROFILE.reach,
  crownHeight: ARBALEST_CONSTRUCT_PROFILE.crownHeight,
  vitalHeight: ARBALEST_CONSTRUCT_PROFILE.vitalHeight,
  collisionRadius: ARBALEST_CONSTRUCT_PROFILE.collisionRadius,
  createPolicy: null,
  build: (ctx: CombatantBuild) => new Construct(ctx, { blueprint: arbalestBlueprint(),
    control: arbalestControl(), program: arbalestProgram(), sensors: ARBALEST_SENSORS,
    profile: ARBALEST_CONSTRUCT_PROFILE }),
});

export const UNIT_REGISTRY: Readonly<Record<UnitKind, UnitDefinition>> = Object.freeze({
  warrior,
  broot,
  centipede,
  "kaykit-knight": kaykitKnight,
  "bronze-warden": bronzeWarden,
  "swordbearer-effigy": swordbearerEffigy,
  "twinblade-effigy": twinbladeEffigy,
  "arbalest-effigy": arbalestEffigy,
});

/** Picker rows are a projection of bodies that can actually be built. */
export const UNITS: readonly { name: UnitKind; label: string }[] = Object.freeze(
  Object.values(UNIT_REGISTRY).map((definition) => Object.freeze({
    name: definition.kind,
    label: definition.label,
  })),
);

export function unitDefinition(name: string): UnitDefinition {
  if (!Object.hasOwn(UNIT_REGISTRY, name)) throw new Error(`unknown unit "${name}"`);
  return UNIT_REGISTRY[name as UnitKind];
}

export function loadoutForUnit(
  unitName: string,
  handA: string,
  handB: string,
): Record<HandName, WeaponKind> {
  const unit = unitDefinition(unitName);
  const read = (value: string): WeaponKind => {
    if (!isWeaponKind(value) || !unit.equipment.includes(value)) {
      throw new Error(`unit "${unit.kind}" does not support equipment "${value}"`);
    }
    return value;
  };
  const primary = read(handA);
  const secondary = read(handB);
  if (!supportsLoadoutForUnit(unitName, primary, secondary)) {
    throw new Error(`unit "${unit.kind}" does not support loadout "${primary}+${secondary}"`);
  }
  return { primary, secondary };
}

/** Whether both hands together are an authored loadout for this unit. */
export function supportsLoadoutForUnit(
  unitName: string,
  primary: string,
  secondary: string,
): boolean {
  const unit = unitDefinition(unitName);
  if (!isWeaponKind(primary) || !isWeaponKind(secondary)) return false;
  return unit.loadouts.some((loadout) =>
    loadout.primary === primary && loadout.secondary === secondary
  );
}

/** Refuse a policy that cannot express the selected body's action surface. */
export function policyForUnit(unitName: string, policyName: string): string {
  const unit = unitDefinition(unitName);
  if (!unit.driverOptions.some((driver) => driver.name === policyName)) {
    throw new Error(`unit "${unit.kind}" does not support policy "${policyName}"`);
  }
  return policyName;
}

/** Human handover and the rig overlay are capabilities, not assumptions. */
export function isArticulatedCombatant(combatant: Combatant): combatant is Fighter {
  return combatant.articulated !== null;
}
