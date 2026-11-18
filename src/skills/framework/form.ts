/**
 * **A written form of a profile**: what an act brings from a start as a few fitted numbers, not its
 * trials. Each of a trial's outcomes, for the trials begun in one phase (`Start.phase`, the clear
 * one's where a phase has none), is a quadratic in the range and straight in the start's velocity
 * (closing and across; still where a trial recorded none) and in each of its bodies' numbers its
 * trials began at more than one of (`bodyNumbers`: a level, what a segment holds), a reading
 * asking them within the span its trials began at: its weights the least squares over
 * those trials, fitted when the form is first read and none typed. A share (landed, down) is held
 * within 0 and 1 and an amount at none or more. Its reach, extremes and what letting go costs are
 * its trials' (`profileReading`); a read is the form's weights once, however many trials there are.
 * A profile measured on another body is read by stature (`acrossBodies`).
 */
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import { acrossBodies, bodyNumbers, heldAsMeasured, profileReading, startedAt, STANDING, type BodyNumber, type Expected, type Postures, type Profile, type ProfileReading } from "./profile.ts";

/** A start's numbers as the form weighs them before its bodies': none, the range, its square, closing and across. */
const START_TERMS = 5;
const termsOf = (range: number, velocity: readonly [number, number] | undefined, out: Float64Array): Float64Array => {
  out[0] = 1; out[1] = range; out[2] = range * range; out[3] = velocity?.[0] ?? 0; out[4] = velocity?.[1] ?? 0;
  return out;
};

/** The weights that fit `ys` at `xs` (each as long) by least squares, null where they do not determine them. */
function fitted(xs: readonly Float64Array[], ys: readonly number[]): Float64Array | null {
  const TERMS = xs[0]?.length ?? START_TERMS;
  if (xs.length < TERMS) return null;
  const a = Array.from({ length: TERMS }, () => new Float64Array(TERMS + 1));
  xs.forEach((x, n) => { for (let i = 0; i < TERMS; i++) { for (let j = 0; j < TERMS; j++) a[i]![j]! += x[i]! * x[j]!; a[i]![TERMS]! += x[i]! * ys[n]!; } });
  for (let c = 0; c < TERMS; c++) {
    let pivot = c;
    for (let r = c + 1; r < TERMS; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[pivot]![c]!)) pivot = r;
    if (!(Math.abs(a[pivot]![c]!) > 1e-12)) return null;
    [a[c], a[pivot]] = [a[pivot]!, a[c]!];
    for (let r = 0; r < TERMS; r++) if (r !== c) { const f = a[r]![c]! / a[c]![c]!; for (let k = c; k <= TERMS; k++) a[r]![k]! -= f * a[c]![k]!; }
  }
  return Float64Array.from({ length: TERMS }, (_, i) => a[i]![TERMS]! / a[i]![i]!);
}

/** The value of `weights` at `x`. */
const at = (weights: Float64Array, x: Float64Array): number => { let sum = 0; for (let i = 0; i < weights.length; i++) sum += weights[i]! * x[i]!; return sum; };

/** One phase's form: the body numbers it weighs, with the span its trials began at (`low`, `high`), and the terms a reading is asked at, made once (`x`); each outcome's weights, each exit's by its name, and the share of each way its trials ended. */
interface PhaseForm {
  readonly numbers: readonly { readonly number: BodyNumber; readonly low: number; readonly high: number }[];
  readonly x: Float64Array;
  readonly done: Float64Array; readonly dealt: Float64Array; readonly taken: Float64Array; readonly seconds: Float64Array; readonly down: Float64Array;
  readonly recovers: Float64Array | null;
  readonly exit: ReadonlyMap<string, Float64Array>;
  readonly ends: Expected["ends"];
}

/** Each profile's forms, by the striker's spec and postures, as `readProfile` keeps its readings. */
const FORMS = new WeakMap<Profile, WeakMap<BodySpec, Map<string, ProfileReading>>>();

/** **`profile` as a written form** for a body of `striker` at `postures`; made once for the three. */
export function formReading(profile: Profile, striker: BodySpec, postures: Postures = STANDING): ProfileReading {
  let bySpec = FORMS.get(profile);
  if (!bySpec) FORMS.set(profile, bySpec = new WeakMap());
  let byPostures = bySpec.get(striker);
  if (!byPostures) bySpec.set(striker, byPostures = new Map());
  const key = `${postures.own}|${postures.target}`, known = byPostures.get(key);
  if (known) return known;
  const trials = profileReading(profile, striker, postures), own = striker.wounds.hp.value;
  const started = heldAsMeasured(profile.trials, striker).filter((trial) => startedAt(trial.start, postures));
  const begun = started.filter((trial) => !trial.letGo), numbers = bodyNumbers(started, profile);
  const phases = new Map<string, PhaseForm | null>();
  /** A start's terms (`termsOf`), then `values` of its bodies' numbers. */
  const termsWith = (range: number, velocity: readonly [number, number] | undefined, values: readonly number[]): Float64Array => {
    const out = termsOf(range, velocity, new Float64Array(START_TERMS + values.length));
    values.forEach((value, k) => { out[START_TERMS + k] = value; });
    return out;
  };
  const phaseOf = (phase: string): string => begun.some((trial) => trial.start.phase === phase) ? phase : "clear";
  const formOf = (phase: string): PhaseForm | null => {
    const known = phases.get(phase);
    if (known !== undefined) return known;
    const of = begun.filter((trial) => trial.start.phase === phase);
    // Each number in turn where its trials began at more than one of it and it says what the start and the numbers before it
    // do not (an item's mass and reach move together where each segment held one item): either would make the fit singular.
    const weighed: { readonly number: BodyNumber; readonly low: number; readonly high: number }[] = [];
    const termsAt = (trial: Profile["trials"][number], those: typeof weighed) => termsWith(trial.start.range, trial.start.velocity, those.map(({ number }) => number.trial(trial.start)));
    for (const number of numbers) {
      let low = Infinity, high = -Infinity;
      for (const trial of of) { const v = number.trial(trial.start); low = Math.min(low, v); high = Math.max(high, v); }
      if (!(high > low)) continue;
      const tried = [...weighed, { number, low, high }];
      if (fitted(of.map((trial) => termsAt(trial, tried)), of.map(() => 0))) weighed.push({ number, low, high });
    }
    const xs = of.map((trial) => termsAt(trial, weighed));
    const fit = (value: (trial: Profile["trials"][number]) => number) => fitted(xs, of.map(value));
    const done = fit((trial) => +trial.done), dealt = fit((trial) => trial.dealt), taken = fit((trial) => trial.taken), seconds = fit((trial) => trial.seconds), down = fit((trial) => +trial.down);
    const recovered = of.flatMap((trial, k) => trial.recovers === null ? [] : [k]), recovers = fitted(recovered.map((k) => xs[k]!), recovered.map((k) => of[k]!.recovers!));
    const exit = new Map<string, Float64Array>();
    for (const name of new Set(of.flatMap((trial) => Object.keys(trial.exit ?? {})))) {
      const having = of.flatMap((trial, k) => trial.exit?.[name] === undefined ? [] : [k]), weights = fitted(having.map((k) => xs[k]!), having.map((k) => of[k]!.exit![name]!));
      if (weights) exit.set(name, weights);
    }
    const shares = new Map<string, number>();
    for (const trial of of) if (trial.end !== undefined) shares.set(trial.end, (shares.get(trial.end) ?? 0) + 1);
    const made = done && dealt && taken && seconds && down ? { numbers: weighed, x: new Float64Array(START_TERMS + weighed.length), done, dealt, taken, seconds, down, recovers, exit, ends: [...shares].map(([end, n]) => ({ at: end, share: n / of.length })) } : null;
    phases.set(phase, made);
    return made;
  };
  const share = (value: number): number => Math.min(1, Math.max(0, value)), amount = (value: number): number => Math.max(0, value);
  const reading: ProfileReading = {
    profile,
    reach: (phase) => trials.reach(phase),
    expect(asked, struck) {
      if (asked.range > trials.reach(asked.phase)) return null;
      const form = formOf(phaseOf(asked.phase));
      if (!form) return trials.expect(asked, struck);
      const x = termsOf(asked.range, asked.velocity, form.x);
      for (let k = 0; k < form.numbers.length; k++) { const { number, low, high } = form.numbers[k]!; x[START_TERMS + k] = Math.min(high, Math.max(low, number.asked(striker, struck))); }
      const letGo = asked.progress === undefined ? undefined : trials.expect(asked, struck)?.letGo;
      const exit = form.exit.size ? Object.fromEntries([...form.exit].map(([name, weights]) => [name, name === "stays" ? share(at(weights, x)) : at(weights, x)])) : undefined;
      return { done: share(at(form.done, x)), dealt: struck ? amount(at(form.dealt, x)) / struck.wounds.hp.value : 0, taken: amount(at(form.taken, x)) / own,
        seconds: amount(at(form.seconds, x)), recovers: form.recovers ? amount(at(form.recovers, x)) : 0, down: share(at(form.down, x)), ends: form.ends,
        ...(letGo ? { letGo } : {}), ...(exit ? { exit } : {}) };
    },
    rate(asked, struck) {
      const expected = reading.expect(asked, struck);
      if (!expected) return null;
      const cycle = expected.seconds + expected.recovers;
      return cycle > 0 ? expected.dealt / cycle : 0;
    },
    peak: (phase, struck) => trials.peak(phase, struck),
    fastest: (phase) => trials.fastest(phase),
    scaled: (struck) => trials.scaled(struck),
  };
  const read = acrossBodies(profile, striker, reading);
  byPostures.set(key, read);
  return read;
}
