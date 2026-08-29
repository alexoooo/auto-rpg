import { ConstructResources } from "./resources.ts";

export interface BoltLaunch {
  readonly projectileId: string;
  readonly moduleId: string;
  readonly sequence: number;
}

/** Finite ammunition authority; a returned projectile slot never creates a new bolt. */
export class ConstructLauncher {
  private readonly moduleId: string;
  private readonly magazineId: string;
  private readonly resources: ConstructResources;
  private sequence = 0;

  constructor(moduleId: string, resources: ConstructResources, magazineId = moduleId) {
    this.moduleId = moduleId;
    this.resources = resources;
    this.magazineId = magazineId;
  }

  fire(): BoltLaunch {
    this.resources.fire(this.magazineId);
    const sequence = this.sequence;
    this.sequence += 1;
    return Object.freeze({ projectileId: `${this.moduleId}-bolt-${sequence}`, moduleId: this.moduleId, sequence });
  }
}
