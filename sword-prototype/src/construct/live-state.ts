import type { ConstructCommand, ConstructControlGraph } from "./actions.ts";
import { deriveCapabilities, type ActionCapability, type HardwareAvailability } from "./capabilities.ts";
import { ConstructDamageState, type DamageResult } from "./damage.ts";
import type { ConstructResources, ResourceView } from "./resources.ts";
import type { ConstructRuntime } from "./runtime.ts";
import { jointSensorChannels } from "./sensors.ts";

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
    return base.map((capability) => {
      const reason = refusal.get(capability.action);
      return reason && capability.available ? Object.freeze({ ...capability, available: false, reason }) : capability;
    });
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

  capabilities(graph: ConstructControlGraph): readonly ActionCapability[] {
    return deriveCapabilities(graph, this.hardware());
  }
}
