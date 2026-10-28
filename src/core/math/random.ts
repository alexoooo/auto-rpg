/**
 * **The seed of `name`'s own chances** under the shared seed `seed`, a 32-bit word: FNV-1a over
 * the name's UTF-16 units, begun from the seed, so two names under one seed draw apart and a
 * name's draws are the same on every machine.
 */
export function seedOf(seed: number, name: string): number {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error(`a seed is a 32-bit word, not ${seed}`);
  let word = (seed ^ 0x811c9dc5) >>> 0;
  for (let k = 0; k < name.length; k++) word = Math.imul(word ^ name.charCodeAt(k), 0x01000193) >>> 0;
  return word;
}

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
