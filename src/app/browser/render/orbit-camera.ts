import { Camera } from "@babylonjs/core/Cameras/camera.js";
import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Puppet } from "./puppet.ts";
import type { ViewSettings } from "../../../game/appearance/view.ts";
import { CHASE_BETA, followCameraAngles, ISO_ALPHA, ISO_BETA, orthoExtents, SIDE_BETA, sideFrame, VIEW_CAMERA, type CameraFacing, type CameraSpan } from "./camera-math.ts";

/** Orbit angles, distance and pointer sensitivity, set by eye. Distances scale with the opening frame. */
const ORBIT = Object.freeze({ azimuth: 0, pitch: .32, distance: 7, nearest: 2.5, farthest: 16,
  lowest: .05, highest: 1.35, turn: .006, tilt: .004 });

export interface CameraSubject extends CameraFacing {
  readonly position: Vector3;
}

/** A puppet's root pose, relative to the body's authored forward direction, for a following camera. */
export function cameraSubject(puppet: Puppet, position: Vector3): CameraSubject {
  const root = [...puppet.segments.values()].find(segment => !puppet.spec.joints.some(joint => joint.child === segment.spec.name))!;
  return { position, get rotation() { return root.node.rotationQuaternion!; },
    rest: Quaternion.RotationQuaternionFromAxis(Vector3.FromArray(root.frame.x), Vector3.FromArray(root.frame.y), Vector3.FromArray(root.frame.z)) };
}

/** Where an orbit camera stands, looking along `azimuth` from `distance` away. */
export function orbitPosition(target: { readonly x: number; readonly y: number; readonly z: number },
  azimuth: number, pitch: number, distance: number): [number, number, number] {
  const along = Math.cos(pitch) * distance;
  return [target.x - Math.sin(azimuth) * along, target.y + Math.sin(pitch) * distance, target.z - Math.cos(azimuth) * along];
}

/**
 * Free, Isometric, Chase and Side share one pose-driven camera; a screen supplies its focus and
 * opening scale. The wheel's zoom is the camera's distance, but in Side it is a factor: Side stands
 * where it holds what it is given in the frame (`sideFrame`), and the zoom multiplies that.
 */
export function orbitCamera(camera: FreeCamera, initial: ViewSettings, framing: { readonly extent?: number } = {}) {
  const distance = framing.extent === undefined ? ORBIT.distance : framing.extent / Math.tan(camera.fov / 2);
  const scale = distance / ORBIT.distance;
  const held = { free: null, isometric: ISO_BETA, chase: CHASE_BETA, side: SIDE_BETA }[initial.camera];
  const state = {
    view: initial, distance,
    /** Where the camera stands now, which follows what its mode asks for: how far back, and how far over the point followed it looks. */
    shown: { distance, lift: 0 },
    azimuth: initial.camera === "isometric" ? -Math.PI / 2 - ISO_ALPHA : ORBIT.azimuth as number,
    pitch: held === null ? ORBIT.pitch as number : Math.PI / 2 - held,
    free: { azimuth: ORBIT.azimuth as number, pitch: ORBIT.pitch as number },
    facing: { x: 0, z: 1 }, following: false,
  };
  const target = new Vector3(), look = new Vector3();
  return {
    choose(view: ViewSettings) {
      if (view.camera === "free" && state.view.camera !== "free") {
        state.azimuth = state.free.azimuth; state.pitch = state.free.pitch;
      }
      state.view = view;
    },
    reset() { state.following = false; state.facing = { x: 0, z: 1 }; },
    orbit(dx: number, dy: number) {
      if (state.view.camera !== "free") return;
      state.azimuth += dx * ORBIT.turn;
      state.pitch = Math.min(ORBIT.highest, Math.max(ORBIT.lowest, state.pitch + dy * ORBIT.tilt));
      state.free.azimuth = state.azimuth; state.free.pitch = state.pitch;
    },
    /** Multiply the camera's distance by `factor`, kept between its nearest and its farthest. */
    zoom(factor: number) {
      const zoomed = Math.min(ORBIT.farthest * scale, Math.max(ORBIT.nearest * scale, state.distance * factor));
      state.shown.distance *= zoomed / state.distance; state.shown.lift *= zoomed / state.distance; state.distance = zoomed;
    },
    get azimuth() { return Math.atan2(look.x - camera.position.x, look.z - camera.position.z); },
    get pitch() { return state.pitch; },
    get extent() { return state.shown.distance * Math.tan(camera.fov / 2); },
    /** Look at `wanted`, following `subject`'s facing where there is one; `span` is the line Side stands beside. */
    frame(wanted: Vector3, subject: CameraSubject | null, dt: number, aspect: number, span: CameraSpan | null = null) {
      const side = state.view.camera === "side" ? sideFrame(span, camera.fov, aspect) : null, zoom = state.distance / distance;
      const asked = side ? { distance: side.distance * zoom, lift: side.lift * zoom } : { distance: state.distance, lift: 0 };
      if (!state.following) { target.copyFrom(wanted); state.shown = asked; state.following = true; }
      else {
        const approach = 1 - Math.exp(-dt / VIEW_CAMERA.turnSeconds);
        Vector3.LerpToRef(target, wanted, VIEW_CAMERA.follow, target);
        state.shown.distance += (asked.distance - state.shown.distance) * approach; state.shown.lift += (asked.lift - state.shown.lift) * approach;
      }
      followCameraAngles(state.view.camera, state, subject, dt, span);
      look.set(target.x, target.y + state.shown.lift, target.z);
      camera.position.set(...orbitPosition(look, state.azimuth, state.pitch, state.shown.distance)); camera.setTarget(look);
      const flat = state.view.camera === "isometric" && state.view.projection === "orthographic";
      camera.mode = flat ? Camera.ORTHOGRAPHIC_CAMERA : Camera.PERSPECTIVE_CAMERA;
      if (flat) {
        const extents = orthoExtents(state.shown.distance, camera.fov, aspect);
        camera.orthoTop = extents.top; camera.orthoBottom = extents.bottom; camera.orthoLeft = extents.left; camera.orthoRight = extents.right;
      }
    },
  };
}
