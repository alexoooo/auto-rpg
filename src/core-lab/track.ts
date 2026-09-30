/**
 * **The Run scenario's tracks**: closed paths across the ground, laid end to end from straights
 * and arcs, each starting at the origin facing +z, where the lab builds its body. A heading is the
 * lab's: 0 faces +z and it grows to the right, the right of a heading h being (cos h, -sin h); an
 * arc of positive curvature turns right.
 *
 * Free of the page, so `tests/core-lab-track.test.mjs` can argue with it.
 */
import { LAB_TURN_RATE } from "./stance-mode.ts";

/** A piece of a track: a straight, or an arc turning at `curvature` (1/m, positive to the right). */
export type Piece =
  | { readonly kind: "straight"; readonly metres: number }
  | { readonly kind: "arc"; readonly metres: number; readonly curvature: number };

/** Where a track is at an arc length: across the ground (x, z), m, its heading, rad, and its curvature, 1/m. */
export interface TrackPoint {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly curvature: number;
}

export interface Track {
  /** Its length, m: an arc length wraps at it. */
  readonly length: number;
  /** The track `s` metres along it from its start. */
  at(s: number): TrackPoint;
  /**
   * The arc length of the track's point nearest (x, z), searched from `back` metres behind `near`
   * to `ahead` in front of it, wrapped into [0, length). A window, not the whole track: where a
   * track passes near itself (the shuttle's two straights), the whole track's nearest point can be
   * on the other side.
   */
  nearest(x: number, z: number, near: number, back?: number, ahead?: number): number;
}

/** Lay `pieces` end to end from the origin, facing +z. */
export function trackOf(pieces: readonly Piece[]): Track {
  const starts: { readonly s: number; readonly x: number; readonly z: number; readonly heading: number }[] = [];
  let s = 0, x = 0, z = 0, heading = 0;
  const along = (piece: Piece, t: number, x0: number, z0: number, h0: number): TrackPoint => {
    switch (piece.kind) {
      case "straight": return { x: x0 + t * Math.sin(h0), z: z0 + t * Math.cos(h0), heading: h0, curvature: 0 };
      case "arc": {
        // The integral of (sin h, cos h) as h turns at k: ((cos h0 - cos h) / k, (sin h - sin h0) / k).
        const k = piece.curvature, h = h0 + k * t;
        return { x: x0 + (Math.cos(h0) - Math.cos(h)) / k, z: z0 + (Math.sin(h) - Math.sin(h0)) / k, heading: h, curvature: k };
      }
      default: { const never: never = piece; throw new Error(`no piece ${String(never)}`); }
    }
  };
  for (const piece of pieces) {
    starts.push({ s, x, z, heading });
    const end = along(piece, piece.metres, x, z, heading);
    s += piece.metres; x = end.x; z = end.z; heading = end.heading;
  }
  const length = s;
  const at = (arc: number): TrackPoint => {
    const w = ((arc % length) + length) % length;
    let i = starts.length - 1;
    while (i > 0 && starts[i]!.s > w) i--;
    const start = starts[i]!;
    return along(pieces[i]!, w - start.s, start.x, start.z, start.heading);
  };
  const gap = (arc: number, px: number, pz: number): number => {
    const p = at(arc);
    return (p.x - px) ** 2 + (p.z - pz) ** 2;
  };
  return {
    length, at,
    nearest(px, pz, near, back = 0.5, ahead = 1) {
      // A centimetre's scan of the window, then a millimetre's about the best of it.
      let best = near - back, least = Infinity;
      for (let arc = near - back; arc <= near + ahead; arc += 0.01) {
        const g = gap(arc, px, pz);
        if (g < least) { least = g; best = arc; }
      }
      for (let arc = best - 0.01; arc <= best + 0.01; arc += 0.001) {
        const g = gap(arc, px, pz);
        if (g < least) { least = g; best = arc; }
      }
      return ((best % length) + length) % length;
    },
  };
}

/**
 * The big circle's radius, m: the owner's "big circle", about 25 m a lap. Walked at 0.5 m/s it
 * asks the heading to turn 0.125 rad/s, inside the turn each body holds walking at its fastest
 * (`CoreBody.envelope`, `assets/core/stance-envelope.json`).
 */
export const CIRCLE_RADIUS = 4;
/**
 * The walking pace of a turn on the stance, m/s: slow enough that `LAB_TURN_RATE`
 * (`stance-mode.ts`) is inside every body's envelope, and that each human takes the Routine's
 * half-turns from standing (`docs/reference/lab.md#routine-gait`).
 */
export const TURN_PACE = 0.3;

/** The shuttle's straight, m. */
export const SHUTTLE_METRES = 6;
/**
 * The shuttle's half-turn's radius, m: the Run's and the Routine's, `TURN_PACE` at
 * `LAB_TURN_RATE` (0.3 m/s at 1 rad/s).
 */
export const SHUTTLE_TURN_RADIUS = TURN_PACE / LAB_TURN_RATE;

export const TRACK_IDS = ["circle", "shuttle"] as const;
export type TrackId = (typeof TRACK_IDS)[number];

export const TRACKS: Readonly<Record<TrackId, { readonly name: string; readonly pieces: readonly Piece[] }>> = {
  circle: {
    name: "Big circle",
    pieces: [{ kind: "arc", metres: 2 * Math.PI * CIRCLE_RADIUS, curvature: 1 / CIRCLE_RADIUS }],
  },
  shuttle: {
    name: "Back and forth",
    pieces: [
      { kind: "straight", metres: SHUTTLE_METRES },
      { kind: "arc", metres: Math.PI * SHUTTLE_TURN_RADIUS, curvature: 1 / SHUTTLE_TURN_RADIUS },
      { kind: "straight", metres: SHUTTLE_METRES },
      { kind: "arc", metres: Math.PI * SHUTTLE_TURN_RADIUS, curvature: 1 / SHUTTLE_TURN_RADIUS },
    ],
  },
};
