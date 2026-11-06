import { sin, cos } from "../../core/math/real.ts";
import type { Loadout } from "../../core/bodies/items/held.ts";
import type { Orders } from "../../skills/intent/orders.ts";
import type { LoneCue } from "../lone.ts";

/** Minimum travel capability targets, independent of a controller's advertised envelope. */
export const TRAVEL = Object.freeze({ start: 1, forward: 4, directional: 1, entry: 4, headingEntry: 6,
  hold: 10, circleSpeed: 2, circleRate: 1, corner: 5, reverse: 7, tangent: 2,
  stop: 2, quiet: 2, still: .15, corridor: 1, angle: 20 * Math.PI / 180, hz: 120,
  reverseGuide: .5, stepClear: .05 });

export type TravelMode = "forward" | "heading" | "facing" | "circle" | "corner" | "reverse";
export type TravelCondition = { readonly model: "workshop-fighter"; readonly mode: TravelMode;
  readonly way: number; readonly sense: 1 | -1; readonly pace: number; readonly heading: number;
  readonly loadout: Loadout; readonly seed: number; readonly gusts: boolean };

const travelWay = (angle: number) => ({ x: sin(angle), z: cos(angle) });
export const travelTurns = (mode: TravelMode): boolean => mode === "circle" || mode === "corner" || mode === "reverse";

/** Order times and the requested route; a direction change never resets the physical body. */
export function travelScript(c: TravelCondition) {
  const turning = travelTurns(c.mode), circle = c.mode === "circle";
  const deadline = c.mode === "heading" ? TRAVEL.headingEntry : TRAVEL.entry;
  const cue = TRAVEL.start + deadline + (circle ? 0 : TRAVEL.hold);
  const transition = circle ? Math.round(2 * Math.PI / TRAVEL.circleRate * TRAVEL.hz) / TRAVEL.hz : c.mode === "corner" ? TRAVEL.corner : TRAVEL.reverse;
  const initial = turning ? c.heading : c.heading + c.way * Math.PI / 180;
  const final = turning ? c.heading + c.sense * (circle ? 2 * Math.PI : c.mode === "corner" ? Math.PI / 2 : Math.PI) : initial;
  const holdFrom = turning ? cue + transition : TRAVEL.start + deadline;
  const stop = holdFrom + (circle ? TRAVEL.tangent : TRAVEL.hold);
  const order = (angle: number, face: Orders["face"] = c.mode === "facing" ? travelWay(c.heading) : null): Orders =>
    ({ move: { kind: "direct", direction: travelWay(angle) }, pace: c.pace, gait: "run", face });
  const cues: LoneCue[] = [{ at: 0, orders: { move: null, face: travelWay(c.heading) } },
    { at: TRAVEL.start, orders: order(initial) }];
  if (circle) {
    for (let k = 0; k / TRAVEL.hz < transition; k++) cues.push({ at: cue + k / TRAVEL.hz,
      orders: order(c.heading + c.sense * TRAVEL.circleRate * k / TRAVEL.hz) });
    cues.push({ at: holdFrom, orders: order(final) });
  } else if (turning) {
    // The opposite move begins immediately; a quarter-turn facing cue selects its turning route.
    cues.push({ at: cue, orders: order(final, c.mode === "reverse" ? travelWay(c.heading + c.sense * Math.PI / 2) : null) });
    if (c.mode === "reverse") cues.push({ at: cue + TRAVEL.reverseGuide, orders: order(final) });
  }
  cues.push({ at: stop, orders: { move: null, face: travelWay(c.mode === "facing" ? c.heading : final) } });
  return { cues, deadline, cue, transition, holdFrom, stop, end: stop + TRAVEL.stop + TRAVEL.quiet, initial, final };
}
