import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import type { Point } from "./map.ts";

export function frameDungeon(camera: FreeCamera, hero: Point, zoom: number, aspect: number): void {
  camera.position.set(hero.x + 20, 1 + Math.sqrt(800) * Math.tan(Math.PI / 6), hero.z + 20);
  camera.setTarget(new Vector3(hero.x, 1, hero.z));
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
