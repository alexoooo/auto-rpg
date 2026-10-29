import { GAIT_NAMES, gaitNamed, STOCK_GAITS } from "../../../skills/gaits.ts";
import type { BodySpec } from "../../../spec/body.ts";
import { approachActionWindow } from "../../../mind/action-window.ts";
import type { Readiness } from "../../../skills/action.ts";
import { gaitDigest, measuredOn, profileFor, readProfile, type Profile } from "../../../mind/profile.ts";
import { legsReadiness } from "../../../skills/locomotion.ts";
import { blocked, LEGS, READY, type Situation, type Option, type Status } from "./option.ts";
import { edgeOf, threatened } from "./percepts.ts";
import { fromHere, type Going } from "./position.ts";
import type { StrikeOption } from "./strike.ts";
import { CLINCH, clinched, type Terms } from "./value.ts";
import type { Walker } from "./walk.ts";

/**
 * **A goal**: a band of the range head to head to the focus (`Situation.range`), from `near` and
 * `width` m past it, each read each step from the bodies, so a resized body, a longer weapon or
 * another foe moves it and no number is retuned.
 */
export interface Goal {
  near(now: Situation): number;
  width(now: Situation): number;
}

/** Whether the range head to head to the focus is within `goal`'s band. */
export function within(now: Situation, goal: Goal): boolean {
  const near = goal.near(now), apart = now.range;
  return apart >= near && apart <= near + goal.width(now);
}

/** **Out of the focus's pressure**: past where its pressure reaches (`edgeOf`) by as far as it walks in the time the senses show it late (`Predictions.closes`). */
export const OUT_OF_PRESSURE: Goal = Object.freeze({ near: (now: Situation) => edgeOf(now, now.predictions.pressure) + now.predictions.closes, width: () => Infinity });

/** A gait's prior, where no profile measures it, the owner's decision: braced at once, and up. */
const UNMEASURED = Object.freeze({ seconds: 0, down: 0 });

/**
 * **Each gait** (`GAITS`) as a body of `spec` goes by it at `hz`, stopping to throw the strike of
 * digest `strike` (`skillDigest`): what its profile measured it to leave the body (`Going`, the
 * cell of `profiles`, the gaits', measured as the body reads it, `gaitDigest`); its prior
 * (`UNMEASURED`) where none is.
 */
export function goings(spec: BodySpec, hz: number, strike: string, profiles: readonly Profile[]): readonly Going[] {
  return GAIT_NAMES.map((gait): Going => {
    const found = profileFor(profiles, measuredOn(spec, gaitDigest(gaitNamed(STOCK_GAITS, gait)!.legs, strike), hz, null));
    const expected = (found && found.stale === null ? readProfile(found.profile, spec).expect({ range: 0, phase: "clear" }, null) : null) ?? UNMEASURED;
    return Object.freeze({ gait, braced: expected.seconds, down: expected.down });
  });
}

/**
 * **Where a walk can go**, as a gait's option runs at it (`moveBy`): its name, whether it is a
 * place to walk to now (`entry`, the legs' readiness aside), whether the body has got there
 * (`reached`), what walking there by a gait brings (`model`, `Terms`), and the walk there (`walk`,
 * kept out of what the body keeps clear of, `Walker.kept`).
 */
export interface Destination {
  readonly name: string;
  entry(now: Situation): Readiness;
  reached(now: Situation): boolean;
  model(now: Situation, going: Going): Terms;
  walk(now: Situation): ReturnType<Walker["toward"]>;
}

/**
 * **A goal as a destination** (`Goal`), named `name`: a place to walk to with a focus out of its
 * band, reached within it; the walk to the band's nearer end at the gait's pace, through the blow
 * coming and the focus's pressure while it walks within the focus's reach (`threatened`), leaving
 * the body there as the gait leaves it (`Going`); a walk that ends out of a clinch (`CLINCH`)
 * leaves its chance of going down behind. It walks facing the focus (`toGoal`).
 */
export function toGoalOf(name: string, goal: Goal, walk: Walker): Destination {
  const UNFIT = blocked("no focus"), THERE = blocked("within its band");
  return {
    name,
    entry: (now) => !now.focus ? UNFIT : within(now, goal) ? THERE : READY,
    reached: (now) => within(now, goal),
    model: (now, going) => {
      const apart = now.range, near = goal.near(now), far = near + goal.width(now);
      const to = apart < near ? near : apart > far ? far : apart, pace = walk.pace(now, going.gait);
      return walkTo(now, to, Math.abs(to - apart) / pace, pace, going);
    },
    walk: (now) => walk.kept(now, toGoal(now, goal, walk)),
  };
}

/**
 * **A walk's model**: from the range head to head now to `to` m, `duration` s at `pace` m/s by
 * `going`'s gait, through the blow coming and the focus's pressure while it walks within the focus's
 * reach (`threatened`), leaving the body as the gait does (`Going`); out of a clinch (`CLINCH`), its
 * chance of going down behind.
 */
function walkTo(now: Situation, to: number, duration: number, pace: number, going: Going): Terms {
  const apart = now.range;
  const nearer = Math.min(apart, to), inReach = Math.max(0, Math.min(Math.max(apart, to), edgeOf(now, now.predictions.pressure)) - nearer) / pace;
  const leaves = now.apart + to - apart >= CLINCH.within;
  return { duration, dealt: 0, taken: now.predictions.danger + threatened(now, inReach, nearer), orders: 0,
    exit: fromHere(now, { range: to, down: Math.max(going.down, leaves ? 0 : clinched(now, duration)), unbraced: going.braced }) };
}

/**
 * **The walk to a goal** (`Goal`), facing the focus: in from beyond its band, into the band made
 * centre to centre (head to head less centre to centre taken off each end), or straight at the
 * focus where the heads stand farther apart than the band reaches even with the centres together;
 * back from nearer than its near end; and standing within.
 */
function toGoal(now: Situation, goal: Goal, walk: Walker): ReturnType<Walker["toward"]> {
  const face = walk.facing(now), apart = now.range, outside = goal.near(now), band = goal.width(now);
  const focus = now.focus!, centre = now.sight.view.stance.centre;
  if (apart > outside + band) {
    const near = outside + now.apart - apart, far = near + band;
    if (far <= 0) return walk.toward(now, focus.centre.x - centre.x, focus.centre.z - centre.z, face);
    return walk.range(now, Math.max(0, near), far, face);
  }
  if (apart < outside) return walk.toward(now, -(focus.centre.x - centre.x), -(focus.centre.z - centre.z), face);
  return { move: null, face };
}

/**
 * **A strike's window as a destination** (`StrikeOption.window`): a place to walk to while
 * `strike` has a window its legs are to be brought to and no limb ready, reached once a limb is.
 * It walks to the window's middle at the orders' pace, turning to the target
 * (`approachActionWindow`), kept out of every fallen body's reach but the focus's (`Walker.kept`).
 * It is worth the strike it brings (`StrikeOption.through`: the walk, braced, then the blow):
 * between bodies alike the exchange at the window, its strikes' less the foe's (`pressing`,
 * `pressure`), comes to about nothing, so a walk priced by the place alone is never worth taking.
 */
export function toWindowOf(strike: StrikeOption, walk: Walker): Destination {
  const UNFIT = blocked(`no window to walk to for ${strike.name}`);
  return {
    name: `into ${strike.name}'s window`,
    entry: (now) => strike.window(now) === null ? UNFIT : READY,
    reached: (now) => strike.window(now) === null,
    model: (now, going) => strike.through(now, going),
    walk: (now) => {
      const window = strike.window(now);
      const asked = window ? approachActionWindow(now.sight.view, window, now.sight.report.heading, now.orders?.pace ?? Infinity) : { move: null, face: walk.facing(now) };
      return walk.kept(now, asked, now.focus?.id ?? null);
    },
  };
}

/**
 * **Move by `going`'s gait**: footwork, one option a gait, run at whichever of `destinations` it is
 * worth most to walk to (its targets, `Option.targets`, priced and chosen by the chooser): on offer
 * where the legs can carry the body (`legsReadiness`) and its destination is a place to walk to
 * (`Destination.entry`), run its course once there; it always yields and asks for no blow. Its
 * model and walk are its destination's, by the gait. Named for the gait and where it goes. Its
 * memory is which destination it runs at.
 */
export function moveBy(going: Going, destinations: readonly Destination[]): Option {
  const state = { at: 0 }, gait = gaitNamed(STOCK_GAITS, going.gait)!.label.toLowerCase();
  const to = (): Destination => destinations[state.at]!;
  return {
    get name() { return `${gait} ${to().name}`; },
    claims: LEGS, state, targets: destinations.map((one) => one.name),
    aim(index) { state.at = index; },
    entry: (now) => {
      const legs = legsReadiness(now.sight.view);
      return legs.kind !== "ready" ? legs : to().entry(now);
    },
    status: (now): Status => to().reached(now) ? "over" : "yields",
    begin() {},
    end() {},
    model: (now) => to().model(now, going),
    step: (now) => ({ asked: { ...to().walk(now), actions: [], gait: going.gait }, holds: LEGS }),
  };
}
