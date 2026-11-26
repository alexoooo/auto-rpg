import type { BodySpec } from "../../../../core/bodies/spec/body.ts";
import { handSet } from "../../../../core/hand-set.ts";
import { heldNumbers, holdsAlike, struckNumbers } from "../../../../skills/framework/profile/numbers.ts";
import { STRUCK_SPANS } from "../../../../skills/framework/profile/nearest.ts";
import { type BodyHeld, type Origin } from "../../../../skills/framework/profile/profile.ts";
import { gapIn, measuredFrom, type Side, type Source } from "../../../../skills/framework/profile/source.ts";
import { remembered } from "../../../../core/remembered.ts";

/**
 * **A body as a pressure table is found by** (`pressureBody`): its stature, m, and mass, kg, as a
 * struck body's are (`struckNumbers`), and what it holds as numbers (`heldNumbers`; absent, holding
 * nothing). No body or item is found by its name.
 */
export interface PressureBody {
  readonly stature: number;
  readonly mass: number;
  readonly held?: BodyHeld;
}

/** **`spec` as a pressure table is found by** (`PressureBody`). */
export function pressureBody(spec: BodySpec): PressureBody {
  const { stature, mass } = struckNumbers(spec), held = heldNumbers(spec);
  return held ? { stature, mass, held } : { stature, mass };
}

/**
 * **What a table measured in bouts is of**: the body it watched, `measured`, facing the body it was
 * read for, `target`, each as numbers (`PressureBody`), read only by a pairing near them
 * (`pairingApart`); and the seconds after a moment it holds a reading by, rising (`horizons`).
 */
interface MeasuredPairing {
  readonly measured: PressureBody;
  readonly target: PressureBody;
  readonly horizons: readonly number[];
}

/**
 * **A measured pressure**: what a striker's fighting took from a struck body in bouts, by how far
 * apart the two stood centre to centre, what the striker was doing (`striking`, else `clear`), and
 * the seconds after (`research/minds/pressure-profiles.mjs`, `assets/minds/pressure-profiles.json`).
 * It is the minds' that fought the bouts it was read from, and is read again where those change:
 * it names them (`from`, `Origin.minds`), where its tool wrote them.
 */
export interface PressureTable extends MeasuredPairing {
  readonly from?: Origin;
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
const MOMENTS = handSet({
  name: "MOMENTS", sort: "own",
  says: "How many measured moments a reading of a pressure table is the mean of.",
  value: 40,
});

/** How far a reading's bins may lie from its range, m: beyond it the table does not read there. */
const SPAN = handSet({
  name: "SPAN", sort: "own",
  says: "How far from the range asked a pressure table's bins may lie and still be read, m.",
  value: .1,
});

/** How many places a range is rounded to where it keys a curve already made: a hundred a metre. */
const CURVE_GRAIN = handSet({
  name: "CURVE_GRAIN", sort: "own",
  says: "How finely a range is rounded where it finds a pressure curve already made: this many places a metre.",
  value: 100,
});

/** **Whether `value` is what a measured table is of** (`MeasuredPairing`): two bodies as numbers, and one horizon or more, rising from over none. */
function validPairing(value: unknown): value is MeasuredPairing {
  const table = value as Partial<MeasuredPairing> | null, horizons = table?.horizons;
  const finite = (x: unknown) => typeof x === "number" && Number.isFinite(x);
  const side = (one: unknown) => {
    const it = one as { stature?: unknown; mass?: unknown; held?: unknown } | undefined;
    return !!it && finite(it.stature) && finite(it.mass) && (it.held === undefined || !!it.held && typeof it.held === "object"
      && Object.values(it.held).every((item: { mass?: unknown; reach?: unknown }) => finite(item?.mass) && finite(item?.reach)));
  };
  return !!table && side(table.measured) && side(table.target) && Array.isArray(horizons) && horizons.length > 0
    && horizons.every((h, k) => Number.isFinite(h) && h > (k === 0 ? 0 : horizons[k - 1]!));
}

/** **Whether `value` is a measured pressure's table** (`PressureTable`). */
export function validPressures(value: unknown): value is readonly PressureTable[] {
  return Array.isArray(value) && value.every((table: PressureTable) => validPairing(table) && Array.isArray(table.bins)
    && table.bins.every((bin) => typeof bin?.phase === "string" && Number.isFinite(bin.range) && Number.isSafeInteger(bin.n) && bin.n > 0
      && Array.isArray(bin.lost) && bin.lost.length === table.horizons.length && bin.lost.every((x: unknown) => typeof x === "number" && Number.isFinite(x) && x >= 0)));
}

/**
 * **`ys` at `seconds`**, one a horizon of `horizons`: through none at none, straight between
 * horizons, and as at the last past it; none at none or before.
 */
function alongHorizons(horizons: readonly number[], ys: readonly number[], seconds: number): number {
  if (!(seconds > 0)) return 0;
  let k = 0;
  while (k < horizons.length && horizons[k]! < seconds) k++;
  if (k === horizons.length) return ys[k - 1]!;
  const h0 = k === 0 ? 0 : horizons[k - 1]!, y0 = k === 0 ? 0 : ys[k - 1]!;
  return y0 + (ys[k]! - y0) * (seconds - h0) / (horizons[k]! - h0);
}

/**
 * **The table of `tables` measured nearest `striker` on `struck`** (`PressureBody`): of those whose
 * bodies each hold as these do and stand within a span of their stature and mass (`STRUCK_SPANS`),
 * the nearest over both; of as near, the first. Null where none is, and the pairing is priced by
 * its strikes' rate: a table is read across bodies only where it was measured on bodies as near.
 */
export function pressureTable(tables: readonly PressureTable[], striker: BodySpec, struck: BodySpec): PressureTable | null {
  let found: PressureTable | null = null, least = 1;
  for (const table of tables) {
    const far = pairingApart(table, striker, struck);
    if (far <= least && (!found || far < least)) { found = table; least = far; }
  }
  return found;
}

/**
 * **How far a pairing measured, `measured` striking `target`, lies from `striker` on `struck`**, in
 * spans (`STRUCK_SPANS`): the farther of the two bodies' stature or mass, either; within one, near
 * enough to be read. Infinite where either holds otherwise than the body measured.
 */
function pairingApart(pairing: { readonly measured: PressureBody; readonly target: PressureBody }, striker: BodySpec, struck: BodySpec): number {
  const apart = (a: PressureBody, b: PressureBody): number =>
    holdsAlike(a.held, b.held) ? Math.max(Math.abs(a.stature - b.stature) / STRUCK_SPANS.stature, Math.abs(a.mass - b.mass) / STRUCK_SPANS.mass) : Infinity;
  return Math.max(apart(pairing.measured, pressureBody(striker)), apart(pairing.target, pressureBody(struck)));
}

/** One body of a table's pairing as a side of the table's source (`Side`): the body it was measured on, as its numbers, and each number in which a body of `spec` differs from it. A table is found by numbers alone. */
function sideOf(measured: PressureBody, spec: BodySpec): Side {
  const now = pressureBody(spec);
  const gaps = [gapIn("stature, m", measured.stature, now.stature, STRUCK_SPANS.stature), gapIn("mass, kg", measured.mass, now.mass, STRUCK_SPANS.mass)].filter((gap) => gap !== null);
  return { own: gaps.length === 0, of: `a body of ${measured.stature} m and ${measured.mass} kg`, by: "numbers", gaps };
}

/**
 * **Where `table` comes from, read of `striker` fighting `struck`** (`Source`): bouts of the two
 * bodies it was measured on, so a table that had to be measured for the pairing. Its body is the
 * striker and its target the body struck. Made once a table and each of the two specs.
 */
export const tableSource = remembered((table: PressureTable) => remembered((striker: BodySpec) => remembered((struck: BodySpec): Source =>
  measuredFrom({ body: sideOf(table.measured, striker), target: sideOf(table.target, struck), pairing: true }))));

/** Each table's curves read, by phase (`any` for every phase) and range. A cache: a table is data, which never changes. */
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
  const at = Math.round(range * CURVE_GRAIN) / CURVE_GRAIN, key = `${phase ?? "any"} ${at}`;
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
  return (seconds) => seconds >= horizons[last]! ? ys[last]! + rate * (seconds - horizons[last]!) : alongHorizons(horizons, ys, seconds);
}
