# Arena 01 -- the fight you watch while it happens

**Status:** ready. Independent of session 02; blocks 04 and 05.

`#/arena` today runs the whole duel to completion inside a Worker and then transfers it.
Nothing is drawn until the last tick exists. This session makes the worker post the fight
as it produces it, and makes the page draw the first chunk while the rest is still being
computed.

**The visible win is most of a second, and the real win is larger than that.**
`arena-recorder.ts:104-116` measures 9,000 to 10,000 ticks a second and then says outright
that *"that rate is one pairing's, and it is not the one the picker opens on"* -- the
slowest of the four pairings measured runs at **3,816 to 5,349 ticks a second**, so a
3,600-tick fight is **0.67 to 0.94 s** of staring at *"Recording..."* before anything is
drawn. Take the number from the slow pairing, because that is the one the page opens on.

What streaming actually buys is that **the transport stops assuming the fight is over**:
sessions 05 and 06 need a drive that produces one tick, hands it over, and waits, and that
drive cannot exist underneath a message shaped like a finished recording.

## What is there now

`client/src/runtime/arena-recorder.ts:632-651` -- the whole drive:

```ts
while (!truncated) {
  if (cancelled()) return { ok: false, reason: "cancelled", ... };
  for (let step = 0; step < RECORDING_CHUNK_TICKS; step += 1) {
    const before = wasm.tick(); wasm.step(); const after = wasm.tick();
    if (after === before) { settled = true; break; }
    ticks = after;
    if (!capture()) { truncated = true; break; }
  }
  hooks.onProgress(ticks, tickCap);
  if (!truncated) await hooks.yieldToMessages();
}
```

`RECORDING_CHUNK_TICKS` is 300 and its own comment says what it is for: a worker services
no message while JavaScript is on the stack, so an uninterrupted 3,600-tick loop would be
a recording nobody could cancel. **It is a cancel window, not a delivery cadence**, and
this session is where those two stop being the same number.

Six buffers are allocated whole before the first step (`arena-recorder.ts:553-560`), the
nine-word-per-frame index is written as rows are copied (`RECORDING_INDEX_STRIDE = 9`,
`arena-recorder.ts:135-144`), and everything is sliced and transferred once as
`fightRecording` (`arena-recorder.ts:693-704`).

## The shape this session lands

**One message becomes three, and the split is along "what is knowable when".**

| message | when | carries |
|---|---|---|
| `arenaOpened` | after `arena_start` returns, before the first step | `spectator: true`, `one`, `scenario`, `fingerprint`, `seed`, `heroes`, `monsters`, `checkpoint`, `maxTicks`, `arena`, the three layout versions and strides, and the per-body anatomy and carried blocks |
| `arenaChunk` | every `ARENA_STREAM_CHUNK_TICKS` | six buffers holding **only that chunk's frames**, plus `firstFrame` and `frameCount` |
| `arenaFinished` | when the drive settles, caps out, or is cancelled | `outcome`, `timedOut`, `ticks`, `frameCount`, `recordingTruncated`, and the four drop counters |

`arenaProgress` is **deleted rather than kept beside these**: a chunk already says how far
the fight has got, and two messages answering the same question is how one of them goes
stale.

### The header field that has to admit it does not know yet

`FightHeader` is `Omit<Trace, "frames" | "schema">` and `Trace.outcome` is `string`
(`client/src/fight/trace.ts:239`). A fight in progress has no outcome, and **inventing one
is the failure mode this repository names most often**. So:

```ts
// client/src/fight/source.ts
export type FightHeader = Omit<Trace, "frames" | "schema" | "outcome"> & {
  /**
   * `null` while the fight is still being produced.
   *
   * A streamed fight has no outcome until it stops, and the two dishonest
   * options are both worse than a null: a default string makes the readout
   * claim a result that has not happened, and omitting the field makes every
   * reader's `header.outcome` read `undefined` and print it.
   */
  readonly outcome: string | null;
};
```

Every reader of `header.outcome` is updated to render `"fighting"` -- or the word `sim`
already uses for an undecided fight, which the session checks for before inventing one --
and `a_fight_in_progress_reports_no_outcome_rather_than_a_default` asserts it.

### `LiveFightSource` becomes a special case of the streaming one

The decode must not fork. `LiveFightSource.frameAt` (`client/src/fight/live.ts:259`)
already builds `Pose`/`Contact`/`Projectile` objects from packed rows against the
nine-word index; that function is lifted unchanged into a chunk-local decoder, and both
sources call it.

```ts
// client/src/fight/live.ts
/** One transferred chunk, with every extent checked once, at adopt. */
class FightChunk {
  readonly firstFrame: number;
  readonly frameCount: number;
  // ... the six views, and the same construction-time bounds checks
  //     live.ts:212-252 already performs, applied per chunk.
  frameAt(local: number): FightFrame { /* the lifted decoder */ }
}

export class StreamingFightSource implements FightSource {
  #chunks: FightChunk[] = [];
  #frames = 0;
  header: FightHeader;              // outcome null until `finish` supplies one

  adopt(chunk: FightChunk): void { /* appends; frames += chunk.frameCount */ }
  finish(tail: ArenaFinishedMessage): void { /* fills outcome, truncated, ticks */ }

  frameCount(): number { return this.#frames; }
  frameAt(index: number): FightFrame { /* locate the chunk, then delegate */ }
}
```

**The index words inside a chunk are chunk-relative, and that is the trap this session
exists to not fall into.** Today `INDEX_POSE_START` is an offset into a whole-fight buffer.
A chunk carrying absolute starts into its own short buffers is exactly the failure
`live.ts:212-252` was written against: `TypedArray.prototype.subarray` clamps rather than
throwing, so an out-of-range start is not an exception anybody sees -- it is a zero-length
view whose every read answers `undefined` and a body drawn from `NaN`. Either the recorder
writes chunk-relative starts or the adopter rebases them, **and whichever is chosen, the
other one is asserted**:

```ts
test("a_chunk_whose_index_starts_are_not_chunk_relative_is_refused_at_adopt", ...)
```

Prove it red by handing `adopt` a chunk whose first `INDEX_POSE_START` is the whole-fight
offset it would have had today.

### Playback starts before production ends

`client/src/arena/arena.ts:1012-1055` already accumulates `carry` at
`TICKS_PER_SECOND * state.rate` and calls `go(state.frame + steps)`, and `go` clamps.
Clamping against a *growing* `frameCount()` is most of the work. The rest is the lead:

```ts
// arena.ts, inside loop()
const produced = loaded.frameCount();
const wanted = state.frame + steps;
if (wanted + ARENA_STREAM_LEAD_TICKS > produced && !finished) {
  // Production is behind the display. Hold the frame rather than clamping to it:
  // clamping would run the playhead up against the producer and stutter one
  // frame at a time, which reads as a broken renderer rather than a slow fight.
  starving = true;
} else { starving = false; go(wanted); }
```

`starving` is shown, not hidden -- the status line says the fight is being produced --
because a page that silently stops advancing is indistinguishable from one that crashed.

## What this session must not change

- **`FightSource`'s three members.** `header`, `frameCount()`, `frameAt(index)`. The
  panels must stay unable to tell a trace from a live fight from a streamed one; that seam
  is the reason `?trace=` still works and it is not this session's to widen.
- **`TRACE_SCHEMA`.** Still `arpg-fight-trace-6`. Streaming is a transport below
  `FightSource`. If this session edits `crates/lab/src/trace.rs`, it has put the change in
  the wrong layer.
- **The lazy worker.** `npm run view` -- Vite with no wasm build -- must still *open*
  `#/arena` and still fail only when **[Fight]** is pressed. First press constructs the
  `ArenaClient` (`client/src/arena/arena.ts:798`), and the `new Worker` itself is one
  level down at `client/src/runtime/sim-worker.ts:17` where Vite needs the literal. And
  `the_arena_and_the_fight_modules_reach_neither_the_worker_nor_the_wasm` in
  `client/test/studio-shell.test.mjs:1239` is what holds it. That test matches on the
  import **specifier** and names its exceptions by file and specifier with a reason,
  because the same assertion passed for two sessions while broken. Any new module in the
  chain is added to its exception list *with its reason*, or the import is made dynamic.
- **`spectator: true` as a gate.** It moves from `fightRecording` to `arenaOpened` and
  stays a gate: `decodeArenaMessage` and the source constructor both refuse a stream that
  does not declare itself, and the value must be exactly `true` because the point of the
  field is that the exemption was taken deliberately.
- **`step(1)` per tick.** `combat_event_len` is cleared per host *call*, so a per-tick
  event index requires it. This is not a place to batch.

## Constants

```ts
/**
 * Ticks per streamed chunk.
 *
 * **Bounded from both sides, and the two sides are different costs.** At 1 the
 * fight pays a `postMessage` and six buffer allocations per tick -- 3,600 of
 * each for one duel. At `RECORDING_CHUNK_TICKS`' 300 the first frame is five
 * seconds of fight late at 1x, which is the wait this session exists to remove.
 * 30 is half a second of fight and about 120 messages a duel.
 *
 * `the_stream_chunk_is_bounded_from_both_sides` asserts both ends.
 */
export const ARENA_STREAM_CHUNK_TICKS = 30;

/**
 * How far production must lead the playhead before playback starts or resumes.
 *
 * At 0 the playhead meets the producer at every chunk boundary and the fight
 * stutters once per chunk. At a whole chunk it is the old wait in smaller units.
 * Half a chunk is the smallest lead that survives one late chunk.
 */
export const ARENA_STREAM_LEAD_TICKS = ARENA_STREAM_CHUNK_TICKS / 2;
```

`RECORDING_CHUNK_TICKS` keeps its name and its 300 **and stops being the delivery
cadence**: it remains the cancel window, and its doc comment is rewritten to say so rather
than deleted, because the measurement in it -- 56 to 79 ms of work for 300 ticks on the
slowest pairing -- is still the reason the cancel window is the size it is.

## Files

| file | change |
|---|---|
| `client/src/protocol/messages.ts` | `ArenaOpenedMessage`, `ArenaChunkMessage`, `ArenaFinishedMessage`; `FightRecordingMessage` and `ArenaProgressMessage` deleted; the V1 refusal sentence for each new kind |
| `client/src/runtime/arena-recorder.ts` | per-chunk buffers; the drive posts as it goes; `RECORDING_CHUNK_TICKS` re-explained |
| `client/src/runtime/sim-worker-host.ts` | `arenaStart` dispatch posts three kinds instead of two; transfer lists per chunk |
| `client/src/runtime/arena-client.ts` | `decodeArenaMessage` for the three kinds; `run()` resolves on `arenaFinished` and streams before it |
| `client/src/fight/live.ts` | `FightChunk`, `StreamingFightSource`; the row decoder lifted so both sources share it |
| `client/src/fight/source.ts` | `FightHeader.outcome` becomes `string \| null` |
| `client/src/arena/arena.ts` | the lead check in `loop()`; a status line that says the fight is being produced; transport enabled at the first chunk instead of at the end |
| `docs/reference/worker-protocol.md` | the recording channel rewritten for three messages; see the heading warning below |
| `docs/README.md` and `docs/reference/articulated-abi.md:1435` | both link `worker-protocol.md#the-recording-and-why-it-is-not-the-pooled-buffer`; **a renamed heading breaks both and the marker with them** |
| `docs/architecture/browser-runtime.md` | "The trace file is a two-file contract" and the arena flow paragraph |

**Two traps in that documentation row, and both are gate failures rather than untidiness.**

The `DOC_CONTRACT: worker-recording-transfer` marker at
`docs/reference/worker-protocol.md:195` binds to the heading *"The recording, and why it
is not the pooled buffer"*, and `tools/check_docs.js` enforces two things about it: a
local link naming a missing anchor is an error, and **a `DOC_CONTRACT` heading must have
an inbound Markdown link from another file**. Two files link that exact anchor. So the
heading is either kept verbatim while its body is rewritten, or renamed in the same change
as both inbound links.

And **the section it is in says `fightRecording` transfers five `ArrayBuffer`s while the
code transfers six** (`client/src/runtime/sim-worker-host.ts:282-285`; the table omits
`projectiles`). This session rewrites that section, so it fixes the count rather than
carrying it forward into three messages.

## Tests

In `client/test/worker-protocol.test.mjs`:

- `an_arena_chunk_is_refused_at_v1_by_name_rather_than_as_malformed`
- `a_chunk_whose_index_starts_are_not_chunk_relative_is_refused_at_adopt`
- `a_stream_that_does_not_declare_itself_spectator_is_refused_at_the_boundary`
- `the_stream_chunk_is_bounded_from_both_sides`

In `client/test/studio-shell.test.mjs`:

- `the_arena_draws_a_frame_before_the_fight_has_finished`
- `a_fight_in_progress_reports_no_outcome_rather_than_a_default`
- `a_starving_playhead_says_so_instead_of_stalling_silently`
- `a_cancelled_stream_keeps_the_frames_it_already_delivered`
- `the_arena_and_the_fight_modules_reach_neither_the_worker_nor_the_wasm` -- unchanged
  assertion, updated exception list if a module joined the chain

**Show each failing first.** The one most likely to be green while broken is
`the_arena_draws_a_frame_before_the_fight_has_finished`: written against a fake worker
that posts everything synchronously it asserts nothing at all. It must be driven by a fake
that posts chunk 0, is checked, and only then posts the rest.

## Acceptance

1. **Time from [Fight] to the first drawn frame is under 100 ms**, measured in the
   worker's own message timestamps rather than from a browser tab -- a Claude-in-Chrome
   tab is always `visibilityState: "hidden"`, which is a stop and not a throttle, so a
   number taken there is not a number.
2. **An AI-versus-AI fight is byte-identical to today's recording, frame for frame.** The
   check is `a_live_fight_matches_the_traced_fight` still passing against `lab trace` for
   every tick of two whole fights, one of which ends in a kill -- it is the existing test
   and it is the acceptance, because a streamed fight that decodes differently is a
   different fight. **It lives in `client/test/wasm-memory.test.mjs:1549`, not in the
   worker or studio suites, and it instantiates a real `web.wasm`** -- so the verification
   block below builds the wasm before running the client suites, or this acceptance is
   checked by a test that skipped.
3. `?trace=` still plays, and `npm run view` still opens the route with no wasm present.
4. Cancel still works and is still idempotent, and the frames already delivered survive it.

## Hash expectations

**Nothing moves.** This session is TypeScript and Markdown; no crate is edited.

## Verification

```powershell
cargo build --release --target wasm32-unknown-unknown -p web   # a_live_fight_matches_the_traced_fight needs it
node --test "client/test/*.test.mjs"
npm run check
npm run check:abi
node tools/check_docs.js
node tools/check_deps.js
npm run dev        # foreground; press Fight and watch frame 0 arrive first
```

The wasm build is first and is not optional here: `wasm-memory.test.mjs` carries this
session's own acceptance and it needs an artifact on disk. A session that runs the client
suites against a stale or absent `web.wasm` has not checked the thing it claims to.
