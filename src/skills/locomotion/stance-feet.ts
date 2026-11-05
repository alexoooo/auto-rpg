import type { BodySpec, BearingEnd } from "../../core/bodies/spec/body.ts";
import type { Side } from "../../core/bodies/bilateral.ts";
import { stanceFeet } from "../../control/support.ts";
import { FIELD_BIT, type LegsGoal, type LegsAsked } from "../framework/skill.ts";
import type { Footing } from "./locomotion.ts";

/** **The ends a stance stands on**, by name, each with its side (`stanceFeet`). */
export type StanceFeet = Readonly<Record<BearingEnd, Side>>;

/** The ends `spec` names that a stance stands on (`StanceFeet`). */
export function stanceFeetOf(spec: BodySpec): StanceFeet {
  const feet: Record<BearingEnd, Side> = {};
  for (const { end, side } of stanceFeet(spec)) feet[end.name] = side;
  return Object.freeze(feet);
}

/** The actual segment of each bilateral stance foot. */
export function stanceSegmentsOf(spec: BodySpec): Readonly<Record<Side, string>> {
  return Object.freeze(Object.fromEntries(stanceFeet(spec).map(({ end, side }) => [side, end.segment]))) as Readonly<Record<Side, string>>;
}

/** **A legs goal on a stance's feet**: its footing by side (`onStanceFeet`). */
export type SidedAsk<G extends LegsGoal = LegsAsked> = Omit<G, "footing"> & { readonly footing?: Footing };

/**
 * `goal` on the stance's feet: its footing by side (`Footing`), and the mask of the fields that
 * name an end the stance does not stand on, which are left out for the legs to report unmet.
 */
export function onStanceFeet<G extends LegsGoal>(goal: G, feet: StanceFeet): { readonly goal: SidedAsk<G>; readonly refused: number } {
  let refused = 0;
  const sideOf = (end: BearingEnd): Side | undefined => Object.hasOwn(feet, end) ? feet[end] : undefined;
  const { feet: ends, footing, pose, swing, ...rest } = goal;
  const out: { -readonly [K in keyof SidedAsk]?: SidedAsk[K] } = { ...rest };
  if (ends !== undefined) {
    if (ends.every((end) => sideOf(end) !== undefined)) out.feet = ends; else refused |= FIELD_BIT.feet;
  }
  if (footing !== undefined) {
    const placed: Partial<Record<Side, readonly [number, number]>> = {};
    let fits = true;
    for (const [end, at] of Object.entries(footing)) { const side = sideOf(end); if (side === undefined || placed[side]) fits = false; else placed[side] = at; }
    if (fits && placed.left && placed.right) out.footing = { left: placed.left, right: placed.right }; else refused |= FIELD_BIT.footing;
  }
  if (pose !== undefined) {
    if (Object.keys(pose.anchors ?? {}).every((end) => sideOf(end) !== undefined)) out.pose = pose; else refused |= FIELD_BIT.pose;
  }
  if (swing !== undefined) {
    if (swing === null || sideOf(swing.foot) !== undefined) out.swing = swing; else refused |= FIELD_BIT.swing;
  }
  return { goal: out as SidedAsk<G>, refused };
}
