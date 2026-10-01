import { publicAssetUrl } from "../asset-url.ts";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Engine } from "@babylonjs/core/Engines/engine.js";

import { dressForgeRoom } from "./forge-room.ts";
import { loadForgeStyle, paveForge } from "./forge-style.ts";
import { TEXTURED_SURFACES } from "../render/materials.ts";
import { postPipeline } from "../render/post.ts";
import { sharedSurface } from "../render/surface.ts";
import { buildArenaWorld, type ArenaAudit, type RoomMaterials, type RoomOcclusionTarget } from "./room.ts";
import type { PhysicsWorld } from "../core/engine/engine.ts";

// Side effects: the PBR pipeline and shadow support register themselves on import.
import "@babylonjs/core/Materials/Textures/Loaders/hdrTextureLoader.js";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";
import "@babylonjs/core/Rendering/depthRendererSceneComponent.js";
import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent.js";

export interface Arena {
  scene: Scene;
  camera: FreeCamera;
  materials: RoomMaterials;
  shadows: ShadowGenerator;
  /** A read-only scene census; calling it creates no Babylon object. */
  audit(): ArenaAudit;
  /** Hide an overhead prop only while it crosses the protected combat sight lines. */
  updateRoomOcclusion(targets: readonly RoomOcclusionTarget[]): void;
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
  // Vertical field of view, rad.
  camera.fov = 0.95;
  camera.minZ = 0.05;
  camera.maxZ = 220;

  // Image-based lighting gives metal and stone their reflections. Without the HDRI the scene still
  // lights, only flatter, so a fresh clone runs before anyone downloads it.
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

  const materials: RoomMaterials = {
    ground: forge.materials.basalt,
    wall: forge.materials.basalt,
    timber: sharedSurface(scene, TEXTURED_SURFACES.roomTimber),
    banner: forge.materials.banner,
    wood: sharedSurface(scene, TEXTURED_SURFACES.wood),
  };

  // The floor slab and the posts are colliders; the visible floor and the room's dressing are
  // separate meshes with no body, so the art can change without touching the physics.
  const world = buildArenaWorld(scene, physics, materials, {
    add: (mesh) => shadows.addShadowCaster(mesh),
    remove: (mesh) => shadows.removeShadowCaster(mesh),
  });

  paveForge(scene, forge.kit, forge.materials.pavement, forge.materials.lava);
  dressForgeRoom(scene, forge);
  postPipeline(scene, camera);

  return {
    scene, camera, materials, shadows, audit: world.audit,
    updateRoomOcclusion: (targets) => world.updateOcclusion(camera.position, targets),
  };
}
