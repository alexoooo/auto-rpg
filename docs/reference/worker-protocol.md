# Browser worker protocol

**Purpose:** Define the shipped v2 diagnostic's exact worker messages, lifecycle, scheduling, snapshot ownership, and visibility boundary.
**Status:** current
**Canonical source:** [`messages.ts`](../../client/src/protocol/messages.ts), [`sim-worker-host.ts`](../../client/src/runtime/sim-worker-host.ts), [`sim-client.ts`](../../client/src/runtime/sim-client.ts), and [`snapshot.ts`](../../client/src/state/snapshot.ts)
**Update when:** A worker message, state transition, scheduling rule, buffer invariant, snapshot field, or disclosure rule changes.

This protocol serves [`web/v2.html`](../../web/v2.html), the shipped diagnostic entry.
It transports the existing browser crate and does not change simulation state, command
meaning, replay contents, or a hash domain. The playable legacy Canvas page continues
to instantiate the same wasm artifact directly.

<!-- DOC_CONTRACT: worker-protocol-messages -->
## Messages and command scheduling

`WORKER_PROTOCOL_VERSION` is `1`. Every message is a tagged object with literal
`version: 1`; unknown versions fail fatally. Request IDs, epochs, ticks, command
sequences, targets, seeds, spawn fields, buffer IDs, and lease tokens are checked in
their declared unsigned domains before use. Epoch, sequence, and lease token reserve
zero. Goto coordinates are signed `i32`, and elapsed microseconds are nonnegative
safe integers. Unknown fields are ignored, but missing, fractional, coerced, or
out-of-range fields fail closed.

Client requests are `init`, `reset`, `setPaused`, `advance`, `command`, and
`returnSnapshot`. Commands are `goto`, `withdraw`, or `spawn`. Worker responses are
`ready`, `pauseChanged`, `advanceAck`, `commandAck`, `snapshot`, `bufferReturned`,
`error`, and `terminated`. The complete field declarations live in
[`messages.ts`](../../client/src/protocol/messages.ts#L1); runtime decoders validate
both directions because TypeScript types are not a trust boundary.

Every request-bound acknowledgement and nonfatal error must correlate with the exact
pending request ID and response kind. Snapshots and `terminated` are unsolicited,
and a fatal error may instead carry a null request ID. Lifecycle responses also match
the pending epoch and init or reset cause; pause responses match the requested state;
command responses match sequence, target, and status. `applied` cannot precede
`accepted` and reports the command's target tick; a result, when present, is
applied-only. Only `rejected` carries a reason. Buffer returns match the exact request
ID, buffer ID, and lease token. A `ready` response reports tick 0;
`pauseChanged` preserves the tick recorded when the request was posted; and an
`advanceAck` reports that request's previous tick plus `steppedTicks`, where
`steppedTicks` is in 0 through 8 and the sum cannot overflow `u32`.

Ordinary request IDs are monotonically increasing nonzero `u32` values and are never
wrapped or reused. If the next ordinary allocation would exceed `u32::MAX`, the
client first returns any retained snapshot with reserved emergency request ID 0,
without calling the ordinary allocator, then enters terminal state and rejects
pending work. Zero is never entered in the normal pending-request table, and the
emergency return acknowledgement is ignored.

Sequence begins at 1 per epoch and acceptance requires exactly the previous accepted
sequence plus one. Targets never regress, cannot be late, and cannot exceed the
current tick by more than 600. At most 256 commands wait in the FIFO queue. A command
for tick `t` is applied before the step from `t`, and its applied acknowledgement is
sent only after the wasm export returns. Commands for the current tick still apply on
a paused advance, which steps zero ticks. A rejected command consumes neither its
sequence nor target state.

Command sequence numbers likewise never wrap. Sequence `u32::MAX` may be posted and
accepted, but that acceptance immediately exhausts the sequence domain: the client
enters terminal state, rejects that command and all pending work, returns retained
storage, and never emits sequence `2^32`. Detecting an already exhausted domain
before posting has the same result. Reset cannot revive a terminal client.

The clock accumulates `elapsedMicros * 60` with a one-million-unit tick. Input is
clamped to 250,000 microseconds before multiplication. One advance runs at most eight
ticks; excess backlog is dropped rather than paid off later. `SimClient` permits one
outstanding advance and delays a default-target command and pause request until that
advance acknowledgement fixes the current tick.

<!-- DOC_CONTRACT: worker-protocol-lifecycle -->
## Lifecycle and terminal state

The host begins uninitialized. The first valid init creates epoch 1, allocates the
fixed pool, initializes wasm, sends `ready`, then publishes a snapshot. Initialization
is single-flight. Reset is an out-of-band barrier: it rejects queued commands with
`oldEpoch`, increments the epoch without wrapping, clears command and clock state,
reinitializes wasm, sends the matching reset `ready`, then publishes if a slot is
free. Old and future lifecycle messages do not mutate state.

Posting reset immediately opens the client's display barrier. It releases the
retained snapshot, rejects commands not yet posted, and returns every arriving
snapshot without parsing until the exact matching reset `ready` advances the client
epoch. Any later snapshot from another epoch is returned; a future epoch is fatal
corruption.

Unknown versions, epoch, lease-token, or filtered-revision exhaustion, ABI mismatch,
and wasm traps are fatal. The host then accepts only exact outstanding buffer returns.
After all leases return it posts `terminated` and closes. A client-detected terminal
condition rejects every pending promise with the same cause, returns retained storage
when possible, and terminates its Worker exactly once. Further protocol mutations
fail once the client is terminal; diagnostics remain readable.

<!-- DOC_CONTRACT: worker-snapshot-ownership -->
## Snapshot layout and buffer ownership

The worker allocates exactly three `ArrayBuffer` objects during init, permanently
numbered 0 through 2. Each has the generated `SNAPSHOT_BUFFER_BYTES` capacity and
four fixed regions: packed frame `f32` elements, map bytes, visibility bytes, and
furniture records. Live lengths travel with every snapshot: frame length counts
floats, map and visibility lengths count bytes, and furniture length counts records.
All shape, stride, capacity, finiteness, and packed-row equations are checked before a
consumer view exists.

Checkout assigns the next nonzero monotonically increasing `u32` lease token and
records buffer ID, token, issued epoch, and byte length. Return succeeds only for the
exact tuple and capacity, including an exact old-epoch return after reset. Before
reuse the entire buffer is zeroed, including unused rows, fixed-region tails, and
padding. A failed publication reclaims an untransferred checkout.

If all three slots are outstanding, simulation and command application continue.
Each missed publication increments a saturating `coalescedSnapshots` counter; an
attempt past `u32::MAX` sets the saturation flag. The next successful snapshot
reports and clears both. Every snapshot also reports exactly three total allocations,
free plus outstanding equal to three, and a queued-command count no greater than
256. By default `SimClient` retains at most one snapshot and transfers the previous
lease back. The explicit `/v2.html` buffer-exhaustion diagnostic instead holds the
next three distinct leases until the operator releases them; this is opt-in test
behavior and does not change the production ownership path.

<!-- DOC_CONTRACT: worker-visibility-filter -->
## Visibility filtering

The worker copies all four legacy publications atomically, then filters only the
client-owned copy. It publishes the full visibility grid. A per-epoch remembered-map
cache updates true map bytes only where visibility is `2`, retains the previous byte
at `1`, and publishes `MAP_UNKNOWN` (`255`) at `0`. Hidden true-map changes therefore
cannot rewrite remembered terrain.

Only unit rows whose legacy `visible` field is nonzero survive. Shots, events, and
furniture survive only on currently visible tiles. Hidden event actor/other indices
become `-1`. A Focus order's header coordinates survive only when the separate focus
index and generation identify a surviving visible row; coordinate equality or index
alone is insufficient. Goto coordinates remain visible because they came from the
player's own command.

Unit, shot, and event counts and the live frame length are recomputed after filtering.
Filtered map, visibility, and furniture revisions start at zero per epoch, increment
only when the disclosed bytes change, and fail fatally rather than wrap. None of this
presentation state enters `World`, replay, or a hash domain.

## Source anchors

- Protocol declarations and input decoder: [`messages.ts`](../../client/src/protocol/messages.ts#L1)
- Fixed buffer pool: [`FixedBufferPool`](../../client/src/runtime/buffer-pool.ts#L20)
- Pure worker state machine: [`SimWorkerHost`](../../client/src/runtime/sim-worker-host.ts#L35)
- Main-thread request and lease owner: [`SimClient`](../../client/src/runtime/sim-client.ts#L122)
- Snapshot validator and disclosure filter: [`SnapshotFilterState`](../../client/src/state/snapshot.ts#L57)
- Real wasm adapter: [`readPublication`](../../client/src/runtime/sim.worker.ts#L64)
- Generated offsets and capacities: [`abi.generated.ts`](../../client/src/protocol/abi.generated.ts#L1)
