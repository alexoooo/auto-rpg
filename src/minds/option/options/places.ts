import { ARRIVED } from "../../../skills/framework/movement.ts";
import type { Spot } from "../../../skills/framework/menu.ts";
import type { GaitName } from "../../../skills/framework/skill.ts";
import { hypot } from "../../../core/math/real.ts";
import { approachSpot, atSpot } from "../../../skills/intent/action-window.ts";
import type { PartConfig } from "../../../parts/parts.ts";
import type { PartLookup } from "../../../parts/lookup.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import { PROFILE_SPANS } from "../../../skills/framework/profile/nearest.ts";
import { startVelocity } from "../../../skills/framework/profile/numbers.ts";
import { type StanceNumbers } from "../../../skills/framework/profile/profile.ts";
import { legsReadiness } from "../../../skills/locomotion/shared/locomotion.ts";
import { blocked, READY, standing, still } from "./readiness.ts";
import type { Option, Sites, Status } from "../contract/option.ts";
import type { Situation } from "../contract/situation.ts";
import { LEGS } from "../../../skills/framework/action.ts";
import { bearingAround } from "../situation/percepts.ts";
import { graceAt } from "../situation/reach-memory.ts";
import { gaitStance } from "../../../skills/locomotion/move/gaits.ts";
import { CLINCH, CLINCH_FALLS, clinched } from "../predictions/by-hand.ts";
import { NO_BLOW, PRESSED, STILL, upOrDown } from "./outcomes.ts";
import type { Terms, TermSources } from "../contract/terms.ts";
import { byHand } from "../../../skills/framework/profile/source.ts";
import type { Walker } from "../contract/context.ts";

/** A gait as Option Mind's legs go by it: its name, its label and its legs' config. */
interface GaitOf {
  readonly name: GaitName;
  readonly label: string;
  readonly legs: PartConfig;
}

/** **The gaits `legs` go by to a place** (`LocomotionPart.gaits`): none for legs that go by no gait by name, nor a gait that carries the body nowhere (`GaitPart.travels`). */
export const gaitsOf = (parts: PartLookup, legs: PartConfig, spec: BodySpec): readonly GaitOf[] =>
  (parts.of("locomotion", legs).gaits?.(legs, spec, parts) ?? []).filter(gait => {
    const part = parts.find("gait", gait.legs) ?? parts.find("paw-gait", gait.legs);
    return part !== null && part.travels && part.fits(spec, gait.legs, parts) === null;
  });

/** **Whether `legs` go by the gait `name`** (`LocomotionPart.gaits`), one that fits a body of `spec`, whether or not it carries the body anywhere. */
export const goesBy = (parts: PartLookup, legs: PartConfig, spec: BodySpec, name: string): boolean =>
  (parts.of("locomotion", legs).gaits?.(legs, spec, parts) ?? []).some(gait => gait.name === name && parts.any(gait.legs)?.fits(spec, gait.legs, parts) === null);

/**
 * How far apart a walk's way is read within the focus's reach, m: half the span over which a
 * profile takes its trials as alike (`PROFILE_SPANS.range`), so each span is read about twice.
 */
const WALK_SPACING = PROFILE_SPANS.range / 2;

/**
 * **A walk's model** from `at`: from where the body stands there to `spot` (by its route where it
 * has one) by `gait`, each leg of the way as long as the legs take on it (`Walker.seconds`: the
 * speed rule all along the way, facing the focus, or the way each leg goes with none); through the
 * blow coming, and the focus's pressure along the part of each leg within its reach, the body
 * moving at the walk's velocity against the focus's (`Pressure.dealt`, from as long after `at` as the way has gone, read at the middle of each
 * `WALK_SPACING` of that part, so the reads follow the way's length within reach and not its time),
 * past its grace (`graceAt`: spent as the way goes within its reach, restored as it goes out of it,
 * never past the focus's latency); leaving the body still at the spot with that grace, the focus
 * turned toward it as far as it turns in that time (`Predictions.turns`), and, in a clinch
 * (`CLINCH`), down in its chance of going down behind. A gait's falls are its own profile's to
 * measure; none is, so a walk is taken to stay up. Given how the gait stands the body (`stance`,
 * `gaitStance`), the pressure along the way is read at it, and the body is left standing so.
 */
export function walkTerms(at: Situation, spot: Spot, gait: GaitOf, walk: Walker, stance: StanceNumbers | null = null): Terms | null {
  // Walking by the gait, the body stands as the gait stands it, and the focus's pressure is read there.
  const focus = at.focus, from = at.where, offset = at.apart - at.range, pressure = stance ? at.predictions.pressure.stanced(stance) : at.predictions.pressure;
  const reach = focus ? pressure.edge(at) + offset : 0, points = spot.route ?? [spot];
  // The walk to a spot is ordered as a place to stand within its own nearness of, `ARRIVED` where it states none (`approachSpot`), and priced so.
  const legs = walk.seconds(at, gait.name, points, focus ? walk.facing(at) : null, spot.near ?? ARRIVED);
  let duration = 0, taken = 0, grace = graceAt(at), x = from.x, z = from.z;
  for (let k = 0; k < points.length; k++) {
    const point = points[k]!, dx = point.x - x, dz = point.z - z, length = hypot(dx, dz);
    if (length > 0) {
      const seconds = legs[k]!, pace = length / seconds;
      if (!Number.isFinite(seconds) || !Number.isFinite(duration + seconds)) return null;
      duration += seconds;
      if (focus) {
        // The leg within the focus's reach: from `enter` to `leave` m along it, where it crosses the circle of the reach about the focus.
        const ux = dx / length, uz = dz / length, fx = focus.centre.x, fz = focus.centre.z, ox = x - fx, oz = z - fz;
        const b = ox * ux + oz * uz, square = b * b - (ox * ox + oz * oz - reach * reach), half = square > 0 ? Math.sqrt(square) : 0;
        const enter = square > 0 ? Math.min(length, Math.max(0, -b - half)) : length, leave = square > 0 ? Math.min(length, Math.max(0, -b + half)) : length;
        grace = Math.min(pressure.latency, grace + enter / pace);
        if (leave > enter) {
          const within = leave - enter, pieces = Math.max(1, Math.ceil(within / WALK_SPACING)), dt = within / pace / pieces;
          const moving = { x: ux * pace - focus.velocity.x, z: uz * pace - focus.velocity.z };
          for (let i = 0; i < pieces; i++) {
            const along = enter + (i + 1 / 2) / pieces * within, tx = fx - (x + along * ux), tz = fz - (z + along * uz);
            const spent = Math.min(grace, dt);
            grace -= spent;
            taken += pressure.dealt(at, { apart: hypot(tx, tz) - offset, velocity: startVelocity({ x: tx, z: tz }, moving), seconds: dt - spent,
              from: duration - seconds + enter / pace + i * dt + spent });
          }
        }
        grace = Math.min(pressure.latency, grace + (length - leave) / pace);
      }
    }
    x = point.x; z = point.z;
  }
  if (!focus) return { duration, dealt: 0, taken: at.predictions.danger.life, orders: 0, outcomes: upOrDown({ where: { x: spot.x, z: spot.z, face: spot.face }, velocity: STILL, ...(stance ? { stance } : {}) }, 0), from: WALKED };
  const where = { x: spot.x, z: spot.z, face: spot.face }, apart = hypot(where.x - focus.centre.x, where.z - focus.centre.z), bearing = bearingAround(focus, where.x, where.z);
  const around = (bearing < 0 ? -1 : 1) * Math.max(0, Math.abs(bearing) - at.predictions.turns * duration);
  return { duration, dealt: 0, taken: at.predictions.danger.life + taken, orders: 0,
    outcomes: upOrDown({ where, around, velocity: STILL, grace, ...(stance ? { stance } : {}) }, apart >= CLINCH.within ? 0 : clinched(at, duration)), from: WALKED };
}

/**
 * Where each answer of a walk's price comes from (`Terms.from`). No drill measured a walk: its
 * seconds are its gait's own reckoning of its pace (`Walker.seconds`), a rule written by hand,
 * and its falls are the clinch's, set by hand. It throws no blow, and what it takes on the way is
 * the focus's pressure.
 */
const WALKED: TermSources = Object.freeze({
  duration: byHand([], "no drill measured a walk: its seconds are its gait's own reckoning of its pace"),
  dealt: NO_BLOW, taken: PRESSED, leaves: CLINCH_FALLS,
});

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
export function walkBy(gait: GaitOf, { all: sites, names }: Sites, walk: Walker, spec: BodySpec): Option {
  const state = { at: 0 }, label = gait.label.toLowerCase();
  /** How the body stands walking by the gait (`gaitStance`), where it was measured on a body of its model. */
  const stance = gaitStance(gait.legs as { readonly kind: string; readonly variation?: string }, spec.model);
  /** Where its site at `k` is at `at`, null where it has none or the body is there. */
  const away = (at: Situation, k: number): Spot | null => {
    const spot = sites[k]?.spot(at) ?? null, where = at.where;
    return spot && !(still(at) && atSpot(spot, where.x, where.z, where.face)) ? spot : null;
  };
  return {
    get name() { return `${label} to ${names[state.at] ?? "nowhere"}`; },
    kind: "walk", claims: LEGS, state, targets: names,
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
      const spot = standing(at) ? away(at, ask.target ?? 0) : null;
      return spot ? walkTerms(at, spot, gait, walk, stance) : null;
    },
    step: (now) => {
      const spot = away(now, state.at), heading = now.sight.report.legs.heading;
      const asked = spot ? approachSpot(now.sight.view, spot, now.orders?.pace ?? Infinity, heading) : { move: null, face: walk.facing(now) };
      return { asked: { ...walk.kept(now, asked, spot?.by ?? null), actions: [], gait: gait.name }, holds: LEGS };
    },
  };
}
