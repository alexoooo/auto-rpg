/** What a report states of its figures, by IEEE's operations alone, so every engine gives one interval. */

/** An estimate and its interval, both in the figure's units. */
export interface Estimate {
  readonly value: number;
  readonly low: number;
  readonly high: number;
}

/** The normal quantile of a two-sided 95 % interval. */
const Z95 = 1.959963984540054;

/** The share of `k` successes in `n` trials, with its Wilson score interval at 95 %; null for none. */
export function wilson(k: number, n: number): Estimate | null {
  if (n === 0) return null;
  const p = k / n, z2 = Z95 * Z95, scale = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / scale, half = Z95 * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / scale;
  return { value: p, low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

export const mean = (values: readonly number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length;

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Uniform numbers in [0, 1) from `seed` (mulberry32): the same draws on every machine. */
export function draws(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How many times a bootstrap resamples, and its seed. */
const RESAMPLES = 2000, SEED = 1;

/**
 * `statistic` of `values`, one a pair, with its 95 % percentile interval over `RESAMPLES` resamples
 * of the pairs whole from `SEED`: the same interval for the same values every time. Null for none.
 */
export function pairBootstrap(values: readonly number[], statistic: (values: readonly number[]) => number): Estimate | null {
  if (values.length === 0) return null;
  const next = draws(SEED), sample = new Array<number>(values.length), stats = new Array<number>(RESAMPLES);
  for (let r = 0; r < RESAMPLES; r++) {
    for (let k = 0; k < values.length; k++) sample[k] = values[Math.floor(next() * values.length)];
    stats[r] = statistic(sample);
  }
  stats.sort((a, b) => a - b);
  return { value: statistic(values), low: stats[Math.floor(0.025 * RESAMPLES)], high: stats[Math.ceil(0.975 * RESAMPLES) - 1] };
}
