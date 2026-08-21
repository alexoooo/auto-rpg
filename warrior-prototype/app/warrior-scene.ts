import "@babylonjs/loaders/glTF";

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents.js";
import { Scene } from "@babylonjs/core/scene.js";

import { advanceAngle } from "./turntable-state";

const INITIAL_ALPHA = -Math.PI / 2.7;
const INITIAL_BETA = 1.22;
const INITIAL_RADIUS = 4.6;

export type WarriorSceneHandle = {
  setPlaying(playing: boolean): void;
  reset(playing: boolean): void;
  dispose(): void;
};

type SceneOptions = {
  playing: boolean;
  onInspection(): void;
  onProgress(message: string): void;
};

export async function createWarriorScene(
  canvas: HTMLCanvasElement,
  options: SceneOptions,
): Promise<WarriorSceneHandle> {
  const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.025, 0.022, 0.018, 1);
  scene.ambientColor = new Color3(0.08, 0.065, 0.05);
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  scene.imageProcessingConfiguration.exposure = 1.08;
  scene.imageProcessingConfiguration.contrast = 1.22;

  const camera = new ArcRotateCamera(
    "warrior-camera", INITIAL_ALPHA, INITIAL_BETA, INITIAL_RADIUS,
    new Vector3(0, 1.0, 0), scene,
  );
  camera.fov = 0.48;
  camera.minZ = 0.05;
  camera.lowerRadiusLimit = 3.15;
  camera.upperRadiusLimit = 6.4;
  camera.lowerBetaLimit = 0.62;
  camera.upperBetaLimit = 1.5;
  camera.wheelPrecision = 45;
  camera.pinchPrecision = 90;
  camera.attachControl(canvas, true);

  const fill = new HemisphericLight("cool-fill", new Vector3(-0.35, 0.8, 0.45), scene);
  fill.diffuse = new Color3(0.48, 0.56, 0.68);
  fill.groundColor = new Color3(0.09, 0.055, 0.035);
  fill.intensity = 0.62;

  const key = new DirectionalLight("warm-key", new Vector3(0.55, -1, 0.45), scene);
  key.position = new Vector3(-3.5, 6, -4.5);
  key.diffuse = new Color3(1.0, 0.67, 0.38);
  key.intensity = 3.4;

  const rim = new PointLight("ember-rim", new Vector3(2.4, 2.4, 2.0), scene);
  rim.diffuse = new Color3(0.96, 0.37, 0.14);
  rim.intensity = 42;
  rim.radius = 0.8;

  const ground = MeshBuilder.CreateDisc("turntable-ground", { radius: 2.25, tessellation: 96 }, scene);
  ground.rotation.x = Math.PI / 2;
  ground.position.y = -0.018;
  ground.receiveShadows = true;
  const groundMaterial = new PBRMaterial("ground-material", scene);
  groundMaterial.albedoColor = new Color3(0.055, 0.047, 0.038);
  groundMaterial.metallic = 0;
  groundMaterial.roughness = 0.96;
  ground.material = groundMaterial;

  options.onProgress("Loading forged steel and leather...");
  const container = await LoadAssetContainerAsync("/assets/warrior.glb", scene, {
    pluginExtension: ".glb",
    name: "warrior.glb",
  });
  container.addAllToScene();
  const warriorRoot = container.transformNodes.find((node) => node.name === "Warrior");
  if (warriorRoot === undefined) throw new Error("warrior.glb has no Warrior scene root");

  const shadows = new ShadowGenerator(2048, key);
  shadows.useBlurExponentialShadowMap = true;
  shadows.blurKernel = 24;
  for (const mesh of container.meshes) {
    mesh.receiveShadows = true;
    shadows.addShadowCaster(mesh, true);
  }

  const pipeline = new DefaultRenderingPipeline("warrior-pipeline", true, scene, [camera]);
  pipeline.fxaaEnabled = true;
  pipeline.samples = 4;
  pipeline.imageProcessingEnabled = false;

  let playing = options.playing;
  let angle = 0;
  let lastFrame = performance.now();
  let disposed = false;
  const inspect = scene.onPointerObservable.add((event) => {
    if (event.type !== PointerEventTypes.POINTERDOWN || !playing) return;
    playing = false;
    options.onInspection();
  });
  const resize = () => engine.resize();
  window.addEventListener("resize", resize);
  engine.runRenderLoop(() => {
    const now = performance.now();
    angle = advanceAngle(angle, Math.min(0.1, (now - lastFrame) / 1000), playing);
    lastFrame = now;
    warriorRoot.rotationQuaternion = null;
    warriorRoot.rotation.y = angle;
    scene.render();
  });

  return {
    setPlaying(next): void {
      playing = next;
      lastFrame = performance.now();
    },
    reset(next): void {
      angle = 0;
      playing = next;
      camera.alpha = INITIAL_ALPHA;
      camera.beta = INITIAL_BETA;
      camera.radius = INITIAL_RADIUS;
      camera.setTarget(new Vector3(0, 1.0, 0));
      lastFrame = performance.now();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      window.removeEventListener("resize", resize);
      scene.onPointerObservable.remove(inspect);
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
}
