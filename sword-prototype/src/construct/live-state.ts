import type { ConstructCommand, ConstructControlGraph } from "./actions.ts";
import { applySupportedLocomotionAlternatives, deriveCapabilities,
  type ActionCapability, type HardwareAvailability } from "./capabilities.ts";
import { ConstructDamageState, type DamageResult } from "./damage.ts";
import type { ConstructResources, ResourceView } from "./resources.ts";
import type { ConstructRuntime } from "./runtime.ts";
import { jointSensorChannels } from "./sensors.ts";
import type { LiveSupportAvailability } from "./assisted-locomotion.ts";

const UNPOWERED_RESOURCES: ResourceView = Object.freeze({
  chargeJ: 0,
  heatJ: 0,
  overheated: false,
  ammunition: Object.freeze({}),
  reloadS: Object.freeze({}),
});

/**
 * One authority joining blueprint damage to the compiled machine.
 *
 * Havok reports damage during its collision walk. Damage facts change then, but
 * constraints and compound shapes are reconciled only at the next control edge;
 * that keeps mutation out of Havok callbacks while still making capability loss
 * visible before another controller can write a motor.
 */
export class LiveConstructState {
  readonly damage: ConstructDamageState;
  private readonly runtime: ConstructRuntime;
  private readonly resources: ConstructResources | null;
  private readonly pendingDetachRoots = new Set<string>();
  private readonly disabledModules = new Set<string>();

  constructor(runtime: ConstructRuntime, resources: ConstructResources | null) {
    this.runtime = runtime;
    this.resources = resources;
    this.damage = new ConstructDamageState(runtime.blueprint);
  }

  partHealth(id: string): number { return this.damage.partHealth(id); }
  moduleHealth(id: string): number { return this.damage.installedModuleHealth(id); }
  jointIntegrity(id: string): number { return this.damage.jointIntegrity(id); }
  vitality(): number { return this.damage.vitality(); }
  moduleAvailable(id: string): boolean { return this.damage.installedModules().has(id); }

  /**
   * A limb is only as usable as its weakest real load-bearing element. This is
   * deliberately a minimum rather than a cosmetic average: a cut wrist or a
   * ruined mount is not made safe by an untouched upper arm.
   */
  armIntegrity(arm: "sword" | "left"): number {
    const parts = arm === "sword" ? ["sword-shoulder-yaw", "sword-arm-pitch"] :
      ["left-upper-arm", "left-forearm", "left-wrist", "left-hand"];
    const joints = arm === "sword" ? ["sword-yaw", "sword-pitch"] :
      ["left-shoulder", "left-elbow", "left-wrist", "left-palm"];
    const modules = arm === "sword" ? ["effigy-sword"] : ["effigy-gauntlet", "effigy-left-sword"];
    const blueprint = this.runtime.blueprint;
    const ratios = [
      ...parts.filter((id) => blueprint.parts.some((row) => row.id === id)).map((id) => {
        const spec = blueprint.parts.find((row) => row.id === id);
        return Math.max(0, this.partHealth(id) / spec!.health);
      }),
      ...joints.filter((id) => blueprint.joints.some((row) => row.id === id)).map((id) => {
        const spec = blueprint.joints.find((row) => row.id === id);
        return Math.max(0, this.jointIntegrity(id) / spec!.health);
      }),
      ...modules.filter((id) => blueprint.modules.some((row) => row.id === id)).map((id) => {
        const spec = blueprint.modules.find((row) => row.id === id);
        return this.moduleAvailable(id) ? Math.max(0, this.moduleHealth(id) / spec!.health) : 0;
      }),
    ];
    return ratios.length ? Math.max(0, Math.min(1, ...ratios)) : 0;
  }

  /** One bounded control consequence of the published real-damage integrity. */
  motorScaleForJoint(joint: string): number {
    const arm = ["sword-yaw", "sword-pitch"].includes(joint) ? "sword" :
      ["left-shoulder", "left-elbow", "left-wrist", "left-palm"].includes(joint) ? "left" : null;
    if (arm === null) return 1;
    const integrity = this.armIntegrity(arm);
    if (arm === "left") {
      // A stone gauntlet is a real off-centre load. Its normal 60% actuator ceiling is not a
      // hidden kinematic restraint; it stops a defensive posture from injecting enough angular
      // impulse to overturn the independently supported biped. Damage reduces that ceiling in
      // the same staged way instead of snapping a usable arm from full force to none.
      if (integrity <= 0.25) return 0.35;
      if (integrity <= 0.60) return 0.48;
      return 0.60;
    }
    if (integrity <= 0.25) return 0.55;
    if (integrity <= 0.60) return 0.72;
    return 1;
  }

  damagePart(id: string, rawDamage: number): DamageResult {
    return this.damage.damagePart(id, rawDamage);
  }

  damageModule(id: string, rawDamage: number): DamageResult {
    const result = this.damage.damageModule(id, rawDamage);
    if (!this.damage.installedModules().has(id)) this.disabledModules.add(id);
    return result;
  }

  destroyModule(id: string): DamageResult {
    const module = this.runtime.blueprint.modules.find((candidate) => candidate.id === id);
    if (!module) throw new Error(`damage references missing module "${id}"`);
    return this.damageModule(id, module.armour + this.damage.installedModuleHealth(id));
  }

  damageJoint(id: string, rawDamage: number): DamageResult {
    const joint = this.runtime.blueprint.joints.find((candidate) => candidate.id === id);
    if (!joint) throw new Error(`damage references missing joint "${id}"`);
    const result = this.damage.damageJoint(id, rawDamage);
    if (result.severedParts.length) this.pendingDetachRoots.add(joint.childPart);
    return result;
  }

  severJoint(id: string): DamageResult {
    const joint = this.runtime.blueprint.joints.find((candidate) => candidate.id === id);
    if (!joint) throw new Error(`damage references missing joint "${id}"`);
    return this.damageJoint(id, joint.armour + this.damage.jointIntegrity(id));
  }

  /** Apply queued topology before the resource/capability/admission edge. */
  beforeControlStep(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) throw new Error("construct live-state dt must be finite and positive");
    for (const root of this.pendingDetachRoots) this.runtime.detachSubtree(root);
    this.pendingDetachRoots.clear();
    for (const id of this.disabledModules) this.runtime.modules.get(id)?.disable();
    this.disabledModules.clear();
  }

  /** Fixed-step power admission uses the same priorities and stable source indices as actions. */
  capabilitiesForCommand(graph: ConstructControlGraph, command: ConstructCommand, dt: number): readonly ActionCapability[] {
    if (!this.resources) return this.capabilities(graph);
    this.resources.advance(dt);
    const base = this.capabilities(graph);
    const chosen = new Map<string, typeof command.requests[number]>();
    for (const scheduled of command.requests) {
      const prior = chosen.get(scheduled.request.action);
      if (!prior || scheduled.priority > prior.priority ||
          (scheduled.priority === prior.priority && scheduled.sourceIndex < prior.sourceIndex)) {
        chosen.set(scheduled.request.action, scheduled);
      }
    }
    const decisions = this.resources.admit(dt, [...chosen.values()].map((scheduled) => ({
      consumer: `action:${scheduled.request.action}`,
      priority: scheduled.priority,
      declarationIndex: scheduled.sourceIndex,
    })));
    const refusal = new Map(decisions.filter(({ admitted }) => !admitted)
      .map(({ consumer, reason }) => [consumer.slice("action:".length), reason as string]));
    const powered = base.map((capability) => {
      const reason = refusal.get(capability.action);
      return reason && capability.available ? Object.freeze({ ...capability, available: false, reason }) : capability;
    });
    return applySupportedLocomotionAlternatives(graph, powered,
      [...chosen.values()].map(({ request }) => request.action));
  }

  hardware(): HardwareAvailability {
    const modules = this.damage.installedModules();
    const sensors = new Set<string>();
    for (const module of this.runtime.blueprint.modules) {
      if (!modules.has(module.id)) continue;
      for (const channel of module.sensorChannels ?? []) sensors.add(channel);
    }
    for (const part of this.runtime.blueprint.parts) if (this.damage.isAttached(part.id)) {
      sensors.add(`part-health-${part.id}`);
    }
    for (const jointId of this.damage.livingJoints()) {
      const joint = this.runtime.blueprint.joints.find(({ id }) => id === jointId);
      if (!joint) throw new Error(`living joint "${jointId}" is absent from its runtime blueprint`);
      for (const channel of jointSensorChannels(joint)) {
        sensors.add(channel.angle);
        sensors.add(channel.speed);
      }
    }
    for (const module of this.runtime.blueprint.modules) if (modules.has(module.id)) {
      sensors.add(`module-health-${module.id}`);
      if (module.kind === "power-core") sensors.add("power-charge-j");
      if (module.kind === "launcher") { sensors.add("heat-j"); sensors.add("overheated"); }
      if (module.kind === "magazine") { sensors.add(`ammo-${module.id}`); sensors.add(`reload-${module.id}`); }
    }
    const hasDeclaredPower = this.runtime.blueprint.modules.some((module) => module.kind === "power-core");
    const hasLivingPower = this.runtime.blueprint.modules.some((module) =>
      module.kind === "power-core" && modules.has(module.id));
    const livingPower = this.runtime.blueprint.modules.find((module) =>
      module.kind === "power-core" && modules.has(module.id));
    const published = this.resources?.view ?? (livingPower
      ? Object.freeze({ ...UNPOWERED_RESOURCES, chargeJ: livingPower.capacityJ as number })
      : UNPOWERED_RESOURCES);
    const resources = hasDeclaredPower && !hasLivingPower ? Object.freeze({ ...published, chargeJ: 0 }) : published;
    return Object.freeze({ joints: this.damage.livingJoints(), modules, sensors, resources });
  }

  /** Called after `beforeControlStep`: all queued topology mutation is then reflected here. */
  locomotionAvailability(): LiveSupportAvailability {
    return Object.freeze({ livingJointIds: this.damage.livingJoints(),
      installedModuleIds: this.damage.installedModules(),
      isPartAttached: (id: string) => this.damage.isAttached(id) });
  }

  capabilities(graph: ConstructControlGraph): readonly ActionCapability[] {
    const restricted = deriveCapabilities(graph, this.hardware()).map((capability) => {
      const arm = ["sweep", "guard", "aim"].includes(capability.action) ? "sword" :
        ["offhand-guard", "gauntlet-strike"].includes(capability.action) ? "left" : null;
      if (arm === null) return capability;
      const integrity = this.armIntegrity(arm);
      if (integrity <= 0) {
        return Object.freeze({ ...capability, available: false, reason: `${arm} arm is disabled` });
      }
      if (!capability.available) return capability;
      const offensive = arm === "sword" ? capability.action === "sweep" : capability.action === "gauntlet-strike";
      if (offensive && integrity <= 0.25) {
        return Object.freeze({ ...capability, available: false,
          reason: `${arm} arm is critically damaged; defensive actions only` });
      }
      return capability;
    });
    return applySupportedLocomotionAlternatives(graph, restricted);
  }
}
