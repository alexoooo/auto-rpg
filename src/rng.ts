/**
 * Mulberry32, a small deterministic generator: everything seeded (the crypt's levels and their
 * dressing, the lab's targets) draws from it, so a seed names one level or one set of targets. The
 * seed is taken modulo 2^32, so any integer will do.
 */
import { randomStream } from "./core/math/random.ts";

export function mulberry32(seed: number): () => number { return randomStream(seed).next; }
