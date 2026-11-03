import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import type { Point } from "./map.ts";
import { cos, tan } from "../core/math/real.ts";
import { CAMERA_AZIMUTH, CAMERA_PITCH, cameraToward } from "./bearing.ts";

/** How far across the ground the camera stands from the point it looks at, m, and that point's height above the
 * floor under the hero, m (`docs/reference/look.md#crypt-camera`). The camera is orthographic, so the distance
 * sets what is clipped and not how large anything is drawn. */
const CAMERA = Object.freeze({ ground: Math.sqrt(800), height: 1 });

/** How far the camera stands from the point it looks at: `CAMERA.ground` across the ground. */
export const cameraDistance = (pitch: number): number => CAMERA.ground / cos(pitch);

export function frameDungeon(camera: FreeCamera, hero: Point, zoom: number, aspect: number, pitch = CAMERA_PITCH,
  azimuth = CAMERA_AZIMUTH): void {
  const toward = cameraToward(azimuth), ground = CAMERA.ground;
  camera.position.set(hero.x + toward.x * ground, CAMERA.height + ground * tan(pitch), hero.z + toward.z * ground);
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
