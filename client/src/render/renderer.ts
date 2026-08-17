import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import { Camera } from "@babylonjs/core/Cameras/camera.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Viewport } from "@babylonjs/core/Maths/math.viewport.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import type { CombatantAsset } from "./combatant-assets.js";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation.js";
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
import type { PresentationMode } from "./presentation-mode.js";
import { createBabylonRightHandedScene } from "./scene.js";
import { TransientPresentation } from "./transients.js";
import type { RendererFrameMetrics } from "./performance.js";

export type GreyboxRendererDiagnostics = Readonly<{
  backend: RendererBackendDiagnostics;
  scene: RendererDebugCounts;
  renderedFrame: RendererFrameMetrics;
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

export type EnvironmentOwner = Readonly<{
  shadowGenerator: ShadowGenerator;
  acceptSnapshot(snapshot: PresentationSnapshot): void;
  updateOcclusion?(
    project: (point: Readonly<{ x: number; y: number; z: number }>) =>
      Readonly<{ x: number; y: number; depth: number }>,
    hero: Readonly<{ x: number; z: number }> | null,
  ): void;
  authoredFrameReady?(): boolean;
  setPresentationMode?(mode: PresentationMode): void;
  reset(): void;
  dispose(): void;
}>;

export type GreyboxRendererOptions = Readonly<{
  createEnvironment?: (
    scene: Scene, debug: RendererDebugRegistry, signal: AbortSignal,
  ) => Promise<EnvironmentOwner>;
  createCombatants?: (scene: Scene, signal: AbortSignal) => Promise<CombatantAsset>;
  createReviewCamera?: (
    scene: Scene, canvas: HTMLCanvasElement, bounds: Readonly<{ width: number; height: number }>,
  ) => RendererCameraOwner;
  reviewCameraFree?: boolean;
}>;

export type RendererCameraOwner = Readonly<{
  camera: Camera;
  readonly free: boolean;
  resetFixed?(): void;
  setFree(free: boolean): void;
  pan?(dxPixels: number, dyPixels: number): void;
  zoom?(delta: number): void;
  follow?(x: number, z: number): void;
  resize?(): void;
  dispose(): void;
}>;

export async function loadOptionalCombatants(
  create: GreyboxRendererOptions["createCombatants"], scene: Scene, signal: AbortSignal,
): Promise<CombatantAsset | null> {
  if (create === undefined) return null;
  try {
    return await create(scene, signal);
  } catch (error) {
    if (signal.aborted) throw error;
    return null;
  }
}

export type RoomReviewInteractionState = Readonly<{ readonly reviewCameraFree: boolean }>;

export function roomReviewInteractionBlocked(
  representativeRoom: boolean, renderer: RoomReviewInteractionState,
): boolean {
  return representativeRoom && renderer.reviewCameraFree;
}

export async function submitWithRoomReviewGuard<T>(
  representativeRoom: boolean, renderer: RoomReviewInteractionState, submit: () => Promise<T>,
): Promise<T> {
  if (roomReviewInteractionBlocked(representativeRoom, renderer)) {
    throw new Error("simulation commands are disabled while the free review camera is active");
  }
  return submit();
}

export class GreyboxRenderer {
  readonly #handle: RendererEngineHandle<HTMLCanvasElement, AbstractEngine>;
  readonly #scene: Scene;
  readonly #debug: RendererDebugRegistry;
  readonly #environment: EnvironmentOwner;
  readonly #actors: ActorPresentation;
  readonly #transients: TransientPresentation;
  readonly #combatants: CombatantAsset | null;
  readonly #timeline = new PresentationTimeline();
  readonly #instrumentation: SceneInstrumentation;
  readonly #now: () => number;
  readonly #createReviewCamera: GreyboxRendererOptions["createReviewCamera"];
  readonly #initialReviewFree: boolean;
  #reviewCamera: RendererCameraOwner | null = null;
  #camera: Camera;
  #arenaKey = "";
  #arenaWidth = 1;
  #arenaHeight = 1;
  #panX = 0.5;
  #panY = 0.5;
  #zoom = 1;
  #epoch: number | null = null;
  #tick: number | null = null;
  #presentationMode: PresentationMode = "world";
  #hero: PresentationSnapshot["units"][number] | null = null;
  #running = false;
  #disposed = false;
  #frameMetrics: RendererFrameMetrics = { draws: 0, triangles: 0, lights: 0, shadowCasters: 0 };

  constructor(
    handle: RendererEngineHandle<HTMLCanvasElement, AbstractEngine>,
    scene: Scene,
    debug: RendererDebugRegistry,
    environment: EnvironmentOwner,
    actors: ActorPresentation,
    transients: TransientPresentation,
    camera: Camera,
    now: () => number = () => performance.now(),
    createReviewCamera?: GreyboxRendererOptions["createReviewCamera"],
    initialReviewFree = false,
    combatants: CombatantAsset | null = null,
  ) {
    this.#handle = handle;
    this.#scene = scene;
    this.#debug = debug;
    this.#environment = environment;
    this.#actors = actors;
    this.#transients = transients;
    this.#combatants = combatants;
    this.#camera = camera;
    this.#now = now;
    this.#createReviewCamera = createReviewCamera;
    this.#initialReviewFree = initialReviewFree;
    this.#instrumentation = new SceneInstrumentation(scene);
    this.start();
  }

  get canvas(): HTMLCanvasElement { return this.#handle.canvas; }
  get scene(): Scene { return this.#scene; }
  get camera(): Camera { return this.#camera; }
  get reviewCameraFree(): boolean { return this.#reviewCamera?.free ?? this.#initialReviewFree; }
  get presentationMode(): PresentationMode { return this.#presentationMode; }

  setPresentationMode(mode: PresentationMode): void {
    this.#assertLive();
    if (mode === this.#presentationMode) return;
    const previous = this.#presentationMode;
    this.#presentationMode = mode;
    if (this.#reviewCamera !== null) {
      if (mode === "free") this.#reviewCamera.setFree(true);
      else if (this.#reviewCamera.free) this.#reviewCamera.setFree(false);
      else if (previous === "top_down" || previous === "first_person" || previous === "dev") {
        this.#reviewCamera.resetFixed?.();
      }
      this.#camera = this.#reviewCamera.camera;
      this.#scene.activeCamera = this.#camera;
    }
    this.#actors.setPresentationMode(mode);
    this.#environment.setPresentationMode?.(mode);
    this.#applyPresentationCamera();
  }

  setReviewCameraFree(free: boolean): void {
    this.#assertLive();
    if (free) {
      this.setPresentationMode("free");
      return;
    }
    if (this.#presentationMode === "free") this.setPresentationMode("world");
    else this.#reviewCamera?.setFree(false);
  }

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
    this.#reviewCamera?.resetFixed?.();
    if (this.#reviewCamera !== null) {
      this.#camera = this.#reviewCamera.camera;
      this.#scene.activeCamera = this.#camera;
    }
    this.#hero = null;
    this.#epoch = null;
    this.#tick = null;
  }

  resize(): void {
    if (this.#disposed || this.#handle.terminal) return;
    this.#handle.engine.resize();
    if (this.#reviewCamera !== null) {
      this.#reviewCamera.resize?.();
      this.#camera = this.#reviewCamera.camera;
      this.#scene.activeCamera = this.#camera;
    } else if (this.#arenaKey !== "") this.#replaceCamera(this.#arenaWidth, this.#arenaHeight);
    this.#applyPresentationCamera();
  }

  pan(dxPixels: number, dyPixels: number): void {
    if (this.#reviewCamera !== null) {
      this.#reviewCamera.pan?.(dxPixels, dyPixels);
      this.#camera = this.#reviewCamera.camera;
      this.#scene.activeCamera = this.#camera;
      this.#applyPresentationCamera();
      return;
    }
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
    if (this.#reviewCamera !== null) {
      this.#reviewCamera.zoom?.(delta);
      this.#camera = this.#reviewCamera.camera;
      this.#scene.activeCamera = this.#camera;
      this.#applyPresentationCamera();
      return;
    }
    if (!Number.isFinite(delta)) return;
    this.#zoom = clampCameraZoom(this.#zoom * Math.exp(-delta * 0.001));
    this.#replaceCamera(this.#arenaWidth, this.#arenaHeight);
  }

  diagnostics(): GreyboxRendererDiagnostics {
    return Object.freeze({
      backend: this.#handle.diagnostics,
      scene: this.#debug.snapshot(),
      renderedFrame: Object.freeze({ ...this.#frameMetrics }),
      running: this.#running,
      terminal: this.#handle.terminal,
      epoch: this.#epoch,
      tick: this.#tick,
    });
  }

  frameMetrics(): RendererFrameMetrics {
    this.#assertLive();
    if (!this.#running) throw new Error("greybox renderer is not rendering");
    return Object.freeze({ ...this.#frameMetrics });
  }

  async awaitAuthoredFrame(timeoutMs = 30_000): Promise<void> {
    this.#assertLive();
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError("frame timeout must be positive");
    await new Promise<void>((resolve, reject) => {
      let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
      const observer = this.#scene.onAfterRenderObservable.add(() => {
        const counts = this.#debug.snapshot();
        if (counts.visibility.geometry + counts.visibility.furniture === 0 ||
            this.#environment.authoredFrameReady?.() !== true) return;
        this.#scene.onAfterRenderObservable.remove(observer);
        if (timeout !== undefined) globalThis.clearTimeout(timeout);
        resolve();
      });
      timeout = globalThis.setTimeout(() => {
        this.#scene.onAfterRenderObservable.remove(observer);
        reject(new Error("authored room did not complete a visible frame"));
      }, timeoutMs);
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.stop();
    this.clear();
    this.#disposed = true;
    this.#transients.dispose();
    this.#actors.dispose();
    this.#combatants?.dispose();
    this.#environment.dispose();
    this.#instrumentation.dispose();
    if (this.#reviewCamera !== null) {
      this.#reviewCamera.dispose();
      this.#reviewCamera = null;
    } else this.#camera.dispose();
    this.#scene.dispose();
    this.#handle.dispose();
    this.#debug.clear();
  }

  readonly #render = (): void => {
    if (!this.#running || this.#disposed || this.#handle.terminal) return;
    const sample = this.#timeline.sample(this.#now());
    if (sample !== null) {
      this.#actors.acceptSnapshot(sample.snapshot);
      this.#hero = sample.snapshot.units.find((unit) => unit.faction === 0 && unit.visible) ?? null;
      if (this.#reviewCamera?.follow !== undefined) {
        // Faction 0 is the hero; AGENTS.md guarantees exactly one.
        const hero = sample.snapshot.units.find((unit) => unit.faction === 0);
        if (hero !== undefined) this.#reviewCamera.follow(hero.x, hero.y);
      }
      this.#applyPresentationCamera();
      const hero = this.#hero;
      this.#camera.getViewMatrix(true);
      const viewport = new Viewport(0, 0,
        this.#handle.engine.getRenderWidth(), this.#handle.engine.getRenderHeight());
      this.#environment.updateOcclusion?.((point) => {
        const screen = Vector3.Project(new Vector3(point.x, point.y, point.z),
          Matrix.IdentityReadOnly, this.#scene.getTransformMatrix(), viewport);
        return Object.freeze({ x: screen.x, y: screen.y, depth: screen.z });
      }, hero === null ? null : { x: hero.x, z: hero.y });
    }
    this.#scene.render();
    const debug = this.#debug.snapshot();
    this.#frameMetrics = {
      draws: this.#instrumentation.drawCallsCounter.current,
      triangles: Math.floor(this.#scene.getActiveIndices() / 3),
      lights: this.#scene.lights.length,
      shadowCasters: debug.shadowCasters,
    };
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
    if (this.#createReviewCamera === undefined) this.#replaceCamera(width, height);
    else {
      if (this.#reviewCamera !== null) this.#reviewCamera.dispose();
      else this.#camera.dispose();
      const owner = this.#createReviewCamera(this.#scene, this.canvas, { width, height });
      this.#reviewCamera = owner;
      this.#camera = owner.camera;
      owner.setFree(this.#initialReviewFree);
      this.#scene.activeCamera = owner.camera;
      this.#applyPresentationCamera();
    }
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
    this.#applyPresentationCamera();
  }

  #applyPresentationCamera(): void {
    if (this.#arenaKey === "" || this.#presentationMode === "world" ||
        this.#presentationMode === "geometry" || this.#presentationMode === "free") return;
    const camera = this.#camera as Camera & {
      getTarget?(): Vector3;
      setTarget?(target: Vector3): void;
      position: Vector3;
    };
    const hero = this.#hero;
    const target = hero === null
      ? camera.getTarget?.().clone() ?? new Vector3(this.#panX, 0, this.#panY)
      : new Vector3(hero.x, 0, hero.y);
    target.y = 0;
    if (this.#presentationMode === "first_person" && hero !== null) {
      camera.mode = Camera.PERSPECTIVE_CAMERA;
      camera.minZ = 0.02;
      camera.fov = Math.PI / 2;
      const eye = Math.max(1.1, hero.radius * 3.1);
      camera.position.set(hero.x, eye, hero.y);
      camera.setTarget?.(new Vector3(
        hero.x + Math.cos(hero.facing), eye - 0.12, hero.y + Math.sin(hero.facing)));
      return;
    }
    camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    const distance = Math.max(this.#arenaWidth, this.#arenaHeight);
    camera.position.set(target.x, distance, target.z + 0.0001);
    camera.setTarget?.(target);
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
  options: GreyboxRendererOptions = {},
): Promise<GreyboxRenderer> {
  let renderer: GreyboxRenderer | null = null;
  let pendingScene: Scene | null = null;
  let pendingEnvironment: EnvironmentOwner | null = null;
  let pendingActors: ActorPresentation | null = null;
  let pendingCombatants: CombatantAsset | null = null;
  let pendingTransients: TransientPresentation | null = null;
  const environmentAbort = new AbortController();
  const handle = await createRendererEngine(canvas, requested, {
    ...(lifecycle.onCanvasReplaced === undefined ? {} : { onCanvasReplaced: lifecycle.onCanvasReplaced }),
    stopRenderingAndInput: () => {
      renderer?.stop();
      lifecycle.stopInput?.();
    },
    ...(lifecycle.pauseSimulation === undefined ? {} : { pauseSimulation: lifecycle.pauseSimulation }),
    onTerminal: (error) => {
      environmentAbort.abort(error);
      lifecycle.onTerminal?.(error);
    },
  });
  if (handle.terminal) {
    handle.dispose();
    throw new Error("renderer became terminal during initialization");
  }
  try {
    const built = createBabylonRightHandedScene(handle.engine, (scene) => {
      const debug = new RendererDebugRegistry();
      const camera = createFixedIsometricCamera(scene, { width: 1, height: 1 }, 1);
      scene.activeCamera = camera;
      return Object.freeze({ debug, camera });
    });
    pendingScene = built.scene;
    const environment = options.createEnvironment === undefined
      ? new EnvironmentPresentation(built.scene, built.content.debug)
      : await options.createEnvironment(built.scene, built.content.debug, environmentAbort.signal);
    pendingEnvironment = environment;
    if (handle.terminal || environmentAbort.signal.aborted) {
      throw new Error("renderer became terminal during environment initialization");
    }
    // Authored bodies are optional presentation. The procedural figures are
    // deliberately kept live as the bounded load-failure fallback.
    const combatants = await loadOptionalCombatants(
      options.createCombatants, built.scene, environmentAbort.signal,
    );
    if (handle.terminal) throw new Error("renderer became terminal during combatant initialization");
    pendingCombatants = combatants;
    const actors = new ActorPresentation(
      built.scene, built.content.debug, environment.shadowGenerator, combatants,
    );
    pendingActors = actors;
    const transients = new TransientPresentation(
      built.scene, built.content.debug, environment.shadowGenerator,
    );
    pendingTransients = transients;
    renderer = new GreyboxRenderer(
      handle, built.scene, built.content.debug, environment,
      actors, transients, built.content.camera, lifecycle.now,
      options.createReviewCamera, options.reviewCameraFree ?? false, combatants,
    );
    pendingScene = null;
    pendingEnvironment = null;
    pendingActors = null;
    pendingCombatants = null;
    pendingTransients = null;
    return renderer;
  } catch (error) {
    environmentAbort.abort(error);
    pendingTransients?.dispose();
    pendingActors?.dispose();
    pendingCombatants?.dispose();
    pendingEnvironment?.dispose();
    pendingScene?.dispose();
    handle.dispose();
    throw error;
  }
}
