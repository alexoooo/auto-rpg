import type { Vec3 } from "./spec/quantity.ts";
import { deepFreeze } from "../world/state.ts";

/** Fixed physical geometry, detached from collider handles and decorative meshes. */
export type SolidSense =
  | { readonly name: string; readonly kind: "box"; readonly centre: Vec3; readonly size: Vec3; readonly turn?: number }
  | { readonly name: string; readonly kind: "hull"; readonly centre: Vec3; readonly points: readonly Vec3[] };

/** Each list granted, its frozen copy (`solidSenses`): every body granted the same list senses one copy. */
const GRANTED = new WeakMap<readonly SolidSense[], readonly SolidSense[]>();

/** Trusted grants are copied and frozen, once a list; changing the caller's geometry changes no policy input. */
export function solidSenses(definitions: readonly SolidSense[]): readonly SolidSense[] {
  let granted = GRANTED.get(definitions);
  if (!granted) {
    GRANTED.set(definitions, granted = copiedSolids(definitions));
    // A copy granted again is itself.
    GRANTED.set(granted, granted);
  }
  return granted;
}

function copiedSolids(definitions: readonly SolidSense[]): readonly SolidSense[] {
  const ids = new Set<string>(), tuple = (v: Vec3) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
  for (const solid of definitions) {
    if (!solid.name || ids.has(solid.name) || !tuple(solid.centre)) throw new Error("invalid sensed solid identity or position");
    ids.add(solid.name);
    switch (solid.kind) {
      case "box":
        if (!tuple(solid.size) || solid.size.some(v => v <= 0) || !Number.isFinite(solid.turn ?? 0)) throw new Error("invalid sensed box");
        break;
      case "hull":
        if (solid.points.length < 4 || solid.points.some(v => !tuple(v))) throw new Error("invalid sensed hull");
        break;
      default: { const never: never = solid; throw new Error(`unknown sensed solid ${never}`); }
    }
  }
  return deepFreeze(structuredClone(definitions));
}

/** Detached external rigid-object measurements; named points are in the object's local frame. */
export interface ObjectSense {
  readonly id: string;
  readonly owner: string | null;
  readonly points: Readonly<Record<string, Vec3>>;
  readonly time: number;
  readonly mass: number;
  readonly position: Vec3;
  readonly rotation: readonly [number, number, number, number];
  readonly centre: Vec3;
  readonly velocity: Vec3;
  readonly spin: Vec3;
}
