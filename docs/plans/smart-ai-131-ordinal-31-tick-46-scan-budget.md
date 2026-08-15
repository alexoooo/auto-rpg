# Smart131 -- ordinal-31 tick-46 scan-budget transcript

**Status:** preregistered next session. This is a bounded, feature-only diagnostic
of Smart130's named post-step tick-46 pair. It changes no mechanics or policy,
does not widen a solver bound, and does not reopen Tactical, held-out, competence,
training or promotion work.

## Question and frozen boundary

Smart130 established the first common-prefix solver-delta/count boundary without
establishing its cause. Smart131 asks only:

> For Smart130's frozen first *rejected* segment/body scan pair on post-step tick
> 46, what bounded region/visit path makes the reference return `reject:budget`,
> what result and path does held take when explicitly diagnosing that same target,
> and what is the first differing field in those transcripts?

The answer is diagnostic provenance, not causality. In particular, the earlier
right-arm effort difference is not presumed to cause any later state, operand,
branch or result difference.

Freeze all of the following before interpreting the new transcript:

- Smart128 ordinal `31`: seed `0`, mirrored `true`, target `Brute`, approach
  offset raw `(-163840,0)`, scenario fingerprint `3796840901852190123`;
- the original 28-tick chamber and 28-tick strike schedules at reach raw `65536`;
- the first submitted difference at tick `36`, and only the attacker's right-arm
  effort there: reference raw `65536`, held raw `0`;
- the first authoritative state-digest difference at tick `37`;
- the post-step tick-46 boundary while both arms are active and neither has an
  attributed contact: reference solver delta/count `1/7`, held `0/6`;
- reference's tick-local first rejected scan pair at tick 46: `a_index=1`,
  `b_index=3`, Hero `EntityId(0,0)` slot `1` to Brute `EntityId(1,0)` body slot
  `255`, `WeaponBody`, `segment_body`, `budget`; held's tick-local rejected-pair
  diagnostic is `none`, and both arms have zero completed group diagnostics.

The two Smart130 evidence artifacts were byte-identical at 812,295 bytes and
9,837 lines, SHA-256
`9369e84bd9913b66d303df81f911c5fa3b96ff2ad5b4af38635f0f5d43421731`.
Record that digest in the Smart131 artifact as the source boundary. It is not an
input file to parse and the session must not select another descriptor if any
frozen guard fails.

## Exact implementation seam

The production edit is limited to:

- `crates/sim/src/combat/contact.rs:125`, beside
  `ExactScanPairRejectionDiagnostic`, for the feature-only public transcript
  vocabulary;
- `crates/sim/src/combat/contact.rs:307`, in `ContactCollectionScratch`, for
  pre-reserved tick-local storage;
- `crates/sim/src/combat/contact.rs:580`, in the exact pair loop, for requested-target
  identity and result capture;
- `crates/sim/src/combat/contact.rs:2805`, in `wide_sweep_segment_body`, for the
  already-computed region and conservative-advance transcript;
- `crates/sim/src/combat/resolution.rs:773`, in
  `ContactTickScratch::begin_exact_diagnostics`, and `:784`, beside
  `exact_scan_pair_rejection`, only for the feature-gated reset and borrowed
  forwarding methods through its private `ContactCollectionScratch` field;
- `crates/sim/src/world.rs:1591`, beside `World::exact_scan_pair_rejection`, for
  the read-only borrowed accessor;
- `crates/sim/src/lib.rs:112`, beside the other exact diagnostic re-exports;
- `crates/lab/src/strong_strike.rs:518`, beside the frozen ordinal-31 constants and
  Smart130 provenance driver, for the three tick-46 executions and grammar;
- `crates/lab/src/tactical_mechanics.rs:448`, beside the Smart130 strict mode and
  atomic writer, for the fail-closed CLI;
- `crates/lab/src/main.rs:52` and `:125` for dispatch and help.

`crates/lab/src/args.rs:9` already exposes ordered positionals, pairs and flags.
Change it only if the strict parser cannot distinguish an input it must name.
The narrow `resolution.rs` exception contains no contact, solver, selection or
mechanics logic: `ContactTickScratch` owns a private `ContactCollectionScratch`, so
it is the only layer that can reset that tick-local diagnostic and forward its
borrow to `World`. The tick-lifetime test and retain-across-tick red mutation defend
that plumbing.
Do not edit `crates/policy`, any default rule, replay encoding, hash grammar or
browser ABI. Do not run `cargo fmt`.

### Tick-local target diagnostic vocabulary

Do not infer a generic scan-order target. Smart130 observed only the reference's
first *rejected* pair; held's absent rejected-pair row does not prove
which earlier pair or outer-AABB branch it took. Add a feature-only, diagnostic-only
target request containing the frozen public `ExactContactKeyDiagnostic`, `a_index=1`
and `b_index=3`. Contact collection compares those explicit fields with its private
`ContactKey`; the API does not expose or re-export that private solver key.
`World::request_exact_segment_body_pair_diagnostic(target)` arms it for exactly one
step. Lab sets it immediately before the `45 -> 46` step on the live and rerun Worlds
only. The request is cleared after that step and is never hashed, replayed, serialized
or consulted by contact selection.

Add `#[cfg(feature = "cartesian-recoil")]` public, equality-comparable request and
borrowed diagnostic types. Scratch owns fixed-capacity region and visit rows. Keep
fixed enum names for artifact encoding rather than serialising `Debug`. The
implementable shape is:

```rust
pub struct ExactSegmentBodyDiagnosticTarget {
    pub key: ExactContactKeyDiagnostic, pub a_index: usize, pub b_index: usize,
}

pub struct ExactSegmentBodyTargetDiagnostic<'a> {
    pub target: ExactSegmentBodyDiagnosticTarget,
    pub encounter_count: u32,
    pub pair: Option<ExactSegmentBodyPairDiagnostic<'a>>,
}

pub struct ExactSegmentBodyPairDiagnostic<'a> {
    pub a_entity: EntityId, pub b_entity: EntityId,
    pub a_slot: u8, pub b_slot: u8,
    pub a_owner: usize, pub b_owner: usize,
    pub a_shape: ExactScanShapeDiagnostic, pub b_shape: ExactScanShapeDiagnostic,
    pub kind: ContactKind, pub orientation: ExactSegmentBodyOrientationDiagnostic,
    pub group_time_raw: u32,
    pub pair_aabb_supported: bool, pub pair_aabb_disjoint: Option<bool>,
    pub result: ExactSegmentBodyPairResultDiagnostic,
    pub regions: &'a [ExactSegmentBodyRegionDiagnostic],
    pub visits: &'a [ExactSegmentBodyVisitDiagnostic],
}

pub enum ExactSegmentBodyPairResultDiagnostic {
    PairAabbDisjoint, Candidate, NoCandidate, Reject(ExactScanRejectDiagnostic),
}

pub struct ExactSegmentBodyRegionDiagnostic {
    pub region: u8, pub aabb_disjoint: Option<bool>,
    pub speed: Option<(i128, i128)>,
    pub visit_start: usize, pub visit_count: u8,
    pub terminal: ExactSegmentBodyRegionTerminalDiagnostic,
    pub accepted_time_raw: Option<u32>, pub accepted_feature: Option<u8>,
}

pub struct ExactSegmentBodyVisitDiagnostic {
    pub region: u8, pub ordinal: u8, pub time_raw: u32,
    pub safe_step_raw: Option<u32>,
}

pub enum ExactSegmentBodyRegionTerminalDiagnostic {
    AabbDisjoint, ProvedSeparate, Candidate, Reject(ExactScanRejectDiagnostic),
}
```

The exact spelling may add an internal owned header, but the evidence content and
bounds are fixed. Retain every visit in execution order, without truncation:
there are at most `BodyPart::COUNT * 96` rows for the one requested pair
(`BodyPart` is the public alias of `AnatomyRegion`). Each visited row carries its
ordinal, time and the exact computed safe-step word, or `None` when that visit
terminated before a step existed. The region row carries the already-computed AABB
disposition and speed ratio plus its contiguous visit range and terminal/candidate
words. These are all bounded words needed to identify the first differing control,
region or visit field; do not invent adjacent samples or substitute the unrelated
unsupported-sub-raw progress structure.

Reserve `AnatomyRegion::COUNT` region rows and `AnatomyRegion::COUNT * 96` visit rows
in `ContactCollectionScratch::try_reserve`; reject capacity drift and never grow
during a tick. `ContactTickScratch::begin_exact_diagnostics` clears only the prior
result and logical lengths, not the request just armed for this step. Match target
identity in the pair loop and record its identity, shapes, kind and orientation
*before* the outer swept-AABB branch can continue. If the target is disjoint there,
publish `PairAabbDisjoint` with zero regions. Otherwise pass the pre-reserved recorder
through `wide_sweep_segment_body` and capture every already-computed region/visit word
and the fixed pair result. A non-encountered or multiply encountered target is an
error. On the first identity match, exclusively claim the header and the pre-reserved
`AnatomyRegion::COUNT * 96` rows. Later matches only increment `encounter_count`; they
must never overwrite the header or append a region/visit row. Use checked `u32`
increment and stop on overflow (the bounded collider-pair domain makes overflow
unreachable, but it must not wrap). After the step the target view exists with count `0` and no pair,
count `1` and one complete pair, or count greater than `1` as a named invalid result.
This is how Lab and the wrong/duplicate-target mutation distinguish missing from
multiple encounters instead of collapsing both to `None`. Other pairs never write
these rows.

Recording must not add a predicate to the mechanics result, change a comparison,
reorder a pair or region, change the `0..96` loop, or affect the returned
`Result<Option<Candidate>, ExactScanReject>`. Expose the post-step result through
`World::exact_segment_body_target_diagnostic() -> Option<ExactSegmentBodyTargetDiagnostic<'_>>`;
`None` means no request was armed for the completed tick, not zero encounters. Its
slices are valid only until the next step and Lab copies them immediately. It is not part of `StateDigest`, replay,
frame/pose/event ABIs, authoritative state or the existing exact diagnostic rows.

## Lab-only tick-46 driver

Add strict feature-only mode:

```text
tactical-mechanics --ordinal-31-tick-46-scan --write PATH
```

It accepts exactly one mode flag and exactly one nonempty `--write PATH`. Refuse a
bare or valued mode flag, duplicate mode/write, any extra positional, every other
tactical mode, every measurement-looking override including `--seed`, `--ordinal`,
`--ticks`, `--horizon`, `--chamber`, `--strike`, `--reach`, `--effort`, `--mirrored`
and `--threads`, and every unknown option. Name the offending input. Without
`cartesian-recoil`, refuse this mode by name and exit `2`. Reuse the Smart130 atomic
writer shape or factor a private shared writer; do not loosen either mode's grammar.

Execute `reference_before`, `held`, then `reference_after`, and no other arm. Each
arm runs only through post-step tick `46`:

1. Build two fresh Worlds from ordinal 31's fixed scenario and seed. On every tick,
   generate each World's command from its own observation and require pending entity
   order, requested command, stored command and submission receipt equality.
2. Independently append the exact expected replay-entry vector `(tick, entity,
   SubmittedCommand::Articulated(stored))` in pending order. Record each stored command
   once in the actual `sim::Replay`; reject any rejection-bearing `Stored` or any
   `NotStored`. Before playback require `Replay::submitted_entries` to equal the
   independent expected vector in length, order, tick, entity, variant and exact
   command bytes. Do not validate replay by comparing it with a vector derived from
   those same replay entries.
3. Immediately before stepping each live/rerun World from tick 45 to 46, arm the
   frozen target request. Do not arm it on any other tick or on Replay. Step both
   Worlds through tick 46, then copy the borrowed target diagnostic before anything
   can erase it. Retain no earlier or later target horizon.
4. Call `Replay::finish(46)` and `Replay::play_until(46)` once for that arm. The
   opt-in target request is deliberately absent from Replay. Require Replay to equal
   both Worlds at tick 46 for the complete authoritative state and Smart130 evidence:
   state digest, rejection/count/cap/contact, resolutions, existing exact diagnostics,
   energy, observations and poses. Require the new target diagnostic separately and
   exactly equal between the two independently stepped live/rerun Worlds; explicitly
   exclude it from replay equality.

Require both references' complete tick-46 snapshots and segment/body transcripts to
match. Require the frozen Smart130 command/state/boundary guards, zero contact-cap
hits, zero positive energy excess, no attributed contact, zero completed group rows,
and exact admission of the same frozen diagnostic target in all three arms. Both
reference target results must be `Reject(Budget)`. Held's target result is measured,
not preregistered, but it must be a complete fixed result for that same admitted pair.
Smart130's held
`exact_scan_pair_rejection=none` remains a separate guard and must not be rewritten
as evidence that the pair was absent.

Run collection and rendering on one named thread,
`smart131-ordinal31-tick46-scan`, with a fixed 16 MiB stack. Start failure, panic,
verification error or incomplete target evidence is a named red refusal and invokes
no writer.

## Transcript comparison and artifact

Compare `reference_before` with held in declaration order, after first requiring
the two reference brackets byte-for-byte equal as typed data. Compare:

1. pair region count and total visit count;
2. aligned region AABB disposition, speed ratio and declared visit count;
3. every aligned `(time, safe_step)` visit row in chronological execution order;
4. region terminal and accepted time/feature. A pair-result difference after all
   those words agree is a diagnostic contradiction, not a difference field.

Pair identity is an admission guard, not a possible difference: both records must
match the requested frozen key and indexes, shapes, `WeaponBody` kind,
`segment_body` orientation and frozen owners before comparison begins. Region and
visit indexes/order/cardinality are likewise validated controls; missing,
reordered, noncontiguous or declared/actual-mismatched rows are errors. Record exactly
one `first_transcript_difference` with scope `aabb_control|region|visit|terminal`,
the fixed field name, region or `none`, visit or `none`, and explicit reference/held
values. A pair-result difference after every recorded path and terminal field agrees
is an incomplete-transcript contradiction, not an explanation. Do not compare later
fields as possible causes after the first difference, though the complete bounded
transcripts remain in the artifact.

Write deterministic ASCII, LF-only, final-newline-terminated
`smart131-ordinal31-tick46-scan-budget-v1`. The grammar is literal and ordered; each
production below is one LF-terminated line, fields occur exactly in the shown order,
and spaces separate fields:

```text
smart131-ordinal31-tick46-scan-budget-v1
descriptor ordinal=31 seed=0 mirrored=true target=brute offset_x_raw=-163840 offset_y_raw=0 fingerprint=3796840901852190123 chamber_ticks=28 strike_ticks=28 reach_raw=65536
smart130_source sha256=9369e84bd9913b66d303df81f911c5fa3b96ff2ad5b4af38635f0f5d43421731 first_command_difference=36 first_state_difference=37 boundary_tick=46 reference_delta=1 reference_count=7 held_delta=0 held_count=6
horizon run=<run> tick_after=46 solver_count=<u32> solver_delta=<u32> contact=false cap_hits=0 max_energy_excess_raw=0 requested_receipt=<lowerhex> stored_receipt=<lowerhex> replay_receipt=<lowerhex> state_domain=<domain> state_schema=<u16> state_value=<lowerhex>
pair run=<run> a_index=1 b_index=3 encounter_count=1 a_entity=0:0 a_slot=1 a_owner=<usize> b_entity=1:0 b_slot=255 b_owner=<usize> kind=weapon_body a_shape=<shape> b_shape=<shape> orientation=<orientation> group_time_raw=<u32> pair_aabb_supported=<bool> pair_aabb_disjoint=<bool|none> result=<pair_result> region_count=<usize> visit_count=<usize>
region run=<run> ordinal=<usize> region=<u8> aabb_disjoint=<bool|none> speed=<ratio|none> visit_start=<usize> visit_count=<u8> terminal=<region_terminal> accepted_time_raw=<u32|none> accepted_feature=<u8|none>
visit run=<run> region=<u8> ordinal=<u8> time_raw=<u32> safe_step_raw=<u32|none>
first_transcript_difference scope=<scope> field=<field> region=<u8|none> visit=<u8|none> reference=<atom> held=<atom>
source_boundary reference_first_rejected_pair=1:3:0:0:1:1:0:255:weapon_body:segment_body:budget held_first_rejected_pair=none reference_group_count=0 held_group_count=0
decision=diagnostic-only
```

`<run>` is exactly `reference_before|held|reference_after`. Emit all three horizon
lines in that order, then all three pair blocks in that order. A pair block is one
pair line followed by exactly `region_count` repetitions of `{ one region line;
immediately that region's declared visit_count visit lines }`. Pair `visit_count`
equals the sum of those region visit counts, `encounter_count` must be exactly `1`,
and `region_count` is at most
`BodyPart::COUNT`, and `visit_count` is at most `BodyPart::COUNT * 96`. Region
ordinals start at zero; visit ordinals start at zero within a region. Exactly one
first-difference line, one source-boundary line and one decision line follow all
three runs. The exact total is
`12 + sum(region_count) + sum(visit_count)` lines. Missing optional values are the
literal `none`; no line may be omitted. Ratios are signed decimal
`<numerator>/<denominator>` with a positive nonzero denominator. Booleans are
`true|false`; each `<lowerhex>` is exactly 16 lowercase hexadecimal digits.

Freeze the three command receipts by factoring and reusing
`strong_strike::source_41_receipt`'s existing `Hash64` byte grammar. It writes ASCII
domain `ARPG-LIFTED-COMMANDS-V1`, `u16(1)`, scenario fingerprint `u64`, row count
`u32`, then for every row in recorded order: tick `u32`, entity index `u32`, entity
generation `u32`, `SUBMITTED_COMMAND_LAYOUT_VERSION` as `u16`, submitted-command tag
bytes `u8(1),u8(0)`, `ARTICULATED_PAYLOAD_BYTES` as `u16`, and exact
`ArticulatedCommandV1::payload_bytes()`. `requested_receipt` hashes the independently
collected `(tick, entity, requested)` tuples; `stored_receipt` hashes the independently
collected safe `(tick, entity, stored)` tuples; `replay_receipt` hashes the actual
`Replay::submitted_entries` after requiring every variant is articulated. No receipt
may be derived from another receipt or from rendered text.

`<domain>` is exactly `legacy_v1|articulated_v1`, the exhaustive fixed lowercase
name of the current `HashDomain` variants. `state_schema` and `state_value` are
rendered separately rather than collapsing a `StateDigest` with `Debug`. The other
fixed token sets are: shape `body|segment|shield`; orientation
`segment_body|body_segment`; reject
`arithmetic_envelope|budget|compatibility_identity|trajectory|unsupported_exact_sweep`;
pair result `pair_aabb_disjoint|candidate|no_candidate|reject:<reject>`; region
terminal `aabb_disjoint|proved_separate|candidate|reject:<reject>`; and scope
`aabb_control|region|visit|terminal`. `<field>` is exactly one of the following,
in this comparison order:

```text
pair_region_count|pair_visit_count|region_aabb_disjoint|region_speed|region_visit_count|visit_time_raw|visit_safe_step_raw|region_terminal|accepted_time_raw|accepted_feature
```

The owned-copy validator refuses missing, reordered, noncontiguous or
declared/actual-mismatched region and visit rows before comparison. Earlier wording
also assigned first-difference tokens to those impossible post-validation states;
that was an overconstraint. Pair region/visit counts remain comparable between two
individually valid arms; aligned row identity is already a validation guard.
`<atom>` is one no-whitespace grammar token from the corresponding
field's encoder. Unknown or newly added enum variants are compile errors, not `Debug`
fallbacks. Reject an internally inconsistent declared length or offset before
rendering or writing.

Do not use `Debug`, map iteration or platform path text. Two independent renders of
the same typed evidence must be byte-identical, and a synthetic fixture with a
pair-AABB-disjoint arm plus a greater-than-eight-visit arm must lock the entire output
bytes and cardinalities. Publish only after every guard and comparison passes. Use
sibling `PATH.tmp`, `create_new`, complete write, flush, destination recheck and rename
to an absent destination. Refuse an existing final or temporary path. On handled
failure remove only the temporary created by this invocation; worker failure or panic
publishes nothing.

## Tests and witnessed mutations

Add these exact feature-only Sim tests:

- `the_requested_segment_body_pair_trace_is_tick_local_and_bounded`
- `a_budget_exhaustion_records_its_region_and_all_visits`
- `recording_a_segment_body_trace_does_not_change_the_scan_result`

Add these exact feature-only Lab tests:

- `ordinal_31_tick_46_reproduces_the_smart130_boundary`
- `ordinal_31_tick_46_is_the_only_diagnostic_horizon`
- `ordinal_31_tick_46_target_is_the_frozen_reference_first_rejected_pair`
- `ordinal_31_tick_46_reference_brackets_match`
- `ordinal_31_tick_46_live_rerun_and_single_replay_match`
- `ordinal_31_tick_46_segment_body_transcripts_name_the_first_difference`
- `ordinal_31_tick_46_scan_budget_refuses_every_measurement_override`
- `ordinal_31_tick_46_scan_budget_artifact_is_byte_identical_and_atomic`

Use test-only mutation seams, never production flags. Witness the relevant named
test red when each of these is introduced, assert that each hook fired, then restore
it before any evidence run:

- retain a target trace across the tick boundary, and on a synthetic region with
  more than eight visits separately drop and reorder one retained visit;
- corrupt one copied region/visit field in the rerun so live/rerun equality fails;
- remove and separately reorder one stored replay submission so comparison with the
  independently built expected receipt fails before playback;
- step to horizon 47;
- request the wrong key/indexes and separately target the next segment/body pair so
  Lab observes count `0` and a different count-`1` target respectively. Lab's copied
  count-`2` mutation tests admission only; genuine duplicate ownership/first-header
  preservation belongs to Sim's
  `the_requested_segment_body_pair_trace_is_tick_local_and_bounded` test, which performs
  two real same-tick matching scans;
- suppress reference's `Budget` result or alter held's recorded result;
- inject atomic open, write, flush and rename failures.

For the no-behaviour-change Sim test, compare the returned candidate/error and the
existing exact scan diagnostics with recording present and with a test-only recorder
disabled on identical input. Deliberately route a recorder value into the result
choice and show the test fail before restoring it. A passing source-shape assertion
is not a substitute for this mutation receipt.

## Stop rules and decision branches

Stop red and publish nothing if any frozen boundary, same-pair, bracket, command,
receipt, live/rerun/replay, boundedness, lifetime, grammar or atomic-write guard
fails. The only authorized conclusions are:

- missing Smart130 boundary, unencountered/multiply encountered frozen target or
  target identity mismatch: repair this instrumentation and repeat from clean source;
- first difference in pair/region AABB disposition or another control-flow field:
  preregister a new stage/control diagnosis of that exact field;
- first difference in a numeric speed, visit, time or safe-step field: preregister
  a new operand-provenance diagnosis of that exact field;
- identical recorded path with different terminal/pair result, replay disagreement,
  or otherwise incomplete evidence: record an instrumentation contradiction and
  repair the transcript before drawing any mechanics conclusion.

None of those branches authorizes changing the 96-visit bound, widening arithmetic,
changing exact geometry or contact selection, tuning Tactical, choosing another
descriptor, reading held-out rows, running the competence gate, enabling the feature
by default, training, promotion or `v2-18`.

## Verification, evidence and pin budget

Run focused mutation-proven tests first, then both workspace modes and both wasm
artifacts. Rebuild immediately before each wasm check because the checker tests the
artifact already on disk:

```powershell
cargo test -p sim --features cartesian-recoil the_requested_segment_body_pair_trace_is_tick_local_and_bounded
cargo test -p sim --features cartesian-recoil a_budget_exhaustion_records_its_region_and_all_visits
cargo test -p sim --features cartesian-recoil recording_a_segment_body_trace_does_not_change_the_scan_result
cargo test -p lab --features cartesian-recoil ordinal_31_tick_46
cargo test -p lab --features cartesian-recoil scan_budget
cargo test
cargo test --workspace --features cartesian-recoil
try {
    cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
    if ($LASTEXITCODE -ne 0) { throw "feature wasm build failed: $LASTEXITCODE" }
    $env:ARPG_CARTESIAN_RECOIL='1'
    node --test tools/wasm_check.js
    if ($LASTEXITCODE -ne 0) { throw "feature wasm check failed: $LASTEXITCODE" }
} finally {
    Remove-Item Env:ARPG_CARTESIAN_RECOIL -ErrorAction SilentlyContinue
}
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```

Commit clean source and tests before evidence. From that one clean MSVC x86-64
Windows commit, run A then B sequentially with a final fixed 1,800-second external
timeout for each. Smart130's completed runs were 1,365.6 and 1,366.8 seconds, so this
is a conservative ceiling; do not extend it. Do not start B if A fails. If B fails,
times out or differs, A remains operational output only and supports no decision:

```powershell
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --ordinal-31-tick-46-scan --write target/smart131-ordinal31-tick46-A.txt
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --ordinal-31-tick-46-scan --write target/smart131-ordinal31-tick46-B.txt
Get-FileHash -Algorithm SHA256 target/smart131-ordinal31-tick46-A.txt,target/smart131-ordinal31-tick46-B.txt
```

Require both exits zero, direct byte equality, equal SHA-256 values and no sibling
temporary files before recording a decision. The evidence artifacts remain
uncommitted operational output.

No registered hash is expected to move. All legacy pins,
`ARTICULATED_COMMAND_HASH`, `ARTICULATED_STREAM_DIGEST`,
`EXACT_TRAJECTORY_STATE_DIGEST`, `LIFTED_COULOMB_SOLVER_DIGEST`,
`CONTACT_BEHAVIOR_DIGEST` and `LEARNED_INFERENCE_DIGEST` must remain unchanged.
A moved pin is a failure to investigate, not a number to re-record.
