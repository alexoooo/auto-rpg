import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Hand } from "../core/control/motor.ts";

/** Presentation only: neither clothing nor finger poses changes the simulated body. */
export interface Clothing { readonly boots: boolean; readonly armour: boolean }

/** Inputs belonging to one dressed body, never to a cached asset. */
export interface SkinOptions {
  readonly clothing: Clothing;
  readonly closure?: (hand: Hand) => number;
}

/** One body's visual instance; shared source assets remain owned by their scene. */
export interface SkinView {
  readonly meshes: readonly Mesh[];
  setEnabled(enabled: boolean): void;
  wear(clothing: Clothing): void;
  dispose(): void;
}
