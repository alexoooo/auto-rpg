/**
 * **The time a body loses against its orders**, s: the value of a move, read by the drills that
 * give a lone body orders by script (`LoneCue`). A move order is read over its span, from the cue
 * that gives it until one changes its pace or ends it: with a pace, the seconds its progress along
 * the way asked falls short of that pace over the span (going faster gains nothing, the pace being
 * a ceiling); with no pace, the seconds it falls short of `UNPACED`, so going faster gains. Under a
 * stop, every second the body is not standing still is lost. A body down makes no progress, so its
 * time down is lost under either. Before its first order a body is asked nothing.
 */
import type { MovementRequest } from "../skills/framework/movement.ts";
import type { LoneCue } from "./lone.ts";
import { hypot } from "../core/math/real.ts";

/** The speed a move with no pace is read against, m/s: a person's run, so each metre short of it costs a quarter second. */
export const UNPACED = 4;

/** Under what speed a body standing is still, m/s. */
const STILL = .15;

/** What the body is asked: nothing yet, to go a way at a pace (none: as fast as it goes), or to stop. */
type Asked = { readonly kind: "none" } | { readonly kind: "go"; readonly way: { readonly x: number; readonly z: number }; readonly pace: number | null } | { readonly kind: "stop" };

/** The way `move` asks, as a unit ground direction. */
function wayOf(move: MovementRequest): { readonly x: number; readonly z: number } {
  switch (move.kind) {
    case "direct": { const length = hypot(move.direction.x, move.direction.z) || 1; return { x: move.direction.x / length, z: move.direction.z / length }; }
    case "place": case "range": throw new Error(`a scripted drill reads only a direct move, not ${move.kind}`);
    default: { const never: never = move; throw new Error(`no movement ${JSON.stringify(never)}`); }
  }
}

/**
 * **What a trial under `cues` loses against them**, stepped once a world step at `hz` with the
 * centre of mass's ground velocity and whether the body is down. Its reading: the seconds lost
 * (`lost`), and how long the body had been down when the trial ended, s (`downFor`, null where it
 * stood), so a reading of the value can charge the rest of the rise.
 */
export function orderTime(cues: readonly LoneCue[], hz: number) {
  let asked: Asked = { kind: "none" }, next = 0, steps = 0, span = 0, made = 0, lost = 0, downSince: number | null = null;
  /** The seconds the move under way has lost so far against its pace. */
  const shortfall = (): number => {
    if (asked.kind !== "go") return 0;
    const speed = asked.pace ?? UNPACED, short = (speed * span - made) / speed;
    return asked.pace === null ? short : Math.max(0, short);
  };
  return {
    step(velocity: { readonly x: number; readonly z: number }, down: boolean) {
      const before = steps++;
      while (next < cues.length && Math.round(cues[next]!.at * hz) <= before) {
        const orders = cues[next++]!.orders;
        if (orders?.move === undefined) continue;
        const now: Asked = orders.move === null ? { kind: "stop" } : { kind: "go", way: wayOf(orders.move), pace: orders.pace ?? null };
        // A move goes on through a change of way at the same pace; any other change ends its span.
        if (!(asked.kind === "go" && now.kind === "go" && asked.pace === now.pace)) { lost += shortfall(); span = 0; made = 0; }
        asked = now;
      }
      const dt = 1 / hz, time = steps / hz;
      downSince = down ? downSince ?? time : null;
      switch (asked.kind) {
        case "none": break;
        case "go": span += dt; if (!down) made += (velocity.x * asked.way.x + velocity.z * asked.way.z) * dt; break;
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
