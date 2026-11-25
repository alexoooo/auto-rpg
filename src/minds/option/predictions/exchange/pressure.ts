import type { BodySpec } from "../../../../core/bodies/spec/body.ts";
import { deepFreeze } from "../../../../core/state.ts";
import type { StanceNumbers, Stances } from "../../../../skills/framework/profile/profile.ts";
import type { ProfileReading } from "../../../../skills/framework/profile/reading.ts";
import type { Guesses, Placing } from "../../contract/predictors.ts";
import type { Pressure, Seen, Situation, Span } from "../../contract/situation.ts";
import { pressureCurve, type PressureTable } from "./pressure-table.ts";
import { RETHINK } from "../../choosers/select-set.ts";
import type { Model } from "./model.ts";
import { within } from "../../situation/reach-memory.ts";

/**
 * **What makes the pressure** (`PressureFields`) of strikes `model` by a body of `striker` on a body of `struck` in
 * `phase`: each measured, and, where the Mind has `guesses`, the guess of each limb its model
 * has no profile of (`Model.unmeasured`, `Guesses.limb`), placed by `placing`: null where the two
 * stand so that no guess is of it (a body lying, or struck lying, deals none by a guess). With no
 * guesses such a limb adds nothing. Its latency takes the striker's mind for one like this (its rethink, `RETHINK`, and its
 * command's delay, `Seen.delay`) and adds its fastest blow's run (`ProfileReading.fastest`).
 */
export function pressureBy(seen: Seen, { model, phase, striker, struck, placing, guesses }: { readonly model: Model; readonly phase: string; readonly striker: BodySpec; readonly struck: BodySpec; readonly placing: Placing | null; readonly guesses: Guesses | null }): PressureFields {
  const readings = model.measured.map((one) => one.reading);
  if (guesses && placing !== null) for (const limb of model.unmeasured) readings.push(guesses.limb(seen, { striker, struck, limb, placing }));
  let peak = 0, fastest = Infinity;
  for (const reading of readings) { peak = Math.max(peak, reading.peak(phase, struck)); fastest = Math.min(fastest, reading.fastest(phase)); }
  return { model: readings, phase, struck, peak, latency: RETHINK + seen.delay / seen.hz + fastest, priced: model.priced };
}

/**
 * **What a `ProfilePressure` is made of**: the strikes it is modelled by (`model`, each read
 * through its profile at how the two stand, `ProfileReading`), read at the struck body's phase
 * (`phase`) and in its life (`struck`); the most of them a second at any range (`peak`), its
 * latency and how it is priced (`Pressure`); how the striker and the struck body stand toward
 * each other (`stance`), at which its model is read, alike any where absent; and what bouts
 * measured the focus's fighting took from the body (`measured`: a `PressureTable`, read where
 * it reads, `pressureCurve`, the focus in `doing` as now).
 */
export interface PressureFields {
  readonly model: readonly ProfileReading[];
  readonly phase: string;
  readonly struck: BodySpec | null;
  readonly peak: number;
  readonly latency: number;
  readonly priced: string;
  readonly stance?: Stances;
  readonly measured?: { readonly table: PressureTable; readonly doing: string };
}

/** A search's scratch holds at most this many exact starts; four ways share each hash bucket. */
const PRESSURE_CACHE = Object.freeze({ buckets: 64, ways: 4 });

/**
 * **One search's scratch of a pressure's exact starts** (`ProfilePressure.cached`): each start
 * kept (its range and the two parts of its velocity), the rate found there, and when it was last
 * asked for (`ages`, by `clock`; 0, never). `values` and `words` are one start's numbers and
 * their bits, which it is hashed by.
 */
interface Starts {
  readonly ranges: Float64Array;
  readonly forward: Float64Array;
  readonly across: Float64Array;
  readonly rates: Float64Array;
  readonly ages: Float64Array;
  readonly values: Float64Array;
  readonly words: Uint32Array;
  clock: number;
}

/** An empty scratch (`Starts`). */
function startsOf(): Starts {
  const size = PRESSURE_CACHE.buckets * PRESSURE_CACHE.ways, values = new Float64Array(3);
  return { ranges: new Float64Array(size), forward: new Float64Array(size), across: new Float64Array(size), rates: new Float64Array(size), ages: new Float64Array(size),
    values, words: new Uint32Array(values.buffer), clock: 0 };
}

/** Each pressure read at another own stance (`ProfilePressure.stanced`), by its pressure and that stance: a pressure and a stance are immutable. */
const STANCED = new WeakMap<ProfilePressure, WeakMap<object, ProfilePressure>>();

/**
 * **A pressure read from measured profiles** (`Pressure`, of `PressureFields`). What it takes
 * over a span is what bouts measured where it holds their table and they measured near, else the
 * most of its strikes' rates there (a foe's pooled as one, `pooled`). What it is made of never
 * changes: a pressure at another stance, or one keeping a search's scratch, is another pressure.
 */
export class ProfilePressure implements Pressure {
  readonly latency: number;
  readonly peak: number;
  readonly priced: string;
  private readonly fields: PressureFields;
  // A cache: one search's exact starts and the rate read at each. Null where it keeps none.
  private readonly starts: Starts | null;

  constructor(fields: PressureFields, starts: Starts | null) {
    this.latency = fields.latency;
    this.peak = fields.peak;
    this.priced = fields.priced;
    this.fields = fields;
    this.starts = starts;
  }

  /**
   * At the range centre to centre the span's `apart` leaves: what bouts measured there
   * (`measured`) from `from` to `from + seconds` s after a moment, the focus doing as now where
   * `now` is the body's own and as any where it is a state an Option leaves (`Situation.grace`),
   * later than what it does now; else, or where they measured none near, its strikes' rate there
   * for the span's seconds (`rateAt`).
   */
  dealt(now: Situation, { apart, velocity, seconds, from }: Span): number {
    const range = now.apart + apart - now.range, measured = this.fields.measured;
    const curve = measured ? pressureCurve(measured.table, now.grace === undefined ? measured.doing : null, range) : null;
    return curve ? curve(from + seconds) - curve(from) : this.rateAt(range, velocity) * seconds;
  }

  /** Its strikes' farthest range at its phase (`ProfileReading.reach`), as the range at `now` places it; 0 with no strikes. */
  edge(now: Pick<Situation, "range" | "apart">): number {
    const { model, phase } = this.fields;
    if (model.length === 0) return 0;
    let range = -Infinity;
    for (const reading of model) range = Math.max(range, reading.reach(phase));
    return now.range + range - now.apart;
  }

  /**
   * Made once for the pressure and the stance (`STANCED`), with a search's scratch of its own;
   * itself where it reads that body at `own` already, so a walk in the body's carriage asks
   * nothing anew.
   */
  stanced(own: StanceNumbers): ProfilePressure {
    const fields = this.fields;
    if (fields.stance?.target === own) return this;
    let by = STANCED.get(this);
    if (!by) STANCED.set(this, by = new WeakMap());
    const known = by.get(own);
    if (known) return known;
    const made = new ProfilePressure({ ...fields, stance: { ...fields.stance, target: own } }, startsOf());
    by.set(own, made);
    return made;
  }

  cached(): ProfilePressure { return new ProfilePressure(this.fields, startsOf()); }

  /**
   * The most life a second its strikes deal at this start. Where it keeps a search's scratch
   * (`Starts`) an exact start asked before is answered from it; a bucket evicts its least recently
   * used start, and a miss reads the profiles (`read`).
   */
  private rateAt(range: number, velocity: readonly [number, number]): number {
    const starts = this.starts, x = velocity[0], z = velocity[1];
    if (!starts || !Number.isFinite(range) || !Number.isFinite(x) || !Number.isFinite(z)) return this.read(range, velocity);
    const { ranges, forward, across, rates, ages, values, words } = starts, { buckets, ways } = PRESSURE_CACHE;
    values[0] = range; values[1] = x; values[2] = z;
    let hash = 0x811c9dc5;
    for (let i = 0; i < words.length; i++) hash = Math.imul(hash ^ words[i]!, 0x01000193);
    // Fold high bits into the bucket: nearby floating point values often share their low bits.
    const from = ((hash ^ hash >>> 16) & (buckets - 1)) * ways;
    let oldest = from;
    for (let i = from; i < from + ways; i++) {
      if (ages[i]! > 0 && Object.is(ranges[i], range) && Object.is(forward[i], x) && Object.is(across[i], z)) {
        ages[i] = ++starts.clock;
        return rates[i]!;
      }
      if (ages[i]! < ages[oldest]!) oldest = i;
    }
    const rate = this.read(range, velocity);
    ranges[oldest] = range; forward[oldest] = x; across[oldest] = z; rates[oldest] = rate; ages[oldest] = ++starts.clock;
    return rate;
  }

  /** The most of its strikes at this start, each what its profile expects there a second (`ProfileReading.rate`) short of its reach: the reach is where the body is out of it. */
  private read(range: number, velocity: readonly [number, number]): number {
    const { model, phase, stance, struck } = this.fields;
    let rate = 0;
    for (const reading of model) {
      if (!within(range, reading.reach(phase))) continue;
      const expected = reading.rate(stance ? { range, phase, velocity, stance } : { range, phase, velocity }, struck);
      if (expected !== null) rate = Math.max(rate, expected);
    }
    return rate;
  }
}

/** No pressure: no focus. */
export const NO_PRESSURE = deepFreeze(new ProfilePressure({ model: [], phase: "clear", struck: null, peak: 0, latency: Infinity, priced: "no focus" }, null));
