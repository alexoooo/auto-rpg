import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";

import { CONFIG } from "./config.ts";
import type { GolemSetup, UnitSelectionRules } from "./bout.ts";
import { defaultGolemDimensions, defaultGolemSetup } from "./golem/build.ts";
import { Golem } from "./golem/golem.ts";
import { GOLEM_CONTROL_SURFACE } from "./golem/golem-control.ts";
import { BROOT_PROFILE, Fighter, type FighterMaterials, type Limb } from "./fighter.ts";
import type { Striking } from "./combat.ts";
import type { ControlEndpoint } from "./control-host.ts";
import type { SupportedLocomotionPort } from "./supported-locomotion.ts";
import type { StabilityEvent } from "./supported-locomotion-state.ts";
import type { StandableWorldRegistry } from "./supported-locomotion-runtime.ts";
import type { HumanoidHumanSource } from "./humanoid-control.ts";
import { handsFor, isWeaponKind, WEAPON_KINDS, type WeaponKind } from "./hands.ts";
import { POLICIES, splitMind, type HandCursors, type HandName, type Mind } from "./mind.ts";
import type { Side } from "./physics.ts";
import { Centipede, CENTIPEDE_BITE_REACH, CENTIPEDE_CROWN, CENTIPEDE_RADIUS, CENTIPEDE_SEGMENTS } from "./bodies/centipede.ts";

/** A body kind accepted at the setup boundary. */
export type UnitKind = "warrior" | "broot" | "centipede" | "golem";

export type LocomotionMode = "legacy" | "supported";
export const SUPPORTED_LOCOMOTION_PORT_V1 = "supported-locomotion-v1" as const;
export type SupportedLocomotionCompatibility = typeof SUPPORTED_LOCOMOTION_PORT_V1;

export interface UnitLoadout {
  readonly primary: WeaponKind;
  readonly secondary: WeaponKind;
}

export interface AnatomyDefinition {
  readonly parts: readonly string[];
  readonly vitalityWeights: Readonly<Record<string, number>>;
  /** Authoritative maximum durability by selectable body part. */
  readonly durability: Readonly<Record<string, number>>;
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
  /** Pair-owned and immutable. Omitted direct harnesses retain historical locomotion. */
  readonly locomotionMode?: LocomotionMode;
  readonly locomotionWorld?: StandableWorldRegistry;
  /**
   * The five-slot build, for a unit that is assembled rather than equipped.
   *
   * Beside `loadout` rather than instead of it, because they are the same field for two kinds of
   * body: a Warrior's two hands say what it is carrying and a golem's five slots say what it is
   * made of, and no body reads both. Absent falls back to the unit's own default, which is what
   * every harness that does not care about the build gets.
   */
  readonly golem?: GolemSetup;
}

/**
 * What a takeover finds when it picks a body up, and what it measures the pickup by.
 *
 * Allocated per takeover rather than published, because a takeover happens on a click or a console
 * call and never in a loop -- the opposite of everything on `BodyView`, which is republished 240
 * times a second and may allocate nothing.
 */
export interface DrivenPose {
  /**
   * Where the cursor has to sit for this body to be commanded into the pose it is in, or null
   * when there is no pose to seed from.
   *
   * Null is a real answer and not a failure. A Warrior whose sword arm has been cut off is still
   * worth taking -- it walks, it turns, it can be hit -- but seeding from the angles it happens to
   * still be carrying would write a cursor position describing a pose that stopped existing when
   * the limb came off. `refusal` says which.
   */
  readonly cursors: HandCursors | null;
  /** Why there is no seed, when there is none. Named, so a reading can print the sentence. */
  readonly refusal: string | null;
  /**
   * The commanded business end, in the body's own trunk frame, metres.
   *
   * The quantity the takeover acceptance is written against. A blade mid-swing legitimately moves
   * 42 mm of *tip* in one 240 Hz substep, so a tip displacement across a handover cannot tell a
   * teleport from a swing; the commanded point moves a millimetre or two even during the fastest
   * stroke, so anything above that is the handover and nothing else. Trunk-local, because a body
   * that is walking is being translated and turned during the same step.
   */
  readonly command: { readonly x: number; readonly y: number; readonly z: number };
  /** Where the business end actually is, world. The literal reading, kept because somebody wants it. */
  readonly tip: Vector3;
}

/**
 * A body a person can take over: it can report where its cursor would have to be, and accept a
 * driver.
 *
 * **This is what replaced `isArticulatedCombatant` as the takeover's gate.** That predicate asked
 * "is this concrete `Fighter`", which happened to be the same question for as long as the only
 * takeable body was a Warrior, and stopped being the same question the moment a golem could be
 * driven with the same mouse. What the host actually needs is three things -- swap the mind, read
 * the published view for the posture seed, and ask where the cursor goes -- and none of the three
 * is a fact about humanoid anatomy.
 *
 * `isArticulatedCombatant` survives beside it and still means what it says: `scripts/measure.mjs`
 * asks it in order to reach `Fighter.armed`, which is a question about an arm. The two are
 * different questions and they were one predicate.
 */
export interface DrivableCombatant {
  /** Who is driving. Assignment installs a new mind through the body's own control endpoint. */
  mind: Mind;
  /** The published view, for the posture half of the seed. */
  readonly view: import("./mind.ts").FighterView;
  drivenPose(): DrivenPose;
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
  /**
   * The takeover capability port: this body when a person can drive it, null when they cannot.
   *
   * The same shape as `articulated` above and for the same stated reason -- an explicit port
   * rather than a duck-type -- but a much narrower question. A `Centipede` answers null today not
   * because a person cannot steer one (they can, from the setup screen) but because mid-bout
   * takeover was never wired for it and quietly turning it on here would be this session widening
   * a body it did not build.
   */
  readonly humanDriver: DrivableCombatant | null;
  /**
   * The body an overhead camera sits behind, or absent for a body with nothing that reads as a
   * heading.
   *
   * The camera reads this through `getWorldMatrix()` **deliberately**, which is the opposite of
   * the rule everywhere else here: the matrix short-circuits on the render id, so what it gets is
   * the root as of the last `scene.render()` rather than as of the physics steps since -- one
   * frame of extra lag on the facing, on top of the lag the follow blend puts there on purpose.
   * Forcing the recompute would tighten it and change how Overhead frames a turn.
   */
  chaseRoot?(): AbstractMesh | null;
  /**
   * The two live gauge numbers, or absent for a body with no business end to report.
   *
   * On the body rather than computed by the host, because "how fast is the point going and how
   * squarely is the edge meeting it" has a different answer for a held weapon, a golem terminal
   * and a set of jaws, and the host asking each of them by name is the switch the registry exists
   * to remove.
   */
  strikeReadout?(): { readonly tipSpeed: number; readonly edgeAlignment: number };
  /**
   * What this body's own modules are worth, or absent for a body that is not assembled from any.
   *
   * The verdict's parts-bin settlement is the only reader, and the same argument as the two ports
   * above applies: "what came off you, and how worn is what is still on you" has an answer for an
   * assembled body and no answer at all for a Warrior, whose arm is three bones and a held sword
   * rather than a module somebody could fit onto something else.
   */
  moduleReport?(): readonly import("./golem/parts-bin.ts").GolemModuleReport[];
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
  /** Presentation-only body maintenance after both command drivers have stopped. */
  stepPostVerdictPresentation?(dt: number): void;
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
  readonly supportedLocomotionPort: SupportedLocomotionCompatibility | null;
  readonly defaultPolicy: string;
  readonly anatomy: AnatomyDefinition;
  readonly reach: number;
  readonly crownHeight: number;
  readonly vitalHeight: number;
  readonly collisionRadius: number;
  /** Humanoid compatibility only; a body with its own typed driver answers null. */
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

const warriorParts = Object.freeze(Object.keys(CONFIG.body.vitalWeight));
const humanoidDurability = (scale = 1): Readonly<Record<string, number>> => Object.freeze(Object.fromEntries(
  warriorParts.map((part) => [part, CONFIG.body.partHealth * scale *
    (part === "torso" ? CONFIG.body.torsoHealth : part === "pelvis" ? CONFIG.body.pelvisHealth : 1)]),
));
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
  supportedLocomotionPort: SUPPORTED_LOCOMOTION_PORT_V1,
  defaultPolicy: "idle",
  anatomy: Object.freeze({
    parts: warriorParts,
    vitalityWeights: CONFIG.body.vitalWeight,
    durability: humanoidDurability(),
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
    locomotionMode: ctx.locomotionMode,
    locomotionWorld: ctx.locomotionWorld,
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
  supportedLocomotionPort: SUPPORTED_LOCOMOTION_PORT_V1,
  defaultPolicy: "idle",
  anatomy: Object.freeze({
    parts: warriorParts,
    vitalityWeights: CONFIG.body.vitalWeight,
    durability: humanoidDurability(BROOT_PROFILE.healthScale),
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
    locomotionMode: ctx.locomotionMode,
    locomotionWorld: ctx.locomotionWorld,
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
  supportedLocomotionPort: null,
  defaultPolicy: "crawler",
  anatomy: Object.freeze({ parts: centipedeParts, vitalityWeights: centipedeWeights,
    durability: Object.freeze(Object.fromEntries(centipedeParts.map((part) =>
      [part, part === "head" ? 4.5 : 2.4]))) }),
  reach: CENTIPEDE_BITE_REACH,
  crownHeight: CENTIPEDE_CROWN,
  vitalHeight: CENTIPEDE_CROWN * 0.55,
  collisionRadius: CENTIPEDE_RADIUS,
  createPolicy: (name: string, seed?: number) => policyFactory("centipede", centipede.driverOptions)(name, seed),
  build: (ctx: CombatantBuild) => new Centipede({ ...ctx, mind: initialMind(ctx, centipede),
    loadout: initialLoadout(ctx, centipede) }),
});

/**
 * The golem: five modules, no held equipment, and the same mouse.
 *
 * **`hands` is 2 and the two hands are the two effector sockets.** Not a coincidence and not a
 * widening: `Intent` splits a person's command into `primary` and `secondary` hand channels, a
 * golem has exactly two effector sockets, and calling them by the channel names is what lets
 * `HandName` fit without a third vocabulary, lets `splitMind` find a hand to give the person, and
 * keeps every hand-keyed record in `src/options.ts` working. A golem head files its blows with
 * `hand` null through the body-neutral channel, exactly as a centipede's jaws do.
 *
 * **`equipment` is the setup sentinel and nothing else.** A golem carries nothing: its weapons are
 * its body, which is what the overview means by "modding the unit replaces choosing equipment". So
 * both hand pickers are disabled for this row and the five slot pickers are what a corner edits,
 * through `SideSetup.golem`.
 *
 * `compatiblePolicies` is `idle` alone, and that is honest rather than restrictive: the scripted
 * policies in `src/policies.ts` are written for a Warrior's arm -- their ranges are a weapon's
 * length in disguise and their stroke geometry is a right arm's -- and pointing one at a golem
 * would be measuring a policy against a body it has never seen. Session 09 is the golem's mind.
 */
const golem: UnitDefinition = Object.freeze({
  kind: "golem",
  label: "Golem",
  equipment: Object.freeze(["empty"] as WeaponKind[]),
  loadouts: freezeLoadouts([{ primary: "empty", secondary: "empty" }]),
  defaultLoadout: emptyLoadout,
  hands: 2,
  compatiblePolicies: Object.freeze(["idle"]),
  driverOptions: drivers(["idle"]),
  humanAdapter: true,
  controlSurface: GOLEM_CONTROL_SURFACE,
  supportedLocomotionPort: SUPPORTED_LOCOMOTION_PORT_V1,
  defaultPolicy: "idle",
  defaultGolem: defaultGolemSetup(),
  /**
   * **A golem has no per-unit anatomy, and an empty record is the honest answer.**
   *
   * Every other row here describes a fixed body: a Warrior has twelve parts with fixed keys and
   * fixed weights whichever sword it is holding. A golem's parts are whatever its five modules
   * declare, their keys carry the side they were built on, and their vitality weights are scaled
   * to the build they end up in -- so a registry-level anatomy could only ever describe one build
   * and would be false for every other. What a caller actually wants is on the assembled body:
   * `Golem.limbs` carries the parts and `BodyView.health` publishes them. Nothing in this tree
   * reads `UnitDefinition.anatomy` at all, which is why filling it with a plausible-looking
   * default build would be a promise nobody checks and nobody could rely on.
   */
  anatomy: Object.freeze({
    parts: Object.freeze([]),
    vitalityWeights: Object.freeze({}),
    durability: Object.freeze({}),
  }),
  ...defaultGolemDimensions(),
  createPolicy: (name: string, seed?: number) => policyFactory("golem", golem.driverOptions)(name, seed),
  build: (ctx: CombatantBuild) => new Golem(ctx.scene, {
    side: ctx.side,
    origin: ctx.origin,
    facing: ctx.facing,
    setup: ctx.golem ?? defaultGolemSetup(),
    mind: initialMind(ctx, golem),
    human: ctx.human,
    controlPolicies: golem.driverOptions,
    controlPolicyName: ctx.policyName,
    controlPolicyFactory: golem.createPolicy ?? undefined,
    locomotionWorld: ctx.locomotionWorld,
  }),
});

export const UNIT_REGISTRY: Readonly<Record<UnitKind, UnitDefinition>> = Object.freeze({
  warrior,
  broot,
  centipede,
  golem,
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

/** One construction-time decision; a live pair never enables only one body or falls back. */
export function locomotionModeForPair(
  left: Pick<UnitDefinition, "supportedLocomotionPort">,
  right: Pick<UnitDefinition, "supportedLocomotionPort">,
): LocomotionMode {
  return left.supportedLocomotionPort === SUPPORTED_LOCOMOTION_PORT_V1 &&
    right.supportedLocomotionPort === SUPPORTED_LOCOMOTION_PORT_V1 ? "supported" : "legacy";
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
