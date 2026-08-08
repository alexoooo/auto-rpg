# ADR 0001: deterministic fixed-point simulation

**Purpose:** Record why authoritative simulation math uses fixed-point integers.
**Status:** current
**Canonical source:** The current normative contract is [Determinism](../reference/determinism.md); implementation lives in [`fx`](../../crates/fx/src/lib.rs#L1).
**Update when:** The numeric representation, portability boundary, or authoritative dependency policy changes.

**ADR status:** accepted

## Context

The project promises that a run can be reproduced byte for byte across native and
wasm targets, build profiles, and threads. Ordinary floating-point arithmetic is
close to sufficient, but the surrounding execution model is not: libm
transcendentals can differ by target, fused operations can change rounding, and
vectorized reductions can change evaluation order. A one-bit difference can alter a
comparison and send the rest of a run down a different branch.

Wrapping integer arithmetic is no better as a foundation. It historically meant a
debug build could panic where a release build wrapped, giving the two profiles
different histories.

## Decision

Authoritative simulation state and the calculations that feed it use the local `fx`
crate. `Fx` is signed 16.16 fixed point, angles use a 16-bit binary representation,
trigonometry uses committed deterministic implementations, and arithmetic is total
and saturating. Floating point is a one-way presentation conversion and cannot feed
back into authoritative state.

Random decisions are derived from explicit stream keys rather than mutable RNG state
owned by `World`. The simulation also fixes traversal and tie-breaking rules. These
choices are one decision: a deterministic number type without deterministic ordering
and randomness would not provide a deterministic run.

The exact rules are intentionally not duplicated here. They are normative in
[Determinism](../reference/determinism.md).

## Consequences

- Native, wasm, debug, release, and parallel verification can compare the same state
  hash rather than accepting tolerances.
- Simulation code cannot use host math libraries or send rendered `f32` values back
  into the world.
- Overflow saturates consistently. Saturation remains a defect to catch with tests;
  making it portable does not make it desirable.
- Approximation tables and rounding rules are compatibility inputs and require the
  same review as state-machine changes.
- Policies sit outside this portability promise. Recording their chosen commands
  keeps a nondeterministic future policy from weakening the simulation contract; see
  [ADR 0002](0002-record-commands-in-replays.md).

## Superseded implementation detail

The integer square root used to be a hand-rolled restoring bit search. It now uses
`u64::isqrt`, whose result is defined by an exact integer property. That changed the
implementation and established Rust 1.84 as the effective minimum toolchain, but did
not change the decision or any golden hash. The lesson is useful: an implementation
may be replaced when its exact contract, cross-target check, and unchanged goldens
all survive.

## Source anchors

- Fixed-point representation and saturation: [`Fx`](../../crates/fx/src/fixed.rs#L14)
- Presentation-only float conversion: [`Fx::to_f32`](../../crates/fx/src/fixed.rs#L166)
- Committed angle lookup and fixed-point `atan2`: [`Angle::sin`](../../crates/fx/src/angle.rs#L65), [`atan2`](../../crates/fx/src/angle.rs#L136)
- Counter-derived random streams: [`Rng::from_stream`](../../crates/fx/src/rng.rs#L54)
- Cross-thread and replay checks: [`determinism.rs`](../../crates/sim/tests/determinism.rs#L1)
