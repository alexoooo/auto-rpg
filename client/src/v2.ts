import { bootstrapV2, type V2Application } from "./bootstrap.js";
import type { GreyboxInput } from "./input/greybox-input.js";
import type { LegacyClientCommand } from "./protocol/messages.js";
import type { GreyboxRenderer } from "./render/renderer.js";
import type { CanvasControlRenderer } from "./render/canvas-control.js";
import {
  createBrowserPerformanceRuntime, GreyboxPerformanceCapture,
  type GreyboxPerformanceMetadata,
} from "./render/performance.js";
import { createGreyboxStressFixture } from "./render/stress.js";
import { SimClient, type ClientDiagnostics } from "./runtime/sim-client.js";

const element = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`v2.html is missing #${id}`);
  return found as T;
};
const integerFrom = (id: string, minimum: number, maximum: number): number => {
  const value = Number(element<HTMLInputElement>(id).value);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${id} must be an integer from ${minimum} through ${maximum}`);
  }
  return value;
};

const status = element<HTMLOutputElement>("status");
const errorOutput = element<HTMLOutputElement>("error");
const diagnosticsOutput = element<HTMLPreElement>("diagnostics");
const pauseButton = element<HTMLButtonElement>("pause");
const holdBuffersButton = element<HTMLButtonElement>("diagnostic-hold-buffers");
const releaseBuffersButton = element<HTMLButtonElement>("diagnostic-release-buffers");
const initialCanvas = element<HTMLCanvasElement>("greybox");
let activeCanvas = initialCanvas;
const performanceStart = element<HTMLButtonElement>("performance-start");
const performanceDownload = element<HTMLButtonElement>("performance-download");
const performanceStatus = element<HTMLOutputElement>("performance-status");
const parameters = new URLSearchParams(location.search);
const stressMode = parameters.get("stress") === "greybox";
if (parameters.has("stress") && !stressMode) throw new RangeError("unknown stress fixture");
const rendererParameter = parameters.get("renderer");
const canvasControl = rendererParameter === "canvas";
if (rendererParameter !== null && !canvasControl) throw new RangeError("unknown renderer control");
if (canvasControl && !stressMode) throw new RangeError("Canvas2D control requires ?stress=greybox");
type DisplayRenderer = GreyboxRenderer | CanvasControlRenderer;

let app: V2Application<DisplayRenderer> | null = null;
let input: GreyboxInput | null = null;
let client: SimClient | null = null;
let latest: ClientDiagnostics | null = null;
let frameRequest = 0;
let previousTime = performance.now();
let pendingElapsedMicros = 0;
let advanceInFlight = false;
let performanceCapture: GreyboxPerformanceCapture | null = null;

const renderDiagnostics = (): void => {
  diagnosticsOutput.textContent = JSON.stringify({
    mode: stressMode ? "synthetic-greybox" : "real-worker",
    client: latest,
    renderer: app?.renderer.diagnostics() ?? null,
  }, null, 2);
};

const showError = (error: unknown): void => {
  const value = error instanceof Error ? error : new Error(String(error));
  errorOutput.value = value.message;
  status.value = "Stopped";
  renderDiagnostics();
};

const run = (operation: () => Promise<unknown>, label: string): void => {
  errorOutput.value = "";
  void Promise.resolve().then(operation).then(() => {
    status.value = label;
    renderDiagnostics();
  }).catch(showError);
};

const requireApp = (): V2Application<DisplayRenderer> => {
  if (app === null || app.disposed) throw new Error("v2 is not ready");
  return app;
};
const submit = async (command: LegacyClientCommand): Promise<void> => requireApp().command(command);

// Page handlers exist before bootstrap can send init to the worker.
element<HTMLButtonElement>("reset").addEventListener("click", () => {
  run(() => requireApp().reset(integerFrom("seed", 0, 0xffff_ffff), latest?.paused), "Reset complete");
});
pauseButton.addEventListener("click", () => {
  const paused = latest?.paused ?? false;
  run(() => requireApp().setPaused(!paused), paused ? "Running" : "Paused");
});
element<HTMLButtonElement>("goto").addEventListener("click", () => {
  run(() => submit({
    kind: "goto",
    xMilli: integerFrom("goto-x", -0x8000_0000, 0x7fff_ffff),
    yMilli: integerFrom("goto-y", -0x8000_0000, 0x7fff_ffff),
  }), "Goto applied");
});
element<HTMLButtonElement>("withdraw").addEventListener("click", () => {
  run(() => submit({ kind: "withdraw" }), "Order cleared");
});
element<HTMLButtonElement>("spawn").addEventListener("click", () => {
  run(() => submit({ kind: "spawn", kindCode: 2, primary: 0, secondary: 255 }), "Spawn applied");
});
holdBuffersButton.addEventListener("click", () => {
  run(async () => client?.beginDiagnosticBufferExhaustion(), "Holding the next three snapshot leases");
});
releaseBuffersButton.addEventListener("click", () => {
  run(async () => client?.releaseDiagnosticBufferExhaustion(), "Released all diagnostic snapshot leases");
});
performanceStart.addEventListener("click", () => {
  run(async () => {
    if (!stressMode) throw new Error("performance capture requires ?stress=greybox");
    const renderer = requireApp().renderer;
    const captureCanvas = renderer.canvas;
    captureCanvas.style.width = "1920px";
    captureCanvas.style.height = "1080px";
    captureCanvas.width = 1920;
    captureCanvas.height = 1080;
    renderer.resize();
    const captureBounds = captureCanvas.getBoundingClientRect();
    if (captureBounds.width !== 1920 || captureBounds.height !== 1080
        || captureCanvas.width !== 1920 || captureCanvas.height !== 1080) {
      throw new Error("performance capture requires an exact 1920x1080 CSS and backing surface");
    }
    const text = (id: string): string => element<HTMLInputElement>(id).value.trim();
    const metadata: GreyboxPerformanceMetadata = Object.freeze({
      os: text("perf-os"), cpu: text("perf-cpu"), gpu: text("perf-gpu"), driver: text("perf-driver"),
      browser: text("perf-browser"), powerMode: text("perf-power"),
      cssWidth: 1920, cssHeight: 1080, backingWidth: 1920, backingHeight: 1080,
      devicePixelRatio: window.devicePixelRatio, renderScale: 1,
      fixtureSeed: 1592594996, population: 64, roomWidth: 48, roomHeight: 32,
      trainingWorkers: 0, backend: renderer.diagnostics().backend,
    });
    performanceCapture = new GreyboxPerformanceCapture(createBrowserPerformanceRuntime(captureCanvas, () => {
      const scene = renderer.diagnostics().scene;
      return { draws: scene.draws, triangles: scene.triangles, lights: scene.lights, shadowCasters: scene.shadowCasters };
    }));
    performanceStart.disabled = true;
    performanceStatus.value = "Warming, then sampling… keep this tab visible.";
    const result = await performanceCapture.start(metadata);
    performanceStatus.value = `${result.status}: ${result.samples.length} sampled frames`;
    performanceDownload.disabled = false;
  }, "Performance capture finished");
});
performanceDownload.addEventListener("click", () => {
  try {
    if (performanceCapture === null) throw new Error("no performance capture is available");
    const blob = new Blob([performanceCapture.exportJson()], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `v2-greybox-${app?.renderer.diagnostics().backend.selected ?? "rejected"}.json`;
    link.click();
    URL.revokeObjectURL(href);
  } catch (error) { showError(error); }
});

const advanceFrame = (now: number): void => {
  if (app?.disposed) {
    frameRequest = 0;
    return;
  }
  const elapsedMicros = Math.max(0, Math.round((now - previousTime) * 1000));
  previousTime = now;
  if (latest?.resetting) pendingElapsedMicros = 0;
  else pendingElapsedMicros += elapsedMicros;
  if (client !== null && !advanceInFlight && latest !== null && !latest.resetting
      && !latest.terminal && latest.epoch !== 0) {
    const elapsed = pendingElapsedMicros;
    pendingElapsedMicros = 0;
    advanceInFlight = true;
    void client.advance(elapsed).catch(() => undefined).finally(() => { advanceInFlight = false; });
  }
  renderDiagnostics();
  frameRequest = requestAnimationFrame(advanceFrame);
};

const start = async (): Promise<void> => {
  const needsWorker = !stressMode;
  const backend = canvasControl ? null
    : (await import("./render/engine.js")).rendererBackendFromSearch(location.search);
  const canvasModule = canvasControl ? await import("./render/canvas-control.js") : null;
  const rendererModule = canvasControl ? null : await import("./render/renderer.js");
  const inputModule = canvasControl ? null : await import("./input/greybox-input.js");
  if (needsWorker) {
    // Keep the literal URL at the construction site: Vite uses this syntax to
    // discover and emit the module Worker as a production chunk.
    client = new SimClient(new Worker(
      new URL("./runtime/sim.worker.ts", import.meta.url), { type: "module" },
    ));
    latest = client.diagnostics();
  }
  try {
    app = await bootstrapV2({
      client,
      seed: integerFrom("seed", 0, 0xffff_ffff),
      ...(stressMode ? { stressSnapshot: createGreyboxStressFixture() } : {}),
      createRenderer: async (terminal): Promise<DisplayRenderer> => {
        if (canvasModule !== null) return canvasModule.createCanvasControlRenderer(activeCanvas);
        if (backend === null || rendererModule === null) throw new Error("GPU renderer backend is missing");
        return rendererModule.createGreyboxRenderer(activeCanvas, backend, {
          pauseSimulation: () => { if (client !== null) void client.setPaused(true).catch(() => undefined); },
          stopInput: () => input?.dispose(),
          onTerminal: (error) => terminal(new Error(error.message)),
          onCanvasReplaced: (_previous, replacement) => { activeCanvas = replacement; },
        });
      },
      ...(inputModule === null ? {} : { attachInput: (application: V2Application<DisplayRenderer>) => {
        const gpu = application.renderer as GreyboxRenderer;
        activeCanvas = gpu.canvas;
        input = new inputModule.GreyboxInput({
          canvas: gpu.canvas,
          snapshot: () => application.latestSnapshot(),
          blocked: () => stressMode || application.disposed
            || latest?.resetting === true || latest?.terminal === true,
          projectGround: (event) => inputModule.createBabylonGroundProjector(
            gpu.scene, gpu.camera, gpu.canvas,
          )(event),
          submit: (command) => application.command(command),
          pan: (dx, dy) => gpu.pan(dx, dy),
          zoom: (delta) => gpu.zoom(delta),
          onError: showError,
        });
        return () => { input?.dispose(); input = null; };
      } }),
      onDiagnostics: (diagnostics) => {
        latest = diagnostics;
        pauseButton.textContent = diagnostics.paused ? "Resume" : "Pause";
        holdBuffersButton.disabled = diagnostics.diagnosticBufferExhaustion;
        releaseBuffersButton.disabled = !diagnostics.diagnosticBufferExhaustion;
        renderDiagnostics();
      },
      onError: showError,
    });
    activeCanvas = app.renderer.canvas;
  } catch (error) {
    app?.dispose();
    app = null;
    client?.dispose();
    client = null;
    throw error;
  }
  for (const control of document.querySelectorAll<HTMLButtonElement>("button[data-sim-control]")) {
    control.disabled = stressMode;
  }
  performanceStart.disabled = !stressMode;
  status.value = canvasControl ? "Synthetic Canvas2D control ready"
    : stressMode ? "Synthetic GPU greybox ready" : "Worker and renderer ready";
  renderDiagnostics();
  frameRequest = requestAnimationFrame(advanceFrame);
};

void start().catch(showError);
window.addEventListener("resize", () => app?.renderer.resize());
window.addEventListener("pagehide", () => {
  cancelAnimationFrame(frameRequest);
  input?.dispose();
  app?.dispose();
  if (app === null) client?.dispose();
  app = null;
  client = null;
}, { once: true });
