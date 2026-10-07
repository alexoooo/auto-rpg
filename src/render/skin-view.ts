import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Side } from "../core/spec/body.ts";

/** Presentation only: clothing changes no physics; fingers follow the body's applied contact pose. */
export interface Clothing { readonly boots: boolean; readonly armour: boolean }

/** Inputs belonging to one dressed body, never to a cached asset. */
export interface SkinOptions {
  readonly clothing: Clothing;
  readonly closure?: (hand: Side) => number;
}

/** One body's visual instance; shared source assets remain owned by their scene. */
export interface SkinView {
  readonly meshes: readonly Mesh[];
  setEnabled(enabled: boolean): void;
  wear(clothing: Clothing): void;
  dispose(): void;
}
