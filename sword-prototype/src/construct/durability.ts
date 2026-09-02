import type { ConstructBlueprint } from "./blueprint.ts";

export type ConstructDurabilityTarget = "base" | "production";

/** Production values remain unselected until a physical qualification report exists. */
export const CONSTRUCT_PRODUCTION_DURABILITY_MULTIPLIERS = Object.freeze({
  swordbearer: null,
  twinblade: null,
  arbalest: null,
  "warden-crossbow": null,
  "warden-sword": null,
} satisfies Readonly<Record<string, number | null>>);

export type DurabilityManifest = Readonly<Record<"parts" | "joints" | "modules",
  readonly Readonly<{ id: string; health: number; armour: number }>[]>>;

/** A pure copy-and-scale operation: health changes once; armour and every other field do not. */
export function scaleConstructDurability(base: ConstructBlueprint,
  multiplier: number): ConstructBlueprint {
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    throw new Error(`durability multiplier must be positive, got ${multiplier}`);
  }
  return {
    ...structuredClone(base),
    parts: base.parts.map((part) => ({ ...structuredClone(part),
      health: part.health * multiplier })),
    joints: base.joints.map((joint) => ({ ...structuredClone(joint),
      health: joint.health * multiplier })),
    modules: base.modules.map((module) => ({ ...structuredClone(module),
      health: module.health * multiplier })),
  };
}

/** The explicit seam between authored base bodies and future installed production bodies. */
export function constructBlueprintForDurability(base: ConstructBlueprint, morphologyId: string,
  target: ConstructDurabilityTarget): ConstructBlueprint {
  if (target === "base") return structuredClone(base);
  const multiplier = CONSTRUCT_PRODUCTION_DURABILITY_MULTIPLIERS[
    morphologyId as keyof typeof CONSTRUCT_PRODUCTION_DURABILITY_MULTIPLIERS];
  if (multiplier === undefined) {
    throw new Error(`no production durability slot for morphology ${JSON.stringify(morphologyId)}`);
  }
  return multiplier === null ? structuredClone(base) : scaleConstructDurability(base, multiplier);
}

export function durabilityManifest(blueprint: ConstructBlueprint): DurabilityManifest {
  return Object.freeze(Object.fromEntries(["parts", "joints", "modules"].map((kind) =>
    [kind, Object.freeze(blueprint[kind as "parts" | "joints" | "modules"]
      .map(({ id, health, armour }) => Object.freeze({ id, health, armour }))
      .sort((left, right) => left.id.localeCompare(right.id)))])
  ) as DurabilityManifest);
}
