import { cos, hypot, sin } from "../../core/math/real.ts";
import { approachSpot, atSpot, type Spot } from "../../skills/intent/action-window.ts";
import type { PartConfig } from "../../parts/parts.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import { startVelocity } from "../../skills/framework/profile.ts";
import { legsReadiness } from "../../skills/locomotion/locomotion.ts";
import { blocked, LEGS, READY, standing, still, type Option, type Sites, type Situation } from "./option.ts";
import type { Status } from "../choice.ts";
import { bearingAround, dealtAt, edgeOf, graceAt } from "./percepts.ts";
import { CLINCH, clinched, STILL, upOrDown, type Terms } from "./value.ts";
import type { GaitName } from "../../skills/locomotion/gaits.ts";
import type { Walker } from "./walk.ts";

/** A gait as Option Mind's legs go by it: its name, its label and its legs' config. */
export interface GaitOf {
  readonly name: GaitName;
  readonly label: string;
  readonly legs: PartConfig;
}

/** **The gaits `legs` go by** (`LocomotionPart.gaits`); none for legs that go by no gait by name. */
export const gaitsOf = (parts: PartLookup, legs: PartConfig): readonly GaitOf[] => parts.of("locomotion", legs).gaits?.(legs) ?? [];

/** The time step a walk's way is read at, s: within the focus's reach, its pressure is read at the range of each step's middle (`walkTerms`). */
const WALK_READ = .05;

/**
 * **A walk's model** from `at`: from where the body stands there to `spot` (by its route where it
 * has one) by `gait`, each leg of the way at what the gait holds walking that way facing the
 * focus (`Walker.pace`; forward where it holds nothing that way); through the blow coming, and the
 * focus's pressure at each range the way passes within its reach, the body moving at the walk's
 * velocity against the focus's (`dealtAt`, read every
 * `WALK_READ` s), past its grace (`graceAt`: spent as the way goes within its reach, restored as it
 * goes out of it, never past the focus's latency); leaving the body still at the spot with that grace, the focus turned toward it as far as it turns in that time
 * (`Predictions.turns`), and, in a clinch (`CLINCH`), down in its chance of going down behind. A
 * gait's falls are its own profile's to measure; none is, so a walk is taken to stay up. With no
 * focus, the way at the gait's pace.
 */
export function walkTerms(at: Situation, spot: Spot, gait: GaitOf, walk: Walker, horizon = WALK_READ): Terms | null {
  const focus = at.focus, from = at.where, offset = at.apart - at.range, pressure = at.predictions.pressure;
  const reach = focus ? edgeOf(at, pressure) + offset : 0, points = spot.route ?? [spot];
  let duration = 0, taken = 0, grace = graceAt(at), x = from.x, z = from.z;
  for (const point of points) {
    const dx = point.x - x, dz = point.z - z, length = hypot(dx, dz);
    if (length > 0) {
      const face = walk.facing(at), forward = (dx * sin(face) + dz * cos(face)) / length, right = (dx * cos(face) - dz * sin(face)) / length;
      const way = walk.pace(at, gait.name, forward, right), pace = way > 0 ? way : walk.pace(at, gait.name);
      if (!(pace > 0)) return null;
      const seconds = length / pace;
      if (!Number.isFinite(seconds) || !Number.isFinite(duration + seconds)) return null;
      duration += seconds;
      if (focus) {
        const pieces = Math.max(1, Math.ceil(Math.min(seconds, horizon) / WALK_READ)), dt = seconds / pieces;
        const moving = { x: dx / length * pace - focus.velocity.x, z: dz / length * pace - focus.velocity.z };
        for (let i = 0; i < pieces; i++) {
          const along = (i + .5) / pieces, tx = focus.centre.x - (x + along * dx), tz = focus.centre.z - (z + along * dz), apart = hypot(tx, tz);
          if (apart >= reach) { grace = Math.min(pressure.latency, grace + dt); continue; }
          const spent = Math.min(grace, dt);
          grace -= spent;
          taken += dealtAt(pressure, at, apart - offset, dt - spent, startVelocity({ x: tx, z: tz }, moving));
        }
      }
    }
    x = point.x; z = point.z;
  }
  const where = { x: spot.x, z: spot.z, face: spot.face };
  if (!focus) return { duration, dealt: 0, taken: at.predictions.danger, orders: 0, outcomes: upOrDown({ where, velocity: STILL }, 0) };
  const apart = hypot(spot.x - focus.centre.x, spot.z - focus.centre.z), bearing = bearingAround(focus, spot.x, spot.z);
  const around = (bearing < 0 ? -1 : 1) * Math.max(0, Math.abs(bearing) - at.predictions.turns * duration);
  return { duration, dealt: 0, taken: at.predictions.danger + taken, orders: 0,
    outcomes: upOrDown({ where, around, velocity: STILL, grace }, apart >= CLINCH.within ? 0 : clinched(at, duration)) };
}

/** No site to walk to. */
const NOWHERE = blocked("no site to walk to"), THERE = blocked("at its site"), NO_PACE = blocked("no attainable walking pace");

/**
 * **Walk by `gait`**: one option a gait, meaning go to a place by that gait, its targets
 * (`Option.targets`, priced and chosen by the chooser) the sites its mind's options name (`Sites`,
 * `Option.sites`, which it reads as spots and knows nothing else of): on offer where the legs can
 * carry the body (`legsReadiness`) and the body is not still at its site (`still`, `atSpot`), over
 * once it is: a walk leaves the body still at its spot, so one come there moving has not arrived.
 * It always yields and asks for no blow. Its model at a state where the body stands (`standing`)
 * and is not still at its site is the walk there from where it stands (`walkTerms`); its walk goes there (`approachSpot`) by the gait, at the orders' pace, kept out of
 * every fallen body's reach but the one the spot is beside (`Walker.kept`). Named for the gait and
 * where it goes. Its memory is which site it runs at.
 */
export function walkBy(gait: GaitOf, { all: sites, names }: Sites, walk: Walker): Option {
  const state = { at: 0 }, label = gait.label.toLowerCase();
  /** Where its site at `k` is at `at`, null where it has none or the body is there. */
  const away = (at: Situation, k: number): Spot | null => {
    const spot = sites[k]?.spot(at) ?? null, where = at.where;
    return spot && !(still(at) && atSpot(spot, where.x, where.z, where.face)) ? spot : null;
  };
  return {
    get name() { return `${label} to ${names[state.at] ?? "nowhere"}`; },
    claims: LEGS, state, targets: names,
    aim(index) { state.at = index; },
    entry: (now) => {
      const legs = legsReadiness(now.sight.view);
      return legs.kind !== "ready" ? legs : !(walk.pace(now, gait.name) > 0) ? NO_PACE
        : away(now, state.at) ? READY : sites[state.at]?.spot(now) ? THERE : NOWHERE;
    },
    status: (now): Status => away(now, state.at) ? "yields" : "over",
    begin() {},
    end() {},
    model(at, ask) {
      const spot = standing(at) ? away(at, ask?.target ?? 0) : null;
      return spot ? walkTerms(at, spot, gait, walk, ask?.until) : null;
    },
    step: (now) => {
      const spot = away(now, state.at), heading = now.sight.report.heading;
      const asked = spot ? approachSpot(now.sight.view, spot, now.orders?.pace ?? Infinity, heading) : { move: null, face: walk.facing(now) };
      return { asked: { ...walk.kept(now, asked, spot?.by ?? null), actions: [], gait: gait.name }, holds: LEGS };
    },
  };
}
