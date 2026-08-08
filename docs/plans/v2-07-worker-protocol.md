# v2-07 — establish bounded worker ownership

**Status:** complete (2026-08-08). Rust, native/wasm equality, generated ABI,
dependency/toolchain/docs checks, the named protocol suite, production build, and
the repeated wasm-memory probe are green. The visible-browser diagnostic below also
passed its five-minute ownership, buffer-exhaustion, control, and reset checks.

**Goal:** move the current legacy simulation behind a typed, testable worker protocol
without introducing a renderer or changing wasm state.

**Depends on:** Track 1 (`v2-01` through `v2-06`).

**Golden expectation:** every legacy hash remains byte-identical. This session changes
where the existing exports are called and how their published bytes are copied; it
does not change `Scenario`, `World`, policy decisions, command meanings, or a hash
domain. `LAB_HASH`, `GOLDEN_STATE_HASH`, `ROOM_HASH`, `BATTLE_HASH`, `SWAP_HASH`, and
`BOW_HASH` must not move.

## Files and ownership

Extend the root package created in v2-02; do not replace its dependency pins. Add:

```text
tsconfig.json
vite.config.ts
web/v2.html
client/src/v2.ts
client/src/protocol/abi.generated.ts
client/src/protocol/messages.ts
client/src/runtime/buffer-pool.ts
client/src/runtime/sim-worker-host.ts
client/src/runtime/sim.worker.ts
client/src/runtime/sim-client.ts
client/src/state/snapshot.ts
client/test/worker-protocol.test.mjs
client/test/wasm-memory.test.mjs
crates/web/src/bin/emit_abi.rs
tools/check_abi.js
```

Modify `package.json` to add the ABI/test/build scripts, and modify
`crates/web/src/lib.rs` only for the two presentation-only Focus identity exports
specified below. No simulation crate or deterministic policy source changes.

`sim-worker-host.ts` owns the protocol state machine independently of the browser
`WorkerGlobalScope`; tests drive that object with an injected fake wasm adapter.
`sim.worker.ts` is only the real module-worker/bootstrap adapter. `sim-client.ts`
owns request IDs, command sequence numbers, transferred-buffer returns, and the
main-thread view of pause state. `snapshot.ts` is the sole parser for the atomic
payload described below.

The Node protocol test is self-compiling and does not rely on Node understanding
TypeScript. `worker-protocol.test.mjs` uses `spawnSync(process.execPath, ...)` to run
the repository-pinned `node_modules/typescript/bin/tsc` with `--ignoreConfig`,
`--target ES2022`, `--module commonjs`, `--moduleResolution node`, `--strict`, and an
explicit source list containing the generated ABI, messages, buffer pool, snapshot,
pure host, and `sim-client.ts`. It emits only beneath ignored
`.tools/client-test/`, then loads those CommonJS files with `createRequire` in the
same `node --test` process. The browser entry owns the `import.meta.url` worker URL
so `sim-client.ts` remains independently compilable and injectable with a fake
Worker. The suite does not import the hashed browser build.

The v2 main thread never fetches, instantiates, receives, or retains the wasm module,
its exports, or its `WebAssembly.Memory`; only `sim.worker.ts` may do so. It sends the
worker URL created by `new Worker(new URL("./runtime/sim.worker.ts", import.meta.url),
{ type: "module" })` and receives copied snapshot storage.

`emit_abi.rs` emits the Rust layout/version/capacity literals plus the derived
snapshot offsets and capacity. `npm run generate:abi` writes
`client/src/protocol/abi.generated.ts`; `npm run check:abi` generates to a temporary
file through `tools/check_abi.js` and fails on a byte diff without rewriting the
committed file. The legacy constants in `web/main.js` and
`tools/wasm_check.js` remain required mirrors for the legacy page.

Configure Vite with `root: "web"`, `base: "/"`, `publicDir: false`,
`build.outDir: "../dist"`, and `web/v2.html` as the sole Rollup HTML input. The HTML imports
`/client-src/v2.ts`, an explicit filesystem alias for `client/src`, so the browser
cannot normalize the entry outside Vite's `root: web` URL space. Vite follows that
module and its module-worker URL during dev and build. A small dev middleware serves
the already-built `target/wasm32-unknown-unknown/release/web.wasm` as `/web.wasm`; a
`closeBundle` hook using `node:fs.copyFileSync` copies that same artifact to
`dist/web.wasm`. There is no `web/web.wasm` artifact and no copying plugin or new
dependency. V2 is deliberately root-hosted: dev and build expose `/v2.html`,
`/assets/...`, and `/web.wasm`; subpath deployment is outside this diagnostic's
contract. Both `npm run dev` and `npm run build` must first run the release wasm build
(`cargo build --release --target wasm32-unknown-unknown -p web`), then Vite. Add a
build assertion that
`dist/v2.html`, its hashed client/worker chunks, and `dist/web.wasm` exist, and that
the main client chunk contains no `WebAssembly.instantiate` call. The real dev-server
test fetches the HTML, follows its transformed entry and worker URLs, then requires
`/web.wasm` to return status 200, `application/wasm`, and the wasm magic bytes.

## Version and integer domains

Set `WORKER_PROTOCOL_VERSION = 1`. `epoch`, `sequence`, `targetTick`, `tick`,
`requestId`, `bufferId`, `leaseToken`, `seed`, `kindCode`, `primary`, and `secondary`
are validated as `u32` before any wasm call. Zero is reserved for “not assigned” for
epoch, sequence, and lease token. `xMilli` and `yMilli` are signed `i32`.
`elapsedMicros` is a non-negative safe integer; clamp it to
`MAX_ELAPSED_MICROS` before multiplying by 60, so even a maximum-safe input cannot
overflow JavaScript's exact-integer domain. Booleans must be literal booleans rather
than truthy values. Values such as `2^32`, `-1`, `1.5`, `NaN`, and numeric strings
fail validation rather than being coerced by a wasm function signature.

The client never wraps or reuses its ordinary monotonically increasing request IDs.
If allocation would pass `u32::MAX`, it enters terminal state. Before rejecting
pending work it returns every locally retained snapshot with the reserved emergency
`requestId: 0` through a code path that does not call the ordinary allocator. The
terminal client ignores the resulting acknowledgement; zero is never assigned to a
normal pending operation. This prevents exhaustion handling from recursively trying
to allocate the ID whose exhaustion it is handling.

An init creates epoch 1. A reset increments the epoch without wrapping, clears the
command queue, resets accepted/applied sequence state to zero, clears the time
accumulator, leaves the requested pause value in force, and calls the existing
`init(seed)` export. Epoch exhaustion is fatal and never wraps to 0. Simulation tick
may restart only at init/reset in this protocol; descent is not a v1 command.

## Exact client-to-worker messages

Declare these tagged unions in `client/src/protocol/messages.ts`:

```ts
type InitMessage = {
  kind: "init"; version: 1; requestId: number; seed: number;
};

type ResetMessage = {
  kind: "reset"; version: 1; requestId: number; epoch: number;
  seed: number; paused: boolean;
};

type SetPausedMessage = {
  kind: "setPaused"; version: 1; requestId: number; epoch: number;
  paused: boolean;
};

type AdvanceMessage = {
  kind: "advance"; version: 1; requestId: number; epoch: number;
  elapsedMicros: number;
};

type LegacyClientCommand =
  | { kind: "goto"; xMilli: number; yMilli: number }
  | { kind: "withdraw" }
  | { kind: "spawn"; kindCode: number; primary: number; secondary: number };

type CommandMessage = {
  kind: "command"; version: 1; requestId: number; epoch: number;
  sequence: number; targetTick: number; command: LegacyClientCommand;
};

type ReturnSnapshotMessage = {
  kind: "returnSnapshot"; version: 1; requestId: number;
  epoch: number; bufferId: 0 | 1 | 2; leaseToken: number;
  buffer: ArrayBuffer;
};
```

`withdraw` calls the existing `clear_order()`. `spawn` calls the existing
`spawn_monster(kindCode, primary, secondary)` and reports that export's integer
result in the applied acknowledgement. Unknown fields are ignored, but missing,
wrongly typed, non-integral, out-of-range, or unknown discriminants fail closed.

## Exact worker-to-client messages

```ts
type ReadyMessage = {
  kind: "ready"; version: 1; requestId: number; cause: "init" | "reset";
  epoch: number; tick: number; paused: boolean;
};

type PauseChangedMessage = {
  kind: "pauseChanged"; version: 1; requestId: number;
  epoch: number; tick: number; paused: boolean;
};

type AdvanceAckMessage = {
  kind: "advanceAck"; version: 1; requestId: number; epoch: number;
  tick: number; steppedTicks: number; droppedBacklog: boolean;
};

type RejectReason =
  | "oldEpoch" | "futureEpoch" | "duplicateSequence" | "sequenceGap"
  | "lateTargetTick" | "regressedTargetTick" | "targetTooFar"
  | "queueFull" | "invalidCommand";

type CommandAckMessage = {
  kind: "commandAck"; version: 1; requestId: number; epoch: number;
  sequence: number; targetTick: number;
  status: "accepted" | "rejected" | "applied";
  tick: number; reason?: RejectReason; result?: number;
};

type SnapshotMessage = {
  kind: "snapshot"; version: 1; epoch: number; tick: number;
  lastAppliedSequence: number; coalescedSnapshots: number;
  coalescedSnapshotsSaturated: boolean;
  bufferId: 0 | 1 | 2; leaseToken: number;
  frameLayoutVersion: number; headerLength: number; unitStride: number;
  shotStride: number; eventStride: number; furnitureStride: number;
  frameLength: number; mapLength: number; visLength: number;
  furnitureLength: number; mapCols: number; mapRows: number;
  mapTileSizeMilli: number; mapRevision: number; visRevision: number;
  furnitureRevision: number;
  poolAllocationsTotal: 3; buffersFree: number; buffersOutstanding: number;
  queuedCommands: number; buffer: ArrayBuffer;
};

type BufferReturnedMessage = {
  kind: "bufferReturned"; version: 1; requestId: number;
  epoch: number; bufferId: 0 | 1 | 2; leaseToken: number;
  disposition: "reclaimed";
};

type ProtocolErrorCode =
  | "unknownVersion" | "notInitialized" | "alreadyInitialized"
  | "invalidMessage" | "invalidBufferId" | "invalidLeaseToken"
  | "invalidBufferCapacity" | "epochExhausted" | "leaseTokenExhausted"
  | "revisionExhausted" | "wasmAbiMismatch" | "wasmTrap";

type ErrorMessage = {
  kind: "error"; version: 1; requestId: number | null;
  epoch: number; code: ProtocolErrorCode; fatal: boolean; detail: string;
};

type TerminatedMessage = {
  kind: "terminated"; version: 1; epoch: number;
};
```

TypeScript types are not runtime trust. `sim-client.ts` decodes every received value
from `unknown`: tag/version, every integer domain, booleans, enums, buffer identity,
and status-dependent optional fields must validate before client state changes. A
malformed response is fatal. A structurally valid response must then match the exact
pending request ID and expected response kind, epoch, reset/init cause, requested
pause state, command sequence and target tick, and command status transition.
`applied` cannot precede `accepted` and its tick equals its target; rejection alone
carries a reason and only applied acknowledgements may carry a result. Buffer-return
acknowledgements match the exact ID/buffer/token lease. Unknown, duplicate,
cross-wired, or mismatched responses are fatal and reject every pending promise.
Ready after init or reset has tick 0, `pauseChanged` preserves the tick recorded when
that request was posted, and `advanceAck.tick` equals that recorded tick plus its
validated `steppedTicks` in `0..=8` without u32 overflow. These are correlations, not
merely type checks; a well-shaped acknowledgement with a mutated tick is fatal.
For every client-detected terminal condition, transfer any retained snapshot back
first and then call `Worker.terminate()` through an idempotent exactly-once path.
`dispose()` after terminal state must not call it a second time. This ensures a
malformed acknowledgement or exhausted client sequence cannot leave a live worker
whose rAF driver has stopped.

Version mismatch, malformed messages, invalid returned buffers, and wrong lifecycle
state produce `error`, not a thrown worker exception. Command scheduling failures
produce a rejected `commandAck`. `unknownVersion`, epoch/token exhaustion,
filtered-revision exhaustion, `wasmAbiMismatch`, and `wasmTrap` are fatal: after one
error the host accepts only valid buffer returns so transferred storage can still be
reclaimed. Once every
outstanding buffer has returned, the real worker posts a final
`{ kind: "terminated", version: 1, epoch }` diagnostic and calls `close()`; it never
silently restarts a wasm instance after a fatal error.

## Lifecycle transition table

| State and input | Required result |
|---|---|
| uninitialized + `init` | Instantiate/validate wasm, allocate exactly three buffers, call `init(seed)`, enter epoch 1 paused false, send `ready`, then publish the epoch's initial snapshot. |
| uninitialized + anything else | `notInitialized`; a returned buffer is `invalidLeaseToken`. |
| initialized + second `init` | `alreadyInitialized`; state is unchanged. |
| initialized + matching `reset` | Reject every queued command with its old epoch/tick, increment epoch, call `init(seed)`, relabel free slots, send `ready`, then publish if one is free. |
| initialized + old/future-epoch reset, pause, advance, or command | Reject without mutation (`oldEpoch`/`futureEpoch` for commands, `invalidMessage` error for lifecycle controls). |
| initialized + `setPaused` | Set the flag, zero the accumulator on both pause and resume, send `pauseChanged`, and do not step. |
| initialized + `advance` | Run the scheduling/catch-up phase below, publish its complete result, then send `advanceAck`. |
| any epoch + valid outstanding `returnSnapshot` | Reclaim that exact slot even if the message epoch is older than the current epoch; send `bufferReturned` with the current epoch, then immediately publish the latest state if publication was coalesced. |

Reset is an out-of-band epoch barrier, not sequence 0. A reset never waits for an
old snapshot to return and never allocates a replacement for it.

`sim-client.ts` advances its current epoch only from the matching `ready` response.
A posted reset opens a client-side display barrier immediately: release the retained
snapshot, reject commands not yet posted, and return every subsequently delivered
snapshot without parsing or displaying it -- including a coalesced snapshot from the
still-current old epoch -- until the `ready(cause: "reset")` carrying that reset's
request ID arrives. Only that exact Ready advances the epoch and lifts the barrier.
A snapshot delivered later with any other epoch is never parsed, retained, or shown;
the client immediately transfers its buffer back with the original lease tuple.
This covers an old snapshot already queued on the main-thread event loop when reset
completed. A future-epoch snapshot is returned and then treated as fatal protocol
corruption. On a worker `error` or `messageerror` event, a fatal `ErrorMessage`, or a
`TerminatedMessage`, the client stops scheduling advances, rejects every pending
request exactly once with the same terminal cause, returns any locally held snapshot
buffers when the worker can still receive them, and enters a terminal state whose
public methods fail synchronously. No request promise may remain pending.

## Sequence, target tick, and application phase

Sequence starts at 1 in each epoch. Acceptance requires exactly
`lastAcceptedSequence + 1`; lower values are duplicate and higher values are gaps.
It also requires `targetTick >= wasm.tick()` and
`targetTick >= lastAcceptedTargetTick`. Thus the FIFO queue is already ordered by
`(targetTick, sequence)` and never needs a sort whose tie behavior could drift.
Every valid enqueue immediately produces `accepted`; every rejection consumes
neither sequence nor target-tick state, so the client may correct the message and
retry that exact sequence number. An accepted command produces exactly two
acknowledgements in order -- `accepted`, then eventually `applied`. A rejected
command produces exactly one. Because target ticks never regress, applied commands
are always a contiguous sequence prefix and `lastAppliedSequence` can never skip an
accepted command.

Client sequence allocation also never wraps. Sequence `0xffff_ffff` may be posted
and accepted, but that acceptance immediately exhausts the epoch's client sequence
domain: the client enters terminal state, rejects the accepted command and all other
pending work, returns retained storage, and never emits `0x1_0000_0000`. Detecting an
already-exhausted next sequence before posting has the same terminal result. Reset
normally restarts sequence at 1, but cannot revive a client that has already entered
terminal state.

Set `MAX_QUEUED_COMMANDS = 256` and `MAX_FUTURE_TICKS = 600`. Reject with `queueFull`
before enqueueing a 257th command, and with `targetTooFar` when
`targetTick > wasm.tick() + MAX_FUTURE_TICKS` (checked without `u32` wrap). Neither
rejection consumes its sequence. These are protocol capacity limits, not simulation
rules.

`targetTick` names the tick whose inputs the command affects. During `advance`, when
`wasm.tick() === targetTick`, apply every command for that tick in sequence order
**before** calling `step` for that tick. Send each `applied` acknowledgement only
after its legacy export returns; `tick` in that acknowledgement equals targetTick.
Then step as one batch up to the next queued target or the end of the bounded advance.
Publish after each command boundary/step batch. This preserves the existing event
feed better than mechanically calling `step(1)` for every tick, while still making
the before-step command phase exact. There is no command application in the
`command` message handler and no after-step application.

Commands for the current tick also wait for `advance`. While paused, an `advance`
discards elapsed time but still drains current-tick commands, republishes their
same-tick frame changes, and steps zero ticks. Future-tick commands remain queued.
This preserves the legacy ability to move an order marker while paused without
turning receipt time into simulation time.

The main-thread client never posts a command behind an outstanding `advance`
request. It holds the command intent until that advance's acknowledgement updates
the client tick, then assigns an omitted/default `targetTick` from the acknowledged
tick and posts the command. An explicit caller-supplied target remains unchanged and
may be rejected as late. This prevents the ordinary rAF order `advance(); command()`
from deterministically targeting the tick that the earlier message just consumed.
`setPaused` uses the same posting barrier: if an advance is outstanding, post the
pause request only after its acknowledgement, so the pending request records the
new acknowledged tick that `pauseChanged` must preserve.

Pause and resume do not accept, reject, reorder, or apply queued commands; they only
change whether a later advance can reach their target ticks. Reset is different: it
emits one rejected `commandAck(reason: "oldEpoch")` for every still-accepted command,
in sequence order, before `ready` for the new epoch. Commands already applied get no
third acknowledgement.

## Clock and bounded catch-up

Use the legacy constants as protocol constants:

```ts
const TICKS_PER_SECOND = 60;
const MAX_ELAPSED_MICROS = 250_000;
const MAX_CATCHUP_TICKS = 8;
```

Keep an integer accumulator in “microseconds times 60”: add
`min(elapsedMicros, MAX_ELAPSED_MICROS) * TICKS_PER_SECOND`; one tick costs
`1_000_000` accumulator units. This represents 60 Hz without a rounded integer tick
duration. If more than eight ticks are due, run exactly eight, set
`droppedBacklog: true`, and zero the remainder rather than paying it off later.
Otherwise subtract the ticks run. Paused advances always run zero ticks, discard the
elapsed value, zero the accumulator, and set `droppedBacklog: false`. Resume starts
with an empty accumulator. The client sends at most one advance per animation frame
and permits only one outstanding advance request, so message backlog cannot become a
second clock.

## One atomic snapshot, four legacy publications

Allocate exactly three `ArrayBuffer` objects once during init. Their IDs are fixed
as 0, 1, and 2. Every buffer has the generated capacity:

```ts
FRAME_OFFSET = 0
MAP_OFFSET = align4(FRAME_MAX * 4)
VIS_OFFSET = MAP_OFFSET + MAP_MAX
FURNITURE_OFFSET = VIS_OFFSET + MAP_MAX
SNAPSHOT_BUFFER_BYTES = align4(
  FURNITURE_OFFSET + FURNITURE_MAX * FURNITURE_STRIDE
)
```

The fixed regions hold, respectively, filtered packed-frame `f32` values, the map
bytes, visibility bytes, and filtered furniture bytes. Live lengths and all map/vis/
furniture shape/revision metadata travel in the single `SnapshotMessage`; consumers
must not infer a live length from capacity. `frameLength` counts `f32` elements,
`mapLength` and `visLength` count bytes, and `furnitureLength` counts records,
matching the legacy `furniture_len()` export; its live byte extent is
`furnitureLength * furnitureStride`.

Before filling a reclaimed slot, zero its entire `SNAPSHOT_BUFFER_BYTES`, including
unused frame rows, unused map/VIS capacity, furniture tail, and alignment padding.
No stale row from a prior epoch or a filtered hidden entity may remain observable
past a reported live length.

After a legacy export or step has returned, read every scalar/pointer/length/revision
accessor first. Validate bounds and the ABI handshake. Then create all four wasm
typed views and make no further wasm call until all four regions have been copied and
filtered into one pool buffer. Only after the complete payload and metadata exist may
the worker transfer that buffer in one `postMessage`. JavaScript worker run-to-
completion plus this no-reentry interval is the atomicity boundary: frame, map, VIS,
and furniture always describe one publication point, never adjacent ticks or floors.
The snapshot repeats the validated frame-layout version, section strides, furniture
stride, dimensions, live lengths, and revisions so `snapshot.ts` can reject a
message whose metadata disagrees with generated ABI constants before exposing a
single view. Before constructing any typed view, require all metadata to be finite
integers in its declared domain, `mapLength === visLength === mapCols * mapRows`,
the multiplication to be exact and within `MAP_MAX`, `frameLength <= FRAME_MAX`,
`furnitureLength <= FURNITURE_MAX`, and every offset plus live byte extent to fit
both its fixed region and the transferred buffer. A mismatch is a rejected snapshot,
not a truncated view. The client returns that leased buffer before surfacing the
protocol error, so parser rejection cannot exhaust the pool.

Each checkout assigns the slot the next nonzero monotonically increasing lease token.
The slot records `{bufferId, leaseToken, issuedEpoch, byteLength}` before transfer.
A return is accepted only when all four values match the outstanding lease and the
returned `ArrayBuffer.byteLength` equals `SNAPSHOT_BUFFER_BYTES`. An exact old-epoch
return after reset is reclaimed into the same fixed slot, cleared, relabelled with
the current epoch, and becomes available; it is not discarded merely for being old.
A duplicate/wrong-token/wrong-size return is an error and its storage is never
substituted for a pool slot. Lease tokens never wrap.

If no slot is free, authoritative command application and ticks continue. Each
publication boundary that could not transfer a complete snapshot increments
`coalescedSnapshots`; no fourth buffer is allocated and the worker never blocks.
The next successful snapshot reports and then clears that count. Init/reset,
same-tick paused command mutation, and every before-command/after-step batch are
publication boundaries.

`coalescedSnapshots` saturates at `0xffff_ffff`; it never wraps. Once an increment
would exceed that value, leave the count at the maximum and set
`coalescedSnapshotsSaturated: true`. The next successful snapshot reports both
fields and clears the count to zero and the flag to false. The fake host exposes a
test-only counter seed so the boundary is exercised without billions of messages;
production protocol state has no setter.

Every snapshot carries observable pool/queue diagnostics. Assert
`poolAllocationsTotal === 3`, `buffersFree + buffersOutstanding === 3`, each buffer
count is in `0..=3`, and `queuedCommands <= MAX_QUEUED_COMMANDS`. The checkout being
transferred is already counted as outstanding. `sim-client` separately exposes
read-only `retainedSnapshots`, `pendingAdvances`, and `terminal` diagnostics;
`retainedSnapshots` is 0 or 1 in the default production path and `pendingAdvances`
is 0 or 1. The explicit `/v2.html` buffer-exhaustion diagnostic calls
`beginDiagnosticBufferExhaustion()` to retain exactly the next three distinct leases
until `releaseDiagnosticBufferExhaustion()` returns them; it is off by default,
returns every exact tuple on reset and return-capable terminal cleanup, and resumes
the newest coalesced publication after release. These counters, not a browser heap
estimate, define stable ownership for tests and the five-minute check.

## Visibility is an information boundary

The worker derives the client frame from the four atomic legacy publications; it
does not change wasm or `World::state_hash`.

- Copy the full VIS grid. The host keeps a `rememberedMap[MAP_MAX]` cache per epoch,
  initially filled with `MAP_UNKNOWN = 255`. At each atomic publication update a
  tile from the true map only where VIS is `2`; retain the cached byte where VIS is
  `1`, and publish `MAP_UNKNOWN` where VIS is `0`. Thus an off-screen door change
  cannot rewrite a remembered tile. Reset clears the cache before the initial
  publication. The parser preserves the sentinel and render/interaction code treats
  it as unknown and non-standable.
- Repack unit rows and set the header count to rows whose legacy `visible` column is
  nonzero. The hero is already unconditionally visible. Never transfer an invisible
  row merely so the renderer can hide it later.
- Repack shot rows only when the tile containing `(x, y)` is in bounds and its VIS
  byte is `2` (currently visible).
- Repack event rows only when the tile containing the event position is currently
  visible. Preserve `actor_index`/`other_index` only when that index belongs to a
  unit row included in this snapshot; otherwise write `-1` so an event does not leak
  a hidden identity.
- Repack furniture records only when their tile is currently visible. The client may
  retain the last observed record for a VIS=`1` remembered tile, but a snapshot must
  not reveal an off-screen door-state change or a never-seen torch.

The raw wasm map, VIS, and furniture revision counters do not cross the boundary.
The host maintains filtered `mapRevision`, `visRevision`, and `furnitureRevision`.
Reset initializes each to 0 and clears its comparison cache; the initial publication
increments a revision to 1 only if that disclosed payload is nonempty or differs
from its cleared representation. Later it increments only when its corresponding
published filtered bytes actually change; exhaustion is fatal rather than wrap. A
hidden true-map or furniture change therefore changes neither payload nor revision.
These are cache invalidators for disclosed payload, not evidence that undisclosed
state moved.

Header slots 3 and 4 need a separate spatial rule. For `order_kind === Focus`, the
legacy writer places the quarry's current position there even when its unit row is
invisible. Preserve those coordinates only when the focused entity's index and
generation identify a surviving visible unit row; otherwise write `0` to both slots.
Add presentation-only `focus_entity_index()` and `focus_entity_generation()` wasm
exports, each returning `u32::MAX` when the current order is not a resolvable Focus.
Emit their sentinel and required export names in the generated worker ABI; they do
not change `FRAME_LAYOUT_VERSION`. The worker reads both during the atomic scalar
phase and must not guess by coordinate equality or unit index alone. This metadata
does not cross to the client and enters no hash domain. Goto coordinates remain
visible because they came from the player's own command.

The remaining aggregate header fields, including `monsters_left`, remain
intentionally public HUD state; visibility filtering applies to spatial rows and
records, not to those already-published aggregates. Focus coordinates are the
explicit exception above and are not aggregates.

Recompute unit/shot/event counts and frame live length after filtering. Preserve row
order within each surviving section, section capacities, and entity identity as the
`entity_index` plus `entity_generation` pair. Add no visibility result to authoritative
state or any hash domain.

## Wasm memory-growth probe

Do not add a production ABI export merely for this test. In
`client/test/wasm-memory.test.mjs`, instantiate the release wasm exactly as the worker
does from `target/wasm32-unknown-unknown/release/web.wasm` and measure pages as
`memory.buffer.byteLength / 65_536`. Define one deterministic `exercise(seed)` fixture:

1. call `init(seed)` and validate all four publications;
2. `route_clear()`, push exactly the 24 points `(1000 * i, 1000)` for `i = 0..23`,
   assert lengths 1 through 24, then assert a 25th push leaves the length at 24;
3. call `spawn_monster(0, 0, 255)` until its first zero result, with a hard ceiling
   of `MAX_UNITS + 1` calls, and assert the published unit count reached `MAX_UNITS`;
4. issue `set_goto(1000, 1000)`, call `step(4096)`, and validate every publication
   length even when the event feed has wrapped or reported drops; and
5. call `descend()` eight times, validating map shape, revisions, and all four live
   bounds after each call.

Run `exercise(1)` once to force lazy initialization and every capacity-bearing path,
then retain typed views over frame, map, VIS, and furniture and record the post-warm
buffer identity/pages/pointers. Run `exercise` again for seeds `0`, `1`, and
`0xffff_ffff`, four complete cycles each. After every individual wasm call assert:

1. page count and `memory.buffer` identity equal the post-warm-up baseline;
2. none of the four retained views is detached;
3. publication pointers remain fixed and every live length stays within its emitted
   capacity;
4. unit, shot, and event header counts are integers within their emitted capacities,
   and `frameLength` is exactly `HEADER_LEN + unitCount * UNIT_STRIDE + shotCount *
   SHOT_STRIDE + eventCount * EVENT_STRIDE`; and
5. map, VIS, and furniture revisions are defined `u32` values, never move backwards
   between an `init` and the next `init`, and every `init` restores the deterministic
   fresh-publication revision baseline.

This is a real wasm test and must run after the release wasm build. Native Rust tests
continue to cover capacity arithmetic and publication bounds; they cannot observe
wasm linear-memory growth. The fixture's exact call counts and assertions are part of
the test; replacing them with a time-based or best-effort random stress loop is not
accepted.

## Exact tests

In `client/test/worker-protocol.test.mjs`:

```text
generated_abi_matches_rust_layout
unknown_protocol_versions_fail_closed
wasm_bound_numeric_domains_reject_values_javascript_would_coerce
init_and_reset_emit_the_exact_lifecycle_messages
initialization_is_single_flight_and_cannot_publish_after_fatal_termination
fatal_state_ignores_everything_except_a_valid_outstanding_buffer_return
commands_apply_before_stepping_their_target_tick_in_sequence_order
sequence_gaps_regressions_and_late_targets_are_rejected
queue_and_future_horizon_limits_reject_without_consuming_sequence
paused_advances_apply_current_tick_commands_without_stepping_or_accruing_time
reset_rejects_queued_commands_and_advances_the_epoch
an_old_epoch_buffer_return_reclaims_its_original_fixed_slot
wrong_buffer_ids_tokens_and_capacities_fail_closed
buffer_exhaustion_coalesces_without_allocating_or_blocking_ticks
the_coalesced_counter_saturates_reports_and_clears_without_wrapping
a_complete_snapshot_contains_one_atomic_frame_map_vis_and_furniture_publication
snapshot_lengths_shapes_and_byte_extents_are_validated_before_views_exist
unused_snapshot_tails_are_zeroed_before_transfer
hidden_units_shots_events_and_furniture_do_not_cross_the_worker_boundary
focus_headers_and_remembered_tiles_do_not_leak_hidden_motion_or_door_changes
filtered_revisions_move_only_when_disclosed_payload_moves
initial_undisclosed_map_and_vis_match_the_cleared_revision_baseline
entity_identity_is_index_plus_generation
catch_up_is_capped_at_eight_ticks_and_drops_the_remainder
stale_snapshots_are_returned_after_reset_without_being_parsed_or_displayed
worker_termination_rejects_every_pending_request_and_stops_advances
ownership_diagnostics_preserve_three_buffers_and_one_retained_snapshot
sim_client_returns_an_old_snapshot_after_reset_without_parsing_or_displaying_it
sim_client_reset_barrier_returns_pre_ready_snapshots_without_displaying_them
sim_client_posts_a_default_tick_command_only_after_the_outstanding_advance_ack
sim_client_posts_pause_only_after_the_outstanding_advance_ack
sim_client_rejects_malformed_and_cross_wired_worker_responses_fatally
sim_client_requires_exact_command_epoch_target_and_status_transitions
sim_client_rejects_tick_inconsistent_matching_acknowledgements
command_sequence_exhaustion_never_emits_a_value_above_u32
request_id_exhaustion_returns_the_retained_lease_without_recursion
sim_client_fatal_error_and_termination_reject_all_promises_and_prevent_advances
sim_client_retains_only_the_latest_snapshot_and_returns_the_previous_lease
sim_client_ownership_diagnostics_never_exceed_one_pending_advance
diagnostic_buffer_exhaustion_holds_three_leases_while_ticks_advance_then_releases_exactly
only_the_worker_instantiates_wasm_and_the_vite_build_keeps_v2_paths
vite_dev_serves_the_v2_entry_from_the_web_root
```

In `client/test/wasm-memory.test.mjs`:

```text
published_legacy_views_survive_every_warm_path_without_memory_growth
```

In `crates/web/src/bin/emit_abi.rs` unit tests:

```text
snapshot_offsets_are_aligned_non_overlapping_and_cover_every_fixed_buffer
```

## Commands and acceptance

```powershell
npm ci
npm run generate:abi
npm run check:abi
npm run check
npm run build
npm run test:worker
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
npm run test:wasm-memory
node --test tools/wasm_check.js
git diff --check
```

`/v2.html` passes when it shows tick/epoch/sequence, entity, buffer checkout, and
coalescing diagnostics; init, pause/resume, reset, goto, withdraw, and spawn all cross
the worker. During a five-minute visible-tab run, record the start/end diagnostics
and require `poolAllocationsTotal === 3`, `buffersFree + buffersOutstanding === 3`,
`retainedSnapshots <= 1`, `pendingAdvances <= 1`, `queuedCommands <= 256`, and
`terminal === false` at both ends; heap-object counts are not an acceptance measure.
Pause/resume must not jump, reset must not display an old-epoch snapshot, and
exhausting all three buffers in the diagnostic hook must not stop the tick reported
by `advanceAck`. The legacy page still instantiates the same wasm artifact directly
and every native/wasm golden stays unchanged.

## Manual evidence

Screenshots from the 2026-08-08 visible-tab diagnostic run record:

- start: epoch 1, tick 2,148, three pool allocations, one free buffer, two
  outstanding buffers, one retained snapshot, `pendingAdvances: 1`,
  `queuedCommands: 0`, `resetting: false`, `diagnosticBufferExhaustion: false`, and
  `terminal: false`;
- all three leases held after approximately five minutes: epoch 1, tick 26,841,
  three retained snapshots, zero free buffers, three outstanding buffers,
  diagnostic hold enabled, and `terminal: false`; and
- final after the exercised controls and resets: epoch 10, tick 8,411, sequence 29,
  one retained snapshot, one free buffer, two outstanding buffers,
  `pendingAdvances: 1`, `queuedCommands: 0`, `resetting: false`,
  `diagnosticBufferExhaustion: false`, `terminal: false`, and 14 visible entities.

The first two captures show tick progress while the fixed three-buffer pool is fully
held; the final capture shows ownership returned to the normal one-retained path.
The user also confirmed that pause/resume continued at the normal tick rate without
a jump and that reset displayed no old-epoch flash. Together the automated gates,
captured counters, and foreground observations complete this session's acceptance.
