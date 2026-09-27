import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import "@babylonjs/loaders/glTF/2.0/glTFLoader.js";
import "@babylonjs/loaders/glTF/glTFFileLoader.js";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { SpotLight } from "@babylonjs/core/Lights/spotLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { followSurfaceMaps } from "../surface.ts";
import { publicAssetUrl } from "../asset-url.ts";
import { dungeonStone, flatStone } from "./stone.ts";
import { REFERENCE_TORCHES } from "./reference.ts";
import type { buildDungeonWorld } from "./world.ts";

export type ReferenceQuality = "high" | "reduced";
/** The front walls remain as low sills: a cutaway, never a change to collision. */
class CryptCutaway extends MaterialPluginBase {
  private readonly condition: string;
  constructor(material: Material, azimuth: number) {
    super(material, "CryptCutaway", 210, {});
    this.condition = `${Math.sin(azimuth) > 0 ? "vPositionW.x > 15.45" : "vPositionW.x < 3.55"} || ${Math.cos(azimuth) > 0 ? "vPositionW.z > 13.45" : "vPositionW.z < 4.55"}`;
    this._enable(true);
  }
  override getClassName() { return "CryptCutaway"; }
  override getCustomCode(shaderType: string) {
    return shaderType === "fragment" ? { CUSTOM_FRAGMENT_MAIN_BEGIN: `if (vPositionW.y > 0.85 && (${this.condition})) discard;` } : null;
  }
}
/** Visual-only owner: all solid props have already been built by the gameplay world. */
export async function dressReference(scene: Scene, world: ReturnType<typeof buildDungeonWorld>, quality: ReferenceQuality, azimuth: number) {
  const container=await LoadAssetContainerAsync(publicAssetUrl("/assets/dungeon-reference/chamber.glb"),scene);
  container.addAllToScene();
  const root=container.meshes.find(m=>m.name==="__root__");
  // The export uses game metre coordinates. Remove the loader's RH-to-LH root
  // conversion; glTF meshes retain their explicit clockwise face convention.
  if(root){root.rotationQuaternion=Quaternion.Identity();root.scaling.setAll(1);}
  const stone=dungeonStone(scene,"stone","stone");
  const follows: (() => void)[] = [];
  const textured = (name: string, colour: string, source: typeof stone.wall.material) => {
    const material = flatStone(scene, name, colour);
    material.useRoughnessFromMetallicTextureAlpha = false;
    material.useRoughnessFromMetallicTextureGreen = true;
    material.useMetallnessFromMetallicTextureBlue = true;
    material.useAmbientOcclusionFromMetallicTextureRed = true;
    material.invertNormalMapX = source.invertNormalMapX;
    material.invertNormalMapY = source.invertNormalMapY;
    follows.push(followSurfaceMaps(source, material));
    return material;
  };
  const trim=textured("crypt.trim", "#e1cdae", stone.floor.material);
  const wall=textured("crypt.wall", "#c8c2b8", stone.wall.material);
  const floor=textured("crypt.floor", "#cccccc", stone.floor.material);
  const rootMat=flatStone(scene,"reference.root","#423323",.87);
  const earth=flatStone(scene,"reference.earth","#282824",1);
  const iron=flatStone(scene,"reference.iron","#444a4d",.4);iron.metallic=.8;
  const wet=flatStone(scene,"reference.wet","#263334",.12);wet.alpha=.35;wet.roughness=.55;wet.specularIntensity=.25;
  const tomb=textured("crypt.tomb", "#b8b2a7", stone.floor.material);
  const materials={wall,trim,floor,root:rootMat,earth,iron,wet,tomb};
  for(const [name,material] of Object.entries(materials)) {
    material.maxSimultaneousLights=6;world.fog?.attach(material,name==="wall"||name==="trim"||name==="root"||name==="earth"?"wall":null);
    if (["wall", "trim", "root", "earth"].includes(name)) new CryptCutaway(material, azimuth);
  }
  // Retain working doors and exit; replace only the old architectural skin.
  for(const mesh of world.surfaces)if(mesh.name.startsWith("wall.")||mesh.name.startsWith("floor."))mesh.setEnabled(false);
  for(const mesh of container.meshes)if(mesh instanceof Mesh && mesh.getTotalVertices()) {
    const name=mesh.name.replace("reference.","") as keyof typeof materials;
    mesh.material=materials[name]??wall;mesh.overrideMaterialSideOrientation = 0;mesh.receiveShadows=true;mesh.isPickable=false;
    world.surfaces.push(mesh);
  }
  const shadows:ShadowGenerator[]=[];
  const lights=REFERENCE_TORCHES.map((torch,i)=>{
    const light=new SpotLight(`reference.shadow.${i}`,new Vector3(torch.light.x,2.45,torch.light.z),
      new Vector3(torch.facing.x,-.65,torch.facing.z).normalize(),Math.PI*.85,1,scene);
    light.diffuse=Color3.FromHexString("#ffb36c");light.intensity=70;light.range=15;
    light.shadowMinZ=.1;light.shadowMaxZ=18;
    const shadow=new ShadowGenerator(quality==="high"?2048:1024,light);
    shadow.usePercentageCloserFiltering=true;shadow.bias=.001;shadow.normalBias=.018;
    for(const mesh of scene.meshes)if(mesh instanceof Mesh && mesh.getTotalVertices() && mesh.isEnabled() && mesh.isVisible
      && mesh.name !== "reference.floor" && !mesh.name.includes("flame") && !mesh.name.includes("puddle") && mesh.material!==wet)shadow.addShadowCaster(mesh);
    shadows.push(shadow);return light;
  });
  scene.environmentIntensity=.45;
  return {dispose(){follows.forEach(stop=>stop());stone.floor.material.dispose(false,false);stone.wall.material.dispose(false,false);shadows.forEach(s=>s.dispose());lights.forEach(l=>l.dispose());container.dispose();Object.values(materials).forEach(m=>m.dispose(false,false));}};
}
