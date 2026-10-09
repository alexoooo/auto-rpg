import { cos, sin } from "../math/real.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { SolidSense } from "./object-senses.ts";

function sweepBounds(solid: SolidSense, from: Vec3, to: Vec3) {
  let a: Vec3, b: Vec3, low: Vec3, high: Vec3;
  switch (solid.kind) {
    case "box": {
    const c = cos(solid.turn ?? 0), s = sin(solid.turn ?? 0);
    const local = (v: Vec3): Vec3 => { const x = v[0] - solid.centre[0], z = v[2] - solid.centre[2];
      return [c * x - s * z, v[1] - solid.centre[1], s * x + c * z]; };
    a = local(from); b = local(to); low = solid.size.map(v => -v / 2) as unknown as Vec3; high = solid.size.map(v => v / 2) as unknown as Vec3;
    break;
    }
    case "hull":
    a = from; b = to;
    low = [0, 1, 2].map(k => Math.min(...solid.points.map(p => p[k]!))) as unknown as Vec3;
    high = [0, 1, 2].map(k => Math.max(...solid.points.map(p => p[k]!))) as unknown as Vec3;
    break;
    default: { const never: never = solid; throw new Error(`unknown sensed solid ${never}`); }
  }
  return {a,b,low,high};
}

/** Closest outward horizontal direction when the body occupies a fixed solid's clearance margin. */
export function clearanceExit(from: Vec3, radius: number, solids: readonly SolidSense[]): readonly [number,number] | null {
  if (!(radius >= 0) || !Number.isFinite(radius)) throw new Error("invalid body clearance radius");
  for (const solid of solids) {
    const {a,low,high}=sweepBounds(solid,from,from);
    if(high[1]<=a[1]-radius||low[1]>=a[1]+radius)continue;
    if([0,2].some(k=>a[k]!<low[k]!-radius||a[k]!>high[k]!+radius))continue;
    let nearest=Infinity,axis=0,side=0;
    for(const k of [0,2])for(const direction of [-1,1]) {
      const gap=direction<0?a[k]!-low[k]!+radius:high[k]!+radius-a[k]!;
      if(gap<nearest){nearest=gap;axis=k;side=direction;}
    }
    const x=axis===0?side:0,z=axis===2?side:0;
    if(solid.kind==="hull")return [x,z];
    const c=cos(solid.turn??0),s=sin(solid.turn??0);
    return [c*x+s*z,-s*x+c*z];
  }
  return null;
}

/** Conservative swept-body clearance against rotated boxes and hull world bounds; floor is below the sweep. */
export function clearStep(from: Vec3, to: Vec3, radius: number, solids: readonly SolidSense[]): boolean {
  if (!(radius >= 0) || !Number.isFinite(radius)) throw new Error("invalid body clearance radius");
  for (const solid of solids) {
    const {a,b,low,high} = sweepBounds(solid,from,to);
    if (high[1] <= Math.min(a[1], b[1]) - radius || low[1] >= Math.max(a[1], b[1]) + radius) continue;
    let first = 0, last = 1, inside = true, inset = Infinity, escape = Infinity;
    for (const k of [0, 2] as const) {
      const lower = low[k] - radius, upper = high[k] + radius, d = b[k] - a[k];
      inside &&= a[k] >= lower && a[k] <= upper;
      // A body inside the clearance margin may reduce its nearest penetration without crossing the solid.
      inset = Math.min(inset, a[k] - lower, upper - a[k]);
      if (a[k] !== (lower + upper) / 2 && (a[k] - (lower + upper) / 2) * d >= 0) escape = Math.min(escape, a[k] - lower, upper - a[k]);
      if (d === 0) { if (a[k] < lower || a[k] > upper) { first = 1; last = 0; } }
      else { const u = (lower - a[k]) / d, v = (upper - a[k]) / d;
        first = Math.max(first, Math.min(u, v)); last = Math.min(last, Math.max(u, v)); }
    }
    if (first <= last && !(inside && escape <= inset)) return false;
  }
  return true;
}

/**
 * **A walk that keeps clear of the solids**: `move` (forward, right, m/s, in the frame of `heading`)
 * where a body at `centre` of clearance `radius` sweeps `ahead` m along it clear (`clearStep`); else
 * the walk mirrored across the heading, then straight to the right, then to the left, at its speed;
 * or null where none is clear. With nothing sensed it is `move`.
 */
export function clearMove(centre: { readonly x: number; readonly y: number; readonly z: number }, solids: readonly SolidSense[] | undefined,
  heading: number, move: readonly [number, number] | null, radius: number, ahead: number): readonly [number, number] | null {
  if (!move || !solids) return move;
  const from: Vec3 = [centre.x, centre.y, centre.z];
  const candidates = [move, [move[0], -move[1]], [0, Math.abs(move[0]) + Math.abs(move[1])], [0, -Math.abs(move[0]) - Math.abs(move[1])]] as const;
  for (const candidate of candidates) {
    const dx = candidate[0] * sin(heading) + candidate[1] * cos(heading), dz = candidate[0] * cos(heading) - candidate[1] * sin(heading);
    if (clearStep(from, [centre.x + dx * ahead, centre.y, centre.z + dz * ahead], radius, solids)) return candidate;
  }
  return null;
}
