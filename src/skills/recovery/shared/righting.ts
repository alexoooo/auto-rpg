import { bilateralBindings } from "./bilateral.ts";
import type { Position } from "../../../control/ground-reading.ts";
import { type BodySpec } from "../../../core/bodies/spec/body.ts";
import { deepFreeze } from "../../../core/state.ts";
import { SIDES } from "../../../core/bodies/bilateral.ts";

/** The body lying, on its back, a side or its front. */
export const LYING: readonly Position[] = Object.freeze(["back", "left", "right", "front"]);

/** Edges to standing from each of `from`. */
export const toStanding = (from: readonly Position[]) => deepFreeze(from.map((one) => ({ from: one, to: "standing" as const })));

/** What the rightings share: begun on either side, as each reads how the body lies itself, from where the body lies as it moves, to standing. */
export const RIGHTING = { bindings: (spec: BodySpec) => bilateralBindings(spec, SIDES), role: "technique", moving: true, starts: SIDES, fields: [], slots: [] } as const;
