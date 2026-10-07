import { Camera } from "@babylonjs/core/Cameras/camera.js";
import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Vector3, type Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { CHASE_BETA, easeAngle, facingOf, ISO_ALPHA, ISO_BETA, orthoExtents, VIEW_CAMERA } from "../render/camera-math.ts";
import { ORBIT, orbitPosition } from "./orbit.ts";
import type { ArenaView } from "./view.ts";
import type { Side } from "../core/spec/body.ts";

interface Subject {
  readonly position: Vector3;
  readonly rotation: Quaternion;
  readonly rest: Quaternion;
}
export type ArenaSubjects = Readonly<Record<Side, Subject>>;

/** Arena pointer sensitivity and overview framing (docs/reference/look.md#arena-camera). */
const CAMERA_INPUT = Object.freeze({ turn: .006, pitch: .004, zoom: .001, overviewPitch: .78, overviewDistance: 39, overviewWidth: 31 });

/** An Arena camera reads poses only; it has no physics or playback handles. */
export function arenaCameraRig(camera: FreeCamera, initial: ArenaView) {
  const state = {
    view: initial, azimuth: ORBIT.azimuth as number, pitch: ORBIT.pitch as number, distance: ORBIT.distance as number,
    free: { azimuth: ORBIT.azimuth as number, pitch: ORBIT.pitch as number },
    facing: { left: { x: 0, z: 1 }, right: { x: 0, z: 1 } }, following: false,
  };
  const target = new Vector3(0, VIEW_CAMERA.lookHeight, 0), wanted = new Vector3();
  return {
    choose(view: ArenaView) {
      if (view.camera === "free" && state.view.camera !== "free") {
        state.azimuth = state.free.azimuth; state.pitch = state.free.pitch;
      }
      state.view = view;
    },
    reset() { state.following = false; state.facing = { left: { x: 0, z: 1 }, right: { x: 0, z: 1 } }; },
    orbit(dx: number, dy: number) {
      if (state.view.camera !== "free") return;
      state.azimuth += dx * CAMERA_INPUT.turn;
      state.pitch = Math.min(ORBIT.highest, Math.max(ORBIT.lowest, state.pitch + dy * CAMERA_INPUT.pitch));
      state.free.azimuth = state.azimuth; state.free.pitch = state.pitch;
    },
    zoom(delta: number) {
      state.distance = Math.min(ORBIT.farthest, Math.max(ORBIT.nearest, state.distance * Math.exp(delta * CAMERA_INPUT.zoom)));
    },
    /** The actual horizontal view direction, including Isometric and Chase, for orders and audio. */
    get azimuth() { return Math.atan2(target.x - camera.position.x, target.z - camera.position.z); },
    frame(screen: "setup" | "fight", subjects: ArenaSubjects | null, dt: number, aspect: number) {
      if (screen === "setup") {
        target.set(0, 0, 0); camera.mode = Camera.PERSPECTIVE_CAMERA;
        camera.position.set(...orbitPosition(target, 0, CAMERA_INPUT.overviewPitch, Math.max(CAMERA_INPUT.overviewDistance, CAMERA_INPUT.overviewWidth / aspect)));
        camera.setTarget(target); state.following = false; return;
      }
      if (!subjects) return;
      const focus = state.view.focus, selected = focus === "both" ? null : subjects[focus];
      const a = subjects.left.position, b = subjects.right.position;
      wanted.set(selected?.position.x ?? (a.x + b.x) / 2, VIEW_CAMERA.lookHeight, selected?.position.z ?? (a.z + b.z) / 2);
      if (!state.following) { target.copyFrom(wanted); state.following = true; }
      else Vector3.LerpToRef(target, wanted, VIEW_CAMERA.follow, target);
      const approach = 1 - Math.exp(-dt / VIEW_CAMERA.turnSeconds);
      switch (state.view.camera) {
        case "free": break;
        case "isometric":
          state.azimuth = easeAngle(state.azimuth, -Math.PI / 2 - ISO_ALPHA, dt, VIEW_CAMERA.turnSeconds);
          state.pitch += (Math.PI / 2 - ISO_BETA - state.pitch) * approach;
          break;
        case "chase": {
          if (focus === "both" || !selected) throw new Error("Chase requires one fighter");
          const facing = state.facing[focus] = facingOf(selected.rotation, selected.rest, state.facing[focus]);
          state.azimuth = easeAngle(state.azimuth, Math.atan2(facing.x, facing.z), dt, VIEW_CAMERA.turnSeconds);
          state.pitch += (Math.PI / 2 - CHASE_BETA - state.pitch) * approach;
          break;
        }
        default: { const never: never = state.view.camera; throw new Error(`no camera ${never}`); }
      }
      camera.position.set(...orbitPosition(target, state.azimuth, state.pitch, state.distance)); camera.setTarget(target);
      const flat = state.view.camera === "isometric" && state.view.projection === "orthographic";
      camera.mode = flat ? Camera.ORTHOGRAPHIC_CAMERA : Camera.PERSPECTIVE_CAMERA;
      if (flat) {
        const e = orthoExtents(state.distance, camera.fov, aspect);
        camera.orthoTop = e.top; camera.orthoBottom = e.bottom; camera.orthoLeft = e.left; camera.orthoRight = e.right;
      }
    },
  };
}
