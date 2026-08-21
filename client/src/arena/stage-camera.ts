import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Viewport } from "@babylonjs/core/Maths/math.viewport.js";

import type { Pose, V3 } from "../fight/trace.js";
import { ANATOMIES, ONE_RAW } from "../runtime/arena-config.js";
import {
  NEAR_PLANE, PROMOTED_VIEWPORTS, THREE_QUARTER_ELEVATION_DEGREES,
  THREE_QUARTER_FOV_DEGREES, eyeOf, scenePoint, threeQuarterPlacement,
  type ArenaPromotedView, type ViewportRect,
} from "./geometry.js";

const DEGREES = Math.PI / 180;
const MIN_ORBIT_ELEVATION = 10 * DEGREES;
const MAX_ORBIT_ELEVATION = 80 * DEGREES;
const ORBIT_RADIANS_PER_PIXEL = 0.006;
const ZOOM_PER_WHEEL_UNIT = 0.001;
const ARENA_HALF_WIDTH = 12;
const ARENA_HALF_DEPTH = 8;

/**
 * How far the followed body may drift from the viewport centre before the
 * camera moves, as a fraction of the smaller viewport dimension.
 *
 * **Bounded from both sides.** At zero the camera integrates every hip sway and
 * the background swims. Above about a quarter the followed body can stand at
 * the edge of its own viewport while it is being hit from off screen.
 */
export const ARENA_FOLLOW_DEAD_ZONE_FRACTION = 0.10;

/**
 * Exponential response toward the dead-zone edge, in reciprocal seconds.
 *
 * `1 - exp(-rate * dt)` makes two half-frame advances equal one whole-frame
 * advance. A per-frame fraction would change the camera when the display rate
 * changed, and synchronous redraws pass zero so scrubbing cannot integrate it.
 */
export const ARENA_FOLLOW_DAMPING_PER_SECOND = 12;

/** The anatomy-derived hard floor below which the near plane enters a head. */
export const ARENA_HEAD_CLEARANCE_RADIUS =
  Math.max(...ANATOMIES.map((anatomy) => anatomy.headRadius)) / ONE_RAW + NEAR_PLANE;

/**
 * The nearest useful camera radius, in world units.
 *
 * Its lower bound is derived above rather than copied from one anatomy row;
 * 0.9 clears that bound and remains below one shipped standing height, so the
 * near end is a face rather than a camera inside one.
 */
export const ARENA_CLOSE_UP_RADIUS = 0.9;

/** The farthest, so a wheel cannot lose the fight off the back of the arena. */
export const ARENA_WIDE_RADIUS = 30;
/**
 * The chase rig, in standing heights from the followed body's ground point.
 *
 * **A third-person chase hovers above and looks down; it does not ride the
 * neck.** The first rig placed the eye one standing height up and aimed a full
 * height ahead at chest level, which is a 10 degree tilt from head height: the
 * followed head sat level with the eye, filled the middle of the frame and hid
 * the ground the fight is standing on. These four are chosen together so the
 * rig reads the way the genre's chase cameras do:
 *
 * - the eye is 1.9 heights up, clearly above a 1.0-height head rather than
 *   behind it, and 1.7 back, so the whole body is in frame with room around it;
 * - the aim point is 1.2 heights ahead at 0.7 up, which tilts the look
 *   direction `atan(1.2 / 2.9)`, about 22 degrees, below horizontal; and
 * - the followed head then subtends about 5 degrees *below* that aim line, so
 *   it sits just under centre and the ground ahead -- where an opponent stands
 *   -- occupies the frame above it.
 *
 * An opponent one body length ahead lands a similar distance above centre, so a
 * duel frames both fighters without the camera having to widen.
 */
export const CHASE_BACK_HEIGHTS = 1.7;
export const CHASE_UP_HEIGHTS = 1.9;
export const CHASE_LOOK_AHEAD_HEIGHTS = 1.2;
export const CHASE_TARGET_UP_HEIGHTS = 0.7;

export type StageCameraMode = "fit" | "follow" | "orbit" | "relative";

export type StageCameraBasis = Readonly<{
  right: readonly [number, number, number];
  up: readonly [number, number, number];
}>;

export type StageProjection = Readonly<{
  /** Normalized whole-canvas coordinates, with DOM top-left origin. */
  point: readonly [number, number];
  inFront: boolean;
}>;

export interface StageCamera {
  readonly mode: StageCameraMode;
  readonly promoted: ArenaPromotedView;
  /** Basis-changing user operations only; following translates the frame intact. */
  readonly changeSerial: number;
  /** The promoted view's basis, which is the basis a virtual hand sees. */
  readonly basis: StageCameraBasis;
  /** The promoted camera's live rectangle, converted to DOM top-left origin. */
  readonly activeViewport: ViewportRect;
  /** The live 3/4 rectangle even when an eye owns the main panel. */
  readonly threeQuarterViewport: ViewportRect;
  /** Project a sim-space point into normalized canvas coordinates. */
  project(point: V3): readonly [number, number] | null;
  /** Projection that retains a directional answer for a point behind the eye. */
  projectIndicator(point: V3): StageProjection | null;
  /** Hit-test the live 3/4 rectangle from CSS-normalized canvas coordinates. */
  containsThreeQuarterPoint(x: number, y: number): boolean;
  fit(focus: V3, span: number, azimuth: number): void;
  follow(body: Pose, dt: number): void;
  /** The `buttons` bit field makes the one-owner gesture rule directly testable. */
  orbit(buttons: number, dx: number, dy: number): boolean;
  pan(dx: number, dy: number, viewportHeight: number): boolean;
  zoom(delta: number, cursor?: readonly [number, number]): void;
  setEyes(open: boolean): void;
  relative(body: Pose, hipYaw: number, standingHeight: number, dt: number): void;
  promote(view: ArenaPromotedView): void;
  refit(): void;
}

type Fit = Readonly<{ focus: V3; span: number; azimuth: number }>;

function finite(value: number): boolean { return Number.isFinite(value); }
function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
function viewportOf(rect: ViewportRect): Viewport {
  return new Viewport(rect.x, rect.y, rect.width, rect.height);
}
function samePoint(a: Vector3, b: Vector3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/**
 * Own the arena's three existing cameras without attaching Babylon controls.
 *
 * `ArenaContent` remains their lifecycle owner. This object constructs and
 * disposes none of them; promotion is only a viewport exchange.
 */
export function createStageCamera(
  threeQuarter: FreeCamera,
  firstPerson: readonly [FreeCamera, FreeCamera],
  aspect: () => number,
): StageCamera {
  let mode: StageCameraMode = "fit";
  let promoted: ArenaPromotedView = "threeQuarter";
  let changeSerial = 0;
  let fit: Fit | null = null;
  let target = Vector3.Zero();
  let azimuth = 0;
  let elevation = THREE_QUARTER_ELEVATION_DEGREES * DEGREES;
  let radius = ARENA_WIDE_RADIUS;
  let eyesOpen = true;
  let relativeInitialized = false;

  const place = (): void => {
    const ground = radius * Math.cos(elevation);
    threeQuarter.position.set(
      target.x + Math.sin(azimuth) * ground,
      target.y + radius * Math.sin(elevation),
      target.z + Math.cos(azimuth) * ground,
    );
    threeQuarter.setTarget(target);
  };
  const adoptPlacement = (next: ReturnType<typeof threeQuarterPlacement>): void => {
    threeQuarter.position.set(...next.position);
    target = new Vector3(...next.target);
    threeQuarter.setTarget(target);
    radius = Vector3.Distance(threeQuarter.position, target);
  };
  const applyFit = (): void => {
    if (fit === null) return;
    azimuth = fit.azimuth;
    elevation = THREE_QUARTER_ELEVATION_DEGREES * DEGREES;
    // The untouched default delegates to the old pure placement exactly. The
    // optional radius belongs only to owned zoom and never reaches this path.
    adoptPlacement(threeQuarterPlacement(fit.focus, fit.span, aspect(), azimuth));
  };
  const active = (): FreeCamera => !eyesOpen ? threeQuarter
    : promoted === "firstPersonA" ? firstPerson[0]
    : promoted === "firstPersonB" ? firstPerson[1] : threeQuarter;
  const domViewport = (camera: FreeCamera): ViewportRect => Object.freeze({
    x: camera.viewport.x,
    y: 1 - camera.viewport.y - camera.viewport.height,
    width: camera.viewport.width,
    height: camera.viewport.height,
  });

  return Object.freeze({
    get mode() { return mode; },
    get promoted() { return promoted; },
    get changeSerial() { return changeSerial; },
    get basis(): StageCameraBasis {
      const camera = active();
      camera.getViewMatrix(true);
      const right = camera.getDirection(Vector3.Right());
      const up = camera.getDirection(Vector3.Up());
      return Object.freeze({
        // Babylon is [sim x, sim z, -sim y]. Undo that presentation rotation
        // before a camera vector is mixed with authoritative pose points.
        right: Object.freeze([right.x, -right.z, right.y] as const),
        up: Object.freeze([up.x, -up.z, up.y] as const),
      });
    },
    get activeViewport(): ViewportRect {
      return domViewport(active());
    },
    get threeQuarterViewport(): ViewportRect { return domViewport(threeQuarter); },
    project(point: V3): readonly [number, number] | null {
      const camera = active();
      const engine = camera.getEngine();
      const width = engine.getRenderWidth();
      const height = engine.getRenderHeight();
      if (width <= 0 || height <= 0) return null;
      const projected = Vector3.Project(
        new Vector3(...scenePoint(point)), Matrix.Identity(), camera.getTransformationMatrix(),
        camera.viewport.toGlobal(width, height),
      );
      if (![projected.x, projected.y, projected.z].every(finite) || projected.z < 0 || projected.z > 1) return null;
      return Object.freeze([projected.x / width, projected.y / height] as const);
    },
    projectIndicator(point: V3): StageProjection | null {
      if (!point.every(finite)) return null;
      const camera = active();
      const engine = camera.getEngine();
      const width = engine.getRenderWidth();
      const height = engine.getRenderHeight();
      if (width <= 0 || height <= 0) return null;
      camera.getViewMatrix(true);
      const scene = new Vector3(...scenePoint(point));
      const fromEye = scene.subtract(camera.position);
      const forward = camera.getDirection(Vector3.Forward()).normalize();
      const right = camera.getDirection(Vector3.Right()).normalize();
      const up = camera.getDirection(Vector3.Up()).normalize();
      const inFront = Vector3.Dot(fromEye, forward) > 0;
      if (inFront) {
        const projected = Vector3.Project(
          scene, Matrix.Identity(), camera.getTransformationMatrix(),
          camera.viewport.toGlobal(width, height),
        );
        if ([projected.x, projected.y].every(finite)) {
          return Object.freeze({
            point: Object.freeze([projected.x / width, projected.y / height] as const),
            inFront: true,
          });
        }
      }
      // Perspective division flips a point after it crosses the eye. Use its
      // camera-plane direction instead, far enough from centre that the
      // reticle's ray clamp necessarily parks it on an edge.
      const viewport = this.activeViewport;
      const horizontal = Vector3.Dot(fromEye, right);
      const vertical = Vector3.Dot(fromEye, up);
      const magnitude = Math.hypot(horizontal, vertical);
      const dx = magnitude === 0 ? 0 : horizontal / magnitude;
      const dy = magnitude === 0 ? -1 : -vertical / magnitude;
      // `point` is in whole-canvas fractions but its ray is consumed in CSS
      // pixels. Divide the camera-plane direction by the corresponding render
      // extent before sending it far outside the viewport; multiplying both by
      // one common pixel distance preserves the direction in wide and narrow
      // canvases alike.
      const pixelDistance = 2 * Math.max(width, height);
      return Object.freeze({
        point: Object.freeze([
          viewport.x + viewport.width / 2 + dx * pixelDistance / width,
          viewport.y + viewport.height / 2 + dy * pixelDistance / height,
        ] as const),
        inFront: false,
      });
    },
    containsThreeQuarterPoint(x: number, y: number): boolean {
      if (!finite(x) || !finite(y)) return false;
      const viewport = threeQuarter.viewport;
      // DOM pointer coordinates count down from the top; Babylon viewports
      // count up from the bottom. Read the camera's live rectangle rather than
      // repeating the promotion table in the event owner, or a future exchange
      // can give a first-person panel the 3/4 camera's gestures.
      const babylonY = 1 - y;
      return x >= viewport.x && x <= viewport.x + viewport.width
        && babylonY >= viewport.y && babylonY <= viewport.y + viewport.height;
    },
    fit(focus: V3, span: number, nextAzimuth: number): void {
      if (!focus.every(finite) || !finite(span) || !finite(nextAzimuth)) return;
      fit = Object.freeze({ focus, span, azimuth: nextAzimuth });
      if (mode === "fit") applyFit();
    },
    follow(body: Pose, dt: number): void {
      if (!finite(dt) || dt < 0) return;
      mode = "follow";
      relativeInitialized = false;
      if (dt === 0) return;
      // The publication, not the anatomy mirror, says where this particular
      // body's head is now. A close camera aimed at the old fixed chest target
      // cleared the head without putting the face in frame -- a geometric
      // safety bound mistaken for an aiming rule.
      const subject = new Vector3(...scenePoint(eyeOf(body)));
      const screenRight = threeQuarter.getDirection(Vector3.Right()).normalize();
      const screenUp = threeQuarter.getDirection(Vector3.Up());
      screenUp.normalize();
      const offset = subject.subtract(target);
      // The zone is measured on the target plane. Its depth is the camera's
      // radius and therefore stays fixed while follow translates the whole
      // frame; that is what makes the exponential law partition exactly.
      const vertical = Math.tan(THREE_QUARTER_FOV_DEGREES * DEGREES / 2) * radius * 2;
      const horizontal = vertical * Math.max(0.1, aspect());
      // At face distance the published head is wider than the ordinary dead
      // zone. Leaving its centre on that zone's edge clips the very face the
      // close-up exists to show, so the near clamp aims the head at centre.
      // Wider views retain the dead zone and do not chase ordinary footwork.
      const allowance = radius <= ARENA_CLOSE_UP_RADIUS ? 0
        : Math.min(horizontal, vertical) * ARENA_FOLLOW_DEAD_ZONE_FRACTION;
      const offsetRight = Vector3.Dot(offset, screenRight);
      const offsetUp = Vector3.Dot(offset, screenUp);
      const excessRight = offsetRight - clamp(offsetRight, -allowance, allowance);
      const excessUp = offsetUp - clamp(offsetUp, -allowance, allowance);
      if (allowance === 0 ? offset.lengthSquared() === 0
        : excessRight === 0 && excessUp === 0) return;
      const response = 1 - Math.exp(-ARENA_FOLLOW_DAMPING_PER_SECOND * dt);
      if (allowance === 0) {
        // Centring only the screen-plane components can put the head on axis
        // while leaving it much nearer than `radius`; the Brute's 0.25 sphere
        // then clips despite a nominal 0.9 close-up. Adopt the whole published
        // centre so radius once again means camera-to-subject distance.
        target.addInPlace(offset.scale(response));
      } else {
        target.addInPlace(screenRight.scale(excessRight * response));
        target.addInPlace(screenUp.scale(excessUp * response));
      }
      place();
    },
    orbit(buttons: number, dx: number, dy: number): boolean {
      if ((buttons & 4) === 0 || !finite(dx) || !finite(dy) || (dx === 0 && dy === 0)) return false;
      mode = "orbit";
      relativeInitialized = false;
      azimuth += dx * ORBIT_RADIANS_PER_PIXEL;
      elevation = clamp(elevation + dy * ORBIT_RADIANS_PER_PIXEL,
        MIN_ORBIT_ELEVATION, MAX_ORBIT_ELEVATION);
      changeSerial += 1;
      place();
      return true;
    },
    pan(dx: number, dy: number, viewportHeight: number): boolean {
      if (!finite(dx) || !finite(dy) || !finite(viewportHeight) || viewportHeight <= 0
        || (dx === 0 && dy === 0)) return false;
      const vertical = 2 * radius * Math.tan(threeQuarter.fov / 2);
      const units = vertical / viewportHeight;
      const right = threeQuarter.getDirection(Vector3.Right()).normalize();
      const up = threeQuarter.getDirection(Vector3.Up()).normalize();
      const shift = right.scale(-dx * units).add(up.scale(dy * units));
      target.addInPlace(shift);
      threeQuarter.position.addInPlace(shift);
      threeQuarter.setTarget(target);
      mode = "orbit";
      relativeInitialized = false;
      changeSerial += 1;
      return true;
    },
    zoom(delta: number, cursor?: readonly [number, number]): void {
      if (!finite(delta) || delta === 0) return;
      const next = clamp(radius * Math.exp(delta * ZOOM_PER_WHEEL_UNIT),
        ARENA_CLOSE_UP_RADIUS, ARENA_WIDE_RADIUS);
      if (next === radius) return;
      if (mode === "fit") mode = "orbit";
      // Wheel ownership was already hit-tested against the live 3/4 rectangle.
      // Promotion must not silently exchange the ray while leaving that owner.
      const camera = threeQuarter;
      let anchor: Vector3 | null = null;
      if (cursor !== undefined && cursor.every(finite)) {
        const engine = camera.getEngine();
        const ray = camera.getScene().createPickingRay(
          cursor[0] * engine.getRenderWidth(), cursor[1] * engine.getRenderHeight(),
          Matrix.Identity(), camera,
        );
        const hit = camera.getScene().pickWithRay(ray, (mesh) => mesh.isPickable);
        anchor = hit?.pickedPoint ?? null;
        if (anchor === null && Math.abs(ray.direction.y) > 1e-9) {
          const distance = -ray.origin.y / ray.direction.y;
          if (distance >= 0) {
            const floor = ray.origin.add(ray.direction.scale(distance));
            // The infinite mathematical plane is not the arena. A miss beyond
            // the published 24 x 16 floor falls back to focus-centred zoom.
            if (Math.abs(floor.x) <= ARENA_HALF_WIDTH && Math.abs(floor.z) <= ARENA_HALF_DEPTH) {
              anchor = floor;
            }
          }
        }
      }
      const ratio = next / radius;
      if (anchor !== null) {
        target = anchor.add(target.subtract(anchor).scale(ratio));
        threeQuarter.position.copyFrom(anchor.add(threeQuarter.position.subtract(anchor).scale(ratio)));
        threeQuarter.setTarget(target);
      }
      radius = next;
      relativeInitialized = false;
      changeSerial += 1;
      if (anchor === null) place();
    },
    promote(view: ArenaPromotedView): void {
      if (view === promoted) return;
      promoted = view;
      if (eyesOpen) {
        const viewports = PROMOTED_VIEWPORTS[view];
        firstPerson[0].viewport = viewportOf(viewports.firstPersonA);
        firstPerson[1].viewport = viewportOf(viewports.firstPersonB);
        threeQuarter.viewport = viewportOf(viewports.threeQuarter);
      }
      changeSerial += 1;
    },
    setEyes(open: boolean): void {
      if (open === eyesOpen) return;
      eyesOpen = open;
      if (open) {
        const viewports = PROMOTED_VIEWPORTS[promoted];
        firstPerson[0].viewport = viewportOf(viewports.firstPersonA);
        firstPerson[1].viewport = viewportOf(viewports.firstPersonB);
        threeQuarter.viewport = viewportOf(viewports.threeQuarter);
      } else threeQuarter.viewport = new Viewport(0, 0, 1, 1);
      changeSerial += 1;
    },
    relative(body: Pose, hipYaw: number, standingHeight: number, dt: number): void {
      if (!finite(hipYaw) || !finite(standingHeight) || standingHeight <= 0 || !finite(dt) || dt < 0) return;
      const yaw = hipYaw * Math.PI * 2 / ONE_RAW;
      const h = standingHeight;
      const forward: V3 = [Math.cos(yaw), Math.sin(yaw), 0];
      const desiredTarget: V3 = [
        body.body[0] + forward[0] * h * CHASE_LOOK_AHEAD_HEIGHTS,
        body.body[1] + forward[1] * h * CHASE_LOOK_AHEAD_HEIGHTS,
        body.body[2] + h * CHASE_TARGET_UP_HEIGHTS,
      ];
      const desiredPosition: V3 = [
        body.body[0] - forward[0] * h * CHASE_BACK_HEIGHTS,
        body.body[1] - forward[1] * h * CHASE_BACK_HEIGHTS,
        body.body[2] + h * CHASE_UP_HEIGHTS,
      ];
      const nextTarget = new Vector3(...scenePoint(desiredTarget));
      const nextPosition = new Vector3(...scenePoint(desiredPosition));
      if (!relativeInitialized || mode !== "relative") {
        target = nextTarget;
        threeQuarter.position.copyFrom(nextPosition);
        threeQuarter.setTarget(target);
        mode = "relative";
        relativeInitialized = true;
        return;
      }
      // Synchronous redraws do not advance the chase. In particular, drawer,
      // promotion and scrub redraws must preserve an already initialized pose.
      if (dt === 0) return;
      const response = 1 - Math.exp(-ARENA_FOLLOW_DAMPING_PER_SECOND * dt);
      target = Vector3.Lerp(target, nextTarget, response);
      threeQuarter.position.copyFrom(Vector3.Lerp(threeQuarter.position, nextPosition, response));
      threeQuarter.setTarget(target);
      mode = "relative";
    },
    refit(): void {
      const beforePosition = threeQuarter.position.clone();
      const beforeTarget = target.clone();
      const beforeMode = mode;
      mode = "fit";
      relativeInitialized = false;
      applyFit();
      if (beforeMode !== mode || !samePoint(beforePosition, threeQuarter.position)
          || !samePoint(beforeTarget, target)) changeSerial += 1;
    },
  });
}
