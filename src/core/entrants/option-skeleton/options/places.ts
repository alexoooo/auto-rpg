import { cos, hypot, sin } from "../../../math/real.ts";
import type { BodySpec } from "../../../spec/body.ts";
import { approachActionWindow, approachSpot, windowSpot, type Spot } from "../../../mind/action-window.ts";
import type { PartConfig } from "../../../mind/parts.ts";
import type { Readiness } from "../../../skills/action.ts";
import type { GaitName } from "../../../skills/gaits.ts";
import { gaitDigest, measuredOn, profileFor, readProfile, type Profile } from "../../../mind/profile.ts";
import { legsReadiness } from "../../../skills/locomotion.ts";
import { deepFreeze } from "../../../state.ts";
import { blocked, LEGS, READY, type Option, type Situation, type Status } from "./option.ts";
import { bearingAround, edgeOf, threatened } from "./percepts.ts";
import { fromHere, type Going } from "./position.ts";
import type { StrikeOption } from "./strike.ts";
import { CLINCH, clinched, type Terms } from "./value.ts";
import type { Walker } from "./walk.ts";

/** A gait's prior, where no profile measures it, the owner's decision: braced at once, and up. */
const UNMEASURED = Object.freeze({ seconds: 0, down: 0 });

/** A gait as Option Mind's legs go by it: its name (null for legs that walk by none), its label and its legs' config. */
export interface GaitOf {
  readonly name: GaitName | null;
  readonly label: string;
  readonly legs: PartConfig;
}

/** A strike a gait's profile stops to throw: its action's name and its digest (`skillDigest`). */
export interface Stopping {
  readonly name: string;
  readonly skill: string;
}

/**
 * **Each of `gaits`** as a body of `spec` goes by it at `hz`, stopping to throw each of `strikes`:
 * what its profile measured it to leave the body (`Going`, the cell of `profiles`, the gaits',
 * measured as the body reads it, `gaitDigest`), its prior (`UNMEASURED`) for a strike none measures.
 */
export function goings(spec: BodySpec, hz: number, gaits: readonly GaitOf[], strikes: readonly Stopping[], profiles: readonly Profile[]): readonly Going[] {
  return gaits.map((gait): Going => {
    const ready: Record<string, number> = {};
    let braced = 0, down = 0;
    for (const strike of strikes) {
      const found = profileFor(profiles, measuredOn(spec, gaitDigest(gait.legs, strike.skill), hz, null));
      const expected = (found && found.stale === null ? readProfile(found.profile, spec).expect({ range: 0, phase: "clear" }, null) : null) ?? UNMEASURED;
      ready[strike.name] = expected.seconds; braced = Math.max(braced, expected.seconds); down = Math.max(down, expected.down);
    }
    return deepFreeze({ gait: gait.name, label: gait.label, ready, braced, down });
  });
}

/** What an option asks of the legs walking to a place. */
type Walk = ReturnType<Walker["kept"]>;

/**
 * **A destination**: a place a walk goes to, as footwork runs at it (`walkBy`): its name; where on the ground it is
 * now (`spot`, the way the body faces there included), null where it has none, which its entry says
 * why; whether the body has got there (`reached`); and the walk there now (`walk`).
 */
export interface Destination {
  readonly name: string;
  spot(now: Situation): Spot | null;
  entry(now: Situation): Readiness;
  reached(now: Situation): boolean;
  walk(now: Situation): Walk;
}

/** `spot`'s where it is, read once a step at each focus: its memory, the step and focus it last read at. */
function once(spot: (now: Situation) => Spot | null): (now: Situation) => Spot | null {
  const memory = { time: NaN, focus: null as string | null, spot: null as Spot | null };
  return (now) => {
    const focus = now.focus?.id ?? null;
    if (memory.time !== now.time || memory.focus !== focus) { memory.time = now.time; memory.focus = focus; memory.spot = spot(now); }
    return memory.spot;
  };
}

/** The orders' pace, as a walk's ceiling. */
const ceilingOf = (now: Situation): number => now.orders?.pace ?? Infinity;

/**
 * **Into `strike`'s window** (`StrikeOption.window`), where it stands now, while it has one its legs
 * are to be brought to and no limb is ready, so a new strike adds its own place: at the window's
 * middle, turning to the target, beside a body lying (`windowSpot`), the walk there
 * (`approachActionWindow`), kept out of every fallen body's reach but the focus's (`Walker.kept`);
 * reached once a limb is ready.
 */
export function windowPlace(strike: StrikeOption, walk: Walker): Destination {
  const NO_WINDOW = blocked(`no window to walk to for ${strike.name}`);
  const into = once((now) => {
    const window = strike.window(now);
    return window ? windowSpot(now.sight.view, window, now.sight.report.heading) : null;
  });
  return {
    name: `into ${strike.name}'s window`, spot: into,
    entry: (now) => into(now) ? READY : NO_WINDOW,
    reached: (now) => strike.window(now) === null,
    walk: (now) => {
      const window = strike.window(now);
      const asked = window ? approachActionWindow(now.sight.view, window, now.sight.report.heading, ceilingOf(now)) : { move: null, face: walk.facing(now) };
      return walk.kept(now, asked, now.focus?.id ?? null);
    },
  };
}

/**
 * **Out of the focus's pressure**: on the line from the focus through the body, past where its
 * pressure reaches (`edgeOf`) by as far as it walks in the time the senses show it late
 * (`Predictions.closes`), facing it; a place while the body stands nearer, reached there. Its
 * walk faces the focus, kept out of every fallen body's reach (`Walker.kept`).
 */
export function outOfPressure(walk: Walker): Destination {
  const UNFIT = blocked("no focus"), THERE = blocked("out of its reach");
  const edge = (now: Situation): number => edgeOf(now, now.predictions.pressure) + now.predictions.closes;
  const spot = once((now) => {
    const focus = now.focus;
    if (!focus || now.range >= edge(now)) return null;
    const centre = now.sight.view.stance.centre, apart = now.apart, to = edge(now) + apart - now.range;
    const x = apart > 0 ? (centre.x - focus.centre.x) / apart : -sin(walk.facing(now)), z = apart > 0 ? (centre.z - focus.centre.z) / apart : -cos(walk.facing(now));
    return { x: focus.centre.x + x * to, z: focus.centre.z + z * to, face: walk.facing(now) };
  });
  return {
    name: "out of pressure", spot,
    entry: (now) => !now.focus ? UNFIT : spot(now) ? READY : THERE,
    reached: (now) => now.range >= edge(now),
    walk: (now) => {
      const at = spot(now), face = walk.facing(now);
      return walk.kept(now, at ? approachSpot(now.sight.view, at, ceilingOf(now), face) : { move: null, face });
    },
  };
}

/**
 * **A walk's model**: from where the body stands to `spot` (by its route where it has one) by
 * `going`'s gait, each leg of the way at what the gait holds walking that way facing the focus
 * (`Walker.pace`; forward where it holds nothing that way); through the blow coming, and the focus's
 * pressure over the time the way runs within its reach (`threatened`, at the nearest it comes);
 * leaving the body at the spot, the focus turned toward it as far as it turns in that time
 * (`Predictions.turns`), and as the gait leaves it (`Going`); out of a clinch (`CLINCH`), its chance
 * of going down behind.
 */
export function walkTerms(now: Situation, spot: Spot, going: Going, walk: Walker): Terms {
  const focus = now.focus!, centre = now.sight.view.stance.centre, offset = now.apart - now.range;
  const reach = edgeOf(now, now.predictions.pressure) + offset, points = spot.route ?? [spot];
  let duration = 0, inReach = 0, nearest = Infinity, x = centre.x, z = centre.z;
  for (const point of points) {
    const dx = point.x - x, dz = point.z - z, length = hypot(dx, dz);
    if (length > 0) {
      const face = walk.facing(now), forward = (dx * sin(face) + dz * cos(face)) / length, right = (dx * cos(face) - dz * sin(face)) / length;
      const way = walk.pace(now, going.gait, forward, right), pace = way > 0 ? way : walk.pace(now, going.gait);
      const within = alongWithin(x - focus.centre.x, z - focus.centre.z, dx, dz, reach);
      duration += length / pace; inReach += within.inside * length / pace; nearest = Math.min(nearest, within.nearest);
    } else nearest = Math.min(nearest, hypot(x - focus.centre.x, z - focus.centre.z));
    x = point.x; z = point.z;
  }
  const apart = hypot(spot.x - focus.centre.x, spot.z - focus.centre.z), bearing = bearingAround(focus, spot.x, spot.z);
  const around = (bearing < 0 ? -1 : 1) * Math.max(0, Math.abs(bearing) - now.predictions.turns * duration);
  return { duration, dealt: 0, taken: now.predictions.danger + threatened(now, inReach, nearest - offset), orders: 0,
    exit: fromHere(now, { range: apart - offset, down: Math.max(going.down, apart >= CLINCH.within ? 0 : clinched(now, duration)),
      unbraced: going.braced, around, at: spot, ready: going.ready }) };
}

/**
 * Along the way from (`x`, `z`) by (`dx`, `dz`), both from a centre: the share of it within `reach`
 * m of that centre (`inside`), and the nearest it comes to it, m (`nearest`).
 */
function alongWithin(x: number, z: number, dx: number, dz: number, reach: number): { readonly inside: number; readonly nearest: number } {
  const a = dx * dx + dz * dz, b = x * dx + z * dz, c = x * x + z * z - reach * reach;
  const t = Math.min(1, Math.max(0, -b / a)), nearest = hypot(x + t * dx, z + t * dz), disc = b * b - a * c;
  if (!(reach > 0) || disc <= 0) return { inside: 0, nearest };
  const root = Math.sqrt(disc), from = Math.max(0, (-b - root) / a), to = Math.min(1, (-b + root) / a);
  return { inside: Math.max(0, to - from), nearest };
}

/**
 * **Walk by `going`'s gait**: footwork, one option a gait, run at whichever of `places` it is worth
 * most to walk to (its targets, `Option.targets`, priced and chosen by the chooser): on offer where
 * the legs can carry the body (`legsReadiness`) and its place is one to walk to (`Destination.entry`),
 * run its course once there; it always yields and asks for no blow. Its model is the walk there
 * (`walkTerms`), which the chooser looks past (`Place.at`); its walk is its destination's, by the gait.
 * Named for the gait and where it goes. Its memory is which place it runs at.
 */
export function walkBy(going: Going, places: readonly Destination[], walk: Walker): Option {
  const state = { at: 0 }, gait = going.label.toLowerCase();
  const to = (): Destination => places[state.at]!;
  return {
    get name() { return `${gait} ${to().name}`; },
    claims: LEGS, state, targets: places.map((one) => one.name),
    aim(index) { state.at = index; },
    entry: (now) => {
      const legs = legsReadiness(now.sight.view);
      return legs.kind !== "ready" ? legs : !now.focus ? NO_FOCUS : to().entry(now);
    },
    status: (now): Status => to().reached(now) ? "over" : "yields",
    begin() {},
    end() {},
    model: (now) => walkTerms(now, to().spot(now)!, going, walk),
    step: (now) => ({ asked: { ...to().walk(now), actions: [], ...(going.gait === null ? {} : { gait: going.gait }) }, holds: LEGS }),
  };
}

/** A walk with no focus to walk about. */
const NO_FOCUS = blocked("no focus");
