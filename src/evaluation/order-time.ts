/**
 * **The time a body loses against its orders**, s: the value of a move, read by the drills that
 * give a lone body orders by script (`LoneCue`). A move order is read over its span, from the cue
 * that gives it until one changes its pace or ends it: with a pace, the seconds its progress falls
 * short of that pace over the span (going faster gains nothing, the pace being a ceiling); with no
 * pace, the seconds it falls short of `UNPACED`, so going faster gains. A direct move's progress is
 * its speed along the way asked, and it goes on through a change of way at the same pace. A place's
 * is how much less of its route the body has to go (`routeLeft`): the route from where the body was
 * when the order came through the order's points, read from the point of it nearest the body plus
 * how far the body is off it. Its span is its own (a place given again begins another, from where
 * the body is then), and once its route is gone it asks nothing more. Under a stop, every second the body is not standing still is lost. A body down
 * makes no progress, so its time down is lost under either. Before its first order a body is asked
 * nothing.
 */
import type { GroundPoint, MovementRequest } from "../skills/framework/movement.ts";
import type { LoneCue } from "./lone.ts";
import { hypot } from "../core/math/real.ts";

/** The speed a move with no pace is read against, m/s: a person's run, so each metre short of it costs a quarter second. */
export const UNPACED = 4;

/** Under what speed a body standing is still, m/s. */
const STILL = .15;

/** A place's route: its points in order, how near the last the order is met, m, and the length from each point on to the last, m. */
type Route = { readonly points: readonly GroundPoint[]; readonly near: number; readonly rest: readonly number[] };

/**
 * What the body is asked: nothing yet; to go a way, or to a place by a route of `length` m from
 * where the order found it, at a pace (none: as fast as it goes); or to stop.
 */
type Asked = { readonly kind: "none" } | { readonly kind: "stop" }
  | { readonly kind: "go"; readonly way: GroundPoint; readonly pace: number | null }
  | { readonly kind: "place"; readonly route: Route; readonly length: number; readonly pace: number | null };

/** `points`' route met within `near`: the length from each point on to the last. */
function routeOf(points: readonly GroundPoint[], near: number): Route {
  const rest = points.map(() => 0);
  for (let k = points.length - 2; k >= 0; k--) rest[k] = rest[k + 1]! + hypot(points[k + 1]!.x - points[k]!.x, points[k + 1]!.z - points[k]!.z);
  return { points, near, rest };
}

/**
 * **What is left of a route to a place from `at`**, m: the route through `points` in order from the
 * point of it nearest `at` on (the furthest such where two are as near), and how far `at` is off it,
 * less how near the last point the order is met (`near`), never under 0; and the point the body is
 * to make for next, the end of the leg it is nearest (the first point where it is nearest the
 * route's start from short of it). A body that strays or overshoots has that much more to go, and
 * one that cuts a corner is read from the leg it is nearest, so a route is not shortened by going
 * straight to its last point.
 */
export function routeLeft(points: readonly GroundPoint[], near: number, at: GroundPoint): { readonly left: number; readonly toward: GroundPoint } {
  const { left, next } = along(routeOf(points, near), at);
  return { left, toward: points[next]! };
}

/** What is left of `route` from `at`, m, and the index of the point to make for next (`routeLeft`). */
function along({ points, near, rest }: Route, at: GroundPoint): { readonly left: number; readonly next: number } {
  const last = points.length - 1;
  if (last === 0) return { left: Math.max(0, hypot(points[0]!.x - at.x, points[0]!.z - at.z) - near), next: 0 };
  let nearest = Infinity, left = 0, next = last;
  for (let k = 0; k < last; k++) {
    const a = points[k]!, b = points[k + 1]!, dx = b.x - a.x, dz = b.z - a.z, length = hypot(dx, dz);
    const t = length > 0 ? Math.min(1, Math.max(0, ((at.x - a.x) * dx + (at.z - a.z) * dz) / (length * length))) : 1;
    const off = hypot(a.x + t * dx - at.x, a.z + t * dz - at.z);
    if (off <= nearest) { nearest = off; left = off + (1 - t) * length + rest[k + 1]!; next = k === 0 && t === 0 && off > 0 ? 0 : k + 1; }
  }
  return { left: Math.max(0, left - near), next };
}

/** What is left of `route` from `at`, m (`routeLeft`). */
const leftOf = (route: Route, at: GroundPoint): number => along(route, at).left;

/** The way a direct `move` asks, as a unit ground direction. */
function wayOf(direction: GroundPoint): GroundPoint {
  const length = hypot(direction.x, direction.z) || 1;
  return { x: direction.x / length, z: direction.z / length };
}

/** What `move` at `pace` asks of a body at `at`. */
function askedOf(move: MovementRequest, pace: number | null, at: GroundPoint): Asked {
  switch (move.kind) {
    case "direct": return { kind: "go", way: wayOf(move.direction), pace };
    case "place": { const route = routeOf([{ x: at.x, z: at.z }, ...move.points], move.near); return { kind: "place", route, length: leftOf(route, at), pace }; }
    case "range": throw new Error("a scripted drill reads a direct or a place move, not a range");
    default: { const never: never = move; throw new Error(`no movement ${JSON.stringify(never)}`); }
  }
}

/**
 * **What a trial under `cues` loses against them**, stepped once a world step at `hz` with the
 * centre of mass's ground point and velocity and whether the body is down. Its reading: the seconds
 * lost (`lost`), and how long the body had been down when the trial ended, s (`downFor`, null where
 * it stood), so a reading of the value can charge the rest of the rise.
 */
export function orderTime(cues: readonly LoneCue[], hz: number) {
  let asked: Asked = { kind: "none" }, next = 0, steps = 0, span = 0, made = 0, lost = 0, downSince: number | null = null;
  /** Where the body was at the step before (none before the first), and what was left of the place's route then. */
  let wasX = NaN, wasZ = NaN, left = 0;
  /** The seconds the move under way has lost so far against its pace. */
  const shortfall = (): number => {
    if (asked.kind !== "go" && asked.kind !== "place") return 0;
    const speed = asked.pace ?? UNPACED, short = (Math.min(speed * span, asked.kind === "place" ? asked.length : Infinity) - made) / speed;
    return asked.pace === null ? short : Math.max(0, short);
  };
  return {
    step(at: GroundPoint, velocity: GroundPoint, down: boolean) {
      const before = steps++;
      while (next < cues.length && Math.round(cues[next]!.at * hz) <= before) {
        const orders = cues[next++]!.orders;
        if (orders?.move === undefined) continue;
        const now: Asked = orders.move === null ? { kind: "stop" } : askedOf(orders.move, orders.pace ?? null, Number.isNaN(wasX) ? at : { x: wasX, z: wasZ });
        // A direct move goes on through a change of way at the same pace; any other change ends its span.
        if (!(asked.kind === "go" && now.kind === "go" && asked.pace === now.pace)) { lost += shortfall(); span = 0; made = 0; }
        asked = now;
        if (asked.kind === "place") left = asked.length;
      }
      wasX = at.x; wasZ = at.z;
      const dt = 1 / hz, time = steps / hz;
      downSince = down ? downSince ?? time : null;
      switch (asked.kind) {
        case "none": break;
        case "go": span += dt; if (!down) made += (velocity.x * asked.way.x + velocity.z * asked.way.z) * dt; break;
        case "place": { span += dt; const now = leftOf(asked.route, at); if (!down) made += left - now; left = now; break; }
        case "stop": if (down || hypot(velocity.x, velocity.z) >= STILL) lost += dt; break;
        default: { const never: never = asked; throw new Error(`nothing asked ${JSON.stringify(never)}`); }
      }
    },
    reading(): { readonly lost: number; readonly downFor: number | null } {
      return { lost: lost + shortfall(), downFor: downSince === null ? null : steps / hz - downSince };
    },
  };
}

/**
 * **A move's value**, s lost: its trial's seconds lost against the orders, and where the trial ended
 * with the body down, the rest of its rise, `rise` s (its body's time to stand) less the time it
 * had been down. Lower is better.
 */
export const ordersValue = (r: { readonly lost: number; readonly downFor: number | null }, rise: number): number =>
  r.lost + (r.downFor === null ? 0 : Math.max(0, rise - r.downFor));
