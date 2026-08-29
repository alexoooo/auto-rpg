import type { ConstructBlueprint } from "./blueprint.ts";

export interface DamageResult {
  readonly target: string;
  readonly absorbed: number;
  readonly applied: number;
  readonly severedParts: readonly string[];
}

/** Authoritative topology damage, independent of how a renderer depicts the detached subtree. */
export class ConstructDamageState {
  private readonly blueprint: ConstructBlueprint;
  private readonly health = new Map<string, number>();
  private readonly integrity = new Map<string, number>();
  private readonly moduleHealth = new Map<string, number>();
  private readonly detached = new Set<string>();

  constructor(blueprint: ConstructBlueprint) {
    this.blueprint = blueprint;
    for (const part of blueprint.parts) this.health.set(part.id, part.health);
    for (const joint of blueprint.joints) this.integrity.set(joint.id, joint.health);
    for (const module of blueprint.modules) this.moduleHealth.set(module.id, module.health);
  }

  partHealth(id: string): number {
    const value = this.health.get(id);
    if (value === undefined) throw new Error(`damage references missing part "${id}"`);
    return value;
  }

  jointIntegrity(id: string): number {
    const value = this.integrity.get(id);
    if (value === undefined) throw new Error(`damage references missing joint "${id}"`);
    return value;
  }

  isAttached(partId: string): boolean { return !this.detached.has(partId); }

  installedModuleHealth(id: string): number {
    const value = this.moduleHealth.get(id);
    if (value === undefined) throw new Error(`damage references missing module "${id}"`);
    return value;
  }

  damageModule(id: string, rawDamage: number): DamageResult {
    if (!Number.isFinite(rawDamage) || rawDamage < 0) throw new Error(`module "${id}" damage must be finite and non-negative`);
    const module = this.blueprint.modules.find((candidate) => candidate.id === id);
    if (!module) throw new Error(`damage references missing module "${id}"`);
    const absorbed = Math.min(rawDamage, module.armour);
    const applied = Math.max(0, rawDamage - module.armour);
    this.moduleHealth.set(id, Math.max(0, this.installedModuleHealth(id) - applied));
    return Object.freeze({ target: id, absorbed, applied, severedParts: Object.freeze([]) });
  }

  damagePart(id: string, rawDamage: number): DamageResult {
    if (!Number.isFinite(rawDamage) || rawDamage < 0) throw new Error(`part "${id}" damage must be finite and non-negative`);
    const part = this.blueprint.parts.find((candidate) => candidate.id === id);
    if (!part) throw new Error(`damage references missing part "${id}"`);
    const absorbed = Math.min(rawDamage, part.armour);
    const applied = Math.max(0, rawDamage - part.armour);
    this.health.set(id, Math.max(0, this.partHealth(id) - applied));
    return Object.freeze({ target: id, absorbed, applied, severedParts: Object.freeze([]) });
  }

  damageJoint(id: string, damage: number): DamageResult {
    if (!Number.isFinite(damage) || damage < 0) throw new Error(`joint "${id}" damage must be finite and non-negative`);
    const joint = this.blueprint.joints.find((candidate) => candidate.id === id);
    if (!joint) throw new Error(`damage references missing joint "${id}"`);
    const absorbed = Math.min(damage, joint.armour);
    const applied = Math.max(0, damage - joint.armour);
    const prior = this.jointIntegrity(id);
    const remaining = Math.max(0, prior - applied);
    this.integrity.set(id, remaining);
    const severedParts = prior > 0 && remaining === 0 ? this.detachSubtree(joint.childPart) : [];
    return Object.freeze({ target: id, absorbed, applied, severedParts: Object.freeze(severedParts) });
  }

  livingJoints(): ReadonlySet<string> {
    return new Set(this.blueprint.joints.filter((joint) =>
      (this.integrity.get(joint.id) as number) > 0 && !this.detached.has(joint.childPart)
    ).map((joint) => joint.id));
  }

  installedModules(): ReadonlySet<string> {
    const sockets = new Map(this.blueprint.sockets.map((socket) => [socket.id, socket]));
    return new Set(this.blueprint.modules.filter((module) => {
      const socket = sockets.get(module.socket);
      return socket !== undefined && !this.detached.has(socket.part) && this.installedModuleHealth(module.id) > 0;
    }).map((module) => module.id));
  }

  vitality(): number {
    if (this.blueprint.parts.some((part) => part.fatal && this.partHealth(part.id) <= 0)) return 0;
    const weights = this.blueprint.parts.reduce((sum, part) => sum + part.vitalityWeight, 0);
    if (weights <= 0) return 1;
    const remaining = this.blueprint.parts.reduce((sum, part) => sum + part.vitalityWeight *
      (this.detached.has(part.id) ? 0 : this.partHealth(part.id) / part.health), 0);
    return Math.max(0, Math.min(1, remaining / weights));
  }

  private detachSubtree(root: string): string[] {
    const children = new Map<string, string[]>();
    for (const joint of this.blueprint.joints) {
      const rows = children.get(joint.parentPart) ?? [];
      rows.push(joint.childPart);
      children.set(joint.parentPart, rows);
    }
    const result: string[] = [];
    const visit = (id: string): void => {
      if (this.detached.has(id)) return;
      this.detached.add(id);
      result.push(id);
      for (const child of children.get(id) ?? []) visit(child);
    };
    visit(root);
    return result;
  }
}
