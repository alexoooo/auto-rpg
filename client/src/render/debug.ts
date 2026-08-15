export type VisibilityRegistryKind =
  | "geometry" | "units" | "shots" | "events" | "furniture"
  | "effects" | "audio" | "picking" | "debug";

export type RendererDebugCounts = Readonly<{
  meshes: number;
  instances: number;
  draws: number;
  triangles: number;
  lights: number;
  shadowCasters: number;
  visibility: Readonly<Record<VisibilityRegistryKind, number>>;
}>;

export type RendererOwnedDebugCounts = Readonly<{
  scene?: Partial<Omit<RendererDebugCounts, "visibility">>;
  visibility?: Partial<Record<VisibilityRegistryKind, number>>;
}>;

const VISIBILITY_KINDS: readonly VisibilityRegistryKind[] = Object.freeze([
  "geometry", "units", "shots", "events", "furniture",
  "effects", "audio", "picking", "debug",
]);

const count = (label: string, value: number): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a nonnegative safe integer`);
  }
  return value;
};

export class RendererDebugRegistry {
  readonly #owners = new Map<string, {
    scene: Record<"meshes" | "instances" | "draws" | "triangles" | "lights" | "shadowCasters", number>;
    visibility: Record<VisibilityRegistryKind, number>;
  }>();

  #emptyOwner() {
    return {
      scene: { meshes: 0, instances: 0, draws: 0, triangles: 0, lights: 0, shadowCasters: 0 },
      visibility: { geometry: 0, units: 0, shots: 0, events: 0, furniture: 0,
        effects: 0, audio: 0, picking: 0, debug: 0 },
    };
  }

  replaceOwnerCounts(owner: string, values: RendererOwnedDebugCounts): void {
    if (!owner.trim()) throw new RangeError("debug count owner must be nonempty");
    const next = this.#emptyOwner();
    for (const key of ["meshes", "instances", "draws", "triangles", "lights", "shadowCasters"] as const) {
      const value = values.scene?.[key];
      if (value !== undefined) next.scene[key] = count(`${owner} ${key}`, value);
    }
    for (const kind of VISIBILITY_KINDS) {
      const value = values.visibility?.[kind];
      if (value !== undefined) next.visibility[kind] = count(`${owner} ${kind}`, value);
    }
    this.#owners.set(owner, next);
  }

  removeOwner(owner: string): void {
    this.#owners.delete(owner);
  }

  setSceneCounts(values: Partial<Omit<RendererDebugCounts, "visibility">>): void {
    const current = this.#owners.get("direct") ?? this.#emptyOwner();
    this.replaceOwnerCounts("direct", { scene: { ...current.scene, ...values }, visibility: current.visibility });
  }

  setVisibilityCount(kind: VisibilityRegistryKind, value: number): void {
    const current = this.#owners.get("direct") ?? this.#emptyOwner();
    this.replaceOwnerCounts("direct", {
      scene: current.scene,
      visibility: { ...current.visibility, [kind]: count(`${kind} visibility count`, value) },
    });
  }

  clear(): void {
    this.#owners.clear();
  }

  snapshot(): RendererDebugCounts {
    const total = this.#emptyOwner();
    for (const owned of this.#owners.values()) {
      for (const key of ["meshes", "instances", "draws", "triangles", "lights", "shadowCasters"] as const) {
        total.scene[key] = count(key, total.scene[key] + owned.scene[key]);
      }
      for (const kind of VISIBILITY_KINDS) {
        total.visibility[kind] = count(`${kind} visibility count`, total.visibility[kind] + owned.visibility[kind]);
      }
    }
    return Object.freeze({
      ...total.scene,
      visibility: Object.freeze({ ...total.visibility }),
    });
  }
}
