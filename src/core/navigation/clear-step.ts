import { cos, hypot, sin } from "../math/real.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { SolidSense } from "../mind/object-senses.ts";
import type { BodyView } from "../body.ts";
import type { BodySpec } from "../spec/body.ts";
import { bodyClearance } from "./sensed-bounds.ts";
import type { Intent } from "../intent/intent.ts";
import { directMovement } from "../intent/movement.ts";

/**
 * **Keeping clear of the solids sensed**, as a planner asks it of its body's navigator
 * (`Navigator`): a walk kept clear over the next stretch, and the way out of a solid's clearance
 * the body stands in. Replacing the navigator replaces both for every planner.
 */
export interface Clearance {
  /** `move` (forward, right, m/s) for a body heading `heading`, or the nearest to it that keeps clear of the solids sensed; null to stand. */
  keepClear(view: BodyView, heading: number, move: readonly [number, number] | null): readonly [number, number] | null;
  /** The ground direction out of a solid's clearance the body stands in, or null where it stands in none. */
  exit(view: BodyView): readonly [number, number] | null;
}

/** How far a body keeps its centre beyond its sensed clearance (`bodyClearance`), and how far ahead a walk is kept clear, m: the stock navigators'. */
const KEEP_CLEAR = Object.freeze({ margin: .08, ahead: .5 });

/** The stock navigators' clearance for a body of `spec` (`Clearance`): its centre `KEEP_CLEAR.margin` m beyond its clearance, over the next `KEEP_CLEAR.ahead` m. */
export function stockClearance(spec: BodySpec): Clearance {
  const radius = bodyClearance(spec) + KEEP_CLEAR.margin;
  return {
    keepClear: (view, heading, move) => clearMove(view.stance.centre, view.senses.solids, heading, move, radius, KEEP_CLEAR.ahead),
    exit: (view) => { const centre = view.stance.centre; return clearanceExit([centre.x, centre.y, centre.z], radius, view.senses.solids ?? []); },
  };
}

/** How far a walk kept out (`keepOut`) keeps the body's centre from every segment of a fallen body, m. */
const FALLEN = .9;

/** What a walk asks of the legs: a movement goal under a ceiling, and a facing. */
type Walk = Pick<Intent, "move" | "face" | "movement" | "pace" | "travelFacing">;

/**
 * **A walk kept out of what the body must keep clear of**: where the body stands in a solid's
 * clearance, as `clearance` finds it (`Clearance.exit`), or within `FALLEN` m of a segment of a
 * fallen body other than `exempt` (the body it means to be near), the walk out of it, facing as
 * `asked` faces, at `pace` where one is given; else `asked`.
 */
export function keepOut<A extends Walk>(view: BodyView, clearance: Clearance, asked: A, exempt: string | null, pace?: number): A {
  const out = clearance.exit(view) ?? awayFromFallen(view, exempt);
  if (!out) return asked;
  const { movement: _, pace: __, travelFacing: ___, ...rest } = asked;
  const walk = hypot(out[0], out[1]) > 0 ? { move: null, face: asked.face, movement: directMovement(out[0], out[1]), ...pace === undefined ? {} : { pace } } : { move: null, face: asked.face };
  return { ...rest, ...walk } as A;
}

/** The ground direction away from the nearest segment within `FALLEN` m of a fallen body other than `exempt`; null with none. */
function awayFromFallen(view: BodyView, exempt: string | null): readonly [number, number] | null {
  const { centre } = view.stance;
  let near = FALLEN, from: { readonly x: number; readonly z: number } | null = null;
  for (const other of view.senses.others) {
    if (!other.down || other.id === exempt) continue;
    for (const segment of other.segments.values()) {
      const distance = hypot(segment.centre.x - centre.x, segment.centre.z - centre.z);
      if (distance < near) { near = distance; from = segment.centre; }
    }
  }
  return from ? [centre.x - from.x, centre.z - from.z] : null;
}

/**
 * A sweep from (`fx`, `fy`, `fz`) to (`tx`, `ty`, `tz`) in `solid`'s frame, written into `out`:
 * the sweep's start at 0-2, its end at 3-5, and the solid's lowest corner at 6-8 and highest at
 * 9-11. A box's frame is its own, turned and centred; a hull's is the world's, about its points'
 * bounds.
 */
export const SWEEP = 12;

function sweepBounds(out: Float64Array, solid: SolidSense, fx: number, fy: number, fz: number, tx: number, ty: number, tz: number): Float64Array {
  switch (solid.kind) {
    case "box": {
      const c = cos(solid.turn ?? 0), s = sin(solid.turn ?? 0), cx = solid.centre[0], cy = solid.centre[1], cz = solid.centre[2];
      let x = fx - cx, z = fz - cz;
      out[0] = c * x - s * z; out[1] = fy - cy; out[2] = s * x + c * z;
      x = tx - cx; z = tz - cz;
      out[3] = c * x - s * z; out[4] = ty - cy; out[5] = s * x + c * z;
      for (let k = 0; k < 3; k++) { out[6 + k] = -solid.size[k]! / 2; out[9 + k] = solid.size[k]! / 2; }
      break;
    }
    case "hull":
      out[0] = fx; out[1] = fy; out[2] = fz; out[3] = tx; out[4] = ty; out[5] = tz;
      for (let k = 0; k < 3; k++) {
        let low = Infinity, high = -Infinity;
        for (let i = 0; i < solid.points.length; i++) { const p = solid.points[i]![k]!; low = Math.min(low, p); high = Math.max(high, p); }
        out[6 + k] = low; out[9 + k] = high;
      }
      break;
    default: { const never: never = solid; throw new Error(`unknown sensed solid ${never}`); }
  }
  return out;
}

/**
 * Whether a body of clearance `radius` at (`x`, `y`, `z`) is within `solid`'s clearance margin,
 * with `w` (`SWEEP` long) to work in: what `clearanceExit` finds an exit from.
 */
export function occupies(w: Float64Array, solid: SolidSense, x: number, y: number, z: number, radius: number): boolean {
  sweepBounds(w, solid, x, y, z, x, y, z);
  if (w[10]! <= w[1]! - radius || w[7]! >= w[1]! + radius) return false;
  return !(w[0]! < w[6]! - radius || w[0]! > w[9]! + radius || w[2]! < w[8]! - radius || w[2]! > w[11]! + radius);
}

/** Closest outward horizontal direction when the body occupies a fixed solid's clearance margin. */
export function clearanceExit(from: Vec3, radius: number, solids: readonly SolidSense[]): readonly [number,number] | null {
  if (!(radius >= 0) || !Number.isFinite(radius)) throw new Error("invalid body clearance radius");
  const w = new Float64Array(SWEEP);
  for (let i = 0; i < solids.length; i++) {
    const solid = solids[i]!;
    if (!occupies(w, solid, from[0], from[1], from[2], radius)) continue;
    let nearest = Infinity, axis = 0, side = 0;
    for (let k = 0; k <= 2; k += 2) for (let direction = -1; direction <= 1; direction += 2) {
      const gap = direction < 0 ? w[k]! - w[6 + k]! + radius : w[9 + k]! + radius - w[k]!;
      if (gap < nearest) { nearest = gap; axis = k; side = direction; }
    }
    const x = axis === 0 ? side : 0, z = axis === 2 ? side : 0;
    if (solid.kind === "hull") return [x, z];
    const c = cos(solid.turn ?? 0), s = sin(solid.turn ?? 0);
    return [c * x + s * z, -s * x + c * z];
  }
  return null;
}

/**
 * Whether `solid` blocks a body of clearance `radius` sweeping from (`fx`, `fy`, `fz`) to
 * (`tx`, `ty`, `tz`), with `w` (`SWEEP` long) to work in: what `clearStep` asks of each solid.
 */
export function blocks(w: Float64Array, solid: SolidSense, fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, radius: number): boolean {
  sweepBounds(w, solid, fx, fy, fz, tx, ty, tz);
  if (w[10]! <= Math.min(w[1]!, w[4]!) - radius || w[7]! >= Math.max(w[1]!, w[4]!) + radius) return false;
  let first = 0, last = 1, inside = true, inset = Infinity, escape = Infinity;
  for (let k = 0; k <= 2; k += 2) {
    const a = w[k]!, lower = w[6 + k]! - radius, upper = w[9 + k]! + radius, d = w[3 + k]! - a;
    inside &&= a >= lower && a <= upper;
    // A body inside the clearance margin may reduce its nearest penetration without crossing the solid.
    inset = Math.min(inset, a - lower, upper - a);
    if (a !== (lower + upper) / 2 && (a - (lower + upper) / 2) * d >= 0) escape = Math.min(escape, a - lower, upper - a);
    if (d === 0) { if (a < lower || a > upper) { first = 1; last = 0; } }
    else { const u = (lower - a) / d, v = (upper - a) / d;
      first = Math.max(first, Math.min(u, v)); last = Math.min(last, Math.max(u, v)); }
  }
  return first <= last && !(inside && escape <= inset);
}

/** `clearStep` from (`fx`, `fy`, `fz`) to (`tx`, `ty`, `tz`), with `w` to work in. */
function clearSweep(w: Float64Array, fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, radius: number, solids: readonly SolidSense[]): boolean {
  for (let i = 0; i < solids.length; i++) if (blocks(w, solids[i]!, fx, fy, fz, tx, ty, tz, radius)) return false;
  return true;
}

/** Conservative swept-body clearance against rotated boxes and hull world bounds; floor is below the sweep. */
export function clearStep(from: Vec3, to: Vec3, radius: number, solids: readonly SolidSense[]): boolean {
  if (!(radius >= 0) || !Number.isFinite(radius)) throw new Error("invalid body clearance radius");
  return clearSweep(new Float64Array(SWEEP), from[0], from[1], from[2], to[0], to[1], to[2], radius, solids);
}

/** The turns a walk that does not keep clear is tried at, (cos, sin) of each, right then left of it a sixteenth of a turn further each time, to a quarter. */
const SLIDES: readonly (readonly [number, number])[] = Object.freeze([1, 2, 3, 4].flatMap((k) =>
  [Object.freeze([cos(k * Math.PI / 8), sin(k * Math.PI / 8)] as const), Object.freeze([cos(k * Math.PI / 8), -sin(k * Math.PI / 8)] as const)]));

/**
 * **A walk that keeps clear of the solids**: `move` (forward, right, m/s, in the frame of `heading`)
 * where a body at `centre` of clearance `radius` sweeps `ahead` m along it clear (`clearStep`); else
 * the walk turned from it, at its speed, right then left a sixteenth of a turn further each time to
 * a quarter (`SLIDES`), so that a body at a solid's edge slides along it the way it goes, whichever
 * way it faces; or null where none is clear. With nothing sensed it is `move`.
 */
export function clearMove(centre: { readonly x: number; readonly y: number; readonly z: number }, solids: readonly SolidSense[] | undefined,
  heading: number, move: readonly [number, number] | null, radius: number, ahead: number): readonly [number, number] | null {
  if (!move || !solids) return move;
  if (!(radius >= 0) || !Number.isFinite(radius)) throw new Error("invalid body clearance radius");
  const w = new Float64Array(SWEEP), sh = sin(heading), ch = cos(heading);
  for (let candidate = 0; candidate <= SLIDES.length; candidate++) {
    const slide = candidate === 0 ? null : SLIDES[candidate - 1]!, c = slide ? slide[0] : 1, s = slide ? slide[1] : 0;
    // Turned right by the slide's angle: (forward, right) goes to (forward cos - right sin, forward sin + right cos).
    const forward = move[0] * c - move[1] * s, right = move[0] * s + move[1] * c;
    const dx = forward * sh + right * ch, dz = forward * ch - right * sh;
    if (clearSweep(w, centre.x, centre.y, centre.z, centre.x + dx * ahead, centre.y, centre.z + dz * ahead, radius, solids))
      return candidate === 0 ? move : [forward, right];
  }
  return null;
}
