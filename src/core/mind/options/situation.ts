import { hypot } from "../../math/real.ts";
import { rangeOf } from "../../skills/strike.ts";
import type { BodySpec, Side } from "../../spec/body.ts";
import type { Orders } from "../orders.ts";
import type { BodySense } from "../senses.ts";
import type { Sight } from "../tactics.ts";
import { READINGS, threatReader } from "../threat.ts";
import type { Situation } from "./option.ts";
import { blowEnergy, cost, record } from "./value.ts";

/**
 * The chance a foe's blow predicted to reach the head lands; and how many blows a second a
 * standing foe throws within its reach, of which as many land as of the body's own (`record`): two
 * bodies trading blows land alike.
 */
const LANDS = .3, RATE = 1;

/** Whether `spec` has both hands to strike with: what the reach readings measure. */
const twoHanded = (spec: BodySpec): boolean => ["hand.left", "hand.right"].every((hand) => spec.effectors?.some((effector) => effector.segment === hand) ?? false);

/** How far a hand of `striker` reaches a head `up` m over its own, m head to head across the ground: its range's outer bound. */
const outer = (striker: BodySpec, up: number): number => { const range = rangeOf(striker, "right", up); return range.reach + range.along[1]; };

/**
 * **A body's situation reader** (`Situation`), its orders read through `ordersOf`, for a body of
 * `spec`. The focus is the foe the orders name; else the one it fought, while it is still in the
 * fight; else the nearest, a standing one where any stands. Its memory is the focus's id.
 */
export function situationReader(spec: BodySpec, ordersOf: (sight: Sight) => Orders | null) {
  const threat = threatReader(), state = { focus: null as string | null };
  const focusOf = (sight: Sight, orders: Orders | null): BodySense | null => {
    const { senses, stance } = sight.view;
    const foe = (id: string | null) => id === null ? null : senses.others.find((other) => other.id === id && !other.out && other.side !== senses.side) ?? null;
    if (orders?.foe !== undefined) return foe(orders.foe);
    const current = foe(state.focus);
    if (current) return current;
    let near: BodySense | null = null, distance = Infinity;
    const standing = senses.others.some((other) => !other.out && other.side !== senses.side && !other.down);
    for (const other of senses.others) {
      if (other.out || other.side === senses.side || standing && other.down) continue;
      const apart = hypot(other.centre.x - stance.centre.x, other.centre.z - stance.centre.z);
      if (apart < distance) { near = other; distance = apart; }
    }
    return near;
  };
  /** The focus's reach and this body's, head to head, and how far apart the heads are. */
  const reachOf = (sight: Sight, focus: BodySense | null): Situation["reach"] => {
    if (!focus) return { apart: Infinity, theirs: 0, mine: 0 };
    const mine = sight.view.head, theirs = focus.segments.get(focus.spec.marks.high)?.centre ?? focus.centre;
    return { apart: hypot(theirs.x - mine.x, theirs.z - mine.z), theirs: twoHanded(focus.spec) ? outer(focus.spec, mine.y - theirs.y) : 0,
      mine: twoHanded(spec) ? outer(spec, theirs.y - mine.y) : 0 };
  };
  const heavier = (striker: BodySpec, struck: BodySpec): number => Math.max(blowEnergy(striker, "left", struck), blowEnergy(striker, "right", struck));
  return {
    state,
    read(sight: Sight): Situation {
      const orders = ordersOf(sight), focus = focusOf(sight, orders), centre = sight.view.stance.centre;
      state.focus = focus?.id ?? null;
      const blow = threat.blowOf(sight.view, READINGS.predicted);
      const blows: Record<Side, number> = { left: focus ? blowEnergy(spec, "left", focus.spec) : 0, right: focus ? blowEnergy(spec, "right", focus.spec) : 0 };
      return { sight, time: sight.view.time, down: sight.view.down, orders, focus,
        apart: focus ? hypot(focus.centre.x - centre.x, focus.centre.z - centre.z) : Infinity, threat: threat.threatOf(sight.view, READINGS.threat), incoming: blow?.cover ?? null,
        danger: blow ? LANDS * cost(blowEnergy(blow.foe.spec, blow.hand, spec, blow.closing)) : 0,
        reach: reachOf(sight, focus), exposure: focus && !focus.down ? RATE * record(sight.report.ledger, null).lands * cost(heavier(focus.spec, spec)) : 0, blows };
    },
  };
}
