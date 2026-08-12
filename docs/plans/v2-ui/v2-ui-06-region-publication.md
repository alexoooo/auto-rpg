# v2-ui-06 — publishing the capsules the contact phase sweeps

**Goal:** put the five anatomy capsules on the wire, so a live fight can be drawn from
published geometry rather than from a reconstruction of it.

**Depends on:** `v2-ui-05` (an articulated fight that actually runs in wasm).

**Golden expectation:** **`ARTICULATED_STREAM_DIGEST` moves.** Predicted here, in
writing, before the run. Nothing else moves.

## The gap

`POSE_STRIDE = 66` carries the body point and yaw, both hands with their velocities and
commanded targets, both weapon segments, the shield face, integrity, wound, blood,
shock, the severed and equipment masks, intent and hints. It carries **no regional
capsules**.

The trace has them.
[`crates/lab/src/trace.rs:161`](../../../crates/lab/src/trace.rs#L161) calls
`sim::body_region_volumes` — the same function the contact phase sweeps — and the module
header says why in as many words: a viewer that rebuilt a shoulder from an anatomy row
would be a second answer to a question the simulation has already answered.

So `[Geometry]` mode, which *is* the capsules, works on a trace and has nothing to draw
on a live fight. There are three ways out and only one of them is consistent with the
rule above.

| | approach | verdict |
|---|---|---|
| a | publish anatomy once, port `body_region_volumes` to TypeScript | **rejected** — it is exactly the mirror `trace.rs` refuses, and it would drift silently |
| b | publish the capsules as a third fixed section | **taken** |
| c | draw hands, weapons and shield only, no body | rejected — a fight with no bodies in it |

(a) is the cheap one and worth naming so it is refused on the record rather than
rediscovered as an idea. The function is not trivial — the head is a degenerate capsule
whose extent comes from `radius` while `AnatomyRegionSpec::half_height` is dead for that
region — and a TypeScript copy would be right on the day it was written and wrong the
first time the anatomy changed, with nothing to catch it.

## The shape

A third publication written by `publish()` from `sim::body_region_volumes`, beside the
pose and combat-event sections and following their conventions exactly: fixed capacity,
`REGION_*` field offsets emitted by `crates/web/src/bin/emit_abi.rs`, its own
`REGION_LAYOUT_VERSION`, its own dropped counter.

**Present-ness must be published, not inferred.** `body_region_volumes` takes a
`present` argument and a severed limb stops existing; a reader that inferred absence
from a zero capsule would drop a region that legitimately has coincident endpoints — the
head, on every body, on every tick.

**Eight words per region** — lower point, upper point, radius, present — five regions
per body, and `MAX_POSES` bodies to match the pose section: `64 x 5 x 8 x 4` = 10,240
bytes reserved, of which a two-body fight fills 320.

*This file first said seven words and then required present-ness to be published,
which is a contradiction; the arithmetic above is the resolution and the reasoning is
recorded in [`articulated-abi.md`](../../reference/articulated-abi.md#region-rows).*
Presence rides as an **eighth word per region** rather than a per-body mask or a
reader-side derivation from the pose row's severed mask. The mask would save 1,024
bytes and cost two rules at once: the row would stop being `sim::RegionVolume`'s four
fields, and the column list would stop being exactly `0..STRIDE`, which is the shape
`generated_presentation_offsets_cover_every_packed_column` asserts for every packed row
in this ABI. The reader-side derivation is free and correct today — the sim's `present`
argument *is* the severed mask — and is refused on this session's own argument: it is a
re-derivation on the reader's side, and the day presence stops being exactly "not
severed" the two answers part company silently, with a viewer drawing a capsule the
contact phase does not sweep. The eighth word costs 1,280 bytes.

## The pin, and why this is its own session

[`docs/reference/hashes.md`](../../reference/hashes.md) on
`ARTICULATED_STREAM_DIGEST 0x54c0762b3dfb7a05`: it is *"owned by whoever owns the row
layouts, and a layout change moves it and must say so"*, and it is FNV-1a-64 over the
published pose and combat-event words of a twenty-tick scripted fight. A third published
stream is a change to the published set. **It moves.**

That is the entire reason this is a session and not a paragraph inside `v2-ui-05` or
`v2-ui-07`. The registry's rule is that a pin may move only when predicted in writing
first and explained afterwards, and a move budgeted alone is one whose cause is not in
doubt. Bundled with the driver port, a moved digest would have two candidate
explanations and no way to separate them.

What must **not** move, and what says so:

- `FRAME_LAYOUT_VERSION` stays at 7. `docs/reference/frame-abi.md` states that the pose
  and combat-event publications are not sections of the frame and that the handshake
  applies to each ABI separately. A third such publication is the same kind of thing.
- `POSE_LAYOUT_VERSION` and `COMBAT_EVENT_LAYOUT_VERSION` stay at 1. This session adds a
  section; it does not touch a row. **Do not** be tempted to fold the capsules into the
  pose row instead — that would move `POSE_LAYOUT_VERSION` as well, for no gain, and
  would make every pose row 62% wider for data that is constant across most of a fight.
- The combat spec-table digest and the `articulated-duel-v1` fingerprint. Nothing in
  `sim` changes.

`SNAPSHOT_BUFFER_BYTES` and every new `emit_abi` constant are **regenerated with
`npm run generate:abi`, never hand-edited**;
`snapshot_offsets_are_aligned_non_overlapping_and_cover_every_fixed_buffer` exists to
catch a region reserved without an offset. *(It lives in
[`crates/web/src/bin/emit_abi.rs`](../../../crates/web/src/bin/emit_abi.rs), not in the
client tests as this line first said — it is a test on the generator rather than on
what the generator emits.)*

## The handshake, and a stale sentence to fix

`AGENTS.md` calls the frame ABI a four-file handshake. Its own canonical
`docs/reference/frame-abi.md` lists five obligations across six files: `crates/web/src/
lib.rs`, `web/main.js`, `tools/wasm_check.js`, `crates/web/src/bin/emit_abi.rs` →
`client/src/protocol/abi.generated.ts` plus `client/src/state/snapshot.ts`, and
`frame-abi.md` itself. The "four" predates the v2 client split. Correct it here, since
this is the session that follows the handshake.

## Verification

```powershell
npm run generate:abi
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_abi.js
node tools/check_docs.js
cargo run --release -p lab -- hash
```

- **The digest moves once, to one value, and native and wasm agree on it.** A one-sided
  move means target disagreement, not a layout change, and must be investigated rather
  than re-pinned.
- `the_published_capsules_are_the_swept_capsules` — for a fight run both ways, every
  published region equals `sim::body_region_volumes`' output for that tick, exactly. Not
  approximately: these are raw fixed-point words copied from one call.
- `a_severed_region_is_published_absent`.
- `the_head_capsule_is_published_degenerate_and_present` — the specific case a reader
  inferring absence from geometry would get wrong.
- Re-pin `ARTICULATED_STREAM_DIGEST` in both owners — `crates/web/src/lib.rs` and
  `tools/wasm_check.js` — and add a registry row in `docs/reference/hashes.md` recording
  the old value, the new value, and that the cause was a third published section.

## Decision

Record `pass`, `revise` or `stop`. State the old and new digest, both targets agreeing,
and confirm `FRAME_LAYOUT_VERSION`, `POSE_LAYOUT_VERSION` and
`COMBAT_EVENT_LAYOUT_VERSION` are unmoved.

## How v2-ui-06 closed

**`pass`.** The five swept capsules per body are on the wire as a third fixed
publication, written by `publish()` from `sim::body_region_volumes` — the same function
the contact phase sweeps and the same one `lab trace` calls. Exactly one pin moved, and
it is the one predicted.

### The digest, moved once, to one value, both targets agreeing

| | value |
|---|---|
| old | `0x54c0762b3dfb7a05` |
| new native | `0xf7d3a9c73aa59981` |
| new wasm | `0xf7d3a9c73aa59981` |

Native from `cargo test -p web -- --ignored --nocapture print_the_articulated_stream_digest`;
wasm from `node --test tools/wasm_check.js`, which prints
`stream digest  0xf7d3a9c73aa59981  == native`. Re-pinned in both owners —
`crates/web/src/lib.rs` and `tools/wasm_check.js` — and the move is recorded in the
[registry row](../../reference/hashes.md#golden-registry) with its old value, its new
value, and its cause.

It moved by **extension, not reordering**: the region length, drop count and words are
appended after the event words of each tick, so the pose-and-event prefix of all twenty
ticks is byte-identical to what v2-16 pinned. The shape printer confirms the fight
itself did not move — ticks 0, 1, 2 and 4 resolve nothing, 3 and 5 resolve two rows,
every tick from 6 resolves one, two pose rows throughout — with ten region rows now
beside each.

### Nothing else moved

`FRAME_LAYOUT_VERSION` is **7**; `POSE_LAYOUT_VERSION` and
`COMBAT_EVENT_LAYOUT_VERSION` are **1**. This session added a section and touched no
row. `cargo test -p web -- --ignored --nocapture print_the_golden_hashes` prints
`ROOM_HASH 0x98441a18db7a95ca`, `BATTLE_HASH 0x9aafe4bd54560586`,
`SWAP_HASH 0xf948f5486ee90191`, `BOW_HASH 0x4a1157735d305e9f`;
`cargo run --release -p lab -- hash` prints `0xfe31370e141ef531`. `GOLDEN_STATE_HASH`,
`COMBAT_GEOMETRY_HASH`, `ARTICULATED_COMMAND_HASH`, `CONTACT_BEHAVIOR_DIGEST`, the
combat spec-table digest `0x78e5b57ae0c6bbd6`, the `articulated-duel-v1` fingerprint
`0x068d05fcada1027b`, the contact format corpus and the legacy feature prefix are all
asserted by tests that pass. **No `ARTICULATED_HASH` was created.**

### Where present-ness rides

An **eighth word per region**, `REGION_PRESENT`. The section above records the
arithmetic and the two rejected placements; the short version is that the row is then
`sim::RegionVolume`'s four fields exactly, the column list stays `0..REGION_STRIDE`
like every other packed row in this ABI, and a reader is never asked to re-derive on
its own side something the sim already answered.
`the_head_capsule_is_published_degenerate_and_present` is the test that proves a reader
cannot get it wrong, on both sides of the wall: natively it checks a live head's
coincident endpoints and its `present` word, then flips the mask on a hand-built pose
and shows the two publish seven identical words differing only in the eighth;
`tools/wasm_check.js` checks the same facts about the module's own rows.

### The byte cost, and the budget assertion

**10,240 bytes**, `MAX_POSES * REGIONS_PER_BODY * REGION_STRIDE * 4` = `64 * 5 * 8 * 4`.
The publication budget assertion in `crates/web/src/lib.rs` gained a third term and
moved from `279_040` to **`289_280`** — 3.7% on top of the two v2-16 arrays. The
eighth word is 1,280 of the 10,240.

`SNAPSHOT_BUFFER_BYTES` is untouched at 27,452 and no snapshot region was reserved:
`snapshot_offsets_are_aligned_non_overlapping_and_cover_every_fixed_buffer` exists to
refuse a reservation without a consumer, and the consumer is v2-ui-07. `emit_abi` emits
`REGION_LAYOUT_VERSION`, `REGION_STRIDE`, `REGIONS_PER_BODY`, `MAX_REGIONS` and all
eight column offsets regardless, because those are the ABI.

### Two things the plan did not anticipate

**The host has to keep the anatomy, and it is a fixed array because a `Vec` was
measured and rejected.** `sim::body_region_volumes` needs a `&BodyAnatomySpec` and
`World` resolves its own privately, so `Sim` holds the row each spawn slot was built
with — `crates/lab/src/trace.rs`'s table, for `trace.rs`'s reason, on `trace.rs`'s
assumption that a slot indexes the unit that spawned into it. Written as a roster-sized
`Vec` it is one more heap allocation on a path that holds two whole worlds at once, and
it moved the peak: `the_browser_contact_warmup_does_not_grow_wasm_memory` sat at 221
pages through warm round ten and stepped to 245 on round eleven, past the nine that
fixture warms. A fixed `MAX_POSES`-wide array reserved with the rest of the `Sim`
settles it back at 221 with no round bumped, which is the discipline `route`, `events`
and `combat_events` are each allocated at their ceiling for. The static region array
itself moved neither page count.

**The section carries no identity and is read against `pose_len`.** Region row `n`
describes pose row `n / REGIONS_PER_BODY`; repeating two identity words five times a
body would be a second answer to a question the pose row already answers. The contract
a reader checks is `region_len == REGIONS_PER_BODY * pose_len`, asserted natively by
`the_region_section_covers_every_published_pose` across a Legacy world, both articulated
openings and four descents, and in `wasm_check.js` beside the pose grammar.

### Everything that ran

```text
npm run generate:abi                                          SNAPSHOT_BUFFER_BYTES unmoved at 27,452
cargo test                                                    all green (115 in -p web)
cargo build --release --target wasm32-unknown-unknown -p web   (before wasm_check)
node --test tools/wasm_check.js                               22 pass
node tools/check_abi.js                                       generated ABI matches Rust layout
node tools/check_deps.js                                      pass
node tools/check_docs.js                                      pass
cargo run --release -p lab -- hash                            0xfe31370e141ef531
cargo test -p web -- --ignored --nocapture print_the_golden_hashes
node --test client/test/wasm-memory.test.mjs                  3 pass, 241 pages, unmoved
npx tsc --noEmit                                              clean
```

The four tests this session owns: `the_published_capsules_are_the_swept_capsules`,
`a_severed_region_is_published_absent`,
`the_head_capsule_is_published_degenerate_and_present`, and
`the_region_section_covers_every_published_pose`. The severance is a live one — the
shipped anatomy needs longer than a test wants, so the fixture makes every regional
maximum a 256th and the documented clinch takes an arm off at tick 85.

### What an adversarial review changed

A reviewer was asked to refute rather than summarise and found no correctness bug, but
three gaps worth closing and a handful of comments this session had made false:

- **The `None` arm's region wipe was deletable with nothing failing.**
  `init_articulated_fails_closed_and_installs_nothing` refused an install over a
  *Legacy* room, which writes none of the three buffers, so every assertion in it was
  about arrays that were already zero. It now refuses a second time over an
  articulated room and reads all three buffers rather than their three lengths.
  Verified by mutation: deleting `REGIONS…fill(0)` fails it, and hardcoding
  `REGION_PRESENT` to `1` fails two of the region tests.
- **The one fixture that reaches the region cap never checked it.** The 64-body
  `abi-high-water` corpus lands on 320 region rows exactly, by the same construction
  that puts it on the pose cap, and it is the only place in the repository where the
  region drop arithmetic runs at the boundary.
  `the_high_water_corpus_fills_at_most_half_the_event_buffer` now asserts it, and the
  `#[ignore]`d printer beside it reports the three region counters.
- **The slot map was assumed and not checked.** `anatomy[index]` is the unit that
  spawned into that slot only because `World::try_new` spawns in order and no export
  walks an articulated body in afterwards. Neither the length comparison nor the word
  comparison can tell a correct slot map from a permuted one, so
  `the_published_capsules_are_the_swept_capsules` now checks each published body's
  `kind` and `faction` against `scenario.units[index]` — which is exactly what
  `crates/lab/src/trace.rs` does per row, and it was the one line this session copied
  the table without copying.

The corrected claims: a skipped body **does** shift the rows after it (one cursor, a
dense section) — the length comparison is the reader's protection, not a nicety, and
three places said otherwise; `Sim::anatomy` is written in three production places and
the field doc listed two; the budget assertion charges the three published arrays and
not `Sim::anatomy`'s ~15 KB, which is now said out loud; and the digest's leading
definition still called it a two-section stream in `lib.rs`, `wasm_check.js` and
`hashes.md`.

**One known-stale prose copy is deliberately left**: `client/test/wasm-memory.test.mjs`
still says "the 279,040 bytes of pose and event array, which is 5 pages" and calls them
"v2-16's two publications". It carries no assertion, and that file was out of this
session's scope; v2-ui-07 owns it, since it is the session that extends those retained
views to `REGIONS`. The correct figure is recorded in `articulated-abi.md`.

`docs/architecture/browser-runtime.md` needed its three `#L` source anchors into
`crates/web/src/lib.rs` renumbered — line numbers only, no prose — because this session
moved the lines they point at and `check_docs` verifies the symbol under each one.
`docs/reference/hashes.md`'s anchors were renumbered for the same reason.
