import type { Vec3 } from "../spec/quantity.ts";
import { cos, hypot, sin } from "../math/real.ts";

/** A horizontal world point or direction, m for a point and dimensionless for a direction. */
export interface GroundPoint { readonly x: number; readonly z: number }

/** A movement objective shared by external orders and a body's own tactics. Null requests a controlled stop. */
export type MovementRequest =
  | { readonly kind: "direct"; readonly direction: GroundPoint }
  /** `by`, the body it is a place by: navigation does not keep off that body where it lies (`fallenSolids`); the points are the way round it. */
  | { readonly kind: "place"; readonly points: readonly GroundPoint[]; readonly near: number; readonly by?: string }
  | { readonly kind: "range"; readonly focus: string; readonly near: number; readonly far: number; readonly side?: -1 | 0 | 1 };

const point = (value: unknown): value is GroundPoint => typeof value === "object" && value !== null
  && Number.isFinite((value as GroundPoint).x) && Number.isFinite((value as GroundPoint).z)
  && Object.keys(value).every(key => key === "x" || key === "z");

/** Stored movement has finite geometry, a nonempty route or focus, and ordered nonnegative tolerances. */
export function isMovement(value: unknown): value is MovementRequest {
  if (typeof value !== "object" || value === null) return false;
  const request = value as Record<string, unknown>;
  const keys = (...allowed: string[]) => Object.keys(request).every(key => allowed.includes(key));
  switch (request.kind) {
    case "direct": return keys("kind", "direction") && point(request.direction);
    case "place": return keys("kind", "points", "near", "by") && Array.isArray(request.points) && request.points.length > 0
      && request.points.every(point) && typeof request.near === "number" && Number.isFinite(request.near) && request.near >= 0
      && (request.by === undefined || typeof request.by === "string" && request.by.length > 0);
    case "range": return keys("kind", "focus", "near", "far", "side") && typeof request.focus === "string" && request.focus.length > 0
      && typeof request.near === "number" && Number.isFinite(request.near) && request.near >= 0
      && typeof request.far === "number" && Number.isFinite(request.far) && request.far >= request.near
      && (request.side === undefined || request.side === -1 || request.side === 0 || request.side === 1);
    default: return false;
  }
}

/** Whether two requests ask the same movement, field by field. */
export function sameMovement(a: MovementRequest | null, b: MovementRequest | null): boolean {
  if (a === null || b === null) return a === b;
  const same = (p: GroundPoint, q: GroundPoint) => p.x === q.x && p.z === q.z;
  switch (a.kind) {
    case "direct": return b.kind === "direct" && same(a.direction, b.direction);
    case "place": return b.kind === "place" && a.near === b.near && a.by === b.by && a.points.length === b.points.length && a.points.every((point, i) => same(point, b.points[i]!));
    case "range": return b.kind === "range" && a.focus === b.focus && a.near === b.near && a.far === b.far && a.side === b.side;
    default: { const never: never = a; throw new Error(`unknown movement ${JSON.stringify(never)}`); }
  }
}

/** A request's own copy, which no later change of the one asked reaches. */
export function copyMovement(request: MovementRequest): MovementRequest {
  switch (request.kind) {
    case "direct": return { kind: "direct", direction: { x: request.direction.x, z: request.direction.z } };
    case "place": return { kind: "place", points: request.points.map(point => ({ x: point.x, z: point.z })), near: request.near, ...(request.by === undefined ? {} : { by: request.by }) };
    case "range": return { kind: "range", focus: request.focus, near: request.near, far: request.far, ...(request.side === undefined ? {} : { side: request.side }) };
    default: { const never: never = request; throw new Error(`unknown movement ${JSON.stringify(never)}`); }
  }
}

/** A world direction remains independent of the body's facing. */
export const directMovement = (x: number, z: number): MovementRequest => ({ kind: "direct", direction: { x, z } });

/**
 * A walk worked out as a velocity, forward and to the right of `heading`, m/s, as a movement goal: a
 * direct walk its way, its speed the ceiling; nothing for no walk, which stands.
 */
export function walkGoal(heading: number, move: readonly [forward: number, right: number] | null): { readonly movement?: MovementRequest; readonly pace?: number } {
  const speed = move ? hypot(move[0], move[1]) : 0;
  if (!move || speed === 0) return {};
  return { movement: directMovement(move[0] * sin(heading) + move[1] * cos(heading), move[0] * cos(heading) - move[1] * sin(heading)), pace: speed };
}

/** One destination, or the next of a drawn route, is a physical place with an arrival tolerance. */
export const placeMovement = (at: GroundPoint, near = .2): MovementRequest => ({ kind: "place", points: [{ x: at.x, z: at.z }], near });

/** A world point from a sensed or own-body vector. */
export const groundPoint = (at: Vec3): GroundPoint => ({ x: at[0], z: at[2] });

/**
 * How far a request has left to go from `here`, m, read from the request itself, never from what a
 * navigator last walked: a direct walk has no end; a place, the shortest straight way on through its
 * points from any of them, short of its `near`; a range, the way into its far edge, and no end while its
 * focus is not to be seen.
 */
export function remainingOf(request: MovementRequest, here: GroundPoint, others: readonly { readonly id: string; readonly out: boolean; readonly centre: { readonly x: number; readonly z: number } }[]): number {
  const apart = (a: GroundPoint, b: GroundPoint) => hypot(a.x - b.x, a.z - b.z);
  switch (request.kind) {
    case "direct": return Infinity;
    case "place": {
      const { points } = request;
      let after = 0, best = Infinity;
      for (let k = points.length - 1; k >= 0; k--) {
        if (k < points.length - 1) after += apart(points[k]!, points[k + 1]!);
        best = Math.min(best, apart(here, points[k]!) + after);
      }
      return Math.max(0, best - request.near);
    }
    case "range": {
      const focus = others.find(other => other.id === request.focus && !other.out);
      return focus ? Math.max(0, apart(here, focus.centre) - request.far) : Infinity;
    }
    default: { const never: never = request; throw new Error(`unknown movement ${JSON.stringify(never)}`); }
  }
}
