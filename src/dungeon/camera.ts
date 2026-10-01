import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import type { Point } from "./map.ts";

/** The camera's elevation above the ground plane, rad: 30 degrees, where the concept art looks down at about 40 to
 * 45 and the reference chamber's own camera at 42 (`REFERENCE_CAMERA`). Which the crypt takes is the owner's to
 * choose (`docs/reference/look.md#crypt-camera`); the page takes `?pitch=` in degrees to compare others. */
export const CAMERA_PITCH = Math.PI / 6;

/** How far across the ground the camera stands from the point it looks at, m, and that point's height above the
 * floor under the hero, m (`docs/reference/look.md#crypt-camera`). The camera is orthographic, so the distance
 * sets what is clipped and not how large anything is drawn. */
const CAMERA = Object.freeze({ ground: Math.sqrt(800), height: 1 });

/** Which way the camera stands from the hero, as a bearing on the ground: `cameraToward` of it is the unit step from
 * the hero toward the camera. Pi stands it at -z, so walls run across and up the screen, screen right is +x and screen
 * up is +z: WASD walks along a corridor on one key. At 0 the camera would stand at +z and screen right would be -x,
 * Babylon being left-handed. The page takes `?azimuth=` in degrees to compare others. */
export const CAMERA_AZIMUTH = Math.PI;

/** The unit step on the ground from the hero toward a camera at `azimuth`. */
export const cameraToward = (azimuth: number): Point => ({ x: Math.sin(azimuth), z: Math.cos(azimuth) });

/** How far the camera stands from the point it looks at: `CAMERA.ground` across the ground. */
export const cameraDistance = (pitch: number): number => CAMERA.ground / Math.cos(pitch);

export function frameDungeon(camera: FreeCamera, hero: Point, zoom: number, aspect: number, pitch = CAMERA_PITCH,
  azimuth = CAMERA_AZIMUTH): void {
  const toward = cameraToward(azimuth), ground = CAMERA.ground;
  camera.position.set(hero.x + toward.x * ground, CAMERA.height + ground * Math.tan(pitch), hero.z + toward.z * ground);
  camera.setTarget(new Vector3(hero.x, CAMERA.height, hero.z));
  camera.orthoLeft = -zoom * aspect; camera.orthoRight = zoom * aspect;
  camera.orthoTop = zoom; camera.orthoBottom = -zoom;
}

/** Babylon scales picking inputs itself. Passing physical pixels scales a HiDPI pointer twice. */
export function pickingCoordinates(clientX: number, clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  renderWidth: number, renderHeight: number, hardwareScaling: number): { x: number; y: number } {
  return { x: (clientX - rect.left) * renderWidth * hardwareScaling / rect.width,
    y: (clientY - rect.top) * renderHeight * hardwareScaling / rect.height };
}
