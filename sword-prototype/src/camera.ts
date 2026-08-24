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
