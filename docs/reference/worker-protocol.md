# Browser worker protocol

**Purpose:** Define the shipped v2 worker's exact messages, lifecycle, scheduling, snapshot ownership, visibility boundary, and the arena recording channel.
**Status:** current
**Canonical source:** [`messages.ts`](../../client/src/protocol/messages.ts), [`sim-worker-host.ts`](../../client/src/runtime/sim-worker-host.ts), [`sim-client.ts`](../../client/src/runtime/sim-client.ts), [`arena-recorder.ts`](../../client/src/runtime/arena-recorder.ts), and [`snapshot.ts`](../../client/src/state/snapshot.ts)
**Update when:** A worker message, state transition, scheduling rule, buffer invariant, snapshot field, recording buffer, or disclosure rule changes.

This protocol serves two routes of the studio shell
[`web/index.html`](../../web/index.html) through one worker module: `#/game`, the
shipped diagnostic entry, and `#/arena`, which records a configured duel.
It transports the existing browser crate and does not change simulation state, command
meaning, replay contents, or a hash domain. The playable legacy Canvas page continues
to instantiate the same wasm artifact directly.

<!-- DOC_CONTRACT: worker-protocol-messages -->
## Messages and command scheduling

`WORKER_PROTOCOL_VERSION` is `2` and `LEGACY_WORKER_PROTOCOL_VERSION` is `1`. Every
message is a tagged object carrying one of those two numbers; anything else fails
fatally. A session is **one version for its whole life**: the first accepted message
fixes it, every later message must match, and the host answers in it — which is what
makes the unsolicited messages, a snapshot and `terminated`, carry a version without
guessing which request they belong to. V1 is accepted for the lifetime of an exact V1
session, as [`articulated-mechanical-gate.md`](articulated-mechanical-gate.md) commits;
the two V2-only kinds are refused at V1 by name rather than as malformed messages,
because "your session is a V1 session" and "your message is invalid" are different
instructions.

One check runs **ahead** of the decoder — a `returnSnapshot` whose buffer ID is not 0,
1 or 2 is refused `invalidBufferId` by name, because "you sent slot 9" is a sentence a
caller can act on and "your message is invalid" is not. Standing ahead of the decoder
also stood ahead of `sessionVersion`, and for two versions of this document that was a
hole in the rule above: a V1 `returnSnapshot` carrying slot 9 into a V2 session was
answered non-fatally about its buffer ID when what is wrong with it is its version.
The session rule now outranks the field check on that path, and a refusal issued
before any message has been accepted answers in the version the caller wrote down —
a malformed message opens no session, so there is no session version to answer in.

Request IDs, epochs, ticks, command
sequences, targets, seeds, spawn fields, direct-control masks and live-input fields,
buffer IDs, and lease tokens are checked in
their declared unsigned domains before use. Epoch, sequence, and lease token reserve
zero. Goto coordinates are signed `i32`, and elapsed microseconds are nonnegative
safe integers. Unknown fields are ignored, but missing, fractional, coerced, or
out-of-range fields fail closed.

Client requests are `init`, `reset`, `setPaused`, `advance`, `command`,
`returnSnapshot`, and — at V2 only — `arenaStart` and `arenaCancel`. Commands are
`goto`, `withdraw`, `spawn`, `setControl`, or `setInput`. The control
request returns the accepted wasm mask in its applied acknowledgement, so the HUD
does not echo an unaccepted request. Init/reset install Movement ownership plus an
all-zero input before the first snapshot. Worker responses are
`ready`, `pauseChanged`, `advanceAck`, `commandAck`, `snapshot`, `bufferReturned`,
`error`, `terminated`, and — at V2 only — `arenaProgress`, `arenaRejected`, and
`fightRecording`. The complete field declarations live in
[`messages.ts`](../../client/src/protocol/messages.ts#L1); runtime decoders validate
both directions because TypeScript types are not a trust boundary. That is three
decoders and not two: `decodeClientMessage` for what the worker is told,
`decodeWorkerMessage` in `sim-client.ts` for what the game client is told, and
`decodeArenaMessage` in `arena-client.ts` for the three arena kinds. The third was
owed rather than optional — this document claimed it while `ArenaClient` was casting
`raw as FightRecordingMessage`, and the failure a cast lets through here is not a
`TypeError` but a missing field that makes every index in `LiveFightSource` answer
`undefined` and a body decode as garbage.

**`ArenaRejectReason` is a separate union from `RejectReason` and not four more
members of it.** That one is a command acknowledgement's field and every value in it
names something the command queue does; a union carrying both would type-check a
`commandAck` that said `arenaBusy`, which is a state the command path cannot be in.

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
five fixed regions: packed frame `f32` elements, map bytes, visibility bytes,
furniture records, and `DUNGEON_OBJECT_V1` words. Live lengths travel with every
snapshot: frame length counts floats, map and visibility lengths count bytes, and
furniture and dungeon-object lengths count records.
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
lease back. The explicit `#/game` buffer-exhaustion diagnostic instead holds the
next three distinct leases until the operator releases them; this is opt-in test
behavior and does not change the production ownership path.

## The arena recording channel

A worker is a **game session or an arena session and never both**, and the rule is
not tidiness: `arena_start` installs a world over `SIM`, so a recording begun inside
a live game would replace the world that session's epoch, its command targets and its
outstanding leases are all about, and nothing in the snapshot path would notice. An
`arenaStart` into an initialized worker is refused `wrongModel`; an `init` into a
worker that has recorded is refused `alreadyInitialized`. `#/arena` therefore builds
its own `Worker` from the same module, lazily, on the first **[Fight]**.

`arenaStart` carries a seed, the exact `arena_config_len()` bytes transferred, and
either the trained network's bytes or null. The buffer's length and its sole layout
field are checked before wasm is touched — the articulated-command payload rule
applied to the wider buffer — and every other rule in it is the module's to judge,
which it does by name through the twenty-seven codes in
[`articulated-abi.md`](articulated-abi.md#refusing-by-name). The checkpoint travels
*with* the start rather than as its own message because `load_checkpoint` is the only
allocating call in that set: it belongs in the same warm-up as `init_articulated`,
before any typed array over the pose buffer exists.

The drive is `step(1)` per tick, because `combat_event_len` is cleared per host
**call** rather than per publication, so a per-tick event index requires it. It yields
to the event loop every `RECORDING_CHUNK_TICKS` ticks and posts `arenaProgress`: a
worker services no message while JavaScript is on the stack, so a single
uninterrupted 3,600-tick loop would be a recording nobody could cancel. `arenaCancel`
is idempotent and unacknowledged when nothing is recording, and the *start* request
is what settles, with reason `cancelled`.

<!-- DOC_CONTRACT: worker-recording-transfer -->
### The recording, and why it is not the pooled buffer

`fightRecording` transfers **five** `ArrayBuffer`s and a header. It does not use the
snapshot pool, for three independently sufficient reasons: the pool zero-fills a whole
buffer on every return and is sized for one publication; it **coalesces**, dropping a
publication when no buffer is free, which is correct for a live 60 Hz game and silent
data loss for a recording; and the lifetimes differ, since a pooled buffer is borrowed
for a frame while a recording is allocated once per fight and owned by the main thread
for the whole scrubbing session.

| buffer | element | contents |
|---|---|---|
| `poses` | `u32` | pose rows, packed, `POSE_STRIDE` words each |
| `regions` | `u32` | region rows, packed, `REGION_STRIDE` words each |
| `events` | `u32` | combat-event rows, packed, `COMBAT_EVENT_STRIDE` words each |
| `index` | `u32` | seven words a frame: tick, then a start and a count per section |
| `health` | `i32` | two raw `Fx` a frame: the Heroes' and the Monsters' health fraction |

**The index is mandatory and is the point.** `pose_len` is one per *live* articulated
body, so a fighter dying takes it from 2 to 1 — the default-mechanics windmill control
kills the Brute at tick 1,260 on seed 3 — and a reader computing
`tick * 2 * POSE_STRIDE`
silently misaligns from exactly the frame anybody opened the page to look at. The
region section is read against the pose count for the same reason: a skipped body
shifts every row after it.

**Every extent in the index is bounds-checked against the buffer it addresses, once,
when the reader is constructed.** `TypedArray.prototype.subarray` clamps rather than
throwing, so a start past the end of a section is not an exception anybody sees — it
is a zero-length view whose every read answers `undefined` and a body drawn from
`NaN`. That is the one failure on this path a picture cannot diagnose, so it is
refused at adopt time rather than met at whatever scrub position a reader happened to
drag to.

Both row sections have caps and hitting one sets `recordingTruncated`, which the
header carries and the studio displays — asserted end to end by
`a_truncated_recording_says_so_where_a_reader_can_see_it`, because a flag nothing
shows is not honesty. The pose and region extents are exact by construction — an arena
is two fighters, which is what `ARENA_FIGHTERS` means — so only the event cap can be
reached; it is `RECORDING_EVENT_ROW_CAP`, sized by the repository's own rule from a
measured corpus recorded beside the constant. **The corpus a cap like this needs is
one of picker-reachable configurations**, which the first one was not: it moved the
spawns, and a reader cannot, since `SHIPPED_SPAWNS` reaches `Scenario::fingerprint`.
Re-recorded at the shipped spawns the busiest reachable fight is 10,130 rows against
the 4,948 first measured, and the cap is 32,768. A truncated recording reports no
outcome, because it did not watch the fight end.

The header carries what the buffers cannot: the three layout versions and strides, the
drop counters, the tick count and frame count, the outcome and `timedOut`, the arena
fingerprint, the seed, both side labels, the installed checkpoint's SHA-256, and a
per-body block with the anatomy scalars and every carried item — **including a
shield's `thickness`**, which the pose row deliberately omits and `shieldCorners()`
needs.

It also carries **`spectator: true`**, and that field is a **gate rather than a
label**. The arena publishes unfiltered ground truth, which is correct here — both
fighters are the subject and there is no fog — and a leak the moment this path is
copied into the game path. `articulated-abi.md` is explicit that pose rows must not
cross to a renderer unfiltered, so the exemption rides in the message rather than
living in a comment somebody will not read.

It was declared, typed and asserted and **read by nothing** when v2-ui-07 landed: a
recording claiming `spectator: false` was accepted and rendered identically, so the
reason travelled with the data and was never consulted. Two consumers now refuse a
stream that does not declare itself — `decodeArenaMessage` at the protocol boundary,
and `LiveFightSource`'s constructor, which is the thing that would otherwise have
drawn it. The value must be exactly `true`; truthy is not enough, because the point
of the field is that the exemption was taken deliberately.

Two columns are assembled rather than copied and both are written down as such. The
**faction health fractions** are `World::health_fraction`'s own arithmetic over the
legacy frame's published `UnitView::hp` and `max_hp`, whose raws cross exactly as
`f32`; the denominator is taken from the first frame, because `health_fraction` totals
the maxima of every unit alive or dead and a dead body has no row. The **outcome** is
`World::outcome`'s table over the published alive counts, falling through to
`World::timeout`'s comparison of the two health fractions. Neither is exported. What
holds them honest is `a_live_fight_matches_the_traced_fight`, which compares both
against `lab trace`'s output for every tick of two whole fights, one of which ends in
a kill.

<!-- DOC_CONTRACT: worker-visibility-filter -->
## Visibility filtering

The worker copies all five game publications atomically, then filters only the
client-owned copy. It publishes the full visibility grid. A per-epoch remembered-map
cache updates true map bytes only where visibility is `2`, retains the previous byte
at `1`, and publishes `MAP_UNKNOWN` (`255`) at `0`. Hidden true-map changes therefore
cannot rewrite remembered terrain.

Only unit rows whose legacy `visible` field is nonzero survive. Shots, events, and
furniture and dungeon objects survive only on currently visible tiles. Hidden event actor/other indices
become `-1`. A Focus order's header coordinates survive only when the separate focus
index and generation identify a surviving visible row; coordinate equality or index
alone is insufficient. Goto coordinates remain visible because they came from the
player's own command.

Unit, shot, and event counts and the live frame length are recomputed after filtering.
Filtered map, visibility, furniture, and dungeon-object revisions start at zero per epoch, increment
only when the disclosed bytes change, and fail fatally rather than wrap. None of this
presentation state enters `World`, replay, or a hash domain.

## Source anchors

**Three of these were wrong when v2-ui-07 landed** — `SimWorkerHost`, `SnapshotFilterState`
and `readPublication` all named the line the symbol had been on before that session
moved it, at a time when `check_docs.js` validated only that a `#L` anchor was inside
its file. It now checks the claim the link's text makes, in three shapes: text naming a
symbol needs that name's leaf within `ANCHOR_CONTEXT` (4) lines of the anchor; text
naming a file or a crate has nothing in itself to check, so a link inside a table row
is held to its row's subject — the pin's name, or the pinned value, in a cell to its
left; and a link with neither only has to land where a reader can recognise the start
of something — a declaration, an attribute, the head of a comment block, or line 1 —
and only in a source language the gate models the syntax of. It found twenty-three
stale anchors on the day it was written, and a twenty-fourth beside one of them.

**It is still a rot detector rather than a symbol resolver, and it writes its own
residual down.** A leaf match is a mention and not a definition, so an anchor that
lands on a *call* of the symbol it names passes — deliberately, since plenty of these
links point at a call site. And a link whose text is prose rather than a code span —
"the frame writer", say — has no leaf to match at all, so it falls through to the
weakest of the three rules. Four links in the tree have that shape. An
anchor is a hint and not a contract; check the symbol is on the line before quoting
one.

- Protocol declarations and input decoder: [`messages.ts`](../../client/src/protocol/messages.ts#L1), [`decodeClientMessage`](../../client/src/protocol/messages.ts#L293)
- Fixed buffer pool: [`FixedBufferPool`](../../client/src/runtime/buffer-pool.ts#L22)
- Pure worker state machine: [`SimWorkerHost`](../../client/src/runtime/sim-worker-host.ts#L55)
- Main-thread request and lease owner: [`SimClient`](../../client/src/runtime/sim-client.ts#L122)
- Snapshot validator and disclosure filter: [`SnapshotFilterState`](../../client/src/state/snapshot.ts#L59)
- Real wasm adapter: [`readPublication`](../../client/src/runtime/sim.worker.ts#L88)
- Generated offsets and capacities: [`abi.generated.ts`](../../client/src/protocol/abi.generated.ts#L1)
- The recording drive and its caps: [`recordArenaFight`](../../client/src/runtime/arena-recorder.ts#L521)
- The arena's main-thread client and its decoder: [`decodeArenaMessage`](../../client/src/runtime/arena-client.ts#L59)
- The recording's reader: [`LiveFightSource`](../../client/src/fight/live.ts#L143)
