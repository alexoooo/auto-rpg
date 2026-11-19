import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { ClusteredLightContainer } from "@babylonjs/core/Lights/Clustered/clusteredLightContainer.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture.js";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline.js";
import type { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js";
import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import type { Scene } from "@babylonjs/core/scene.js";
import "@babylonjs/core/Materials/Textures/Loaders/hdrTextureLoader.js";
import "@babylonjs/core/Rendering/geometryBufferRendererSceneComponent.js";
import "@babylonjs/core/Rendering/prePassRendererSceneComponent.js";
import "@babylonjs/core/Lights/Clustered/clusteredLightingSceneComponent.js";
import { isTactical } from "../render/scene-profile.ts";
import { CRYPT_GRADE, GRADE, postPipeline, type Grade } from "../render/post.ts";
import { publicAssetUrl } from "../asset-url.ts";
import { flames as makeFlames } from "../render/fire.ts";
import { cutAway } from "../../../game/dungeon/fog.ts";
import { orthographicLightProxy } from "./light-proxy.ts";
import { cellKey, type DungeonMap, type Point } from "../../../game/dungeon/map.ts";
import type { TorchPlacement } from "../../../game/dungeon/dressing.ts";

/** A dungeon's look whatever its light (`DungeonLightProfile`), set by eye. */
const DUNGEON_LOOK = Object.freeze({
  /** The ground's colour under the ambient fill. */
  ambient: Object.freeze({ ground: "#1a1614" }),
  /** Carried at `height`, `behind` metres from the hero toward the camera, so the faces the camera sees are lit.
   * A PBR point light falls off by inverse square, so it stands close and bright. */
  lantern: Object.freeze({ height: 2.6, behind: 0.8 }),
  /** A torch, and how far its flicker swings the intensity either way. */
  torch: Object.freeze({ color: "#ff8a3d", intensity: 6, flicker: 0.6 }),
  /** The flame volume's centre stands above its anchor so the iron basket shows beneath the fire. */
  flameLift: .20,
  /** Contact shadow at the foot of walls and bodies, sized for a camera that stands 30 m off. */
  ssao: Object.freeze({ ratio: 0.5, radius: 0.35, totalStrength: 1.1, samples: 8 }),
  clearColor: Object.freeze([0.008, 0.010, 0.016] as const),
  /** Torch lights kept on when the clustered container is not supported: the ones nearest the hero. Materials
   * carry four lights, and the ambient and the lantern take two of them. */
  fallbackLights: 2,
  /** The contribution at which a light's range is drawn, a sixth of a generated level's ambient. */
  cutoff: 0.03,
});

/** A PBR point light never reaches zero, and `range` does not shape it: the clustered container culls by it.
 * Drawn where the inverse-square contribution has fallen to `cutoff`: 14.8 m for a torch at the top of its
 * flicker, 17.3 m for a generated level's lantern. The container's tile fit is exact under this camera only because
 * `orthographicLightProxy` makes it so. */
const lightRange = (intensity: number): number => Math.sqrt(intensity / DUNGEON_LOOK.cutoff);

/** The indices of the `count` of `lights` nearest `at` on the ground. */
export const nearestLights = (lights: readonly { readonly position: Vector3 }[], at: Point, count: number): number[] =>
  lights.map((light, i) => ({ i, d: Math.hypot(light.position.x - at.x, light.position.z - at.z) })).sort((a, b) => a.d - b.d).slice(0, count).map(o => o.i);

export interface LookSwitches { torches: boolean; ssao: boolean; post: boolean }

/** **A dungeon's light**: its ambient fill, the arena's HDRI's strength, its lantern and its grade. */
interface DungeonLightProfile {
  ambientIntensity: number;
  ambientColor: string;
  environmentIntensity: number;
  lanternIntensity: number;
  lanternColor: string;
  grade: Grade;
}
/**
 * A generated level's, set by eye: a cold, dim fill from above that leaves the torches to do the
 * work, the HDRI kept low underground, enough to give bronze and wet stone a reflection, and a warm lantern.
 */
export const GENERATED_LIGHT: Readonly<DungeonLightProfile> = Object.freeze({
  ambientIntensity: 0.18, ambientColor: "#7d8fb3", environmentIntensity: 0.22,
  lanternIntensity: 9, lanternColor: "#ffcf8f", grade: GRADE,
});
/** The reference chamber's cooler fill and dimmer lantern, set by eye. */
export const REFERENCE_LIGHT: Readonly<DungeonLightProfile> = Object.freeze({
  ambientIntensity: .30, ambientColor: "#9aaecf", environmentIntensity: .58,
  lanternIntensity: 5, lanternColor: "#dce5f5", grade: GRADE,
});
/** The modular crypt's torches provide the warm key; cool fill retains the hero's outline. */
export const CRYPT_LIGHT: Readonly<DungeonLightProfile> = Object.freeze({
  ambientIntensity: .55, ambientColor: "#819dc9", environmentIntensity: .85,
  lanternIntensity: 3.5, lanternColor: "#c8d9f5", grade: CRYPT_GRADE,
});

export interface DungeonLighting {
  readonly lantern: PointLight;
  /** Whether the torches are in a clustered container rather than plain lights. */
  readonly clustered: boolean;
  readonly torchCount: number;
  readonly look: Readonly<LookSwitches>;
  update(hero: Point, zoom: number, pitch: number, toward: Point): void;
  /** A flame whose floor is unexplored would show where a room is before the fog does. */
  refreshFog(explored: ReadonlySet<number>): void;
  setLook(change: Partial<LookSwitches>): void;
  setPresentationEnabled(enabled: boolean): void;
  /**
   * Burns the torches the `seconds` a frame took, on page time and at most 50 ms a frame: the
   * flames move on and each light flickers. A page that is paused does not call it, so they stand still.
   */
  burn(seconds: number): void;
  dispose(): void;
}

/** **A level lit** in `profile`, seen from a camera at `azimuth`. */
export function lightDungeon(scene: Scene, camera: FreeCamera, { map, torches, azimuth, profile }: {
  readonly map: DungeonMap; readonly torches: readonly TorchPlacement[]; readonly azimuth: number; readonly profile: Readonly<DungeonLightProfile>;
}): DungeonLighting {
  let presentationEnabled = true;
  const look: LookSwitches = { torches: true, ssao: true, post: true };
  scene.clearColor = new Color4(...DUNGEON_LOOK.clearColor, 1);
  // The sky's direction is given for a camera at azimuth pi/4, and turns with the camera so that it keeps its
  // relation to the view: Babylon's `RotationY` takes `cameraToward(PI / 4)` to `cameraToward(azimuth)`.
  const sky = Vector3.TransformNormal(new Vector3(0.3, 1, -0.4), Matrix.RotationY(azimuth - Math.PI / 4));
  const ambient = new HemisphericLight("dungeon ambient", sky, scene);
  ambient.intensity = profile.ambientIntensity;
  ambient.diffuse = Color3.FromHexString(profile.ambientColor);
  ambient.groundColor = Color3.FromHexString(DUNGEON_LOOK.ambient.ground);
  scene.environmentTexture = new HDRCubeTexture(publicAssetUrl("/assets/env.hdr"), scene, 256, false, true, false, true);
  scene.environmentIntensity = profile.environmentIntensity;
  const lantern = new PointLight("wanderer lantern", Vector3.Zero(), scene);
  lantern.diffuse = Color3.FromHexString(profile.lanternColor);
  lantern.intensity = profile.lanternIntensity;
  lantern.range = lightRange(lantern.intensity);

  const flameLook = makeFlames(scene);
  const torchColor = Color3.FromHexString(DUNGEON_LOOK.torch.color);
  const flames = torches.map((torch, i) => {
    const flame = flameLook.create(`torch.flame.${i}`, new Vector3(torch.flame.x, torch.flame.y+DUNGEON_LOOK.flameLift, torch.flame.z));
    if(torch.color)flameLook.setTint(flame,Color3.FromHexString(torch.color));
    flame.isVisible = false;
    return { flame, floor: cellKey(map, { x: torch.cell.x + torch.facing.x, z: torch.cell.z + torch.facing.z }) };
  });
  const lights = torches.map((torch, i) => {
    const light = new PointLight(`torch.light.${i}`, new Vector3(torch.light.x, torch.light.y, torch.light.z), scene);
    light.diffuse = torch.color ? Color3.FromHexString(torch.color) : torchColor; light.intensity = torch.intensity ?? DUNGEON_LOOK.torch.intensity;
    light.range = lightRange((torch.intensity ?? DUNGEON_LOOK.torch.intensity) + DUNGEON_LOOK.torch.flicker);
    return light;
  });
  // The container takes its lights out of `scene.lights`, and its own switch is the only one it reads: a member
  // light's `setEnabled` does nothing once it is inside.
  orthographicLightProxy();
  const container = lights.length && ClusteredLightContainer.IsLightSupported(lights[0])
    ? new ClusteredLightContainer("dungeon torches", lights, scene) : null;
  const clustered = container?.isSupported ?? false;

  let ao: SSAO2RenderingPipeline | null = null, post: DefaultRenderingPipeline | null = null, zoom = 10, pitch = Math.PI / 6;
  // SSAO fades out from 0.75 of `maxZ`, so the farthest thing on screen -- the ground at the top edge, `zoom / tan`
  // beyond the target and `1 / sin` below it -- has to sit short of that.
  const setMaxZ = () => { if (ao) ao.maxZ = (Vector3.Distance(camera.position, camera.getTarget()) + 1 / Math.sin(pitch) + zoom / Math.tan(pitch)) / 0.75 + 1; };
  // Always rebuilt whole and in this order: a pipeline detached and re-attached appends its passes to the end of
  // the camera's list, and a frame-cost reading taken after that does not compare with one taken before.
  const buildPost = () => {
    ao?.dispose(true); post?.dispose(); ao = post = null;
    // Without SSAO there is no prepass consumer; its unrendered target cannot become ready.
    if (!presentationEnabled || !look.ssao) scene.disablePrePassRenderer();
    if (presentationEnabled && look.ssao) {
      ao = new SSAO2RenderingPipeline("dungeon.ao", scene, { ssaoRatio: DUNGEON_LOOK.ssao.ratio, blurRatio: 1 }, [camera]);
      ao.radius = DUNGEON_LOOK.ssao.radius; ao.totalStrength = DUNGEON_LOOK.ssao.totalStrength;
      ao.samples = DUNGEON_LOOK.ssao.samples; ao.expensiveBlur = false; setMaxZ();
    }
    if (presentationEnabled && look.post) post = postPipeline(scene, camera, profile.grade);
  };
  buildPost();

  let explored: ReadonlySet<number> = new Set();
  const showFlames = () => { for (const { flame, floor } of flames) flame.isVisible = look.torches && explored.has(floor); };
  const nearest = (hero: Point) => {
    if (clustered) return;
    const order = nearestLights(lights, hero, DUNGEON_LOOK.fallbackLights);
    lights.forEach((light, i) => { const on = look.torches && order.includes(i); if (light.isEnabled() !== on) light.setEnabled(on); });
  };
  let lastHero: Point = { x: 0, z: 0 };

  return {
    lantern, clustered, torchCount: torches.length,
    get look() { return { ...look }; },
    update(hero, nextZoom, nextPitch, toward) {
      if (isTactical(scene)) return;
      const behind = DUNGEON_LOOK.lantern.behind;
      lantern.position.set(hero.x + toward.x * behind, DUNGEON_LOOK.lantern.height, hero.z + toward.z * behind);
      zoom = nextZoom; pitch = nextPitch; setMaxZ();
      for (const { flame } of flames) flameLook.setFade(flame, 1 - cutAway(hero, flame.position, pitch, toward));
      if (Math.hypot(hero.x - lastHero.x, hero.z - lastHero.z) > 0.5) { lastHero = { x: hero.x, z: hero.z }; nearest(hero); }
    },
    refreshFog(next) { explored = next; showFlames(); },
    setPresentationEnabled(enabled) {
      if (presentationEnabled === enabled) return;
      presentationEnabled = enabled; buildPost();
    },
    setLook(change) {
      const rebuild = (change.ssao !== undefined && change.ssao !== look.ssao) || (change.post !== undefined && change.post !== look.post);
      Object.assign(look, change);
      container?.setEnabled(look.torches);
      if (!clustered) nearest(lastHero);
      showFlames();
      if (rebuild) buildPost();
    },
    burn(seconds) {
      if (isTactical(scene)) return;
      const time = flameLook.burn(seconds);
      lights.forEach((light, i) => light.intensity = (torches[i].intensity ?? DUNGEON_LOOK.torch.intensity) + Math.sin(time * 8 + i * 1.7) * DUNGEON_LOOK.torch.flicker);
    },
    dispose() { flameLook.dispose(); ao?.dispose(true); post?.dispose(); ao = post = null; },
  };
}
