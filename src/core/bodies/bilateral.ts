import type { BodySpec } from "./spec/body.ts";

/** A side of a bilateral body, independent of player roles in a bout. */
export type Side = "left" | "right";

/** Bilateral anatomy, in left-to-right order. */
export const SIDES: readonly Side[] = Object.freeze(["left", "right"]);

/** The anatomical side across from `side`. */
export const otherSide = (side: Side): Side => side === "left" ? "right" : "left";

/** A limb a bilateral body has one of on each side: a hand or a foot. */
export type PairedLimb = "hand" | "foot";

/** **The segment of `limb` on `side`** (`hand.left`): the name a bilateral body gives its hands and feet. */
export const pairedSegment = (limb: PairedLimb, side: Side): string => `${limb}.${side}`;

/** Whether `segment` is a hand or a foot of a bilateral body (`pairedSegment`). */
export const isPaired = (segment: string): boolean => SIDES.some((side) => segment === pairedSegment("hand", side) || segment === pairedSegment("foot", side));

/** **The sides `spec` has `limb` on**, left first. */
export const sidesWith = (spec: BodySpec, limb: PairedLimb): readonly Side[] =>
  SIDES.filter((side) => spec.segments.some((segment) => segment.name === pairedSegment(limb, side)));
