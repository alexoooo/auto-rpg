import { isTactical } from "../render/scene-profile.ts";
import { CryptWeathering } from "./crypt-weathering.ts";
import { sceneModel } from "../render/asset-cache.ts";
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
import { loadArtAssets } from "../render/art-assets.ts";
import { browserTextures } from "../render/surface.ts";
import { flatStone } from "./stone.ts";
import { REFERENCE_TORCHES } from "./reference.ts";
import type { buildDungeonWorld } from "./world.ts";

import type { CryptPlacement, CryptRoomPlan } from "./crypt-plan.ts";
import { assembleCryptKit } from "../environment/crypt-kit.ts";
import type { TorchPlacement } from "./dressing.ts";

export type ReferenceQuality = "high" | "reduced";

/** Where the reference chamber's floor is wet: the middle of each patch, m
 * (`docs/reference/look.md#crypt-cut-away`). */
const REFERENCE_DAMP: readonly { x: number; z: number }[] = [{x:6.1,z:7},{x:11.6,z:11.3},{x:13.5,z:8.2}];
/** The reference chamber's walls: what lies beyond these in x or z, m, is wall, and is cut away on the camera's
 * side (`docs/reference/look.md#crypt-cut-away`). */
const REFERENCE_CHAMBER = Object.freeze({ min: Object.freeze({ x: 3.55, z: 4.55 }), max: Object.freeze({ x: 15.45, z: 13.45 }) });
/** How the near walls are cut away (`docs/reference/look.md#crypt-cut-away`). */
const CUTAWAY = Object.freeze({
  /** A wall is cut above this height, m: what is left is a low sill. */
  sill: 0.85,
  /** A piece faces away from the camera when the cosine between its facing and the camera's bearing is below
   * this. */
  facing: -.1,
  /** Half the box cut about a piece, m: along its wall, which reaches over its neighbours, and through it. */
  along: 1.55,
  through: 0.55,
});
/** The pieces of the kit that stand in a wall, which the cut takes. */
const WALL_PIECES: readonly string[] = ["wall","wall-pier","wall-panel","wall-repair","corner-left","corner-right","niche","roots","portal"];

/** Wetness belongs to the paving itself, so it cannot float, sort or z-fight. */
class CryptDamp extends MaterialPluginBase {
  private readonly centres: readonly { x: number; z: number }[];
  constructor(material: Material, centres = REFERENCE_DAMP) {
    super(material, "CryptDamp", 220, {}); this.centres=centres; this._enable(true);
  }
  override getClassName() { return "CryptDamp"; }
  override getCustomCode(shaderType: string) {
    const centres=this.centres??REFERENCE_DAMP;
    return shaderType === "fragment" ? {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        float cryptWetHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        float cryptWetNoise(vec2 p) {
          vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
          return mix(mix(cryptWetHash(i),cryptWetHash(i+vec2(1,0)),f.x),
            mix(cryptWetHash(i+vec2(0,1)),cryptWetHash(i+vec2(1,1)),f.x),f.y);
        }
        float cryptDamp(vec2 p) {
          float edge = (cryptWetNoise(p*.85)-.5)*.75+(cryptWetNoise(p*4.0)-.5)*.22;
          float wetDistance = 10000.0;
          ${centres.map(p=>`wetDistance = min(wetDistance,length((p-vec2(${p.x.toFixed(4)},${p.z.toFixed(4)}))/vec2(3.8,2.7)));`).join("\n")}
          return 1.0-smoothstep(0.30,1.05,wetDistance+edge);
        }`,
      // Water fills the finest pores. Preserve the chipped mesh normal while smoothing the normal map under the film.
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `float cryptWet=cryptDamp(vPositionW.xz);
        surfaceAlbedo *= mix(1.0,0.64,cryptWet);
        normalW=normalize(mix(normalW,geometricNormalW,cryptWet*.7));`,
      CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: "metallicRoughness.g = mix(metallicRoughness.g, 0.24, cryptDamp(vPositionW.xz));",
    } : null;
  }
}
/** The GLSL condition, over a fragment's world position, that is true in the walls between the camera at `azimuth`
 * and the floor: every wall piece of `plan` that faces away from the camera, or the reference chamber's two near
 * walls. */
export function cutawayCondition(azimuth: number, plan?: CryptRoomPlan): string {
  if (!plan) {
    const { min, max } = REFERENCE_CHAMBER;
    const nearX = Math.sin(azimuth) > 0 ? `vPositionW.x > ${max.x}` : `vPositionW.x < ${min.x}`;
    const nearZ = Math.cos(azimuth) > 0 ? `vPositionW.z > ${max.z}` : `vPositionW.z < ${min.z}`;
    return `${nearX} || ${nearZ}`;
  }
  // A piece turned to face along z runs along x, and the other way about.
  const box = (p: CryptPlacement): string => {
    const halfX = Math.abs(Math.cos(p.turn)) > .5 ? CUTAWAY.along : CUTAWAY.through;
    const halfZ = Math.abs(Math.sin(p.turn)) > .5 ? CUTAWAY.along : CUTAWAY.through;
    return `(abs(vPositionW.x-${p.x.toFixed(3)}) < ${halfX} && abs(vPositionW.z-${p.z.toFixed(3)}) < ${halfZ})`;
  };
  return plan.placements
    .filter(p => WALL_PIECES.includes(p.piece) && facesAway(Math.sin(p.turn), Math.cos(p.turn), azimuth))
    .map(box).join(" || ");
}
/** Whether what faces along the unit `(x, z)` has its back to the camera at `azimuth`. */
function facesAway(x: number, z: number, azimuth: number): boolean {
  return x * Math.sin(azimuth) + z * Math.cos(azimuth) < CUTAWAY.facing;
}
/** Whether `torch` hangs on a wall the cut takes: a wall of `plan` with its back to the camera, or one of the
 * reference chamber's two near walls. */
function frontTorch(torch: TorchPlacement, azimuth: number, plan?: CryptRoomPlan): boolean {
  if (plan) return facesAway(torch.facing.x, torch.facing.z, azimuth);
  const { min, max } = REFERENCE_CHAMBER;
  return (Math.sin(azimuth) > 0 ? torch.cell.x > max.x : torch.cell.x < min.x)
    || (Math.cos(azimuth) > 0 ? torch.cell.z > max.z : torch.cell.z < min.z);
}
/** The side of a torch's shadow map at each quality, px. */
function shadowMapSize(quality: ReferenceQuality): number {
  switch (quality) {
    case "high": return 2048;
    case "reduced": return 1024;
    default: { const never: never = quality; throw new Error(`Unknown quality: ${String(never)}`); }
  }
}
/** The front walls remain as low sills: a cutaway, never a change to collision. */
class CryptCutaway extends MaterialPluginBase {
  private readonly condition: string;
  constructor(material: Material, condition: string) {
    super(material, "CryptCutaway", 210, {});
    this.condition = condition;
    this._enable(true);
  }
  override getClassName() { return "CryptCutaway"; }
  override getCustomCode(shaderType: string) {
    return shaderType === "fragment" ? { CUSTOM_FRAGMENT_MAIN_BEGIN: `if (vPositionW.y > ${CUTAWAY.sill} && (${this.condition})) discard;` } : null;
  }
}
/** Visual-only owner: all solid props have already been built by the level (`buildDungeonWorld`). */
export async function dressReference(scene: Scene, level: ReturnType<typeof buildDungeonWorld>, quality: ReferenceQuality, azimuth: number, plan?: CryptRoomPlan) {
  const art = await loadArtAssets();
  const container=await sceneModel(art.model(plan ? "crypt-kit/kit.glb" : "dungeon-reference/chamber.glb"),scene);
  container.addAllToScene();
  if(plan) assembleCryptKit(container,plan.placements);
  const torches=plan?.torches??REFERENCE_TORCHES;
  const cutaway=cutawayCondition(azimuth,plan);
  const root=container.meshes.find(m=>m.name==="__root__");
  // The export uses game metre coordinates. Remove the loader's RH-to-LH root
  // conversion; glTF meshes retain their explicit clockwise face convention.
  if(root){root.rotationQuaternion=Quaternion.Identity();root.scaling.setAll(1);}
  const families = plan ? ["floor", "cloth", "wood"] : ["stone"];
  const sets = await Promise.all(families.map(family => Promise.all(["albedo", "normal", "orm"].map(channel => new Promise<Texture>((resolve, reject) => {
    const asset = plan ? `crypt-kit/${family}-${channel}.png` : `dungeon-reference/stone-${channel}.png`;
    const texture = new Texture(art.texture(asset), scene, false, false,
      Texture.TRILINEAR_SAMPLINGMODE, () => resolve(texture), message => { texture.dispose(); reject(new Error(message)); });
    texture.gammaSpace = channel === "albedo"; texture.anisotropicFilteringLevel = 4;
  })))));
  const maps = sets.flat();
  if (scene.isDisposed) throw new DOMException("The screen was closed", "AbortError");
  const textured = (name: string, colour: string, family = "wall") => {
    const channels = sets[plan ? families.indexOf(families.includes(family) ? family : "floor") : 0]!;
    const material = flatStone(scene, name, colour);
    // Broaden highlights when normal detail is smaller than a pixel instead of letting it sparkle as the camera moves.
    material.enableSpecularAntiAliasing = true;
    material.useRoughnessFromMetallicTextureAlpha = false;
    material.useRoughnessFromMetallicTextureGreen = true;
    material.useMetallnessFromMetallicTextureBlue = true;
    material.useAmbientOcclusionFromMetallicTextureRed = true;
    material.albedoTexture = channels[0]; material.bumpTexture = channels[1]; material.metallicTexture = channels[2];
    // Worn flake interiors reflect differently from the dry wall stone.
    if (plan) material.roughness = family === "floor" ? .72 : 1;
    material.invertNormalMapX = true; material.invertNormalMapY = false;
    return material;
  };
  const trim=textured("crypt.trim", "#d6c5a5", "trim");
  const wall=textured("crypt.wall", "#dbd7ca");
  const floor=textured("crypt.floor", "#e6e8ed", "floor");
  new CryptDamp(floor,plan?.damp);
  if(plan)new CryptWeathering(floor,plan);
  const rootMat=textured("reference.root","#756247"); rootMat.roughness=1;
  const earth=textured("reference.earth","#a5b275"); earth.roughness=1;
  const iron=flatStone(scene,"reference.iron","#736b5b",.33);iron.metallic=.85;
  const tomb=textured("crypt.tomb", "#ddd5c3", "trim");
  const woodSource=TEXTURED_SURFACES.wood;
  const wood=plan ? textured("crypt.wood","#ded1be","wood") : surface(scene,woodSource,browserTextures(art));
  // Built doors and imported timbers have different tangent bases.
  const doorWood=plan ? surface(scene,woodSource,browserTextures(art)) : wood;
  const cloth=plan ? textured("crypt.cloth","#8b3023","cloth") : flatStone(scene,"crypt.cloth","#752c25",.95);
  cloth.backFaceCulling=false;
  const materials={wall,trim,floor,root:rootMat,earth,iron,tomb,wood,cloth};
  new CryptCutaway(wood, cutaway);
  if(doorWood!==wood) {
    new CryptCutaway(doorWood,cutaway);
    doorWood.maxSimultaneousLights=6;level.fog?.attach(doorWood,"wall");
  }
  for(const door of level.doorVisuals) { door.wood.material=doorWood;door.iron.material=iron;door.wood.receiveShadows=door.iron.receiveShadows=true; }
  for(let i=0;i<torches.length;i++) {
    const basket=scene.getMeshByName(`torch.sconce.${i}`);
    if(basket){basket.material=iron;basket.receiveShadows=true;}
  }
  for(const [name,material] of Object.entries(materials)) {
    material.maxSimultaneousLights=6;level.fog?.attach(material,name==="wall"||name==="trim"||name==="root"||name==="earth"||(name==="wood"&&!!plan)?"wall":null);
    if (["wall", "trim", "root", "earth", "iron", "cloth"].includes(name)) new CryptCutaway(material, cutaway);
  }
  // Retain working doors and exit; replace only the generated architectural skin.
  for(const mesh of level.surfaces)if(mesh.name.startsWith("wall.")||mesh.name.startsWith("floor."))mesh.setEnabled(false);
  for(const mesh of container.meshes)if(mesh instanceof Mesh && mesh.getTotalVertices() && mesh.isEnabled()) {
    const name=mesh.name.replace("reference.","") as keyof typeof materials;
    if (!materials[name]) throw new Error(`Unbound reference material: ${mesh.name}`);
    mesh.material=materials[name];mesh.overrideMaterialSideOrientation = 0;mesh.receiveShadows=true;mesh.isPickable=false;
    level.surfaces.push(mesh);
  }
  const shadows:ShadowGenerator[]=[];
  // A cut-away wall must take its elevated fittings with it. Keep its light contribution;
  // this is the same presentation-only cross-section as the wall, not an extinguished torch.
  torches.forEach((torch, i) => {
    if (frontTorch(torch, azimuth, plan)) for (const name of [`torch.flame.${i}`, `torch.sconce.${i}`]) scene.getMeshByName(name)?.setEnabled(false);
  });
  const lights=torches.map((torch,i)=>{
    const light=new SpotLight(`reference.shadow.${i}`,new Vector3(torch.light.x,torch.light.y+.4,torch.light.z),
      new Vector3(torch.facing.x,-.85,torch.facing.z).normalize(),Math.PI*.68,1.5,scene);
    light.diffuse=Color3.FromHexString(torch.color??"#ffb665");light.intensity=torch.shadowIntensity??85;light.range=12;
    light.shadowMinZ=.1;light.shadowMaxZ=18;
    const shadow=new ShadowGenerator(shadowMapSize(quality),light);
    shadow.usePercentageCloserFiltering=true;shadow.bias=.001;shadow.normalBias=.018;
    for(const mesh of scene.meshes)if(mesh instanceof Mesh && mesh.getTotalVertices() && mesh.isEnabled() && mesh.isVisible
      && mesh.name !== "reference.floor" && mesh.name !== "reference.earth" && !mesh.name.includes("flame"))shadow.addShadowCaster(mesh);
    shadows.push(shadow);return light;
  });
  // Keep the shadow budget fixed as the dungeon grows. Lighting follows the viewed room.
  const observer=plan ? scene.onBeforeRenderObservable.add(()=>{
    if (isTactical(scene)) return;
    const target=(scene.activeCamera as import("@babylonjs/core/Cameras/targetCamera.js").TargetCamera | null)?.getTarget();if(!target)return;
    const nearest=lights.map((light,i)=>({i,d:Vector3.DistanceSquared(light.position,target)})).sort((a,b)=>a.d-b.d).slice(0,2).map(v=>v.i);
    lights.forEach((light,i)=>light.setEnabled(nearest.includes(i)));
  }) : null;
  return {dispose(){if(observer)scene.onBeforeRenderObservable.remove(observer);shadows.forEach(s=>s.dispose());lights.forEach(l=>l.dispose());container.dispose();Object.values(materials).forEach(m=>m.dispose(false,false));if(doorWood!==wood)doorWood.dispose(false,false);maps.forEach(t=>t.dispose());}};
}
