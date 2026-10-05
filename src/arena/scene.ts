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

import { dressForgeRoom, paintArenaBanners, type ForgeFire } from "./forge-room.ts";
import { loadForgeStyle, paveForge } from "./forge-style.ts";
import { postPipeline } from "../render/post.ts";
import { buildArenaWorld, type ArenaAudit, type RoomMaterials, type RoomOcclusionTarget } from "./room.ts";
import type { PhysicsWorld } from "../core/engine/engine.ts";

// Side effects: the PBR pipeline and shadow support register themselves on import.
import "@babylonjs/core/Materials/Textures/Loaders/hdrTextureLoader.js";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";
import "@babylonjs/core/Rendering/depthRendererSceneComponent.js";
import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent.js";

interface Arena {
  scene: Scene;
  camera: FreeCamera;
  materials: RoomMaterials;
  shadows: ShadowGenerator;
  /** A read-only scene census; calling it creates no Babylon object. */
  audit(): ArenaAudit;
  /** Hide a parapet section only while it crosses the protected combat sight lines. */
  updateRoomOcclusion(targets: readonly RoomOcclusionTarget[]): void;
  /** The posts' fire, which the page burns each frame it is not paused. */
  fire: ForgeFire;
}

/**
 * The arena's light and its camera's lens, set by eye (`docs/reference/look.md#arena-light`): a
 * cool fill from the sky over a warm bounce from the ground, a warm sun with its shadow map, and
 * the image the metal and the stone reflect. Colours are red, green and blue from 0 to 1;
 * directions and places are the world's, m.
 */
const ARENA_LIGHT = Object.freeze({
  /** What shows where nothing is drawn, with its alpha, and the ambient colour. */
  clear: [0.026, 0.017, 0.021, 1],
  ambient: [0.14, 0.15, 0.18],
  /** Where the camera is made, before the page's orbit places it; its vertical field of view, rad; its near and far planes, m. */
  camera: { start: [0, 2, -4], fov: 0.95, near: 0.05, far: 220 },
  /** The reflected image: its cube's side, px, and its strength. */
  environment: { size: 256, intensity: 0.85 },
  sky: { direction: [0.2, 1, 0.1], intensity: 0.45, diffuse: [0.72, 0.78, 0.92], ground: [0.24, 0.2, 0.16] },
  sun: { direction: [-0.45, -1, 0.62], position: [9, 16, -12], intensity: 2.6, diffuse: [1, 0.85, 0.66] },
  /** The sun's shadow map: its side, px, and the two biases that keep a lit face from shadowing itself. */
  shadow: { size: 2048, bias: 0.0015, normalBias: 0.012 },
} as const);

/**
 * The arena's scene: its light, its room and its solids, which are fixed colliders in the physics
 * `physicsFor` makes on the scene (the core's world, `createWorld`).
 */
export async function buildArena(engine: Engine, physicsFor: (scene: Scene) => PhysicsWorld): Promise<Arena> {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(...ARENA_LIGHT.clear);
  scene.ambientColor = new Color3(...ARENA_LIGHT.ambient);

  // Physics first: the room's solids go into it as they are built.
  const physics = physicsFor(scene);

  const camera = new FreeCamera("camera", new Vector3(...ARENA_LIGHT.camera.start), scene);
  camera.fov = ARENA_LIGHT.camera.fov;
  camera.minZ = ARENA_LIGHT.camera.near;
  camera.maxZ = ARENA_LIGHT.camera.far;

  // Image-based lighting gives metal and stone their reflections. Without the HDRI the scene still
  // lights, only flatter, so a fresh clone runs before anyone downloads it.
  try {
    const env = new HDRCubeTexture(publicAssetUrl("/assets/env.hdr"), scene, ARENA_LIGHT.environment.size, false, true, false, true);
    scene.environmentTexture = env;
    scene.environmentIntensity = ARENA_LIGHT.environment.intensity;
  } catch {
    scene.environmentIntensity = 0;
  }

  const sky = new HemisphericLight("sky", new Vector3(...ARENA_LIGHT.sky.direction), scene);
  sky.intensity = ARENA_LIGHT.sky.intensity;
  sky.diffuse = new Color3(...ARENA_LIGHT.sky.diffuse);
  sky.groundColor = new Color3(...ARENA_LIGHT.sky.ground);

  const sun = new DirectionalLight("sun", new Vector3(...ARENA_LIGHT.sun.direction), scene);
  sun.position = new Vector3(...ARENA_LIGHT.sun.position);
  sun.intensity = ARENA_LIGHT.sun.intensity;
  sun.diffuse = new Color3(...ARENA_LIGHT.sun.diffuse);

  const shadows = new ShadowGenerator(ARENA_LIGHT.shadow.size, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadows.bias = ARENA_LIGHT.shadow.bias;
  shadows.normalBias = ARENA_LIGHT.shadow.normalBias;

  const forge = await loadForgeStyle(scene);

  const materials: RoomMaterials = {
    ground: forge.materials.basalt,
    wall: forge.materials.basalt,
    banner: forge.materials.banner,
    wood: forge.materials.basalt,
  };

  // The floor slab and the posts are colliders; the visible floor and the room's dressing are
  // separate meshes with no body, so the art can change without touching the physics.
  const world = buildArenaWorld(scene, physics, materials, {
    add: (mesh) => shadows.addShadowCaster(mesh),
    remove: (mesh) => shadows.removeShadowCaster(mesh),
  });

  paveForge(scene, forge.materials.pavement, forge.materials.brazierBronze, forge.materials.lava);
  paintArenaBanners(scene, forge);
  const fire = dressForgeRoom(scene, forge);
  postPipeline(scene, camera);

  return {
    scene, camera, materials, shadows, fire, audit: world.audit,
    updateRoomOcclusion: (targets) => world.updateOcclusion(camera.position, targets),
  };
}
