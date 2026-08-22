import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration.js";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js";
import type { Engine } from "@babylonjs/core/Engines/engine.js";

import { CONFIG } from "./config";
import { LAYER, COLLIDES, startPhysics } from "./physics";

// Side effects: the PBR pipeline and shadow support register themselves on import.
import "@babylonjs/core/Materials/Textures/Loaders/hdrTextureLoader.js";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";
import "@babylonjs/core/Rendering/depthRendererSceneComponent.js";
import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent.js";

export interface Palette {
  steel: PBRMaterial;
  brass: PBRMaterial;
  leather: PBRMaterial;
  cloth: PBRMaterial;
  flesh: PBRMaterial;
  hide: PBRMaterial;
  wood: PBRMaterial;
  straw: PBRMaterial;
  ground: PBRMaterial;
}

export interface Arena {
  scene: Scene;
  camera: FreeCamera;
  materials: Palette;
  shadows: ShadowGenerator;
}

function surface(
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
  await startPhysics(scene);

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

  const materials: Palette = {
    steel: surface(scene, "steel", new Color3(0.62, 0.65, 0.70), 1.0, 0.22),
    brass: surface(scene, "brass", new Color3(0.62, 0.47, 0.20), 1.0, 0.34),
    leather: surface(scene, "leather", new Color3(0.16, 0.11, 0.08), 0.0, 0.78),
    cloth: surface(scene, "cloth", new Color3(0.29, 0.10, 0.12), 0.0, 0.92),
    flesh: surface(scene, "flesh", new Color3(0.68, 0.48, 0.38), 0.0, 0.68),
    hide: surface(scene, "hide", new Color3(0.55, 0.44, 0.30), 0.0, 0.85),
    wood: surface(scene, "wood", new Color3(0.22, 0.15, 0.09), 0.0, 0.88),
    straw: surface(scene, "straw", new Color3(0.68, 0.57, 0.30), 0.0, 0.9),
    ground: surface(scene, "ground", new Color3(0.15, 0.14, 0.12), 0.0, 0.96),
  };

  const ground = MeshBuilder.CreateBox("ground", { width: 60, height: 1, depth: 60 }, scene);
  ground.position.y = -0.5;
  ground.material = materials.ground;
  ground.receiveShadows = true;
  const groundBody = new PhysicsAggregate(
    ground,
    PhysicsShapeType.BOX,
    { mass: 0, friction: 0.9, restitution: 0.02 },
    scene,
  );
  groundBody.shape.filterMembershipMask = LAYER.WORLD;
  groundBody.shape.filterCollideMask = COLLIDES.WORLD;

  // A ring of posts. They exist so the eye has something to judge speed and
  // distance against -- a swing over featureless ground looks like nothing.
  for (let i = 0; i < 14; i += 1) {
    const angle = (i / 14) * Math.PI * 2;
    const post = MeshBuilder.CreateCylinder(
      `post${i}`,
      { height: 1.5, diameter: 0.17, tessellation: 8 },
      scene,
    );
    post.position.set(Math.sin(angle) * 9.5, 0.75, Math.cos(angle) * 9.5);
    post.material = materials.wood;
    post.receiveShadows = true;
    shadows.addShadowCaster(post);
    const body = new PhysicsAggregate(post, PhysicsShapeType.CYLINDER, { mass: 0 }, scene);
    body.shape.filterMembershipMask = LAYER.WORLD;
    body.shape.filterCollideMask = COLLIDES.WORLD;
  }

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

  return { scene, camera, materials, shadows };
}
