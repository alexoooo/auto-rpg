import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";

export type TorchFlamePresentation = Readonly<{
  meshes: readonly Mesh[];
  phase: number;
  dispose(): void;
}>;

function identityPhase(key: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < key.length; index++) {
    value ^= key.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value / 0x1_0000_0000 * Math.PI * 2;
}

/** A compact flame whose silhouette reads before any animation or light does. */
export function createTorchFlame(
  scene: Scene, key: string, position: Vector3,
): TorchFlamePresentation {
  const phase = identityPhase(key);
  const outerMaterial = new StandardMaterial(`room:torch:${key}:outer-material`, scene);
  outerMaterial.diffuseColor = Color3.Black();
  outerMaterial.emissiveColor = new Color3(1, 0.19, 0.025);
  outerMaterial.specularColor = Color3.Black();
  outerMaterial.disableLighting = true;
  outerMaterial.alpha = 0.78;
  outerMaterial.backFaceCulling = false;
  const coreMaterial = new StandardMaterial(`room:torch:${key}:core-material`, scene);
  coreMaterial.diffuseColor = Color3.Black();
  coreMaterial.emissiveColor = new Color3(1, 0.66, 0.12);
  coreMaterial.specularColor = Color3.Black();
  coreMaterial.disableLighting = true;

  const outer = MeshBuilder.CreateCylinder(`room:torch:${key}:flame-outer`, {
    diameterTop: 0.018, diameterBottom: 0.24, height: 0.38, tessellation: 7,
  }, scene);
  const core = MeshBuilder.CreateCylinder(`room:torch:${key}:flame-core`, {
    diameterTop: 0.012, diameterBottom: 0.12, height: 0.24, tessellation: 7,
  }, scene);
  outer.position.copyFrom(position); outer.position.y += 0.10;
  core.position.copyFrom(position); core.position.y += 0.055;
  outer.rotation.y = phase; core.rotation.y = phase * 0.5;
  outer.material = outerMaterial; core.material = coreMaterial;
  for (const mesh of [outer, core]) {
    mesh.isPickable = false;
    mesh.receiveShadows = false;
  }

  let elapsed = 0;
  const observer: Observer<Scene> = scene.onBeforeRenderObservable.add(() => {
    elapsed += Math.min(50, Math.max(0, scene.getEngine().getDeltaTime()));
    const wave = Math.sin(elapsed * 0.0065 + phase);
    outer.scaling.set(1 - wave * 0.045, 1 + wave * 0.07, 1 + wave * 0.035);
    core.scaling.y = 1 - wave * 0.04;
  });
  return Object.freeze({
    meshes: Object.freeze([outer, core]), phase,
    dispose(): void {
      scene.onBeforeRenderObservable.remove(observer);
      outer.dispose(); core.dispose(); outerMaterial.dispose(); coreMaterial.dispose();
    },
  });
}
