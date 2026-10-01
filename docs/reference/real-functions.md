# The core's functions of a real number

Why the core computes its own sines, exponentials and lengths (`src/core/math/real.ts`,
`src/core/math/turn.ts`), what they are, and what was measured of them.

## Why

ECMAScript fixes `+`, `-`, `*`, `/` and `Math.sqrt` to the bit and leaves `Math.sin` and its kin
to each engine, right to about the last bit. Two engines need not agree, and these two do not:
over 20 000 arguments each, Chrome 154's `Math.sin`, `cos`, `tan`, `asin`, `acos`, `atan`,
`atan2`, `exp`, `expm1`, `log`, `log1p`, `log2`, `log10`, `cbrt`, `sinh`, `cosh` and `tanh` differ
from Node 24.19's in their last bits; `Math.pow`, `**`, `Math.hypot`, `Math.sqrt` and
`Math.fround` agree between those two, and nothing holds `pow` or `hypot` to agree in a third.

A bout amplifies a bit. With the core on the engine's `Math`, one recipe and one tape gave Node's
bout to the bit through step 240 on the built page (Chrome 154) and another bout by step 480: the
link under "Watching one" in [oracle.md](oracle.md) ended at 11.75 s there and at 12.45 s in Node.

## What the core computes with

| Function | From |
|---|---|
| `sin`, `cos`, `tan` | fdlibm's `k_sin.c`, `k_cos.c`, `k_tan.c`, `e_rem_pio2.c`, `k_rem_pio2.c` |
| `asin`, `acos` | `e_asin.c`, `e_acos.c` |
| `atan2` | `e_atan2.c`, `s_atan.c` |
| `exp` | `e_exp.c` |
| `sinh`, `cosh` | `e_sinh.c`, `e_cosh.c`, `s_expm1.c` |
| `cbrt` | `s_cbrt.c` |
| `hypot`, `norm` | each part over the largest, squared, summed with a running compensation; the root, times the largest |
| `square` | `x * x` |

fdlibm (`fdlibm` in `src/core/sources.ts`) is kept operation for operation, in JavaScript's
doubles, with a double's two words read through a typed array; its notice stands at the head of
the module. Every operation in it is one IEEE 754 fixes, so each function returns the same double
in every engine.

There is no power. The one fractional power the core took, a part's share of its body's hit
points (`partHitPoints`, `src/core/rules/pool.ts`: its mass to the two-thirds), is the square of
the mass's cube root. Node's `**` is its platform's `pow`, which a port of fdlibm's `e_pow.c`
differed from in 5.8 % of 2.4 million arguments, so no port could have kept its bits; the cube
root's can be had. Of the 48 parts of the three models, 34 moved, by at most 4 units in the last
place.

Two of Babylon's turns take the engine's sine and cosine, `Quaternion.RotationAxis` and `Slerp`;
the core's own are `turnAboutToRef` and `turnBetweenToRef`, the same arithmetic on the core's
functions.

`tests/core-boundary.test.mjs` holds the line. Under `src/core/`, and in the arena's two modules
whose numbers go into a bout's world (`src/arena/duel.ts`, `src/arena/room.ts`), `Math` is read
only for what is exact (`EXACT_MATH`) and `**` is not written. The core calls no member of
Babylon's math but those read in Babylon's source and found to be arithmetic and a square root
(`EXACT_BABYLON`).

## Against Node's `Math`

`node research/real-against-engine.mjs 5000000`: Node 24.19.0 (V8 13.6.233.17), the sweep of
`tests/fixtures/real-sweep.mjs` at 5 000 000 arguments a draw. Each function is drawn over the
ranges where it changes its method, and over every double there is.

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

Node 24.19's `Math` is fdlibm, and its `hypot` this sum: in 295 million calls not one value
differs in any bit. So moving the core onto its own functions changed no bout in Node. The Warrior
against the Rogue is the same 2547 steps to the same digest of every pose, `3ab8855dc81d4dfa`,
and of the fingerprint's 19 lines (`scripts/fingerprint.mjs`) the three arena bouts' bars moved
in their last digit or two, with the parts' hit points, and nothing else moved.

The test (`tests/core-math.test.mjs`) holds each function's digest over the same sweep at 20 000
a draw to its record, and each value to within a unit in the last place of the running engine's,
whichever engine that is.

## In Chrome

Chrome 154, the sweep imported into a page of the development server, 20 000 arguments a draw:
all 13 digests are the record's, so every one of 1 180 000 values is Node's to the bit. Beside
them, Chrome's own `Math`:

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

A bout on the page, beside the same bout in Node (Node 24.19, `buildBout`, `research/bout.mjs`):
Chrome 154, core world, Rapier, 120 Hz, the arena's own bout (`__arena`) stepped by hand in a
hidden tab with `world.step()`, nothing rendered. A running digest takes the bits of every
segment's position and turn on both sides at every step, and is read every 60 steps and at the
verdict, so a late reading that agrees says every step before it did.

| Bout | Page | Steps | Verdict | Bars | Readings the same as Node's |
|---|---|---:|---|---|---:|
| skeleton v Rogue, gap 4, cap 30, the oracle's tape ([oracle.md](oracle.md), Watching one) | built, and the development server's | 1494 | the Rogue, the skeleton fallen, 12.45 s | 1, 1 | 26 of 26 |
| Warrior v Rogue | the development server's | 2547 | the Warrior, the Rogue fallen, 21.225 s | 0.9942642965393281, 0.848672812168439 | 44 of 44 |
| Warrior v Rogue, balance 5 a side | built | 2112 | the Warrior, the Rogue's head off, 17.6 s | 0.9732457233222181, 0.5696885055513037 | 37 of 37 |

Each is Node's bout: the steps, the verdict, the bars to their last digit and every reading. No
test holds a browser to this, since none runs in one; to read it again, import
`tests/fixtures/real-sweep.mjs` into a served page and set its digests beside `RECORD`
(`tests/core-math.test.mjs`).

## A step's cost

Node 24.19, core world, Rapier, 120 Hz; the Warrior against the Rogue to its verdict, the least
of six bouts' mean step, on a quiet machine: 1.270 ms a step on the engine's `Math`, 1.296 and
1.334 ms in two readings on the core's own, 2 to 5 % more.

## What is not covered

The lab and the crypt still take the engine's sine, cosine, arctangent and length where they
place a body or aim an order (`src/lab/`, `src/dungeon/`), so a lab scenario or a crypt run is not
yet held to be the same in every engine; the core and an arena bout are. What a person orders at
the keys is read with the engine's `Math` too (`src/arena/orders-input.ts`), and is on the tape
as the number it came to, so a replay gives the same order in any engine.
