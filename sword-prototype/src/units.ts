import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";

import { CONFIG } from "./config.ts";
import { BROOT_PROFILE, Fighter, type FighterMaterials, type Limb } from "./fighter.ts";
import type { Striking } from "./combat.ts";
import { isWeaponKind, WEAPON_KINDS, type WeaponKind } from "./hands.ts";
import type { HandName, Mind } from "./mind.ts";
import type { Side } from "./physics.ts";
import { Centipede, CENTIPEDE_BITE_REACH, CENTIPEDE_CROWN, CENTIPEDE_RADIUS, CENTIPEDE_SEGMENTS } from "./bodies/centipede.ts";

/** A body kind accepted at the setup boundary. */
export type UnitKind = "warrior" | "broot" | "centipede";

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
  readonly view: import("./mind.ts").FighterView;
  readonly limbs: Limb[];
  readonly strikers: Striking[];
  readonly costume: readonly AbstractMesh[];
  readonly alive: boolean;
  readonly vitality: number;
  lockTarget: Vector3 | null;
  observe(opponent: Combatant, clock: number): void;
  describe(into: import("./mind.ts").BodyView): void;
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

export interface UnitDefinition {
  readonly kind: UnitKind;
  readonly label: string;
  readonly equipment: readonly WeaponKind[];
  readonly hands: 0 | 2;
  /** Null means every policy can drive the body's articulated input surface. */
  readonly compatiblePolicies: readonly string[] | null;
  readonly anatomy: AnatomyDefinition;
  readonly reach: number;
  readonly crownHeight: number;
  readonly vitalHeight: number;
  readonly collisionRadius: number;
  build(ctx: CombatantBuild): Combatant;
}

const warriorParts = Object.freeze(Object.keys(CONFIG.body.vitalWeight));

const warrior: UnitDefinition = Object.freeze({
  kind: "warrior",
  label: "Warrior",
  equipment: WEAPON_KINDS,
  hands: 2,
  compatiblePolicies: null,
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
  hands: 2,
  compatiblePolicies: null,
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
  hands: 0,
  compatiblePolicies: Object.freeze(["crawler"]),
  anatomy: Object.freeze({ parts: centipedeParts, vitalityWeights: centipedeWeights }),
  reach: CENTIPEDE_BITE_REACH,
  crownHeight: CENTIPEDE_CROWN,
  vitalHeight: CENTIPEDE_CROWN * 0.55,
  collisionRadius: CENTIPEDE_RADIUS,
  build: (ctx: CombatantBuild) => new Centipede(ctx),
});

export const UNIT_REGISTRY: Readonly<Record<UnitKind, UnitDefinition>> = Object.freeze({ warrior, broot, centipede });

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
  return { primary: read(handA), secondary: read(handB) };
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
