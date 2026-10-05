import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Camera } from "@babylonjs/core/Cameras/camera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Viewport } from "@babylonjs/core/Maths/math.viewport.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { buildBody, type BuiltBody } from "../core/build/build-body.ts";
import { modelSpec, type BodyModel } from "../core/human/spec.ts";
import type { PhysicsEngine } from "../core/engine/engine.ts";
import { createWorld } from "../core/world.ts";
import { dresserFor, type Dresser } from "./dress.ts";
import { publicAssetUrl } from "../asset-url.ts";

/** The game's skins on unstepped bodies. Each column has its own camera, so resizing
 * keeps the characters centred. This scene draws on load, selection and resize;
 * its lighting, framing and plinth sizes are art choices in `docs/art/menu.md`. */
export async function showHeroLineup(canvas: HTMLCanvasElement, physics: PhysicsEngine,
  models: readonly BodyModel[], signal: AbortSignal): Promise<{ setModel(index: number, model: BodyModel): Promise<void> }> {
  const engine = new Engine(canvas, true, { alpha: true, preserveDrawingBuffer: true });
  engine.setHardwareScalingLevel(1 / Math.min(devicePixelRatio, 1.5));
  const scene = new Scene(engine), world = createWorld(scene, physics, { gravity: false });
  scene.clearColor = new Color4(0, 0, 0, 0);
  scene.environmentTexture = new HDRCubeTexture(publicAssetUrl("/assets/env.hdr"), scene, 128);
  scene.environmentIntensity = .65;
  const fill = new HemisphericLight("lineup fill", new Vector3(0, 1, 1), scene);
  fill.intensity = .85;
  fill.groundColor = Color3.FromHexString("#322423");
  const key = new DirectionalLight("lineup key", new Vector3(.5, -1, -1), scene);
  key.diffuse = Color3.FromHexString("#ffe1b7"); key.intensity = 2.2;
  const rim = new DirectionalLight("lineup rim", new Vector3(-.5, -.3, 1), scene);
  rim.diffuse = Color3.FromHexString("#d76b52"); rim.intensity = 1.4;
  const stone = new StandardMaterial("lineup plinth", scene);
  stone.diffuseColor = Color3.FromHexString("#292321"); stone.specularColor = Color3.Black();
  const revisions = models.map(() => 0);
  const dressers = new Map<BodyModel, Promise<Dresser>>();
  const bodies: BuiltBody[] = [], skins: ReturnType<Dresser>[] = [], cameras: FreeCamera[] = [];
  let ready = false;
  const draw = () => {
    if (!ready || signal.aborted || !canvas.checkVisibility()) return;
    engine.resize();
    const aspect = canvas.clientWidth / models.length / canvas.clientHeight;
    // A full body with headroom; narrow columns retain space for the arms (docs/art/menu.md).
    const halfHeight = Math.max(1.12, .62 / aspect);
    for (const camera of cameras) {
      camera.orthoTop = halfHeight; camera.orthoBottom = -halfHeight;
      camera.orthoLeft = -halfHeight * aspect; camera.orthoRight = halfHeight * aspect;
    }
    scene.render();
  };
  const resize = new ResizeObserver(draw);
  resize.observe(canvas);
  const dispose = () => {
    resize.disconnect();
    for (const skin of skins) skin?.dispose();
    for (const body of bodies) body?.dispose();
    world.dispose(); scene.dispose(); engine.dispose();
  };
  signal.addEventListener("abort", dispose, { once: true });
  const setModel = async (index: number, model: BodyModel) => {
    const revision = ++revisions[index];
    let loading = dressers.get(model);
    if (!loading) {
      loading = dresserFor(model, scene);
      dressers.set(model, loading);
    }
    const dress = await loading;
    if (signal.aborted || revision !== revisions[index]) return;
    skins[index]?.dispose(); bodies[index]?.dispose();
    const body = buildBody(modelSpec(model), world, { position: [index * 4, 0, 0] });
    bodies[index] = body;
    const skin = skins[index] = dress(body, { clothing: { boots: true, armour: true } });
    for (const mesh of skin.meshes) mesh.layerMask = 1 << index;
    await scene.whenReadyAsync();
    if (!signal.aborted && revision === revisions[index]) draw();
  };
  try {
    models.forEach((_, index) => {
      const x = index * 4, mask = 1 << index;
      const plinth = MeshBuilder.CreateCylinder(`plinth ${index}`, { diameter: 1.15, height: .06, tessellation: 64 }, scene);
      plinth.position.set(x, -.04, 0); plinth.material = stone; plinth.layerMask = mask;
      const camera = new FreeCamera(`hero ${index}`, new Vector3(x + .2, 1.05, 6), scene);
      camera.setTarget(new Vector3(x, .95, 0));
      camera.mode = Camera.ORTHOGRAPHIC_CAMERA; camera.minZ = .1; camera.maxZ = 15;
      camera.viewport = new Viewport(index / models.length, 0, 1 / models.length, 1);
      camera.layerMask = mask;
      cameras.push(camera);
    });
    scene.activeCameras = cameras;
    await Promise.all(models.map((model, index) => setModel(index, model)));
    ready = true;
    draw();
    return { setModel };
  } catch (error) {
    if (!signal.aborted) { signal.removeEventListener("abort", dispose); dispose(); }
    throw error;
  }
}
