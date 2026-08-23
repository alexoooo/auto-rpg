import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
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
import { LAYER, COLLIDES, attachPhysics } from "./physics";

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

/**
 * The PBR maps a surface can be given, by role.
 *
 * `null` for a surface that has none. Not every one of the nine wants a texture:
 * the ground is seen at a glance and from a long way off, and flesh is the one
 * thing a *tiling* map cannot help -- a face wearing a repeating pattern reads
 * worse than a face wearing nothing.
 */
type Dressing = "steel" | "leather" | "cloth" | "wood" | null;

/**
 * One PBR surface, with its maps if it has any.
 *
 * The maps are what stops the warriors reading as a toy. Twenty-one welded
 * primitives painted in four flat colours are twenty-one flat colours however
 * good the silhouette is, because a real surface is not one colour anywhere --
 * and a normal map costs nothing at run time and does more for how a breastplate
 * reads than any amount of extra geometry would.
 *
 * **Only the normal map**, and that is a decision taken at a screenshot rather
 * than a corner cut. The published sets also carry a diffuse and a roughness map
 * and both were wired up first. What that looked like:
 *
 * - **diffuse**: Babylon multiplies `albedoTexture` by `albedoColor`, and a
 *   photographic diffuse map averages well below white -- so every surface in
 *   the scene came out at roughly a third of its intended brightness and the
 *   two fighters read as black cutouts. The colours in the palette are not
 *   decoration, they are the identity of each surface and the thing `figure.ts`
 *   tints a surcoat with, so the fix is not to throw them away and let a
 *   photograph of an industrial plate decide what steel looks like. It would be
 *   to normalise each map to a mean of one, which is an image-processing step
 *   this repository has no business growing.
 * - **roughness**: fed through `metallicTexture`, which is the packed ORM slot,
 *   it tinted everything green once the albedo map was gone. Not chased,
 *   because it was worth much less than the normal map and cost a shader path
 *   nobody here understands yet.
 *
 * What is left is the part that was doing the work anyway. A normal map is pure
 * relief: it changes how light rakes across a surface and it cannot change its
 * colour, so the palette and the per-side tint come through untouched and a
 * breastplate stops being a flat facet.
 *
 * **Missing files are not an error.** `Texture` reports the failure and the
 * material simply keeps its flat colour, which is the same way the page already
 * degrades without `warrior.glb` and without the environment map -- it still
 * runs, it just looks flatter. The textures are fetched rather than committed,
 * so a fresh clone that has not run `npm run asset:fetch` lands exactly there.
 */
function surface(
  scene: Scene,
  name: string,
  albedo: Color3,
  metallic: number,
  roughness: number,
  dressing: Dressing = null,
): PBRMaterial {
  const material = new PBRMaterial(name, scene);
  material.albedoColor = albedo;
  material.metallic = metallic;
  material.roughness = roughness;
  if (!dressing) return material;

  const T = CONFIG.surfaces;
  const normal = new Texture(
    `/assets/textures/${dressing}_nor_gl.jpg`,
    scene,
    // Mipmaps on. Leaving them off would be a subtle mistake: these tile several
    // times across a piece the size of a helm, and an unmipped tiling texture at
    // arena range is a field of aliasing that reads as sparkle.
    false,
    // `invertY` false, because a JPEG is stored top-down and Babylon's default
    // assumes otherwise. Get it wrong and every surface lights as though the sun
    // were underneath it -- which looks like a lighting problem rather than a
    // wrong flag, and costs an afternoon.
    false,
  );
  // A normal map is data, not colour, and must not be gamma-decoded on the way
  // in. This is the second half of the same mistake as `invertY`, and it looks
  // like a material that is not quite catching the light.
  normal.gammaSpace = false;
  normal.uScale = T.tiles[dressing];
  normal.vScale = T.tiles[dressing];
  normal.level = T.normalStrength;

  material.bumpTexture = normal;
  // Poly Haven publishes the OpenGL convention -- green up -- which is what
  // these two say. With the DirectX set, or with these flipped, every dent
  // reads as a bump.
  material.invertNormalMapY = false;
  material.invertNormalMapX = false;
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

  // The colours are unchanged. What is new is the last argument: which set of
  // maps each surface wears, or nothing. `flesh` and `ground` wear nothing on
  // purpose -- a tiling map cannot help a face, and the ground is seen at a
  // glance from a long way off.
  const materials: Palette = {
    steel: surface(scene, "steel", new Color3(0.62, 0.65, 0.70), 1.0, 0.22, "steel"),
    brass: surface(scene, "brass", new Color3(0.62, 0.47, 0.20), 1.0, 0.34, "steel"),
    leather: surface(scene, "leather", new Color3(0.16, 0.11, 0.08), 0.0, 0.78, "leather"),
    cloth: surface(scene, "cloth", new Color3(0.29, 0.10, 0.12), 0.0, 0.92, "cloth"),
    flesh: surface(scene, "flesh", new Color3(0.68, 0.48, 0.38), 0.0, 0.68),
    hide: surface(scene, "hide", new Color3(0.55, 0.44, 0.30), 0.0, 0.85, "leather"),
    wood: surface(scene, "wood", new Color3(0.22, 0.15, 0.09), 0.0, 0.88, "wood"),
    straw: surface(scene, "straw", new Color3(0.68, 0.57, 0.30), 0.0, 0.9, "cloth"),
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
