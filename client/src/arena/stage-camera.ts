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

export type StageCameraMode = "fit" | "follow" | "orbit";

export type StageCameraBasis = Readonly<{
  right: readonly [number, number, number];
  up: readonly [number, number, number];
}>;

export interface StageCamera {
  readonly mode: StageCameraMode;
  readonly promoted: ArenaPromotedView;
  /** Basis-changing user operations only; following translates the frame intact. */
  readonly changeSerial: number;
  /** The promoted view's basis, which is the basis a virtual hand sees. */
  readonly basis: StageCameraBasis;
  /** Project a sim-space point into normalized canvas coordinates. */
  project(point: V3): readonly [number, number] | null;
  /** Hit-test the live 3/4 rectangle from CSS-normalized canvas coordinates. */
  containsThreeQuarterPoint(x: number, y: number): boolean;
  fit(focus: V3, span: number, azimuth: number): void;
  follow(body: Pose, dt: number): void;
  /** The `buttons` bit field makes the one-owner gesture rule directly testable. */
  orbit(buttons: number, dx: number, dy: number): boolean;
  zoom(delta: number): void;
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
  const active = (): FreeCamera => promoted === "firstPersonA" ? firstPerson[0]
    : promoted === "firstPersonB" ? firstPerson[1] : threeQuarter;

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
      azimuth += dx * ORBIT_RADIANS_PER_PIXEL;
      elevation = clamp(elevation + dy * ORBIT_RADIANS_PER_PIXEL,
        MIN_ORBIT_ELEVATION, MAX_ORBIT_ELEVATION);
      changeSerial += 1;
      place();
      return true;
    },
    zoom(delta: number): void {
      if (!finite(delta) || delta === 0) return;
      const next = clamp(radius * Math.exp(delta * ZOOM_PER_WHEEL_UNIT),
        ARENA_CLOSE_UP_RADIUS, ARENA_WIDE_RADIUS);
      if (next === radius) return;
      if (mode === "fit") mode = "orbit";
      radius = next;
      changeSerial += 1;
      place();
    },
    promote(view: ArenaPromotedView): void {
      if (view === promoted) return;
      promoted = view;
      const viewports = PROMOTED_VIEWPORTS[view];
      firstPerson[0].viewport = viewportOf(viewports.firstPersonA);
      firstPerson[1].viewport = viewportOf(viewports.firstPersonB);
      threeQuarter.viewport = viewportOf(viewports.threeQuarter);
      changeSerial += 1;
    },
    refit(): void {
      const beforePosition = threeQuarter.position.clone();
      const beforeTarget = target.clone();
      const beforeMode = mode;
      mode = "fit";
      applyFit();
      if (beforeMode !== mode || !samePoint(beforePosition, threeQuarter.position)
          || !samePoint(beforeTarget, target)) changeSerial += 1;
    },
  });
}
