# The core's functions of a real number

Why the core computes its own sines, exponentials and lengths (`src/core/math/real.ts`,
`src/core/math/turn.ts`), what they are, and what was measured of them. The match
(`src/evaluation/match/`) relies on the result: a bout is the same in every engine.

## Why

ECMAScript fixes `+`, `-`, `*`, `/` and `Math.sqrt` to the bit and leaves `Math.sin` and its kin to
each engine. Over 20 000 arguments each, Chrome 154's `Math.sin`, `cos`, `tan`, `asin`, `acos`,
`atan`, `atan2`, `exp`, `expm1`, `log`, `log1p`, `log2`, `log10`, `cbrt`, `sinh`, `cosh` and `tanh`
differ from Node 24.19's in their last bits; `Math.pow`, `**`, `Math.hypot`, `Math.sqrt` and
`Math.fround` agree between those two, and nothing holds `pow` or `hypot` to agree in a third.

A bout amplifies a bit: with the core on the engine's `Math`, one recipe and tape gave Node's bout to
the bit through step 240 on the built page and another bout by step 480 (the oracle's bout under
"Watching one" in [oracle.md](oracle.md) ended at 11.75 s in Chrome and 12.45 s in Node).

## What the core computes with

| Function | From |
|---|---|
| `sin`, `cos`, `tan` | fdlibm's `k_sin.c`, `k_cos.c`, `k_tan.c`, `e_rem_pio2.c`, `k_rem_pio2.c` |
| `asin`, `acos` | `e_asin.c`, `e_acos.c` |
| `atan2` | `e_atan2.c`, `s_atan.c` |
| `exp` | `e_exp.c` |
| `log` | `e_log.c`: equal to Node 24.19's `Math.log` on 2,500,014 arguments (2 million of `exp` over -700 to 700, half a million within 0.0005 of 1, and the edges); ratings read it (`src/evaluation/rating.ts`) |
| `sinh`, `cosh` | `e_sinh.c`, `e_cosh.c`, `s_expm1.c` |
| `cbrt` | `s_cbrt.c` |
| `hypot`, `norm` | each part over the largest, squared, summed with a running compensation; the root, times the largest |
| `square` | `x * x` |

fdlibm (`fdlibm` in `src/core/sources.ts`) is kept operation for operation in doubles, a double's
two words read through a typed array; its notice heads the module. Every operation is one IEEE 754
fixes, so each function returns the same double in every engine.

- **No power.** A part's share of its body's hit points (`partHitPoints`, `src/core/rules/pool.ts`:
  mass to the two-thirds) is the square of the mass's cube root. Node's `**` is its platform's
  `pow`, from which a port of fdlibm's `e_pow.c` differed in 5.8 % of 2.4 million arguments; the
  cube root can be had. 34 of the three models' 48 parts moved, by at most 4 units in the last place.
- **Turns.** Babylon's `Quaternion.RotationAxis` and `Slerp` take the engine's sine and cosine; the
  core's `turnAboutToRef` and `turnBetweenToRef` are the same arithmetic on its own functions.
- `tests/core-boundary.test.mjs` holds the line: under `src/core/` and in what the bout's and the
  Crypt run's builders and each evaluation's cases reach beside it (`worldBuilders`), `Math` is
  read only for what is exact (`EXACT_MATH`) and `**` is not written; under `src/core/` only
  Babylon math read and found to be arithmetic and a square root is called (`EXACT_BABYLON`).

## Against Node's `Math`

`node research/real-against-engine.mjs 5000000`: Node 24.19.0 (V8 13.6.233.17), the sweep of
`tests/fixtures/real-sweep.mjs` at 5 000 000 arguments a draw, over the ranges where each function
changes its method and over every double.

| function | calls | differ from the engine's | widest, units of the last place | differ in kind | digest |
|---|---:|---:|---:|---:|---|
| sin | 25000000 | 0 | 0 | 0 | fd50d4c484e958c8 |
| cos | 25000000 | 0 | 0 | 0 | ca1facf7d840fbe9 |
| tan | 25000000 | 0 | 0 | 0 | d517775bf1883865 |
| asin | 20000000 | 0 | 0 | 0 | d0fc2bbd87d82fca |
| acos | 20000000 | 0 | 0 | 0 | a86134090b7be853 |
| atan2 | 25000000 | 0 | 0 | 0 | a5214145fd50ae79 |
| exp | 25000000 | 0 | 0 | 0 | 806e6c72a8931936 |
| sinh | 25000000 | 0 | 0 | 0 | c843459e30101f2a |
| cosh | 25000000 | 0 | 0 | 0 | 378ad6908da3f955 |
| cbrt | 20000000 | 0 | 0 | 0 | 63f8df3f807a3920 |
| hypot of 2 | 20000000 | 0 | 0 | 0 | fd5f9bf2f81d45b9 |
| hypot of 3 | 20000000 | 0 | 0 | 0 | cca8baeb2dc0a27a |
| norm of 6 | 20000000 | 0 | 0 | 0 | 81a31d4edae2bfa3 |

Node 24.19's `Math` is fdlibm and its `hypot` this sum: not one of 295 million values differs. So the
move changed no bout in Node: the Warrior against the Rogue is the same 2547 steps to the same pose
digest, `3ab8855dc81d4dfa`, and of the fingerprint's 19 lines only the arena bouts' bars moved, in
their last digit or two, with the parts' hit points. The test holds each digest over the same sweep
at 20 000 a draw, and each value within a unit in the last place of the running engine's.

## In Chrome

Chrome 154, the sweep imported into a served page, 20 000 arguments a draw: all 13 digests are the
record's, so all 1 180 000 values are Node's to the bit. Chrome's own `Math` beside them:

| function | calls | Chrome's `Math` differs from the core's | widest, units of the last place |
|---|---:|---:|---:|
| sin | 100000 | 2729 | 1 |
| cos | 100000 | 2635 | 1 |
| tan | 100000 | 2958 | 1 |
| asin | 80000 | 1533 | 1 |
| acos | 80000 | 3214 | 1 |
| atan2 | 100000 | 10458 | 1 |
| exp | 100000 | 6070 | 1 |
| sinh | 100000 | 5644 | 3 |
| cosh | 100000 | 4547 | 1 |
| cbrt | 80000 | 6690 | 1 |
| hypot of 2 | 80000 | 0 | 0 |
| hypot of 3 | 80000 | 0 | 0 |
| norm of 6 | 80000 | 0 | 0 |

Bouts on the page (Chrome 154, core world, Rapier, 120 Hz, `__arena` stepped by hand in a hidden
tab) beside Node's (Node 24.19, `buildBout`, `research/bout.mjs`): a running digest of every
segment's position and turn on both sides, read every 60 steps and at the verdict.

| Bout | Page | Steps | Verdict | Bars | Readings the same as Node's |
|---|---|---:|---|---|---:|
| skeleton v Rogue, gap 4, cap 30, the oracle's tape ([oracle.md](oracle.md), Watching one) | built, and the development server's | 1494 | the Rogue, the skeleton fallen, 12.45 s | 1, 1 | 26 of 26 |
| Warrior v Rogue | the development server's | 2547 | the Warrior, the Rogue fallen, 21.225 s | 0.9942642965393281, 0.848672812168439 | 44 of 44 |
| Warrior v Rogue, balance 25 % a side | built | 2112 | the Warrior, the Rogue's head off, 17.6 s | 0.9732457233222181, 0.5696885055513037 | 37 of 37 |

Crypt runs on the page (Chrome 154, the development server's, `crypt-clear`'s `standard` cases
(`src/evaluation/crypt-clear/cases.ts@164aa9a9`) built and stepped by `WORLD_BUILDERS.crypt` in a
served page, the `rapier` engine, not the default `rapier-coordinate`) beside Node's (Node 24.19,
the same module): a running digest of every fighting body's segments, read every 120 steps.

| Case | Seconds | Readings the same as Node's |
|---|---:|---:|
| seed 10, trial 0, against the mob | 180 | 180 of 180 |
| seed 25, trial 0, against independent enemies | 180 | 180 of 180 |

The run asks the engine's `Math` only while Babylon builds the level's meshes (a torus's and a
mesh's turn, a colour's conversion), read by counting each function's callers over 30 s; with every
inexact member's result scaled by 1 - 1e-9 in Node, both cases' digests are unchanged over 5 s;
while companions were placed with the engine's sine (`companionSpawn`), they parted at 2 s. Chrome's `Math.sin`
differs from Node's at one of the twelve bearings a companion is tried on (pi + pi/3); neither
case places one there.

No test runs in a browser; to read it again, import `tests/fixtures/real-sweep.mjs` into a served
page and set its digests beside `RECORD` (`tests/core-math.test.mjs@2a1b29ac`).

A step's cost (Node 24.19, the Warrior against the Rogue to its verdict, the least of six bouts' mean
step, quiet machine): 1.270 ms on the engine's `Math`, 1.296 and 1.334 ms on the core's, 2 to 5 % more.

## What is not covered

The falls (`src/evaluation/fall.ts`, `rising.ts`) and the Lab's scenarios compute with the core's
functions, held by the boundary test, and neither has been read on a page beside Node. The Crypt's look (`CRYPT_LOOK`: its decals, dressing and fog shader)
takes the engine's arithmetic and decides nothing a body meets; Babylon's math is checked only
under `src/core/`. A person's keys are read with the engine's `Math`
(`src/arena/orders-input.ts`) but go on the tape as the number they came to.
