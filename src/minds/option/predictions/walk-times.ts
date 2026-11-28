import { deepFreeze } from "../../../core/state.ts";
import { hypot } from "../../../core/math/real.ts";
import { remembered } from "../../../core/remembered.ts";
import { measuredFrom, type Side, type Source } from "../../../skills/framework/profile/source.ts";
import type { Arrivals } from "../contract/predictors.ts";
import type { GroundPoint } from "../../../skills/framework/movement.ts";
import type { Origin } from "../../../skills/framework/profile/profile.ts";
import { treesAt, validTrees, type Trees } from "./value/boosted-trees.ts";
import { bodyOf, fittedOn } from "./value/fitted-value.ts";

/**
 * **What a walk's arrival is read from** (`walkFeatures`), by name, in order: the way to its spot,
 * m, straight from where the body stands; the body's speed along that way and across it, m/s; and
 * the focus's closing along it, m/s, toward the body.
 */
export const WALK_FEATURES = deepFreeze(["way", "along", "across", "closing"]);

/**
 * **How long the record's walks took to arrive** (`assets/minds/walk-times.json`, fitted by the
 * measuring command, `research/minds/walk-fit.mjs`): for each gait, as its walk Option names it
 * (its label, in lower case: "run", "quick start"), boosted regression trees over `WALK_FEATURES`
 * for the seconds from a state of a walk to a strike's window to its arrival there (`seconds`, its
 * strike taken next) and the speed along the way it arrived at (`speed`), of the walks the Minds
 * that played its bouts took with both bodies standing, and the span of each feature those states
 * cover (`over`, the least and the most), outside which they read nothing; and the bodies those
 * bouts played.
 */
export interface WalkTimes {
  readonly origin: string;
  readonly from: Origin;
  readonly bodies: readonly string[];
  readonly features: readonly string[];
  readonly gaits: Readonly<Record<string, { readonly over: readonly (readonly [number, number])[]; readonly seconds: Trees; readonly speed: Trees }>>;
}

/** Whether `value` is walk times over today's features (`WALK_FEATURES`). */
export const validWalkTimes = (value: unknown): value is WalkTimes => {
  const v = value as WalkTimes | null;
  return !!v && typeof v === "object" && Array.isArray(v.bodies) && v.bodies.every((body) => typeof body === "string")
    && Array.isArray(v.features) && v.features.length === WALK_FEATURES.length && v.features.every((name, i) => name === WALK_FEATURES[i])
    && !!v.gaits && typeof v.gaits === "object" && Object.values(v.gaits).every((gait) => validTrees(gait?.seconds) && validTrees(gait?.speed)
      && Array.isArray(gait.over) && gait.over.length === WALK_FEATURES.length && gait.over.every((span) => Array.isArray(span) && span.length === 2 && span[0]! <= span[1]!));
};

/**
 * **A walk's state as walk times read it** (`WALK_FEATURES`): the body at `where` moving at
 * `velocity`, the focus moving at `foe`, walking to `spot`; and the way's direction (toward the
 * spot, along x where the body stands at it).
 */
export function walkFeatures(where: GroundPoint, velocity: GroundPoint, foe: GroundPoint, spot: GroundPoint): { readonly x: readonly number[]; readonly ux: number; readonly uz: number } {
  const dx = spot.x - where.x, dz = spot.z - where.z, way = hypot(dx, dz), ux = way > 0 ? dx / way : 1, uz = way > 0 ? dz / way : 0;
  return { x: [way, velocity.x * ux + velocity.z * uz, Math.abs(-velocity.x * uz + velocity.z * ux), -(foe.x * ux + foe.z * uz)], ux, uz };
}

/**
 * **Walk times as a walk asks them** (`Arrivals`), for the body `body` (`bodyOf`), none for a body
 * they were not fitted on: read where its focus is a body they were fitted on too (`fittedOn`), its
 * gait was fitted and the state is within the span its states cover (`over`), the seconds and
 * speed no less than none.
 */
export function walkArrivals(value: WalkTimes, body: string): Arrivals | null {
  if (!value.bodies.includes(body)) return null;
  const side = (name: string): Side => ({ own: true, of: name, by: "name", gaps: [] });
  /** Where a reading against a foe of the body `foe` comes from; made once a foe's body. */
  const against = remembered((foe: string): Source => measuredFrom({ body: side(body), target: side(foe), pairing: true }));
  return (at, gait, spot) => {
    const focus = at.focus, model = value.gaits[gait];
    if (!focus || !model || !fittedOn(value.bodies, body, focus)) return null;
    const { x } = walkFeatures(at.where, at.velocity, focus.velocity, spot);
    if (!x.every((read, f) => read >= model.over[f]![0] && read <= model.over[f]![1])) return null;
    return { seconds: Math.max(0, treesAt(model.seconds, x)), speed: Math.max(0, treesAt(model.speed, x)), source: against(bodyOf(focus.spec)) };
  };
}
