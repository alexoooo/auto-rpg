import { cos, hypot, sin } from "../math/real.ts";
import { paceToward } from "../control/stance-envelope.ts";
import { bodyClearance } from "./sensed-bounds.ts";
import type { GroundPoint } from "./movement.ts";
import type { SolidSense } from "./object-senses.ts";
import type { Senses } from "./senses.ts";
import type { GaitLimits } from "./travel.ts";

/**
 * How a body keeps clear of its own side's bodies (`crowdWalk`, `fallenSolids`); navigation
 * preferences, not anatomy:
 *
 * - `margin`, m: the room it keeps between its own clearance and another standing body's;
 * - `horizon`, s: how far ahead it judges where a walk takes it at least, in `samples` steps, and
 *   farther, at as fine a step, where it takes longer to stop;
 * - `turns`: the candidate ways, in sixteenths of a turn either side of the way its route asks;
 * - `left`, (m/s)² a rad: what turning to its left costs over turning to its right, so that two bodies
 *   that meet both pass the same side;
 * - `conflict`, (m/s)²: what a walk that comes within another's room inside the horizon costs, the
 *   sooner the more;
 * - `near`, m: how far past both bodies' reach in the horizon another body is looked at at all;
 * - `reach`, m: how far a fallen body's parts reach past their centres; `grid`, m: the step its
 *   footprint is rounded out to; `settled`, m: how far a fallen body's centre goes from where its
 *   footprint was taken before it is taken afresh, so a body twitching where it lies changes no
 *   route.
 */
export const CROWD = Object.freeze({ margin: .15, horizon: 2, samples: 20, turns: 6, left: .05, conflict: 100, near: 1, reach: .15, grid: .1, settled: .3 });

/** What crowd steering reads of a view: its centre and velocity, and what its senses carry. */
interface CrowdView {
  readonly stance: { readonly centre: { readonly x: number; readonly y: number; readonly z: number }; readonly velocity: { readonly x: number; readonly z: number } };
  readonly senses: Pick<Senses, "side" | "others">;
}

/** A standing body of the walker's side as it is judged: where it is, how it goes, and the room it takes, m. */
interface Neighbour { readonly x: number; readonly z: number; readonly vx: number; readonly vz: number; readonly room: number }

/** The walk chosen and whether the crowd held it back from the walk asked. */
export interface CrowdWalk {
  /** The ground velocity, m/s. */
  readonly x: number;
  readonly z: number;
  /** Whether another body of its side kept it from the walk asked: slower, turned, or with none clear. */
  readonly held: boolean;
}

/** How far a body's parts reach about its centre of mass across the ground, m: its trunk's clearance, or farther where a part is. */
function reachOf(other: Senses["others"][number]): number {
  let most = bodyClearance(other.spec);
  for (const segment of other.segments.values()) most = Math.max(most, hypot(segment.centre.x - other.centre.x, segment.centre.z - other.centre.z));
  return most;
}

/**
 * Where a walker keeps each fallen body of its own side lying (`fallenSolids`), by id: its
 * footprint's least and most x and z, m, and where its centre of mass was when the footprint was
 * taken afresh. Its state (`src/core/state.ts`).
 */
export type FallenMemory = Map<string, { x0: number; x1: number; z0: number; z1: number; x: number; z: number }>;

/**
 * Each fallen body of the walker's own side but `exempt`, down or out of the fight, as a fixed
 * solid a route keeps clear of: the box about its parts' centres, `CROWD.reach` wider, rounded out
 * to `CROWD.grid`, as high as a lying body. None where none lies.
 *
 * A footprint is kept in `memory` from step to step and grows to take in where the parts lie now,
 * so a body twitching where it lies comes to one footprint that holds; it is taken afresh once the
 * body's centre is more than `CROWD.settled` from where it was when last taken, and forgotten once
 * the body is up.
 */
export function fallenSolids(senses: Pick<Senses, "side" | "others">, exempt: string | null, memory: FallenMemory): readonly SolidSense[] {
  let solids: SolidSense[] | null = null;
  for (const other of senses.others) {
    if (other.side !== senses.side) continue;
    if (!(other.down || other.out)) { memory.delete(other.id); continue; }
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const segment of other.segments.values()) {
      minX = Math.min(minX, segment.centre.x); maxX = Math.max(maxX, segment.centre.x);
      minZ = Math.min(minZ, segment.centre.z); maxZ = Math.max(maxZ, segment.centre.z);
    }
    const g = CROWD.grid, x0 = Math.floor((minX - CROWD.reach) / g) * g, x1 = Math.ceil((maxX + CROWD.reach) / g) * g;
    const z0 = Math.floor((minZ - CROWD.reach) / g) * g, z1 = Math.ceil((maxZ + CROWD.reach) / g) * g;
    let kept = memory.get(other.id);
    if (kept && hypot(other.centre.x - kept.x, other.centre.z - kept.z) <= CROWD.settled) {
      kept.x0 = Math.min(kept.x0, x0); kept.x1 = Math.max(kept.x1, x1); kept.z0 = Math.min(kept.z0, z0); kept.z1 = Math.max(kept.z1, z1);
    } else memory.set(other.id, kept = { x0, x1, z0, z1, x: other.centre.x, z: other.centre.z });
    if (other.id === exempt) continue;
    (solids ??= []).push({ name: `fallen:${other.id}`, kind: "box", centre: [(kept.x0 + kept.x1) / 2, .25, (kept.z0 + kept.z1) / 2], size: [kept.x1 - kept.x0, .5, kept.z1 - kept.z0] });
  }
  return solids ?? NONE;
}
const NONE: readonly SolidSense[] = Object.freeze([]);

/**
 * **A walk that keeps clear of its own side's standing bodies**: of the walks that go the way `want`
 * asks (a ground velocity, m/s) or turned from it by up to `CROWD.turns` sixteenths of a turn either
 * side, or none, the one nearest `want` that keeps `CROWD.margin` clear of every such body over
 * the next `CROWD.horizon` s, or the time it takes to stop, if longer; with none clear, the one that comes within another's room the latest.
 *
 * - **Where a walk takes the body** is judged from its velocity now, not from the walk asked: its
 *   velocity changes toward the walk no faster than its gait stops (`Locomotion.stopping`), so a
 *   body still going one way sweeps that way while it brakes.
 * - **Each walk is as fast** as `want`, no faster than its gait holds that way from `heading`
 *   (`paceToward` on its envelope), and no faster than it stops from before another body ahead of
 *   it on that way, at its gait's stopping rate, plus that body's own speed away.
 * - **Another body** goes on at its velocity now. A body already within another's room may move
 *   away from it. A body behind it, on the way it is asked, it leaves to give way: in a queue the
 *   one behind waits, and the one in front goes on.
 *
 * It reads one sensed moment, the same for every mind of the fight, and no other body's choice, so
 * two bodies that meet decide alike in either order, each passing to its right (`CROWD.left`).
 * Null where no body of its side is near enough to matter: `want` as it is.
 */
export function crowdWalk(view: CrowdView, radius: number, heading: number, want: GroundPoint, gait: GaitLimits): CrowdWalk | null {
  const { centre, velocity } = view.stance, { side, others } = view.senses, stopping = gait.stopping;
  const speed = hypot(want.x, want.z), going = hypot(velocity.x, velocity.z);
  // It looks as far ahead as it takes to stop from the speed it goes, at least `CROWD.horizon`.
  const H = stopping > 0 ? Math.max(CROWD.horizon, going / stopping) : CROWD.horizon, samples = Math.ceil(H * CROWD.samples / CROWD.horizon);
  let near: Neighbour[] | null = null;
  for (const other of others) {
    if (other.side !== side || other.out || other.down) continue;
    // A body behind it on the way it is asked is the one to give way: it keeps clear of this one.
    if ((other.centre.x - centre.x) * want.x + (other.centre.z - centre.z) * want.z < 0) continue;
    const room = radius + reachOf(other) + CROWD.margin, w = hypot(other.velocity.x, other.velocity.z);
    if (hypot(other.centre.x - centre.x, other.centre.z - centre.z) > room + (Math.max(speed, going) + w) * H + CROWD.near) continue;
    (near ??= []).push({ x: other.centre.x, z: other.centre.z, vx: other.velocity.x, vz: other.velocity.z, room });
  }
  if (!near) return null;
  /** When a walk at (`cx`, `cz`) first comes deeper within another's room, s from now; Infinity, never inside the horizon. */
  const conflict = (cx: number, cz: number): number => {
    const dt = H / samples;
    let px = centre.x, pz = centre.z, vx = velocity.x, vz = velocity.z;
    const last = near!.map((n) => hypot(n.x - px, n.z - pz));
    for (let k = 1; k <= samples; k++) {
      const ax = cx - vx, az = cz - vz, change = hypot(ax, az), most = stopping * dt;
      if (change > most) { vx += ax * most / change; vz += az * most / change; } else { vx = cx; vz = cz; }
      px += vx * dt; pz += vz * dt;
      const t = k * dt;
      for (let j = 0; j < near!.length; j++) {
        const n = near![j]!, d = hypot(n.x + n.vx * t - px, n.z + n.vz * t - pz);
        if (d < n.room && d < last[j]!) return t;
        last[j] = d;
      }
    }
    return Infinity;
  };
  /** How fast a walk the unit way (`ux`, `uz`) may go: `want`'s speed, what its gait holds that way, and what it stops from before each body ahead. */
  const fastest = (ux: number, uz: number): number => {
    let most = speed;
    if (gait.envelope) most = Math.min(most, paceToward(gait.envelope, ux * sin(heading) + uz * cos(heading), ux * cos(heading) - uz * sin(heading)));
    for (const n of near!) {
      const dx = n.x - centre.x, dz = n.z - centre.z, along = dx * ux + dz * uz, across = Math.abs(dx * uz - dz * ux);
      if (along <= 0 || across >= n.room) continue;
      const gap = Math.max(0, along - Math.sqrt(n.room * n.room - across * across));
      most = Math.min(most, Math.max(0, Math.sqrt(2 * stopping * gap) + n.vx * ux + n.vz * uz));
    }
    return most;
  };
  const wx = speed > 0 ? want.x / speed : 0, wz = speed > 0 ? want.z / speed : 0;
  let best = { x: 0, z: 0, cost: Infinity };
  const consider = (cx: number, cz: number, turned: number): void => {
    const when = conflict(cx, cz), miss = hypot(cx - want.x, cz - want.z);
    const cost = miss * miss + (turned < 0 ? -turned * CROWD.left : 0) + (when === Infinity ? 0 : CROWD.conflict * (1 + (H - when) / H));
    if (cost < best.cost) best = { x: cx, z: cz, cost };
  };
  if (speed > 0) for (let k = 0; k <= 2 * CROWD.turns; k++) {
    // 0, then a sixteenth right, a sixteenth left, two right, ...: right before left at each angle.
    const turned = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 8, c = cos(turned), s = sin(turned);
    // Turned right by `turned` about up: forward (x, z) goes to (x cos + z sin, z cos - x sin).
    const ux = wx * c + wz * s, uz = wz * c - wx * s, most = fastest(ux, uz);
    if (most > 0) consider(ux * most, uz * most, turned);
  }
  consider(0, 0, 0);
  const held = best.x !== want.x || best.z !== want.z;
  return { x: best.x, z: best.z, held };
}
