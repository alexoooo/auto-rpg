# v2-ui-07 — a fight recorded in the worker, scrubbed on the main thread

**Goal:** press **[Fight]**, and watch the fight that configuration produces — no
command line, no 9 MB download, no build step.

**Depends on:** `v2-ui-05` (the driver), `v2-ui-06` (the capsules), `v2-ui-01`
(`FightSource`).

**Golden expectation:** no pin moves. `WORKER_PROTOCOL_VERSION` goes 1 → 2, which is a
protocol version and not a golden.

## Record the whole fight, then transfer once

The viewer scrubs. Random access over 3,600 ticks is the requirement, and it decides the
model: the worker runs the fight to its natural end and posts one message transferring
the buffers.

Streaming tick by tick was considered and rejected for three reasons, the last of which
is decisive:

- The main thread would reassemble 3,600 messages into the same arrays anyway — identical
  memory, 3,600× the `postMessage` cost, plus a partial-fight state every panel has to
  render around.
- One uninterrupted worker-side run is reproducible from `(config, seed)` by inspection.
  A run interleaved with `advance` messages is not.
- **`combat_event_len` is cleared per `step`, not per publication**
  ([`crates/web/src/lib.rs:4679`](../../../crates/web/src/lib.rs#L4679)). A per-tick
  event index therefore *requires* `step(1)`. That is a recording loop by construction;
  it is not a play loop with recording bolted on.

Playback still starts immediately: recording a whole fight takes about five seconds at
the rate `v2-ui-05` measured, and the transport can run from the head of the buffer
while the tail fills. **Read the measured number out of `v2-ui-05` before designing the
chunk size** — if `publish()` dominated and that session added `arena_record_step`, this
one uses it.

## Not the pooled snapshot buffer

The recording gets its own channel. Three independently sufficient reasons:

1. `sim-worker-host.ts:265` zero-fills the whole buffer on every return. The pool is
   sized for one publication;
   `docs/reference/articulated-abi.md` already refuses an 11.2× wider per-publication
   memset "for regions nothing writes and nothing reads", and a 1.8 MB × 3 pool is that
   argument several times over.
2. `sim-worker-host.ts:236` **coalesces** — when no buffer is free it increments a
   counter and drops the publication. Correct for a live 60 Hz game, silent data loss
   for a recording.
3. Lifetimes differ. A pooled buffer is borrowed for a frame and returned; a recording
   is allocated once per fight and owned by the main thread for the whole scrubbing
   session.

## The index is mandatory

`pose_len` is *"one per live articulated body"*. When a fighter dies it drops from 2 to
1. A reader computing `tick * 2 * POSE_STRIDE` silently misaligns from exactly the frame
anybody opened the page to look at.

So the transfer is three buffers, not two:

```text
poses    Int32Array   pose rows, packed
events   Int32Array   combat-event rows, packed
index    Uint32Array  4 words per tick:
                      poseRowStart, poseRowCount, eventRowStart, eventRowCount
```

The index is 57,600 bytes for 3,600 ticks. Region rows from `v2-ui-06` ride the same
scheme with their own start and count.

**Budget the events honestly.** `articulated-abi.md` records a high-water corpus
measuring **446 rows in a single `step(8)`** — that is the measurement that rejected a
provisional capacity of 256. At 128 bytes a row, a fight in sustained contact is
megabytes. Both buffers need caps, and hitting a cap must set a `recordingTruncated`
flag the header carries and the studio displays — the same honesty the trace's own
`truncated` field already provides.

## Protocol

`WORKER_PROTOCOL_VERSION` 1 → 2. `articulated-mechanical-gate.md` already commits v2 to
accepting exact V1 sessions as legacy-only for their lifetime, so this is that bump and
not a third version. `decodeClientMessage`
([`client/src/protocol/messages.ts:109`](../../../client/src/protocol/messages.ts#L109))
currently hard-refuses anything but the current constant, so dual-version acceptance is a
real change to that function and not a constant edit.

New client messages: `ArenaStart { seed, config: ArrayBuffer }` — transferred, exact byte
length, bytes `0..1` the sole layout field, validated before acceptance, mirroring the
articulated-command payload rule — and `ArenaCancel`.

New worker messages: `ArenaProgress { ticksDone, ticksTotal }`, `FightRecording`, and
`RejectReason` values `wrongModel | unknownLayout | invalidArenaConfig | arenaBusy`.

`FightRecording`'s header carries what the buffers cannot: layout versions and strides
for all three sections, tick count, dropped counters, `recordingTruncated`, outcome,
`timedOut`, the arena fingerprint, the seed, both side labels, and a per-body block with
the anatomy scalars and each carried item — **including shield `thickness`**, which the
pose row deliberately omits and `shieldCorners()` needs.

It also carries `spectator: true`. The arena publishes unfiltered ground truth, which is
correct here — both fighters are the subject and there is no fog — and a leak the moment
this path is copied into the game path. `articulated-abi.md` is explicit that pose rows
must not cross to a renderer unfiltered. Putting the exemption in the message means the
reason travels with the data instead of living in a comment somebody will not read.

## `LiveFightSource`

Implements the interface `v2-ui-01` defined, decoding by the `POSE_*`, `COMBAT_EVENT_*`
and `REGION_*` offsets in `abi.generated.ts`. No panel changes.

Two places it cannot match `TraceFightSource`, both of which must be visible in the UI
rather than papered over:

- **Contact velocity and impulse.** `Contact` carries `velocityA/B` and `impulseA/B`; the
  32-word event row carries neither. `closureSpeed()` has no live equivalent, so the
  readout shows it as unavailable on a live fight. Growing the event row would move
  `COMBAT_EVENT_LAYOUT_VERSION` and `ARTICULATED_STREAM_DIGEST` and belongs to a session
  that wants it, not to this one.
- **The learned policy**, until [`v2-ui-08`](v2-ui-08-learned-in-the-browser.md) lands
  it. Live fights offer the four scripted codes; loading a trace is how a checkpoint is
  watched in the meantime, and the picker says which session changes that.

This also buys a differential oracle worth building while both adapters are fresh: run
one configuration through `lab trace` and through the browser, and compare. Every field
both sources carry must agree exactly — they are the same fixed-point words from the same
simulation. `a_live_fight_matches_the_traced_fight` is the strongest test available for
the whole series and it is cheap here.

## Verification

```powershell
npm run check
npm run build
npm run test:worker
npm run test:wasm-memory
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
cargo run --release -p lab -- hash
```

- `a_live_fight_matches_the_traced_fight` — same config, same seed, field for field.
- `the_index_survives_a_death` — a fight where a body dies; poses after that tick still
  read correctly. Construct it deliberately, since no fight has yet ended in a kill by
  itself.
- `a_truncated_recording_says_so`.
- `arena_start_allocates_within_the_warm_set` — `arena_start` builds a `Scenario`, two
  `Vec`s of spec rows and a `World`, so it joins the warmup in
  `client/test/wasm-memory.test.mjs`. Linear-memory growth **detaches every typed array
  view**, and a recording in flight is the worst moment for that. The recording itself
  lives in worker JavaScript, never in wasm memory.
- Cancel mid-recording leaves the worker able to start another fight.

By hand: change one shield dimension in the picker, press **[Fight]** twice, and confirm
the two fights differ and each is reproducible. That single interaction is what the whole
series was for.

## Decision

Record `pass`, `revise` or `stop`, and state the end-to-end time from **[Fight]** to
first frame on the user's machine.

Deferred on a pass: more than two fighters, a human driving one of them, contact
velocity on the live path, and `learned` in the browser.
