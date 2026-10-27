import measured from "../../../../assets/core/fast-edges.json" with { type: "json" };
import type { BodyView } from "../../body.ts";
import { deepFreeze } from "../../state.ts";
import type { BodySpec, Side } from "../../spec/body.ts";
import type { OwnBody } from "../mind.ts";
import { phasedRun, type PhasedRise } from "./phased-rise.ts";
import type { GroundReading, Position } from "./reading.ts";
import { handsOver } from "./staged-edges.ts";
import { fitsHumanoid, type TechniquePart } from "./technique.ts";

/**
 * Each body's fast edges, by model and kind (`assets/core/fast-edges.json`, found by
 * `research/fast-edge-search.mjs`; `docs/reference/rising.md#the-fast-edges`).
 */
const FAST: Readonly<Record<string, Readonly<Record<string, PhasedRise>>>> = deepFreeze(measured.edges as Record<string, Record<string, PhasedRise>>);

/** Fast edge `kind`'s rise on body `model`; null where none is found for it. */
export const fastEdge = (model: string, kind: string): PhasedRise | null => FAST[model]?.[kind] ?? null;

/** **A fast edge's entry**: begun on the left, the body read in `from` (its raw reading) and slow enough to hand over (`handsOver`). */
export const fastEntry = (from: Position) => (g: GroundReading, side: Side): boolean => side === "left" && g.raw === from && handsOver(g);

/** A fast edge of `kind` from `from` to a crouch quiet on both feet, where Stand up's steady climbs; it fits only a body one is found for. */
function fastTechnique<K extends string>(kind: K, label: string, from: Position): TechniquePart<{ readonly kind: K }> {
  const entry = fastEntry(from);
  return Object.freeze<TechniquePart<{ readonly kind: K }>>({
    role: "technique", label, stage: "experimental", moving: true,
    sides: Object.freeze(["left"] as const), edges: Object.freeze([Object.freeze({ from, to: "crouch" as const })]),
    defaults: Object.freeze({ kind }), keys: Object.freeze({ kind: true as const }), fields: [], slots: [], faults: () => [],
    fits: (spec: BodySpec) => fitsHumanoid(spec) ?? (fastEdge(spec.model, kind) ? null : `no ${label.toLowerCase()} is found for ${spec.model}`),
    make: (own: OwnBody, view: BodyView) => phasedRun(own, view, fastEdge(own.spec.model, kind)!, entry),
  });
}

/** **Push-off**: from hands and knees, the weight pushed back onto the feet into a crouch. */
export const PUSH_OFF = fastTechnique("push-off", "Push-off", "fours");
/** **Rock-up**: from the back, the knees tucked and the body rocked forward onto the feet into a crouch. */
export const ROCK_UP = fastTechnique("rock-up", "Rock-up", "back");
