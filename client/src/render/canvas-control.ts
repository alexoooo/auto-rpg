import type { CanvasBackendDiagnostics, RendererFrameMetrics } from "./performance.js";
import type { PresentationSnapshot } from "./presentation.js";
import { decideFurniturePresence, decidePointPresence, decideTilePresence } from "./visibility.js";
import { FURNITURE_DOOR, FURNITURE_TORCH, MAP_OPEN, MAP_SOLID } from "../protocol/abi.generated.js";

const BACKEND: CanvasBackendDiagnostics = Object.freeze({
  requested: "canvas", selected: "canvas2d", webgpuSupport: null,
  webgpuInit: "not-attempted", webgpuFailure: null,
  webgl2Init: "not-attempted", webglVersion: null,
  engineInfo: Object.freeze({
    description: "Canvas2D control", vendor: "browser", renderer: "canvas2d",
    version: "CanvasRenderingContext2D",
  }),
});

export type CanvasControlDiagnostics = Readonly<{
  backend: CanvasBackendDiagnostics;
  scene: Readonly<RendererFrameMetrics & { meshes: number; instances: number }>;
  renderedFrame: RendererFrameMetrics;
  running: boolean;
  terminal: false;
  epoch: number | null;
  tick: number | null;
}>;

export class CanvasControlRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly #context: CanvasRenderingContext2D;
  #snapshot: PresentationSnapshot | null = null;
  #request = 0;
  #running = true;
  #disposed = false;
  #zoom = 1;
  #panX = 0;
  #panY = 0;
  #metrics: RendererFrameMetrics & { meshes: number; instances: number } = {
    draws: 0, triangles: 0, lights: 0, shadowCasters: 0, meshes: 0, instances: 0,
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext("2d", { alpha: false });
    if (context === null) throw new Error("Canvas2D control context is unavailable");
    this.#context = context;
    this.#request = requestAnimationFrame(this.#frame);
  }

  acceptSnapshot(snapshot: PresentationSnapshot, _receivedAtMs: number): void {
    this.#assertLive();
    this.#snapshot = snapshot;
  }

  clear(): void {
    if (this.#disposed) return;
    this.#snapshot = null;
    this.#context.fillStyle = "#080b0f";
    this.#context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.#metrics = { draws: 1, triangles: 0, lights: 0, shadowCasters: 0, meshes: 0, instances: 0 };
  }

  resize(): void { /* The 2D context follows the canvas backing dimensions. */ }

  pan(dx: number, dy: number): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.#panX += dx;
    this.#panY += dy;
  }

  zoom(delta: number): void {
    if (!Number.isFinite(delta)) return;
    this.#zoom = Math.min(4, Math.max(0.5, this.#zoom * Math.exp(-delta * 0.001)));
  }

  diagnostics(): CanvasControlDiagnostics {
    return Object.freeze({
      backend: BACKEND, scene: Object.freeze({ ...this.#metrics }), running: this.#running,
      renderedFrame: Object.freeze({ ...this.#metrics }),
      terminal: false, epoch: this.#snapshot?.epoch ?? null, tick: this.#snapshot?.tick ?? null,
    });
  }

  frameMetrics(): RendererFrameMetrics {
    this.#assertLive();
    if (!this.#running) throw new Error("Canvas2D control renderer is not rendering");
    return Object.freeze({ ...this.#metrics });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#running = false;
    cancelAnimationFrame(this.#request);
    this.#request = 0;
    this.#snapshot = null;
  }

  readonly #frame = (): void => {
    if (this.#disposed) return;
    this.#draw();
    this.#request = requestAnimationFrame(this.#frame);
  };

  #draw(): void {
    const context = this.#context;
    const snapshot = this.#snapshot;
    context.fillStyle = "#080b0f";
    context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    let draws = 1;
    let instances = 0;
    if (snapshot === null) {
      this.#metrics = { draws, triangles: 0, lights: 0, shadowCasters: 0, meshes: 0, instances };
      return;
    }
    const scale = Math.min(this.canvas.width / (snapshot.mapCols + snapshot.mapRows),
      this.canvas.height / ((snapshot.mapCols + snapshot.mapRows) * 0.5)) * this.#zoom;
    const originX = this.canvas.width / 2 + this.#panX;
    const originY = Math.max(24, (this.canvas.height - (snapshot.mapCols + snapshot.mapRows) * scale * 0.5) / 2) + this.#panY;
    const point = (x: number, y: number) => ({
      x: originX + (x - y) * scale,
      y: originY + (x + y) * scale * 0.5,
    });

    for (let ty = 0; ty < snapshot.mapRows; ty++) {
      for (let tx = 0; tx < snapshot.mapCols; tx++) {
        const decision = decideTilePresence(snapshot, "geometry", tx, ty);
        const value = snapshot.map[ty * snapshot.mapCols + tx];
        if (!decision.render || (value !== MAP_OPEN && value !== MAP_SOLID)) continue;
        const centre = point(tx + 0.5, ty + 0.5);
        context.fillStyle = value === MAP_SOLID
          ? decision.material === "current" ? "#56616a" : "#242a30"
          : decision.material === "current" ? "#343d45" : "#171c21";
        context.beginPath();
        context.moveTo(centre.x, centre.y - scale * 0.5);
        context.lineTo(centre.x + scale, centre.y);
        context.lineTo(centre.x, centre.y + scale * 0.5);
        context.lineTo(centre.x - scale, centre.y);
        context.closePath();
        context.fill();
        draws++;
        instances++;
      }
    }
    for (const furniture of snapshot.furniture) {
      if (!decideFurniturePresence(snapshot, furniture).render) continue;
      if (furniture.kind !== FURNITURE_DOOR && furniture.kind !== FURNITURE_TORCH) continue;
      const at = point(furniture.tx + 0.5, furniture.ty + 0.5);
      context.fillStyle = furniture.kind === FURNITURE_DOOR ? "#7b4d28" : "#ff8b28";
      context.fillRect(at.x - scale * 0.15, at.y - scale * 0.45, scale * 0.3, scale * 0.45);
      draws++;
      instances++;
    }
    for (const unit of snapshot.units) {
      if (!decidePointPresence(snapshot, "unit", unit.x, unit.y, unit.visible).render) continue;
      const at = point(unit.x, unit.y);
      context.fillStyle = unit.faction === 0 ? "#398fe5" : "#c84c35";
      context.beginPath();
      context.arc(at.x, at.y - unit.radius * scale, Math.max(2, unit.radius * scale), 0, Math.PI * 2);
      context.fill();
      draws++;
      instances++;
    }
    for (const shot of snapshot.shots) {
      if (!decidePointPresence(snapshot, "shot", shot.x, shot.y).render) continue;
      const at = point(shot.x, shot.y);
      context.fillStyle = "#f1cf42";
      context.fillRect(at.x - 2, at.y - 2, 4, 4);
      draws++;
      instances++;
    }
    for (const event of snapshot.events) {
      if (!decidePointPresence(snapshot, "event", event.x, event.y).render) continue;
      const at = point(event.x, event.y);
      context.strokeStyle = "#ff4b28";
      context.beginPath();
      context.arc(at.x, at.y, 5, 0, Math.PI * 2);
      context.stroke();
      draws++;
      instances++;
    }
    const torches = snapshot.furniture.filter((item) => item.kind === FURNITURE_TORCH
      && decideFurniturePresence(snapshot, item).render).length;
    this.#metrics = {
      draws, triangles: 0, lights: 1 + Math.min(8, torches), shadowCasters: 0,
      meshes: 0, instances,
    };
  }

  #assertLive(): void {
    if (this.#disposed) throw new Error("Canvas2D control renderer is disposed");
  }
}

export function createCanvasControlRenderer(canvas: HTMLCanvasElement): CanvasControlRenderer {
  return new CanvasControlRenderer(canvas);
}
