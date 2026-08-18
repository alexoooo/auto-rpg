# ADR 0002: record commands in replays

**Purpose:** Record why replay captures submitted decisions instead of rerunning policy inference.
**Status:** current
**Canonical source:** The current normative replay contract is [Hashes and replay integrity](../reference/hashes.md); implementation lives in [`Replay`](../../crates/sim/src/replay.rs#L64).
**Update when:** Replay begins recording policy state, observations, host mutations, or a different authoritative input vocabulary.

**ADR status:** accepted

## Context

A seed plus a policy identifier is compact, but it only reproduces a run if policy
execution is itself portable. A future neural policy may reduce a matrix multiply in
different orders under wasm SIMD and native vector instructions. A last-bit logit
difference can flip a near-tied choice, after which the two runs no longer have the
same inputs.

The first replay implementation also recorded agent decisions without standing
orders. Playback reproduced the bodies' earlier footwork but diverged because orders
are external inputs and part of world state. Objectives were subsequently recognized
as the same kind of input.

## Decision

Replay records the concrete `Command` submitted for an entity at a tick, together
with faction `Order` and `Objective` changes. Playback constructs a fresh world from
the cloned scenario and seed and submits those recorded inputs without observing the
world or invoking a policy.

This ADR chooses the information to record, not a durable wire format. The current
`Replay` is an unversioned, public, in-memory Rust structure. Its exact current
behavior and limitations are normative in [Hashes and replay integrity](../reference/hashes.md).

## Consequences

- Policy implementations may be target-dependent without weakening `World`'s
  portability guarantee.
- Replay size scales with decisions rather than remaining one seed. Compression and
  a persistent codec are separate concerns.
- Every external mutation needed for reproduction must have a recorded input form.
  The current recorder covers commands, orders, and objectives, not the browser's
  editing mutators.
- The replay preserves the command as submitted, including its one current
  `LimbCommand`; it does not reconstruct intent from observations.
- Playback trusts recorder ordering and public vectors. The current type does not
  validate a hostile or manually rearranged replay.

## Superseded measurements and descriptions

An older design note priced a 36-byte `Command` with two hand commands and said
`LimbCommand::strike` was hashed on both hands. That described an intermediate
two-hand model. The current command contains exactly one limb command, and Rust
layout size is not a replay-format promise. The durable finding survives the model:
dropping limb input reproduces movement and loses the fight.

The historical estimate of roughly 180 decision records per second for thirty
agents deciding every ten ticks remains an order-of-magnitude illustration, not a
normative size or throughput guarantee.

## Source anchors

- Replay rationale and current record vectors: [`Replay`](../../crates/sim/src/replay.rs#L64)
- Playback without policy execution: [`Replay::play_until`](../../crates/sim/src/replay.rs#L152)
- Current single-limb command: [`Command`](../../crates/sim/src/command.rs#L544)
- Headless recording path: [`run`](../../crates/policy/src/runner.rs#L97)
