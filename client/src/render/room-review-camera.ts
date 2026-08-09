import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import type { Camera } from "@babylonjs/core/Cameras/camera.js";
import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import {
  clampCameraPan, clampCameraZoom, createFixedIsometricCamera,
  type ArenaBounds, type CameraPan,
} from "./camera.js";

const FREE_ALPHA = -Math.PI / 4;
const FREE_BETA = Math.PI / 3;

export type RoomReviewCamera = Readonly<{
  readonly camera: Camera;
  readonly free: boolean;
  resetFixed(): void;
  setFree(free: boolean): void;
  pan(dxPixels: number, dyPixels: number): void;
  zoom(delta: number): void;
  resize(): void;
  dispose(): void;
}>;

export type RoomReviewCameraOptions = Readonly<{ initialFixedZoom?: number }>;

export function createRoomReviewCamera(
  scene: Scene, canvas: HTMLCanvasElement, bounds: ArenaBounds, options: RoomReviewCameraOptions = {},
): RoomReviewCamera {
  if (!Number.isFinite(bounds.width) || bounds.width <= 0 ||
      !Number.isFinite(bounds.height) || bounds.height <= 0) {
    throw new RangeError("room review bounds must be finite and positive");
  }
  const centre = new Vector3(bounds.width / 2, 0, bounds.height / 2);
  const initialFixedZoom = clampCameraZoom(options.initialFixedZoom ?? 1);
  const minimumRadius = Math.max(4, Math.min(bounds.width, bounds.height) / 4);
  const maximumRadius = Math.max(bounds.width, bounds.height) * 2;
  const fixedRadius = Math.max(bounds.width, bounds.height) * 1.15;
  let pan: CameraPan = Object.freeze({ x: centre.x, y: centre.z });
  let fixedZoom = initialFixedZoom;
  let fixed: FreeCamera;
  let free = false;
  let disposed = false;

  const aspect = (): number => Math.max(1, canvas.clientWidth) / Math.max(1, canvas.clientHeight);
  const createFixed = (): FreeCamera => {
    const camera = createFixedIsometricCamera(scene, bounds, aspect(), fixedZoom);
    const target = new Vector3(pan.x, 0, pan.y);
    camera.position.addInPlace(target.subtract(centre));
    camera.setTarget(target);
    return camera;
  };
  fixed = createFixed();

  const orbit = new ArcRotateCamera("room-review-free-camera", FREE_ALPHA, FREE_BETA,
    fixedRadius, centre.clone(), scene);
  orbit.lowerAlphaLimit = -Math.PI * 2;
  orbit.upperAlphaLimit = Math.PI * 2;
  orbit.lowerBetaLimit = 0.2;
  orbit.upperBetaLimit = Math.PI / 2 - 0.05;
  orbit.lowerRadiusLimit = minimumRadius;
  orbit.upperRadiusLimit = maximumRadius;
  const clampOrbit = (): void => {
    orbit.alpha = Math.min(orbit.upperAlphaLimit ?? Math.PI * 2,
      Math.max(orbit.lowerAlphaLimit ?? -Math.PI * 2, orbit.alpha));
    orbit.beta = Math.min(orbit.upperBetaLimit ?? Math.PI / 2,
      Math.max(orbit.lowerBetaLimit ?? 0, orbit.beta));
    orbit.radius = Math.min(maximumRadius, Math.max(minimumRadius, orbit.radius));
    orbit.target.x = Math.min(bounds.width, Math.max(0, orbit.target.x));
    orbit.target.y = 0;
    orbit.target.z = Math.min(bounds.height, Math.max(0, orbit.target.z));
  };
  const observer = orbit.onViewMatrixChangedObservable.add(clampOrbit);

  const replaceFixed = (): void => {
    const previous = fixed;
    fixed = createFixed();
    if (!free) scene.activeCamera = fixed;
    previous.dispose();
  };
  const resetFixed = (): void => {
    if (disposed) return;
    orbit.detachControl();
    free = false;
    pan = Object.freeze({ x: centre.x, y: centre.z });
    fixedZoom = initialFixedZoom;
    orbit.alpha = FREE_ALPHA;
    orbit.beta = FREE_BETA;
    orbit.radius = fixedRadius;
    orbit.setTarget(centre);
    clampOrbit();
    replaceFixed();
  };
  const setFree = (enabled: boolean): void => {
    if (disposed || enabled === free) return;
    if (!enabled) { resetFixed(); return; }
    free = true;
    scene.activeCamera = orbit;
    orbit.attachControl(canvas, true);
  };
  scene.activeCamera = fixed;

  return Object.freeze({
    get camera(): Camera { return free ? orbit : fixed; },
    get free() { return free; },
    resetFixed,
    setFree,
    pan(dxPixels: number, dyPixels: number): void {
      if (disposed || free || !Number.isFinite(dxPixels) || !Number.isFinite(dyPixels)) return;
      const scale = Math.max(bounds.width, bounds.height) / Math.max(1, canvas.clientHeight);
      const screenRight = fixed.getDirection(Vector3.Right());
      const screenUp = fixed.getDirection(Vector3.Up());
      const rightLength = Math.hypot(screenRight.x, screenRight.z) || 1;
      const upLength = Math.hypot(screenUp.x, screenUp.z) || 1;
      pan = clampCameraPan(bounds, {
        x: pan.x + (-dxPixels * screenRight.x / rightLength + dyPixels * screenUp.x / upLength) * scale / fixedZoom,
        y: pan.y + (-dxPixels * screenRight.z / rightLength + dyPixels * screenUp.z / upLength) * scale / fixedZoom,
      });
      replaceFixed();
    },
    zoom(delta: number): void {
      if (disposed || free || !Number.isFinite(delta)) return;
      fixedZoom = clampCameraZoom(fixedZoom * Math.exp(-delta * 0.001));
      replaceFixed();
    },
    resize(): void { if (!disposed && !free) replaceFixed(); },
    dispose(): void {
      if (disposed) return;
      orbit.detachControl();
      if (observer !== null) orbit.onViewMatrixChangedObservable.remove(observer);
      orbit.dispose();
      fixed.dispose();
      disposed = true;
      free = false;
    },
  });
}
