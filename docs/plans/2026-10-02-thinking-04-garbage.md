# Thinking 04: a step that makes no garbage of its own

## Goal

What a body's control works in is made with the body and written in place: no matrix, vector or
closure is made in a step by the core's own code. A test holds what a step allocates under a
ceiling that each chunk lowers. Every bout, run and fingerprint is the same to the bit.

It needs no other plan. The design is `2026-10-02-thinking-00-design.md`, rule 3. What is
allocated today, by file and by function, is
[step-cost.md](../reference/step-cost.md#where-a-bout-allocates): 1905 KiB a step in a two-body
bout, 93 % of it under the bodies' muscle hooks; 0.54 MiB a body a step standing.

**What it buys is measured, not promised.** The collector is about 1 % of a step. The gain is in
the code that stops allocating: one function tried ran a fifth faster and the step 1 to 3 %
(the design's Readings). Every chunk reads the step's time before and after and writes both down.

## The rules of the rewrite

1. **The same operations in the same order on the same numbers.** A sum that began at 0 begins
   at 0 (`0 + -0` is `+0`); a product is not regrouped; a `reduce` becomes a loop over the same
   index order; `Math.max(...list)` becomes `Math.max` folded from `-Infinity`. No operation is
   added, removed or fused.
2. **A function takes what it writes into**: its result is its first argument (`…To`), as
   Babylon's `…ToRef` take theirs last. It returns nothing a caller could keep.
3. **A work array carries nothing from one call to the next**: a function writes every entry it
   reads. So a work array is not state (`src/core/state.ts`), a save holds none, and a bout forked
   into fresh ones plays the same (`tests/arena-fork.test.mjs`, `tests/core-fork.test.mjs`).
4. **A work array sized by the body is made with the body**, in the closure of whatever is made
   with it (`bodyDynamics`, `jointTracker`, `motorControl`, the stance, a hand's reach), sized
   from its spec: its freedoms, its limbs, each limb's patches. One of a fixed size (a 3-vector,
   a 3 x 3) is the same. No work array is a module's own: two bodies share none.
5. **A loop is a `for`**, where it was `map`, `forEach`, `reduce`, `flatMap`, `Array.from`, a
   spread or a destructured swap in a step. Code that runs once at construction stays as it reads
   best.

## Files

| File | Change |
|---|---|
| `tests/core-garbage.test.mjs` | New: the ceilings (chunk A), lowered by every chunk. |
| `src/core/math/flat.ts` | New: the kernel on flat `Float64Array`s (chunk B). |
| `tests/core-flat.test.mjs` | New: the kernel against `linalg.ts`, to the bit. |
| `src/core/build/dynamics.ts`, `joint-state.ts` | Chunk C. |
| `src/core/control/contact-wrench.ts` | Chunk D. |
| `src/core/control/bearing.ts`, `support.ts` | Chunk E. |
| `src/core/control/kinematics.ts`, `motor.ts` | Chunk F. |
| `src/core/math/linalg.ts`, `tests/core-bounded-least-squares.test.mjs` | Deleted and ported, with chunk F: its last importer is gone. |
| `src/core/engine/rapier.ts`, `src/core/rules/blows.ts`, `src/core/mind/senses.ts`, whatever the sites table still names | Chunk G. |
| `docs/reference/step-cost.md`, `docs/architecture.md`, `AGENTS.md`, `docs/roadmap.md` | See Documents. |

## Chunks

Each lands green by itself, in this order, and each ends with the same four readings (below).

### A. The meter and the ceiling

`tests/core-garbage.test.mjs`, with `allocatedIn` (`tests/harness/garbage.mjs`):

```js
/**
 * The most a body's step may allocate, KiB, by fixture: the reading when the ceiling was last
 * lowered, and a tenth over it. A change that raises a reading over its ceiling takes its
 * allocation out; one that lowers it under four fifths of its ceiling lowers the ceiling.
 */
const CEILING = { standing: ..., bout: ... };
```

- **Standing**: two skeletons with the club under the command layers, ordered to stand, 3 m
  apart (`research/step-garbage.mjs`'s fixture, shared through a harness function so the test
  and the script stand the same bodies): 240 steps after 3 s. Today 550 to 610 KiB a body a step.
- **Bout**: the Warrior against the Rogue with clubs, the bout `research/bout-trace.mjs` plays,
  from 2 s for 480 steps. Today about 950 KiB a body a step.
- The ceiling is set from five readings in one process each: the highest, and a tenth. The
  sampling interval is 2048 bytes while a body allocates over 100 KiB a step and 256 under it,
  so a reading is never of fewer than a few hundred samples.

Tests:

1. **`a_standing_body_s_step_allocates_no_more_than_its_ceiling`**
2. **`a_bout_s_step_allocates_no_more_than_its_ceiling`**
3. **`the_meter_sees_an_array_made_in_a_step`**: the standing fixture with a hook that makes one
   `new Array(1024)` a step reads at least 8 KiB a step more: the control for 1 and 2.
4. **`a_ceiling_is_within_a_tenth_of_its_reading`**: a reading under 0.8 of its ceiling fails,
   and says to lower it: the ratchet.

### B. The flat kernel (`src/core/math/flat.ts`)

A matrix of `rows` by `cols` is row-major in one `Float64Array`: entry (r, c) is
`a[r * cols + c]`. Each function is `linalg.ts`'s, operation for operation:

```ts
/** `x` from `A x = y`, `A` of `n` by `n`, by elimination with partial pivoting; `A` and `y` are left as they were. `work` holds n (n + 1) numbers and `order` n. */
export function solveLinearTo(x: Float64Array, A: Float64Array, y: Float64Array, n: number, work: Float64Array, order: Int32Array): void
/** `x` from `A x = y`, `A` symmetric positive definite, by Cholesky. `work` holds n n + n. */
export function solveSymmetricTo(x: Float64Array, A: Float64Array, y: Float64Array, n: number, work: Float64Array): void
/** `x` from the 3 by 3 `A x = b`, by Cramer's rule. */
export function solve3To(x: Float64Array, A: Float64Array, b: Float64Array): void
/** `fixedSolve`: the damped least squares of `J x = y` with the entries `fixed` names held. */
export function fixedSolveTo(x: Float64Array, J: Float64Array, y: Float64Array, fixed: Float64Array, rows: number, cols: number, damping: number, work: FixedWork): void
/** `boundedLeastSquares`: the least of (x - y)' A (x - y) over lo <= x <= hi. */
export function boundedLeastSquaresTo(x: Float64Array, A: Float64Array, y: Float64Array, lo: Float64Array, hi: Float64Array, n: number, work: BoundedWork): void
/** The work a solve of this size needs, made once. */
export function fixedWork(rows: number, cols: number): FixedWork
export function boundedWork(n: number): BoundedWork
```

- `solveLinear` swaps two rows by reference; the flat one keeps the rows' order in `order` and
  reads row `order[r]`: the same numbers meet in the same operations.
- A solve on a part of a system (the free columns of `fixedSolve`, the free unknowns of
  `boundedLeastSquares`) packs the part into its work at the size it has that call; nothing is
  sized in a step.
- An export has an importer: the kernel's functions are exported as their callers arrive, the
  test being the first reader of each.

`tests/core-flat.test.mjs`: for each function, 200 systems from a seeded generator
(`src/rng.ts`, which the test imports: the kernel does not), sizes 1 to 14, among them a singular one, a nearly singular one, one with
zeros on its diagonal (a pivot), one whose bounds bind at every entry and one where none does:
every entry of the flat answer is the row answer's by `Object.is`. **Mutations**: a sum begun
from its first term in place of 0 (a `-0` case in the fixture goes red); the pivot's comparison
`>=` for `>`; a product regrouped.

### C. The body's dynamics and its joints

`src/core/build/dynamics.ts`: `cross3`, `inertiaTimes`, `velocityProducts` and the loop that sums
the mass matrix write into arrays made in `bodyDynamics`. `src/core/build/joint-state.ts`:
`rotationOfToRef`, `turningToRef`, `ratesToRef`, `motionAxesToRef` and `jointTracker.update` the
same. Sites table: 280 and 117 KiB a step in the bout. The tried loop alone took 157 KiB and
13 to 16 us off the function.

### D. The ground's wrench

`src/core/control/contact-wrench.ts`: `shareGroundWrench` and `activeSet`. The system's sizes are
the stance's limbs' patches', known when the stance is made: a sole has 6 unknowns and 17 limits,
a point 3 and 5. `A`, `D`, `H`, `g`, `C`, `x`, the active set's `K` and its right-hand side are
flat arrays in the stance's work, filled in place every iteration; the `limit` closures become
rows written by a loop. Sites table: 550 KiB a step, `activeSet` 297 of it. This is the largest
function in the step's time too (16 % of a bout), so its before and after is the reading that
says most.

### E. Bearing on limbs

`src/core/control/bearing.ts`: `carryRoot`, `limitToPatches`, `solveLimb`, `bearLimbs`,
`jacobian`, `rootRows`, `heldFreedoms`, `rootAim`, `boundFree`, `groundWrench`, `limbTorques`, on
`BearingScratch` grown to hold them; `support.ts`'s reads the same. Sites table: `carryRoot` 495
KiB a step (`limitToPatches` 303), `bearLimbs` 274 (`solveLimb` 168).

### F. The hands' reach

`src/core/control/kinematics.ts`: `solveReach`'s Jacobian, its steps and its passes' vectors in a
work made with the hand's chain; `motor.ts`'s `solveAt` hands it over. Sites table: 514 KiB a
step in the steps a hand reaches. The solver's passes are what they were: its running to its cap
is the roadmap's, and this chunk makes each pass cheaper and changes none.

With F, `linalg.ts` has no importer in `src/`: it is deleted,
`tests/core-bounded-least-squares.test.mjs` is ported to `boundedLeastSquaresTo`, and
`tests/core-flat.test.mjs` holds each function to a digest of its answers over the same seeded
systems, taken in the commit before, where the two agreed.

### G. What is left

`node research/step-garbage.mjs --sites` is read again. Every row under `src/` over 1 KiB a body
a step is taken out by the rules above: by the table today, the touches and the blows' watch
(64 KiB), the senses and the minds over motor control (80), `real.ts` (47) and the engine module
(34).

The engine's binding makes an object for each vector it is asked (60 KiB a step): a pose is read
once a body a step already, and a velocity is read by the muscles, the fists and the blows.
Where the table shows the same body's velocity read more than once a step, the engine module
reads each dynamic body's two velocities once after the solver's step into arrays of its own and
answers `…ToRef` from them, and whatever writes a body's velocity (an impulse, `setFixed`, a
load) marks that body to be read again. `tests/core-engine.test.mjs` holds it: a velocity read
after an impulse is the new one. Where the table shows one read a body, nothing is done.

What remains is named in the test's comment with its bytes: the binding's wrappers, and numbers
V8 boxes in code it has not compiled yet. The last ceiling is theirs.

## Each chunk's readings

Before the chunk and after it, on a quiet machine, written into the chunk's commit message and
`docs/reference/step-cost.md`:

```powershell
node research/bout-trace.mjs
node scripts/fingerprint.mjs > after.txt
node research/step-garbage.mjs --bodies 2,8
node research/step-garbage.mjs --sites
node research/step-time.mjs --profile
```

- **The digest and every fingerprint line are as they were.** A chunk that moves one is wrong:
  it is found by halving the chunk, never accepted.
- KiB a body a step, standing and in the bout; the ceilings in `tests/core-garbage.test.mjs`
  lowered to the new readings and a tenth.
- The step's median and mean in the bout, and the changed functions' own time, each the least of
  three playings, read twice: a difference inside the spread of the two is written as none.

## Tests

Beside chunk A's and B's:

5. Every existing test of the changed modules stands unchanged where it reads behaviour:
   `tests/core-dynamics.test.mjs`, `core-joint-state.test.mjs`, `core-contact-wrench.test.mjs`,
   `core-bearing.test.mjs`, `core-reach.test.mjs`, `core-stance.test.mjs`, `core-servo.test.mjs`.
   One that called a function for its returned array passes it an array.
6. **`two_bodies_share_no_work`** (`tests/core-garbage.test.mjs`): two bodies of one spec in one
   world, one shoved: the other's trace equals its trace in a world where it stands alone at the
   same place. It fails if a work array is a module's own and a call is left half read.
7. `tests/arena-fork.test.mjs` and `tests/core-fork.test.mjs` stand: rule 3.
8. `tests/core-boundary.test.mjs` stands: `flat.ts` is the core's and uses IEEE's operations
   alone.

## Mutations, each must go red

- A work array left unwritten where it is read (an entry kept from the last call): the bout's
  digest, and test 7.
- One work array shared by two bodies' trackers: test 6.
- A temporary put back in a step (`[...row]` in a solve): test 1.
- A ceiling left where it was after a chunk took a fifth off its reading: test 4.
- The velocity cache not marked by an impulse (chunk G): `tests/core-engine.test.mjs`.

## Documents

- `docs/reference/step-cost.md`: `## Where a bout allocates` and `## Bodies in a step` read again
  after the last chunk, beside the tables there, with each chunk's row: KiB a body a step and the
  step's time before and after.
- `docs/architecture.md`: the kernel and the work arrays in the core's part; `linalg.ts` out.
- `AGENTS.md`, Code: "**A step makes no garbage of its own.** What a body's control works in is
  made with the body (`src/core/math/flat.ts`) and written in place by functions that take what
  they write into; a work array carries nothing between calls and no two bodies share one.
  `tests/core-garbage.test.mjs` holds what a step allocates under a ceiling: lower it with the
  reading, never raise it."
- `docs/roadmap.md`: the item goes, and what remains (the binding's wrappers) is said where the
  engine's open items are.

## Verification

```powershell
node scripts/fingerprint.mjs > before.txt
npm test
npm run check
npm run build
node scripts/fingerprint.mjs > after.txt
node research/bout-trace.mjs
```

`before.txt` and `after.txt` are the same file. No eye gate: nothing a person sees changes.
