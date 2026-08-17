import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Material } from "@babylonjs/core/Materials/material.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Constants } from "@babylonjs/core/Engines/constants.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
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

function flameMaterial(
  scene: Scene, name: string, emissive: Color3,
): StandardMaterial {
  const texture = new Texture("/assets3d/room_vfx_flame.png", scene,
    false, false, Texture.TRILINEAR_SAMPLINGMODE);
  texture.hasAlpha = true;
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  const material = new StandardMaterial(name, scene);
  // Additive emissive sprites preserve the atlas RGB directly. The original
  // alpha-tested StandardMaterial reduced the authored plume to its brightest
  // two or three pixels in live WebGPU even though the PNG alpha was valid.
  material.diffuseColor = Color3.Black();
  material.emissiveColor = emissive;
  material.emissiveTexture = texture;
  material.specularColor = Color3.Black();
  material.disableLighting = true;
  material.alpha = 0.999;
  material.alphaMode = Constants.ALPHA_ADD;
  material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  material.disableDepthWrite = true;
  // Fixtures sit directly on authored masonry sockets. Draw the translucent
  // focal plume after opaque room geometry without letting the wall depth buffer
  // reduce a full flame to the few pixels that protrude beyond its bracket.
  material.depthFunction = Constants.ALWAYS;
  material.backFaceCulling = false;
  return material;
}

/** An authored flame whose transparent silhouette reads before its light does. */
export function createTorchFlame(
  scene: Scene, key: string, position: Vector3,
): TorchFlamePresentation {
  const phase = identityPhase(key);
  const outerMaterial = flameMaterial(scene, "room:torch:" + key + ":outer-material",
    Color3.Black());
  const coreMaterial = flameMaterial(scene, "room:torch:" + key + ":core-material",
    Color3.Black());
  const haloMaterial = new StandardMaterial(`room:torch:${key}:halo-material`, scene);
  haloMaterial.diffuseColor = Color3.Black();
  haloMaterial.emissiveColor = new Color3(1, 0.20, 0.012);
  haloMaterial.specularColor = Color3.Black();
  haloMaterial.disableLighting = true;
  haloMaterial.alpha = 0.18;
  haloMaterial.backFaceCulling = false;

  const outer = MeshBuilder.CreatePlane("room:torch:" + key + ":flame-outer", {
    width: 0.70, height: 1.00, sideOrientation: Mesh.DOUBLESIDE,
  }, scene);
  const core = MeshBuilder.CreatePlane("room:torch:" + key + ":flame-core", {
    width: 0.44, height: 0.72, sideOrientation: Mesh.DOUBLESIDE,
  }, scene);
  const halo = MeshBuilder.CreateSphere(`room:torch:${key}:flame-halo`, {
    diameter: 0.72, segments: 8,
  }, scene);
  outer.position.copyFrom(position); outer.position.y += 0.40;
  core.position.copyFrom(position); core.position.y += 0.32;
  halo.position.copyFrom(position); halo.position.y += 0.16;
  outer.rotation.y = phase; core.rotation.y = phase + Math.PI / 2;
  outer.material = outerMaterial; core.material = coreMaterial; halo.material = haloMaterial;
  for (const mesh of [outer, core, halo]) {
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    mesh.renderingGroupId = 2;
  }

  let elapsed = 0;
  const observer: Observer<Scene> = scene.onBeforeRenderObservable.add(() => {
    elapsed += Math.min(50, Math.max(0, scene.getEngine().getDeltaTime()));
    const wave = Math.sin(elapsed * 0.0065 + phase);
    outer.scaling.set(1 - wave * 0.045, 1 + wave * 0.07, 1 + wave * 0.035);
    core.scaling.y = 1 - wave * 0.04;
    halo.scaling.setAll(1 + wave * 0.045);
  });
  return Object.freeze({
    meshes: Object.freeze([outer, core, halo]), phase,
    dispose(): void {
      scene.onBeforeRenderObservable.remove(observer);
      outer.dispose(); core.dispose(); halo.dispose();
      outerMaterial.dispose(true, true); coreMaterial.dispose(true, true); haloMaterial.dispose();
    },
  });
}
