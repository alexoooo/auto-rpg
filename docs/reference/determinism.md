# Determinism

**Purpose:** Define the normative portability contract for authoritative simulation.
**Status:** current
**Canonical source:** [`fx`](../../crates/fx/src/lib.rs#L1), [`sim`](../../crates/sim/src/lib.rs#L1), and the executable checks in [`determinism.rs`](../../crates/sim/tests/determinism.rs#L1).
**Update when:** Any authoritative numeric, randomness, ordering, dependency, or portability rule changes.

<!-- DOC_CONTRACT: determinism-contract -->
## Contract

Given the same `Scenario`, seed, and sequence of submitted commands, orders, and
objectives, `World` must produce byte-identical authoritative state on every
supported target, in every build profile, and regardless of the thread on which the
run was computed. `World::state_hash` is the current comparison mechanism; its exact
coverage is specified in [Hashes](hashes.md).

The following rules are normative:

1. No floating-point representation may enter authoritative simulation state, and
   authoritative calculations from accepted inputs may not use floating point.
   `Fx::to_f32` is presentation-only; its result must not cross back across the
   authority boundary as a simulation value. A policy may use floating point outside
   that boundary and submit the fixed-point `Command` it selected.
2. Authoritative scalar arithmetic uses signed 16.16 `Fx`. Its ordinary arithmetic
   operators saturate rather than wrap or panic. Division by zero is total and
   saturates according to the implementation contract.
3. Authoritative trigonometry may not call platform transcendental functions.
   `Angle::sin` and `Angle::cos` use the committed table; `atan2` is fixed-point.
4. `World` may not own evolving RNG state. A random choice must be reconstructed
   from explicit stable keys with `Rng::from_stream`, so visitation order cannot
   consume another decision's draw.
5. Authoritative iteration order and tie-breaks must be explicit and stable. Entity
   traversal is ascending by slot; comparisons with equal scores break ties by stable
   identity/index rules.
6. Deaths resolve after all attacks for the tick. Simultaneous lethal attacks must
   not be ordered by which entity was visited first.
7. `sim` may not observe a wall clock, perform I/O, spawn work, or depend on a host,
   renderer, or engine. It depends only on the local deterministic `fx` crate and
   `std`/`core` facilities whose used operations have exact semantics.
8. Dependencies stop at the authority boundary. Types or outputs from host,
   presentation, offline asset, or explicitly nondeterministic learning dependencies
   may not enter `Scenario`, `World`, submitted inputs, replay records, or a hash
   domain without becoming reviewed deterministic inputs themselves.

Saturation is deterministic failure containment, not permission to overflow. Tests
and invariants should reject reachable saturation where it would hide a mechanics
error.

<!-- DOC_CONTRACT: determinism-boundary -->
## Boundary of the promise

Policies are not required to produce the same decision on every target. They receive
an `Observation` and return a `Command`, and replay records that returned command.
The portability requirement begins at the submitted input and covers `World`, not
the computation that chose it.

Rendering, printing, asset processing, and training may use floating point outside
the authority boundary. They must quantize or otherwise construct an approved
deterministic input before affecting a run; a rendered value is never such an input
by accident.

This section supersedes the former `DESIGN.md#what-is-not-covered` entry.

## Required verification

- `cargo test` must pass across the workspace.
- After any crate change, build `web` for `wasm32-unknown-unknown` and run
  `node --test tools/wasm_check.js`; native and wasm state hashes must agree.
- A changed pinned hash must be predicted before the edit and explained. The current
  pins and ownership rules are in [Hashes](hashes.md).

## Source anchors

- Fixed-point contract and authority boundary: [`fx` crate documentation](../../crates/fx/src/lib.rs#L1)
- Saturating numeric representation: [`Fx`](../../crates/fx/src/fixed.rs#L14)
- Deterministic stream derivation: [`Rng::from_stream`](../../crates/fx/src/rng.rs#L54)
- World comparison function: [`World::state_hash`](../../crates/sim/src/world.rs#L4524)
- Cross-thread, rerun, and replay assertions: [`determinism.rs`](../../crates/sim/tests/determinism.rs#L1)
