import type { EndLimb, ProppedLimb } from "../../../../core/bodies/spec/body.ts";
import { deepFreeze } from "../../../../core/world/state.ts";

/** Channels that the staged solve leaves to each bearing task, rather than its posture. */
export type BearingPolicy = Readonly<Record<string, readonly string[]>>;

const DEFAULT: BearingPolicy = deepFreeze(Object.fromEntries((["left", "right"] as const).flatMap((side) => [
  [`shin.${side}`, [`hip.${side} flexion`, `hip.${side} abduction`, `hip.${side} internal rotation`, `knee.${side} flexion`]],
  [`hand.${side}`, [`shoulder.${side} flexion`, `shoulder.${side} abduction`, `shoulder.${side} internal rotation`]],
])));
const EMPTY: readonly string[] = Object.freeze([]);

/** The staged task's selected channels for an end, overridden by its recipe where supplied. */
export const takesOf = (end: EndLimb | ProppedLimb, policy?: BearingPolicy): readonly string[] => policy?.[end.name] ?? DEFAULT[end.name] ?? EMPTY;
