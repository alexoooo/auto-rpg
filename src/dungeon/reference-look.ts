import { CryptWeathering } from "./crypt-weathering.ts";
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
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { surface } from "../render/surface.ts";
import { TEXTURED_SURFACES } from "../render/materials.ts";
import { publicAssetUrl } from "../asset-url.ts";
import { flatStone } from "./stone.ts";
import { REFERENCE_TORCHES } from "./reference.ts";
import type { buildDungeonWorld } from "./world.ts";

import type { CryptRoomPlan } from "./crypt-room.ts";
import { assembleCryptKit } from "./crypt-kit.ts";

export type ReferenceQuality = "high" | "reduced";
/** Wetness belongs to the paving itself, so it cannot float, sort or z-fight. */
class CryptDamp extends MaterialPluginBase {
  private readonly centres: readonly { x: number; z: number }[];
  constructor(material: Material, centres = [{x:6.1,z:7},{x:11.6,z:11.3},{x:13.5,z:8.2}]) {
    super(material, "CryptDamp", 220, {}); this.centres=centres; this._enable(true);
  }
  override getClassName() { return "CryptDamp"; }
  override getCustomCode(shaderType: string) {
    const centres=this.centres??[{x:6.1,z:7},{x:11.6,z:11.3},{x:13.5,z:8.2}];
    return shaderType === "fragment" ? {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        float cryptDamp(vec2 p) {
          float edge = sin(p.x*8.1+sin(p.y*5.0)) * sin(p.y*9.3+p.x*2.0)*0.14;
          float wetDistance = 10000.0;
          ${centres.map(p=>`wetDistance = min(wetDistance,length((p-vec2(${p.x.toFixed(4)},${p.z.toFixed(4)}))/vec2(1.6,0.9)));`).join("\n")}
          return 1.0-smoothstep(0.60,1.05,wetDistance+edge);
        }`,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: "surfaceAlbedo *= mix(1.0, 0.68, cryptDamp(vPositionW.xz));",
      CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: "metallicRoughness.g = mix(metallicRoughness.g, 0.24, cryptDamp(vPositionW.xz));",
    } : null;
  }
}
/** The front walls remain as low sills: a cutaway, never a change to collision. */
class CryptCutaway extends MaterialPluginBase {
  private readonly condition: string;
  constructor(material: Material, azimuth: number, condition?: string) {
    super(material, "CryptCutaway", 210, {});
    this.condition = condition ?? `${Math.sin(azimuth) > 0 ? "vPositionW.x > 15.45" : "vPositionW.x < 3.55"} || ${Math.cos(azimuth) > 0 ? "vPositionW.z > 13.45" : "vPositionW.z < 4.55"}`;
    this._enable(true);
  }
  override getClassName() { return "CryptCutaway"; }
  override getCustomCode(shaderType: string) {
    return shaderType === "fragment" ? { CUSTOM_FRAGMENT_MAIN_BEGIN: `if (vPositionW.y > 0.85 && (${this.condition})) discard;` } : null;
  }
}
/** Visual-only owner: all solid props have already been built by the gameplay world. */
export async function dressReference(scene: Scene, world: ReturnType<typeof buildDungeonWorld>, quality: ReferenceQuality, azimuth: number, plan?: CryptRoomPlan) {
  const container=await LoadAssetContainerAsync(publicAssetUrl(plan ? "/assets/crypt-kit/kit.glb" : "/assets/dungeon-reference/chamber.glb"),scene);
  container.addAllToScene();
  if(plan) assembleCryptKit(container,plan);
  const torches=plan?.torches??REFERENCE_TORCHES;
  const bounds=plan?.bounds;
  const cutaway=plan && plan.map.rooms.length>1 ? plan.placements.filter(p=>["wall","wall-pier","wall-panel","wall-repair","corner-left","corner-right","niche","roots","portal"].includes(p.piece) && Math.sin(p.turn)*Math.sin(azimuth)+Math.cos(p.turn)*Math.cos(azimuth)<-.1).map(p=>`(abs(vPositionW.x-${p.x.toFixed(3)}) < ${Math.abs(Math.cos(p.turn))>.5?"1.55":"0.55"} && abs(vPositionW.z-${p.z.toFixed(3)}) < ${Math.abs(Math.sin(p.turn))>.5?"1.55":"0.55"})`).join(" || ") : bounds?`${Math.sin(azimuth)>0?`vPositionW.x > ${bounds.max.x+.45}`:`vPositionW.x < ${bounds.min.x-.45}`} || ${Math.cos(azimuth)>0?`vPositionW.z > ${bounds.max.z+.45}`:`vPositionW.z < ${bounds.min.z-.45}`}`:undefined;
  const root=container.meshes.find(m=>m.name==="__root__");
  // The export uses game metre coordinates. Remove the loader's RH-to-LH root
  // conversion; glTF meshes retain their explicit clockwise face convention.
  if(root){root.rotationQuaternion=Quaternion.Identity();root.scaling.setAll(1);}
  const maps = await Promise.all(["albedo", "normal", "orm"].map(channel => new Promise<Texture>((resolve, reject) => {
    const texture = new Texture(publicAssetUrl(`/assets/dungeon-reference/stone-${channel}.png`), scene, false, false,
      Texture.TRILINEAR_SAMPLINGMODE, () => resolve(texture), message => { texture.dispose(); reject(new Error(message)); });
    texture.gammaSpace = channel === "albedo"; texture.anisotropicFilteringLevel = 4;
  })));
  const textured = (name: string, colour: string) => {
    const material = flatStone(scene, name, colour);
    material.useRoughnessFromMetallicTextureAlpha = false;
    material.useRoughnessFromMetallicTextureGreen = true;
    material.useMetallnessFromMetallicTextureBlue = true;
    material.useAmbientOcclusionFromMetallicTextureRed = true;
    material.albedoTexture = maps[0]; material.bumpTexture = maps[1]; material.metallicTexture = maps[2];
    material.invertNormalMapX = true; material.invertNormalMapY = false;
    return material;
  };
  const trim=textured("crypt.trim", "#ece4d1");
  const wall=textured("crypt.wall", "#c7ced0");
  const floor=textured("crypt.floor", "#bdc7ce");
  new CryptDamp(floor,plan?.damp);
  if(plan)new CryptWeathering(floor,plan);
  const rootMat=textured("reference.root","#756247"); rootMat.roughness=1;
  const earth=textured("reference.earth","#a5b275"); earth.roughness=1;
  const iron=flatStone(scene,"reference.iron","#444a4d",.4);iron.metallic=.8;
  const tomb=textured("crypt.tomb", "#ddd5c3");
  const wood=surface(scene,TEXTURED_SURFACES.wood);
  const cloth=flatStone(scene,"crypt.cloth","#752c25",.95);
  const materials={wall,trim,floor,root:rootMat,earth,iron,tomb,wood,cloth};
  new CryptCutaway(wood, azimuth, cutaway);
  for(const door of world.doorVisuals) { door.wood.material=wood;door.iron.material=iron;door.wood.receiveShadows=door.iron.receiveShadows=true; }
  for(const [name,material] of Object.entries(materials)) {
    material.maxSimultaneousLights=6;world.fog?.attach(material,name==="wall"||name==="trim"||name==="root"||name==="earth"||(name==="wood"&&!!plan?.archetypes)?"wall":null);
    if (["wall", "trim", "root", "earth", "iron", "cloth"].includes(name)) new CryptCutaway(material, azimuth, cutaway);
  }
  // Retain working doors and exit; replace only the generated architectural skin.
  for(const mesh of world.surfaces)if(mesh.name.startsWith("wall.")||mesh.name.startsWith("floor."))mesh.setEnabled(false);
  for(const mesh of container.meshes)if(mesh instanceof Mesh && mesh.getTotalVertices() && mesh.isEnabled()) {
    const name=mesh.name.replace("reference.","") as keyof typeof materials;
    if (!materials[name]) throw new Error(`Unbound reference material: ${mesh.name}`);
    mesh.material=materials[name];mesh.overrideMaterialSideOrientation = 0;mesh.receiveShadows=true;mesh.isPickable=false;
    world.surfaces.push(mesh);
  }
  const shadows:ShadowGenerator[]=[];
  // A cut-away wall must take its elevated fittings with it. Keep its light contribution;
  // this is the same presentation-only cross-section as the wall, not an extinguished torch.
  torches.forEach((torch, i) => {
    const front = plan && plan.map.rooms.length>1 ? torch.facing.x*Math.sin(azimuth)+torch.facing.z*Math.cos(azimuth)<-.1 : (Math.sin(azimuth) > 0 ? torch.cell.x > (bounds?bounds.max.x+.45:15.45) : torch.cell.x < (bounds?bounds.min.x-.45:3.55))
      || (Math.cos(azimuth) > 0 ? torch.cell.z > (bounds?bounds.max.z+.45:13.45) : torch.cell.z < (bounds?bounds.min.z-.45:4.55));
    if (front) for (const name of [`torch.flame.${i}`, `torch.sconce.${i}`]) scene.getMeshByName(name)?.setEnabled(false);
  });
  const lights=torches.map((torch,i)=>{
    const light=new SpotLight(`reference.shadow.${i}`,new Vector3(torch.light.x,2.45,torch.light.z),
      new Vector3(torch.facing.x,-.85,torch.facing.z).normalize(),Math.PI*.68,1.5,scene);
    light.diffuse=Color3.FromHexString(torch.color??"#ffb665");light.intensity=torch.shadowIntensity??85;light.range=12;
    light.shadowMinZ=.1;light.shadowMaxZ=18;
    const shadow=new ShadowGenerator(quality==="high"?2048:1024,light);
    shadow.usePercentageCloserFiltering=true;shadow.bias=.001;shadow.normalBias=.018;
    for(const mesh of scene.meshes)if(mesh instanceof Mesh && mesh.getTotalVertices() && mesh.isEnabled() && mesh.isVisible
      && mesh.name !== "reference.floor" && mesh.name !== "reference.earth" && !mesh.name.includes("flame"))shadow.addShadowCaster(mesh);
    shadows.push(shadow);return light;
  });
  // Keep the shadow budget fixed as the dungeon grows. Lighting follows the viewed room.
  const observer=plan && plan.map.rooms.length>1 ? scene.onBeforeRenderObservable.add(()=>{
    const target=(scene.activeCamera as import("@babylonjs/core/Cameras/targetCamera.js").TargetCamera | null)?.getTarget();if(!target)return;
    const nearest=lights.map((light,i)=>({i,d:Vector3.DistanceSquared(light.position,target)})).sort((a,b)=>a.d-b.d).slice(0,2).map(v=>v.i);
    lights.forEach((light,i)=>light.setEnabled(nearest.includes(i)));
  }) : null;
  return {dispose(){if(observer)scene.onBeforeRenderObservable.remove(observer);shadows.forEach(s=>s.dispose());lights.forEach(l=>l.dispose());container.dispose();Object.values(materials).forEach(m=>m.dispose(false,false));maps.forEach(t=>t.dispose());}};
}
