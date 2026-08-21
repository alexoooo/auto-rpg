# Arena 09 -- the command was accepted

**Status:** implementation complete; verification in progress. Session 10 is next only
after the commands below are green.

The control lab must compare a command with the state it actually produced. Before this
session the browser retained poses but not the authoritative answer to `World::submit`, so
an input reporter could prove only what JavaScript intended to send. This session publishes
the accepted embodied commands beside each arena frame, packages a Human run as a tiny
zero-tick `ReplayEnvelope` plus those rows, and gives `lab` an exact replay check before any
feel claim is admitted.

No existing hash or golden is expected to move. The world, command codec and state digest
grammar do not change; this is a host publication and a new evidence container. A moved
state, corpus, trace or wasm/native pin is therefore a regression, not a value to record.

## Contract

`crates/web/src/lib.rs` owns a fixed publication of at most two stored commands per
authoritative arena step -- one possible submission per fighter. A row is 70 bytes:

```text
u32 tick | u32 entity index | u32 generation | u8 kind=2 | EmbodiedCommandV1 payload[57]
```

Only `SubmitOutcome::Stored` is evidence. The publication exports pointer, length, stride,
capacity, dropped count and layout version. `arena_start` also exports a codec-produced
zero-tick `ReplayEnvelope` containing the exact installed scenario, seed, default standing
orders and objectives. No hand-written replay header is permitted.

Arena stream layout 3 widens the recording index from 11 to 13 words with command start and
count. `arenaOpened` carries command layout/stride/capacity/schema, the baseline bytes and
the controlled faction. Every `arenaChunk` carries command bytes; `arenaFinished` carries
their dropped count and the final typed state digest. Worker protocol stays V2 because the
worker and main thread ship as one bundle; all new fields remain mandatory and fail closed.

The main thread may offer evidence only after a finished Human fight with zero command
drops. `ARPGCTL1` is capped at 16 MiB and contains a 48-byte self-describing header, the
baseline envelope and the accepted rows. Bit 0 of byte 33 says the recording is truncated;
truncation remains analyzable but is never described as a full-fight result.

`lab control-evidence PATH [--thinned N]` decodes the baseline through the canonical replay
codec, checks the row grammar/identity/order/caps, reconstructs the full replay and requires
its typed final state digest to equal the browser's. `--thinned N` additionally retains only
the controlled body's rows on ticks divisible by `N`, preserving the same horizon, and
reports that counterfactual separately from the full exact replay.

## Files

| path | change |
|---|---|
| `crates/sim/src/codec.rs`, `crates/sim/src/lib.rs` | construct/export the canonical replay envelope seam and codec caps |
| `crates/web/src/lib.rs` | fixed accepted-command rows, zero-tick baseline and wasm exports |
| `crates/lab/src/main.rs`, `crates/lab/src/control_evidence.rs` | full/thinned ARPGCTL1 analyzer |
| `client/src/protocol/messages.ts` | mandatory stream handshake/chunk/finish fields |
| `client/src/runtime/arena-recorder.ts`, `sim-worker-host.ts`, `arena-client.ts` | validate, index, copy and transport receipts |
| `client/src/fight/live.ts` | command extents and bounded ARPGCTL1 assembly |
| `client/src/arena/arena.ts`, `web/index.html` | evidence status and download |
| `tools/wasm_check.js` | independent export/layout mirror |
| `client/test/worker-protocol.test.mjs`, `arena-stream.test.mjs`, `wasm-memory.test.mjs` | fake and real-wasm acceptance |
| `docs/reference/arena-control-evidence-v1.md`, `docs/reference/worker-protocol.md`, `docs/architecture/browser-runtime.md`, `docs/performance/arena-human-control.md` | durable contract and evidence rules |

## Tests

- `accepted_arena_rows_and_the_zero_tick_baseline_replay_the_live_tick`
- `arpgctl1_rows_are_codec_exact`
- `a_finished_human_stream_builds_self_describing_control_evidence`
- `a_recorded_index_that_points_past_its_own_buffers_is_refused_rather_than_clamped`
- `a_recorded_fight_transfers_its_buffers_and_its_index`
- `real_wasm_human_forward_back_and_strafe_rebase_yaw_and_do_not_circle`
- `a configured duel runs inside the module and refuses by name` in `tools/wasm_check.js`

Each new acceptance was mutation-checked at its owning boundary: omitting a stored row,
changing the command index count, altering the ARPGCTL1 magic, and changing the wasm stride
must make the named test red before restoration.

## Verification

```text
cargo test -p web accepted_arena_rows_and_the_zero_tick_baseline_replay_the_live_tick
cargo test -p lab control_evidence::tests
npm run check
node --test client/test/worker-protocol.test.mjs
node --test client/test/arena-stream.test.mjs
cargo build --release --target wasm32-unknown-unknown -p web
node --test client/test/wasm-memory.test.mjs
node --test tools/wasm_check.js
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
ARPG_CARTESIAN_RECOIL=1 node --test tools/wasm_check.js
node tools/check_docs.js
```

The final command set is recorded only after both wasm artifacts and the serialized client
suites are green. No foreground browser evidence is fabricated here; session 10 owns that
measurement after the receipt prerequisite is trustworthy.
