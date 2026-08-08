import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { ActorPresentation } from "./actors.js";
import { clampCameraPan, clampCameraZoom, createFixedIsometricCamera } from "./camera.js";
import { RendererDebugRegistry, type RendererDebugCounts } from "./debug.js";
import {
  createRendererEngine, type RendererBackendDiagnostics, type RendererBackendRequest,
  type RendererEngineHandle, type RendererTerminalError,
} from "./engine.js";
import { EnvironmentPresentation } from "./environment.js";
import { PresentationTimeline } from "./interpolation.js";
import type { PresentationSnapshot } from "./presentation.js";
import { createBabylonRightHandedScene } from "./scene.js";
import { TransientPresentation } from "./transients.js";

export type GreyboxRendererDiagnostics = Readonly<{
  backend: RendererBackendDiagnostics;
  scene: RendererDebugCounts;
  running: boolean;
  terminal: boolean;
  epoch: number | null;
  tick: number | null;
}>;

export type GreyboxRendererLifecycle = Readonly<{
  now?: () => number;
  pauseSimulation?: () => void;
  stopInput?: () => void;
  onCanvasReplaced?: (previous: HTMLCanvasElement, replacement: HTMLCanvasElement) => void;
  onTerminal?: (error: RendererTerminalError) => void;
}>;

export class GreyboxRenderer {
  readonly #handle: RendererEngineHandle<HTMLCanvasElement, AbstractEngine>;
  readonly #scene: Scene;
  readonly #debug: RendererDebugRegistry;
  readonly #environment: EnvironmentPresentation;
  readonly #actors: ActorPresentation;
  readonly #transients: TransientPresentation;
  readonly #timeline = new PresentationTimeline();
  readonly #now: () => number;
  #camera: FreeCamera;
  #arenaKey = "";
  #arenaWidth = 1;
  #arenaHeight = 1;
  #panX = 0.5;
  #panY = 0.5;
  #zoom = 1;
  #epoch: number | null = null;
  #tick: number | null = null;
  #running = false;
  #disposed = false;

  constructor(
    handle: RendererEngineHandle<HTMLCanvasElement, AbstractEngine>,
    scene: Scene,
    debug: RendererDebugRegistry,
    environment: EnvironmentPresentation,
    actors: ActorPresentation,
    transients: TransientPresentation,
    camera: FreeCamera,
    now: () => number = () => performance.now(),
  ) {
    this.#handle = handle;
    this.#scene = scene;
    this.#debug = debug;
    this.#environment = environment;
    this.#actors = actors;
    this.#transients = transients;
    this.#camera = camera;
    this.#now = now;
    this.start();
  }

  get canvas(): HTMLCanvasElement { return this.#handle.canvas; }
  get scene(): Scene { return this.#scene; }
  get camera(): FreeCamera { return this.#camera; }

  acceptSnapshot(snapshot: PresentationSnapshot, receivedAtMs: number): void {
    this.#assertLive();
    if (this.#epoch !== null && snapshot.epoch !== this.#epoch) this.clear();
    this.#environment.acceptSnapshot(snapshot);
    this.#transients.acceptSnapshot(snapshot);
    this.#timeline.acceptSnapshot(snapshot, receivedAtMs);
    this.#epoch = snapshot.epoch;
    this.#tick = snapshot.tick;
    this.#fitCamera(snapshot);
  }

  start(): void {
    this.#assertLive();
    if (this.#running || this.#handle.terminal) return;
    this.#running = true;
    this.#handle.engine.runRenderLoop(this.#render);
  }

  stop(): void {
    if (!this.#running) return;
    this.#running = false;
    this.#handle.engine.stopRenderLoop(this.#render);
  }

  clear(): void {
    if (this.#disposed) return;
    this.#timeline.clear();
    this.#actors.reset();
    this.#transients.reset();
    this.#environment.reset();
    this.#epoch = null;
    this.#tick = null;
  }

  resize(): void {
    if (this.#disposed || this.#handle.terminal) return;
    this.#handle.engine.resize();
    if (this.#arenaKey !== "") this.#replaceCamera(this.#arenaWidth, this.#arenaHeight);
  }

  pan(dxPixels: number, dyPixels: number): void {
    if (!Number.isFinite(dxPixels) || !Number.isFinite(dyPixels)) return;
    const scale = Math.max(this.#arenaWidth, this.#arenaHeight) / Math.max(1, this.canvas.clientHeight);
    const screenRight = this.#camera.getDirection(Vector3.Right());
    const screenUp = this.#camera.getDirection(Vector3.Up());
    const rightLength = Math.hypot(screenRight.x, screenRight.z) || 1;
    const upLength = Math.hypot(screenUp.x, screenUp.z) || 1;
    const worldX = (-dxPixels * screenRight.x / rightLength
      + dyPixels * screenUp.x / upLength) * scale / this.#zoom;
    const worldY = (-dxPixels * screenRight.z / rightLength
      + dyPixels * screenUp.z / upLength) * scale / this.#zoom;
    const pan = clampCameraPan({ width: this.#arenaWidth, height: this.#arenaHeight }, {
      x: this.#panX + worldX,
      y: this.#panY + worldY,
    });
    this.#panX = pan.x;
    this.#panY = pan.y;
    this.#replaceCamera(this.#arenaWidth, this.#arenaHeight);
  }

  zoom(delta: number): void {
    if (!Number.isFinite(delta)) return;
    this.#zoom = clampCameraZoom(this.#zoom * Math.exp(-delta * 0.001));
    this.#replaceCamera(this.#arenaWidth, this.#arenaHeight);
  }

  diagnostics(): GreyboxRendererDiagnostics {
    return Object.freeze({
      backend: this.#handle.diagnostics,
      scene: this.#debug.snapshot(),
      running: this.#running,
      terminal: this.#handle.terminal,
      epoch: this.#epoch,
      tick: this.#tick,
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.stop();
    this.clear();
    this.#disposed = true;
    this.#transients.dispose();
    this.#actors.dispose();
    this.#environment.dispose();
    this.#camera.dispose();
    this.#scene.dispose();
    this.#handle.dispose();
    this.#debug.clear();
  }

  readonly #render = (): void => {
    if (!this.#running || this.#disposed || this.#handle.terminal) return;
    const sample = this.#timeline.sample(this.#now());
    if (sample !== null) this.#actors.acceptSnapshot(sample.snapshot);
    this.#scene.render();
  };

  #fitCamera(snapshot: PresentationSnapshot): void {
    const width = snapshot.mapCols * snapshot.tileSize;
    const height = snapshot.mapRows * snapshot.tileSize;
    const key = `${width}:${height}`;
    if (key === this.#arenaKey) return;
    this.#arenaKey = key;
    this.#arenaWidth = width;
    this.#arenaHeight = height;
    this.#panX = width / 2;
    this.#panY = height / 2;
    this.#replaceCamera(width, height);
  }

  #replaceCamera(width: number, height: number): void {
    const aspect = Math.max(1, this.canvas.clientWidth) / Math.max(1, this.canvas.clientHeight);
    const replacement = createFixedIsometricCamera(this.#scene, { width, height }, aspect, this.#zoom);
    const centre = new Vector3(width / 2, 0, height / 2);
    const target = new Vector3(this.#panX, 0, this.#panY);
    replacement.position.addInPlace(target.subtract(centre));
    replacement.setTarget(target);
    this.#camera.dispose();
    this.#camera = replacement;
    this.#scene.activeCamera = replacement;
  }

  #assertLive(): void {
    if (this.#disposed) throw new Error("greybox renderer is disposed");
    if (this.#handle.terminal) throw new Error("greybox renderer is terminal");
  }
}

export async function createGreyboxRenderer(
  canvas: HTMLCanvasElement,
  requested: RendererBackendRequest,
  lifecycle: GreyboxRendererLifecycle = {},
): Promise<GreyboxRenderer> {
  let renderer: GreyboxRenderer | null = null;
  const handle = await createRendererEngine(canvas, requested, {
    ...(lifecycle.onCanvasReplaced === undefined ? {} : { onCanvasReplaced: lifecycle.onCanvasReplaced }),
    stopRenderingAndInput: () => {
      renderer?.stop();
      lifecycle.stopInput?.();
    },
    ...(lifecycle.pauseSimulation === undefined ? {} : { pauseSimulation: lifecycle.pauseSimulation }),
    ...(lifecycle.onTerminal === undefined ? {} : { onTerminal: lifecycle.onTerminal }),
  });
  if (handle.terminal) {
    handle.dispose();
    throw new Error("renderer became terminal during initialization");
  }
  try {
    const built = createBabylonRightHandedScene(handle.engine, (scene) => {
      const debug = new RendererDebugRegistry();
      const environment = new EnvironmentPresentation(scene, debug);
      const actors = new ActorPresentation(scene, debug, environment.shadowGenerator);
      const transients = new TransientPresentation(scene, debug, environment.shadowGenerator);
      const camera = createFixedIsometricCamera(scene, { width: 1, height: 1 }, 1);
      scene.activeCamera = camera;
      return Object.freeze({ debug, environment, actors, transients, camera });
    });
    renderer = new GreyboxRenderer(
      handle, built.scene, built.content.debug, built.content.environment,
      built.content.actors, built.content.transients, built.content.camera, lifecycle.now,
    );
    return renderer;
  } catch (error) {
    handle.dispose();
    throw error;
  }
}
