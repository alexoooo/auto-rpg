# v2-04 — document the current architecture from code

**Status:** complete. Seven current-state documents now anchor authority and data
flow to code, with exactly four checked diagrams and all proposed v2 components
isolated from the shipped paths. No legacy hash moved.

**Goal:** make the present system understandable without confusing proposed v2
components for existing architecture.

**Depends on:** `v2-03`.

**Golden expectation:** no hash moves; documentation only.

## Documents

Create these files with the standard purpose/status/canonical-source/update header:

```text
docs/architecture/overview.md
docs/architecture/simulation.md
docs/architecture/policy.md
docs/architecture/replay-hashing.md
docs/architecture/browser-runtime.md
docs/architecture/assets.md
docs/architecture/learning.md
```

Anchor claims to current code: `Cargo.toml` workspace members; `World::step` and
`World::state_hash` in `crates/sim/src/world.rs`; `Policy` in
`crates/policy/src/lib.rs`; `Replay` in `crates/sim/src/replay.rs`; and the layout,
`thread_local!`, frame writer, and wasm exports in `crates/web/src/lib.rs`.

Include four small Mermaid diagrams: crate dependency/authority, simulation tick
flow, replay/hash flow, and browser wasm/memory flow. Diagrams describe only current
code. Future Babylon, worker, articulated, and learning components appear in a
separate “proposed by v2” box linked to this plan, never on the current path.

## Contract reconciliation

Where prose disagrees with code, code plus tests wins provisionally and the mismatch
is recorded in `docs/documentation-inventory.md`. Specifically document current
`Observation -> Command`, one `LimbCommand`, loadout omission from scenario
fingerprint, unversioned in-memory replay, legacy state-hash byte ownership, direct
wasm typed-array views, and authoritative fog.

## Verification

Extend `tools/check_docs.js` and tests:

```text
every_architecture_document_has_the_standard_header
current_architecture_does_not_present_v2_types_as_shipped
architecture_source_anchors_resolve
the_dependency_diagram_matches_workspace_edges
```

```powershell
node --test tools/check_docs.test.js
node tools/check_docs.js
cargo test
git diff --check
```

Acceptance audit: a reader can locate determinism, command, tick order, replay,
hashing, wasm memory, visibility, and dependency authorities without reading
`DESIGN.md` front to back.
