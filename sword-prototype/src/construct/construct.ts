import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import type { PhysicsEngine } from "@babylonjs/core/Physics/v2/physicsEngine.js";
import { PhysicsEventType, PhysicsMotionType,
  type IPhysicsCollisionEvent } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";

import { Quiver } from "../arrow.ts";
import { CONFIG } from "../config.ts";
import type { Striking } from "../combat.ts";
import type { Limb } from "../fighter.ts";
import type { BodyView, EffectorView, HandName, HandView, ProjectileView } from "../mind.ts";
import { blankBlocker, selectBlocker } from "../action-primitives.ts";
import { LAYER, layersFor, supportedLayersFor, writeCollisionFilter, type Side } from "../physics.ts";
import type { Combatant, CombatantBuild, UnitKind } from "../units.ts";
import { isHeldStriker, type WeaponKind } from "../hands.ts";
import { compileConstruct, groundedConstructOriginY } from "./compile.ts";
import { ConstructControlEndpoint } from "./control.ts";
import type { ConstructRuntime } from "./runtime.ts";
import { WARDEN_SENSORS, wardenBlueprint, wardenControl, wardenProgram } from "./warden.ts";
import { ConstructMountedSword } from "./striker.ts";
import { ConstructResources } from "./resources.ts";
import type { ActionEffect } from "./scheduler.ts";
import type { ConstructBlueprint } from "./blueprint.ts";
import type { ConstructControlGraph } from "./actions.ts";
import type { ConstructProgram } from "./program.ts";
import { installedSensorsForBlueprint, jointSensorChannels, type SensorSpec } from "./sensors.ts";
import { LiveConstructState } from "./live-state.ts";
import { ConstructDamageTargets, moduleAtContact } from "./damage-target.ts";
import { humanoidProfileMetrics } from "./humanoid.ts";
import { twinbladeProfileMetrics } from "./twinblade.ts";
import { ARBALEST_TACTICS, arbalestProfileMetrics } from "./arbalest.ts";
import { deriveLocomotionAuthority, resolveSupportCarrier, resolveSupportCarrierSet, supportCarrierIsLive,
  type ResolvedSupportCarrier } from "./assisted-locomotion.ts";
import { supportedLocomotionControllerDescriptor } from "./controllers.ts";
import { DEFAULT_SUPPORTED_CARRIER, isStandableUpwardNormalY, PhysicalSupportedLocomotionPort,
  type PhysicalSupportGroupDiagnostic } from
  "../supported-locomotion-production.ts";
import { deriveLocomotionFootprint } from "../supported-locomotion-runtime.ts";
import { constructPostureIsSupported } from "../supported-locomotion-state.ts";

/** Held guards are visible opponent geometry even though they are not severable limbs. */
export function opponentOwnsSightHit(
  opponent: Pick<Combatant, "limbFor" | "parriedBy">,
  body: PhysicsBody,
  point: Vector3,
): boolean {
  return opponent.limbFor(body) !== undefined || opponent.parriedBy(body, point) !== null;
}

export interface ConstructDefinition {
  readonly blueprint: ConstructBlueprint;
  readonly control: ConstructControlGraph;
  readonly program: ConstructProgram;
  readonly sensors: readonly SensorSpec[];
  readonly profile?: ConstructProfile;
}

export interface ConstructProfile { readonly kind: Extract<UnitKind,
  "bronze-warden" | "swordbearer-effigy" | "twinblade-effigy" | "arbalest-effigy">;
  readonly label: string; readonly reach: number; readonly crownHeight: number; readonly vitalHeight: number;
  readonly collisionRadius: number; readonly footPartIds: readonly string[]; }
export const WARDEN_CONSTRUCT_PROFILE: ConstructProfile = Object.freeze({ kind: "bronze-warden", label: "Bronze Warden",
  reach: 1.4, crownHeight: 1.9, vitalHeight: 1.08, collisionRadius: 0.72,
  footPartIds: Object.freeze(["limb-front-left-foot", "limb-front-right-foot", "limb-rear-left-foot", "limb-rear-right-foot"]) });
const HUMANOID_PROFILE_METRICS = humanoidProfileMetrics();
export const HUMANOID_CONSTRUCT_PROFILE: ConstructProfile = Object.freeze({ kind: "swordbearer-effigy", label: "Swordbearer Effigy",
  // These are bind-pose heights above the contact-pad support plane. The pads are
  // colliders too: measuring only the bare foot makes every host consumer 52 mm
  // shorter than the compiled machine it frames and aims at.
  ...HUMANOID_PROFILE_METRICS,
  footPartIds: Object.freeze(["left-foot", "right-foot"]) });
const TWINBLADE_PROFILE_METRICS = twinbladeProfileMetrics();
export const TWINBLADE_CONSTRUCT_PROFILE: ConstructProfile = Object.freeze({
  kind: "twinblade-effigy", label: "Twinblade Effigy", ...TWINBLADE_PROFILE_METRICS,
  footPartIds: Object.freeze(["left-foot", "right-foot"]),
});
const ARBALEST_PROFILE_METRICS = arbalestProfileMetrics();
export const ARBALEST_CONSTRUCT_PROFILE: ConstructProfile = Object.freeze({
  kind: "arbalest-effigy", label: "Arbalest Effigy", ...ARBALEST_PROFILE_METRICS,
  footPartIds: Object.freeze(["left-foot", "right-foot"]),
});
export const constructProfileForBlueprint = (blueprint: ConstructBlueprint): ConstructProfile =>
  blueprint.id === "swordbearer-effigy" ? HUMANOID_CONSTRUCT_PROFILE
    : blueprint.id === "twinblade-effigy" ? TWINBLADE_CONSTRUCT_PROFILE
      : blueprint.id === "arbalest-effigy" ? ARBALEST_CONSTRUCT_PROFILE : WARDEN_CONSTRUCT_PROFILE;

/**
 * The 2026-08-30 twelve-cell humanoid/Warrior corpus collapsed under the generic 1.6 m/s,
 * 9 m/s^2 carrier. Its first all-green physical bracket was 0.80 m/s and 3.0 m/s^2 in both
 * scheduler orders; this remains Construct-specific so the frozen Warrior bracket is unchanged.
 */
export const HUMANOID_CONSTRUCT_SUPPORTED_CARRIER = Object.freeze({
  ...DEFAULT_SUPPORTED_CARRIER,
  maxSpeedMps: 0.80,
  maxAccelerationMps2: 3.0,
});

const NO_HANDS = Object.freeze({}) as Record<HandName, HandView>;
const NO_NATURAL_ATTACKS = Object.freeze({});
const blankThreatHand = (): HandView => ({ weapon: "empty", shoulder: new Vector3(), tip: new Vector3(),
  tipSpeed: 0, tipVelocity: new Vector3(), reach: 0, lost: false, outboard: 1 });
const blankThreatBody = (): BodyView => ({ unit: "warrior", reach: 0, crownHeight: 0, vitalHeight: 0,
  collisionRadius: 0, naturalAttacks: NO_NATURAL_ATTACKS, ground: new Vector3(), facing: 0,
  shoulder: new Vector3(), tip: new Vector3(), tipSpeed: 0,
  hands: { primary: blankThreatHand(), secondary: blankThreatHand() }, crouch: 0, trunkLean: 0,
  trunkTwist: 0, vitality: 1, health: {} });

const controllerPowerW = (controller: string): number => ({
  "hold-joints": 18, "turn-joint-to-angle": 55,
  "quadruped-move": 280, "quadruped-turn": 240, brace: 150, recover: 320,
  "biped-move": 240, "biped-turn": 210, "biped-brace": 135, "biped-recover": 300,
  "aim-direction": 70, "track-target": 90, "sweep-arc": 300, "sweep-compact-arc": 300,
  "swordbearer-target-sweep": 300,
  "twinblade-neutral-hold": 130, "twinblade-scissor-cut": 520,
  "fire-projectile": 60, "guard-mount": 95,
}[controller] ?? 80);

export function boundAimModuleIds(blueprint: ConstructBlueprint,
  control: ConstructControlGraph): readonly string[] {
  const weapon = new Set(blueprint.modules.filter(({ kind }) => kind === "launcher" || kind === "sword")
    .map(({ id }) => id));
  const bound = control.groups.flatMap(({ bindings }) => bindings.output?.modules ?? [])
    .filter((id) => weapon.has(id));
  return Object.freeze([...new Set([...bound, ...weapon])]);
}

/** The first generic construct body; its physical and control roles come entirely from saved data. */
export class Construct implements Combatant {
  readonly kind: UnitKind;
  readonly constructProfile: ConstructProfile;
  readonly side: Side;
  readonly articulated = null;
  readonly runtime: ConstructRuntime;
  readonly state: LiveConstructState;
  readonly control: ConstructControlEndpoint;
  readonly locomotion: PhysicalSupportedLocomotionPort | null;
  readonly limbs: Limb[];
  readonly strikers: Striking[];
  readonly costume: readonly AbstractMesh[];
  lockTarget: Vector3 | null = null;

  private readonly byBody = new Map<PhysicsBody, Limb>();
  private readonly owned = new Set<AbstractMesh>();
  private readonly middle = new Vector3();
  private readonly facingScratch = Matrix.Identity();
  private readonly worldContacts = new Map<string, Set<PhysicsBody>>();
  private readonly contactSlip = new Map<string, number>();
  private readonly contactPoint = new Map<string, Vector3>();
  private readonly contactNormal = new Map<string, Vector3>();
  private readonly publishedSupportPoint = new Map<string, Vector3>();
  private readonly contactObservers: { body: PhysicsBody; observer: Observer<IPhysicsCollisionEvent> }[] = [];
  private readonly quiver: Quiver | null;
  private readonly resources: ConstructResources | null;
  private readonly launcherModule: import("./runtime.ts").ConstructModule | null;
  private readonly magazineId: string | null;
  private readonly projectileRecords: Record<"self" | "opponent", ProjectileView[]> = { self: [], opponent: [] };
  private readonly sensorSpecs: readonly SensorSpec[];
  private readonly previousOpponent = new Vector3();
  private readonly opponentVelocity = new Vector3();
  private readonly localOpponent = new Vector3();
  private readonly localOpponentVelocity = new Vector3();
  private readonly perceivedOpponent = blankThreatBody();
  private readonly selectedBlocker = blankBlocker();
  private readonly localBlocker = new Vector3();
  private readonly localWeapon = new Vector3();
  private readonly muzzleOrigin = new Vector3();
  private readonly muzzleDirection = new Vector3();
  private previousOpponentClock: number | null = null;
  private readonly damageTargets: ConstructDamageTargets;
  private readonly aimModuleIds: readonly string[];
  private readonly mountedEffectors: readonly ConstructMountedSword[];
  private readonly effectorViews: EffectorView[];
  private readonly launcherEffectorIndex: number | null;
  private readonly launcherAngularVelocity = new Vector3();
  private readonly launcherRadius = new Vector3();
  private readonly launcherTangentialVelocity = new Vector3();
  private launcherLooseSerial = 0;

  constructor(ctx: CombatantBuild, selection: "crossbow" | "sword" | ConstructDefinition = "crossbow") {
    this.side = ctx.side;
    const definition = typeof selection === "string" ? null : selection;
    const variant: "crossbow" | "sword" | null = typeof selection === "string" ? selection : null;
    const blueprint = definition ? definition.blueprint : wardenBlueprint(variant as "crossbow" | "sword");
    this.constructProfile = definition?.profile ?? constructProfileForBlueprint(blueprint);
    this.kind = this.constructProfile.kind;
    this.sensorSpecs = installedSensorsForBlueprint(blueprint, definition ? definition.sensors : WARDEN_SENSORS);
    // Grounding is compiled from the selected blueprint, including mounted contact-pad colliders;
    // fixed body-name offsets became false as soon as a second scaled chassis existed.
    const origin = new Vector3(ctx.origin.x,
      ctx.origin.y === 0 ? groundedConstructOriginY(blueprint, ctx.facing) : ctx.origin.y, ctx.origin.z);
    this.runtime = compileConstruct(ctx.scene, blueprint, { faction: ctx.side, origin, facing: ctx.facing });
    const control = definition ? definition.control : wardenControl(variant as "crossbow" | "sword", "assisted");
    this.aimModuleIds = boundAimModuleIds(blueprint, control);
    const power = blueprint.modules.find((module) => module.kind === "power-core");
    const launcher = [...this.runtime.modules.values()].find((module) => module.spec.kind === "launcher") ?? null;
    const magazine = blueprint.modules.find((module) => module.kind === "magazine") ?? null;
    this.launcherModule = launcher;
    this.magazineId = magazine?.id ?? null;
    this.resources = power ? new ConstructResources(
      { id: power.id, capacityJ: power.capacityJ as number, maxOutputW: power.maxOutputW as number },
      control.actions.map((action) => ({ id: `action:${action.id}`, drawW: controllerPowerW(action.controller), heatPerJ: 0.08 })),
      { capacityJ: launcher?.spec.maxHeatJ as number ?? 1200, coolingW: launcher?.spec.coolingW as number ?? 65,
        maxHeatJ: launcher?.spec.maxHeatJ as number ?? 1200 },
      magazine && launcher ? [{ id: magazine.id, capacity: magazine.ammunition as number,
        reloadS: launcher.spec.reloadSeconds as number }] : [],
    ) : null;
    this.state = new LiveConstructState(this.runtime, this.resources);
    const assisted = ctx.locomotionMode === "supported";
    const locomotionActions = control.actions.filter((action) =>
      supportedLocomotionControllerDescriptor(action.controller) !== null);
    const locomotionGroups = [...new Set(locomotionActions.map(({ group }) => group))].map((id) =>
      control.groups.find((group) => group.id === id)).filter((group): group is import("./actions.ts").ControlGroupSpec =>
        group !== undefined);
    if (assisted && (!ctx.locomotionWorld || locomotionActions.length === 0 || locomotionGroups.length === 0)) {
      throw new Error(`supported Construct "${blueprint.id}" has no complete V1 locomotion registration`);
    }
    const support = assisted ? resolveSupportCarrierSet(blueprint, locomotionGroups) : null;
    const supportByGroup = new Map(locomotionGroups.map((group) =>
      [group.id, resolveSupportCarrier(blueprint, group)] as const));
    const supportGroupDiagnostics = (): readonly PhysicalSupportGroupDiagnostic[] => {
      const availability = this.state.locomotionAvailability();
      return Object.freeze([...supportByGroup].map(([id, resolved]) => {
        const group = supportCarrierIsLive(resolved, availability);
        const bindings = resolved.supportBindings.map((binding) => {
          const missingPart = [resolved.carrierPartId, binding.terminalPartId]
            .find((partId) => !availability.isPartAttached(partId));
          const missingJoint = [...resolved.carrierToRootJointIds, ...binding.jointIds]
            .find((jointId) => !availability.livingJointIds.has(jointId));
          const moduleLive = availability.installedModuleIds.has(binding.moduleId);
          const reason = missingPart ? `support part "${missingPart}" is detached`
            : missingJoint ? `support joint "${missingJoint}" is not live`
              : !moduleLive ? `support module "${binding.moduleId}" is not live` : null;
          return Object.freeze({ id: binding.role, live: reason === null, reason });
        });
        return Object.freeze({ id, live: group.live, reason: group.reason,
          bindings: Object.freeze(bindings) });
      }));
    };
    let activeSupport = support;
    let activeBalanceChain = locomotionGroups[0]?.bindings["balance-chain"]?.joints ?? [];
    if (assisted && support) this.installSupportedCollisionFilters(support);
    const carrierPart = support ? this.runtime.part(support.carrierPartId) : null;
    if (assisted && carrierPart) carrierPart.body.setMotionType(PhysicsMotionType.ANIMATED);
    const totalMassKg = blueprint.parts.reduce((sum, part) => sum + part.massKg, 0) +
      blueprint.modules.reduce((sum, module) => sum + module.massKg, 0);
    this.locomotion = assisted && support && carrierPart ? new PhysicalSupportedLocomotionPort({
      id: `${ctx.side}.${blueprint.id}`,
      position: { x: carrierPart.node.position.x, y: carrierPart.node.position.y, z: carrierPart.node.position.z },
      yaw: ctx.facing,
      footprint: deriveLocomotionFootprint({ radiusM: this.constructProfile.collisionRadius,
        heightM: this.constructProfile.crownHeight,
        provenance: { profileId: blueprint.id, source: "construct-bind-geometry", measuredAt: "compiled-bind-pose" } }),
      ownerPartIds: new Set(blueprint.parts.map(({ id }) => id)),
      registry: ctx.locomotionWorld as import("../supported-locomotion-runtime.ts").StandableWorldRegistry,
      supportedMassKg: totalMassKg,
      config: HUMANOID_CONSTRUCT_SUPPORTED_CARRIER,
      supportBindings: support.supportBindings.map(({ role }) => role),
      supportGroups: supportGroupDiagnostics,
      supportPoint: (role) => {
        const binding = activeSupport?.supportBindings.find((candidate) => candidate.role === role);
        if (!binding || !this.state.moduleAvailable(binding.moduleId)) return null;
        const point = this.publishedSupportPoint.get(binding.moduleId);
        return point ? { x: point.x, y: point.y, z: point.z } : null;
      },
      applyAngularDrive: (targetYaw) => {
        const rotation = carrierPart.node.rotationQuaternion ?? Quaternion.Identity();
        const up = Vector3.Up().rotateByQuaternionToRef(rotation, new Vector3());
        const angular = carrierPart.body.getAngularVelocity();
        const actualYaw = rotation.toEulerAngles().y;
        const yawError = Math.atan2(Math.sin(targetYaw - actualYaw), Math.cos(targetYaw - actualYaw));
        const torque = Vector3.Cross(up, Vector3.Up()).scaleInPlace(totalMassKg * 6);
        torque.x -= angular.x * totalMassKg * 7;
        torque.z -= angular.z * totalMassKg * 7;
        torque.y = Math.max(-totalMassKg * 8,
          Math.min(totalMassKg * 8, yawError * totalMassKg * 6 - angular.y * totalMassKg * 5));
        const limit = totalMassKg * 8;
        if (torque.length() > limit) torque.normalize().scaleInPlace(limit);
        carrierPart.body.applyTorque(torque);
      },
      driveAnimatedRoot: (targetVelocity, targetYaw) => {
        const rotation = carrierPart.node.rotationQuaternion ?? Quaternion.Identity();
        const actualYaw = rotation.toEulerAngles().y;
        const yawError = Math.atan2(Math.sin(targetYaw - actualYaw), Math.cos(targetYaw - actualYaw));
        carrierPart.body.setLinearVelocity(new Vector3(targetVelocity.x, 0, targetVelocity.z));
        carrierPart.body.setAngularVelocity(new Vector3(0,
          Math.max(-2.4, Math.min(2.4, yawError * 8)), 0));
      },
      driveRisingRoot: (targetPosition, _targetVelocity, targetYaw) => {
        if (carrierPart.body.getMotionType() !== PhysicsMotionType.ANIMATED) {
          carrierPart.body.setMotionType(PhysicsMotionType.ANIMATED);
        }
        carrierPart.body.setTargetTransform(
          new Vector3(targetPosition.x, targetPosition.y, targetPosition.z),
          Quaternion.RotationAxis(Vector3.Up(), targetYaw));
      },
      releaseRoot: () => {
        if (carrierPart.body.getMotionType() === PhysicsMotionType.ANIMATED) {
          carrierPart.body.setMotionType(PhysicsMotionType.DYNAMIC);
        }
      },
      restoreRoot: () => {
        if (carrierPart.body.getMotionType() === PhysicsMotionType.DYNAMIC &&
            this.state.damage.isAttached(support.carrierPartId)) {
          carrierPart.body.setMotionType(PhysicsMotionType.ANIMATED);
          carrierPart.body.setLinearVelocity(Vector3.Zero());
          carrierPart.body.setAngularVelocity(Vector3.Zero());
        }
      },
      // Construct authority exists only while the scheduler owns a registered Action. Unlike a
      // Fighter's direct input surface, there is no ambient body-level permission to resurrect.
      authority: () => null,
      liveSupport: () => activeSupport !== null &&
        supportCarrierIsLive(activeSupport, this.state.locomotionAvailability()).live,
      postureSupported: () => activeSupport !== null &&
        this.supportedPosture(activeSupport, activeBalanceChain),
      resolveActionAuthority: (action, group) => {
        const descriptor = supportedLocomotionControllerDescriptor(action.controller);
        if (!descriptor) return null;
        const selectedSupport = supportByGroup.get(group.id);
        if (!selectedSupport || !supportCarrierIsLive(selectedSupport, this.state.locomotionAvailability()).live) return null;
        activeSupport = selectedSupport;
        activeBalanceChain = group.bindings["balance-chain"]?.joints ?? [];
        return deriveLocomotionAuthority(blueprint, group, action, descriptor);
      },
      releaseAnatomyCollision: () => this.installOrdinaryCollisionFilters(activeSupport ?? support),
      restoreSupportedAnatomyCollision: () => this.installSupportedCollisionFilters(activeSupport ?? support),
      root: {
        sample: () => {
          const velocity = carrierPart.body.getLinearVelocity();
          const motion = carrierPart.body.getMotionType();
          return { motionType: motion === PhysicsMotionType.DYNAMIC ? "dynamic" :
            motion === PhysicsMotionType.ANIMATED ? "animated" : "static",
          position: { x: carrierPart.node.position.x, y: carrierPart.node.position.y, z: carrierPart.node.position.z },
          velocity: { x: velocity.x, y: velocity.y, z: velocity.z }, massKg: totalMassKg,
          released: !this.state.damage.isAttached(support.carrierPartId) };
        },
        applyForce: (force) => carrierPart.body.applyForce(
          new Vector3(force.x, force.y + totalMassKg * 9.81, force.z), carrierPart.node.position),
        clearDrive: () => {},
      },
    }) : null;
    if (launcher?.spec.projectile) {
      const projectile = launcher.spec.projectile;
      const layers = layersFor(ctx.side);
      const profile: typeof CONFIG.arrow = Object.freeze({ ...CONFIG.arrow,
        count: projectile.poolSize, mass: projectile.massKg, length: projectile.lengthM,
        shaftDiameter: projectile.radiusM * 2 });
      this.quiver = new Quiver(ctx.scene, { hand: null, name: launcher.id,
        layer: layers.arrow, collidesWith: layers.arrowCollides, profile,
        effectorPrefix: launcher.id, damageScale: projectile.damageScale,
        scoringActive: () => this.state.moduleAvailable(launcher.id) }, ctx.materials);
    } else this.quiver = null;
    const program = definition ? definition.program : wardenProgram(variant as "crossbow" | "sword", "assisted");
    this.control = new ConstructControlEndpoint(this.runtime, control, this.sensorSpecs, Object.freeze({
      "construct-hold": null,
      "warden-authored": program,
      "humanoid-authored": program,
      "construct-program": program,
    }), ctx.policyName ?? (definition ? "construct-program" : "construct-hold"), {
      beforeStep: (dt) => { this.state.beforeControlStep(dt); this.quiver?.step(dt); },
      effect: (effect) => this.applyEffect(effect),
      capabilities: () => this.state.capabilities(control),
      admission: (dt, command) => this.state.capabilitiesForCommand(control, command, dt),
      locomotion: this.locomotion ?? undefined,
      locomotionDiagnostic: () => this.locomotion?.diagnostic() ?? null,
    });
    this.limbs = blueprint.parts.map((spec) => {
      const part = this.runtime.part(spec.id);
      const parent = blueprint.joints.find((joint) => joint.childPart === spec.id);
      const attachment = parent ? this.runtime.joint(parent.id).constraint : null;
      const mesh = part.visual.meshes[0];
      const limb: Limb = {
        key: spec.id, label: spec.id.replaceAll("-", " "),
        part: { name: spec.id, mesh, body: part.body, shape: part.shape }, attachment,
        health: spec.health, maxHealth: spec.health, vitalityWeight: spec.vitalityWeight, fatal: spec.fatal,
        severed: false, lastHitAt: -999,
      };
      this.byBody.set(part.body, limb);
      return limb;
    });
    this.damageTargets = new ConstructDamageTargets(this.runtime, this.state, this.byBody);
    const visuals = [
      ...[...this.runtime.parts.values()].flatMap((part) => part.visual.meshes),
      ...[...this.runtime.modules.values()].flatMap((module) => module.visual.meshes),
    ];
    for (const mesh of visuals) this.owned.add(mesh);
    this.costume = Object.freeze(visuals);
    for (const module of this.runtime.modules.values()) {
      if (module.spec.kind !== "contact-sensor") continue;
      const body = module.socket.part.body;
      this.worldContacts.set(module.id, new Set());
      body.setCollisionCallbackEnabled(true);
      const observer = body.getCollisionObservable().add((event) => {
        const membership = event.collidedAgainst?.shape?.filterMembershipMask ?? 0;
        if ((membership & LAYER.WORLD) === 0) return;
        const active = this.worldContacts.get(module.id) as Set<PhysicsBody>;
        if (event.type === PhysicsEventType.COLLISION_FINISHED) {
          active.delete(event.collidedAgainst);
          return;
        }
        active.add(event.collidedAgainst);
        if (event.point) this.contactPoint.set(module.id, event.point.clone());
        if (event.normal) {
          // Havok publishes this observer's manifold normal from the sensor body toward the
          // collided WORLD body. A foot resting on the floor therefore receives -Y. Support
          // owns the surface-facing normal instead: reverse the callback once here so the
          // standable-slope predicate can still reject walls and ceilings by sign.
          this.contactNormal.set(module.id, event.normal.clone().normalize().scaleInPlace(-1));
        }
      });
      if (observer) this.contactObservers.push({ body, observer });
    }
    this.mountedEffectors = [...this.runtime.modules.values()]
      .filter((module) => module.spec.kind === "sword")
      .map((module) => new ConstructMountedSword(module, () => this.state.moduleAvailable(module.id)));
    this.effectorViews = this.mountedEffectors.map(() => ({ weapon: "sword", anchor: new Vector3(),
      tip: new Vector3(), tipVelocity: new Vector3(), reach: 0, lost: false }));
    this.launcherEffectorIndex = launcher ? this.effectorViews.length : null;
    if (launcher) this.effectorViews.push({ weapon: "bow", anchor: new Vector3(),
      tip: new Vector3(), tipVelocity: new Vector3(), reach: 0, lost: false });
    this.strikers = [...this.mountedEffectors];
    if (this.quiver) this.strikers.push(...this.quiver.arrows);
    if (ctx.humanActive) this.control.installHuman();
  }

  get alive(): boolean { return this.vitality > 0; }
  get vitality(): number { return this.state.vitality(); }

  queueStabilityEvent(event: import("../supported-locomotion-state.ts").StabilityEvent): void {
    this.locomotion?.queueStabilityEvent(event);
  }

  observe(opponent: Combatant, _clock: number): void {
    const rootPart = this.runtime.part(this.runtime.blueprint.rootPart);
    const root = rootPart.node;
    const rotation = root.rotationQuaternion ?? Quaternion.Identity();
    const up = Vector3.Up().rotateByQuaternionToRef(rotation, this.middle);
    const supportState = this.locomotion?.state;
    // During an assisted rise the root becomes geometrically upright before the bounded path
    // has completed and before its feet have replanted. Publishing that transient as upright
    // makes the Mind cancel the only Action authorized to finish recovery.
    const coreUpright = Vector3.Dot(up, Vector3.Up()) > 0.72 &&
      supportState !== "fallen" && supportState !== "rising";
    const coreEuler = rotation.toEulerAngles();
    const facts: Record<string, number | boolean> = Object.fromEntries(this.sensorSpecs.map((sensor) =>
      [sensor.id, sensor.unit === "boolean" ? false : 0]));
    const opponentCentre = opponent.centre();
    const opponentSupportState = opponent.locomotion?.state ?? null;
    const elapsed = this.previousOpponentClock === null ? 0 : _clock - this.previousOpponentClock;
    if (elapsed > 0) opponentCentre.subtractToRef(this.previousOpponent, this.opponentVelocity).scaleInPlace(1 / elapsed);
    else this.opponentVelocity.setAll(0);
    const relativeSpeed = this.opponentVelocity.length();
    this.previousOpponent.copyFrom(opponentCentre);
    this.previousOpponentClock = _clock;
    const inverse = Quaternion.Inverse(rotation);
    opponentCentre.subtractToRef(root.position, this.localOpponent).rotateByQuaternionToRef(inverse, this.localOpponent);
    this.opponentVelocity.rotateByQuaternionToRef(inverse, this.localOpponentVelocity);
    // `effectors` is optional for legacy bodies. Clear the pooled record before dispatch so a
    // body that publishes none cannot inherit a mounted weapon from an earlier descriptor.
    this.perceivedOpponent.effectors = undefined;
    opponent.describe(this.perceivedOpponent);
    const blocker = selectBlocker(this.perceivedOpponent, this.selectedBlocker);
    if (blocker.found) {
      this.localBlocker.set(blocker.tip.x - root.position.x, blocker.tip.y - root.position.y,
        blocker.tip.z - root.position.z).rotateByQuaternionToRef(inverse, this.localBlocker);
    } else this.localBlocker.setAll(0);
    const weapon = [this.perceivedOpponent.hands.primary, this.perceivedOpponent.hands.secondary]
      .find((hand) => hand && !hand.lost && isHeldStriker(hand.weapon));
    if (weapon) {
      this.localWeapon.set(weapon.tip.x - root.position.x, weapon.tip.y - root.position.y,
        weapon.tip.z - root.position.z).rotateByQuaternionToRef(inverse, this.localWeapon);
    } else this.localWeapon.setAll(0);
    const launcherPose = this.launcherModule ? this.launcherPose() : null;
    const localMuzzleOrigin = launcherPose?.origin.subtract(root.position)
      .rotateByQuaternionToRef(inverse, new Vector3()) ?? Vector3.Zero();
    const localLauncherForward = launcherPose?.direction
      .rotateByQuaternionToRef(inverse, new Vector3()) ?? Vector3.Zero();
    const launcherClear = launcherPose ? this.launcherLineIsClear(launcherPose) : false;
    const lineOfSight = this.hasLineOfSight(opponent, opponentCentre, launcherPose);
    Object.assign(facts, {
      "core-upright": coreUpright,
      "core-roll-rad": coreEuler.z,
      "core-pitch-rad": coreEuler.x,
      "opponent-range": Vector3.Distance(this.centre(), opponentCentre),
      "opponent-relative-speed": relativeSpeed,
      // This is the opponent's public locomotion state, not a pose guess from its render nodes.
      // Legacy bodies have no assisted state and retain their historical always-upright reading.
      "opponent-upright": opponent.alive && (opponent.locomotion === null ||
        opponent.locomotion === undefined || opponent.locomotion.state === "supported" ||
        opponent.locomotion.state === "staggered"),
      // A fragile launcher can time a follow-up against the bounded rise without wasting its
      // finite magazine on a prone body. Ordinary hardware waits until support is restored.
      "opponent-rising": opponentSupportState === "rising",
      "line-of-sight": lineOfSight,
      "launcher-clear": launcherClear,
      "opponent-local-x": this.localOpponent.x,
      "opponent-local-y": this.localOpponent.y,
      "opponent-local-z": this.localOpponent.z,
      "opponent-local-vx": this.localOpponentVelocity.x,
      "opponent-local-vy": this.localOpponentVelocity.y,
      "opponent-local-vz": this.localOpponentVelocity.z,
      // These are the live compiled ray, not a second copy of socket or projectile dimensions.
      // The mount controller needs them because opponent-local coordinates are rooted at the
      // core while the two-axis launcher is neither rooted there nor fired from its socket.
      "launcher-muzzle-local-x": localMuzzleOrigin.x,
      "launcher-muzzle-local-y": localMuzzleOrigin.y,
      "launcher-muzzle-local-z": localMuzzleOrigin.z,
      "launcher-forward-local-x": localLauncherForward.x,
      "launcher-forward-local-y": localLauncherForward.y,
      "launcher-forward-local-z": localLauncherForward.z,
      // These are equipment facts. Whether the surface is an opening, and which way to move
      // around it, remain policy/controller decisions rather than sensor conclusions.
      "opponent-blocker-present": blocker.found,
      "opponent-blocker-local-x": this.localBlocker.x,
      "opponent-blocker-local-y": this.localBlocker.y,
      "opponent-blocker-local-z": this.localBlocker.z,
      // The sight publishes a live geometric target; the Mind still decides whether and when
      // to fire. Keeping this out of Action parameters lets the generic tracker follow motion
      // without turning an ordinary buckler centre-crossing into a scheduler cancellation.
      "opponent-aim-local-x": this.localOpponent.x + (blocker.found
        ? (this.localBlocker.x >= this.localOpponent.x
          ? -ARBALEST_TACTICS.blockerClearanceM : ARBALEST_TACTICS.blockerClearanceM)
        : 0),
      "opponent-weapon-present": weapon !== undefined,
      "opponent-weapon-local-x": this.localWeapon.x,
      "opponent-weapon-local-y": this.localWeapon.y,
      "opponent-weapon-local-z": this.localWeapon.z,
      "projectile-speed-mps": this.launcherModule?.spec.projectile?.muzzleSpeedMps ?? 1,
      "core-speed-mps": Math.hypot(rootPart.body.getLinearVelocity().x, rootPart.body.getLinearVelocity().z),
      "core-yaw-rate-rad-s": rootPart.body.getAngularVelocity().y,
    });
    const hardware = this.state.hardware();
    const resources = hardware.resources;
    Object.assign(facts, {
      "power-charge-j": resources.chargeJ,
      "heat-j": resources.heatJ,
      overheated: resources.overheated,
    });
    for (const [id, ammunition] of Object.entries(resources.ammunition)) {
      facts[`ammo:${id}`] = ammunition;
      facts[`ammo-${id}`] = ammunition;
    }
    for (const [id, reload] of Object.entries(resources.reloadS)) {
      facts[`reload:${id}`] = reload;
      facts[`reload-${id}`] = reload;
    }
    for (const part of this.runtime.blueprint.parts) {
      facts[`part-health-${part.id}`] = this.state.partHealth(part.id) / part.health;
    }
    for (const module of this.runtime.blueprint.modules) {
      facts[`module-health-${module.id}`] = this.state.moduleHealth(module.id) / module.health;
      // Normalized remaining health answers damage; authored Minds that deliberately change their
      // durability need the saved capacity as a separate fact rather than comparing unlike units.
      facts[`module-max-health-${module.id}`] = module.health;
    }
    for (const joint of this.runtime.joints.values()) {
      facts[`joint-live-${joint.spec.id}`] = hardware.joints.has(joint.spec.id);
      const frames = joint.liveFrames();
      const relative = Quaternion.Inverse(frames.parent.rotation).multiply(frames.child.rotation).normalize();
      const relativeAngular = joint.child.body.getAngularVelocity().subtract(joint.parent.body.getAngularVelocity())
        .rotateByQuaternionToRef(Quaternion.Inverse(frames.parent.rotation), new Vector3());
      for (const channel of jointSensorChannels(joint.spec)) {
        const component = channel.axis === "x" ? relative.x : channel.axis === "y" ? relative.y : relative.z;
        let angle = 2 * Math.atan2(component, relative.w);
        if (angle > Math.PI) angle -= Math.PI * 2;
        if (angle < -Math.PI) angle += Math.PI * 2;
        facts[channel.angle] = angle;
        facts[channel.speed] = channel.axis === "x" ? relativeAngular.x : channel.axis === "y" ?
          relativeAngular.y : relativeAngular.z;
      }
    }
    for (const module of this.runtime.modules.values()) if (module.spec.kind === "contact-sensor") {
      const active = (this.worldContacts.get(module.id)?.size ?? 0) > 0;
      let slip = 0;
      const point = this.contactPoint.get(module.id);
      const normal = this.contactNormal.get(module.id);
      const terminal = point ?? module.socket.liveFrame().position;
      if (active && (!normal || isStandableUpwardNormalY(normal.y))) {
        // Observe publishes the completed solver step immediately before the locomotion
        // boundary consumes it. Havok may omit a continued-contact manifold point, so retain
        // the terminal X/Z while the upward WORLD callback authorizes the floor projection.
        this.publishedSupportPoint.set(module.id, new Vector3(terminal.x, 0, terminal.z));
      } else this.publishedSupportPoint.delete(module.id);
      if (active && point) {
        const body = module.socket.part.body;
        const radius = point.subtract(body.transformNode.position);
        const velocity = body.getLinearVelocity().add(Vector3.Cross(body.getAngularVelocity(), radius));
        const contactNormal = normal ?? Vector3.Up();
        velocity.subtractInPlace(contactNormal.scale(Vector3.Dot(velocity, contactNormal)));
        slip = velocity.length();
      }
      this.contactSlip.set(module.id, slip);
      facts[`contact:${module.id}`] = active;
      facts[`slip:${module.id}`] = slip;
      for (const channel of module.spec.sensorChannels ?? []) {
        if (channel.startsWith("contact-")) facts[channel] = active;
        else if (channel.startsWith("slip-")) facts[channel] = slip;
      }
      // This publication consumes exactly the callbacks from the completed solver step.
      // Persistent contact is reported again by COLLISION_CONTINUED; flight therefore clears
      // on its first callback-free step instead of inheriting a latched body handle forever.
      this.worldContacts.get(module.id)?.clear();
      this.contactPoint.delete(module.id);
      this.contactNormal.delete(module.id);
    }
    this.control.publishFacts(facts, hardware.sensors);
    // Collision callbacks run after control/observe. The pulse published above therefore belongs
    // to one completed physics step, and clearing here makes absence on the next step explicit.
  }

  describe(into: BodyView): void {
    const core = this.runtime.part(this.runtime.blueprint.rootPart).node;
    const rotation = core.rotationQuaternion ?? Quaternion.Identity();
    Matrix.FromQuaternionToRef(rotation, this.facingScratch);
    into.unit = this.kind;
    into.reach = this.constructProfile.reach;
    into.crownHeight = this.constructProfile.crownHeight;
    into.vitalHeight = this.constructProfile.vitalHeight;
    into.collisionRadius = this.constructProfile.collisionRadius;
    into.naturalAttacks = NO_NATURAL_ATTACKS;
    for (let index = 0; index < this.mountedEffectors.length; index += 1) {
      const striker = this.mountedEffectors[index];
      const view = this.effectorViews[index];
      view.anchor.copyFrom(striker.anchorPosition());
      view.tip.copyFrom(striker.tipPosition());
      view.tipVelocity.copyFrom(striker.velocityAt(view.tip));
      view.reach = Vector3.Distance(view.anchor, view.tip);
      view.lost = striker.spent;
    }
    if (this.launcherModule && this.launcherEffectorIndex !== null) {
      const view = this.effectorViews[this.launcherEffectorIndex];
      const pose = this.launcherPose();
      this.launcherModule.root.computeWorldMatrix(true).getTranslationToRef(view.anchor);
      view.tip.copyFrom(pose.origin);
      this.launcherModule.socket.part.body.getLinearVelocityToRef(view.tipVelocity);
      this.launcherModule.socket.part.body.getAngularVelocityToRef(this.launcherAngularVelocity);
      this.launcherRadius.copyFrom(view.tip).subtractInPlace(this.launcherModule.socket.part.node.position);
      Vector3.CrossToRef(this.launcherAngularVelocity, this.launcherRadius, this.launcherTangentialVelocity);
      view.tipVelocity.addInPlace(this.launcherTangentialVelocity);
      view.reach = Vector3.Distance(view.anchor, view.tip);
      view.lost = !this.state.moduleAvailable(this.launcherModule.id);
    }
    into.effectors = this.effectorViews;
    const carrierGround = this.locomotion?.carrierGround();
    if (carrierGround) into.ground.set(carrierGround.x, carrierGround.y, carrierGround.z);
    else into.ground.copyFrom(this.feetPosition());
    into.facing = Math.atan2(this.facingScratch.m[8], this.facingScratch.m[10]);
    into.shoulder.copyFrom(core.position);
    into.tip.copyFrom(this.aimPoint());
    into.tipSpeed = 0;
    into.hands = NO_HANDS;
    into.crouch = 0;
    into.trunkLean = 0;
    into.trunkTwist = 0;
    into.vitality = this.vitality;
    for (const limb of this.limbs) into.health[limb.key] = limb.severed ? 0 : Math.max(0, limb.health / limb.maxHealth);
  }

  publishProjectiles(into: ProjectileView[], at: number, owner: "self" | "opponent"): number {
    if (!this.quiver) return at;
    const pool = this.projectileRecords[owner];
    let index = at;
    for (const arrow of this.quiver.arrows) {
      if (!arrow.live || arrow.spent) continue;
      const slot = index - at;
      const record = pool[slot] ?? { kind: "arrow" as const, owner,
        position: new Vector3(), velocity: new Vector3(), age: 0 };
      pool[slot] = record;
      arrow.tipPositionToRef(record.position);
      arrow.flightVelocityToRef(record.velocity);
      record.age = arrow.age;
      into[index] = record;
      index += 1;
    }
    return index;
  }
  stepProjectiles(dt: number): void { this.quiver?.step(dt); }

  nearestPartTo(point: Vector3): number {
    let nearest = Number.POSITIVE_INFINITY;
    for (const limb of this.limbs) if (!limb.severed) {
      nearest = Math.min(nearest, Vector3.Distance(point, limb.part.mesh.position));
    }
    return nearest;
  }

  feetPosition(): Vector3 {
    const feet = this.constructProfile.footPartIds
      .filter((id) => this.state.damage.isAttached(id))
      .map((id) => this.runtime.parts.get(id)?.node.position)
      .filter((position): position is Vector3 => position !== undefined);
    if (feet.length === 0) {
      const core = this.runtime.part(this.runtime.blueprint.rootPart).node.position;
      return this.middle.set(core.x, 0, core.z);
    }
    return this.middle.set(feet.reduce((sum, foot) => sum + foot.x, 0) / feet.length, 0,
      feet.reduce((sum, foot) => sum + foot.z, 0) / feet.length);
  }

  centre(): Vector3 { return this.runtime.part(this.runtime.blueprint.rootPart).node.position; }

  aimPoint(): Vector3 {
    const module = this.aimModuleIds.map((id) => this.runtime.modules.get(id))
      .find((candidate) => candidate !== undefined && this.state.moduleAvailable(candidate.id));
    return module?.root.position ?? this.centre();
  }

  owns(mesh: AbstractMesh): boolean { return this.owned.has(mesh); }
  limbFor(body: PhysicsBody): Limb | undefined { return this.byBody.get(body); }
  damageTargetFor(body: PhysicsBody, point: Vector3): Limb | undefined {
    return this.damageTargets.targetFor(body, point);
  }
  applyDamage(target: Limb, rawDamage: number): number {
    return this.damageTargets.applyDamage(target, rawDamage);
  }
  parriedBy(body: PhysicsBody, point?: Vector3): { readonly kind: WeaponKind } | null {
    const shield = point ? moduleAtContact(this.runtime, body, point) : null;
    if (shield?.spec.kind !== "shield" || !this.state.moduleAvailable(shield.id)) return null;
    return shield ? { kind: "shield" } : null;
  }

  sever(limb: Limb, direction: Vector3): void {
    void direction;
    const joint = this.runtime.blueprint.joints.find((candidate) => candidate.childPart === limb.key);
    if (!joint) {
      if (this.runtime.blueprint.modules.some((module) => module.id === limb.key)) this.state.destroyModule(limb.key);
      return;
    }
    const detached = new Set(this.state.severJoint(joint.id).severedParts);
    for (const row of this.limbs) if (detached.has(row.key)) {
      row.severed = true;
      row.health = this.state.partHealth(row.key);
    }
  }

  stopFighting(): void { this.control.stopFighting(); }
  /** Count of successful launcher looses, independent of the Quiver's recyclable body slots. */
  launcherLooseCount(): number { return this.launcherLooseSerial; }
  occlusionPoints(): readonly Vector3[] { return [...this.runtime.parts.values()].map((part) => part.node.position); }

  dispose(): void {
    for (const { body, observer } of this.contactObservers) body.getCollisionObservable().remove(observer);
    this.contactObservers.length = 0;
    this.control.dispose();
    this.locomotion?.dispose();
    this.quiver?.dispose();
    this.runtime.dispose();
    this.limbs.length = 0;
  }

  private installSupportedCollisionFilters(support: ResolvedSupportCarrier): void {
    const layers = supportedLayersFor(this.side);
    const legParts = new Set(support.supportBindings.flatMap(({ jointIds }) => jointIds.flatMap((id) => {
      const joint = this.runtime.blueprint.joints.find((candidate) => candidate.id === id);
      return joint ? [joint.parentPart, joint.childPart] : [];
    })).filter((id) => id !== support.carrierPartId && id !== support.rootPartId));
    const moduleLeaves = new Set([...this.runtime.modules.values()].flatMap((module) => module.leafShapes));
    for (const part of this.runtime.parts.values()) {
      const row = legParts.has(part.id)
        ? { membership: layers.leg, collides: layers.legCollides }
        : support.criticalPartIds.includes(part.id)
          ? { membership: layers.trunk, collides: layers.trunkCollides }
          : { membership: layers.arm, collides: layers.armCollides };
      const anatomyLeaves = part.leafShapes.filter((leaf) => !moduleLeaves.has(leaf));
      writeCollisionFilter(part.shape, anatomyLeaves, row.membership, row.collides);
    }
    const ordinary = layersFor(this.side);
    for (const module of this.runtime.modules.values()) {
      if (module.leafShapes.length === 0) continue;
      const row = module.spec.kind === "sword"
        ? { membership: ordinary.sword, collides: ordinary.swordCollides }
        : module.spec.kind === "shield"
          ? { membership: ordinary.shield, collides: ordinary.shieldCollides }
          : module.spec.kind === "launcher"
            ? { membership: ordinary.arrow, collides: ordinary.arrowCollides }
            : { membership: layers.arm, collides: layers.armCollides };
      for (const leaf of module.leafShapes) {
        leaf.filterMembershipMask = row.membership;
        leaf.filterCollideMask = row.collides;
      }
    }
  }

  private installOrdinaryCollisionFilters(support: ResolvedSupportCarrier): void {
    const ordinary = layersFor(this.side);
    const moduleLeaves = new Set([...this.runtime.modules.values()].flatMap((module) => module.leafShapes));
    for (const part of this.runtime.parts.values()) {
      if (!this.state.damage.isAttached(part.id)) continue;
      const row = support.criticalPartIds.includes(part.id)
        ? { membership: ordinary.trunk, collides: ordinary.trunkCollides }
        : { membership: ordinary.arm, collides: ordinary.armCollides };
      const anatomyLeaves = part.leafShapes.filter((leaf) => !moduleLeaves.has(leaf));
      writeCollisionFilter(part.shape, anatomyLeaves, row.membership, row.collides);
    }
    for (const module of this.runtime.modules.values()) {
      if (!this.state.moduleAvailable(module.id) || module.leafShapes.length === 0) continue;
      const row = module.spec.kind === "sword"
        ? { membership: ordinary.sword, collides: ordinary.swordCollides }
        : module.spec.kind === "shield"
          ? { membership: ordinary.shield, collides: ordinary.shieldCollides }
          : module.spec.kind === "launcher"
            ? { membership: ordinary.arrow, collides: ordinary.arrowCollides }
            : { membership: ordinary.arm, collides: ordinary.armCollides };
      for (const leaf of module.leafShapes) {
        leaf.filterMembershipMask = row.membership;
        leaf.filterCollideMask = row.collides;
      }
    }
  }

  private supportedPosture(support: ResolvedSupportCarrier, balanceJointIds: readonly string[]): boolean {
    let cursor = support.carrierPartId;
    let continuous = balanceJointIds.length > 0;
    for (const id of balanceJointIds) {
      const joint = this.runtime.blueprint.joints.find((candidate) => candidate.id === id);
      if (!joint) { continuous = false; break; }
      if (joint.parentPart === cursor) cursor = joint.childPart;
      else if (joint.childPart === cursor) cursor = joint.parentPart;
      else { continuous = false; break; }
    }
    const carrier = this.runtime.part(support.carrierPartId).node;
    const root = this.runtime.part(support.rootPartId).node;
    const terminal = this.runtime.parts.get(cursor)?.node;
    const rotation = carrier.rotationQuaternion ?? Quaternion.Identity();
    const up = Vector3.Up().rotateByQuaternionToRef(rotation, new Vector3());
    // A quadruped's core is both blueprint root and carrier. Treating that identity as zero
    // torso height rejected every root-carried machine before its feet were examined. Its
    // equivalent vertical chain is the measured support plane -> core -> named upper terminal.
    const supportPlaneY = Math.min(...support.supportBindings.map(({ socketId }) =>
      this.runtime.sockets.get(socketId)?.liveFrame().position.y ?? Number.POSITIVE_INFINITY));
    const rootHeightAboveCarrierM = support.carrierPartId === support.rootPartId
      ? root.position.y - supportPlaneY : root.position.y - carrier.position.y;
    return terminal !== undefined && constructPostureIsSupported({ chainContinuous: continuous,
      carrierUpDot: up.y, rootHeightAboveCarrierM,
      terminalHeightAboveRootM: terminal.position.y - root.position.y });
  }

  private applyEffect(effect: ActionEffect): void {
    if (effect.kind !== "fire-projectile" || !this.launcherModule || effect.module !== this.launcherModule.id ||
        !this.quiver || !this.resources || !this.magazineId ||
        !this.state.moduleAvailable(this.launcherModule.id) || !this.state.moduleAvailable(this.magazineId)) return;
    const spec = this.launcherModule.spec;
    const projectile = spec.projectile;
    if (!projectile) throw new Error(`launcher module "${spec.id}" lost its projectile specification`);
    if (!this.launcherLineIsClear()) return;
    try {
      this.resources.fireWithCost(this.magazineId, spec.energyPerShotJ as number, spec.heatPerShotJ as number);
    } catch {
      return;
    }
    const pose = this.launcherPose();
    if (this.quiver.loose(pose.origin, pose.direction, projectile.muzzleSpeedMps,
      this.launcherLooseSerial)) this.launcherLooseSerial += 1;
  }

  private launcherPose(): Readonly<{ origin: Vector3; direction: Vector3 }> {
    if (!this.launcherModule?.spec.projectile) throw new Error("launcher pose requires a blueprint projectile");
    const matrix = this.launcherModule.root.computeWorldMatrix(true);
    Vector3.TransformNormalToRef(Vector3.Forward(), matrix, this.muzzleDirection);
    this.muzzleDirection.normalize();
    Vector3.TransformCoordinatesToRef(Vector3.Zero(), matrix, this.muzzleOrigin);
    this.muzzleOrigin.addInPlace(this.muzzleDirection.scale(this.launcherModule.spec.projectile.lengthM / 2 + 0.04));
    return { origin: this.muzzleOrigin, direction: this.muzzleDirection };
  }

  private launcherLineIsClear(pose = this.launcherPose()): boolean {
    if (!this.launcherModule) return false;
    const end = pose.origin.add(pose.direction.scale(1.2));
    const engine = this.runtime.part(this.runtime.blueprint.rootPart).node.getScene().getPhysicsEngine() as PhysicsEngine | null;
    const hits = engine?.raycastMulti(pose.origin, end) ?? [];
    return !hits.some((hit) => hit.body !== this.launcherModule?.socket.part.body &&
      hit.body !== undefined && this.byBody.has(hit.body));
  }

  private hasLineOfSight(opponent: Combatant, opponentCentre: Vector3,
    launcherPose: Readonly<{ origin: Vector3; direction: Vector3 }> | null = null): boolean {
    const from = launcherPose?.origin ?? this.centre();
    const engine = this.runtime.part(this.runtime.blueprint.rootPart).node.getScene().getPhysicsEngine() as PhysicsEngine | null;
    const hits = engine?.raycastMulti(from, opponentCentre) ?? [];
    const first = [...hits].sort((left, right) => left.hitDistance - right.hitDistance)
      .find((hit) => hit.body !== undefined && !this.byBody.has(hit.body));
    return first?.body !== undefined && opponentOwnsSightHit(opponent, first.body, first.hitPointWorld);
  }
}
