import { Matrix } from "@babylonjs/core/Maths/math.vector.js";
import { Plane } from "@babylonjs/core/Maths/math.plane.js";
import "@babylonjs/core/Culling/ray.js";
import type { Camera } from "@babylonjs/core/Cameras/camera.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { MAP_OPEN } from "../protocol/abi.generated.js";
import type { LegacyClientCommand } from "../protocol/messages.js";
import type { PresentationSnapshot } from "../render/presentation.js";

const I32_MIN = -0x8000_0000;
const I32_MAX = 0x7fff_ffff;
const PRIMARY_DRAG_THRESHOLD_PX = 4;

export type GroundPoint = Readonly<{ x: number; z: number }>;

export function pointToGotoCommand(
  snapshot: PresentationSnapshot,
  point: GroundPoint,
): LegacyClientCommand | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)
      || !Number.isFinite(snapshot.tileSize) || snapshot.tileSize <= 0) return null;
  const tx = Math.floor(point.x / snapshot.tileSize);
  const ty = Math.floor(point.z / snapshot.tileSize);
  if (tx < 0 || ty < 0 || tx >= snapshot.mapCols || ty >= snapshot.mapRows) return null;
  const at = ty * snapshot.mapCols + tx;
  if (snapshot.map[at] !== MAP_OPEN || (snapshot.vis[at] !== 1 && snapshot.vis[at] !== 2)) return null;
  const xMilli = Math.round(point.x * 1000);
  const yMilli = Math.round(point.z * 1000);
  if (!Number.isSafeInteger(xMilli) || !Number.isSafeInteger(yMilli)
      || xMilli < I32_MIN || xMilli > I32_MAX || yMilli < I32_MIN || yMilli > I32_MAX) return null;
  return Object.freeze({ kind: "goto" as const, xMilli, yMilli });
}

export type GreyboxInputOptions = Readonly<{
  canvas: HTMLCanvasElement;
  snapshot: () => PresentationSnapshot | null;
  blocked: () => boolean;
  projectGround: (event: PointerEvent) => GroundPoint | null;
  submit: (command: LegacyClientCommand) => Promise<unknown>;
  pan?: (dx: number, dy: number) => void;
  zoom?: (delta: number) => void;
  onError?: (error: Error) => void;
}>;

export class GreyboxInput {
  readonly #options: GreyboxInputOptions;
  #disposed = false;
  #pointerId: number | null = null;
  #button = -1;
  #dragging = false;
  #startX = 0;
  #startY = 0;
  #lastX = 0;
  #lastY = 0;

  constructor(options: GreyboxInputOptions) {
    this.#options = options;
    options.canvas.addEventListener("pointerdown", this.#pointerDown);
    options.canvas.addEventListener("pointermove", this.#pointerMove);
    options.canvas.addEventListener("pointerup", this.#pointerUp);
    options.canvas.addEventListener("pointercancel", this.#pointerUp);
    options.canvas.addEventListener("wheel", this.#wheel, { passive: false });
    options.canvas.addEventListener("contextmenu", this.#contextMenu);
    window.addEventListener("keydown", this.#keyDown);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const canvas = this.#options.canvas;
    const captureError = this.#clearGesture();
    if (captureError !== null) this.#report(captureError);
    canvas.removeEventListener("pointerdown", this.#pointerDown);
    canvas.removeEventListener("pointermove", this.#pointerMove);
    canvas.removeEventListener("pointerup", this.#pointerUp);
    canvas.removeEventListener("pointercancel", this.#pointerUp);
    canvas.removeEventListener("wheel", this.#wheel);
    canvas.removeEventListener("contextmenu", this.#contextMenu);
    window.removeEventListener("keydown", this.#keyDown);
  }

  readonly #pointerDown = (event: PointerEvent): void => {
    if (this.#disposed) return;
    try {
      if (this.#pointerId !== null) {
        event.preventDefault();
        return;
      }
      if (this.#options.blocked()) return;
      if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
      event.preventDefault();
      this.#pointerId = event.pointerId;
      this.#button = event.button;
      this.#dragging = event.button !== 0;
      this.#startX = event.clientX;
      this.#startY = event.clientY;
      this.#lastX = event.clientX;
      this.#lastY = event.clientY;
      this.#options.canvas.setPointerCapture(event.pointerId);
    } catch (error) {
      this.#failGesture(error);
    }
  };

  readonly #pointerMove = (event: PointerEvent): void => {
    if (this.#pointerId !== event.pointerId || this.#disposed) return;
    try {
      if (this.#options.blocked()) {
        const captureError = this.#clearGesture();
        if (captureError !== null) this.#report(captureError);
        return;
      }
      const dx = event.clientX - this.#lastX;
      const dy = event.clientY - this.#lastY;
      if (!this.#dragging) {
        const totalX = event.clientX - this.#startX;
        const totalY = event.clientY - this.#startY;
        if (totalX * totalX + totalY * totalY < PRIMARY_DRAG_THRESHOLD_PX ** 2) return;
        this.#dragging = true;
        this.#options.pan?.(totalX, totalY);
      } else {
        this.#options.pan?.(dx, dy);
      }
      this.#lastX = event.clientX;
      this.#lastY = event.clientY;
    } catch (error) {
      this.#failGesture(error);
    }
  };

  readonly #pointerUp = (event: PointerEvent): void => {
    if (this.#pointerId !== event.pointerId) return;
    try {
      const click = event.type === "pointerup" && this.#button === 0 && !this.#dragging
        && !this.#disposed && !this.#options.blocked();
      const captureError = this.#clearGesture();
      if (captureError !== null) {
        this.#report(captureError);
        return;
      }
      if (!click) return;
      const snapshot = this.#options.snapshot();
      const point = this.#options.projectGround(event);
      if (snapshot === null || point === null) return;
      const command = pointToGotoCommand(snapshot, point);
      if (command !== null) this.#submit(command);
    } catch (error) {
      this.#failGesture(error);
    }
  };

  readonly #wheel = (event: WheelEvent): void => {
    if (this.#disposed) return;
    try {
      if (this.#options.blocked()) return;
      event.preventDefault();
      this.#options.zoom?.(event.deltaY);
    } catch (error) {
      this.#failGesture(error);
    }
  };

  readonly #keyDown = (event: KeyboardEvent): void => {
    if (this.#disposed) return;
    try {
      if (this.#options.blocked() || event.key !== "Escape") return;
      event.preventDefault();
      this.#submit(Object.freeze({ kind: "withdraw" as const }));
    } catch (error) {
      this.#failGesture(error);
    }
  };

  readonly #contextMenu = (event: Event): void => {
    if (!this.#disposed) event.preventDefault();
  };

  #submit(command: LegacyClientCommand): void {
    void this.#options.submit(command).catch((error: unknown) => {
      this.#report(error);
    });
  }

  #clearGesture(): unknown | null {
    const pointerId = this.#pointerId;
    this.#pointerId = null;
    this.#button = -1;
    this.#dragging = false;
    if (pointerId === null) return null;
    try {
      if (this.#options.canvas.hasPointerCapture(pointerId)) {
        this.#options.canvas.releasePointerCapture(pointerId);
      }
      return null;
    } catch (error) {
      return error;
    }
  }

  #failGesture(error: unknown): void {
    const captureError = this.#clearGesture();
    this.#report(error);
    if (captureError !== null) this.#report(captureError);
  }

  #report(error: unknown): void {
    this.#options.onError?.(error instanceof Error ? error : new Error(String(error)));
  }
}

export function createBabylonGroundProjector(
  scene: Scene,
  camera: Camera,
  canvas: HTMLCanvasElement,
): (event: PointerEvent) => GroundPoint | null {
  const ground = new Plane(0, 1, 0, 0);
  return (event) => {
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    // Babylon applies its hardware scaling level inside createPickingRay. It
    // expects CSS-space pointer coordinates, not backing-buffer coordinates.
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const ray = scene.createPickingRay(x, y, Matrix.Identity(), camera, false);
    const distance = ray.intersectsPlane(ground);
    if (distance === null || distance < 0) return null;
    const point = ray.origin.add(ray.direction.scale(distance));
    return Object.freeze({ x: point.x, z: point.z });
  };
}
