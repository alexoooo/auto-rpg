# v2-16 — publish bounded articulated observations, poses, and events

**Status: complete (2026-08-10).** Measured on the whole tree as it stands: `cargo test`
707 passed / 0 failed / 8 ignored; `cargo run --release -p lab -- hash` →
`0xfe31370e141ef531`, unmoved; `verify --seeds 200` identical on re-run and exact on
replay; `duel --seeds 400` unchanged at a 59.5% win rate; `node --test
tools/wasm_check.js` 21/21; `node --test client/test/wasm-memory.test.mjs` 3/3, and 38
consecutive settled-tree runs of that file after an adversarial reviewer reported it
flaky against a tree another agent was still writing; `node tools/check_docs.js`, `npm
run check`, and `git diff --check` clean. No pinned hash moved.

Two numbers this file originally fixed did move, each through a route the plan itself
provides. `MAX_COMBAT_EVENTS` is **1024**, not 256: the mandatory high-water corpus
accumulated 446 rows, 3.5× the ≤128 acceptance bar, so the capacity was rejected and
raised to the next power of two at least twice the maximum. And the pose/event snapshot
regions were **reverted** after review — `SNAPSHOT_BUFFER_BYTES` is back to 27,452, and
they arrive with the visibility-filtered copy in `v2-17` rather than growing a
per-publication zero-fill 6.4× ahead of any reader.

**Goal:** land the subject-scoped observation, policy seam, submitted-command host
entry, and fixed pose/event streams specified by
[`articulated-abi.md`](../reference/articulated-abi.md).

**Depends on:** `v2-11` and `v2-15`. It does not depend on the presentation track.

**Golden expectation:** every legacy hash and the legacy frame ABI remain unchanged.
**Met.** `LAB_HASH`, `ROOM_HASH`, `BATTLE_HASH`, `SWAP_HASH`, `BOW_HASH`,
`GOLDEN_STATE_HASH`, `ARTICULATED_COMMAND_HASH`, `COMBAT_GEOMETRY_HASH`,
`CONTACT_BEHAVIOR_DIGEST` and the contact format corpus are all byte-identical, and
the frame's version, header length and three strides did not move. The session added
two pins of its own -- `ARTICULATED_STREAM_DIGEST` and the legacy feature prefix -- and
neither is `ARTICULATED_HASH`, which v2-17 still solely owns.

## Observation and policy

**Landed (2026-08-10).** `World::observe_articulated`
(`crates/sim/src/world.rs`) and the types in `crates/sim/src/obs.rs` are in;
`FEATURE_LAYOUT_VERSION` is 12, `ARTICULATED_FEATURE_COUNT` is 472 and `FEATURE_COUNT`
is 922, with `LEGACY_FEATURE_COUNT = 450` named so the frozen prefix has a word. No
hash moved.

**Measured cost, and it is not zero.** `Observation` embeds the 2032-byte block by
value and grew from 1196 to 3228 bytes, so every observation copies it twice and
`write_features` zero-fills a vector twice as wide -- on a Legacy world as much as an
articulated one. `cargo run --release -p lab -- bench --seeds 2000`, pinned to logical
CPU 0 at high priority, best of three: **207,559 ticks/s before, 194,429 after (-6.3%)**;
wall 22.81 s against 24.35 s. Fitness was bit-identical across all 2000 rollouts, which
is the decision-equality half of the claim. Guarding the `observe_articulated` call on
the combat model does not recover it -- the cost is the embedding, not the call -- so
the fix, if v2-19 ever needs one, is to stop returning `Observation` by value.

Decisions worth carrying into the next checkpoint, all now written into
[`articulated-abi.md`](../reference/articulated-abi.md#subject-scoped-observation):
the observation structs are world space and the feature block is subject-relative with
one origin and one length divisor (`sight_range`) and one velocity divisor
(`SPEED_SCALE`); capability bits come from presence facts only; `contact_timing`
saturates at one tick and is computed from the measured columns; the noise domain is
XOR-folded into `Rng::from_stream`'s seed argument. Two shapes in the reference's
struct listing turned out to need a spelling: `ObservedShield` carries `present`
inside the row (a fixed stride cannot be `Option`) and drops `ShieldPose::thickness`,
and neither `ArticulatedObservation` nor `ObservedOpponent` has a `present` column --
the identity is the flag, and blank is `EntityId::NONE`.

**The policy seam landed too (2026-08-10), and nothing here calls it yet.**
`ArticulatedPolicy` is at `crates/policy/src/lib.rs:168` with exactly the shape below,
object-safe, with the same `&mut P`/`Box<P>` forwarders `Policy` has;
`policy::run_articulated` is at `crates/policy/src/runner.rs:218`. `run` was not
touched beyond two constant fields on the struct it returns, and no hash moved.

```rust
pub trait ArticulatedPolicy {
    fn decide(&mut self, obs: &ArticulatedObservation) -> ArticulatedCommandV1;
    fn reset(&mut self) {}
}
```

Six decisions worth carrying, all written into
[`policy.md`](../architecture/policy.md#the-non-legacy-seam):

* **No `TeamPolicy` twin, and the reason is the observation.** `TeamPolicy` routes on
  `Observation::faction`; `ArticulatedObservation` has no faction column at all. Adding
  one back so a wrapper could match on it would publish a fact no fighter perceives,
  and reading it from outside means handing the wrapper the world.
* **The runner records what the world *stored*.** A range or equipment failure comes
  back as `Stored { command, rejection }` with the neutral command substituted, and
  that -- not the offered command -- is the `SubmittedCommand::Articulated` row. Note
  what does not catch this: replay equality passes either way today, because playback
  runs the same validator and would substitute again. `a_refused_submission_is_recorded_as_what_the_world_stored`
  therefore asserts on the recorded rows rather than on the played hash.
* **`RunResult` grew `rejected: u32` and `first_rejection: Option<CommandReject>`.**
  Both zero/`None` from `run`. Without them a run whose every command was thrown away
  is indistinguishable from a run by a mediocre policy.
* **Neutral is derived, not re-defined.** `World::neutral_articulated` is private and
  index-keyed, so `policy::neutral_articulated_command(obs)` rebuilds it from
  `obs.body_yaw`, the only world state in it.
  `the_neutral_command_is_the_one_the_world_substitutes` makes the world refuse a
  command mid-turn and compares what it stored.
* **The swordplay counters are honestly zero.** The non-legacy branch of `World::step`
  emits only `Event::Death`; damage is contact resolution rows.
* **`World::outcome` is reachable but the shipped fixture never reaches it.** Sixty
  seconds of continuous contact between the fixture's Fighter and Brute moves the Brute
  from 1.000 health to 0.948 and the Fighter not at all, so no policy ends
  `articulated_duel` inside its 3600 ticks. The loop keeps the `outcome` gate --
  proved live by shrinking the Brute's anatomy until the reaper fires -- and
  `World::timeout` scores a run that outlives the clock exactly as it does a legacy
  one.

**The compile-fail doctest is not a gate on this toolchain, and it is the first one in
the workspace.** rustdoc enforces a pinned `compile_fail` error code only on nightly;
on stable 1.97.1 the code is parsed and ignored, and a bare `E0999` passes just as
happily as the right one. Verified by pinning a deliberately wrong code and watching the
test still pass. The pin stays, because it documents the intended failure and becomes a
gate on nightly, and it is paired with a compiling twin that differs from it only by the
`&World` parameter -- which is what rules out a typo. Compiled by hand, the failing
block emits exactly one error and it is `E0050`. `cargo test -p policy --doc` reports
`2 passed; 0 failed; 1 ignored`, so the doctests do run and are counted.

Nothing is owed in this section. What it originally asked for --
`World::observe_articulated(EntityId) -> ArticulatedObservation`, one neutral block at
the end of `Observation`, a `FEATURE_LAYOUT_VERSION` bump appending exactly the
documented feature block and width with no existing feature moved, zeroes for a Legacy
observation, and byte-identical existing policy behavior -- is all in and green.

## Host buffers and exports

**Landed (2026-08-10).** The two fixed `[u32]` arrays sit in the `thread_local!` block
beside `FRAME` with their own length and drop counters; `publish` fills the pose rows
from end-of-call state and copies the accumulated event rows, and its `None` arm zeroes
both lengths *and* both buffers -- a pose row is ground truth about an identity, and
147,968 bytes on an arm that only runs when no world is installed is not worth trading
against a stale one. (49,664 bytes while `MAX_COMBAT_EVENTS` was the provisional 256;
the arm runs once per refused install and never inside a frame, so tripling it did not
change the answer.) Event accumulation lives inside `Sim::advance`'s per-tick loop, immediately
after the event drain, because `World::contact_resolutions` retains the last solved
tick only. The feed follows `events`/`events_dropped` exactly: reserved at
`MAX_COMBAT_EVENTS` at construction, cleared per call, and cleared again at the
`hero_is_leaving` early return and inside `Sim::descend`.

Thirteen new exports: `pose_ptr/len/stride/capacity`, `poses_dropped`,
`pose_layout_version`, the six `combat_event_*` twins, and `init_articulated(seed)`,
plus `articulated_stream_digest_lo/hi`. The v2-11 command scratch, `submit_articulated`
and `submit_result` are reused verbatim.

Three things the reference did not anticipate, all written into
[`articulated-abi.md`](../reference/articulated-abi.md#word-representation-and-submitted-command):
`init_articulated` cannot carry `init`'s monsters unchanged, because the shipped
equipment table has no `Knife` and no `Punch`; `Sim::descend` had to become
model-aware, because a Legacy `Scenario::dungeon` refuses an articulated hero *by
panicking*, one call inside an export; and the documented event total order does hold
as produced, so nothing sorts.

`ARTICULATED_STREAM_DIGEST` is `0x4372a94d89fc9155`, native and wasm agreeing, and is
registered in [`hashes.md`](../reference/hashes.md#golden-registry).

**The JavaScript half landed too (2026-08-10), and nothing here is owed.**
`tools/wasm_check.js` lists all fifteen new exports in the whitelist its first test
walks — the list is the only thing standing between a rename and a silent gap, and the
gap would be silent in the worst way, because `undefined >>> 0` is `0` and a stream
that publishes nothing looks exactly like an idle world. Beside it are
`wasm_exports_match_layout_stride_capacity_and_drop_fields`, which asserts `typeof ===
"function"` before it reads a single value and then checks both layout versions, both
strides, both capacities, that a Legacy world publishes and drops nothing, that a
fresh articulated room publishes pose rows and drops nothing, and that neither
pointer moves across a step; and `native_and_wasm_pose_event_stream_digests_match`,
which pins `0x4372a94d89fc9155` and drives the pose row grammar off the reference.
Both names mirror the `crates/web` tests exactly, which is the point: a one-sided
failure diagnoses target disagreement rather than a moved fixture.

**The digest is pinned rather than rebuilt, and the decision is written into the
reference.** `wasm_check.js`'s stronger habit is to rebuild a corpus from the document
— it builds all 3,548 contact-behaviour bytes rather than trusting the export, because
a corpus derived from the thing it checks agrees with a drifting solver by
construction. That does not transfer to this stream: it is twenty ticks of
fixed-point simulation output rather than a table a document can state, and its script
moves two spawns that no export can place, so it cannot be driven from JavaScript
either. What the JS does rebuild from the reference is the pose row *grammar* —
ascending full identity, the equipment mask against the geometry it describes, the
intent and animation-hint enumerations — which is the part a single 64-bit number
cannot speak for, since an encoder wrong the same way on both targets passes the pin.

In `crates/web/src/lib.rs`, add the fixed `[u32; capacity * stride]` pose and combat
event arrays beside `FRAME`; reuse v2-11's exact `[u8; 55]` submitted-command
scratch and packed result word rather than adding a second codec. Implement
every export named in the ABI reference, including `init_articulated`. Existing
`init`, legacy frame pointer/length/stride/version, and Canvas behavior do not change.
`COMBAT_EVENT_STRIDE` is 32: energy and each cut/thrust/pressure/deflected channel
are low/high word pairs. No host mirror may narrow a v2-14 `u64` resolution channel.

Populate pose rows from the end-of-call state in ascending full identity. Accumulate
combat events across every tick in one `step(ticks)` call in
tick/TOI/group-ordinal/key order, as
the legacy feed already does. Overflow retains the canonical prefix and saturating
drop count. Raw authoritative streams remain inside the trusted worker boundary;
the renderer receives only the visibility-filtered copy required by the worker
protocol.

Extend `crates/web/src/bin/emit_abi.rs` with the constants and offsets. The generated
TypeScript consumer still lands in v2-17, but `tools/wasm_check.js` consumes these
exports now. Add native/wasm FNV digests using the exact stream encoding in the
reference; state-hash equality is not a substitute.

**Measured (2026-08-10), and 256 was rejected.** The reference's `abi-high-water`
corpus — seed `0x4152504741424931`, an open 24x16 room, 64 bodies as 32 Fighter/Brute
pairs three halves of a unit apart, one command each through the real `[u8; 55]`
scratch at tick zero and none after, one `step(8)` — accumulates **446 combat-event
rows** in that single batch. At 256 the host published the canonical 256 and counted
190 dropped, which is a truncated stream on the one corpus the reference calls
mandatory. `MAX_COMBAT_EVENTS` is therefore **1024** (the next power of two at least
twice 446) and the reference's byte budget moved from 49,664 to **147,968** — 16,896
pose bytes plus 131,072 event bytes.

**`SNAPSHOT_BUFFER_BYTES` did not move at all, and that is a reversal recorded rather
than quietly undone.** The session first added `POSE_OFFSET`/`COMBAT_EVENT_OFFSET` to
the snapshot chain, which took the constant from 27,452 to 77,116 and then to 175,420
when the capacity became 1024. Both regions came back out: nothing writes or reads
them — `client/src/state/snapshot.ts` imports only `FRAME_OFFSET`/`MAP_OFFSET`/`VIS_OFFSET`/`FURNITURE_OFFSET`
— while the cost is real and per publication, 147,968 bytes on each of the three pooled
buffers in `client/src/runtime/sim-worker-host.ts` and a 6.4x wider zero-fill every
time a filtered snapshot is published. The visibility-filtered copy that would occupy
them is v2-17's, and a cost of that shape arrives with its consumer and its
measurement. `emit_abi` still emits both layout versions, both strides, both capacities
and all 66 + 32 column offsets, which is what v2-17 actually needs from this session,
and `snapshot_offsets_are_aligned_non_overlapping_and_cover_every_fixed_buffer` now
fails if a fifth region is reserved without a reader.

The pose half of the same run is 64 rows with none dropped — `MAX_POSES` exactly, so
the corpus sits on that cap with zero headroom, which is what the reference intends.

`the_high_water_corpus_fills_at_most_half_the_event_buffer` pins 446 and the
at-most-half relationship. `print_articulated_buffer_high_water_marks` is the
`#[ignore]`d printer that produced the number; it builds its own copy of the fixture
rather than sharing the asserting test's, on `print_the_golden_hashes`' argument that
a printer feeding off the gate's own script can re-pin the gate to its drift. No hash
moved: nothing in either test reaches an asserting fixture, and the stream digest's
script never comes near either cap.

Memory growth is a Node wasm test, not a native Rust assertion: hold legacy frame,
pose, and event typed-array views, warm all paths, record `memory.buffer.byteLength`,
exercise maximum spawn/contact/event/reset paths, and require unchanged byte length
and still-attached original views.

**Landed as `published_views_survive_articulated_stress_without_memory_growth`
(2026-08-10), and it settles at 237 pages.** Unchanged from the end of the first warm
round through a measured sixth round and a measured sixth guarded cycle, so one warm
round would do and the three it takes are margin. The retained views are the legacy
frame plus `Uint32Array`s over the *whole* 16,896-byte pose array and 131,072-byte
event array rather than over their live prefixes, because the reserved extent is what
a worker keeps and a shorter view would still land inside the buffer after a
reallocation. It warms every seed the guarded cycles later drive, for the reason the
sibling legacy test records in place: `init` builds the replacement `Sim` before it
drops the installed one, so every reset briefly holds two `combat_events`
reservations, and the peak is per *floor* because each seed generates a different
room. `init_articulated` and `articulated_stream_digest_lo/hi` are both inside the
fixture, so warming it warms them.

**Two ceilings the Node test cannot reach, recorded so the next session does not go
looking.** Its pose maximum is 11 rows and its busiest single publication is 16 event
rows. No export spawns an articulated body — `spawn_monster` refuses an articulated
world by design, and the fixture asserts all 65 refusals — so the roster is whatever
the floor generator placed (7 at depth 0, rising to 11 from depth 4) and a fight is
two bodies. The 64-row and 446-row maxima belong to `abi-high-water`, which is a
hand-built Rust scenario. Nothing is lost: both arrays are fixed and reserved whole at
construction, so how full they are is not what the byte length depends on. Steering
between batches rather than every tick is what produces even 16 — a per-tick clinch
resolves 83 rows over 128 ticks but clears the feed on every one of them, so no
publication holds more than 8.

## Tests and verification

The first three are green, together with the supporting tests the observation
checkpoint added -- the first three of these are the pins that stand in for a golden,
since no state hash reaches an observation:
`every_articulated_feature_lands_on_its_documented_index`,
`articulated_lengths_divide_by_sight_and_velocities_by_speed_scale`,
`the_seven_perception_draws_are_the_documented_stream_in_order`,
`a_blank_articulated_block_writes_four_hundred_and_seventy_two_zeroes`,
`an_unused_opponent_row_writes_sixty_eight_zeroes`,
`an_articulated_observation_is_blank_for_a_legacy_world_a_stale_identity_and_a_corpse`,
`an_articulated_observation_is_the_subjects_own_joints_exactly`,
`every_capability_bit_names_a_presence_fact`,
`the_articulated_opponent_list_is_the_nearest_six_enemies_in_sight`,
`rock_stops_the_articulated_eye_too`,
`opponent_geometry_translates_rigidly_rather_than_shearing`,
`the_noise_stream_draws_seven_per_row_whatever_geometry_is_absent`,
`the_articulated_and_legacy_perception_streams_never_share_a_draw`,
`contact_timing_is_one_unless_something_is_closing`, and
`the_articulated_feature_block_stays_inside_the_vectors_range`.

The host half's own tests are green in `crates/web`:
`pose_rows_use_full_identity_and_canonical_order`,
`pose_and_event_overflow_drop_only_the_canonical_tail`,
`both_limb_slots_and_regions_round_trip`,
`target_hands_and_contact_group_ordinals_round_trip`,
`empty_ticks_enter_both_stream_digests`,
`native_and_wasm_pose_event_stream_digests_match`,
`wasm_exports_match_layout_stride_capacity_and_drop_fields`, and the four the session
added on top of the plan's list:
`a_legacy_room_publishes_no_pose_or_event_rows`,
`no_energy_channel_narrows_to_a_u32`,
`the_documented_event_order_holds_over_a_tick_with_several_groups`,
`the_articulated_room_is_inits_room_and_inits_hero`,
`init_articulated_fails_closed_and_installs_nothing`,
`an_articulated_run_can_descend_without_trapping`, and the measurement gate
`the_high_water_corpus_fills_at_most_half_the_event_buffer` beside its `#[ignore]`d
printer `print_articulated_buffer_high_water_marks`.

**Two per-column pins landed on review, and the gap they close is worth naming.** The
472 feature offsets are asserted one at a time against the reference's literals; the 66
pose words had only `emit_abi`'s set-equality against `0..POSE_STRIDE`, which catches a
gap and a duplicate and *not* a transposition, eight of sixty-six spot-checked in
JavaScript, and `ARTICULATED_STREAM_DIGEST` -- which is derived from the encoder, so it
detects drift and cannot detect a layout that was wrong the day it was pinned.
`every_pose_column_lands_on_its_documented_word` drives a hand-built pose whose 66
published words are all different and checks each against the field the reference's
table names; `every_combat_event_column_lands_on_its_documented_word` does the same for
the 32 event words off the clinch, which is where it has to run because the solver's
`ContactFact`/`ContactKey`/`EnergyLedger` are not public. Both assert their own
coverage of `0..STRIDE`, so a column appended without a line fails rather than going
unchecked. `wasm_exports_match_layout_stride_capacity_and_drop_fields` was also
rewritten to transcribe the reference's 1/66/64/1/32/1024 instead of comparing each
export against the constant it returns, and to assert both drop fields its name has
always claimed -- its JavaScript twin already did both.

The policy seam's own tests are green in `crates/policy`:
`an_articulated_policy_has_no_world_parameter`,
`the_neutral_command_is_the_one_the_world_substitutes`,
`the_neutral_articulated_policy_holds_every_channel_it_can`,
`a_refused_submission_is_recorded_as_what_the_world_stored`,
`a_wrong_model_submission_is_counted_and_never_recorded`,
`an_articulated_run_stops_on_a_death_and_not_only_on_the_clock`,
`an_articulated_run_that_outlives_the_clock_is_scored_on_points`,
`an_articulated_run_is_reproducible`,
`a_recorded_articulated_run_replays_exactly`,
`an_articulated_policy_instance_can_be_reused_without_leaking_between_runs`, and
`a_boxed_articulated_policy_is_driveable`.

`an_articulated_policy_has_no_world_parameter` is named as the plan names it but does
not assert what the name literally says -- that claim is the doctest's, because only a
signature can speak for every policy. What the unit test proves is the consequence: a
recording policy driven through `run_articulated` is shown exactly the sequence
`World::observe_articulated` answers, and replaying that sequence into a fresh instance
with no world present reproduces every command.

**Two of these names were wrong about themselves and were fixed on review.**
`a_stale_identity_is_counted_and_never_recorded` is now
`a_wrong_model_submission_is_counted_and_never_recorded`: its fixture is a Legacy
`Scenario::duel`, so the rejection is `CommandReject::WrongModel`, and
`NotStored(StaleEntity)` is unreachable from `run_articulated` at all --
`World::pending_decisions` is rebuilt from the alive set and nothing between it and the
submission kills anybody. That unreachability is now recorded on the `NotStored` arm
itself. And `an_articulated_policy_instance_can_be_reused_without_leaking_between_runs`
could not fail: deleting `policy.reset()` from `run_articulated` left all 102 policy
tests green, because every fixture policy computed `decide` as a pure function of its
argument. `Recorder` now tires as it decides -- effort sags by a thirty-second over the
first sixteen decisions and saturates, saturating rather than cycling so a run boundary
cannot land back on the starting value -- and the test asserts the recording length
beside the state hash. Deleting the line now fails it on both.

The JavaScript half is green too, and the two `wasm_check.js` tests carry the same
names as their `crates/web` twins on purpose:
`wasm_exports_match_layout_stride_capacity_and_drop_fields` and
`native_and_wasm_pose_event_stream_digests_match` in `tools/wasm_check.js`, and
`published_views_survive_articulated_stress_without_memory_growth` in
`client/test/wasm-memory.test.mjs`.

Nothing is still owed. The four the previous checkpoint listed have all landed:
`articulated_features_have_one_documented_width` (`crates/sim/src/obs.rs`),
`legacy_feature_prefix_and_policy_decisions_are_byte_identical` and
`poor_perception_blurs_motion_without_inventing_severance` (`crates/sim/src/world.rs`),
and `published_views_survive_articulated_stress_without_memory_growth`.

```powershell
cargo test -p web -- --ignored --nocapture print_articulated_buffer_high_water_marks
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node --test client/test/wasm-memory.test.mjs
node tools/check_docs.js
npm run check
git diff --check
```
