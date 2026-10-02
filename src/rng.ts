/**
 * Mulberry32, a small deterministic generator: everything seeded (the crypt's levels and their
 * dressing, the lab's targets) draws from it, so a seed names one level or one set of targets. The
 * seed is taken modulo 2^32, so any integer will do.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return next;
}

