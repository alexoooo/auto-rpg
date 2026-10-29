import type { Readiness } from "../../skills/action.ts";
import { GAIT_NAMES, GAITS } from "../../skills/gaits.ts";
import type { BodySpec } from "../../spec/body.ts";
import { dataOf } from "../../data/store.ts";
import { approachActionWindow } from "../action-window.ts";
import { gaitDigest, measuredOn, profileFor, readProfile } from "../profile.ts";
import { blocked, LEGS, READY, type Situation, type StandingOption } from "./option.ts";
import { threatened } from "./percepts.ts";
import { fromHere, type Going } from "./position.ts";
import type { StrikeOption } from "./strike.ts";
import { CLINCH, clinched, type Terms } from "./value.ts";
import type { Walker } from "./walk.ts";

/**
 * **A goal**: a band of the range head to head to the focus (`Reach.apart`), from `near` and
 * `width` m past it, each read each step from the bodies, so a resized body, a longer weapon or
 * another foe moves it and no number is retuned.
 */
export interface Goal {
  near(now: Situation): number;
  width(now: Situation): number;
}

/** Whether the range head to head to the focus is within `goal`'s band. */
export function within(now: Situation, goal: Goal): boolean {
  const near = goal.near(now), apart = now.reach.apart;
  return apart >= near && apart <= near + goal.width(now);
}

/**
 * **How far the focus's pressure reaches** (`Situation.pressure`), m head to head: its modelled
 * strikes' farthest range at the body's phase (`ProfileReading.reach`), as the range now places
 * it; built by hand, the focus's hands' reach (`Reach.theirs`).
 */
export function pressureEdge(now: Situation): number {
  const { model, phase } = now.pressure;
  if (model.length === 0) return now.reach.theirs;
  let range = -Infinity;
  for (const reading of model) range = Math.max(range, reading.reach(phase));
  return now.reach.apart + range - now.apart;
}

/** **Out of the focus's pressure**: past where its pressure reaches (`pressureEdge`) by as far as it walks in the time the senses show it late (`Situation.closes`). */
export const OUT_OF_PRESSURE: Goal = Object.freeze({ near: (now: Situation) => pressureEdge(now) + now.closes, width: () => Infinity });

/**
 * **Each gait** (`GAITS`) as a body of `spec` goes by it at `hz`, stopping to throw the strike of
 * digest `strike` (`skillDigest`): what its profile measured it to leave the body (`Going`, the
 * cell of `dataOf("gait-profiles")` measured as the body reads it, `gaitDigest`); braced at once
 * and up where none is.
 */
export function goings(spec: BodySpec, hz: number, strike: string): readonly Going[] {
  return GAIT_NAMES.map((gait): Going => {
    const found = profileFor(dataOf("gait-profiles"), measuredOn(spec, gaitDigest(GAITS[gait].legs, strike), hz, null));
    const expected = found && found.stale === null ? readProfile(found.profile, spec).expect({ range: 0, phase: "clear" }, null) : null;
    return Object.freeze({ gait, braced: expected?.seconds ?? 0, down: expected?.down ?? 0 });
  });
}

/** An option's name going by `going`: its own braced, else the gait's named after it. */
const named = (name: string, going: Going): string => going.gait === "braced" ? name : `${name}, ${going.gait}`;

/**
 * **Move to a goal** (`Goal`) by `going`'s gait, facing a standing focus (`toGoal`): footwork, on
 * offer standing at a standing focus out of the goal's band, run its course once in the band; it
 * always yields and asks for no blow. Its model: the walk to the band's nearer end at the gait's
 * pace, through the blow coming and the focus's pressure while it walks within the focus's reach
 * (`threatened`), leaving the body there as the gait leaves it (`Going`); a walk that ends out of a
 * clinch (`CLINCH`) leaves its chance of going down behind.
 */
export function moveTo(name: string, goal: Goal, walk: Walker, going: Going): StandingOption {
  const UNFIT = blocked("no standing focus"), THERE = blocked("within its band");
  const AWAY: Readiness = Object.freeze({ kind: "waiting", reason: "not in its band" });
  return {
    name: named(name, going), posture: "standing", claims: LEGS, state: {},
    entry: (now) => now.down || !now.focus || now.focus.down ? UNFIT : within(now, goal) ? THERE : READY,
    exit: (now) => within(now, goal) ? READY : AWAY,
    holds: () => LEGS,
    yields: () => true,
    ended: (now) => within(now, goal),
    begin() {},
    end() {},
    model: (now): Terms => {
      const apart = now.reach.apart, near = goal.near(now), far = near + goal.width(now);
      const to = apart < near ? near : apart > far ? far : apart, pace = walk.pace(now, going.gait);
      return walkTo(now, to, Math.abs(to - apart) / pace, pace, going);
    },
    step: (now) => ({ ...toGoal(now, goal, walk), actions: [], gait: going.gait }),
  };
}

/**
 * **A walk's model**: from the range head to head now to `to` m, `duration` s at `pace` m/s by
 * `going`'s gait, through the blow coming and the focus's pressure while it walks within the focus's
 * reach (`threatened`), leaving the body as the gait does (`Going`); out of a clinch (`CLINCH`), its
 * chance of going down behind.
 */
function walkTo(now: Situation, to: number, duration: number, pace: number, going: Going): Terms {
  const apart = now.reach.apart;
  const nearer = Math.min(apart, to), inReach = Math.max(0, Math.min(Math.max(apart, to), now.reach.theirs) - nearer) / pace;
  const leaves = now.apart + to - apart >= CLINCH.within;
  return { duration, dealt: 0, taken: now.danger + threatened(now, inReach, nearer), orders: 0,
    exit: fromHere(now, { apart: to, down: Math.max(going.down, leaves ? 0 : clinched(now, duration)), braced: going.braced }) };
}

/**
 * **The walk to a goal** (`Goal`), facing the focus: in from beyond its band, into the band made
 * centre to centre (head to head less centre to centre taken off each end), or straight at the
 * focus where the heads stand farther apart than the band reaches even with the centres together;
 * back from nearer than its near end; and standing within.
 */
function toGoal(now: Situation, goal: Goal, walk: Walker): ReturnType<Walker["toward"]> {
  const face = walk.facing(now), apart = now.reach.apart, outside = goal.near(now), band = goal.width(now);
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
 * `strike` has a window its legs are to be brought to and no limb ready, run its course once a limb
 * is; it always yields and asks for no blow. It walks to the window's middle at the orders' pace,
 * turning to the target (`approachActionWindow`). It is worth the strike it brings
 * (`StrikeOption.through`: the walk, braced, then the blow): between bodies alike the exchange at the window, its strikes' less the foe's
 * (`pressing`, `pressure`), comes to about nothing, so a walk priced by the place alone is never
 * worth taking.
 */
export function toWindow(strike: StrikeOption, walk: Walker, going: Going): StandingOption {
  const UNFIT = blocked(`no window to walk to for ${strike.name}`);
  const AWAY: Readiness = Object.freeze({ kind: "waiting", reason: "not in its window" });
  return {
    name: named(`into ${strike.name}'s window`, going), posture: "standing", claims: LEGS, state: {},
    entry: (now) => now.down || strike.window(now) === null ? UNFIT : READY,
    exit: (now) => strike.window(now) === null ? READY : AWAY,
    holds: () => LEGS,
    yields: () => true,
    ended: (now) => strike.window(now) === null,
    begin() {},
    end() {},
    model: (now) => strike.through(now, going),
    step: (now) => {
      const window = strike.window(now);
      return window ? { ...approachActionWindow(now.sight.view, window, now.sight.report.heading, now.orders?.pace ?? Infinity), actions: [], gait: going.gait }
        : { move: null, face: walk.facing(now), actions: [], gait: going.gait };
    },
  };
}
