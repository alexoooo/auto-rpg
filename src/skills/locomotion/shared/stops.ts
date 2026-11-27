import measured from "../../../../assets/skills/locomotion/stops.json" with { type: "json" };
import { heldIn } from "../../../core/bodies/items/held.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import { deepFreeze } from "../../../core/state.ts";
import type { GaitStop } from "../../framework/locomotion-part.ts";

/** One stretch's curve as the asset keeps it: at each of its rates, the farthest past (null where every trial fell) and how many fell, braked after `lag` s. */
interface Curve { readonly lag: number; readonly past: readonly (number | null)[]; readonly fell: readonly number[] }

/** A gait's stops as the asset keeps them: the whole of its speeds, and the stretch below its switch where it was measured apart (`below`, up to `speed` m/s). */
type Measured = Curve & { readonly below?: Curve & { readonly speed: number } };

/** The asset: the rates every curve was braked at, m/s², and each body's gaits' stops by what its right hand holds. */
interface StopsTable {
  readonly rates: readonly number[];
  readonly models: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, Measured>>>>>>;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Why `value` is no curve over `count` rates (`Curve`), with `below` its top as well (`speed`); null where it is one. */
function curveFault(value: unknown, count: number, below: boolean): string | null {
  if (!isRecord(value)) return "is not an object";
  if (!finite(value.lag) || value.lag < 0) return "has no lag of 0 s or more";
  if (!Array.isArray(value.past) || value.past.length !== count || !value.past.every((one) => one === null || finite(one))) return `has no past for each of its ${count} rates`;
  if (!Array.isArray(value.fell) || value.fell.length !== count || !value.fell.every((one) => Number.isInteger(one) && one >= 0)) return `has no count fallen for each of its ${count} rates`;
  if (below && (!finite(value.speed) || value.speed <= 0)) return "has no top speed above 0";
  return null;
}

/**
 * **The stops asset read** (`StopsTable`): its rates, slowest first and each above 0, and each
 * body's gaits by what it holds, each a curve over every rate (`Curve`), and its stretch below
 * where it has one. Throws on an asset of any other shape, naming where.
 */
export function stopsTable(value: unknown): StopsTable {
  const bad = (where: string, why: string): never => { throw new Error(`the stops asset ${where} ${why}`); };
  if (!isRecord(value)) return bad("", "is not an object");
  const rates = value.rates;
  if (!Array.isArray(rates) || !rates.length || !rates.every((rate, i) => finite(rate) && rate > 0 && (i === 0 || rate > rates[i - 1])))
    return bad("rates", "are not rates above 0, slowest first");
  if (!isRecord(value.models)) return bad("models", "is not an object");
  for (const [model, byHeld] of Object.entries(value.models)) {
    if (!isRecord(byHeld)) return bad(`/models/${model}`, "is not an object");
    for (const [held, byGait] of Object.entries(byHeld)) {
      if (!isRecord(byGait)) return bad(`/models/${model}/${held}`, "is not an object");
      for (const [gait, one] of Object.entries(byGait)) {
        const at = `/models/${model}/${held}/${gait}`, fault = curveFault(one, rates.length, false);
        if (fault) return bad(at, fault);
        const below = (one as Readonly<Record<string, unknown>>).below, under = below === undefined ? null : curveFault(below, rates.length, true);
        if (under) return bad(`${at}/below`, under);
      }
    }
  }
  return value as unknown as StopsTable;
}

const TABLE = stopsTable(measured);

/** A curve as the speed rule reads it (`GaitStop`), up to `below` m/s: a rate at which any trial fell is never within a place. */
const stretch = ({ lag, past, fell }: Curve, below: number): GaitStop => ({ below, lag,
  rates: TABLE.rates.map((stopping, i) => ({ stopping, past: fell[i]! > 0 || past[i] === null ? Infinity : past[i]! })) });

/**
 * **How `spec`'s body stops walking by the legs `key` names** (`assets/skills/locomotion/stops.json`,
 * `research/skills/locomotion/stance/stance-stops.mjs`), as measured holding what its right hand
 * holds (`heldIn`): the stretch below its switch where it was measured apart, then the whole of
 * its speeds. Null where that body, so held, was not measured walking by them.
 */
export function measuredStops(spec: BodySpec, key: string): readonly GaitStop[] | null {
  const held = heldIn(spec, "right"), one = held === null ? undefined : TABLE.models[spec.model]?.[held]?.[key];
  if (!one) return null;
  return deepFreeze(one.below ? [stretch(one.below, one.below.speed), stretch(one, Infinity)] : [stretch(one, Infinity)]);
}
