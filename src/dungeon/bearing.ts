import type { Point } from "./map.ts";
import { cos, sin } from "../core/math/real.ts";

/** The camera's elevation above the ground plane, rad: 30 degrees, where the concept art looks down at about 40 to
 * 45 and the reference chamber's own camera at 42 (`REFERENCE_CAMERA`). Which the crypt takes is the owner's to
 * choose; the page takes `?pitch=` in degrees to compare others. */
export const CAMERA_PITCH = Math.PI / 6;

/** Which way the camera stands from the hero, as a bearing on the ground: `cameraToward` of it is the unit step from
 * the hero toward the camera. Pi stands it at -z, so walls run across and up the screen, screen right is +x and screen
 * up is +z: WASD walks along a corridor on one key. At 0 the camera would stand at +z and screen right would be -x,
 * Babylon being left-handed. The page takes `?azimuth=` in degrees to compare others. */
export const CAMERA_AZIMUTH = Math.PI;

/** The unit step on the ground from the hero toward a camera at `azimuth`. */
export const cameraToward = (azimuth: number): Point => ({ x: sin(azimuth), z: cos(azimuth) });
