import type { SourceKey } from "../sources.ts";

/**
 * **A number in a spec, and where it came from.**
 *
 * Every number a body is built from is a `Quantity`. It is either taken from a source -- a paper,
 * an asset, a measurement, the owner's decision; `SOURCES` in `src/core/sources.ts` lists them --
 * or derived from other quantities by a named rule. A derivation keeps its inputs and its rule, so
 * the chain from any built number back to what it rests on can be walked
 * (`src/core/spec/provenance.ts`), and `tests/core-spec.test.mjs` walks it for every spec.
 *
 * **A derivation's constants are inputs.** A rule's code may use the arithmetic of its own
 * formula (a half, a cube, pi) and nothing else; a factor that is a claim about bodies -- a share,
 * a ratio, a density -- is a quantity with a source, passed in. The spec test scans every rule
 * for numeric literals outside that arithmetic.
 */

/** A vector in a spec's frame, metres or a unit direction. */
export type Vec3 = readonly [number, number, number];
export type Value = number | Vec3;

/**
 * The units a spec states. The source's own units are kept at the leaf, so a leaf reads as its
 * source prints it, and `convert` makes the SI quantity from it.
 */
export type Unit =
  | "1" | "%"
  | "m" | "mm" | "cm"
  | "kg" | "kg m2"
  | "kg/m3" | "g/cm3"
  | "m3" | "l"
  | "N m" | "N"
  | "rad" | "deg"
  | "rad/s" | "deg/s"
  | "m/s2"
  | "s" | "Hz"
  | "J" | "J/HP"
  /** Hit points: the rulebook's damage unit, one the strongest club hit. */
  | "HP";

/** A number read from a source: `where` says where in it, as the source is cited. */
export interface FromSource {
  readonly kind: "source";
  readonly source: SourceKey;
  readonly where: string;
}

/** A number computed from other quantities by `rule`, which `compute` states. */
export interface Derived {
  readonly kind: "derived";
  readonly rule: string;
  readonly inputs: readonly Quantity[];
  readonly compute: (...values: never[]) => Value;
}

export type Provenance = FromSource | Derived;

export interface Quantity<V extends Value = Value> {
  readonly value: V;
  readonly unit: Unit;
  readonly provenance: Provenance;
}

type ValuesOf<I extends readonly Quantity[]> = { readonly [K in keyof I]: I[K] extends Quantity<infer V> ? V : never };

function finite(value: Value, what: string): void {
  const ok = typeof value === "number" ? Number.isFinite(value) : value.length === 3 && value.every(Number.isFinite);
  if (!ok) throw new Error(`${what} is not a finite number or 3-vector: ${String(value)}`);
}

function frozen<V extends Value>(value: V): V {
  return (typeof value === "number" ? value : Object.freeze([value[0], value[1], value[2]] as const)) as V;
}

/** A number as `source` prints it, at `where` in it. */
export function sourced<V extends Value>(value: V, unit: Unit, source: SourceKey, where: string): Quantity<V> {
  finite(value, `${source} ${where}`);
  return Object.freeze({ value: frozen(value), unit, provenance: Object.freeze({ kind: "source", source, where }) });
}

/** A number computed from `inputs` by `rule`. `compute` receives the inputs' values, in order. */
export function derive<const I extends readonly Quantity[], V extends Value>(
  unit: Unit, rule: string, inputs: I, compute: (...values: ValuesOf<I>) => V,
): Quantity<V> {
  const value = compute(...(inputs.map((input) => input.value) as unknown as ValuesOf<I>));
  finite(value, rule);
  return Object.freeze({
    value: frozen(value), unit,
    provenance: Object.freeze({ kind: "derived", rule, inputs: Object.freeze([...inputs]),
      compute: compute as unknown as Derived["compute"] }),
  });
}

/**
 * How many of `to` one of `from` is. These are definitions of the units, not claims about
 * anything, so they are the one place a factor may be written as a literal.
 */
const CONVERSIONS: Readonly<Partial<Record<Unit, { readonly to: Unit; readonly factor: number }>>> = Object.freeze({
  "%": { to: "1", factor: 1 / 100 },
  mm: { to: "m", factor: 1 / 1000 },
  cm: { to: "m", factor: 1 / 100 },
  "g/cm3": { to: "kg/m3", factor: 1000 },
  l: { to: "m3", factor: 1 / 1000 },
  deg: { to: "rad", factor: Math.PI / 180 },
  "deg/s": { to: "rad/s", factor: Math.PI / 180 },
});

/** `quantity` in SI: per cent to a fraction, millimetres to metres, degrees to radians. */
export function si<V extends Value>(quantity: Quantity<V>): Quantity<V> {
  const conversion = CONVERSIONS[quantity.unit];
  if (!conversion) return quantity;
  const { factor } = conversion;
  return derive(conversion.to, `${quantity.unit} to ${conversion.to}`, [quantity],
    (value) => scaled(value, factor) as V);
}

function scaled(value: Value, factor: number): Value {
  return typeof value === "number" ? value * factor : [value[0] * factor, value[1] * factor, value[2] * factor];
}

export const isQuantity = (x: unknown): x is Quantity =>
  typeof x === "object" && x !== null && "value" in x && "unit" in x && "provenance" in x;
