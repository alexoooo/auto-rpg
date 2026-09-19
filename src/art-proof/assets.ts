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
export async function loadTemplates(scene: Scene, file: string): Promise<Map<string, Mesh>> {
  const container = await LoadAssetContainerAsync(ASSET_ROOT + file, scene);
  container.addAllToScene();
  const templates = new Map<string, Mesh>();
  for (const mesh of container.meshes) {
    if (!(mesh instanceof Mesh) || !mesh.getTotalVertices()) continue;
    mesh.bakeTransformIntoVertices(mesh.computeWorldMatrix(true).clone());
    mesh.parent = null;
    mesh.position.setAll(0); mesh.scaling.setAll(1); mesh.rotationQuaternion = Quaternion.Identity();
    mesh.setEnabled(false); mesh.isPickable = false;
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
  const bronze=make("bronze","#f8d6a1",1,.8);
  bronze.albedoTexture=bronzeColor;bronze.metallicTexture=bronzeORM;
  bronze.useRoughnessFromMetallicTextureAlpha=false;bronze.useRoughnessFromMetallicTextureGreen=true;
  bronze.useMetallnessFromMetallicTextureBlue=true;
  const steel=make("steel","#c7d3df",1,.28);
  const rune=make("rune","#eaba66",.65,.3);rune.emissiveColor=new Color3(.32,.12,.018);
  const banner=make("banner","#741d16",0,.97);banner.backFaceCulling=false;banner.albedoTexture=stoneColor;
  const wood=make("wood","#503322",0,.9);
  const lava=make("ember","#000000",0,.65);lava.emissiveColor=new Color3(2.7,.16,.005);
  await Promise.all(loads);
  return { stone, basalt, bronze, steel, rune, banner, wood, lava };
}
export type ProofMaterials = Awaited<ReturnType<typeof proofMaterials>>;
