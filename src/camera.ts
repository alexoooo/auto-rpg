/**
 * Project a body's forward axis onto the arena floor.
 *
 * A living pelvis is upright, but the same camera keeps following it after a
 * verdict and a released pelvis can lie on its side. Feeding its vertical axis
 * to the chase camera collapses distance and look-ahead into height. Keep the
 * last horizontal bearing when the projection is too small to name one.
 */
export function horizontalForward(
  x: number,
  z: number,
  fallbackX: number,
  fallbackZ: number,
): { x: number; z: number } {
  const length = Math.hypot(x, z);
  if (length > 1e-6) return { x: x / length, z: z / length };
  const fallbackLength = Math.hypot(fallbackX, fallbackZ);
  if (fallbackLength > 1e-6) {
    return { x: fallbackX / fallbackLength, z: fallbackZ / fallbackLength };
  }
  return { x: 0, z: 1 };
}

export interface CameraGestureState {
  mode: "none" | "orbit" | "pan";
  pointerId: number | null;
  yaw: number;
  pitch: number;
  panX: number;
  panZ: number;
  /**
   * Camera zoom factor, multiplied into the camera's distance and height.
   *
   * Here rather than on the combat command, which is where it lived until
   * session 15. It sat there only because `Intent` was an alias for the human's
   * `InputState` and a person's controller has a wheel on it -- so every policy
   * carried a camera factor it could not see the effect of, and every harness
   * that swept a command's numbers swept one dimension of nothing. A fighter
   * never read it. The wheel is a gesture, and it belongs beside the drag that
   * orbits and the drag that pans.
   */
  zoom: number;
}

/** How far the wheel is allowed to wind, in notches, either way from centre. */
export const CAMERA_ZOOM_NOTCHES = 18;

/** The three numbers the wheel is folded through, as `CONFIG.camera` supplies them. */
export interface CameraZoomTuning {
  zoomStep: number;
  zoomMin: number;
  zoomMax: number;
  zoomResponse: number;
}

/**
 * Fold the wheel's notch count into the host's zoom factor, once per frame.
 *
 * Exponential in the notches so a notch is the same *proportion* of the distance
 * wherever you are in the band, then clamped, then approached at
 * `zoomResponse` -- the wheel sets a target and the camera walks to it, because
 * a wheel event is a step and a step applied straight to the framing reads as a
 * jerk. `CAMERA_ZOOM_NOTCHES` is wide enough that both clamps are actually
 * reachable, which is a property `tests/arena.test.mjs` pins rather than assumes:
 * a notch limit tighter than the band would make one of the two ends of the
 * config a number nobody can get to.
 *
 * It is here, taking the state it writes, rather than inline in `Controls.sample`
 * where it used to be, because `input.ts` cannot be loaded by Node -- it is the
 * DOM side of the tree and does not carry `.ts` extensions on its imports -- and
 * a camera behaviour nothing can step is a camera behaviour nobody can show
 * failing. The same reason puts `orbitFraming` below beside it.
 */
export function slewCameraZoom(
  camera: CameraGestureState,
  notches: number,
  dt: number,
  tuning: Readonly<CameraZoomTuning>,
): number {
  const target = Math.exp(notches * tuning.zoomStep);
  const wanted = target < tuning.zoomMin ? tuning.zoomMin : target > tuning.zoomMax ? tuning.zoomMax : target;
  camera.zoom += (wanted - camera.zoom) * (1 - Math.exp(-tuning.zoomResponse * dt));
  return camera.zoom;
}

/**
 * Where the chase camera sits on its own sight line, given the gesture state.
 *
 * Zoom scales distance and height together, so the camera slides along that line
 * and the angle you read the arena at never changes; the pitch of an orbit drag
 * is what rotates it. Both come out of one function so that the order they are
 * applied in is written down once -- and, more to the point, so that a test can
 * watch the zoom actually reach the framing, which is the half of this that
 * `main.ts` cannot demonstrate about itself because Node cannot load it.
 *
 * There is exactly one production caller (`main.ts`'s `placeCamera`). The
 * occlusion sweep in `tests/arena.test.mjs` builds its own camera positions from
 * `preset.distance * zoom` and deliberately does not come through here: it is
 * standing up synthetic viewpoints for a visibility question, not framing a shot,
 * and pitch does not enter it.
 */
/**
 * Where a framed shot sits, as a distance back and a height up.
 *
 * Returned through a caller-owned record because `placeCamera` runs once per
 * rendered frame, and this file is reached from the hot path.
 */
export interface OrbitFraming { distance: number; height: number }

export function orbitFraming(
  camera: CameraGestureState,
  distance: number,
  height: number,
  into: OrbitFraming = { distance: 0, height: 0 },
): OrbitFraming {
  into.distance = distance * Math.cos(camera.pitch) * camera.zoom;
  into.height = (height + Math.sin(camera.pitch) * distance) * camera.zoom;
  return into;
}

export const wrapCameraYaw = (yaw: number): number => {
  const turn = Math.PI * 2;
  return ((yaw + Math.PI) % turn + turn) % turn - Math.PI;
};

export function dragCamera(
  state: CameraGestureState,
  dx: number,
  dy: number,
  sensitivity: number,
  panLimit: number,
): CameraGestureState {
  if (state.mode === "none") return { ...state };
  if (state.mode === "orbit") {
    return {
      ...state,
      yaw: wrapCameraYaw(state.yaw - dx * sensitivity),
      pitch: Math.max(-0.65, Math.min(0.65, state.pitch - dy * sensitivity)),
    };
  }
  return {
    ...state,
    panX: Math.max(-panLimit, Math.min(panLimit, state.panX - dx * sensitivity * 4)),
    panZ: Math.max(-panLimit, Math.min(panLimit, state.panZ - dy * sensitivity * 4)),
  };
}
