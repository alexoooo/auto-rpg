import { stanceFeet } from "../../control/support.ts";
import type { BodyView } from "../../control/body.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { BodySense } from "../../core/bodies/senses.ts";
import type { StanceNumbers, Stances } from "../framework/profile.ts";

/** A point in the world, m. */
type Point = { readonly x: number; readonly y: number; readonly z: number };

/** Each number to the millimetre: what a profile's trial records. */
const mm = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * **How a body of `spec` stands toward a point** (`StanceNumbers`): its left and right feet's
 * segment origins (`foot`, by segment name, `stanceFeet`) against the line over the ground from its
 * centre of mass (`centre`) to `toward`: the left foot's lead along it over the right's (the
 * stagger), their spread across it (the width), and the centre's height over their mean. Null where
 * it has not two feet, a foot is not read, or it stands on the point.
 */
export function stanceNumbers(spec: BodySpec, centre: Point, foot: (segment: string) => Point | undefined, toward: { readonly x: number; readonly z: number }): StanceNumbers | null {
  const feet = stanceFeet(spec), leftEnd = feet.find((one) => one.side === "left"), rightEnd = feet.find((one) => one.side === "right");
  if (!leftEnd || !rightEnd) return null;
  const left = foot(leftEnd.end.segment), right = foot(rightEnd.end.segment);
  if (!left || !right) return null;
  const dx = toward.x - centre.x, dz = toward.z - centre.z, length = Math.sqrt(dx * dx + dz * dz);
  if (!(length > 0)) return null;
  const ux = dx / length, uz = dz / length, sx = left.x - right.x, sz = left.z - right.z;
  return { stagger: mm(sx * ux + sz * uz), width: mm(Math.abs(sx * uz - sz * ux)), height: mm(centre.y - (left.y + right.y) / 2) };
}

/** **How a body stands, read from its own view** (`stanceNumbers`): its segments' poses and its stance's centre of mass; null where the view shows no segments. */
export const ownStance = (spec: BodySpec, view: Pick<BodyView, "segments" | "stance">, toward: { readonly x: number; readonly z: number }): StanceNumbers | null =>
  stanceNumbers(spec, view.stance.centre, (segment) => view.segments?.[segment]?.position, toward);

/**
 * **How a body of `spec` and `other` stand toward each other** (`Stances`): its own from its view
 * (`ownStance`), the other's as sensed (`sensedStance`), each absent where not read.
 */
export function stancesOf(spec: BodySpec, view: Pick<BodyView, "segments" | "stance">, other: BodySense): Stances {
  const own = ownStance(spec, view, other.centre), target = sensedStance(other, view.stance.centre);
  return own && target ? { own, target } : own ? { own } : target ? { target } : {};
}

/** **`stances` from the other body's side**: its `own` the other's, its `target` this one's. */
export const turned = (stances: Stances): Stances =>
  stances.own && stances.target ? { own: stances.target, target: stances.own } : stances.own ? { target: stances.own } : stances.target ? { own: stances.target } : {};

/** **How another body stands, as sensed** (`stanceNumbers`): its sensed segments' poses and centre of mass. */
export const sensedStance = (other: BodySense, toward: { readonly x: number; readonly z: number }): StanceNumbers | null =>
  stanceNumbers(other.spec, other.centre, (segment) => other.segments.get(segment)?.position, toward);
