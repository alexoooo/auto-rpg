import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine.js";

export type RendererBackendRequest = "auto" | "webgl2";
export type RendererBackend = "webgpu" | "webgl2";

export type RendererEngineInfo = Readonly<{
  description: string;
  vendor: string;
  renderer: string;
  version: string;
}>;

export type RendererBackendDiagnostics = Readonly<{
  requested: RendererBackendRequest;
  selected: RendererBackend | null;
  webgpuSupport: boolean | null;
  webgpuInit: "not-attempted" | "ok" | "failed";
  webgpuFailure: Readonly<{ stage: "support" | "init"; message: string }> | null;
  webgl2Init: "not-attempted" | "ok" | "failed";
  webglVersion: number | null;
  engineInfo: RendererEngineInfo | null;
}>;

export type RendererTerminalError = Readonly<{
  stage: "loss";
  message: string;
}>;

export type RendererEngineFactories<TCanvas, TEngine, TContext> = Readonly<{
  isWebGPUSupported: () => Promise<boolean>;
  createWebGPU: (canvas: TCanvas) => TEngine;
  initializeWebGPU: (engine: TEngine) => Promise<void>;
  replaceCanvas: (canvas: TCanvas) => TCanvas;
  getWebGL2Context: (canvas: TCanvas) => TContext | null;
  createWebGL2: (canvas: TCanvas, context: TContext) => TEngine;
  webGLVersion: (engine: TEngine) => number;
  engineInfo: (engine: TEngine, backend: RendererBackend) => RendererEngineInfo;
  subscribeLoss: (engine: TEngine, canvas: TCanvas, backend: RendererBackend, listener: () => void) => () => void;
  dispose: (engine: TEngine) => void;
}>;

export type RendererEngineLifecycle<TCanvas> = Readonly<{
  onCanvasReplaced?: (previous: TCanvas, replacement: TCanvas) => void;
  stopRenderingAndInput?: () => void;
  pauseSimulation?: () => void;
  onTerminal?: (error: RendererTerminalError) => void;
}>;

export type RendererEngineHandle<TCanvas, TEngine> = Readonly<{
  engine: TEngine;
  canvas: TCanvas;
  readonly diagnostics: RendererBackendDiagnostics;
  readonly terminal: boolean;
  dispose: () => void;
}>;

export class RendererBackendError extends Error {
  readonly diagnostics: RendererBackendDiagnostics;

  constructor(message: string, diagnostics: RendererBackendDiagnostics) {
    super(message);
    this.name = "RendererBackendError";
    this.diagnostics = diagnostics;
  }
}

const frozenDiagnostics = (value: RendererBackendDiagnostics): RendererBackendDiagnostics => Object.freeze({
  ...value,
  webgpuFailure: value.webgpuFailure === null ? null : Object.freeze({ ...value.webgpuFailure }),
  engineInfo: value.engineInfo === null ? null : Object.freeze({ ...value.engineInfo }),
});

const initialDiagnostics = (requested: RendererBackendRequest): RendererBackendDiagnostics => frozenDiagnostics({
  requested,
  selected: null,
  webgpuSupport: null,
  webgpuInit: "not-attempted",
  webgpuFailure: null,
  webgl2Init: "not-attempted",
  webglVersion: null,
  engineInfo: null,
});

export function sanitizeRendererError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const oneLine = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return (oneLine || "unknown renderer failure").slice(0, 240);
}

export function rendererBackendFromSearch(search: string): RendererBackendRequest {
  const value = new URLSearchParams(search).get("backend");
  if (value === null || value === "auto") return "auto";
  if (value === "webgl2") return "webgl2";
  throw new RangeError(`unknown renderer backend ${JSON.stringify(value)}`);
}

function selectedHandle<TCanvas, TEngine>(
  engine: TEngine,
  canvas: TCanvas,
  diagnostics: RendererBackendDiagnostics,
  backend: RendererBackend,
  factories: RendererEngineFactories<TCanvas, TEngine, unknown>,
  lifecycle: RendererEngineLifecycle<TCanvas>,
): RendererEngineHandle<TCanvas, TEngine> {
  let current = frozenDiagnostics(diagnostics);
  let disposed = false;
  let terminal = false;
  let armed = false;
  let pendingLoss = false;
  let unsubscribe = (): void => undefined;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    factories.dispose(engine);
  };
  const lose = (): void => {
    if (disposed || terminal) return;
    terminal = true;
    current = frozenDiagnostics({ ...current, selected: null, engineInfo: null });
    const error = Object.freeze({ stage: "loss" as const, message: "renderer context or device lost" });
    try { lifecycle.stopRenderingAndInput?.(); } catch { /* Cleanup still owns the terminal path. */ }
    try { lifecycle.pauseSimulation?.(); } catch { /* A failed pause cannot retain the engine. */ }
    try {
      lifecycle.onTerminal?.(error);
    } catch {
      /* The handle still owns final engine cleanup when its terminal owner fails. */
    } finally {
      // The terminal owner normally disposes renderer content and then calls this
      // handle. This final call covers owners which only report the error; the
      // idempotent handle guarantees that Babylon is disposed exactly once.
      dispose();
    }
  };
  unsubscribe = factories.subscribeLoss(engine, canvas, backend, () => {
    if (!armed) {
      pendingLoss = true;
      return;
    }
    lose();
  });
  armed = true;
  if (pendingLoss) lose();
  return Object.freeze({
    engine,
    canvas,
    get diagnostics(): RendererBackendDiagnostics { return current; },
    get terminal(): boolean { return terminal; },
    dispose,
  });
}

export async function selectRendererBackend<TCanvas, TEngine, TContext>(
  originalCanvas: TCanvas,
  requested: RendererBackendRequest,
  factories: RendererEngineFactories<TCanvas, TEngine, TContext>,
  lifecycle: RendererEngineLifecycle<TCanvas> = {},
): Promise<RendererEngineHandle<TCanvas, TEngine>> {
  let canvas = originalCanvas;
  let diagnostics = initialDiagnostics(requested);

  if (requested === "auto") {
    let supported = false;
    try {
      supported = await factories.isWebGPUSupported();
      diagnostics = frozenDiagnostics({
        ...diagnostics,
        webgpuSupport: supported,
        webgpuFailure: supported ? null : { stage: "support", message: "WebGPU is not supported" },
      });
    } catch (error) {
      diagnostics = frozenDiagnostics({
        ...diagnostics,
        webgpuSupport: null,
        webgpuFailure: { stage: "support", message: sanitizeRendererError(error) },
      });
    }
    if (supported) {
      let engine: TEngine | null = null;
      try {
        engine = factories.createWebGPU(canvas);
        await factories.initializeWebGPU(engine);
        diagnostics = frozenDiagnostics({
          ...diagnostics,
          selected: "webgpu",
          webgpuInit: "ok",
          engineInfo: factories.engineInfo(engine, "webgpu"),
        });
        return selectedHandle(engine, canvas, diagnostics, "webgpu",
          factories as RendererEngineFactories<TCanvas, TEngine, unknown>, lifecycle);
      } catch (error) {
        if (engine !== null) factories.dispose(engine);
        diagnostics = frozenDiagnostics({
          ...diagnostics,
          webgpuInit: "failed",
          webgpuFailure: { stage: "init", message: sanitizeRendererError(error) },
        });
        const previous = canvas;
        canvas = factories.replaceCanvas(previous);
        if (canvas === previous) {
          throw new RendererBackendError("WebGPU fallback requires a replacement canvas", diagnostics);
        }
        lifecycle.onCanvasReplaced?.(previous, canvas);
      }
    }
  }

  const context = factories.getWebGL2Context(canvas);
  if (context === null) {
    diagnostics = frozenDiagnostics({ ...diagnostics, webgl2Init: "failed" });
    throw new RendererBackendError("WebGL2 context is unavailable", diagnostics);
  }
  let webglEngine: TEngine | null = null;
  try {
    webglEngine = factories.createWebGL2(canvas, context);
    const webglVersion = factories.webGLVersion(webglEngine);
    diagnostics = frozenDiagnostics({ ...diagnostics, webglVersion });
    if (webglVersion !== 2) throw new Error(`WebGL version ${webglVersion} is not WebGL2`);
    diagnostics = frozenDiagnostics({
      ...diagnostics,
      selected: "webgl2",
      webgl2Init: "ok",
      engineInfo: factories.engineInfo(webglEngine, "webgl2"),
    });
    return selectedHandle(webglEngine, canvas, diagnostics, "webgl2",
      factories as RendererEngineFactories<TCanvas, TEngine, unknown>, lifecycle);
  } catch (error) {
    if (webglEngine !== null) factories.dispose(webglEngine);
    diagnostics = frozenDiagnostics({ ...diagnostics, selected: null, webgl2Init: "failed", engineInfo: null });
    throw new RendererBackendError(sanitizeRendererError(error), diagnostics);
  }
}

export const WEBGPU_ENGINE_OPTIONS = Object.freeze({
  doNotHandleContextLost: true,
  powerPreference: "high-performance" as const,
});

export const WEBGL2_CONTEXT_ATTRIBUTES: WebGLContextAttributes = Object.freeze({
  alpha: false,
  antialias: true,
  depth: true,
  stencil: true,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
  powerPreference: "high-performance",
});

export const WEBGL_ENGINE_OPTIONS = Object.freeze({
  preserveDrawingBuffer: false,
  stencil: true,
  doNotHandleContextLost: true,
});

export function observeWebGPUDeviceLoss(
  device: Readonly<{ lost: PromiseLike<unknown> }>, listener: () => void,
): () => void {
  let active = true;
  void Promise.resolve(device.lost).then(
    () => { if (active) listener(); },
    () => { if (active) listener(); },
  );
  return () => { active = false; };
}

export function observeWebGLContextLoss(canvas: HTMLCanvasElement, listener: () => void): () => void {
  let active = true;
  const lost = (event: Event): void => {
    event.preventDefault();
    if (!active) return;
    active = false;
    listener();
  };
  canvas.addEventListener("webglcontextlost", lost);
  return () => {
    active = false;
    canvas.removeEventListener("webglcontextlost", lost);
  };
}

const replaceProductionCanvas = (canvas: HTMLCanvasElement): HTMLCanvasElement => {
  const replacement = canvas.cloneNode(false) as HTMLCanvasElement;
  canvas.parentNode?.replaceChild(replacement, canvas);
  return replacement;
};

export const productionEngineFactories: RendererEngineFactories<
  HTMLCanvasElement, AbstractEngine, WebGL2RenderingContext
> = Object.freeze({
  isWebGPUSupported: () => WebGPUEngine.IsSupportedAsync,
  // Babylon normalizes its options object in place. Keep the exported contract
  // immutable, but never hand that frozen authority to third-party code.
  createWebGPU: (canvas) => new WebGPUEngine(canvas, { ...WEBGPU_ENGINE_OPTIONS }),
  initializeWebGPU: async (engine) => {
    if (!(engine instanceof WebGPUEngine)) throw new TypeError("expected a WebGPU engine");
    await engine.initAsync();
  },
  replaceCanvas: replaceProductionCanvas,
  getWebGL2Context: (canvas) => canvas.getContext("webgl2", WEBGL2_CONTEXT_ATTRIBUTES),
  createWebGL2: (_canvas, context) => new Engine(context, true, { ...WEBGL_ENGINE_OPTIONS }),
  webGLVersion: (engine) => engine instanceof Engine ? engine.webGLVersion : 0,
  engineInfo: (engine, backend) => {
    const info = backend === "webgpu" && engine instanceof WebGPUEngine
      ? engine.getInfo()
      : engine instanceof Engine
        ? engine.getGlInfo()
        : { vendor: "", renderer: "", version: "" };
    return Object.freeze({
      description: engine.description,
      vendor: info.vendor,
      renderer: info.renderer,
      version: String(info.version),
    });
  },
  subscribeLoss: (engine, canvas, backend, listener) => backend === "webgpu"
    ? engine instanceof WebGPUEngine
      ? observeWebGPUDeviceLoss(engine._device, listener)
      : (() => { throw new TypeError("expected a WebGPU engine for device-loss observation"); })()
    : observeWebGLContextLoss(canvas, listener),
  dispose: (engine) => engine.dispose(),
});

export function createRendererEngine(
  canvas: HTMLCanvasElement,
  requested: RendererBackendRequest,
  lifecycle: RendererEngineLifecycle<HTMLCanvasElement> = {},
): Promise<RendererEngineHandle<HTMLCanvasElement, AbstractEngine>> {
  return selectRendererBackend(canvas, requested, productionEngineFactories, lifecycle);
}
