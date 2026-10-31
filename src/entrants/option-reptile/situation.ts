import type { Orders } from "../../core/intent/orders.ts";
import { nearestSurface } from "../../core/intent/targets.ts";
import type { BodySense } from "../../core/mind/senses.ts";
import { blowLife, limbReach, record } from "../../core/option/value.ts";
import type { QuadrupedView } from "../../core/reptile/crawl.ts";
import { REPTILE_BITE } from "../../core/reptile/tuning.ts";
import type { Rulebook } from "../../core/rules/rulebook.ts";
import { strikersOf, type BodySpec } from "../../core/spec/body.ts";
import type { Vec3 } from "../../core/spec/quantity.ts";

/**
 * **What the Option Reptile decides on**, read once a control step: the clock, whether it is down,
 * its view and orders, its focus (the foe its orders name, else the nearest in the fight), how far
 * the focus's nearest surface is from its centre of mass across the ground (`range`, m; Infinity
 * with no focus), how far apart the two centres are (`apart`), and the life a second the focus's
 * blows are expected to take of it where it stands (`pressure`).
 */
export interface ReptileSituation {
  readonly time: number;
  readonly down: boolean;
  readonly view: QuadrupedView;
  readonly orders: Orders | null;
  readonly focus: BodySense | null;
  readonly range: number;
  readonly apart: number;
  readonly pressure: number;
}

/**
 * **How far the mouth of `spec` is ahead of its centre of mass**, m, in its reference pose: the
 * segment with a mouth (`SegmentSpec.points`), its mouth's forward place less the centre's.
 */
export function mouthAhead(spec: BodySpec): number {
  let mass = 0, moment = 0, mouth = 0;
  for (const segment of spec.segments) {
    mass += segment.mass.value; moment += segment.mass.value * segment.centreOfMass.value[2];
    if (segment.points?.mouth) mouth = segment.points.mouth.value[2];
  }
  return mouth - moment / mass;
}

/**
 * **The bite's window**, m from the centre of mass to the focus's nearest surface: where the mouth
 * is within the distance the stalk creeps in from (`REPTILE_BITE.creepNear`).
 */
export const biteWindow = (spec: BodySpec): number => mouthAhead(spec) + REPTILE_BITE.creepNear;

/**
 * **What a blow of `striker`'s `limb` takes of `struck`'s life a second**, by the prior a body
 * holds of an action no record has measured (`record`: its share landed over the seconds one runs),
 * each blow the rules' blunt damage of its energy (`blowLife`) at `at` of `struck`.
 */
export const priorRate = (rules: Rulebook, striker: BodySpec, limb: string, struck: BodySpec, at?: string): number => {
  const prior = record([], null);
  return prior.lands * blowLife(rules, striker, limb, struck, undefined, at) / prior.seconds;
};

/**
 * **The focus's pressure where the body stands**, life a second: of each limb the focus strikes
 * with (`strikersOf`) that reaches `apart` (`limbReach`), the most its prior blows take (`priorRate`);
 * a body throws one blow at a time.
 */
function pressureOf(rules: Rulebook, spec: BodySpec, focus: BodySense | null, apart: number): number {
  if (!focus) return 0;
  let most = 0;
  for (const limb of strikersOf(focus.spec)) if (apart <= limbReach(focus.spec, limb)) most = Math.max(most, priorRate(rules, focus.spec, limb, spec));
  return most;
}

/** Any surface point. */
const ANY = (): boolean => true;

/** **The Option Reptile's situation reader** for a body of `spec` under `rules`, its orders read by `ordersOf` from what it senses. */
export function reptileReader(spec: BodySpec, rules: Rulebook, ordersOf: (view: QuadrupedView) => Orders | null) {
  return {
    read(view: QuadrupedView): ReptileSituation {
      const senses = view.senses, orders = ordersOf(view), centre = view.centre;
      let focus: BodySense | null = null, apart = Infinity;
      for (const other of senses.others) {
        if (other.out || other.side === senses.side || orders?.foe !== undefined && other.id !== orders.foe) continue;
        const dx = other.centre.x - centre.x, dz = other.centre.z - centre.z, far = Math.sqrt(dx * dx + dz * dz);
        if (far < apart) { apart = far; focus = other; }
      }
      const from: Vec3 = [centre.x, centre.y, centre.z], near = focus ? nearestSurface(senses, from, ANY, focus.id) : null;
      const range = near ? Math.sqrt((near.at[0] - centre.x) * (near.at[0] - centre.x) + (near.at[2] - centre.z) * (near.at[2] - centre.z)) : Infinity;
      return { time: senses.time, down: view.down, view, orders, focus, range, apart, pressure: pressureOf(rules, spec, focus, apart) };
    },
  };
}
