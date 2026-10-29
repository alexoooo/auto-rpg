import { GAIT_NAMES, GAITS } from "../../../skills/gaits.ts";
import type { BodySpec } from "../../../spec/body.ts";
import { approachActionWindow } from "../../../mind/action-window.ts";
import { gaitDigest, measuredOn, profileFor, readProfile, type Profile } from "../../../mind/profile.ts";
import { legsReadiness } from "../../../skills/locomotion.ts";
import { blocked, LEGS, READY, type Situation, type Option } from "./option.ts";
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
    const found = profileFor(profiles, measuredOn(spec, gaitDigest(GAITS[gait].legs, strike), hz, null));
    const expected = (found && found.stale === null ? readProfile(found.profile, spec).expect({ range: 0, phase: "clear" }, null) : null) ?? UNMEASURED;
    return Object.freeze({ gait, braced: expected.seconds, down: expected.down });
  });
}

/** An option's name going by `going`: its own braced, else the gait's named after it. */
const named = (name: string, going: Going): string => going.gait === "braced" ? name : `${name}, ${going.gait}`;

/**
 * **Move to a goal** (`Goal`) by `going`'s gait, facing the focus (`toGoal`): footwork, on
 * offer where the legs can carry the body (`legsReadiness`), at a focus out of the goal's band, run its course once in the band, kept out of every fallen body's reach (`Walker.kept`); it
 * always yields and asks for no blow. Its model: the walk to the band's nearer end at the gait's
 * pace, through the blow coming and the focus's pressure while it walks within the focus's reach
 * (`threatened`), leaving the body there as the gait leaves it (`Going`); a walk that ends out of a
 * clinch (`CLINCH`) leaves its chance of going down behind.
 */
export function moveTo(name: string, goal: Goal, walk: Walker, going: Going): Option {
  const UNFIT = blocked("no focus"), THERE = blocked("within its band");
  return {
    name: named(name, going), claims: LEGS, state: {},
    entry: (now) => {
      const legs = legsReadiness(now.sight.view);
      if (legs.kind !== "ready") return legs;
      return !now.focus ? UNFIT : within(now, goal) ? THERE : READY;
    },
    status: (now) => within(now, goal) ? "over" : "yields",
    begin() {},
    end() {},
    model: (now): Terms => {
      const apart = now.range, near = goal.near(now), far = near + goal.width(now);
      const to = apart < near ? near : apart > far ? far : apart, pace = walk.pace(now, going.gait);
      return walkTo(now, to, Math.abs(to - apart) / pace, pace, going);
    },
    step: (now) => ({ asked: walk.kept(now, { ...toGoal(now, goal, walk), actions: [], gait: going.gait }), holds: LEGS }),
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
 * **Into a strike's window** (`StrikeOption.window`) by `going`'s gait: footwork, on offer while
 * the legs can carry the body (`legsReadiness`) and `strike` has a window its legs are to be brought to and no limb ready, run its course once a limb
 * is; it always yields and asks for no blow. It walks to the window's middle at the orders' pace,
 * turning to the target (`approachActionWindow`), kept out of every fallen body's reach but the
 * focus's (`Walker.kept`). It is worth the strike it brings
 * (`StrikeOption.through`: the walk, braced, then the blow): between bodies alike the exchange at the window, its strikes' less the foe's
 * (`pressing`, `pressure`), comes to about nothing, so a walk priced by the place alone is never
 * worth taking.
 */
export function toWindow(strike: StrikeOption, walk: Walker, going: Going): Option {
  const UNFIT = blocked(`no window to walk to for ${strike.name}`);
  return {
    name: named(`into ${strike.name}'s window`, going), claims: LEGS, state: {},
    entry: (now) => {
      const legs = legsReadiness(now.sight.view);
      if (legs.kind !== "ready") return legs;
      return strike.window(now) === null ? UNFIT : READY;
    },
    status: (now) => strike.window(now) === null ? "over" : "yields",
    begin() {},
    end() {},
    model: (now) => strike.through(now, going),
    step: (now) => {
      const window = strike.window(now);
      const asked = window ? { ...approachActionWindow(now.sight.view, window, now.sight.report.heading, now.orders?.pace ?? Infinity), actions: [], gait: going.gait }
        : { move: null, face: walk.facing(now), actions: [], gait: going.gait };
      return { asked: walk.kept(now, asked, now.focus?.id ?? null), holds: LEGS };
    },
  };
}
