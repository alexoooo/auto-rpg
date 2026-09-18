// Explicit `.ts` extension, for the reason every file in this tree gives: Node runs a TypeScript
// file by stripping its types, and its ESM resolver insists on the extension where Vite does not.
//
// **This file imports nothing**, and that is its whole reason to exist as a file. Three callers
// need the same seeded stream and none of them may import the others: a Warrior policy in
// `policies.ts`, whose ranges are a Warrior's; the golem mind in `golem/tactics.ts`, which
// deliberately imports no value from that file; and the random build generator and the tournament
// harness of the matchup plan set, which import no policy at all. Until 2026-09-05 the first two
// carried a copy each, and the header of the second argued that six lines of a named public
// algorithm were the cheaper duplication. A third copy would not have been, so the function moved
// here, byte-for-byte, and `tests/rng.test.mjs` pins the stream so that the move is checkable.

/**
 * A small deterministic generator, so that "N bouts" means N different bouts and not one bout run
 * N times.
 *
 * Mulberry32. The variation has to be in the *policies'* own timing -- their cadence jitter and
 * their start offsets -- and not in the physics: nudging a body to make a distribution is
 * measuring a different simulator each time, and the point of a distribution is that every sample
 * is the same simulator. The seed is taken modulo 2^32, so a caller may hand it any integer.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed for a caller nobody gave one to. The policy picker is one such caller. */
export const randomSeed = (): number => (Math.random() * 0x100000000) >>> 0;
