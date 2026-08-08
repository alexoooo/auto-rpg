import type { RendererBackendDiagnostics } from "./engine.js";

export const PERFORMANCE_SCHEMA_VERSION = 1;
export const PERFORMANCE_WARMUP_MS = 30_000;
export const PERFORMANCE_SAMPLE_MS = 120_000;

export type CanvasBackendDiagnostics = Readonly<{
  requested: "canvas";
  selected: "canvas2d";
  webgpuSupport: null;
  webgpuInit: "not-attempted";
  webgpuFailure: null;
  webgl2Init: "not-attempted";
  webglVersion: null;
  engineInfo: Readonly<{
    description: "Canvas2D control";
    vendor: "browser";
    renderer: "canvas2d";
    version: string;
  }>;
}>;

export type GreyboxPerformanceMetadata = Readonly<{
  os: string;
  cpu: string;
  gpu: string;
  driver: string;
  browser: string;
  powerMode: string;
  cssWidth: 1920;
  cssHeight: 1080;
  backingWidth: 1920;
  backingHeight: 1080;
  devicePixelRatio: number;
  renderScale: 1;
  fixtureSeed: 1592594996;
  population: 64;
  roomWidth: 48;
  roomHeight: 32;
  trainingWorkers: 0;
  backend: RendererBackendDiagnostics | CanvasBackendDiagnostics;
}>;

export type RendererFrameMetrics = Readonly<{
  draws: number;
  triangles: number;
  lights: number;
  shadowCasters: number;
}>;

export type GreyboxPerformanceSample = Readonly<RendererFrameMetrics & {
  atMs: number;
  deltaMs: number;
}>;

export type GreyboxPerformanceRun = Readonly<{
  schemaVersion: 1;
  status: "complete" | "rejected";
  rejectionReasons: readonly string[];
  startedAt: string;
  metadata: GreyboxPerformanceMetadata;
  warmupMs: 30000;
  sampleMs: 120000;
  samples: readonly GreyboxPerformanceSample[];
  longTasks: Readonly<{ supported: boolean; count: number; totalMs: number }>;
  summary: Readonly<{
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    framesOver16_67Ms: number;
    framesOver33_33Ms: number;
    gpuResidencyBytes: null;
    gpuResidencyMethod: "unavailable-browser-api";
  }>;
}>;

export type PerformanceCaptureStatus = "idle" | "warming" | "sampling" | "complete" | "rejected";

export type LongTaskObservation = Readonly<{
  supported: boolean;
  disconnect: () => void;
}>;

export type PerformanceSurfaceSize = Readonly<{
  cssWidth: number;
  cssHeight: number;
  backingWidth: number;
  backingHeight: number;
}>;

export type PerformanceCaptureRuntime = Readonly<{
  now: () => number;
  startedAt: () => string;
  visibility: () => DocumentVisibilityState;
  subscribeVisibility: (listener: () => void) => () => void;
  requestFrame: (listener: (atMs: number) => void) => number;
  cancelFrame: (request: number) => void;
  observeLongTasks: (listener: (durationMs: number) => void) => LongTaskObservation;
  surfaceSize: () => PerformanceSurfaceSize;
  sampleFrame: () => RendererFrameMetrics;
}>;

const SOFTWARE_RENDERERS = ["swiftshader", "llvmpipe", "software", "microsoft basic render"] as const;

const finiteNonnegative = (label: string, value: number): number => {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be finite and nonnegative`);
  return value;
};

const safeCount = (label: string, value: number): number => {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a nonnegative safe integer`);
  return value;
};

const requiredText = (label: string, value: string): string => {
  const cleaned = value.trim();
  if (!cleaned) throw new RangeError(`${label} must be nonempty`);
  return cleaned;
};

const copyBackend = (
  backend: RendererBackendDiagnostics | CanvasBackendDiagnostics,
): RendererBackendDiagnostics | CanvasBackendDiagnostics => Object.freeze({
  ...backend,
  webgpuFailure: backend.webgpuFailure === null ? null : Object.freeze({ ...backend.webgpuFailure }),
  engineInfo: backend.engineInfo === null ? null : Object.freeze({ ...backend.engineInfo }),
}) as RendererBackendDiagnostics | CanvasBackendDiagnostics;

const copyMetadata = (metadata: GreyboxPerformanceMetadata): GreyboxPerformanceMetadata => {
  for (const [label, value] of [
    ["os", metadata.os], ["cpu", metadata.cpu], ["gpu", metadata.gpu],
    ["driver", metadata.driver], ["browser", metadata.browser], ["powerMode", metadata.powerMode],
  ] as const) requiredText(label, value);
  if (metadata.cssWidth !== 1920 || metadata.cssHeight !== 1080 ||
      metadata.backingWidth !== 1920 || metadata.backingHeight !== 1080) {
    throw new RangeError("reference capture must use 1920 by 1080 CSS and backing dimensions");
  }
  if (metadata.renderScale !== 1 || metadata.fixtureSeed !== 1592594996 ||
      metadata.population !== 64 || metadata.roomWidth !== 48 || metadata.roomHeight !== 32 ||
      metadata.trainingWorkers !== 0) {
    throw new RangeError("reference capture metadata does not match the fixed greybox fixture");
  }
  if (!Number.isFinite(metadata.devicePixelRatio) || metadata.devicePixelRatio <= 0) {
    throw new RangeError("devicePixelRatio must be finite and positive");
  }
  return Object.freeze({
    ...metadata,
    os: metadata.os.trim(), cpu: metadata.cpu.trim(), gpu: metadata.gpu.trim(),
    driver: metadata.driver.trim(), browser: metadata.browser.trim(), powerMode: metadata.powerMode.trim(),
    backend: copyBackend(metadata.backend),
  });
};

const softwareReason = (backend: RendererBackendDiagnostics | CanvasBackendDiagnostics): string | null => {
  const info = backend.engineInfo;
  if (info === null) return "renderer backend has no selected engine information";
  const identity = `${info.description} ${info.vendor} ${info.renderer}`.toLowerCase();
  const matched = SOFTWARE_RENDERERS.find((name) => identity.includes(name));
  return matched === undefined ? null : `software renderer rejected: ${matched}`;
};

const validateSurfaceSize = (surface: PerformanceSurfaceSize, metadata: GreyboxPerformanceMetadata): void => {
  for (const [label, value] of [
    ["canvas CSS width", surface.cssWidth], ["canvas CSS height", surface.cssHeight],
    ["canvas backing width", surface.backingWidth], ["canvas backing height", surface.backingHeight],
  ] as const) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive safe integer`);
  }
  if (surface.cssWidth !== metadata.cssWidth || surface.cssHeight !== metadata.cssHeight ||
      surface.backingWidth !== metadata.backingWidth || surface.backingHeight !== metadata.backingHeight) {
    throw new RangeError("measured active canvas dimensions do not match performance metadata");
  }
};

const nearestRank = (sorted: readonly number[], percentile: number): number => {
  if (sorted.length === 0) return 0;
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1);
  return sorted[index] ?? 0;
};

const sampleMetrics = (value: RendererFrameMetrics, atMs: number, deltaMs: number): GreyboxPerformanceSample =>
  Object.freeze({
    atMs: finiteNonnegative("sample timestamp", atMs),
    deltaMs: finiteNonnegative("frame delta", deltaMs),
    draws: safeCount("draw count", value.draws),
    triangles: safeCount("triangle count", value.triangles),
    lights: safeCount("light count", value.lights),
    shadowCasters: safeCount("shadow caster count", value.shadowCasters),
  });

export class GreyboxPerformanceCapture {
  readonly #runtime: PerformanceCaptureRuntime;
  #status: PerformanceCaptureStatus = "idle";
  #metadata: GreyboxPerformanceMetadata | null = null;
  #startedAt = "";
  #startMs = 0;
  #previousSampleMs: number | null = null;
  #samples: GreyboxPerformanceSample[] = [];
  #longTaskSupported = false;
  #longTaskCount = 0;
  #longTaskTotalMs = 0;
  #reasons: string[] = [];
  #frameRequest: number | null = null;
  #unsubscribeVisibility = (): void => undefined;
  #disconnectLongTasks = (): void => undefined;
  #resolve: ((run: GreyboxPerformanceRun) => void) | null = null;
  #result: GreyboxPerformanceRun | null = null;

  constructor(runtime: PerformanceCaptureRuntime) {
    this.#runtime = runtime;
  }

  get status(): PerformanceCaptureStatus {
    return this.#status;
  }

  result(): GreyboxPerformanceRun | null {
    return this.#result;
  }

  start(metadata: GreyboxPerformanceMetadata): Promise<GreyboxPerformanceRun> {
    if (this.#status === "warming" || this.#status === "sampling") {
      throw new Error("a performance capture is already active");
    }
    this.#reset(copyMetadata(metadata));
    const completion = new Promise<GreyboxPerformanceRun>((resolve) => { this.#resolve = resolve; });
    try {
      validateSurfaceSize(this.#runtime.surfaceSize(), this.#metadata ?? metadata);
      const observation = this.#runtime.observeLongTasks((durationMs) => {
        if (this.#status !== "sampling") return;
        try {
          const duration = finiteNonnegative("long task duration", durationMs);
          this.#longTaskTotalMs = finiteNonnegative("long task total", this.#longTaskTotalMs + duration);
          this.#longTaskCount = safeCount("long task count", this.#longTaskCount + 1);
        } catch (error) {
          this.reject(error instanceof Error ? error.message : String(error));
        }
      });
      this.#longTaskSupported = observation.supported;
      this.#disconnectLongTasks = observation.disconnect;
      this.#unsubscribeVisibility = this.#runtime.subscribeVisibility(() => {
        if (this.#runtime.visibility() !== "visible") {
          this.reject(`document visibility changed to ${this.#runtime.visibility()}`);
        }
      });
    } catch (error) {
      this.reject(error instanceof Error ? error.message : String(error));
      return completion;
    }
    if (this.#runtime.visibility() !== "visible") {
      this.reject(`document visibility is ${this.#runtime.visibility()}`);
      return completion;
    }
    const rejectedRenderer = softwareReason(this.#metadata?.backend ?? metadata.backend);
    if (rejectedRenderer !== null) {
      this.reject(rejectedRenderer);
      return completion;
    }
    this.#scheduleFrame();
    return completion;
  }

  reject(reason: string): void {
    if (this.#status !== "warming" && this.#status !== "sampling") return;
    const cleaned = reason.replace(/\s+/g, " ").trim();
    if (cleaned && !this.#reasons.includes(cleaned)) this.#reasons.push(cleaned);
    this.#finish("rejected");
  }

  exportJson(): string {
    if (this.#result === null) throw new Error("performance capture has not finished");
    return `${JSON.stringify(this.#result, null, 2)}\n`;
  }

  #reset(metadata: GreyboxPerformanceMetadata): void {
    const startMs = this.#runtime.now();
    if (!Number.isFinite(startMs) || startMs < 0) throw new RangeError("capture clock must be finite and nonnegative");
    const startedAt = this.#runtime.startedAt();
    const parsedStartedAt = new Date(startedAt);
    if (!Number.isFinite(parsedStartedAt.valueOf()) || parsedStartedAt.toISOString() !== startedAt) {
      throw new RangeError("capture startedAt must be a canonical ISO date string");
    }
    this.#cleanup();
    this.#status = "warming";
    this.#metadata = metadata;
    this.#startedAt = startedAt;
    this.#startMs = startMs;
    this.#previousSampleMs = null;
    this.#samples = [];
    this.#longTaskSupported = false;
    this.#longTaskCount = 0;
    this.#longTaskTotalMs = 0;
    this.#reasons = [];
    this.#result = null;
  }

  #scheduleFrame(): void {
    if (this.#status !== "warming" && this.#status !== "sampling") return;
    try {
      this.#frameRequest = this.#runtime.requestFrame((atMs) => {
        this.#frameRequest = null;
        this.#onFrame(atMs);
      });
    } catch (error) {
      this.reject(error instanceof Error ? error.message : String(error));
    }
  }

  #onFrame(atMs: number): void {
    if (this.#status !== "warming" && this.#status !== "sampling") return;
    if (this.#runtime.visibility() !== "visible") {
      this.reject(`document visibility changed to ${this.#runtime.visibility()}`);
      return;
    }
    if (!Number.isFinite(atMs) || atMs < this.#startMs) {
      this.reject("animation frame timestamp moved backwards or was non-finite");
      return;
    }
    const warmupEnd = this.#startMs + PERFORMANCE_WARMUP_MS;
    const sampleEnd = warmupEnd + PERFORMANCE_SAMPLE_MS;
    if (atMs < warmupEnd) {
      this.#scheduleFrame();
      return;
    }
    if (this.#status === "warming") {
      this.#status = "sampling";
      this.#previousSampleMs = atMs;
      if (atMs >= sampleEnd) this.#finish("complete");
      else this.#scheduleFrame();
      return;
    }
    const previous = this.#previousSampleMs;
    if (previous === null || atMs <= previous) {
      this.reject("animation frame timestamp did not advance");
      return;
    }
    if (atMs > sampleEnd) {
      this.#finish("complete");
      return;
    }
    try {
      this.#samples.push(sampleMetrics(this.#runtime.sampleFrame(), atMs, atMs - previous));
      this.#previousSampleMs = atMs;
    } catch (error) {
      this.reject(error instanceof Error ? error.message : String(error));
      return;
    }
    if (atMs >= sampleEnd) this.#finish("complete");
    else this.#scheduleFrame();
  }

  #finish(status: "complete" | "rejected"): void {
    if (this.#metadata === null) throw new Error("performance capture metadata is missing");
    if (status === "complete" && this.#samples.length === 0) {
      status = "rejected";
      this.#reasons.push("sample window completed without a measured frame");
    }
    const deltas = this.#samples.map((sample) => sample.deltaMs).sort((a, b) => a - b);
    const result: GreyboxPerformanceRun = Object.freeze({
      schemaVersion: PERFORMANCE_SCHEMA_VERSION,
      status,
      rejectionReasons: Object.freeze([...this.#reasons]),
      startedAt: this.#startedAt,
      metadata: this.#metadata,
      warmupMs: PERFORMANCE_WARMUP_MS,
      sampleMs: PERFORMANCE_SAMPLE_MS,
      samples: Object.freeze([...this.#samples]),
      longTasks: Object.freeze({
        supported: this.#longTaskSupported,
        count: this.#longTaskCount,
        totalMs: this.#longTaskTotalMs,
      }),
      summary: Object.freeze({
        p50Ms: nearestRank(deltas, 0.50),
        p95Ms: nearestRank(deltas, 0.95),
        p99Ms: nearestRank(deltas, 0.99),
        framesOver16_67Ms: deltas.filter((value) => value > 16.67).length,
        framesOver33_33Ms: deltas.filter((value) => value > 33.33).length,
        gpuResidencyBytes: null,
        gpuResidencyMethod: "unavailable-browser-api",
      }),
    });
    this.#result = result;
    this.#status = status;
    const resolve = this.#resolve;
    this.#resolve = null;
    this.#cleanup();
    resolve?.(result);
  }

  #cleanup(): void {
    if (this.#frameRequest !== null) this.#runtime.cancelFrame(this.#frameRequest);
    this.#frameRequest = null;
    this.#unsubscribeVisibility();
    this.#unsubscribeVisibility = (): void => undefined;
    this.#disconnectLongTasks();
    this.#disconnectLongTasks = (): void => undefined;
  }
}

export function createBrowserPerformanceRuntime(
  canvas: HTMLCanvasElement,
  sampleFrame: () => RendererFrameMetrics,
): PerformanceCaptureRuntime {
  return Object.freeze({
    now: () => performance.now(),
    startedAt: () => new Date().toISOString(),
    visibility: () => document.visibilityState,
    subscribeVisibility: (listener) => {
      document.addEventListener("visibilitychange", listener);
      return () => document.removeEventListener("visibilitychange", listener);
    },
    requestFrame: (listener) => requestAnimationFrame(listener),
    cancelFrame: (request) => cancelAnimationFrame(request),
    observeLongTasks: (listener) => {
      const supported = typeof PerformanceObserver !== "undefined"
        && (PerformanceObserver.supportedEntryTypes?.includes("longtask") ?? false);
      if (!supported) return Object.freeze({ supported: false, disconnect: () => undefined });
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) listener(entry.duration);
      });
      observer.observe({ type: "longtask", buffered: false });
      return Object.freeze({ supported: true, disconnect: () => observer.disconnect() });
    },
    surfaceSize: () => Object.freeze({
      cssWidth: canvas.clientWidth,
      cssHeight: canvas.clientHeight,
      backingWidth: canvas.width,
      backingHeight: canvas.height,
    }),
    sampleFrame,
  });
}
