# ADR 0003: Keep renderers outside simulation authority

**Purpose:** Record why rendering is a snapshot consumer rather than an authority.
**Status:** current
**Canonical source:** [`crates/sim/Cargo.toml`](../../crates/sim/Cargo.toml), [`crates/web/src/lib.rs`](../../crates/web/src/lib.rs#L4361), and the [renderer contract](../reference/renderer-contract.md#renderer-owned-snapshot-boundary)
**Update when:** A renderer gains authority, a new host boundary ships, or the production renderer choice changes.

## Decision

`sim` owns deterministic gameplay and depends only on `fx`. A renderer lives outside
that crate, consumes observations or snapshots, and cannot write presentation types
back into `Scenario`, `World`, submitted commands, replay, or hash domains.

The shipped v2 procedural greybox is GPU-based and consumes copied snapshots from a
Worker-owned wasm instance. It consumes authoritative visibility and identity
information and may not infer a second gameplay truth from scene geometry.

**Amended 2026-08-17: the Canvas client was the reference/debug renderer and has been
retired.** That removes the comparison instrument this ADR named, and it does not
disturb the decision — the boundary is what keeps a renderer replaceable, and
replacing one is what just happened. The reasoning below is kept as written and read
in the past tense.

## Why

This boundary keeps headless experiments fast, makes rendering optional and
replaceable, and prevents engine versions, clocks, threads, I/O, floating-point scene
math, or asset types from contaminating replay determinism. The glue is deliberate:
the hand-written browser ABI is a visible contract instead of an engine object graph
quietly becoming game state.

Canvas had known performance ceilings, but it was also the known behavioural control,
and replacing it outright would have removed the comparison instrument at the moment a
new renderer needed one. The GPU client was therefore a reversible presentation bet
rather than a rewrite of simulation ownership. **That bet has now been settled**: the
seam shipped, the GPU client became the only entry, and the control was retired once
it had nothing left to control for. The order matters and is the point — the control
outlived the risk it was held against, rather than being dropped while the risk was
live.

## Consequences

- Presentation dependencies may be audited and pinned outside the deterministic core.
- Renderer-specific interpolation, particles, cameras, assets, and wall clocks remain
  presentation state.
- Authoritative fog and stable entity handles cross the boundary explicitly.
- Canvas stayed runnable for debugging and A/B comparisons until it was retired; a
  future renderer bet owes itself a control of its own rather than inheriting this one.
- Any renderer protocol change must preserve or version its handshake rather than
  reaching into `World` directly.

This decision supersedes the renderer portion of `DESIGN.md#deliberate-non-choices`
and the renderer conclusion of `DESIGN.md#performance-notes`.

The current representative authored room exercises this decision without changing
it: its [asset bounds remain presentation-only](../reference/room-asset-contract.md#presentation-only-bounds)
and representative-room loader failures are terminal under the
[room loader lifecycle](../reference/room-asset-contract.md#loader-lifecycle-and-failure),
while the ordinary procedural route remains the explicit removal path. The room's
visible art and foreground performance decision remains a separate pending gate.
