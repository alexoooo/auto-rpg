# v2-07 — establish bounded worker ownership

**Goal:** move the current legacy simulation behind a typed, testable worker protocol
without introducing a renderer or changing wasm state.

**Depends on:** Track 1 (`v2-01` through `v2-06`).

**Golden expectation:** every legacy hash remains byte-identical.

## Client and generated ABI

At repository root add exact `package.json`/`package-lock.json` dependencies from
`tools/toolchain.json`, strict `tsconfig.json`, `vite.config.ts`, and:

```text
web/v2.html
client/src/protocol/abi.generated.ts
client/src/protocol/messages.ts
client/src/runtime/sim.worker.ts
client/src/runtime/sim-client.ts
client/src/runtime/buffer-pool.ts
client/src/state/snapshot.ts
client/test/worker-protocol.test.mjs
crates/web/src/bin/emit_abi.rs
```

`emit_abi.rs` generates Rust layout/version/capacity literals. `npm run check:abi`
generates to a temporary file and fails on a diff. The legacy constants in
`web/main.js` and `tools/wasm_check.js` remain required mirrors for the legacy page.

## Protocol state machine

Set `WORKER_PROTOCOL_VERSION = 1`. Messages use integer fields and tagged unions:

```ts
type CommandMessage = {
  version: 1; epoch: number; sequence: number; targetTick: number;
  command: LegacyClientCommand;
};
type AckMessage = {
  version: 1; epoch: number; sequence: number;
  status: "accepted" | "rejected" | "applied";
  tick: number; reason?: RejectReason;
};
type SnapshotMessage = {
  version: 1; epoch: number; tick: number; lastAppliedSequence: number;
  coalescedSnapshots: number; buffer: ArrayBuffer;
};
```

Document the transition table beside these types. Init creates epoch 1. Reset
increments epoch, clears queued commands, and rejects late commands/buffers from an
older epoch. Sequence is strictly increasing per epoch. A command may be accepted
only before its `targetTick`; it is applied exactly at that tick or rejected as late.
No receipt-time application is allowed.

The worker owns the authoritative wasm instance, advances bounded catch-up work, and
copies complete legacy frames into exactly three reusable transferable buffers sized
to `FRAME_MAX * 4`. Returned buffers must match epoch and capacity. If all are checked
out, authoritative ticks continue and intermediate publications coalesce; the next
snapshot reports the count. No partial snapshot or unbounded replacement allocation
is allowed.

The initial protocol supports init, pause, reset, goto, withdraw, and spawn. It does
not add COOP/COEP headers or `SharedArrayBuffer`.

## Memory handshake

At the `thread_local!` buffers in `crates/web/src/lib.rs`, add a test-only memory page
probe and the test `published_legacy_views_survive_every_warm_path_without_memory_growth`.
After warm-up it drives max spawn, route, event, reset, and descent paths while a
typed view is live and asserts constant wasm page count. Worker copies do not weaken
this legacy direct-view guarantee.

## Tests and acceptance

```text
generated_abi_matches_rust_layout
unknown_protocol_versions_fail_closed
commands_apply_at_target_ticks_in_sequence_order
late_and_old_epoch_commands_are_rejected
reset_invalidates_queued_commands_and_returned_buffers
buffer_exhaustion_coalesces_without_allocating_or_blocking_ticks
a_complete_snapshot_is_never_observed_half_written
entity_identity_is_index_plus_generation
```

```powershell
npm ci
npm run generate:abi
npm run check
npm run build
node --test client/test/worker-protocol.test.mjs
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
git diff --check
```

`/v2.html` passes when it shows tick/entity diagnostics and every supported control
through the worker for five minutes with stable buffer/object counts. The legacy page
still instantiates the same wasm artifact directly.
