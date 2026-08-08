# ADR 0003: Keep renderers outside simulation authority

**Purpose:** Record why rendering is a snapshot consumer and why Canvas remains a reference while production moves toward GPU rendering.
**Status:** current
**Canonical source:** [`crates/sim/Cargo.toml`](../../crates/sim/Cargo.toml), [`crates/web/src/lib.rs`](../../crates/web/src/lib.rs#L2638), and [`web/main.js`](../../web/main.js#L11245)
**Update when:** A renderer gains authority, a new host boundary ships, or the production renderer choice changes.

## Decision

`sim` owns deterministic gameplay and depends only on `fx`. A renderer lives outside
that crate, consumes observations or snapshots, and cannot write presentation types
back into `Scenario`, `World`, submitted commands, replay, or hash domains.

The current Canvas client remains the reference/debug renderer. The proposed v2
production renderer is GPU-based and separate from the authoritative wasm instance.
Both clients must consume the same authoritative visibility and identity information;
neither may infer a second gameplay truth from scene geometry.

## Why

This boundary keeps headless experiments fast, makes rendering optional and
replaceable, and prevents engine versions, clocks, threads, I/O, floating-point scene
math, or asset types from contaminating replay determinism. The glue is deliberate:
the hand-written browser ABI is a visible contract instead of an engine object graph
quietly becoming game state.

Canvas has known performance ceilings, but it is also the known behavioral control.
Replacing it outright would remove the comparison instrument at the moment a new
renderer needs one. The GPU client is therefore a production bet, not a rewrite of
simulation ownership.

## Consequences

- Presentation dependencies may be audited and pinned outside the deterministic core.
- Renderer-specific interpolation, particles, cameras, assets, and wall clocks remain
  presentation state.
- Authoritative fog and stable entity handles cross the boundary explicitly.
- Canvas stays runnable for debugging and A/B comparisons when the GPU client ships.
- Any renderer protocol change must preserve or version its handshake rather than
  reaching into `World` directly.

This decision supersedes the renderer portion of `DESIGN.md#deliberate-non-choices`
and the renderer conclusion of `DESIGN.md#performance-notes`.
