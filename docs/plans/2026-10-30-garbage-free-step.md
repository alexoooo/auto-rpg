# A garbage-free step

## Why

The owner wants the game close to garbage-free in its steady state: it is a real-time game with a
frame-rate target, so every allocation in a hot path needs a reason to exist; an allocation from
time to time is fine. Today a body's step allocates 111 KiB standing and 286 to 703 in a bout,
by mind ([allocation ceilings](../reference/step-cost.md#allocation-ceilings)). The bout once read
113 ([control written into arrays made once](../reference/step-cost.md#control-written-into-arrays-made-once)),
so most of it came back with code added since.

- **Where it goes** (Option Mind, sword, 695 KiB): reading contacts out of Rapier (`pairWith`,
  `contactsOf` and the binding's calls, `src/core/engine/rapier.ts`) about 200; the contact-mass
  solve (`src/core/build/contact-mass.ts`) about 130; then a long tail of small arrays, closures,
  `map` and `for…of` in the legs, the arbiter, the clear-step sweep and the mind's own options.
- **A `for…of` over a frozen array allocates at every element**, optimized or not, and nearly every
  constant here is frozen (`deepFreeze`): a hot loop over one is read by index.

## Steps

Each step is a speed rewrite: the same operations in the same order, no fingerprint case moved,
the step's time and the allocation readings before and after in
[step cost](../reference/step-cost.md), and the ceiling lowered to the new readings.

1. **Every game mind under one ceiling.** Built: each game mind fights itself on its first body
   (`tests/core-step-cost.test.mjs`), one ceiling for all; the opening selector works in arrays
   made once (Duellist 1115 KiB to 615). Check: the gate.
2. **The contacts' read.** `contactsOf` and `pairWith` make nothing a step: sums in arrays kept with
   the world, the out list reused by its reader, no `Map`, `sort` or spread a step. Check: the
   fingerprint; the standing reading.
3. **The contact-mass solve.** `contact-mass.ts`'s rows and paths in work arrays, its `map`s loops.
   Check: the fingerprint; the readings.
4. **The tail, by profile.** The next site of the per-mind profile, one at a time, until no site
   of the toolkit's is over 2 KiB a body a step. Check: as above.
5. **Each mind's own.** Option Mind's options and percepts, the reptile's, the tactics: none over
   2 KiB a body a step. Check: as above.
6. **The ceiling as the contract.** Each fixture's ceiling set to its readings once the steps land,
   and what Rapier's binding allocates by itself named and kept apart.

## Done when

A game mind's bout allocates under 50 KiB a body a step beyond what Rapier's binding makes by
itself, held by the gate's ceiling.
