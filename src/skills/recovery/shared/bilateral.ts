import { varied, type Varied } from "../../framework/variations.ts";
import { soleRefusal } from "../../../control/support.ts";
import type { Part } from "../../../parts/parts.ts";
import type { TechniquePart, TechniqueRun } from "./technique.ts";
import { segmentOf, type BodySpec } from "../../../core/bodies/spec/body.ts";
import type { Side } from "../../../core/bodies/bilateral.ts";

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

/** A channel's, a segment's or a joint's name on the body's other side: its `.left` and `.right` swapped. */
export const opposite = (name: string): string => name.replace(/\.(left|right)\b/g, (_, side: string) => side === "left" ? ".right" : ".left");

/** Anatomical side names swap; the body's one-sided trunk channels change sign. */
export function mirrorPosture(posture: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  return Object.fromEntries(Object.entries(posture).map(([name, value]) => [opposite(name),
    / (lateral flexion right|rotation right)$/.test(name) ? -value : value]));
}

/**
 * What makes a technique part over configs `C` (`techniquePart`): its label, stage, edges and mode,
 * its configs' `defaults` and `keys`, the sides it starts from, and its run on a body (`make`).
 */
type TechniqueFields<C extends { readonly kind: string } & Varied> = Pick<TechniquePart<C>, "label" | "edges" | "mode" | "defaults" | "keys"> & {
  readonly skillGroup: string;
  readonly sides: readonly Side[];
  readonly make: (...args: Parameters<TechniquePart<C>["make"]>) => TechniqueRun<Side>;
  readonly requires?: TechniquePart["requires"];
  readonly reads?: Part["reads"]; readonly moving?: boolean;
};

/**
 * A technique part over configs `C` (`TechniqueFields`), its one variation the technique itself
 * (`varied`), fitted to a body the stance stands on its feet (`soleRefusal`), as a technique's
 * regain and stance do.
 */
export const techniquePart = <C extends { readonly kind: string } & Varied>({ sides, make, defaults, keys, ...rest }: TechniqueFields<C>): TechniquePart<C> => {
  const kind = defaults.kind;
  const supported = (start: string): start is Side => sides.some(side => side === start);
  const held = varied({ skill: kind, label: rest.label.toLowerCase(), variations: { [kind]: make }, of: (own, _view, _clock, _fitted, config) => [own.spec, config], fits: [soleRefusal] });
  const made: TechniquePart<C> = { moving: false, starts: sides, bindings: (spec: BodySpec) => bilateralBindings(spec, sides), ...rest,
    role: "technique", defaults: Object.freeze(defaults), keys: Object.freeze(keys), fields: [], slots: [],
    fits: held.fits, faults: () => [], variations: held.variations,
    make(...args: Parameters<TechniquePart<C>["make"]>): TechniqueRun {
      const run = held.make(...args);
      return { state: run.state, get phase() { return run.phase; }, get stage() { return run.stage; }, get yields() { return run.yields; },
        admits: (reading, start) => supported(start) && run.admits(reading, start),
        reached: (reading, to) => run.reached(reading, to),
        begin(start) { if (!supported(start)) throw new Error(`invalid start ${start} for ${kind}`); run.begin(start); },
        step: (reading, senses, control, dt) => run.step(reading, senses, control, dt), end: (why) => run.end(why),
        ...(run.forget ? { forget: () => run.forget!() } : {}),
      };
    } };
  return Object.freeze(made);
};

/** A technique part of `kind` with no settings of its own (`techniquePart`). */
export const technique = <K extends string>(kind: K, part: Omit<TechniqueFields<{ readonly kind: K } & Varied>, "defaults" | "keys">): TechniquePart<{ readonly kind: K } & Varied> =>
  techniquePart<{ readonly kind: K } & Varied>({ ...part, defaults: { kind }, keys: { kind: true, variation: true } });
