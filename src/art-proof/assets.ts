import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import "@babylonjs/loaders/glTF/2.0/glTFLoader.js";
import "@babylonjs/loaders/glTF/glTFFileLoader.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Scene } from "@babylonjs/core/scene.js";

export const ASSET_ROOT = "/assets/art-proof/";
export interface ProofManifest { version: number; parts: { key: string; asset: string; family: string; extents: number[] }[] }
/** glTF can deduplicate identical limbs. Baking must not transform their shared buffers twice. */
export function prepareTemplate(mesh: Mesh): void {
  mesh.makeGeometryUnique();
  // Distinct glTF meshes can still reference the same index accessor. flipFaces mutates it.
  mesh.setIndices(Array.from(mesh.getIndices()!));
  mesh.bakeTransformIntoVertices(mesh.computeWorldMatrix(true).clone());
  mesh.parent = null;
  mesh.position.setAll(0); mesh.scaling.setAll(1); mesh.rotationQuaternion = Quaternion.Identity();
  // All proof templates are opaque. glTF COLOR_0 otherwise opts even alpha=1 colors into blending,
  // which omits the bronze covers from the depth and shadow passes.
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

export async function proofMaterials(scene: Scene) {
  const loads: Promise<void>[] = [];
  const map = (name: string, gamma: boolean) => {
    let resolve!: () => void; let reject!: (e: Error) => void;
    loads.push(new Promise<void>((ok, fail) => { resolve=ok; reject=fail; }));
    const texture = new Texture(ASSET_ROOT+name+".png", scene, false, false,
      Texture.TRILINEAR_SAMPLINGMODE, () => resolve(), (message) => reject(new Error(`Texture ${name}: ${message}`)));
    texture.gammaSpace = gamma; texture.anisotropicFilteringLevel = 8;
    return texture;
  };
  const stoneColor=map("stone-color",true), stoneNormal=map("stone-normal",false), stoneORM=map("stone-orm",false);
  const bronzeColor=map("bronze-color",true), bronzeORM=map("bronze-orm",false);
  const carvedColor=map("carved-color",true), carvedNormal=map("carved-normal",false), carvedORM=map("carved-orm",false);
  const jointColor=map("joint-color",true), jointORM=map("joint-orm",false), steelORM=map("steel-orm",false);
  const make = (name: string, tint: string, metallic: number, roughness: number) => {
    const m = new PBRMaterial(`proof.${name}`,scene);
    m.maxSimultaneousLights=8;
    m.albedoColor = Color3.FromHexString(tint).toLinearSpace(); m.metallic=metallic; m.roughness=roughness;
    return m;
  };
  const stone = make("limestone","#eadbc0",0,.92);
  stone.albedoTexture=stoneColor; stone.bumpTexture=stoneNormal; stone.metallicTexture=stoneORM;
  stone.useRoughnessFromMetallicTextureAlpha=false;stone.useRoughnessFromMetallicTextureGreen=true;
  stone.useMetallnessFromMetallicTextureBlue=true;stone.useAmbientOcclusionFromMetallicTextureRed=true;
  stone.invertNormalMapX=false;stone.invertNormalMapY=false;
  const basalt=stone.clone("proof.basalt"); basalt.albedoColor=Color3.FromHexString("#555e69").toLinearSpace();
  stone.albedoTexture=carvedColor;stone.bumpTexture=carvedNormal;stone.metallicTexture=carvedORM;
  const pavement=basalt.clone("proof.pavement");pavement.bumpTexture=carvedNormal;
  pavement.metallicTexture=carvedORM;pavement.roughness=.82;
  const bronze=make("bronze","#f8d6a1",1,.8);
  bronze.albedoTexture=bronzeColor;bronze.metallicTexture=bronzeORM;
  bronze.useRoughnessFromMetallicTextureAlpha=false;bronze.useRoughnessFromMetallicTextureGreen=true;
  bronze.useMetallnessFromMetallicTextureBlue=true;
  const brazierBronze=bronze.clone("proof.brazier-bronze");
  bronze.albedoTexture=jointColor;bronze.metallicTexture=jointORM;bronze.roughness=1;
  const steel=make("steel","#c7d3df",1,.28);
  steel.metallicTexture=steelORM;steel.roughness=1;
  steel.useRoughnessFromMetallicTextureAlpha=false;steel.useRoughnessFromMetallicTextureGreen=true;
  steel.useMetallnessFromMetallicTextureBlue=true;
  const rune=make("rune","#eaba66",.65,.3);rune.emissiveColor=new Color3(8,.22,.008);
  const banner=make("banner","#741d16",0,.97);banner.backFaceCulling=false;banner.albedoTexture=stoneColor;
  const wood=make("wood","#503322",0,.9);
  const lava=make("ember","#000000",0,.65);lava.emissiveColor=new Color3(2.7,.16,.005);
  await Promise.all(loads);
  return { stone, basalt, pavement, bronze, brazierBronze, steel, rune, banner, wood, lava };
}
export type ProofMaterials = Awaited<ReturnType<typeof proofMaterials>>;
