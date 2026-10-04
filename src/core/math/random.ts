/** Mulberry32 with its word held explicitly for reset and replay. */
export function randomStream(seed: number) {
  const state = { word: seed >>> 0 };
  return { state, next(): number {
    state.word = (state.word + 0x6d2b79f5) | 0;
    let t = Math.imul(state.word ^ (state.word >>> 15), 1 | state.word);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  } };
}
