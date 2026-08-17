import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import type { Camera } from "@babylonjs/core/Cameras/camera.js";
import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import {
  clampCameraPan, clampCameraZoom, createFixedIsometricCamera,
  type ArenaBounds, type CameraPan,
} from "./camera.js";

const FREE_ALPHA = -Math.PI / 4;
const FREE_BETA = Math.PI / 3;

// The playable `#/game` starting zoom. The worker's dungeon is 68 x 45 tiles,
// so `fixedIsometricBounds` reads (68 + 45) / zoom tiles of vertical view:
// ten shows 11.3 of them -- close enough to read the hero's swing with a
// room's worth of floor around it -- where the default of one showed 113 for a
// 45-tile map, roughly 2.5x over-framed. Only the ordinary game route passes
// this; the stress and compact-review fixtures keep their own committed zooms
// so recorded captures stay comparable.
export const GAME_INITIAL_FIXED_ZOOM = 10;

// The hero may roam this fraction of each orthographic half-extent, measured
// along the camera's screen axes on the ground plane, before the fixed camera
// pans -- and the pan restores exactly the excess, so the camera moves at the
// hero's own speed once the hero rides the zone edge, which keeps the follow
// frame-rate independent where a per-frame easing fraction would not be. At
// 0.35 the hero reaches about a third of the way toward a screen edge before
// the camera responds: enough to read intent without letting the hero near
// the edge of the view.
export const FOLLOW_DEAD_ZONE_FRACTION = 0.35;

export type RoomReviewCamera = Readonly<{
  readonly camera: Camera;
  readonly free: boolean;
  resetFixed(): void;
  setFree(free: boolean): void;
  pan(dxPixels: number, dyPixels: number): void;
  zoom(delta: number): void;
  follow?(x: number, z: number): void;
  resize(): void;
  dispose(): void;
}>;

export type RoomReviewCameraOptions = Readonly<{ initialFixedZoom?: number; followHero?: boolean }>;

export function createRoomReviewCamera(
  scene: Scene, canvas: HTMLCanvasElement, bounds: ArenaBounds, options: RoomReviewCameraOptions = {},
): RoomReviewCamera {
  if (!Number.isFinite(bounds.width) || bounds.width <= 0 ||
      !Number.isFinite(bounds.height) || bounds.height <= 0) {
    throw new RangeError("room review bounds must be finite and positive");
  }
  const centre = new Vector3(bounds.width / 2, 0, bounds.height / 2);
  const initialFixedZoom = clampCameraZoom(options.initialFixedZoom ?? 1);
  const minimumRadius = Math.max(4, Math.min(bounds.width, bounds.height) / 4);
  const maximumRadius = Math.max(bounds.width, bounds.height) * 2;
  const fixedRadius = Math.max(bounds.width, bounds.height) * 1.15;
  let pan: CameraPan = Object.freeze({ x: centre.x, y: centre.z });
  let fixedZoom = initialFixedZoom;
  let fixed: FreeCamera;
  let free = false;
  let disposed = false;
  // A drag hands the view to the user: the follow stays quiet until the hero
  // itself walks out of a dead-zone-sized region around where it stood when
  // the drag happened, so a camera the user parked never gets yanked back by
  // a stationary hero.
  let dragSuspended = false;
  let followAnchor: CameraPan | null = null;
  let hasFollowSample = false;

  const aspect = (): number => Math.max(1, canvas.clientWidth) / Math.max(1, canvas.clientHeight);
  const createFixed = (): FreeCamera => {
    const camera = createFixedIsometricCamera(scene, bounds, aspect(), fixedZoom);
    const target = new Vector3(pan.x, 0, pan.y);
    camera.position.addInPlace(target.subtract(centre));
    camera.setTarget(target);
    return camera;
  };
  fixed = createFixed();

  const orbit = new ArcRotateCamera("room-review-free-camera", FREE_ALPHA, FREE_BETA,
    fixedRadius, centre.clone(), scene);
  orbit.lowerAlphaLimit = -Math.PI * 2;
  orbit.upperAlphaLimit = Math.PI * 2;
  orbit.lowerBetaLimit = 0.2;
  orbit.upperBetaLimit = Math.PI / 2 - 0.05;
  orbit.lowerRadiusLimit = minimumRadius;
  orbit.upperRadiusLimit = maximumRadius;
  const clampOrbit = (): void => {
    orbit.alpha = Math.min(orbit.upperAlphaLimit ?? Math.PI * 2,
      Math.max(orbit.lowerAlphaLimit ?? -Math.PI * 2, orbit.alpha));
    orbit.beta = Math.min(orbit.upperBetaLimit ?? Math.PI / 2,
      Math.max(orbit.lowerBetaLimit ?? 0, orbit.beta));
    orbit.radius = Math.min(maximumRadius, Math.max(minimumRadius, orbit.radius));
    orbit.target.x = Math.min(bounds.width, Math.max(0, orbit.target.x));
    orbit.target.y = 0;
    orbit.target.z = Math.min(bounds.height, Math.max(0, orbit.target.z));
  };
  const observer = orbit.onViewMatrixChangedObservable.add(clampOrbit);

  const replaceFixed = (): void => {
    const previous = fixed;
    fixed = createFixed();
    if (!free) scene.activeCamera = fixed;
    previous.dispose();
  };
  // The follow's per-frame path: reposition the one live camera rather than
  // constructing a replacement sixty times a second. `replaceFixed` stays the
  // route for the discrete calls that change more than the pan.
  const moveFixedTo = (next: CameraPan): void => {
    pan = next;
    const distance = Math.max(bounds.width, bounds.height);
    fixed.position.set(pan.x - distance, distance, pan.y - distance);
    fixed.setTarget(new Vector3(pan.x, 0, pan.y));
  };
  const follow = (x: number, z: number): void => {
    if (disposed || free || !Number.isFinite(x) || !Number.isFinite(z)) return;
    const vertical = fixed.orthoTop ?? 0;
    const horizontal = fixed.orthoRight ?? 0;
    if (vertical <= 0 || horizontal <= 0) return;
    // The allowances are fractions of the orthographic half-extents, measured
    // by projecting the hero's world offset onto the screen axes' ground
    // directions. The vertical one ignores the isometric foreshortening of
    // ground offsets, so the on-screen zone is slightly taller than the
    // fraction says -- a dead zone needs no more precision than that.
    const allowedUp = vertical * FOLLOW_DEAD_ZONE_FRACTION;
    const allowedRight = horizontal * FOLLOW_DEAD_ZONE_FRACTION;
    // Bounds centre is not composition centre: the generated dungeon often
    // discloses one room near an edge of the 68 x 45 allocation. Put the first
    // published hero at frame centre, then use the stable dead zone below.
    if (!hasFollowSample && !dragSuspended) {
      hasFollowSample = true;
      moveFixedTo(clampCameraPan(bounds, { x, y: z }));
      return;
    }
    hasFollowSample = true;
    if (dragSuspended) {
      dragSuspended = false;
      followAnchor = Object.freeze({ x, y: z });
      return;
    }
    if (followAnchor !== null) {
      if (Math.hypot(x - followAnchor.x, z - followAnchor.y) <= allowedUp) return;
      followAnchor = null;
    }
    const screenRight = fixed.getDirection(Vector3.Right());
    const screenUp = fixed.getDirection(Vector3.Up());
    const rightLength = Math.hypot(screenRight.x, screenRight.z) || 1;
    const upLength = Math.hypot(screenUp.x, screenUp.z) || 1;
    const rightX = screenRight.x / rightLength, rightZ = screenRight.z / rightLength;
    const upX = screenUp.x / upLength, upZ = screenUp.z / upLength;
    const offsetRight = (x - pan.x) * rightX + (z - pan.y) * rightZ;
    const offsetUp = (x - pan.x) * upX + (z - pan.y) * upZ;
    // Restore exactly the excess beyond the zone: the hero is pushed back to
    // the zone edge, never centred, so a stationary hero causes no creep.
    const excessRight = offsetRight - Math.min(allowedRight, Math.max(-allowedRight, offsetRight));
    const excessUp = offsetUp - Math.min(allowedUp, Math.max(-allowedUp, offsetUp));
    if (excessRight === 0 && excessUp === 0) return;
    moveFixedTo(clampCameraPan(bounds, {
      x: pan.x + rightX * excessRight + upX * excessUp,
      y: pan.y + rightZ * excessRight + upZ * excessUp,
    }));
  };
  const resetFixed = (): void => {
    if (disposed) return;
    orbit.detachControl();
    free = false;
    pan = Object.freeze({ x: centre.x, y: centre.z });
    fixedZoom = initialFixedZoom;
    dragSuspended = false;
    followAnchor = null;
    hasFollowSample = false;
    orbit.alpha = FREE_ALPHA;
    orbit.beta = FREE_BETA;
    orbit.radius = fixedRadius;
    orbit.setTarget(centre);
    clampOrbit();
    replaceFixed();
  };
  const setFree = (enabled: boolean): void => {
    if (disposed || enabled === free) return;
    if (!enabled) { resetFixed(); return; }
    free = true;
    scene.activeCamera = orbit;
    orbit.attachControl(canvas, true);
  };
  scene.activeCamera = fixed;

  return Object.freeze({
    get camera(): Camera { return free ? orbit : fixed; },
    get free() { return free; },
    resetFixed,
    setFree,
    pan(dxPixels: number, dyPixels: number): void {
      if (disposed || free || !Number.isFinite(dxPixels) || !Number.isFinite(dyPixels)) return;
      const scale = Math.max(bounds.width, bounds.height) / Math.max(1, canvas.clientHeight);
      const screenRight = fixed.getDirection(Vector3.Right());
      const screenUp = fixed.getDirection(Vector3.Up());
      const rightLength = Math.hypot(screenRight.x, screenRight.z) || 1;
      const upLength = Math.hypot(screenUp.x, screenUp.z) || 1;
      pan = clampCameraPan(bounds, {
        x: pan.x + (-dxPixels * screenRight.x / rightLength + dyPixels * screenUp.x / upLength) * scale / fixedZoom,
        y: pan.y + (-dxPixels * screenRight.z / rightLength + dyPixels * screenUp.z / upLength) * scale / fixedZoom,
      });
      dragSuspended = true;
      followAnchor = null;
      replaceFixed();
    },
    ...(options.followHero === true ? { follow } : {}),
    zoom(delta: number): void {
      if (disposed || free || !Number.isFinite(delta)) return;
      fixedZoom = clampCameraZoom(fixedZoom * Math.exp(-delta * 0.001));
      replaceFixed();
    },
    resize(): void { if (!disposed && !free) replaceFixed(); },
    dispose(): void {
      if (disposed) return;
      orbit.detachControl();
      if (observer !== null) orbit.onViewMatrixChangedObservable.remove(observer);
      orbit.dispose();
      fixed.dispose();
      disposed = true;
      free = false;
    },
  });
}
