import type { Scene } from "@babylonjs/core/scene.js";
import { Camera } from "@babylonjs/core/Cameras/camera.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

export type ArenaBounds = Readonly<{ width: number; height: number }>;
export type OrthographicBounds = Readonly<{ left: number; right: number; top: number; bottom: number }>;
export type CameraPan = Readonly<{ x: number; y: number }>;

export const MIN_CAMERA_ZOOM = 0.5;
export const MAX_CAMERA_ZOOM = 4;

const positive = (label: string, value: number): number => {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be finite and positive`);
  return value;
};

export function fixedIsometricBounds(arena: ArenaBounds, aspect: number, zoom = 1): OrthographicBounds {
  const width = positive("arena width", arena.width);
  const height = positive("arena height", arena.height);
  const ratio = positive("camera aspect", aspect);
  const scale = clampCameraZoom(zoom);
  const vertical = (width + height) / (2 * scale);
  const horizontal = vertical * ratio;
  return Object.freeze({ left: -horizontal, right: horizontal, top: vertical, bottom: -vertical });
}

export function clampCameraZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) throw new RangeError("camera zoom must be finite");
  return Math.min(MAX_CAMERA_ZOOM, Math.max(MIN_CAMERA_ZOOM, zoom));
}

export function clampCameraPan(arena: ArenaBounds, pan: CameraPan): CameraPan {
  const width = positive("arena width", arena.width);
  const height = positive("arena height", arena.height);
  if (!Number.isFinite(pan.x) || !Number.isFinite(pan.y)) throw new RangeError("camera pan must be finite");
  return Object.freeze({
    x: Math.min(width, Math.max(0, pan.x)),
    y: Math.min(height, Math.max(0, pan.y)),
  });
}

export function centredCameraPan(arena: ArenaBounds): CameraPan {
  return clampCameraPan(arena, { x: arena.width / 2, y: arena.height / 2 });
}

export function applyOrthographicBounds(camera: FreeCamera, bounds: OrthographicBounds): void {
  camera.orthoLeft = bounds.left;
  camera.orthoRight = bounds.right;
  camera.orthoTop = bounds.top;
  camera.orthoBottom = bounds.bottom;
}

export function createFixedIsometricCamera(
  scene: Scene,
  arena: ArenaBounds,
  aspect: number,
  zoom = 1,
): FreeCamera {
  const centre = new Vector3(arena.width / 2, 0, arena.height / 2);
  const distance = Math.max(arena.width, arena.height);
  const camera = new FreeCamera("greybox-isometric-camera",
    new Vector3(centre.x - distance, distance, centre.z - distance), scene);
  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  camera.setTarget(centre);
  applyOrthographicBounds(camera, fixedIsometricBounds(arena, aspect, zoom));
  return camera;
}
