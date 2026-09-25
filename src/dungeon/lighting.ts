import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { ClusteredLightContainer } from "@babylonjs/core/Lights/Clustered/clusteredLightContainer.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline.js";
import type { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js";
import type { Camera } from "@babylonjs/core/Cameras/camera.js";
import type { Scene } from "@babylonjs/core/scene.js";
import "@babylonjs/core/Materials/Textures/Loaders/hdrTextureLoader.js";
import "@babylonjs/core/Rendering/geometryBufferRendererSceneComponent.js";
import "@babylonjs/core/Rendering/prePassRendererSceneComponent.js";
import "@babylonjs/core/Lights/Clustered/clusteredLightingSceneComponent.js";
import { forgePost } from "../forge-post.ts";
import { publicAssetUrl } from "../asset-url.ts";
import { cameraDistance } from "./camera.ts";
import { flameFade, flameMaterial } from "./fire.ts";
import { orthographicLightProxy } from "./light-proxy.ts";
import { cellKey, type DungeonMap, type Point } from "./map.ts";
import type { TorchPlacement } from "./dressing.ts";

/**
 * The dungeon's light. Every number is a starting value set by eye against the concept art on the owner's
 * machine, which is where it is judged; my tab paints no frames.
 */
export const DUNGEON_LOOK = Object.freeze({
  /** A cold, dim fill from above that leaves the torches to do the work. It was 0.85 of a pale blue before. */
  ambient: Object.freeze({ intensity: 0.18, diffuse: "#7d8fb3", ground: "#1a1614" }),
  /** The arena's HDRI, kept low underground: enough to give bronze and wet stone a reflection. */
  environmentIntensity: 0.22,
  /** Carried at `height`, `behind` metres from the hero toward the camera, so the faces the camera sees are lit.
   * A PBR point light falls off by inverse square, so the old 1.8 at 5 m lit almost nothing on a PBR golem. */
  lantern: Object.freeze({ color: "#ffcf8f", intensity: 9, height: 2.6, behind: 0.8 }),
  /** A torch, and how far its flicker swings the intensity either way. */
  torch: Object.freeze({ color: "#ff8a3d", intensity: 6, flicker: 0.6 }),
  /** Contact shadow at the foot of walls and bodies. The art proof's radius 0.16 and strength 0.8 are for a
   * close perspective view; this camera stands 30 m off. */
  ssao: Object.freeze({ ratio: 0.5, radius: 0.35, totalStrength: 1.1, samples: 8 }),
  clearColor: Object.freeze([0.008, 0.010, 0.016] as const),
  /** Torch lights kept on when the clustered container is not supported: the ones nearest the hero. Materials
   * carry four lights, and the ambient and the lantern take two of them. */
  fallbackLights: 2,
  /** The contribution at which a light's range is drawn, a sixth of the ambient. */
  cutoff: 0.03,
});

/** A PBR point light never reaches zero, and `range` does not shape it: the clustered container culls by it.
 * Drawn where the inverse-square contribution has fallen to `cutoff`: 14.8 m for a torch at the top of its
 * flicker, 17.3 m for the lantern. The container's tile fit is exact under this camera only because
 * `orthographicLightProxy` makes it so. */
export const lightRange = (intensity: number): number => Math.sqrt(intensity / DUNGEON_LOOK.cutoff);

export interface LookSwitches { torches: boolean; ssao: boolean; post: boolean }

export interface DungeonLighting {
  readonly lantern: PointLight;
  /** Whether the torches are in a clustered container rather than plain lights. */
  readonly clustered: boolean;
  readonly torchCount: number;
  readonly look: Readonly<LookSwitches>;
  update(hero: Point, zoom: number, pitch: number): void;
  /** A flame whose floor is unexplored would show where a room is before the fog does. */
  refreshFog(explored: ReadonlySet<number>): void;
  setLook(change: Partial<LookSwitches>): void;
  dispose(): void;
}

export function lightDungeon(scene: Scene, camera: Camera, map: DungeonMap, torches: readonly TorchPlacement[]): DungeonLighting {
  const look: LookSwitches = { torches: true, ssao: true, post: true };
  scene.clearColor = new Color4(...DUNGEON_LOOK.clearColor, 1);
  const ambient = new HemisphericLight("dungeon ambient", new Vector3(0.3, 1, -0.4), scene);
  ambient.intensity = DUNGEON_LOOK.ambient.intensity;
  ambient.diffuse = Color3.FromHexString(DUNGEON_LOOK.ambient.diffuse);
  ambient.groundColor = Color3.FromHexString(DUNGEON_LOOK.ambient.ground);
  // As `buildArena` does: without the file the scene still lights, only flatter.
  try {
    scene.environmentTexture = new HDRCubeTexture(publicAssetUrl("/assets/env.hdr"), scene, 256, false, true, false, true);
    scene.environmentIntensity = DUNGEON_LOOK.environmentIntensity;
  } catch {
    scene.environmentIntensity = 0;
  }
  const lantern = new PointLight("wanderer lantern", Vector3.Zero(), scene);
  lantern.diffuse = Color3.FromHexString(DUNGEON_LOOK.lantern.color);
  lantern.intensity = DUNGEON_LOOK.lantern.intensity;
  lantern.range = lightRange(lantern.intensity);

  const flameLook = flameMaterial(scene), fire = flameLook.material;
  const torchColor = Color3.FromHexString(DUNGEON_LOOK.torch.color);
  const flames = torches.map((torch, i) => {
    const flame = MeshBuilder.CreatePlane(`torch.flame.${i}`, { width: 0.3, height: 0.58 }, scene);
    flame.position.set(torch.flame.x, torch.flame.y, torch.flame.z);
    flame.material = fire; flame.billboardMode = Mesh.BILLBOARDMODE_Y; flame.isPickable = false; flame.isVisible = false;
    return { flame, floor: cellKey(map, { x: torch.cell.x + torch.facing.x, z: torch.cell.z + torch.facing.z }) };
  });
  const lights = torches.map((torch, i) => {
    const light = new PointLight(`torch.light.${i}`, new Vector3(torch.light.x, torch.light.y, torch.light.z), scene);
    light.diffuse = torchColor; light.intensity = DUNGEON_LOOK.torch.intensity;
    light.range = lightRange(DUNGEON_LOOK.torch.intensity + DUNGEON_LOOK.torch.flicker);
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
  const setMaxZ = () => { if (ao) ao.maxZ = (cameraDistance(pitch) + 1 / Math.sin(pitch) + zoom / Math.tan(pitch)) / 0.75 + 1; };
  // Always rebuilt whole and in this order: a pipeline detached and re-attached appends its passes to the end of
  // the camera's list, and a control row taken after that is not the baseline.
  const buildPost = () => {
    ao?.dispose(true); post?.dispose(); ao = post = null;
    if (look.ssao) {
      ao = new SSAO2RenderingPipeline("dungeon.ao", scene, { ssaoRatio: DUNGEON_LOOK.ssao.ratio, blurRatio: 1 }, [camera]);
      ao.radius = DUNGEON_LOOK.ssao.radius; ao.totalStrength = DUNGEON_LOOK.ssao.totalStrength;
      ao.samples = DUNGEON_LOOK.ssao.samples; ao.expensiveBlur = false; setMaxZ();
    }
    if (look.post) post = forgePost(scene, camera);
  };
  buildPost();

  let explored: ReadonlySet<number> = new Set();
  const showFlames = () => { for (const { flame, floor } of flames) flame.isVisible = look.torches && explored.has(floor); };
  const nearest = (hero: Point) => {
    if (clustered) return;
    const order = lights.map((light, i) => ({ i, d: Math.hypot(light.position.x - hero.x, light.position.z - hero.z) }))
      .sort((a, b) => a.d - b.d).slice(0, DUNGEON_LOOK.fallbackLights).map(o => o.i);
    lights.forEach((light, i) => { const on = look.torches && order.includes(i); if (light.isEnabled() !== on) light.setEnabled(on); });
  };
  let time = 0, lastHero: Point = { x: 0, z: 0 };
  const flicker = scene.onBeforeRenderObservable.add(() => {
    if (scene.physicsEnabled) time += Math.min(scene.getEngine().getDeltaTime(), 50) / 1000;
    fire.setFloat("time", time);
    lights.forEach((light, i) => light.intensity = DUNGEON_LOOK.torch.intensity + Math.sin(time * 8 + i * 1.7) * DUNGEON_LOOK.torch.flicker);
  });

  return {
    lantern, clustered, torchCount: torches.length,
    get look() { return { ...look }; },
    update(hero, nextZoom, nextPitch) {
      const step = DUNGEON_LOOK.lantern.behind / Math.SQRT2;
      lantern.position.set(hero.x + step, DUNGEON_LOOK.lantern.height, hero.z + step);
      zoom = nextZoom; pitch = nextPitch; setMaxZ();
      for (const { flame } of flames) flameLook.setFade(flame, flameFade(hero, flame.position, pitch));
      if (Math.hypot(hero.x - lastHero.x, hero.z - lastHero.z) > 0.5) { lastHero = { x: hero.x, z: hero.z }; nearest(hero); }
    },
    refreshFog(next) { explored = next; showFlames(); },
    setLook(change) {
      const rebuild = (change.ssao !== undefined && change.ssao !== look.ssao) || (change.post !== undefined && change.post !== look.post);
      Object.assign(look, change);
      container?.setEnabled(look.torches);
      if (!clustered) nearest(lastHero);
      showFlames();
      if (rebuild) buildPost();
    },
    dispose() { scene.onBeforeRenderObservable.remove(flicker); flameLook.dispose(); ao?.dispose(true); post?.dispose(); ao = post = null; },
  };
}
