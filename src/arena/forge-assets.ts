import { publicAssetUrl } from "../asset-url.ts";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import "@babylonjs/loaders/glTF/2.0/glTFLoader.js";
import "@babylonjs/loaders/glTF/glTFFileLoader.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Scene } from "@babylonjs/core/scene.js";

export const ASSET_ROOT = publicAssetUrl("/assets/art-proof/");
/** glTF can deduplicate identical limbs. Baking must not transform their shared buffers twice. */
export function prepareTemplate(mesh: Mesh): void {
  mesh.makeGeometryUnique();
  // Distinct glTF meshes can still reference the same index accessor. flipFaces mutates it.
  mesh.setIndices(Array.from(mesh.getIndices()!));
  mesh.bakeTransformIntoVertices(mesh.computeWorldMatrix(true).clone());
  mesh.parent = null;
  mesh.position.setAll(0); mesh.scaling.setAll(1); mesh.rotationQuaternion = Quaternion.Identity();
  // Every forge template is opaque. glTF COLOR_0 otherwise opts even alpha=1 colors into blending,
  // which leaves the bronze covers out of the depth and shadow passes.
  mesh.hasVertexAlpha = false;
  mesh.setEnabled(false); mesh.isPickable = false;
}
export async function loadTemplates(scene: Scene, file: string): Promise<Map<string, Mesh>> {
  const container = await LoadAssetContainerAsync(ASSET_ROOT + file, scene);
  container.addAllToScene();
  const templates = new Map<string, Mesh>();
  for (const mesh of container.meshes) {
    if (!(mesh instanceof Mesh) || !mesh.getTotalVertices()) continue;
    prepareTemplate(mesh);
    templates.set(mesh.name, mesh);
  }
  return templates;
}

/** The forge's materials, textured from the maps beside its kit. */
export async function forgeMaterials(scene: Scene) {
  const loads: Promise<void>[] = [];
  const map = (name: string, gamma: boolean) => {
    let resolve!: () => void; let reject!: (e: Error) => void;
    loads.push(new Promise<void>((ok, fail) => { resolve=ok; reject=fail; }));
    const texture = new Texture(ASSET_ROOT+name+".png", scene, false, false,
      Texture.TRILINEAR_SAMPLINGMODE, () => resolve(), (message) => reject(new Error(`Texture ${name}: ${message}`)));
    texture.gammaSpace = gamma; texture.anisotropicFilteringLevel = 8;
    return texture;
  };
  const make = (name: string, tint: string, metallic: number, roughness: number) => {
    const m = new PBRMaterial(`forge.${name}`,scene);
    m.maxSimultaneousLights=8;
    m.albedoColor = Color3.FromHexString(tint).toLinearSpace(); m.metallic=metallic; m.roughness=roughness;
    return m;
  };
  // A packed map: occlusion in red (when `occlusion`), roughness in green, metalness in blue.
  const packed = (m: PBRMaterial, orm: Texture, occlusion: boolean) => {
    m.metallicTexture=orm;
    m.useRoughnessFromMetallicTextureAlpha=false; m.useRoughnessFromMetallicTextureGreen=true;
    m.useMetallnessFromMetallicTextureBlue=true; m.useAmbientOcclusionFromMetallicTextureRed=occlusion;
  };
  const stoneColor=map("stone-color",true);
  const basalt = make("basalt","#555e69",0,.92);
  basalt.albedoTexture=stoneColor; basalt.bumpTexture=map("stone-normal",false); packed(basalt, map("stone-orm",false), true);
  // Pavement is basalt with the carved relief.
  const pavement=basalt.clone("forge.pavement");
  pavement.bumpTexture=map("carved-normal",false); pavement.metallicTexture=map("carved-orm",false); pavement.roughness=.82;
  const brazierBronze=make("brazier-bronze","#f8d6a1",1,.8);
  brazierBronze.albedoTexture=map("bronze-color",true); packed(brazierBronze, map("bronze-orm",false), false);
  const banner=make("banner","#741d16",0,.97);banner.backFaceCulling=false;banner.albedoTexture=stoneColor;
  const lava=make("ember","#000000",0,.65);lava.emissiveColor=new Color3(2.7,.16,.005);
  await Promise.all(loads);
  return { basalt, pavement, brazierBronze, banner, lava };
}
