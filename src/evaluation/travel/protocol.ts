import { sin, cos } from "../../core/math/real.ts";
import type { Loadout } from "../../core/bodies/items/held.ts";
import type { Orders } from "../../minds/orders.ts";
import type { GroundPoint } from "../../skills/framework/movement.ts";
import { ARRIVAL } from "../../minds/command/goals.ts";
import type { LoneCue } from "../lone.ts";

/**
 * Minimum travel capability targets, independent of a controller's advertised envelope. A walking
 * start walks `walked` s at `directional` before the run is asked; a route runs `leg` m ahead, then
 * `aside` m to one side; a moved goal is `ahead` m ahead until `moved` s after the start, when it
 * moves `aside` m to one side; a place is met within the commanders' arrival (`ARRIVAL.point`).
 */
export const TRAVEL = Object.freeze({ start: 1, forward: 4, directional: 1, entry: 4, headingEntry: 6,
  hold: 10, circleSpeed: 2, circleRate: 1, corner: 5, reverse: 7, tangent: 2,
  stop: 2, quiet: 2, still: .15, corridor: 1, angle: 20 * Math.PI / 180, hz: 120,
  reverseGuide: .5, stepClear: .05, walked: 3, leg: 24, aside: 12, ahead: 40, moved: 6, near: ARRIVAL.point });

export type TravelMode = "forward" | "heading" | "facing" | "circle" | "corner" | "reverse" | "walking" | "route" | "moved";
export type TravelCondition = { readonly model: "man"; readonly mode: TravelMode;
  readonly way: number; readonly sense: 1 | -1; readonly pace: number; readonly heading: number;
  readonly loadout: Loadout; readonly seed: number; readonly gusts: boolean };

const travelWay = (angle: number) => ({ x: sin(angle), z: cos(angle) });
export const travelTurns = (mode: TravelMode): boolean => mode === "circle" || mode === "corner" || mode === "reverse";
/** Whether `mode` orders a place (a route, a goal moved) rather than a way. */
export const travelPlaced = (mode: TravelMode): boolean => mode === "route" || mode === "moved";

/** `distance` m from `from` along `angle`. */
const ahead = (from: GroundPoint, angle: number, distance: number): GroundPoint => ({ x: from.x + distance * sin(angle), z: from.z + distance * cos(angle) });

/**
 * Order times and the requested route; a direction change never resets the physical body. A place
 * is held to the trial's end, so it gives no stop: the body is to have stopped there by the time
 * its course's legs take at the pace after the entry (`stop`).
 */
export function travelScript(c: TravelCondition) {
  const turning = travelTurns(c.mode), circle = c.mode === "circle", placed = travelPlaced(c.mode);
  const begin = TRAVEL.start + (c.mode === "walking" ? TRAVEL.walked : 0);
  const deadline = c.mode === "heading" ? TRAVEL.headingEntry : TRAVEL.entry;
  const cue = begin + deadline + (circle ? 0 : TRAVEL.hold);
  const transition = circle ? Math.round(2 * Math.PI / TRAVEL.circleRate * TRAVEL.hz) / TRAVEL.hz : c.mode === "corner" ? TRAVEL.corner : TRAVEL.reverse;
  const initial = turning || placed ? c.heading : c.heading + c.way * Math.PI / 180;
  const aside = c.heading + c.sense * Math.PI / 2;
  const final = placed ? aside : turning ? c.heading + c.sense * (circle ? 2 * Math.PI : c.mode === "corner" ? Math.PI / 2 : Math.PI) : initial;
  const holdFrom = turning ? cue + transition : begin + deadline;
  const course = c.mode === "route" ? TRAVEL.leg + TRAVEL.aside : TRAVEL.ahead + TRAVEL.aside;
  const stop = placed ? begin + deadline + course / c.pace : holdFrom + (circle ? TRAVEL.tangent : TRAVEL.hold);
  const order = (angle: number, face: Orders["face"] = c.mode === "facing" ? travelWay(c.heading) : null): Orders =>
    ({ move: { kind: "direct", direction: travelWay(angle) }, pace: c.pace, gait: "run", face });
  const place = (points: readonly GroundPoint[]): Orders => ({ move: { kind: "place", points, near: TRAVEL.near }, pace: c.pace, gait: "run", face: null });
  const origin = { x: 0, z: 0 }, corner = ahead(origin, c.heading, TRAVEL.leg), far = ahead(origin, c.heading, TRAVEL.ahead);
  const goal = c.mode === "route" ? ahead(corner, aside, TRAVEL.aside) : c.mode === "moved" ? ahead(far, aside, TRAVEL.aside) : null;
  const cues: LoneCue[] = [{ at: 0, orders: { move: null, face: travelWay(c.heading) } }];
  if (c.mode === "walking") cues.push({ at: TRAVEL.start, orders: { move: { kind: "direct", direction: travelWay(initial) }, pace: TRAVEL.directional, face: null } });
  if (c.mode === "route") cues.push({ at: begin, orders: place([corner, goal!]) });
  else if (c.mode === "moved") cues.push({ at: begin, orders: place([far]) }, { at: begin + TRAVEL.moved, orders: place([goal!]) });
  else cues.push({ at: begin, orders: order(initial) });
  if (circle) {
    for (let k = 0; k / TRAVEL.hz < transition; k++) cues.push({ at: cue + k / TRAVEL.hz,
      orders: order(c.heading + c.sense * TRAVEL.circleRate * k / TRAVEL.hz) });
    cues.push({ at: holdFrom, orders: order(final) });
  } else if (turning) {
    // The opposite move begins immediately; a quarter-turn facing cue selects its turning route.
    cues.push({ at: cue, orders: order(final, c.mode === "reverse" ? travelWay(c.heading + c.sense * Math.PI / 2) : null) });
    if (c.mode === "reverse") cues.push({ at: cue + TRAVEL.reverseGuide, orders: order(final) });
  }
  if (!placed) cues.push({ at: stop, orders: { move: null, face: travelWay(c.mode === "facing" ? c.heading : final) } });
  return { cues, begin, deadline, cue, transition, holdFrom, stop, end: stop + TRAVEL.stop + TRAVEL.quiet, initial, final, goal };
}
