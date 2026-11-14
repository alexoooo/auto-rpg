import { bilateralBindings } from "./bilateral.ts";
import type { Position } from "../../../control/ground-reading.ts";
import { type BodySpec } from "../../../core/bodies/spec/body.ts";
import { deepFreeze } from "../../../core/state.ts";
import { type Side, SIDES } from "../../../core/bodies/bilateral.ts";

/** The body lying, on its back, a side or its front. */
export const LYING: readonly Position[] = Object.freeze(["back", "left", "right", "front"]);

/** Edges to standing from each of `from`. */
export const toStanding = (from: readonly Position[]) => deepFreeze(from.map((one) => ({ from: one, to: "standing" as const })));

/** The sides a righting is begun on: it reads how the body lies itself. */
export const BOTH: readonly Side[] = SIDES;

/** What the rightings share: begun on either side, from where the body lies as it moves, to standing. */
export const RIGHTING = { bindings: (spec: BodySpec) => bilateralBindings(spec, BOTH), role: "technique", stage: "game", moving: true, starts: BOTH, fields: [], slots: [] } as const;
