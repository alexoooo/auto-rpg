import { atan2, cos, hypot, sin } from "../math/real.ts";
import { approachActionWindow, approachSpot, heldBeside, windowSpot, type Spot } from "../intent/action-window.ts";
import type { PartConfig } from "../parts/parts.ts";
import type { Readiness } from "../skills/framework/action.ts";
import type { LocomotionConfig } from "../skills/config.ts";
import { gaitsOfMove, type MoveConfig } from "../skills/locomotion/move-part.ts";
import { startVelocity } from "../skills/framework/profile.ts";
import { legsReadiness } from "../skills/locomotion/locomotion.ts";
import { blocked, LEGS, READY, standing, type Option, type Situation } from "./option.ts";
import type { Status } from "../mind/choice.ts";
import { bearingAround, dealtAt, edgeOf, graceAt } from "./percepts.ts";
import { CLINCH, clinched, STILL, upOrDown, type Ground, type Terms } from "./value.ts";
import type { GaitName } from "../skills/locomotion/gaits.ts";
import type { Walker } from "./walk.ts";

/** A gait as Option Mind's legs go by it: its name (null for legs that walk by none), its label and its legs' config. */
export interface GaitOf {
  readonly name: GaitName | null;
  readonly label: string;
  readonly legs: PartConfig;
}

/** **The gaits `legs` go by**: Move's (`gaitsOfMove`), else the legs as one gait that names none. */
export function gaitsOf(legs: LocomotionConfig): readonly GaitOf[] {
  if (legs.kind === "move") return gaitsOfMove(legs as MoveConfig);
  return [{ name: null, label: "Walk", legs }];
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
  /** What it holds from step to step (`HeldBeside`, what it read this step), where it holds anything: plain data, in its walk's state. */
  readonly state?: object;
  spot(now: Situation): Spot | null;
  entry(now: Situation): Readiness;
  reached(now: Situation): boolean;
  walk(now: Situation): Walk;
}

/** What `once` keeps of a place: the time, focus and spot of the body it last read at, and what it read, plain data in its place's state. */
interface Once<T> { time: number; focus: string | null; x: number; z: number; spot: T | null }

/** A place's memory before it has read (`once`). */
const unread = <T>(): Once<T> => ({ time: NaN, focus: null, x: NaN, z: NaN, spot: null });

/** `spot`'s where it is, read once a step at each focus and each spot the body stands at (`Situation.where`, a state an Option leaves it in), kept in `memory`. */
function once<T>(spot: (now: Situation) => T | null, memory: Once<T>): (now: Situation) => T | null {
  return (now) => {
    const focus = now.focus?.id ?? null, { x, z } = now.where;
    if (memory.time !== now.time || memory.focus !== focus || memory.x !== x || memory.z !== z) {
      memory.time = now.time; memory.focus = focus; memory.x = x; memory.z = z; memory.spot = spot(now);
    }
    return memory.spot;
  };
}

/** A place about a focus, with none. */
const NO_FOCUS = blocked("no focus");

/** The orders' pace, as a walk's ceiling. */
const ceilingOf = (now: Situation): number => now.orders?.pace ?? Infinity;

/** An option with a window (`Option.window`): what a walk into it goes to (`windowPlace`). */
export type Windowed = Option & Required<Pick<Option, "window">>;

/**
 * **Into `strike`'s window** (`Option.window`), where it stands now, while it has one its legs
 * are to be brought to and no limb is ready, so a new strike adds its own place: at the window's
 * middle, turning to the target, beside a body lying (`windowSpot`), the walk there
 * (`approachActionWindow`), kept out of every fallen body's reach but the focus's (`Walker.kept`);
 * reached once a limb is ready.
 */
export function windowPlace(strike: Windowed, walk: Walker): Destination {
  const NO_WINDOW = blocked(`no window to walk to for ${strike.name}`), NO_PLACE = blocked(`no place beside the body lying clears the feet for ${strike.name}`);
  // The place beside a body lying, held while it holds, for its spot and its walk alike.
  const state = { beside: heldBeside(), into: unread<Spot>() };
  const into = once((now) => {
    const window = strike.window(now);
    return window ? windowSpot(now.sight.view, window, now.sight.report.heading, state.beside) : null;
  }, state.into);
  return {
    name: `into ${strike.name}'s window`, spot: into, state,
    entry: (now) => !now.focus ? NO_FOCUS : into(now) ? READY : strike.window(now) ? NO_PLACE : NO_WINDOW,
    reached: (now) => strike.window(now) === null,
    walk: (now) => {
      const window = strike.window(now);
      const asked = window ? approachActionWindow(now.sight.view, window, now.sight.report.heading, ceilingOf(now), undefined, undefined, state.beside) : { move: null, face: walk.facing(now) };
      return walk.kept(now, asked, now.focus?.id ?? null);
    },
  };
}

/** The name of the place out of the focus's pressure (`outOfPressure`): where holding is held (`Option.site`). */
export const OUT_OF_PRESSURE = "out of pressure";

/**
 * **Out of the focus's pressure**: on the line from the focus through the body, where its pressure
 * reaches (`edgeOf`), the focus as it stands, facing it; a place while the body stands nearer, reached there. Its
 * walk faces the focus, kept out of every fallen body's reach (`Walker.kept`).
 */
export function outOfPressure(walk: Walker): Destination {
  const THERE = blocked("out of its reach");
  const edge = (now: Situation): number => edgeOf(now, now.predictions.pressure);
  const state = { spot: unread<Spot>() };
  const spot = once((now) => {
    const focus = now.focus;
    if (!focus || now.range >= edge(now)) return null;
    const centre = now.where, apart = now.apart, to = edge(now) + apart - now.range;
    const x = apart > 0 ? (centre.x - focus.centre.x) / apart : -sin(walk.facing(now)), z = apart > 0 ? (centre.z - focus.centre.z) / apart : -cos(walk.facing(now));
    return { x: focus.centre.x + x * to, z: focus.centre.z + z * to, face: walk.facing(now) };
  }, state.spot);
  return {
    name: OUT_OF_PRESSURE, spot, state,
    entry: (now) => !now.focus ? NO_FOCUS : spot(now) ? READY : THERE,
    reached: (now) => now.range >= edge(now),
    walk: (now) => {
      const at = spot(now), face = walk.facing(now);
      return walk.kept(now, at ? approachSpot(now.sight.view, at, ceilingOf(now), face) : { move: null, face });
    },
  };
}

/** No place found this step. */
const NOWHERE = blocked("no place found");

/**
 * **A place found by a rule**, `name`: where `where` finds it each step (any rule: geometry, a
 * search over candidates; read once a step, `once`), null where it finds none; facing its way
 * there; a place while the body's centre stands more than `within` m off it, reached within. Its
 * walk goes there (`approachSpot`), kept out of every fallen body's reach (`Walker.kept`). Footwork
 * of any mind's own walks to it as to the toolkit's places (`walksTo`).
 */
export function placeBy(name: string, where: (now: Situation) => Ground | null, within: number, walk: Walker): Destination {
  const THERE = blocked("there");
  const state = { found: unread<Ground>() }, found = once(where, state.found);
  const off = (now: Situation, at: Ground): number => hypot(at.x - now.where.x, at.z - now.where.z);
  const spot = (now: Situation): Spot | null => {
    const at = found(now);
    if (!at) return null;
    const centre = now.where;
    return { x: at.x, z: at.z, face: off(now, at) > 0 ? atan2(at.x - centre.x, at.z - centre.z) : now.sight.report.heading };
  };
  return {
    name, spot, state,
    entry: (now) => {
      const at = found(now);
      return !at ? NOWHERE : off(now, at) > within ? READY : THERE;
    },
    reached: (now) => {
      const at = found(now);
      return at !== null && off(now, at) <= within;
    },
    walk: (now) => {
      const at = spot(now);
      return walk.kept(now, at ? approachSpot(now.sight.view, at, ceilingOf(now), at.face) : { move: null, face: walk.facing(now) });
    },
  };
}

/** **A place on the ground**, (`x`, `z`) m, whatever the focus (`placeBy`). */
export function groundPlace(x: number, z: number, within: number, walk: Walker): Destination {
  const at: Ground = { x, z };
  return placeBy(`to (${x}, ${z})`, () => at, within, walk);
}

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
export function walkTerms(at: Situation, spot: Spot, gait: GaitOf, walk: Walker): Terms {
  const focus = at.focus, from = at.where, offset = at.apart - at.range, pressure = at.predictions.pressure;
  const reach = focus ? edgeOf(at, pressure) + offset : 0, points = spot.route ?? [spot];
  let duration = 0, taken = 0, grace = graceAt(at), x = from.x, z = from.z;
  for (const point of points) {
    const dx = point.x - x, dz = point.z - z, length = hypot(dx, dz);
    if (length > 0) {
      const face = walk.facing(at), forward = (dx * sin(face) + dz * cos(face)) / length, right = (dx * cos(face) - dz * sin(face)) / length;
      const way = walk.pace(at, gait.name, forward, right), pace = way > 0 ? way : walk.pace(at, gait.name), seconds = length / pace;
      duration += seconds;
      if (focus) {
        const pieces = Math.max(1, Math.ceil(seconds / WALK_READ)), dt = seconds / pieces;
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

/**
 * **Walk by `gait`**: footwork, one option a gait, run at whichever of `places` it is worth
 * most to walk to (its targets, `Option.targets`, priced and chosen by the chooser): on offer where
 * the legs can carry the body (`legsReadiness`) and its place is one to walk to (`Destination.entry`),
 * run its course once there; it always yields and asks for no blow. Its model at a state where the
 * body stands (`standing`) and its place is one to walk to is the walk there from where it stands
 * (`walkTerms`), the place read as it is now; its walk is its destination's, by the gait. Named for
 * the gait and where it goes. Its memory is which place it runs at.
 */
export function walkBy(gait: GaitOf, places: readonly Destination[], walk: Walker): Option {
  const state = { at: 0, places: places.map((one) => one.state ?? null) }, label = gait.label.toLowerCase();
  const to = (): Destination => places[state.at]!;
  return {
    get name() { return `${label} ${to().name}`; },
    claims: LEGS, state, targets: places.map((one) => one.name),
    aim(index) { state.at = index; },
    entry: (now) => {
      const legs = legsReadiness(now.sight.view);
      return legs.kind !== "ready" ? legs : to().entry(now);
    },
    status: (now): Status => to().reached(now) ? "over" : "yields",
    begin() {},
    end() {},
    model(at, ask) {
      const place = places[ask?.target ?? 0]!, spot = standing(at) && place.entry(at).kind === "ready" ? place.spot(at) : null;
      return spot ? walkTerms(at, spot, gait, walk) : null;
    },
    step: (now) => ({ asked: { ...to().walk(now), actions: [], ...(gait.name === null ? {} : { gait: gait.name }) }, holds: LEGS }),
  };
}

