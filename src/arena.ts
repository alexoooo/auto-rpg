import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration.js";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js";
import type { Engine } from "@babylonjs/core/Engines/engine.js";

import HavokPhysics from "@babylonjs/havok";
// Havok's solver is a WebAssembly module shipped beside its ESM bundle. Vite
// will not find it on its own, so hand it the resolved URL explicitly.
//
// This lives here rather than beside `attachPhysics` in `src/physics.ts`
// because it is the one line in the whole bring-up that only a bundler can
// resolve: Node's ESM resolver rejects the `?url` subpath outright, and a
// module that carries it takes every one of its importers -- `fighter.ts` and
// `combat.ts` among them -- out of reach of a headless harness. `arena.ts` is
// already the browser's half of the directory and imports HDR textures and a
// post-processing pipeline, so it is where a browser-only import belongs.
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";

import { CONFIG } from "./config";
import { OBJECT_SURFACE_VARIANTS, TEXTURED_SURFACES } from "./materials";
import { attachPhysics } from "./physics";
import { sharedSurface, surfaceVariant } from "./surface";
import type { FigureMaterials } from "./figure";
import { buildArenaWorld, type ArenaAudit, type RoomOcclusionTarget } from "./arena-room";

// Side effects: the PBR pipeline and shadow support register themselves on import.
import "@babylonjs/core/Materials/Textures/Loaders/hdrTextureLoader.js";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";
import "@babylonjs/core/Rendering/depthRendererSceneComponent.js";
import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent.js";

export interface Palette {
  steel: PBRMaterial;
  edge: PBRMaterial;
  brass: PBRMaterial;
  leather: PBRMaterial;
  cloth: PBRMaterial;
  flesh: PBRMaterial;
  hide: PBRMaterial;
  wood: PBRMaterial;
  paintedWood: PBRMaterial;
  bowString: PBRMaterial;
  straw: PBRMaterial;
  ground: PBRMaterial;
  wall: PBRMaterial;
  timber: PBRMaterial;
  banner: PBRMaterial;
  arrowAccent: PBRMaterial;
  /** Authored costume surfaces, separated from weapon/fallback geometry. */
  figure: FigureMaterials;
}

export interface Arena {
  scene: Scene;
  camera: FreeCamera;
  materials: Palette;
  shadows: ShadowGenerator;
  /** A read-only scene census; calling it creates no Babylon object. */
  audit(): ArenaAudit;
  /** Hide an overhead prop only while it crosses the protected combat sight lines. */
  updateRoomOcclusion(targets: readonly RoomOcclusionTarget[]): void;
}

function plainSurface(
  scene: Scene,
  name: string,
  albedo: Color3,
  metallic: number,
  roughness: number,
): PBRMaterial {
  const material = new PBRMaterial(name, scene);
  material.albedoColor = albedo;
  material.metallic = metallic;
  material.roughness = roughness;
  return material;
}

export async function buildArena(engine: Engine): Promise<Arena> {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.055, 0.062, 0.078, 1);
  scene.ambientColor = new Color3(0.14, 0.15, 0.18);

  // Physics first. Every PhysicsAggregate below needs a live engine on the
  // scene, and building one before it exists fails with the singularly
  // unhelpful "No Physics Engine available".
  attachPhysics(scene, await HavokPhysics({ locateFile: () => havokWasmUrl }));

  // A fixed physics timestep, accumulated across frames. Babylon reads this in
  // Scene._advancePhysicsEngineStep and steps the solver a whole number of times
  // per frame, so the solver never sees a variable delta. The value is in
  // milliseconds. Without it the sword shivers in the hand.
  scene.getPhysicsEngine()?.setSubTimeStep(1000 / CONFIG.world.physicsHz);

  const camera = new FreeCamera("camera", new Vector3(0, 2, -4), scene);
  camera.fov = CONFIG.camera.fov;
  camera.minZ = 0.05;
  camera.maxZ = 220;

  // Image-based lighting is what makes a steel blade read as steel rather than
  // as a grey box. If the HDRI has not been fetched, the scene still lights --
  // just flatter -- so a fresh clone runs before anyone downloads anything.
  try {
    const env = new HDRCubeTexture("/assets/env.hdr", scene, 256, false, true, false, true);
    scene.environmentTexture = env;
    scene.environmentIntensity = 0.85;
  } catch {
    scene.environmentIntensity = 0;
  }

  const sky = new HemisphericLight("sky", new Vector3(0.2, 1, 0.1), scene);
  sky.intensity = 0.45;
  sky.diffuse = new Color3(0.72, 0.78, 0.92);
  sky.groundColor = new Color3(0.24, 0.2, 0.16);

  const sun = new DirectionalLight("sun", new Vector3(-0.45, -1, 0.62), scene);
  sun.position = new Vector3(9, 16, -12);
  sun.intensity = 2.6;
  sun.diffuse = new Color3(1, 0.95, 0.86);

  const shadows = new ShadowGenerator(2048, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadows.bias = 0.0015;
  shadows.normalBias = 0.012;

  const figureSteel = sharedSurface(scene, TEXTURED_SURFACES.figureSteel);
  const figureLeather = sharedSurface(scene, TEXTURED_SURFACES.figureLeather);
  const figure: FigureMaterials = {
    steel: figureSteel,
    leather: figureLeather,
    cloth: sharedSurface(scene, TEXTURED_SURFACES.figureCloth),
    flesh: sharedSurface(scene, TEXTURED_SURFACES.figureFlesh),
  };
  // Steel and leather have the same decoded image and Babylon-LH tangent basis
  // on both geometry families. Keep distinct scalar materials, but make the
  // scene own only one wrapper for each image file.
  const weaponSteel = surfaceVariant(scene, { ...TEXTURED_SURFACES.weaponSteel, textures: {} }, figureSteel);
  const weaponLeather = surfaceVariant(scene, { ...TEXTURED_SURFACES.weaponLeather, textures: {} }, figureLeather);
  const weaponWood = sharedSurface(scene, TEXTURED_SURFACES.weaponWood);
  const materials: Palette = {
    steel: weaponSteel,
    edge: surfaceVariant(scene, OBJECT_SURFACE_VARIANTS.edge, figureSteel),
    brass: sharedSurface(scene, TEXTURED_SURFACES.weaponBrass),
    leather: weaponLeather,
    cloth: plainSurface(scene, "cloth", new Color3(0.29, 0.10, 0.12), 0.0, 0.92),
    flesh: plainSurface(scene, "flesh", new Color3(0.68, 0.48, 0.38), 0.0, 0.68),
    hide: plainSurface(scene, "hide", new Color3(0.55, 0.44, 0.30), 0.0, 0.85),
    wood: weaponWood,
    paintedWood: sharedSurface(scene, TEXTURED_SURFACES.paintedShieldBoard),
    bowString: surfaceVariant(scene, OBJECT_SURFACE_VARIANTS.bowString, figureLeather),
    straw: plainSurface(scene, "straw", new Color3(0.68, 0.57, 0.30), 0.0, 0.9),
    ground: sharedSurface(scene, TEXTURED_SURFACES.ground),
    wall: sharedSurface(scene, TEXTURED_SURFACES.roomWall),
    timber: sharedSurface(scene, TEXTURED_SURFACES.roomTimber),
    banner: sharedSurface(scene, TEXTURED_SURFACES.roomBanner),
    arrowAccent: plainSurface(
      scene,
      "arrow-accent",
      new Color3(CONFIG.arrow.visual.emissive.r, CONFIG.arrow.visual.emissive.g, CONFIG.arrow.visual.emissive.b),
      0.0,
      1.0,
    ),
    figure,
  };
  materials.arrowAccent.unlit = true;
  materials.arrowAccent.emissiveColor.copyFrom(materials.arrowAccent.albedoColor);

  // The invisible authoritative slab and fourteen post colliders retain their
  // session-09 dimensions. The visible floor and room dressing are a separate
  // owner with no body, so art can be removed without changing the solver.
  const world = buildArenaWorld(scene, materials, {
    add: (mesh) => shadows.addShadowCaster(mesh),
    remove: (mesh) => shadows.removeShadowCaster(mesh),
  });

  const pipeline = new DefaultRenderingPipeline("post", true, scene, [camera]);
  pipeline.samples = 4;
  pipeline.imageProcessing.toneMappingEnabled = true;
  pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  pipeline.imageProcessing.contrast = 1.35;
  pipeline.imageProcessing.exposure = 1.05;
  pipeline.imageProcessing.vignetteEnabled = true;
  pipeline.imageProcessing.vignetteWeight = 2.2;
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.82;
  pipeline.bloomWeight = 0.22;

  return {
    scene, camera, materials, shadows, audit: world.audit,
    updateRoomOcclusion: (targets) => world.updateOcclusion(camera.position, targets),
  };
}
