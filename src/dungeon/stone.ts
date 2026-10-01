import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { surfaceMetresPerRepeat, TEXTURED_SURFACES, type SurfaceDescriptor } from "../render/materials.ts";
import { surface, type TextureFactory } from "../render/surface.ts";

/** The textured stone, or a flat colour: the control for what the maps cost. */
type StoneChoice = "stone" | "flat";

/** A floor or wall material, and the metres its maps span, which its UVs are divided by. */
interface StoneSurface { material: PBRMaterial; metresPerRepeat: number; textured: boolean }
/** `masonry` is false for a flat wall skin, the control for what the blocks cost; it is on otherwise. */
export interface DungeonSurfaces { floor: StoneSurface; wall: StoneSurface; masonry?: boolean }

const STONE: Record<"floor" | "wall", SurfaceDescriptor> = { floor: TEXTURED_SURFACES.dungeonFloor, wall: TEXTURED_SURFACES.dungeonWall };
/** The flat colours, authored in sRGB. */
const FLAT = Object.freeze({ floor: { name: "worn flagstones", colour: "#77747a" }, wall: { name: "dungeon basalt", colour: "#494b55" } });

/** One dungeon material, PBR like the bodies' skins, so that the torches and the lantern fall off on it as on them. */
export function flatStone(scene: Scene, name: string, colour: string, roughness = 0.92): PBRMaterial {
  const material = new PBRMaterial(name, scene);
  material.albedoColor = Color3.FromHexString(colour).toLinearSpace();
  material.metallic = 0; material.roughness = roughness; material.maxSimultaneousLights = 4;
  return material;
}

function stoneSurface(scene: Scene, kind: "floor" | "wall", choice: StoneChoice, textures?: TextureFactory): StoneSurface {
  if (choice === "flat") return { material: flatStone(scene, FLAT[kind].name, FLAT[kind].colour), metresPerRepeat: 1, textured: false };
  const descriptor = STONE[kind];
  const material = surface(scene, descriptor, textures);
  material.maxSimultaneousLights = 4;
  return { material, metresPerRepeat: surfaceMetresPerRepeat(descriptor), textured: true };
}

/** The floor and walls a run is drawn in. Flat by default, which loads no image, so Node can build it. */
export function dungeonStone(scene: Scene, floor: StoneChoice = "flat", wall: StoneChoice = "flat", textures?: TextureFactory): DungeonSurfaces {
  return { floor: stoneSurface(scene, "floor", floor, textures), wall: stoneSurface(scene, "wall", wall, textures) };
}

/** `?floor=flat` and `?wall=flat` draw the flat colours, `?masonry=0` the flat wall skin, and `?dressing=0` no
 * clutter; anything else, or nothing, draws the stone in blocks, dressed. */
export function stoneQuery(search: string): { floor: StoneChoice; wall: StoneChoice; masonry: boolean; dressing: boolean } {
  const params = new URLSearchParams(search);
  const read = (key: string): StoneChoice => params.get(key) === "flat" ? "flat" : "stone";
  return { floor: read("floor"), wall: read("wall"), masonry: params.get("masonry") !== "0", dressing: params.get("dressing") !== "0" };
}
