import { soleRefusal } from "../../control/support.ts";
import { fitsAll, type Part } from "../../parts/parts.ts";
import type { TechniquePart, TechniqueRun } from "./technique.ts";
import { segmentOf, type BodySpec } from "../../core/bodies/spec/body.ts";
import type { Side } from "../../core/bodies/bilateral.ts";

/** Each body's side effectors (`sideEffectors`), by its spec. */
const SIDE_EFFECTORS = new WeakMap<BodySpec, Readonly<Record<Side, string>>>();

/**
 * **What a ground action of a body of `spec` names the side it is begun on by**: each side's first
 * end it stands on (`BodySpec.ends`, a foot or a paw), on that side of the body (its centre of
 * mass's x: +x is the right). A thrown error for a body with none on a side, which no ground skill
 * fits.
 */
function sideEffectors(spec: BodySpec): Readonly<Record<Side, string>> {
  let sides = SIDE_EFFECTORS.get(spec);
  if (sides) return sides;
  const on = (side: Side) => (spec.ends ?? []).find((end) => (end.kind === "foot" || end.kind === "paw")
    && (segmentOf(spec, end.segment)!.centreOfMass.value[0] < 0 ? "left" : "right") === side)?.segment;
  const left = on("left"), right = on("right");
  if (!left || !right) throw new Error(`${spec.model} stands on no end on each side`);
  SIDE_EFFECTORS.set(spec, sides = Object.freeze({ left, right }));
  return sides;
}

/** Action starts for an explicitly bilateral foot/paw technique. */
export function bilateralBindings(spec: BodySpec, sides: readonly Side[]): readonly { readonly segment: string; readonly start: Side }[] {
  const effectors = sideEffectors(spec);
  return Object.freeze(sides.map(side => Object.freeze({segment: effectors[side], start: side})));
}

const opposite = (name: string) => name.replace(/\.(left|right)\b/g, (_, side: string) => side === "left" ? ".right" : ".left");

/** Anatomical side names swap; the body's one-sided trunk channels change sign. */
export function mirrorPosture(posture: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  return Object.fromEntries(Object.entries(posture).map(([name, value]) => [opposite(name),
    / (lateral flexion right|rotation right)$/.test(name) ? -value : value]));
}

/** A technique's `fits`: a body the stance stands on its feet (`soleRefusal`), as a technique's steady and stance do. Experimental techniques stay out of gameplay defaults until their physical evidence qualifies them. */
const fitsStance = (spec: BodySpec): string | null => soleRefusal(spec);

/** A technique part of `kind` with no settings of its own, fitted to a body the stance stands (`fitsStance`) and, where `fits` is given, that `fits` admits. */
export const technique = <K extends string>(kind: K, part: Pick<TechniquePart, "label" | "stage" | "edges" | "mode"> & {
  readonly sides: readonly Side[];
  readonly make: (...args: Parameters<TechniquePart["make"]>) => TechniqueRun<Side>;
  readonly requires?: TechniquePart["requires"];
  readonly reads?: Part["reads"]; readonly moving?: boolean; readonly fits?: (spec: BodySpec) => string | null;
}): TechniquePart<{ readonly kind: K }> => {
  const { fits, sides, make, ...rest } = part;
  const supported = (start: string): start is Side => sides.some(side => side === start);
  return Object.freeze({ moving: false, starts: sides, bindings: (spec: BodySpec) => bilateralBindings(spec, sides), ...rest,
    role: "technique", defaults: Object.freeze({ kind }), keys: Object.freeze({ kind: true }), fields: [], slots: [],
    fits: fits ? fitsAll(fitsStance, fits) : fitsStance, faults: () => [],
    make(...args: Parameters<TechniquePart["make"]>): TechniqueRun {
      const run = make(...args);
      return { state: run.state, get phase() { return run.phase; }, get yields() { return run.yields; },
        admits: (reading, start) => supported(start) && run.admits(reading, start),
        reached: (reading, to) => run.reached(reading, to),
        begin(start) { if (!supported(start)) throw new Error(`invalid start ${start} for ${kind}`); run.begin(start); },
        step: (reading, senses, control, dt) => run.step(reading, senses, control, dt), end: () => run.end(),
        ...(run.forget ? { forget: () => run.forget!() } : {}),
      };
    } });
};
