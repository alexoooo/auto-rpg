import type { Scene } from "@babylonjs/core/scene.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { GolemMaterialPalette } from "./materials.ts";
import { dressSkeletonPart } from "./skeleton/appearance.ts";

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
const primitives: GolemAppearance = part => part.shells;
/**
 * A skeleton part takes its modelled bone when the page has loaded one, and hands its rune eyes on
 * to the installed appearance; everything else, and every skeleton in a Node harness, goes to the
 * installed appearance or keeps its primitive shells.
 */
export function dressGolemPart(part: AppearancePart, palette: GolemMaterialPalette): readonly AbstractMesh[] {
  const installed = appearances.get(part.host.getScene()) ?? primitives;
  return dressSkeletonPart(part, palette, installed) ?? installed(part, palette);
}
