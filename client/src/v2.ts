import { bootstrapV2, type V2Application } from "./bootstrap.js";
import type { GreyboxInput } from "./input/greybox-input.js";
import type { LegacyClientCommand } from "./protocol/messages.js";
import type { GreyboxRenderer } from "./render/renderer.js";
import type { CanvasControlRenderer } from "./render/canvas-control.js";
import { browserCaptureLabel, CaptureControls } from "./render/capture-controls.js";
import {
  createBrowserPerformanceRuntime, GreyboxPerformanceCapture,
  prepareReferenceCaptureSurface,
  type GreyboxPerformanceMetadata, type RoomPerformanceMetadata,
} from "./render/performance.js";
import { createGreyboxStressFixture } from "./render/stress.js";
import {
  ROOM_BUILD_INPUTS_SHA256, ROOM_GLB_SHA256, ROOM_SIDECAR_SHA256, ROOM_VALIDATOR_SHA256,
} from "./render/room-asset.generated.js";
import { SimClient, type ClientDiagnostics } from "./runtime/sim-client.js";
import type { RouteHandle } from "./studio.js";

// The `#/game` route. Every control, every listener and every mutable field lives
// inside `mount`, because the shell keeps one document for a whole session: anything
// left at module scope would be shared by the second visit to this route, which would
// then drive the first visit's dead renderer and its terminated Worker.
//
// Lookups are scoped to the mounted container rather than the document for the same
// reason: `#status` is an id the arena route claims too, the shell can have a stale
// route's nodes still attached while a new one mounts, and a document-wide
// `getElementById` would find whichever copy it happened to leave in the tree. The
// scoping is not per-id -- `#error` is this route's alone today, and an id that is
// unique only by coincidence is not a lookup rule anybody can rely on.

const element = <T extends HTMLElement>(root: ParentNode, id: string): T => {
  const found = root.querySelector(`#${id}`);
  if (!found) throw new Error(`the game route is missing #${id}`);
  return found as T;
};

type DisplayRenderer = GreyboxRenderer | CanvasControlRenderer;

type NavigatorWithBrands = Navigator & {
  readonly userAgentData?: Readonly<{ brands?: readonly Readonly<{ brand: string; version: string }>[] }>;
};

export async function mount(container: HTMLElement, params: URLSearchParams): Promise<RouteHandle> {
  const find = <T extends HTMLElement>(id: string): T => element<T>(container, id);
  const integerFrom = (id: string, minimum: number, maximum: number): number => {
    const value = Number(find<HTMLInputElement>(id).value);
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new RangeError(`${id} must be an integer from ${minimum} through ${maximum}`);
    }
    return value;
  };

  const status = find<HTMLOutputElement>("status");
  const partyHealth = find<HTMLOutputElement>("party-health");
  const partyHealthBar = find<HTMLProgressElement>("party-health-bar");
  const errorOutput = find<HTMLOutputElement>("error");
  const diagnosticsOutput = find<HTMLPreElement>("diagnostics");
  const pauseButton = find<HTMLButtonElement>("pause");
  const holdBuffersButton = find<HTMLButtonElement>("diagnostic-hold-buffers");
  const releaseBuffersButton = find<HTMLButtonElement>("diagnostic-release-buffers");
  const initialCanvas = find<HTMLCanvasElement>("greybox");
  let activeCanvas = initialCanvas;
  const performanceStart = find<HTMLButtonElement>("performance-start");
  const performanceDownload = find<HTMLButtonElement>("performance-download");
  const performanceStatus = find<HTMLOutputElement>("performance-status");
  const performanceProgress = find<HTMLProgressElement>("performance-progress");
  const performanceMetadata = [...container.querySelectorAll<HTMLInputElement>("input[data-performance-metadata]")];
  const navigatorBrands = (navigator as NavigatorWithBrands).userAgentData?.brands ?? [];
  find<HTMLInputElement>("perf-browser").value = browserCaptureLabel(navigator.userAgent, navigatorBrands);
  const interactionHint = find<HTMLParagraphElement>("interaction-hint");
  const roomCameraButton = find<HTMLButtonElement>("room-camera-toggle");
  // The route's own query, handed down by the shell. `location.search` is empty under
  // hash routing, so reading it here would silently see none of these options.
  const stressParameter = params.get("stress");
  if (stressParameter !== null && stressParameter !== "greybox" && stressParameter !== "room") {
    throw new RangeError("unknown stress fixture; use stress=greybox|room");
  }
  const stressKind = stressParameter as "greybox" | "room" | null;
  const stressMode = stressKind !== null;
  const reviewParameter = params.get("review");
  if (reviewParameter !== null && reviewParameter !== "room") {
    throw new RangeError("unknown review route; use review=room");
  }
  const roomReviewMode = reviewParameter === "room";
  if (roomReviewMode && stressMode) throw new RangeError("review and stress fixtures are mutually exclusive");
  const syntheticMode = stressMode || roomReviewMode;
  const roomParameter = params.get("room");
  if (roomParameter !== null && roomParameter !== "representative" && roomParameter !== "procedural") {
    throw new RangeError("unknown room query; use room=representative|procedural");
  }
  // The authored room is the playable v2 presentation. Procedural geometry remains
  // an explicit diagnostic/removal route and the fixed stress fixtures keep choosing
  // their own renderer so performance evidence does not drift under a bare URL.
  const representativeRoom = roomParameter === "representative" ||
    (roomParameter === null && !syntheticMode);
  if (stressKind === "room" && !representativeRoom) {
    throw new RangeError("stress=room requires room=representative");
  }
  if (roomReviewMode && !representativeRoom) throw new RangeError("review=room requires room=representative");
  const roomCameraParameter = params.get("roomCamera");
  if (roomCameraParameter !== null && roomCameraParameter !== "fixed" && roomCameraParameter !== "free") {
    throw new RangeError("unknown room camera; use roomCamera=fixed|free");
  }
  if (roomCameraParameter !== null && !representativeRoom) {
    throw new RangeError("roomCamera requires room=representative");
  }
  const initialRoomCameraFree = roomCameraParameter === "free";
  const rendererParameter = params.get("renderer");
  const canvasControl = rendererParameter === "canvas";
  if (rendererParameter !== null && !canvasControl
      && rendererParameter !== "auto" && rendererParameter !== "webgl2") {
    throw new RangeError("unknown renderer query; use renderer=canvas or backend=auto|webgl2");
  }
  if (canvasControl && stressKind !== "greybox") throw new RangeError("Canvas2D control requires ?stress=greybox");
  if (canvasControl && representativeRoom) throw new RangeError("the representative room requires a GPU renderer");

  let app: V2Application<DisplayRenderer> | null = null;
  let input: GreyboxInput | null = null;
  let client: SimClient | null = null;
  let latest: ClientDiagnostics | null = null;
  let frameRequest = 0;
  let previousTime = performance.now();
  let pendingElapsedMicros = 0;
  let advanceInFlight = false;
  let performanceCapture: GreyboxPerformanceCapture | null = null;
  let roomEvidence: Readonly<{ payloadBytes: number; estimatedGpuBytes: number }> | null = null;
  let disposed = false;
  const captureControls = new CaptureControls({
    now: () => performance.now(),
    schedule: (callback, intervalMs) => window.setInterval(callback, intervalMs),
    cancel: (handle) => window.clearInterval(handle),
    render: (view) => {
      performanceStart.disabled = view.startDisabled;
      performanceDownload.disabled = view.downloadDisabled;
      for (const input of performanceMetadata) input.disabled = view.metadataLocked;
      performanceProgress.value = view.progress;
      if (view.progressLabel !== null) {
        performanceStatus.value = `${view.progressLabel} -- keep this tab visible`;
      }
    },
  });

  const refreshPerformanceStart = (): void => {
    let ready = stressMode && document.visibilityState === "visible" && app !== null && !app.disposed;
    if (!ready || app === null) {
      captureControls.updateReadiness(false);
      return;
    }
    const diagnostics = app.renderer.diagnostics();
    ready = diagnostics.running && !diagnostics.terminal;
    if (representativeRoom && (app.renderer as GreyboxRenderer).reviewCameraFree) ready = false;
    try {
      const frame = app.renderer.frameMetrics();
      ready &&= frame.draws > 0 && (diagnostics.backend.selected === "canvas2d" || frame.triangles > 0);
    } catch { ready = false; }
    captureControls.updateReadiness(ready);
  };

  const rejectActivePerformance = (reason: string): void => captureControls.terminate(reason);

  const renderDiagnostics = (): void => {
    diagnosticsOutput.textContent = JSON.stringify({
      mode: roomReviewMode ? "room-review" : stressMode ? "synthetic-greybox" : "real-worker",
      client: latest,
      renderer: app?.renderer.diagnostics() ?? null,
    }, null, 2);
  };

  const renderPartyHealth = (): void => {
    const snapshot = app?.latestSnapshot();
    if (snapshot === null || snapshot === undefined) {
      partyHealth.value = "-- / --";
      partyHealthBar.value = 0;
      return;
    }
    let health = 0;
    let maximum = 0;
    for (const unit of snapshot.units) {
      if (unit.faction !== 0) continue;
      health += unit.hp;
      maximum += unit.maxHp;
    }
    const label = (value: number): string =>
      Number.isInteger(value) ? String(value) : value.toFixed(1);
    partyHealth.value = maximum > 0
      ? label(Math.max(0, health)) + " / " + label(maximum) : "-- / --";
    partyHealthBar.value = maximum > 0
      ? Math.max(0, Math.min(1, health / maximum)) : 0;
  };

  const showError = (error: unknown): void => {
    const value = error instanceof Error ? error : new Error(String(error));
    errorOutput.value = value.message;
    status.value = "Stopped";
    renderPartyHealth();
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
  const roomReviewInteractionBlocked = (renderer: GreyboxRenderer): boolean =>
    representativeRoom && renderer.reviewCameraFree;
  const submit = async (command: LegacyClientCommand): Promise<void> => {
    const application = requireApp();
    const renderer = application.renderer as GreyboxRenderer;
    if (roomReviewInteractionBlocked(renderer)) {
      throw new Error("simulation commands are disabled while the free review camera is active");
    }
    return application.command(command);
  };

  // Route handlers exist before bootstrap can send init to the worker.
  find<HTMLButtonElement>("reset").addEventListener("click", () => {
    run(() => requireApp().reset(integerFrom("seed", 0, 0xffff_ffff), latest?.paused), "Reset complete");
  });
  pauseButton.addEventListener("click", () => {
    const paused = latest?.paused ?? false;
    run(() => requireApp().setPaused(!paused), paused ? "Running" : "Paused");
  });
  find<HTMLButtonElement>("goto").addEventListener("click", () => {
    run(() => submit({
      kind: "goto",
      xMilli: integerFrom("goto-x", -0x8000_0000, 0x7fff_ffff),
      yMilli: integerFrom("goto-y", -0x8000_0000, 0x7fff_ffff),
    }), "Goto applied");
  });
  find<HTMLButtonElement>("withdraw").addEventListener("click", () => {
    run(() => submit({ kind: "withdraw" }), "Order cleared");
  });
  find<HTMLButtonElement>("spawn").addEventListener("click", () => {
    run(() => submit({ kind: "spawn", kindCode: 2, primary: 0, secondary: 255 }), "Spawn applied");
  });
  roomCameraButton.addEventListener("click", () => {
    try {
      if (!representativeRoom) throw new Error("representative room camera is unavailable");
      const renderer = requireApp().renderer as GreyboxRenderer;
      renderer.setReviewCameraFree(!renderer.reviewCameraFree);
      roomCameraButton.textContent = renderer.reviewCameraFree ? "Use fixed camera" : "Use free camera";
      performanceStatus.value = renderer.reviewCameraFree
        ? "Free review camera active -- performance capture disabled"
        : "Fixed review camera active";
      refreshPerformanceStart();
    } catch (error) { showError(error); }
  });
  holdBuffersButton.addEventListener("click", () => {
    run(async () => client?.beginDiagnosticBufferExhaustion(), "Holding the next three snapshot leases");
  });
  releaseBuffersButton.addEventListener("click", () => {
    run(async () => client?.releaseDiagnosticBufferExhaustion(), "Released all diagnostic snapshot leases");
  });
  performanceStart.addEventListener("click", () => {
    if (!captureControls.begin((reason) => performanceCapture?.reject(reason))) return;
    performanceCapture = null;
    performanceStatus.value = "Preparing reference surface...";
    errorOutput.value = "";
    void (async () => {
      if (!stressMode) throw new Error("performance capture requires a fixed stress fixture");
      const renderer = requireApp().renderer;
      if (representativeRoom && (renderer as GreyboxRenderer).reviewCameraFree) {
        throw new Error("representative room performance capture requires the fixed review camera");
      }
      const captureCanvas = renderer.canvas;
      const completedFrame = renderer.frameMetrics();
      const gpuFrame = renderer.diagnostics().backend.selected !== "canvas2d";
      if (completedFrame.draws <= 0 || (gpuFrame && completedFrame.triangles <= 0)) {
        throw new Error("performance capture requires a completed nonempty rendered frame; reload this route in a fresh tab");
      }
      const surface = prepareReferenceCaptureSurface(
        captureCanvas,
        renderer.diagnostics().backend.selected === "canvas2d" ? "canvas2d" : "engine",
        () => renderer.resize(),
      );
      const text = (id: string): string => find<HTMLInputElement>(id).value.trim();
      const baseMetadata: GreyboxPerformanceMetadata = Object.freeze({
        os: text("perf-os"), cpu: text("perf-cpu"), gpu: text("perf-gpu"), driver: text("perf-driver"),
        browser: text("perf-browser"), powerMode: text("perf-power"),
        cssWidth: 1920, cssHeight: 1080, backingWidth: 1920, backingHeight: 1080,
        devicePixelRatio: window.devicePixelRatio, renderScale: 1,
        fixtureSeed: 1592594996, population: 64, roomWidth: 48, roomHeight: 32,
        trainingWorkers: 0, backend: renderer.diagnostics().backend,
      });
      let metadata: GreyboxPerformanceMetadata | RoomPerformanceMetadata = baseMetadata;
      if (stressKind === "room") {
        if (roomEvidence === null) throw new Error("representative room evidence identity is unavailable");
        const roomStress = await import("./render/room-stress.js");
        metadata = Object.freeze({
          ...baseMetadata,
          fixture: Object.freeze({
            kind: "representative-room", fixtureId: "v2-room-slice-1",
            buildInputsSha256: ROOM_BUILD_INPUTS_SHA256, glbSha256: ROOM_GLB_SHA256,
            sidecarSha256: ROOM_SIDECAR_SHA256, validatorSha256: ROOM_VALIDATOR_SHA256,
            roomStressMapSha256: roomStress.ROOM_STRESS_MAP_SHA256,
            generatorSeed: 1592594996, population: 64, roomWidth: 48, roomHeight: 32,
            payloadBytes: roomEvidence.payloadBytes, estimatedGpuBytes: roomEvidence.estimatedGpuBytes,
          }),
        });
      }
      try {
        performanceCapture = new GreyboxPerformanceCapture(createBrowserPerformanceRuntime(
          captureCanvas, () => renderer.frameMetrics(),
        ));
        const result = await performanceCapture.start(metadata);
        if (!captureControls.settle(result.status)) return;
        performanceStatus.value = `${result.status}: ${result.samples.length} sampled frames`;
        refreshPerformanceStart();
      } catch (error) {
        surface.restore();
        throw error;
      }
    })().catch((error: unknown) => {
      captureControls.settle("rejected");
      const value = error instanceof Error ? error : new Error(String(error));
      performanceStatus.value = `Capture failed: ${value.message}`;
      errorOutput.value = value.message;
      refreshPerformanceStart();
      renderDiagnostics();
    });
  });
  performanceDownload.addEventListener("click", () => {
    try {
      if (performanceCapture?.result()?.status !== "complete") {
        throw new Error("no completed performance capture is available");
      }
      const blob = new Blob([performanceCapture.exportJson()], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `${representativeRoom ? "v2-room" : "v2-greybox"}-${
        app?.renderer.diagnostics().backend.selected ?? "rejected"}.json`;
      link.click();
      URL.revokeObjectURL(href);
    } catch (error) {
      const value = error instanceof Error ? error : new Error(String(error));
      performanceStatus.value = `Download unavailable: ${value.message}`;
      errorOutput.value = value.message;
    }
  });

  const advanceFrame = (now: number): void => {
    // `disposed` is checked beside `app.disposed` because the shell can take the
    // route down before bootstrap ever produced an application, and a loop that
    // only watched `app` would re-request a frame forever against a detached DOM.
    if (disposed || app?.disposed) {
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
    renderPartyHealth();
    renderDiagnostics();
    refreshPerformanceStart();
    frameRequest = requestAnimationFrame(advanceFrame);
  };

  const start = async (): Promise<void> => {
    const needsWorker = !syntheticMode;
    const backend = canvasControl ? null
      : (await import("./render/engine.js")).rendererBackendFromSearch(params.toString());
    const canvasModule = canvasControl ? await import("./render/canvas-control.js") : null;
    const rendererModule = canvasControl ? null : await import("./render/renderer.js");
    const inputModule = canvasControl ? null : await import("./input/greybox-input.js");
    const combatantModule = canvasControl ? null : await import("./render/combatant-assets.js");
    const roomModules = representativeRoom ? await Promise.all([
      import("./render/room-assets.js"),
      import("./render/room-environment.js"),
      import("./render/room-review-camera.js"),
      import("./render/room-stress.js"),
      import("./render/room-review.js"),
    ]) : null;
    const stressSnapshot = stressKind === "greybox" ? createGreyboxStressFixture()
      : stressKind === "room" ? roomModules?.[3].createRoomStressFixture()
        : roomReviewMode ? roomModules?.[4].createCompactRoomReviewFixture() : undefined;
    if (stressKind === "room" && stressSnapshot === undefined) {
      throw new Error("representative room stress fixture is unavailable");
    }
    if (roomReviewMode && stressSnapshot === undefined) throw new Error("compact room review fixture is unavailable");
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
        ...(stressSnapshot === undefined ? {} : { stressSnapshot }),
        createRenderer: async (terminal): Promise<DisplayRenderer> => {
          if (canvasModule !== null) return canvasModule.createCanvasControlRenderer(activeCanvas);
          if (backend === null || rendererModule === null) throw new Error("GPU renderer backend is missing");
          return rendererModule.createGreyboxRenderer(activeCanvas, backend, {
            pauseSimulation: () => { if (client !== null) void client.setPaused(true).catch(() => undefined); },
            stopInput: () => input?.dispose(),
            onTerminal: (error) => {
              rejectActivePerformance(`renderer terminal: ${error.message}`);
              terminal(new Error(error.message));
            },
            onCanvasReplaced: (_previous, replacement) => { activeCanvas = replacement; },
          }, {
            ...(combatantModule === null ? {} : {
              createCombatants: (scene, signal) => combatantModule.loadCombatantAsset(scene, signal),
            }),
            ...(roomModules === null ? {} : {
            createEnvironment: async (scene, debug, signal) => {
              const asset = await roomModules[0].loadRoomAsset(scene, signal);
              const authoredLighting = !stressMode ? roomModules[4].applyAuthoredRoomLighting(scene) : null;
              try {
                const environment = roomModules[1].createRoomEnvironmentPresentation(scene, debug, asset);
                await environment.prepare(signal);
                roomEvidence = Object.freeze({
                  payloadBytes: asset.sidecar.payloadBytes,
                  estimatedGpuBytes: asset.sidecar.estimatedGpuResidency.totalBytes,
                });
                return Object.freeze({
                  get shadowGenerator() { return environment.shadowGenerator; },
                  acceptSnapshot: (snapshot) => environment.acceptSnapshot(snapshot),
                  authoredFrameReady: () => environment.authoredFrameReady(),
                  reset: () => environment.reset(),
                  dispose: () => { authoredLighting?.dispose(); environment.dispose(); asset.dispose(); },
                });
              } catch (error) {
                authoredLighting?.dispose();
                asset.dispose();
                throw error;
              }
            },
            // The stress fixture keeps zoom one and no follow: its recorded
            // captures are comparable only because the camera never moves.
            createReviewCamera: (scene, canvas, bounds) =>
              roomModules[2].createRoomReviewCamera(scene, canvas, bounds,
                roomReviewMode ? { initialFixedZoom: 1.6 }
                  : stressMode ? {}
                    : { initialFixedZoom: roomModules[2].GAME_INITIAL_FIXED_ZOOM, followHero: true }),
            reviewCameraFree: initialRoomCameraFree,
            }),
          });
        },
        ...(inputModule === null ? {} : { attachInput: (application: V2Application<DisplayRenderer>) => {
          const gpu = application.renderer as GreyboxRenderer;
          activeCanvas = gpu.canvas;
          input = new inputModule.GreyboxInput({
            canvas: gpu.canvas,
            snapshot: () => application.latestSnapshot(),
            blocked: () => syntheticMode || roomReviewInteractionBlocked(gpu) || application.disposed
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
      if (representativeRoom && !canvasControl) {
        await (app.renderer as GreyboxRenderer).awaitAuthoredFrame();
      }
    } catch (error) {
      app?.dispose();
      app = null;
      client?.dispose();
      client = null;
      throw error;
    }
    for (const control of container.querySelectorAll<HTMLButtonElement>("button[data-sim-control]")) {
      control.disabled = syntheticMode;
    }
    refreshPerformanceStart();
    interactionHint.textContent = roomReviewMode
      ? "Compact room review is noninteractive and has no simulation Worker. Use the camera toggle to inspect the authored slice."
      : stressMode
      ? representativeRoom
        ? "The representative room stress fixture is noninteractive. Use the camera toggle for visual review; return to fixed mode before capture."
        : "The fixed stress fixture is intentionally noninteractive; input and simulation controls are disabled during comparable capture."
      : "Click known floor to move. Drag with the primary, middle, or secondary button to pan; use the wheel to zoom and Escape to withdraw.";
    roomCameraButton.hidden = !representativeRoom;
    if (representativeRoom) {
      const gpu = app.renderer as GreyboxRenderer;
      roomCameraButton.textContent = gpu.reviewCameraFree ? "Use fixed camera" : "Use free camera";
    }
    status.value = canvasControl ? "Synthetic Canvas2D control ready"
      : roomReviewMode ? "Compact representative room review ready"
        : stressKind === "room" ? "Representative room stress fixture ready"
        : stressMode ? "Synthetic GPU greybox ready"
          : representativeRoom ? "Worker and representative room ready" : "Worker and renderer ready";
    renderPartyHealth();
    renderDiagnostics();
    frameRequest = requestAnimationFrame(advanceFrame);
  };

  const onResize = (): void => { app?.renderer.resize(); };
  window.addEventListener("resize", onResize);
  // Startup stays detached, as it was on the standalone page: a bootstrap failure
  // belongs in `#error` beside the controls that produced it, and a `mount` that
  // rejected there would never hand the shell the handle that releases the Worker.
  const startup = start().catch(showError);

  // Everything the route holds. `release` is idempotent, and it is deliberately run
  // twice: once the moment the shell says go, and once more when a bootstrap that
  // was still in flight at that moment finally hands back what it built. Without the
  // second run a reader who leaves `#/game` during startup keeps a live Worker.
  const release = (): void => {
    cancelAnimationFrame(frameRequest);
    frameRequest = 0;
    input?.dispose();
    input = null;
    // `V2Application.dispose` disposes the client it was given, so the client is
    // only released here when bootstrap never produced an application.
    app?.dispose();
    if (app === null) client?.dispose();
    app = null;
    client = null;
  };

  return {
    dispose: (): void => {
      if (disposed) return;
      disposed = true;
      window.removeEventListener("resize", onResize);
      // Also stops `CaptureControls`' one-second progress interval.
      rejectActivePerformance("the game route was unmounted during performance capture");
      release();
      void startup.then(release);
    },
  };
}
