import type { BodySpec } from "../../core/bodies/spec/body.ts";
import { holdsOf } from "../../skills/framework/profile.ts";

/**
 * **A measured pressure**: what a striker's fighting took from a struck body in bouts, by how far
 * apart the two stood centre to centre, what the striker was doing (`striking`, else `clear`), and
 * the seconds after (`research/minds/pressure-profiles.mjs`, `assets/minds/pressure-profiles.json`).
 * It is the minds' that fought the bouts it was read from, and is read again where those change.
 */
export interface PressureTable {
  /** The striker's body, and what it held (`holdsOf`; none, empty-handed). */
  readonly measured: { readonly body: string; readonly holds?: string };
  /** The struck body, and what it held. */
  readonly target: { readonly body: string; readonly holds?: string };
  /** The seconds after a moment the life its bins hold was lost by, rising. */
  readonly horizons: readonly number[];
  readonly bins: readonly PressureBin[];
}

/** The moments within a bin's width of `range` m apart with the striker in `phase`: how many, and the life (a share of full life) the struck body lost by each horizon, their mean. */
export interface PressureBin {
  readonly phase: string;
  readonly range: number;
  readonly n: number;
  readonly lost: readonly number[];
}

/** The life a struck body loses by `seconds` s after a moment (`PressureTable`), rising from none. */
export type PressureCurve = (seconds: number) => number;

/** How many moments a reading is the mean of: the bins nearest its range until they hold as many. */
const MOMENTS = 40;

/** How far a reading's bins may lie from its range, m: beyond it the table does not read there. */
const SPAN = .1;

/** **Whether `value` is a measured pressure's table** (`PressureTable`). */
export function validPressures(value: unknown): value is readonly PressureTable[] {
  return Array.isArray(value) && value.every((one) => {
    const table = one as Partial<PressureTable>;
    const horizons = table.horizons;
    const side = (one: unknown) => { const it = one as { body?: unknown; holds?: unknown } | undefined; return typeof it?.body === "string" && (it.holds === undefined || typeof it.holds === "string"); };
    return side(table.measured) && side(table.target) && Array.isArray(horizons) && horizons.length > 0
      && horizons.every((h, k) => Number.isFinite(h) && h > (k === 0 ? 0 : horizons[k - 1]!)) && Array.isArray(table.bins)
      && table.bins.every((bin) => typeof bin?.phase === "string" && Number.isFinite(bin.range) && Number.isSafeInteger(bin.n) && bin.n > 0
        && Array.isArray(bin.lost) && bin.lost.length === horizons.length && bin.lost.every((x: unknown) => typeof x === "number" && Number.isFinite(x) && x >= 0));
  });
}

/** The table of `tables` of `striker`'s body holding what it holds on `struck`'s holding what it holds (`holdsOf`); null where none is. */
export const pressureTable = (tables: readonly PressureTable[], striker: BodySpec, struck: BodySpec): PressureTable | null =>
  tables.find((table) => table.measured.body === striker.model && table.measured.holds === holdsOf(striker)
    && table.target.body === struck.model && table.target.holds === holdsOf(struck)) ?? null;

/** Each table's curves read, by phase (`any` for every phase) and range. */
const CURVES = new WeakMap<PressureTable, Map<string, PressureCurve | null>>();

/**
 * **The life `table` reads lost by each seconds after a moment `range` m apart centre to centre**,
 * the striker in `phase`, or in any where null: the mean of the `MOMENTS` moments of the bins
 * nearest it, by each horizon; through none at none and straight between horizons, on past the
 * last at the rate of its last span. Null where no bin within `SPAN` holds as many.
 */
export function pressureCurve(table: PressureTable, phase: string | null, range: number): PressureCurve | null {
  let curves = CURVES.get(table);
  if (!curves) CURVES.set(table, curves = new Map());
  const at = Math.round(range * 100) / 100, key = `${phase ?? "any"} ${at}`;
  if (curves.has(key)) return curves.get(key)!;
  const bins = table.bins.filter((bin) => (phase === null || bin.phase === phase) && Math.abs(bin.range - at) <= SPAN).sort((a, b) => Math.abs(a.range - at) - Math.abs(b.range - at));
  const lost = table.horizons.map(() => 0);
  let n = 0;
  for (const bin of bins) {
    if (n >= MOMENTS) break;
    bin.lost.forEach((x, k) => { lost[k]! += x * bin.n; });
    n += bin.n;
  }
  const curve = n < MOMENTS ? null : curveThrough(table.horizons, lost.map((x) => x / n));
  curves.set(key, curve);
  return curve;
}

/** The curve through none at none and `lost` at each of `horizons`, straight between, on past the last at its last span's rate, never falling. */
function curveThrough(horizons: readonly number[], lost: readonly number[]): PressureCurve {
  const ys: number[] = [];
  for (const [k, x] of lost.entries()) ys.push(Math.max(x, k === 0 ? 0 : ys[k - 1]!));
  const last = horizons.length - 1, before = last === 0 ? 0 : horizons[last - 1]!, rate = (ys[last]! - (last === 0 ? 0 : ys[last - 1]!)) / (horizons[last]! - before);
  return (seconds) => {
    if (!(seconds > 0)) return 0;
    if (seconds >= horizons[last]!) return ys[last]! + rate * (seconds - horizons[last]!);
    let k = 0;
    while (horizons[k]! < seconds) k++;
    const h0 = k === 0 ? 0 : horizons[k - 1]!, y0 = k === 0 ? 0 : ys[k - 1]!;
    return y0 + (ys[k]! - y0) * (seconds - h0) / (horizons[k]! - h0);
  };
}
