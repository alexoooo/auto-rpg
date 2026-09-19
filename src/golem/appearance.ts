import type { Scene } from "@babylonjs/core/scene.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { GolemMaterialPalette } from "./materials.ts";

/** Browser-installed art; headless assemblies retain the same physical module builders. */
export interface AppearancePart {
  slot: string;
  moduleId: string;
  id: string;
  host: AbstractMesh;
  shells: readonly AbstractMesh[];
}
export type GolemAppearance = (part: AppearancePart, palette: GolemMaterialPalette) => readonly AbstractMesh[];
const appearances = new WeakMap<Scene, GolemAppearance>();
export function installGolemAppearance(scene: Scene, appearance: GolemAppearance): void {
  appearances.set(scene, appearance);
  scene.onDisposeObservable.addOnce(() => appearances.delete(scene));
}
export function dressGolemPart(part: AppearancePart, palette: GolemMaterialPalette): readonly AbstractMesh[] {
  return appearances.get(part.host.getScene())?.(part, palette) ?? part.shells;
}
