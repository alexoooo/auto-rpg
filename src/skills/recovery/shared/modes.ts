import { deepFreeze } from "../../../core/state.ts";

/** A mode's sides: one, since it holds the body whichever side it lies on. */
export const ONE_SIDE = Object.freeze(["left"] as const);

/** A mode's edges: none, since it takes the body nowhere. */
export const NO_EDGES = Object.freeze([]);

/** What a mode's run is besides what it does a step: it admits the body anywhere, reaches nowhere, yields always and runs until it is let go. */
export const MODE = deepFreeze({ yields: true, admits: () => true, reached: () => false, end() {} });
