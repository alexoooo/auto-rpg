import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";

import { CONFIG } from "./config.ts";
import type { UnitSelectionRules } from "./bout.ts";
import { BROOT_PROFILE, Fighter, type FighterMaterials, type Limb } from "./fighter.ts";
import type { Striking } from "./combat.ts";
import { handsFor, isWeaponKind, WEAPON_KINDS, type WeaponKind } from "./hands.ts";
import type { FighterView, HandName, Intent, Mind } from "./mind.ts";
import type { Side } from "./physics.ts";
import { Centipede, CENTIPEDE_BITE_REACH, CENTIPEDE_CROWN, CENTIPEDE_RADIUS, CENTIPEDE_SEGMENTS } from "./bodies/centipede.ts";

/** A body kind accepted at the setup boundary. */
export type UnitKind = "warrior" | "broot" | "centipede" | "kaykit-knight";

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
  readonly mind: Mind;
  readonly loadout: Record<HandName, WeaponKind>;
  readonly materials: FighterMaterials;
}

/**
 * The common body seam. Warrior is its only implementation in this session;
 * keeping the name independent of Fighter lets later units enter through the
 * registry instead of making the host switch on their kind.
 */
export interface Combatant {
  readonly kind: UnitKind;
  readonly side: Side;
  mind: Mind;
  /** A read-only tap on the command actually handed to this body. */
  intentObserver: ((view: FighterView, intent: Intent) => void) | null;
  readonly view: import("./mind.ts").FighterView;
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
  update(dt: number): void;
  stepProjectiles(dt: number): void;
  feetPosition(): Vector3;
  centre(): Vector3;
  aimPoint(): Vector3;
  owns(mesh: AbstractMesh): boolean;
  limbFor(body: PhysicsBody): Limb | undefined;
  parriedBy(body: PhysicsBody): { readonly kind: WeaponKind } | null;
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
  readonly defaultPolicy: string;
  readonly anatomy: AnatomyDefinition;
  readonly reach: number;
  readonly crownHeight: number;
  readonly vitalHeight: number;
  readonly collisionRadius: number;
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

const warrior: UnitDefinition = Object.freeze({
  kind: "warrior",
  label: "Warrior",
  equipment: WEAPON_KINDS,
  loadouts: humanoidLoadouts,
  defaultLoadout: humanoidDefault,
  hands: 2,
  compatiblePolicies: null,
  defaultPolicy: "idle",
  anatomy: Object.freeze({
    parts: warriorParts,
    vitalityWeights: CONFIG.body.vitalWeight,
  }),
  reach: CONFIG.arm.reachNeutral,
  crownHeight: CONFIG.body.headCentre + CONFIG.body.headRadius,
  vitalHeight: CONFIG.body.torsoCentre,
  collisionRadius: CONFIG.body.pelvisRadius,
  build: (ctx: CombatantBuild) => new Fighter(ctx.scene, {
    side: ctx.side,
    origin: ctx.origin,
    facing: ctx.facing,
    mind: ctx.mind,
    loadout: ctx.loadout,
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
  defaultPolicy: "idle",
  anatomy: Object.freeze({
    parts: warriorParts,
    vitalityWeights: CONFIG.body.vitalWeight,
  }),
  reach: CONFIG.arm.reachNeutral * BROOT_PROFILE.scale,
  crownHeight: (CONFIG.body.headCentre + CONFIG.body.headRadius) * BROOT_PROFILE.scale,
  vitalHeight: CONFIG.body.torsoCentre * BROOT_PROFILE.scale,
  collisionRadius: CONFIG.body.pelvisRadius * BROOT_PROFILE.scale,
  build: (ctx: CombatantBuild) => new Fighter(ctx.scene, {
    side: ctx.side,
    origin: ctx.origin,
    facing: ctx.facing,
    mind: ctx.mind,
    loadout: ctx.loadout,
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
  defaultPolicy: "crawler",
  anatomy: Object.freeze({ parts: centipedeParts, vitalityWeights: centipedeWeights }),
  reach: CENTIPEDE_BITE_REACH,
  crownHeight: CENTIPEDE_CROWN,
  vitalHeight: CENTIPEDE_CROWN * 0.55,
  collisionRadius: CENTIPEDE_RADIUS,
  build: (ctx: CombatantBuild) => new Centipede(ctx),
});

const kaykitKnight: UnitDefinition = Object.freeze({
  kind: "kaykit-knight",
  label: "KayKit Knight (Experimental)",
  equipment: Object.freeze(["sword", "buckler"] as WeaponKind[]),
  loadouts: freezeLoadouts([{ primary: "sword", secondary: "buckler" }]),
  defaultLoadout: kaykitKnightLoadout,
  hands: 2,
  compatiblePolicies: Object.freeze(["idle", "swinger", "duelist"]),
  defaultPolicy: "idle",
  anatomy: Object.freeze({
    parts: warriorParts,
    vitalityWeights: CONFIG.body.vitalWeight,
  }),
  reach: CONFIG.arm.reachNeutral,
  crownHeight: CONFIG.body.headCentre + CONFIG.body.headRadius,
  vitalHeight: CONFIG.body.torsoCentre,
  collisionRadius: CONFIG.body.pelvisRadius,
  // The asset-runtime session replaces this refusal with the native KayKit
  // skeleton builder. Keeping a named refusal is safer than silently spawning
  // the procedural Fighter under a different registry kind.
  build: () => {
    throw new Error('unit "kaykit-knight" runtime is not installed');
  },
});

export const UNIT_REGISTRY: Readonly<Record<UnitKind, UnitDefinition>> = Object.freeze({
  warrior,
  broot,
  centipede,
  "kaykit-knight": kaykitKnight,
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
  if (unit.compatiblePolicies !== null && !unit.compatiblePolicies.includes(policyName)) {
    throw new Error(`unit "${unit.kind}" does not support policy "${policyName}"`);
  }
  return policyName;
}

/** Human handover and the rig overlay are capabilities, not assumptions. */
export function isArticulatedCombatant(combatant: Combatant): combatant is Fighter {
  return combatant instanceof Fighter;
}
