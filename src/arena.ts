import { publicAssetUrl } from "./asset-url.ts";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Engine } from "@babylonjs/core/Engines/engine.js";

import { dressForgeRoom } from "./forge-room";
import { loadForgeStyle, paveForge, forgePost } from "./forge-style";
import { OBJECT_SURFACE_VARIANTS, TEXTURED_SURFACES } from "./materials";
import { sharedSurface, surfaceVariant } from "./surface";
import { buildArenaWorld, type ArenaAudit, type RoomOcclusionTarget } from "./arena-room";
import type { PhysicsWorld } from "./core/engine/engine.ts";

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

/**
 * The arena's scene: its light, its room and its solids, which are fixed colliders in the physics
 * `physicsFor` makes on the scene (the core's world, `createWorld`).
 */
export async function buildArena(engine: Engine, physicsFor: (scene: Scene) => PhysicsWorld): Promise<Arena> {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.055, 0.062, 0.078, 1);
  scene.ambientColor = new Color3(0.14, 0.15, 0.18);

  // Physics first: the room's solids go into it as they are built.
  const physics = physicsFor(scene);

  const camera = new FreeCamera("camera", new Vector3(0, 2, -4), scene);
  // Vertical field of view, rad: the old arena's.
  camera.fov = 0.95;
  camera.minZ = 0.05;
  camera.maxZ = 220;

  // Image-based lighting is what makes a steel blade read as steel rather than
  // as a grey box. If the HDRI has not been fetched, the scene still lights --
  // just flatter -- so a fresh clone runs before anyone downloads anything.
  try {
    const env = new HDRCubeTexture(publicAssetUrl("/assets/env.hdr"), scene, 256, false, true, false, true);
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
  sun.diffuse = new Color3(1, 0.85, 0.66);

  const shadows = new ShadowGenerator(2048, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadows.bias = 0.0015;
  shadows.normalBias = 0.012;

  const forge = await loadForgeStyle(scene);

  // The two textured parents. Steel and leather have the same decoded image and Babylon-LH
  // tangent basis on every geometry family that uses them, so the scene owns one wrapper for each
  // image file and the weapon materials below are scalar variants of it.
  const figureSteel = sharedSurface(scene, TEXTURED_SURFACES.figureSteel);
  const figureLeather = sharedSurface(scene, TEXTURED_SURFACES.figureLeather);
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
    ground: forge.materials.basalt,
    wall: forge.materials.basalt,
    timber: sharedSurface(scene, TEXTURED_SURFACES.roomTimber),
    banner: forge.materials.banner,
    arrowAccent: plainSurface(
      scene,
      "arrow-accent",
      new Color3(1.0, 0.46, 0.08),
      0.0,
      1.0,
    ),
  };
  materials.arrowAccent.unlit = true;
  materials.arrowAccent.emissiveColor.copyFrom(materials.arrowAccent.albedoColor);

  // The invisible authoritative slab and fourteen post colliders retain their
  // session-09 dimensions. The visible floor and room dressing are a separate
  // owner with no body, so art can be removed without changing the solver.
  const world = buildArenaWorld(scene, physics, materials, {
    add: (mesh) => shadows.addShadowCaster(mesh),
    remove: (mesh) => shadows.removeShadowCaster(mesh),
  });

  paveForge(scene, forge.kit, forge.materials.pavement, forge.materials.lava);
  dressForgeRoom(scene, forge);
  forgePost(scene, camera);

  return {
    scene, camera, materials, shadows, audit: world.audit,
    updateRoomOcclusion: (targets) => world.updateOcclusion(camera.position, targets),
  };
}
