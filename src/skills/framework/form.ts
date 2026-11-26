/**
 * **A written form of a profile**: what an act brings from a start as a few fitted numbers, not its
 * trials. Each of a trial's outcomes, for the trials a body in one phase ran (`RunReading`, the
 * nearest trials' selection), is a quadratic in the range and straight in the start's velocity
 * (closing and across) and in each of its bodies' levels (`bodyNumbers`) its trials began at more
 * than one of. A start's range and velocity are read as asked, along the fitted line past the span
 * its trials began at, which reads a start closing or parting faster than any trial nearer than
 * holding it at the span's edge; each level within its trials' span (`readWithin`). Its weights
 * are the least squares over those trials, fitted when the phase is first read. A share (landed, down) is held within 0 and 1 and an amount at none or more.
 * A phase whose trials do not determine a form is read by its nearest trials (`nearestRun`).
 */
import { nearestRun, profileReader, type Cycle, type Expected, type ReadsProfile, type RunReading } from "./profile/reading.ts";
import { COORDINATE, readStartOf, readWithin, type Sample } from "./profile/nearest.ts";
import { EXIT_KEYS, type Asked, type Exit } from "./profile/profile.ts";
import { handSet } from "../../core/hand-set.ts";

/** A start's numbers the form always weighs: none, the range, its square, closing and across. */
const START_TERMS = handSet({
  name: "START_TERMS", sort: "own",
  says: "How many numbers of a start a written form always weighs: a constant, the range, its square, and the speeds closing and across.",
  value: 5,
});

/** How small a pivot may be before a fit's trials are taken not to determine its weights. */
const SINGULAR = handSet({
  name: "SINGULAR", sort: "own",
  says: "How small a pivot of a least-squares fit may be before its trials are taken not to determine a written form.",
  value: 1e-12,
});

/** The weights that fit `ys` at `xs` (each as long) by least squares, null where they do not determine them. */
function fitted(xs: readonly Float64Array[], ys: readonly number[]): Float64Array | null {
  const TERMS = xs[0]?.length ?? START_TERMS;
  if (xs.length < TERMS) return null;
  const a = Array.from({ length: TERMS }, () => new Float64Array(TERMS + 1));
  xs.forEach((x, n) => { for (let i = 0; i < TERMS; i++) { for (let j = 0; j < TERMS; j++) a[i]![j]! += x[i]! * x[j]!; a[i]![TERMS]! += x[i]! * ys[n]!; } });
  for (let c = 0; c < TERMS; c++) {
    let pivot = c;
    for (let r = c + 1; r < TERMS; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[pivot]![c]!)) pivot = r;
    if (!(Math.abs(a[pivot]![c]!) > SINGULAR)) return null;
    [a[c], a[pivot]] = [a[pivot]!, a[c]!];
    for (let r = 0; r < TERMS; r++) if (r !== c) { const f = a[r]![c]! / a[c]![c]!; for (let k = c; k <= TERMS; k++) a[r]![k]! -= f * a[c]![k]!; }
  }
  return Float64Array.from({ length: TERMS }, (_, i) => a[i]![TERMS]! / a[i]![i]!);
}

/** The value of `weights` at `x`. */
const at = (weights: Float64Array, x: Float64Array): number => { let sum = 0; for (let i = 0; i < weights.length; i++) sum += weights[i]! * x[i]!; return sum; };

/** A number a form may weigh past `START_TERMS`: a body's level, the sample's coordinate `at`, and each run trial's, in the sample's order (`values`). */
interface Term {
  readonly at: number;
  readonly values: Float64Array;
}

/** **`run`'s trials' coordinate `d`** (`Sample.coords`), in the sample's order. */
const column = (run: Sample, d: number): Float64Array => Float64Array.from(run.trials, (_, i) => run.coords[i * run.dims + d]!);

/** **The numbers past `START_TERMS` a form of `run` may weigh**: its bodies' levels, in order. */
const termsOf = (run: Sample): readonly Term[] => Array.from({ length: run.stanced - COORDINATE.levels }, (_, k) => ({ at: COORDINATE.levels + k, values: column(run, COORDINATE.levels + k) }));

/** A phase's form: the terms it weighs past `START_TERMS`; each outcome's weights, each exit's by its name; and the share of each way its trials ended. */
interface Form {
  readonly terms: readonly Term[];
  readonly done: Float64Array; readonly dealt: Float64Array; readonly taken: Float64Array; readonly seconds: Float64Array; readonly down: Float64Array;
  readonly recovers: Float64Array | null;
  readonly exit: ReadonlyMap<keyof Exit, Float64Array>;
  readonly ends: Expected["ends"];
}

/**
 * **`run`'s form** (`Form`), its terms past `START_TERMS` each one its trials began at more than one
 * of that says what the terms before it do not (an item's mass and reach move together where each
 * segment held one item): either would make the fit singular. Null where the trials do not
 * determine the outcomes.
 */
function formOf(run: Sample): Form | null {
  const n = run.trials.length;
  const rowsOf = (terms: readonly Term[]): Float64Array[] => Array.from({ length: n }, (_, i) => {
    const at = i * run.dims, x = new Float64Array(START_TERMS + terms.length), range = run.coords[at + COORDINATE.range]!;
    x[0] = 1; x[1] = range; x[2] = range * range; x[3] = run.coords[at + COORDINATE.closing]!; x[4] = run.coords[at + COORDINATE.across]!;
    terms.forEach((term, k) => { x[START_TERMS + k] = term.values[i]!; });
    return x;
  });
  const weighed: Term[] = [];
  for (const term of termsOf(run)) {
    let low = Infinity, high = -Infinity;
    for (const v of term.values) { low = Math.min(low, v); high = Math.max(high, v); }
    if (high > low && fitted(rowsOf([...weighed, term]), run.trials.map(() => 0))) weighed.push(term);
  }
  const xs = rowsOf(weighed), trials = run.trials;
  const fit = (value: (trial: Sample["trials"][number]) => number) => fitted(xs, trials.map(value));
  const done = fit((trial) => +trial.done), dealt = fit((trial) => trial.dealt), taken = fit((trial) => trial.taken), seconds = fit((trial) => trial.seconds), down = fit((trial) => +trial.down);
  if (!done || !dealt || !taken || !seconds || !down) return null;
  const recovered = trials.flatMap((trial, k) => trial.recovers === null ? [] : [k]), recovers = fitted(recovered.map((k) => xs[k]!), recovered.map((k) => trials[k]!.recovers!));
  const exit = new Map<keyof Exit, Float64Array>();
  for (const name of EXIT_KEYS) {
    const having = trials.flatMap((trial, k) => trial.exit?.[name] === undefined ? [] : [k]), weights = fitted(having.map((k) => xs[k]!), having.map((k) => trials[k]!.exit![name]!));
    if (weights) exit.set(name, weights);
  }
  const shares = new Map<string, number>();
  for (const trial of trials) if (trial.end !== undefined) shares.set(trial.end, (shares.get(trial.end) ?? 0) + 1);
  return { terms: weighed, done, dealt, taken, seconds, down, recovers, exit, ends: [...shares].map(([end, count]) => ({ at: end, share: count / n })) };
}

const share = (value: number): number => Math.min(1, Math.max(0, value)), amount = (value: number): number => Math.max(0, value);

/** **`run` read by its form** (`formOf`), a body of `own` hit points striking; by its nearest trials where it has none. */
function formRun(run: Sample, own: number): RunReading {
  const start = readStartOf(run), form = formOf(run);
  if (!form) return nearestRun(run, own);
  const x = new Float64Array(START_TERMS + form.terms.length);
  /** `at` as the form weighs it, into `x`. */
  const termsAt = (asked: Asked, levels: Float64Array): Float64Array => {
    readWithin(run, asked, levels, start);
    x[0] = 1; x[1] = asked.range; x[2] = asked.range * asked.range; x[3] = asked.velocity?.[0] ?? 0; x[4] = asked.velocity?.[1] ?? 0;
    for (let k = 0; k < form.terms.length; k++) x[START_TERMS + k] = start[form.terms[k]!.at]!;
    return x;
  };
  return {
    expect(asked, levels, struck) {
      termsAt(asked, levels);
      const exit = form.exit.size ? Object.fromEntries([...form.exit].map(([name, weights]) => [name, name === "stays" ? share(at(weights, x)) : at(weights, x)])) : undefined;
      return { done: share(at(form.done, x)), dealt: struck ? amount(at(form.dealt, x)) / struck.wounds.hp.value : 0, taken: amount(at(form.taken, x)) / own,
        seconds: amount(at(form.seconds, x)), recovers: form.recovers ? amount(at(form.recovers, x)) : 0, down: share(at(form.down, x)), ends: form.ends,
        ...(exit ? { exit } : {}) };
    },
    cycle(asked, levels): Cycle {
      termsAt(asked, levels);
      const seconds = amount(at(form.seconds, x));
      return { dealt: amount(at(form.dealt, x)), seconds, cycle: seconds + (form.recovers ? amount(at(form.recovers, x)) : 0) };
    },
  };
}

/** **`profile` as a written form** for a body of `striker` at `postures` (`formRun`); made once for the three. */
export const formReading: ReadsProfile = profileReader(formRun);
