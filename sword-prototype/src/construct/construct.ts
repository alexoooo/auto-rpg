import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import type { PhysicsEngine } from "@babylonjs/core/Physics/v2/physicsEngine.js";
import { PhysicsEventType, type IPhysicsCollisionEvent } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";

import { Quiver } from "../arrow.ts";
import { CONFIG } from "../config.ts";
import type { Striking } from "../combat.ts";
import type { Limb } from "../fighter.ts";
import type { BodyView, EffectorView, HandName, HandView, ProjectileView } from "../mind.ts";
import { LAYER, layersFor, type Side } from "../physics.ts";
import type { Combatant, CombatantBuild, UnitKind } from "../units.ts";
import type { WeaponKind } from "../hands.ts";
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

export interface ConstructDefinition {
  readonly blueprint: ConstructBlueprint;
  readonly control: ConstructControlGraph;
  readonly program: ConstructProgram;
  readonly sensors: readonly SensorSpec[];
  readonly profile?: ConstructProfile;
}

export interface ConstructProfile { readonly kind: Extract<UnitKind, "bronze-warden" | "swordbearer-effigy">;
  readonly label: string; readonly reach: number; readonly crownHeight: number; readonly vitalHeight: number;
  readonly collisionRadius: number; readonly footPartIds: readonly string[]; }
export const WARDEN_CONSTRUCT_PROFILE: ConstructProfile = Object.freeze({ kind: "bronze-warden", label: "Bronze Warden",
  reach: 1.4, crownHeight: 1.9, vitalHeight: 1.08, collisionRadius: 0.72,
  footPartIds: Object.freeze(["limb-front-left-foot", "limb-front-right-foot", "limb-rear-left-foot", "limb-rear-right-foot"]) });
export const HUMANOID_CONSTRUCT_PROFILE: ConstructProfile = Object.freeze({ kind: "swordbearer-effigy", label: "Swordbearer Effigy",
  reach: 1.3, crownHeight: 2.48, vitalHeight: 1.49, collisionRadius: 0.62,
  footPartIds: Object.freeze(["left-foot", "right-foot"]) });
export const constructProfileForBlueprint = (blueprint: ConstructBlueprint): ConstructProfile =>
  blueprint.id === "swordbearer-effigy" ? HUMANOID_CONSTRUCT_PROFILE : WARDEN_CONSTRUCT_PROFILE;

const NO_HANDS = Object.freeze({}) as Record<HandName, HandView>;
const NO_NATURAL_ATTACKS = Object.freeze({});

const controllerPowerW = (controller: string): number => ({
  "hold-joints": 18, "turn-joint-to-angle": 55,
  "quadruped-move": 280, "quadruped-turn": 240, brace: 150, recover: 320,
  "biped-move": 240, "biped-turn": 210, "biped-brace": 135, "biped-recover": 300,
  "aim-direction": 70, "track-target": 90, "sweep-arc": 300, "fire-projectile": 60, "guard-mount": 95,
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
  private readonly muzzleOrigin = new Vector3();
  private readonly muzzleDirection = new Vector3();
  private previousOpponentClock: number | null = null;
  private readonly damageTargets: ConstructDamageTargets;
  private readonly aimModuleIds: readonly string[];
  private readonly mountedEffectors: readonly ConstructMountedSword[];
  private readonly effectorViews: EffectorView[];

  constructor(ctx: CombatantBuild, selection: "crossbow" | "sword" | ConstructDefinition = "crossbow") {
    this.side = ctx.side;
    const definition = typeof selection === "string" ? null : selection;
    const variant: "crossbow" | "sword" | null = typeof selection === "string" ? selection : null;
    const blueprint = definition ? definition.blueprint : wardenBlueprint(variant as "crossbow" | "sword");
    this.constructProfile = definition?.profile ?? constructProfileForBlueprint(blueprint);
    this.kind = this.constructProfile.kind;
    this.sensorSpecs = installedSensorsForBlueprint(blueprint, definition ? definition.sensors : WARDEN_SENSORS);
    // The committed four-segment chain puts the foot sole 1.33 m below the core bind origin.
    const origin = new Vector3(ctx.origin.x,
      ctx.origin.y === 0 ? groundedConstructOriginY(blueprint, ctx.facing) : ctx.origin.y, ctx.origin.z);
    this.runtime = compileConstruct(ctx.scene, blueprint, { faction: ctx.side, origin, facing: ctx.facing });
    const control = definition ? definition.control : wardenControl(variant as "crossbow" | "sword");
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
    const program = definition ? definition.program : wardenProgram(variant as "crossbow" | "sword");
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
        if (event.normal) this.contactNormal.set(module.id, event.normal.clone().normalize());
      });
      if (observer) this.contactObservers.push({ body, observer });
    }
    this.mountedEffectors = [...this.runtime.modules.values()]
      .filter((module) => module.spec.kind === "sword")
      .map((module) => new ConstructMountedSword(module, () => this.state.moduleAvailable(module.id)));
    this.effectorViews = this.mountedEffectors.map(() => ({ weapon: "sword", anchor: new Vector3(),
      tip: new Vector3(), tipVelocity: new Vector3(), reach: 0, lost: false }));
    this.strikers = [...this.mountedEffectors];
    if (this.quiver) this.strikers.push(...this.quiver.arrows);
    if (ctx.humanActive) this.control.installHuman();
  }

  get alive(): boolean { return this.vitality > 0; }
  get vitality(): number { return this.state.vitality(); }

  observe(opponent: Combatant, _clock: number): void {
    const rootPart = this.runtime.part(this.runtime.blueprint.rootPart);
    const root = rootPart.node;
    const rotation = root.rotationQuaternion ?? Quaternion.Identity();
    const up = Vector3.Up().rotateByQuaternionToRef(rotation, this.middle);
    const coreEuler = rotation.toEulerAngles();
    const facts: Record<string, number | boolean> = Object.fromEntries(this.sensorSpecs.map((sensor) =>
      [sensor.id, sensor.unit === "boolean" ? false : 0]));
    const opponentCentre = opponent.centre();
    const elapsed = this.previousOpponentClock === null ? 0 : _clock - this.previousOpponentClock;
    if (elapsed > 0) opponentCentre.subtractToRef(this.previousOpponent, this.opponentVelocity).scaleInPlace(1 / elapsed);
    else this.opponentVelocity.setAll(0);
    const relativeSpeed = this.opponentVelocity.length();
    this.previousOpponent.copyFrom(opponentCentre);
    this.previousOpponentClock = _clock;
    const inverse = Quaternion.Inverse(rotation);
    opponentCentre.subtractToRef(root.position, this.localOpponent).rotateByQuaternionToRef(inverse, this.localOpponent);
    this.opponentVelocity.rotateByQuaternionToRef(inverse, this.localOpponentVelocity);
    const launcherClear = this.launcherModule ? this.launcherLineIsClear() : false;
    const lineOfSight = this.hasLineOfSight(opponent, opponentCentre);
    Object.assign(facts, {
      "core-upright": Vector3.Dot(up, Vector3.Up()) > 0.72,
      "core-roll-rad": coreEuler.z,
      "core-pitch-rad": coreEuler.x,
      "opponent-range": Vector3.Distance(this.centre(), opponentCentre),
      "opponent-relative-speed": relativeSpeed,
      "line-of-sight": lineOfSight,
      "launcher-clear": launcherClear,
      "opponent-local-x": this.localOpponent.x,
      "opponent-local-y": this.localOpponent.y,
      "opponent-local-z": this.localOpponent.z,
      "opponent-local-vx": this.localOpponentVelocity.x,
      "opponent-local-vy": this.localOpponentVelocity.y,
      "opponent-local-vz": this.localOpponentVelocity.z,
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
    }
    for (const joint of this.runtime.joints.values()) {
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
      if (active && point) {
        const body = module.socket.part.body;
        const radius = point.subtract(body.transformNode.position);
        const velocity = body.getLinearVelocity().add(Vector3.Cross(body.getAngularVelocity(), radius));
        const normal = this.contactNormal.get(module.id) ?? Vector3.Up();
        velocity.subtractInPlace(normal.scale(Vector3.Dot(velocity, normal)));
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
    into.effectors = this.effectorViews;
    into.ground.copyFrom(this.feetPosition());
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
    const feet = this.constructProfile.footPartIds.map((id) => this.runtime.parts.get(id)?.node.position)
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
  occlusionPoints(): readonly Vector3[] { return [...this.runtime.parts.values()].map((part) => part.node.position); }

  dispose(): void {
    for (const { body, observer } of this.contactObservers) body.getCollisionObservable().remove(observer);
    this.contactObservers.length = 0;
    this.control.dispose();
    this.quiver?.dispose();
    this.runtime.dispose();
    this.limbs.length = 0;
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
    this.quiver.loose(pose.origin, pose.direction, projectile.muzzleSpeedMps);
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

  private launcherLineIsClear(): boolean {
    if (!this.launcherModule) return false;
    const pose = this.launcherPose();
    const end = pose.origin.add(pose.direction.scale(1.2));
    const engine = this.runtime.part(this.runtime.blueprint.rootPart).node.getScene().getPhysicsEngine() as PhysicsEngine | null;
    const hits = engine?.raycastMulti(pose.origin, end) ?? [];
    return !hits.some((hit) => hit.body !== this.launcherModule?.socket.part.body &&
      hit.body !== undefined && this.byBody.has(hit.body));
  }

  private hasLineOfSight(opponent: Combatant, opponentCentre: Vector3): boolean {
    const from = this.launcherModule ? this.launcherPose().origin : this.centre();
    const engine = this.runtime.part(this.runtime.blueprint.rootPart).node.getScene().getPhysicsEngine() as PhysicsEngine | null;
    const hits = engine?.raycastMulti(from, opponentCentre) ?? [];
    const first = [...hits].sort((left, right) => left.hitDistance - right.hitDistance)
      .find((hit) => hit.body !== undefined && !this.byBody.has(hit.body));
    return first?.body !== undefined && opponent.limbFor(first.body) !== undefined;
  }
}
