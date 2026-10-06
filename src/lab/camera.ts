import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { Camera } from "@babylonjs/core/Cameras/camera.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { CameraMode, Projection } from "../render/view.ts";
import { behind, CHASE_BETA, easeAngle, facingOf, ISO_ALPHA, ISO_BETA, orthoExtents, VIEW_CAMERA } from "../render/camera-math.ts";

/**
 * **How the lab's camera follows the body.** One orbit camera, in one of three ways:
 *
 * - **Free**: the pointer orbits, pans and zooms, and the target follows the pelvis softly.
 * - **Isometric**: the classic isometric angle -- a quarter turn off the axes, looking down at
 *   atan(1/sqrt 2), about 35.3 deg -- held, following the pelvis. Orthographic draws it flat, as
 *   isometric art is drawn; Perspective draws the same view in depth.
 * - **Chase**: behind the body's facing, a little above it, turning after it.
 *
 * In Isometric and Chase the pointer does not turn or pan the camera; the wheel zooms in all three.
 * The body is read from the pelvis node's position and rotation, never a world matrix, whose cache
 * the first reader in a frame freezes; and a replay, which poses the nodes, is followed like the
 * live body.
 */

interface LabCameraRig {
  choose(camera: CameraMode, projection: Projection): void;
  /** Follow a pelvis at `position`, turned `rotation`; `rest` is its rotation facing +z. */
  follow(position: Vector3, rotation: Quaternion, rest: Quaternion, dt: number, aspect: number): void;
}

export function labCameraRig(camera: ArcRotateCamera): LabCameraRig {
  const free = { x: camera.angularSensibilityX, y: camera.angularSensibilityY, pan: camera.panningSensibility };
  let mode: CameraMode = "free", projection: Projection = "orthographic";
  let facing = { x: 0, z: 1 };
  const target = new Vector3();
  return {
    choose(to, drawn) {
      mode = to;
      projection = drawn;
      // Held, the pointer neither turns nor pans; the wheel still zooms.
      const held = mode !== "free";
      camera.angularSensibilityX = held ? Infinity : free.x;
      camera.angularSensibilityY = held ? Infinity : free.y;
      camera.panningSensibility = held ? 0 : free.pan;
    },
    follow(position, rotation, rest, dt, aspect) {
      target.set(position.x, VIEW_CAMERA.lookHeight, position.z);
      camera.target = Vector3.Lerp(camera.target, target, VIEW_CAMERA.follow);
      const approach = 1 - Math.exp(-dt / VIEW_CAMERA.turnSeconds);
      switch (mode) {
        case "free": break;
        case "isometric":
          camera.alpha = easeAngle(camera.alpha, ISO_ALPHA, dt, VIEW_CAMERA.turnSeconds);
          camera.beta += (ISO_BETA - camera.beta) * approach;
          break;
        case "chase":
          facing = facingOf(rotation, rest, facing);
          camera.alpha = easeAngle(camera.alpha, behind(facing), dt, VIEW_CAMERA.turnSeconds);
          camera.beta += (CHASE_BETA - camera.beta) * approach;
          break;
        default: { const never: never = mode; throw new Error(`no camera ${String(never)}`); }
      }
      const flat = mode === "isometric" && projection === "orthographic";
      camera.mode = flat ? Camera.ORTHOGRAPHIC_CAMERA : Camera.PERSPECTIVE_CAMERA;
      if (flat) {
        const e = orthoExtents(camera.radius, camera.fov, aspect);
        camera.orthoTop = e.top; camera.orthoBottom = e.bottom; camera.orthoLeft = e.left; camera.orthoRight = e.right;
      }
    },
  };
}
