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
  ([`crates/web/src/lib.rs:3405`](../../../crates/web/src/lib.rs#L3405), which is
  `advance_arena`'s `combat_events.clear()`; `advance` does the same at `:2960`).
  A per-tick event index therefore *requires* `step(1)`. That is a recording loop by
  construction; it is not a play loop with recording bolted on.
  *This bullet cited `:4679` until the review, which is a line inside
  `write_combat_event_row` that packs the body-part column and clears nothing.*

Playback can start immediately, and at the rate `v2-ui-05` measured it barely has to:
a 3,600-tick fight drives in **under half a second**, not the five seconds the
overview extrapolated. The transport can still run from the head of the buffer while
the tail fills. `publish()` did not dominate and there is no `arena_record_step` to
use.

*This paragraph first said "about 10,000 ticks/s in wasm under Node" and the
re-measurement in [`articulated-abi.md`](../../reference/articulated-abi.md#what-recording-costs)
is the canonical figure: **8,821–9,996 ticks/s** for the shipped `composed` against
`windmill`, pinned to CPU 0 at high priority, best of nine across six process runs.
The unpinned 18,000–26,000 and 58,000 readings in earlier notes are what a process
reads while Windows migrates it between P- and E-cores. This session's own paired
measurement of the same fixture is at the end of this file.*

**Read [`articulated-abi.md`](../../reference/articulated-abi.md#what-recording-costs)
and not the number alone before designing the chunk size.** That section says what the
measurement does *not* cover, and one of the three items is this session: it is
`step()` under Node with no browser, no worker and **no per-frame copy-out of the pose,
region and combat-event buffers**. Lifting 66 words per body per tick out of linear
memory is work the 10,000 ticks/s never included. The other two are that neither
fixture ends early, so the figure is the longest fight a configuration allows, and that
the `learned` policy is unmeasured.

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
([`client/src/protocol/messages.ts:283`](../../../client/src/protocol/messages.ts#L283))
hard-refused anything but the current constant, so dual-version acceptance is a
real change to that function and not a constant edit. *The anchor read `:109` until
the review; this session rewrote the file and the line moved.*

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
*And a reason that travels without being read is still a comment*: as first shipped
nothing branched on the field, so a producer writing `false` was rendered identically.
Both consumers now refuse a stream that does not declare itself, on exact `true`.

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
- ~~**The learned policy**, until [`v2-ui-08`](v2-ui-08-learned-in-the-browser.md)
  lands it.~~ **Superseded: v2-ui-08 landed first.** All five policy codes run live.
  The checkpoint is fetched from `/checkpoints/v2-probe.ckpt`, staged and installed in
  the same warm-up as `init_articulated`, and a fighter carrying code 4 without one is
  refused `ARENA_NO_CHECKPOINT` — which is reason 26 and carries **the policy code** in
  bits 24..31, not a hand index.
- **A pose's attack target.** `POSE_INTENT` is the discriminant only, so a live fight
  can say a body is attacking and not who. The trace carries the `EntityId` because it
  writes the whole `Intent`.

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

Deferred on a pass: more than two fighters, a human driving one of them, and contact
velocity on the live path. **`learned` is no longer on that list** — v2-ui-08 landed
policy code 4 and this session wired the fetch; see below.

## How v2-ui-07 closed

**`pass`, with the by-hand interaction owed to a human.** Press **[Fight]** and the
fight the picker describes runs in a worker of its own and arrives as one transfer the
panels scrub, with no command line, no 9 MB download and no build step. No pin moved.

**Configuration to scrubbable first frame: 0.3–0.4 s**, measured in Node. Not covered:
worker startup, the `/web.wasm` fetch and instantiate, the 15 KB checkpoint fetch, and
`postMessage` — the page prints its own `recorded in N ms` so a reader sees the real
one. The end-to-end number on a browser is not obtainable from here: an automated tab
on this machine receives no animation frames at all.

The differential oracle is the result worth keeping. `a_live_fight_matches_the_traced_fight`
agrees **field for field on 3,601 frames** of `fight.json` and **3,340** of
`fight-learned.json`, and it is an oracle rather than a formality: perturbing one
published word by 1 fails the comparison for 60 of 66 pose words, 31 of 32 event words,
all region geometry and both health words.

Two coverage gaps stay open and are recorded rather than closed: the **left-weapon
block** (`POSE_LEFT_WEAPON_*` is decoded but never compared, because both fixtures put a
shield or nothing in a left hand — a picker-reachable left-hand blade would exercise it)
and **`COMBAT_EVENT_TICK`**, which neither side carries and which is the one column that
could independently audit the per-tick event index.

**The adversarial review filed twelve findings and all twelve are fixed.** The one that
mattered falsified a sentence in this plan: `ArenaClient.run` raced itself, because its
re-entrancy guard tested `#pending` before `await this.#loadCheckpoint()` ever assigned
it. Two presses with `learned` posted two starts and no cancel, and the first promise
never settled. The extended regression test **hung** on the unfixed code — `test timed
out after 20000ms` — which is the defect at its sharpest.

Also worth carrying forward, because it is the third instance in this series: the test
named `the_arena_and_the_fight_modules_reach_neither_the_worker_nor_the_wasm` passed
while the arena statically imported the worker constructor, because the guard matched
`sim\.worker` with a literal dot and the new module was `sim-worker.ts`. An
architecture rule enforced by scanning source text fails open. It now extracts
specifiers and asserts its allowlist exactly — which immediately caught a stale entry.

Deferred, as the plan allows: more than two fighters, a human driving one, and contact
velocity on the live path.

**Owed to a human.** The plan's by-hand check — change one shield dimension in the
picker, press **[Fight]** twice, confirm the two fights differ and each is reproducible
— cannot be done from here. Everything under it is built and tested; what is missing is
one `<input>` per dimension in `web/index.html` and a line in `readMatchup`.

## What was built, 2026-08-11

**No decision is recorded here yet.** An adversarial review has now run against this
work and filed twelve findings — one critical, a real race in `ArenaClient.run` — and
all twelve are addressed in place below, each beside the measurement or the failing
assertion that made the case. What follows is the evidence that decision will need,
corrected where the review showed it was wrong. Two things it settled and that should
not be re-litigated are recorded in place: `a_live_fight_matches_the_traced_fight` is a
genuine oracle under perturbation, and the two gaps in it that are worth knowing about
are named beside it.

### No pin moved, re-printed after the fixes

All nine, on the machine that owns them, after the review's findings were fixed:

```text
LAB_HASH                  0xfe31370e141ef531
ROOM_HASH                 0x98441a18db7a95ca
BATTLE_HASH               0x9aafe4bd54560586
SWAP_HASH                 0xf948f5486ee90191
BOW_HASH                  0x4a1157735d305e9f
combat spec-table digest  0x78e5b57ae0c6bbd6
articulated-duel-v1       0x068d05fcada1027b
ARTICULATED_STREAM_DIGEST 0xf7d3a9c73aa59981
LEARNED_INFERENCE_DIGEST  0xbdba8d64d340ce32
```

The fix pass touched one file under `crates/` — `crates/learn/tests/allocation.rs`,
which is a test binary that ships in nothing — so none of them could have moved, and
they did not.

### No pin moved, and none was expected to

This session is client-side: nothing under `crates/` was touched.

```text
LAB_HASH                  0xfe31370e141ef531   cargo run --release -p lab -- hash
ROOM_HASH                 0x98441a18db7a95ca   cargo test -p web -- --ignored --nocapture print_the_golden_hashes
BATTLE_HASH               0x9aafe4bd54560586   (same command)
SWAP_HASH                 0xf948f5486ee90191   (same command)
BOW_HASH                  0x4a1157735d305e9f   (same command)
combat spec-table digest  0x78e5b57ae0c6bbd6   cargo test -p sim -- --nocapture the_shipped_fixture_digest
articulated-duel-v1       0x068d05fcada1027b   (same command)
ARTICULATED_STREAM_DIGEST 0xf7d3a9c73aa59981   cargo test -p web -- --ignored --nocapture print_the_articulated_stream_digest
LEARNED_INFERENCE_DIGEST  0xbdba8d64d340ce32   cargo test -p web -- --ignored --nocapture print_the_learned_inference_digest
```

`node --test tools/wasm_check.js` prints `stream digest 0xf7d3a9c73aa59981 == native`
and `learned digest 0xbdba8d64d340ce32 == native`. **No `ARTICULATED_HASH` was
created.** `WORKER_PROTOCOL_VERSION` went 1 → 2, which is a protocol version.

### `learned` **is** in the live path

Wired, and driven by a test rather than by a claim:
`the_index_survives_a_death` records the shipped arrangement with `learned` on the
Fighter and `windmill` on the Brute at seed 3, through `arena_start`, the checkpoint
staging buffer and the real release wasm. It ends at tick **3,339** with
`HeroesWin` and the installed checkpoint's SHA-256 read back out of
`checkpoint_digest_ptr` as
`7a05fc8c76ad47858ac69f770d595fa556b1bfb81dbf7d62ced831e751e26b6c` — the same fight
and the same kill tick v2-ui-08 measured, and
`a_live_fight_matches_the_traced_fight` then compares all 3,340 frames of it against
`lab trace --policy learned` field for field.

The handshake is `articulated-abi.md`'s exactly: refuse locally past
`checkpoint_capacity()`, take a **fresh** view over `checkpoint_ptr()`, write, drop
the view, `load_checkpoint(len)`, decode the packed word, and only then send code 4.
It rides in the `arenaStart` message rather than in one of its own, because
`load_checkpoint` is the only allocating call in the set and belongs in the same
warm-up as `init_articulated` — a separate message would let a client interleave it
with a recording in flight.

`ARENA_NO_CHECKPOINT` is decoded correctly and the decoding is tested.
`an_arena_refusal_reads_its_policy_code_and_not_a_hand_index` asserts that bits 24..31
of `submit_result(0, 26, 0, 4)` read as **policy code 4 and not hand 4**, alongside
reason 7 and a reason that genuinely names a hand. Mutation-checked: narrowing
`aboutAPolicy` back to reason 7 alone fails it.

### The measurement, pinned, with the copy-out paired against its own control

**`articulated-abi.md#what-recording-costs` says in as many words that its figure
covers no per-frame copy-out of the pose, region and combat-event buffers, and that
this is the session that adds one.** So the honest shape is a paired comparison inside
one process rather than two numbers from two sessions: the same fight driven as bare
`step(1)` calls and as a full recording, rounds interleaved, best of nine, three
process runs pinned to logical CPU 0 at high priority, with the bare cell repeated
after every round as the closing control.

`composed` against `windmill` at seed 3 — `articulated-abi.md`'s own fixture, 3,600
ticks:

| | best of nine, three pinned runs |
|---|---|
| bare `step(1)`, nothing read | 360.1 / 367.2 / 365.1 ms — 9,804–9,997 ticks/s |
| the same fight, recorded | 380.9 / 369.9 / 362.1 ms — 9,453–9,943 ticks/s |
| what the copy-out cost | **+5.8% / +0.7% / −0.8%** |
| closing control (bare, after every round) | 349.7 – 500.2 ms |

**Superseded, and three ways wrong.** The table above is left standing because the
correction is the interesting part, and all three faults are in the *statistic* rather
than in the harness:

1. **It reports the difference of two cells' best-of-nine.** That is a paired-**runs**
   comparison, which is precisely what `AGENTS.md` says not to do — and the harness
   already had the paired per-round difference for free and did not print it.
2. **"Straddles zero" and "below the noise floor" are weaker than the data.** The
   paired deltas are positive in **21 of 27 rounds** across three fresh pinned runs. A
   consistent **+3 to +4%** is the honest reading; a bound that admits zero is not.
3. **"Under 6%" does not survive a repeat.** The review's own run 2 read +7.5% on this
   very statistic.

Re-measured on 2026-08-11 under the full rule — same fixture, one process pinned to
logical CPU 0 at High, nine rounds, each round `bare → recorded → bare` so the
recorded cell is **bracketed** by two bare drives on the identical fight and the
round's own closing control is half of its own denominator:

| | run 1 | run 2 | run 3 |
|---|---|---|---|
| bare, best of nine | 300.6 ms | 302.0 ms | 306.5 ms |
| recorded, best of nine | 312.6 ms | 311.1 ms | 317.9 ms |
| difference of the bests *(the old statistic)* | +4.0% | +3.0% | +3.7% |
| **paired per-round, bracketed, median** | **+3.0%** | **+5.0%** | **+5.7%** |
| paired per-round range | −8.5 to +13.5% | −11.7 to +8.9% | −13.2 to +22.2% |
| closing control | 305.9 – 502.1 ms | 301.3 – 483.0 ms | 304.6 – 489.1 ms |

Over all 27 rounds the bracketed median is **+3.6%** and the difference is positive in
**21 of them**. So: **the per-frame copy-out costs a consistent +3 to +4% of the drive,
and the defensible bound is ≤8%** — the same bound `articulated-abi.md` reached about
`publish()`, and quoted at that number rather than at 6% because 6% does not survive a
repeat on either statistic.

**Why the paired statistic is the one to read, from this data rather than from the
rule.** The machine drifted inside *every* one of the three runs: the bare cell went
from about 300 ms in rounds 1 and 2 to 370–500 ms from round 3 onward, and the closing
controls tracked it exactly. A difference of two cells' bests takes one number from
before the drift and one from after and calls the gap a cost; a bracketed round takes
both from the same few seconds.

**The absolutes are the fourth range measured on this machine, and they reproduce the
third rather than adding a fifth.** 300.6–306.5 ms bare, 11,747–11,974 ticks/s, against
the review's 293–308 ms and 11,686–12,281. What does *not* reproduce is this file's own
360–367 ms and `articulated-abi.md`'s pinned 8,821–9,996 ceiling, which the shipped
fixture now beats by about 20%. **The range across passes is the answer and not a
winner among them**: quote about 10,000 ticks/s with several thousand either side, and
do not read a 20% move in this number as a change in the code.

Four other cells, six pinned process runs, best of nine each:

```text
composed vs composed, seed 3   673 - 943 ms   3,600 ticks   3,816 - 5,349 ticks/s
composed vs windmill, seed 3   454 - 523 ms   3,600 ticks   6,879 - 7,935 ticks/s
windmill vs windmill, seed 3   527 - 684 ms   3,600 ticks   5,260 - 6,838 ticks/s
learned  vs windmill, seed 3   387 - 507 ms   3,339 ticks   6,592 - 8,634 ticks/s
```

Those six runs measured four cells and a control in one process and the machine
warmed under them — the control drifted from 654 ms to 1,734 ms across the session,
with other agents compiling on the same laptop. The paired table above is the one to
read; these are the spread of what a *different pairing* costs, and the honest
reading of them is that the pairing matters more than anything this session added:
`composed` on both sides is 1.5–2× the shipped `composed` against `windmill`.

**[Fight] to first frame.** The drive is the whole of it. Adopting the transferred
recording on the main thread — constructing a `LiveFightSource` and decoding frame 0 —
is **0.02 to 0.04 ms**, because the buffers *are* the recording and a frame is a view
of one slice of them. The one-off warm-up, `init_articulated` plus `load_checkpoint`,
is **4.4 to 17.2 ms** and is paid once per worker. So on this machine, in Node, the
shipped pairing is **0.31 to 0.40 s** from configuration to a scrubbable first frame —
the low end from the re-measurement above, the high end from the pass that produced the
superseded table, and both quoted because a single figure here would be picking a
winner among passes that disagree by 20%.

**What that does not cover**, recorded rather than glossed: worker startup, the
`/web.wasm` fetch and instantiation on the first press, the 15 KB checkpoint fetch
when `learned` is picked, and the `postMessage` itself. None is measured here.
The page prints its own figure — `recorded in N ms` beside the fight description in
`#status` — so the number a reader gets is the browser's rather than this one.

### The tests that carry the session

- **`a_live_fight_matches_the_traced_fight`** — the strongest test in the series, and
  it holds. An adversarial review perturbed one published word by 1 and the
  comparison failed for **60 of 66 pose words, 31 of 32 event words, all region
  geometry and both health words**, with `assert.deepEqual` under
  `node:assert/strict` catching a key present on one side and missing on the other —
  so neither side is computed from the other and the oracle is genuine.

  **Two gaps in it are real and are recorded here rather than fixed**, because both
  want a fixture this session does not have. The **left-weapon block**
  (`POSE_LEFT_WEAPON_*`) is decoded and never compared: both fixtures put a shield or
  nothing in a left hand, so no row ever fills it, and a picker-reachable loadout —
  a blade in the left hand, which `GripBinding` makes expressible and the picker
  already offers — would exercise it. And **`COMBAT_EVENT_TICK`** is carried by
  neither side, which makes it the one column that could independently audit the
  per-tick event index and does not.

  Same configuration, same seed, field for field, against both fixtures:
  `web/fight.json` (3,601 frames, `composed` on both sides) and
  `web/fight-learned.json` (3,340 frames, ending in a kill). Every pose column, every
  region capsule, every contact row, both health fractions and the whole per-body
  header agree exactly. The live fight is built **from the trace's own header**, so
  the two are the same configuration by construction. Mutation-checked: adding one
  raw unit to the sword's mass fails it.
  It is gated on the fixture and skips with the command that writes one, because
  `.gitignore` excludes `web/fight*.json` and a clean clone has nothing to compare
  against; the two commands are in the Verification block below.
- **`the_index_survives_a_death`**, twice. Against the real wasm it is the learned
  fight above: `pose_len` is 2 through frame 3,338 and 1 from 3,339, the survivor is
  the Fighter by identity, and the recording holds `3,339 * 2 + 1` pose rows rather
  than `3,340 * 2`. Against the scripted feed in `worker-protocol.test.mjs` it also
  asserts, as an assertion rather than as a comment, that the strided arithmetic a
  reader without an index would do lands on a *different row* after the death.
  Mutation-checked: replacing `index[... INDEX_POSE_START]` with `index * 2` fails it.
- **`a_truncated_recording_says_so`** — a scripted feed of 100 event rows a tick over
  400 ticks, 40,100 rows against `RECORDING_EVENT_ROW_CAP`. The header says
  `recordingTruncated` and the outcome is not claimed. Mutation-checked: widening the
  cap sixteenfold fails it. The feed is now compared against the constant rather than
  against the number the constant happened to be, because that number has since moved.
- **`a_truncated_recording_says_so_where_a_reader_can_see_it`** — the other half, and
  it was missing. `arena.ts:238` is the only place `truncated` reaches a reader and
  nothing built a header with it set, so the line could be deleted with every suite
  green — which is exactly the shape of hole this session's own standard names: a flag
  nothing shows is not honesty. It mounts the route with a truncated fixture and reads
  the sentence out of `#status`, beside the rest of the line rather than instead of
  it, with the untruncated fixture beside it so the assertion is about the flag.
  Mutation-checked: deleting `arena.ts:238` fails it.
- **`arena_start_allocates_within_the_warm_set`** — `init_articulated`,
  `load_checkpoint`, `arena_start` and 128 ticks over three differently-shaped
  arrangements, then three guarded cycles of the same with the retained views held.
  Settles at **223 pages**. The region array joins the retained set here, which
  v2-ui-06 left for the session with a consumer. Mutation-checked: warming on the
  shipped arrangement alone and guarding across all three fails at
  `cycle 2, warmUp(7): wasm.memory.buffer changed` with every retained view detached.
- **`a_cancelled_recording_leaves_the_worker_able_to_start_another_fight`** — cancels
  at a chunk boundary and then *starts another fight and asserts it finishes*, because
  a trap behind a `pub extern "C"` export poisons the instance for the life of the
  page and "still usable" is only demonstrated by using it.
- **`a_fatal_worker_error_settles_a_recording_it_does_not_name`** — the client's own
  correlation rule, and it caught a real defect while it was being written:
  `handleUnhandledError` reports a wasm trap with a **null** request id, so a client
  matching on the id alone left the promise pending forever and the page saying
  "Recording..." with nothing recording. A `terminated` is unsolicited for the same
  reason and settles the same way.
- **`a_second_fight_cancels_the_first_and_waits_for_its_refusal`** — the cancel's
  production caller. [Fight] stays enabled during a recording precisely so that a
  second press reaches it; the client posts `arenaCancel`, waits for the worker's
  `cancelled` refusal, and only then posts the next start, so the two never race into
  an `arenaBusy`.

  **That last clause was false when it was written, and the test passed because it
  only ever pressed twice with an await between.** `ArenaClient.run` guarded on
  `if (this.#pending !== null)` over a field assigned *inside* the returned promise's
  executor — which runs after `await this.#loadCheckpoint()`. Two presses of a
  `learned` matchup both suspended on that fetch, both found the slot empty, and both
  posted a start with **no cancel at all**; the second came back `arenaBusy` and the
  reader got a refusal instead of a fight. Three rapid presses hit the same hole in a
  second shape: two waiters released by one `cancelled` refusal both resumed past a
  test that had been true when they took it, posted two starts, and the middle
  promise never settled — so its `finally { refreshPicker() }` never ran either.
  Both are reachable from the page: `arena.ts` leaves [Fight] enabled during a
  recording on purpose, and `review(matchup({policy:"learned"}), "live").refusal` is
  now `null`.

  The fix is a claim taken synchronously before the first `await` and re-checked on
  every wake, with a gate armed at the same moment rather than when the start is
  posted; a press superseded before it posts anything is refused rather than queued,
  because a reader who pressed [Fight] three times wants the third fight and not all
  three in order. The test now drives both shapes, and on the unfixed code it hangs —
  which is the defect stated as sharply as it can be, since a promise that never
  settles is exactly what the page showed as "Recording..." forever.
- `the_arena_client_transfers_its_configuration_and_reports_progress`,
  `the_learned_policy_fetches_its_checkpoint_and_says_so_when_it_cannot`,
  `a_second_recording_while_one_runs_is_refused_as_busy`,
  `a_game_session_and_an_arena_recording_refuse_to_share_one_worker`,
  `an_arena_recording_is_refused_inside_a_v2_game_session`,
  `an_arena_refusal_names_what_the_module_refused`,
  `a_refused_checkpoint_stops_the_recording_and_names_the_file`,
  `an_installed_checkpoint_is_named_in_the_recording`,
  `the_arena_configuration_round_trips_through_its_own_bytes`,
  `the_shipped_arrangement_carries_the_dimensions_the_spec_document_states`,
  `a_legacy_v1_session_is_accepted_and_refused_the_arena_kinds`,
  `a_session_cannot_mix_protocol_versions`, `a_v2_session_answers_in_v2`.

### Decisions this file did not anticipate

- **Five buffers, not three, and seven index words, not four.** The regions from
  v2-ui-06 are a fourth section and the two faction health fractions are a fifth, and
  the index carries the **tick** as its first word. That last one is the index's own
  argument applied to itself: the tick happens to equal the frame position today,
  because the drive captures after every step and stops the moment a step advances
  nothing — and "happens to equal" is precisely the arithmetic an index exists to stop
  a reader doing.
- **`ArenaRejectReason` is a separate union from `RejectReason`.** This file asked for
  four more `RejectReason` values. That union is a command acknowledgement's field and
  every value in it names something the command queue does; carrying both would
  type-check a `commandAck` that said `arenaBusy`, which is a state the command path
  cannot be in. Six values: `wrongModel`, `unknownLayout`, `invalidArenaConfig`,
  `arenaBusy`, plus `checkpointRefused` and `cancelled`, which the plan's list had
  nowhere to put.
- **Two columns are assembled rather than copied, and both are written down as
  such.** No export answers `World::health_fraction` or `World::outcome`. The health
  fractions are that function's own arithmetic over the legacy frame's published
  `UnitView::hp` and `max_hp` — both `Fx` raws under 2^24, so they cross as `f32`
  without losing a bit — with the denominator taken from the first frame, because
  `health_fraction` totals the maxima of every unit alive or dead and a dead body has
  no row. The outcome is `World::outcome`'s three-line table over the published alive
  counts, falling through to `World::timeout`'s comparison. **These are derivations,
  and the repository's argument against derivations applies to them.** What holds them
  honest is that `a_live_fight_matches_the_traced_fight` compares both against the
  simulation's own answers for every tick of two whole fights, one of which ends in a
  kill. An export would remove them and should; it belongs to a session that may touch
  `crates/web`, which this one may not.
- **`combat-specs.md` is mirrored into `client/src/runtime/arena-config.ts`.** The
  120-byte buffer needs a mass, a balance and three dimensions per hand, and the
  panels need five anatomy scalars — none of it exported, none of it generated. The
  table is copied by hand from that document's fixture block as `Fx::from_ratio`
  ratios rather than as products, so a wrong *rounding* rule fails rather than
  reproducing itself. What catches a drift is not a compile error but a comparison,
  and there are two of them.

  **This bullet said "one raw unit wrong and the two sources diverge inside a hundred
  ticks", and that is wrong for the example the file's own comment names.** Measured
  by driving the shipped arrangement twice against the release wasm, `composed` on
  both sides at seed 3, with one scalar of the sword bumped by a single raw unit:

  ```text
  mass    +1   first differing pose word at frame  432, first body position at 2402
  balance +1   first differing pose word at frame  483, first body position at  483
  length  +1   first differing pose word at frame    0, first body position at  423
  radius  +1   first differing pose word at frame  422, first body position at  423
  ```

  A *dimension* is geometry the first publication already carries, so it moves on
  frame 0 and the sentence is true of it. A mass is a term in a solve nothing has run
  yet: seven seconds of fight before a word moves and forty before a body does. What
  catches a wrong mass **at once** is the header — every scalar in the table reaches
  both the 120 bytes and the recording's per-body `carried` block, and
  `a_live_fight_matches_the_traced_fight` compares that block against the trace's
  before it reads a single frame. The whole fight is the second net and it is the one
  worth having, because it is what catches a wrong rounding rule, which a header
  comparison would agree with by construction.
- **The `/fight.json` fallback on mount is kept.** This session nearly removed it — a
  route whose [Fight] runs the fight has no need to open on an 8 MB fetch that 404s in
  a shipped build — and the reason it stays is that a development tree that has run
  `npm run trace` opens on a recorded fight, and a recording is the only source with
  contact velocities and impulses in it. What changed is what the *absence* says.
- **Four columns are null on the live path rather than zero**, and `Contact` now types
  them that way: `velocityA/B`, `impulseA/B` and the group `alpha`. A zero closing
  speed is a measurement — two colliders that met while moving together — and a reader
  cannot tell it from an absence. The readout prints `closing: not published`. A fifth
  gap is `Pose.target`: `POSE_INTENT` publishes the discriminant only, so a live fight
  can say a body is attacking and not who.
- **`RECORDING_EVENT_ROW_CAP` is 32,768 rows**, and it was 16,384 on a corpus that was
  understated by a factor of two. The first one drove seven two-fighter configurations
  and found 4,948 rows at its busiest — two Brutes holding a club in each hand, **two
  units apart**. That is the flaw: the picker cannot move a spawn. `SHIPPED_SPAWNS`
  reaches `Scenario::fingerprint`, so every fight a reader can ask for starts where
  `DuelConfigV1::shipped()` puts it, and a corpus whose busiest cell is unreachable
  from the controls is not a corpus for this cap.

  Re-recorded over picker-reachable loadouts at the shipped spawns — both anatomies on
  both sides, every hand pairing in which both hands are full, five seeds, every
  policy pairing that fights; 406 cells against the release wasm under Node:

  ```text
  10130 rows  ticks 3600  max/tick 16  brute,brute  sword,sword|sword,sword  windmill/windmill  seed 3
   9664 rows  ticks 3600  max/tick 16  brute,brute  sword,sword|sword,sword  attack-moves/windmill  seed 17
   9183 rows  ticks 3600  max/tick 16  fighter,fighter  sword,club|sword,club  windmill/windmill  seed 3
   8674 rows  ticks 3600  max/tick 13  brute,brute  shield,sword|sword,club  windmill/windmill  seed 3
  busiest single tick: 20   (fighter on brute, sword,club|sword,club, windmill/windmill, seed 3)
  the shipped arrangement: 1491 composed/composed, 1743 composed/windmill, 2195 learned/windmill
  ```

  The rule takes 10,130 to 20,260 and rounds to 32,768 — 4,194,304 bytes reserved in
  worker JavaScript, sliced to the live length before transfer. **Nothing truncated at
  either value**, since 10,130 fits under 16,384 as well, so this move buys headroom
  and honest provenance rather than data a reader was losing; that is worth saying
  plainly, because "the number was wrong" and "the recording was wrong" are different
  sentences. The pose and region extents need no cap: an arena is two fighters by
  construction. The three shipped-arrangement figures the old note quoted were right
  and are reproduced above.
- **The drive yields every 300 ticks** and posts `arenaProgress`. A worker services no
  message while JavaScript is on the stack, so a single uninterrupted 3,600-tick loop
  would be a recording nobody could cancel.
- **`vite.config.ts`'s `/web.wasm` handler now sets `Content-Length`**, which it never
  had and which the room-asset handler twenty lines below has always set. Without it
  the response is chunked, a keep-alive client cannot know the body ended until the
  socket does, and Node's global `fetch` agent holds that socket open — so
  `vite_dev_serves_the_studio_shell_its_game_route_and_the_wasm_from_the_web_root`
  passed while the *process* failed to exit, on about half its runs. Measured before:
  four attempts, two hung to the timeout. After: six for six in about 1.3 s. The flake
  predates this session and was found by running `npm run test:worker` enough times to
  hit it; it is fixed here because `npm run test:worker` is one of the commands this
  session is verified with, and a verification command that reports a failure the
  tests did not have is worse than no verification at all.

### What this file asked for and did not get

- **"By hand: change one shield dimension in the picker, press [Fight] twice."** Not
  done, and it is not doable from this session's file set rather than skipped. The
  picker's markup is `web/index.html`'s `<template id="route-arena">`, which offers an
  anatomy, two hands, a policy and a seed and **no dimension control at all**;
  `web/**` is outside this session. Everything under the control is built and tested —
  `arena_config` carries five dimension words per hand, `encodeArenaConfig` writes
  them, the recording header reports what was sent, and
  `the_arena_configuration_round_trips_through_its_own_bytes` covers the encoding — so
  what is owed is one `<input>` per dimension and a line in `readMatchup`. The half of
  the check that *is* doable was done: pressing [Fight] twice on the same
  configuration produces the same fight, which
  `a_live_fight_matches_the_traced_fight` proves against a third, independent one.
- **A `SimClient`-shaped API.** `ArenaClient` is deliberately much smaller: no epochs,
  no leases, no command queue, no clock. The arena has one request in flight at a time
  and one answer.

### Everything that ran

The second column is the state after the adversarial review's findings were fixed; the
first landing's counts are in brackets where they differed.

```text
npm run check                                                 clean
npm run build                                                 pass; one wasm-instantiating chunk, dist/checkpoints/v2-probe.ckpt
npm run test:worker                                           64 pass  (was 62; two new)
npm run test:wasm-memory                                      6 pass; 242 and 223 pages, both fixtures agree
cargo test                                                    all green
cargo build --release --target wasm32-unknown-unknown -p web  (before wasm_check)
node --test tools/wasm_check.js                               28 pass
node tools/check_docs.js                                      pass
cargo run --release -p lab -- hash                            0xfe31370e141ef531
node --test client/test/render-contract.test.mjs              78 pass
node --test client/test/studio-shell.test.mjs                 14 pass  (was 10 pass, 3 fail)
crates/learn/tests/allocation.rs, 40 runs of the binary       0 failures  (was 1-2 in 30)
```

The two trace fixtures the differential oracle reads:

```powershell
cargo run --release -p lab -- trace --seed 3 --out web/fight.json
cargo run --release -p lab -- trace --policy learned --checkpoint checkpoints/v2-probe.ckpt `
    --opponent windmill --seed 3 --out web/fight-learned.json
```

### What the adversarial review found inside this session's file set

Twelve findings, in the review's own order of severity. The three above — the picker
tests, the import guard and `allocation.rs` — are the ones it filed as outside the
original file set and are recorded in the next section. These are the rest.

1. **`ArenaClient.run` raced itself.** The critical one, written up under
   `a_second_fight_cancels_the_first_and_waits_for_its_refusal` above. Two presses of a
   `learned` matchup posted two starts and no cancel; three rapid presses posted two
   starts and left the middle promise unsettled forever.
2. **`RECORDING_EVENT_ROW_CAP`'s corpus was understated.** Re-recorded; see the
   decision below.
3. **"The studio displays it" was unasserted.** `arena.ts:238` was the only place
   `truncated` reached a reader and no test built a header with it set, so the line
   could be deleted with every suite green.
   `a_truncated_recording_says_so_where_a_reader_can_see_it` in
   `studio-shell.test.mjs` mounts the route, settles a truncated fixture and reads
   `#status`; deleting the line fails it.
4. **The import guard** — next section.
5. **`crates/learn/tests/allocation.rs`** — next section.
6. **Stale `#L` anchors this session created.** `worker-protocol.md`'s source-anchor
   list named `sim-worker-host.ts#L35`, `sim.worker.ts#L64` and `snapshot.ts#L57` for
   symbols that this session's diff had moved to L55, L81 and L59; this file cited
   `messages.ts#L109` for `decodeClientMessage`, now L261, and
   `crates/web/src/lib.rs#L4679` for a clearing that happens at `:2960` and `:3405`.
   All corrected, and the anchor list now says in place that `check_docs.js` validates
   only that a line number is inside its file — an anchor is a hint, not a contract.
7. **The account of the three `studio-shell` failures** — next section.
8. **Two comments argued for a property the code does not have.**
   `messages.ts`'s `frameCount` said it "Equals `ticks` unless a cap was hit", which
   is exactly backwards: it is `ticks + 1` normally and less than that only when a cap
   was hit, which is what `the_index_survives_a_death`'s 3,340 against 3,339 says. And
   the `combat-specs.md` mirror's divergence claim, corrected with its measurement in
   the decision below. A third, smaller one went with them: the `index` buffer's own
   comment said "six words a tick" beside a `RECORDING_INDEX_STRIDE` of seven.
9. **`spectator: true` was declared, typed, asserted and read by nothing.** A
   recording claiming `spectator: false` was accepted and rendered identically, so
   the reason travelled with the data and was never consulted — which is
   documentation with a type on it, not a gate. `decodeArenaMessage` refuses it at
   the protocol boundary and `LiveFightSource`'s constructor refuses it at the
   consumer, both on exact `true` rather than on truthiness.
10. **The session-version rule had a hole in the pre-decoder `returnSnapshot`
    branch.** A V1 `returnSnapshot` carrying an out-of-range buffer id into a V2
    session was answered `invalidBufferId`, non-fatally, because the buffer-id check
    ran ahead of the decoder and therefore ahead of `sessionVersion`. Non-mutating,
    which is why it was low severity and not why it was acceptable:
    `worker-protocol.md` says a session is one version for its whole life.
    `a_session_cannot_mix_protocol_versions` now covers both that case and a
    malformed *first* message, which opens no session and is answered in the version
    the caller wrote down.
11. **`ArenaClient` ran no decoder while `worker-protocol.md` said it did**, casting
    `raw as FightRecordingMessage` where `SimClient` has had `decodeWorkerMessage`
    since v2-ui-02. The failure a cast lets through here is not a `TypeError`: a
    missing field makes every index in `LiveFightSource` answer `undefined` and a body
    decode as garbage. `decodeArenaMessage` now judges all five kinds this client
    answers, and `LiveFightSource` bounds-checks every index extent against the buffer
    it addresses — `subarray` clamps rather than throwing, so an out-of-range start is
    silent garbage rather than an exception.
12. **The measurement used the statistic `AGENTS.md` warns against** and its bound did
    not reproduce. Re-measured; see below.

### Found wrong outside this session's file set, and since fixed

Each of these was recorded when this session landed and left for an owner. The
adversarial review's pass then found that two of the three accounts were themselves
incomplete, and all three are now repaired in place.

- **`client/test/studio-shell.test.mjs` had three failing tests, and the account of
  them named two of the three causes.** Re-running every assertion inside those three
  tests individually gives **eleven** failures, and one of them —
  `recorded.notes[0]` matching `/fight-learned\.json/`, twice — was not disclosed at
  all. `picker.ts`'s *recording*-mode note used to name that file; this session's own
  diff replaced it with the digest sentence, so the word "precisely" in the original
  account was wrong by one cause. All three tests are fixed:
  - `learned_is_refused_for_a_live_fight_and_explained_once_for_a_recorded_one` is now
    `learned_runs_live_and_is_noted_once_because_it_is_the_one_policy_that_fetches`.
    A test name is a sentence, and that one had come to say the opposite of what it
    checked. It asserts that no policy is `live: false`, that `learned` is the only
    one with a `fetches` field, that a live review is a note naming
    `/checkpoints/v2-probe.ckpt` rather than a refusal, and that a recording review's
    note is about the digest.
  - `a_missing_recording_names_the_command_that_would_make_one_or_says_none_would`
    and `a_recording_mismatch_describes_what_is_on_screen_rather_than_what_was_picked`
    matched `/v2-ui-07/` against prose that named this session as future work. They
    now match the sentences that replaced it — "Press Fight to run this pairing live
    instead" and "Press Fight to run the one they describe" — and assert `/v2-ui/`
    appears nowhere, so the prose cannot quietly acquire another session's name.
- **`the_arena_and_the_fight_modules_reach_neither_the_worker_nor_the_wasm` passed for
  the wrong reason, and it missed two more reaches than the one disclosed.** The rule
  was `/^import[^\n]*(?:sim\.worker|runtime\/sim-worker-host|protocol\/abi)/m`, per
  line and anchored at `^import`:

  | file | import | why it was missed |
  |---|---|---|
  | `client/src/arena/arena.ts` | `../runtime/sim-worker.js` | the alternative is `sim\.worker` — a literal **dot**; the module is `sim-worker.ts` |
  | `client/src/fight/live.ts` | `../protocol/abi.generated.js` | a multi-line block whose `from` line does not start with `import` |
  | `client/src/fight/live.ts` | `../runtime/arena-recorder.js` | not in the alternation at all, and that module imports `protocol/abi.generated` |

  The second was disclosed; the other two were not, and the first is the **worker**:
  `runtime/sim-worker.ts` contains nothing but
  `new Worker(new URL("./sim.worker.ts", import.meta.url))`, so the test whose name
  says the arena reaches neither the worker nor the wasm was passing because a file
  had been named with a hyphen. Running both regexes over the two real files:

  ```text
  client/src/arena/arena.ts   old rule matches: false   new rule finds: ../runtime/sim-worker.js
  client/src/fight/live.ts    old rule matches: false   new rule finds: ../protocol/abi.generated.js,
                                                                       ../runtime/arena-recorder.js
  ```

  **This is the third architecture rule in this series enforced by scanning source
  text that passed while being broken** — the others are a dependency test matching
  `path = "../` byte-exactly and a bundle assertion reading one `<script src>`. The
  rewritten rule extracts every module specifier, from `from "…"` clauses wherever
  they sit and from dynamic `import("…")` too, and judges the *specifier*. Two
  modules are refused outright with no exception possible, `sim.worker` and
  `sim-worker-host`, because those are the ones that instantiate and drive the wasm.
  The rest are allowlisted **by file and by specifier with the reason**, and the
  allowlist is asserted exact rather than as a ceiling: an entry nothing uses fails,
  so an exception granted for an import that has since moved cannot be inherited by
  the next one. The half of the original reason that is load-bearing still holds and
  is what the exceptions rest on — `npm run view` with no wasm build opens `#/arena`,
  the worker is constructed lazily inside `onFight`, and a trace plays with no wasm on
  the machine.
- **`crates/learn/tests/allocation.rs` was a real race, about 7% a run, and the
  file's own comment named the cause.** Thirty runs of the compiled binary reproduced
  it. `allocations_during`'s comment said "the gate is a process-wide flag, so a
  second test allocating on another thread while this one is open would be counted
  here. That is why this file holds exactly one test" — and v2-ui-08 added a second
  test, which libtest runs on a second thread. The gate and the counter are now
  `thread_local!` `Cell`s with `const` initialisers, so only the measuring thread is
  counted and the comment's claim is true again. A `Mutex` was considered and
  rejected: the window it leaves is real, because libtest's bookkeeping for the test
  that just released the lock allocates on *its* thread while the next one measures.
  Forty runs of the rebuilt binary: zero failures.

  `Cell<usize>` and `Cell<bool>` are `Copy` with no `Drop`, which is what makes a
  `thread_local!` safe to touch from inside `GlobalAlloc` at all: with a `const`
  initialiser and no destructor to register, the access is a plain thread-local read
  and cannot re-enter the allocator.
- **`docs/architecture/browser-runtime.md`** fails `check_docs`'s v2-term rule on a
  line that is a concurrent session's uncommitted work — the same problem v2-ui-08
  recorded at `:142`, now at `:144` because this session added two lines above it. The
  sentence saying `#/arena` "touches neither wasm nor the Worker" *was* this session's
  to fix and is fixed.
