# Smart132 -- ordinal-31 tick-46 pair-AABB control transcript

**Status:** preregistered, not implemented. Smart131 is closed evidence. This session
diagnoses one already-frozen pair-level control decision and changes no mechanics,
policy, calibration, gate or default feature state.

## Question and authority

Smart131's byte-identical evidence found the first registered bounded-path difference
at post-step tick `46`:

```text
first_transcript_difference scope=aabb_control field=pair_region_count region=none visit=none reference=2 held=0
```

For the same frozen target pair, reference reports `pair_aabb_disjoint=false`, enters
two body-region rows and later rejects `budget`; held reports
`pair_aabb_disjoint=true`, enters no region and returns `pair_aabb_disjoint`. Smart132
asks only:

> Which exact swept-pair-AABB input, derived bound, gap, comparison or actual
> axis-early-exit field first differs between the reference and held arms at the
> frozen ordinal-31 tick-46 target pair?

This is not a causal question. The effort-only command difference at tick `36`, state
difference at tick `37`, and solver/count boundary at tick `46` remain ordered facts,
not a demonstrated chain. A different AABB operand does not prove either arm wrong.

The immutable source boundary is Smart131 artifact A/B SHA-256
`8ba428ecace7dba5f281c879c8ceaec907d8b5f9a504f67fc8d28b53811bde7e`,
`18,433` bytes and `208` LF-terminated ASCII lines, produced from source commit
`315cf8a989b0d3d32bd9be33f7da8ad13ae715a3`. Freeze all of these Smart131 facts:

- ordinal `31`, seed `0`, mirrored `true`, target `Brute`, offset raw
  `(-163840,0)`, fingerprint `3796840901852190123`, chamber/strike `28/28`, reach
  raw `65536`;
- first command/state/boundary ticks `36/37/46`; reference delta/count `1/7`, held
  `0/6`; no tick-46 contact, cap hit or positive energy excess;
- target indexes `1:3`, Hero `0:0` slot `1` owner `0` against Brute `1:0` body slot
  `255` owner `1`, `weapon_body`, `segment_body`, group time raw `0`, encountered
  exactly once;
- reference before/after receipts `68380c01b08a4bba` and state digest
  `articulated_v1:1:b103c18d16641a9f`; held receipts `f1cbac3ada86d1b5`
  and state digest `articulated_v1:1:602273fa3b8cc80c`; requested, stored and replay
  receipts are equal within each arm;
- reference pair result `reject:budget`, `2` regions, `96` visits; held pair result
  `pair_aabb_disjoint`, `0` regions, `0` visits; both group counts zero.

Any mismatch stops as `smart132-source-boundary-mismatch`. Do not regenerate or
reinterpret Smart131 after seeing Smart132 output.

## File and pin budget

The production edit is limited to:

- `crates/sim/src/combat/wide.rs`, fixed-word diagnostic extraction only;
- `crates/sim/src/combat/contact.rs`, the opt-in target recorder and the existing
  pair-AABB computation at lines 2639--2754;
- `crates/sim/src/combat/resolution.rs`, the existing diagnostic lifecycle forwarding
  near lines 5417--5430 only;
- `crates/sim/src/world.rs` and `crates/sim/src/lib.rs`, feature-only request/view
  forwarding and exports;
- `crates/lab/src/strong_strike.rs`, a fixed tick-46 collector, comparison and
  renderer beside Smart131's implementation at lines 1407--2045;
- `crates/lab/src/tactical_mechanics.rs` and `crates/lab/src/main.rs`, strict mode,
  worker and atomic publication beside the Smart131 seams.

No `fx`, policy, learning, web runtime, manifest or hash-registry file changes. The
expected moves for every registered pin are all **zero**: `LAB_HASH`,
`GOLDEN_STATE_HASH`, `ROOM_HASH`, `BATTLE_HASH`, `SWAP_HASH`, `BOW_HASH`,
`COMBAT_GEOMETRY_HASH`, `ARTICULATED_COMMAND_HASH`, `CONTACT_BEHAVIOR_DIGEST`,
`ARTICULATED_STREAM_DIGEST`, the `contact format corpus`, the
`combat spec-table digest`, the `articulated-duel-v1` fingerprint,
`LEARNED_INFERENCE_DIGEST`, `EXACT_TRAJECTORY_STATE_DIGEST`, both `legacy feature
prefix` values and `LIFTED_COULOMB_SOLVER_DIGEST`.
`ARTICULATED_HASH` remains absent. Diagnostic scratch is excluded from authoritative
state, replay and hashes.

## Exact wide-word diagnostic

Do not truncate a `WideRational4096` to `i128` or format a private type with `Debug`.
In `wide.rs`, expose only a `pub(crate)` copy operation returning the exact sign,
`used` count and all `128` little-endian `u32` limbs of the numerator magnitude and
denominator. Keep arithmetic private. In `contact.rs`, add feature-only public plain
diagnostic values:

```rust
pub struct ExactWideWordDiagnostic {
    pub negative: bool,
    pub used: u8,
    pub limbs: [u32; 128],
}

pub struct ExactWideRationalDiagnostic {
    pub numerator: ExactWideWordDiagnostic,
    pub denominator: ExactWideWordDiagnostic,
}

pub enum ExactPairAabbSideDiagnostic { A, B }
pub enum ExactPairAabbPointSourceDiagnostic {
    SegmentHilt, SegmentTip, BodyLower, BodyUpper,
}
pub enum ExactPairAabbEndpointDiagnostic { Start, End }

pub struct ExactPairAabbPointDiagnostic {
    pub side: ExactPairAabbSideDiagnostic,
    pub ordinal: u8,
    pub source: ExactPairAabbPointSourceDiagnostic,
    pub region: Option<u8>,
    pub endpoint: ExactPairAabbEndpointDiagnostic,
    pub coordinate: [ExactWideRationalDiagnostic; 3],
}

pub enum ExactPairAabbAxisDiagnostic { X, Y, Z }
pub enum ExactPairAabbComparisonDiagnostic { Less, Equal, Greater }

pub struct ExactPairAabbBoundRowDiagnostic {
    pub axis: ExactPairAabbAxisDiagnostic,
    pub left_min: ExactWideRationalDiagnostic,
    pub left_max: ExactWideRationalDiagnostic,
    pub right_min: ExactWideRationalDiagnostic,
    pub right_max: ExactWideRationalDiagnostic,
}

pub struct ExactPairAabbGapRowDiagnostic {
    pub axis: ExactPairAabbAxisDiagnostic,
    pub right_gap: ExactWideRationalDiagnostic,
    pub right_comparison: ExactPairAabbComparisonDiagnostic,
    pub left_gap: Option<ExactWideRationalDiagnostic>,
    pub left_comparison: Option<ExactPairAabbComparisonDiagnostic>,
    pub disjoint: bool,
}

pub enum ExactPairAabbTerminalDiagnostic {
    Overlap, Disjoint, Reject(ExactScanRejectDiagnostic),
}

pub enum ExactPairAabbRecorderInvalidDiagnostic {
    Capacity, Cardinality, Lifecycle, Overflow, WordCopy,
}
```

Append an optional borrowed pair-AABB view to the existing
`ExactSegmentBodyPairDiagnostic`. Its header contains `start_raw`, `end_raw`, the
side radii raw, optional combined wide radius, authoritative terminal, separate
optional recorder-invalid status, and borrowed point, computed-bound and visited-gap
slices. Do not change any existing Smart131 field or renderer. An authoritative
`Reject(ExactScanRejectDiagnostic)` is scan output; recorder-invalid is instrumentation
failure and never substitutes for it.

Add a distinct one-tick request
`World::request_exact_segment_body_pair_aabb_diagnostic(target)`. The existing
`request_exact_segment_body_pair_diagnostic` continues to collect Smart131 rows with
the AABB extension absent. Store **separate** `requested_mode` and `active_mode` slots,
each `None|SegmentBody|PairAabb`, with separate requested and active target values.
Mutual exclusion applies only to pending next-tick requests: either request refuses
when `requested_mode != None`, regardless of which mode is pending. A completed active
record never blocks arming one request for the next tick. This is load-bearing because
the caller may still borrow tick N's completed view while successfully requesting tick
N+1; the pending request must not erase or relabel the active view.

At `begin_exact_diagnostics`, clear the previous active rows/header, move the complete
requested mode/target into the active slots, then clear only the requested slots. No
request means active becomes `None`, which expires the previous tick's view. The
ordinary Smart131 accessor returns a view only when `active_mode=SegmentBody`; the new
AABB accessor returns a view only when `active_mode=PairAabb`. Pending mode never
changes accessor selection. First identity match in the active tick owns all rows;
duplicates only increment the checked encounter count. Replay is never armed and
carries none of this evidence.

Reserve the AABB storage only in `ContactCollectionScratch::try_reserve`: point rows
`AnatomyRegion::COUNT * 4 + 4` (currently `24`), exactly three computed-bound rows and
exactly three visited-gap rows. Propagate `try_reserve` failure from scratch creation.
The public request checks only that `requested_mode=None` plus the already-established
capacities; it does not reject because `active_mode` is occupied and allocates
nothing immediately before the authoritative step. Tests snapshot all three
capacities before/after the step and require no growth. Bound pushes by logical
constants, never allocator capacity. A segment side has exactly four points; a body
side has at most `AnatomyRegion::COUNT * 4` (`20`), is divisible by four, and is
exactly four times its present-region count; combined count is at most `24` and every
declared count equals the retained slice. Storage overflow marks recorder-invalid and
is refused by Lab after the scan; it must never become an `ExactScanReject` or alter
contact selection. Clone preserves both requested and active mode/target slots, the
completed header/rows and the fixed capacities. Tick begin replaces active from
requested exactly as above; no other reset clears a still-borrowable completed view.
Append all three capacities at the end of capacity reporting so existing indexes stay
stable.

## Record the actual pair-AABB control path

The pair loop in `contact.rs` lines 902--953 already claims the frozen target before
the outer AABB decision. Preserve that order. Split borrows of `exact_wide` and the
target recorder; a non-target pair or ordinary Smart131 request passes no AABB
recorder.

Instrument only the existing path:

1. `wide_swept_aabbs_are_disjoint` fixes `start_raw` from owner A's common group time
   and `end_raw=65536`.
2. `fill_wide_swept_aabb_points` records each point at the same place it is produced,
   before the side radius is returned. Freeze the semantic order: segment
   `hilt/start, tip/start, hilt/end, tip/end`; body by increasing present-region index,
   each `lower/start, upper/start, lower/end, upper/end`. Every row carries source,
   region (`none` for segment), endpoint and exact coordinates, so skipped absent body
   regions cannot make equal counts falsely align different inputs. Finish all A rows,
   then record A radius; finish all B rows, then record B's accumulated maximum radius.
   Record an empty side literally if reached.
3. In `wide_aabb_points_are_disjoint`, preserve the real computation order. Empty
   either side returns authoritative `Disjoint` with zero bound/gap rows and no
   combined radius. Otherwise left point zero becomes the origin, and the function
   computes relative left/right minima and maxima for **all X/Y/Z axes before** it
   constructs the combined radius or enters the gap loop. Record three fixed
   `ExactPairAabbBoundRowDiagnostic` rows in X/Y/Z order even when a later gap exits
   on X or Y. Then record the one standalone combined radius.
4. Record `ExactPairAabbGapRowDiagnostic` only for each axis actually visited by the
   gap loop. Record right gap/comparison first. If it is `greater`, encode left gap and
   comparison as `None` and return `Disjoint`; do not compute them for diagnostics.
   Otherwise record the executed left gap/comparison and return on `greater`. A
   non-disjoint result visits X/Y/Z and terminates `Overlap`.
5. Every arithmetic `?` or early `Err` preserves the exact authoritative reject as
   `terminal=Reject(<fixed reject>)`, even when only a prefix of points/bounds/gaps was
   produced. A recorder capacity/copy/lifecycle fault separately sets
   `recorder_invalid`; it never changes, suppresses or manufactures the original
   `Result<bool, ExactScanReject>`. The Lab refuses recorder-invalid evidence before
   render. Sim inertness tests exercise one real authoritative reject and one injected
   recorder failure and prove the categories cannot be exchanged.

The first identity match owns the header and rows. Later same-tick matches only use the
existing checked encounter counter and never overwrite or append. `u32` overflow is a
named diagnostic-invalid stop. No runtime behavior is added outside the
`cartesian-recoil` feature.

## Fixed Lab mode

Add exactly:

```text
tactical-mechanics --ordinal-31-tick-46-pair-aabb --write PATH
```

The validator accepts one bare mode flag and one nonempty write pair. It refuses by
name every positional, valued-mode, duplicate, unknown, thread, seed, mirror, target,
offset, horizon, tick, chamber, strike, reach, effort, calibration, held-out, quick,
Smart130 or Smart131 override. A valueless `--write` is a named refusal. Without the
feature it exits `2` with a requires-feature refusal. Failures return status to main;
they do not print and return success.

Use one worker named `smart132-ordinal31-tick46-pair-aabb` with a fixed 16 MiB stack.
The collector is separate from Smart130's per-tick replay driver. It may factor the
Smart131 O(T) tick-46 runner, but the existing Smart131 artifact must remain
byte-identical in its exact test.

Run reference-before, held and reference-after through commands `0..45`. Maintain
independent requested tuples, stored tuples, expected Replay records and actual Replay
entries. Compare actual Replay length/order/tick/entity/variant/payload bytes to the
independent expected vector before `finish(46)` and one `play_until(46)` per arm.
Replay remains unarmed. Compare the complete authoritative state and existing
Smart130/131 evidence across live/rerun/replay, explicitly excluding only the opt-in
AABB view. Arm both live Worlds exactly once only after asserting `tick()==45`, just
before `45 -> 46`, then copy each borrowed completed AABB view immediately after the
step. Require reference brackets equal as typed values.

Recheck every frozen Smart131 guard and exact receipt. Require the AABB target identity,
encounter count one, recorder-invalid absent, complete bounded point/bound/gap ranges
and authoritative terminal to agree with the containing pair result: reference
`Overlap`/`reject:budget`, held `Disjoint`/`pair_aabb_disjoint`. An authoritative AABB
reject is retained as a reject and fails this frozen guard by name; it is never called
recorder-invalid. Any mismatch is a refusal before render or write.

## Comparison and artifact grammar

Validate each arm independently before comparison: exact target identity; A rows then
B rows; contiguous side ordinals; the frozen semantic source/region/endpoint order;
segment count exactly four; body count `<=20`, divisible by four and equal to four
times its present-region count; total `<=24`; three X/Y/Z bound rows after nonempty
sides; `0..=3` contiguous X/Y/Z gap rows; complete fixed word arrays; canonical `used`
count; zero unused limbs; and nonnegative/nonzero denominators. Empty-side successful
disjoint has zero bounds, no combined radius and zero gaps. Nonempty successful paths
have all three bounds and a combined radius; terminal `Disjoint` equals the last
visited gap's separating comparison, while `Overlap` has three nonseparating gap rows.
An authoritative reject may retain only the executed prefix and is distinct from
recorder-invalid. Missing, reordered, undeclared/actual-mismatched or malformed rows
are validation errors, not silently aligned values.

Encode a wide rational as one no-space token:

```text
<signed-wide>/<unsigned-wide>
<signed-wide>   := +<used>:<limbs> | -<used>:<limbs>
<unsigned-wide> := <used>:<limbs>
<limbs>         := none | <eight-lowerhex>[,<eight-lowerhex>...]
```

There are exactly `used` low-to-high limbs; zero is `+0:none`; denominators have
`used>0`. This is a full representation, not a digest or decimal approximation.

Write deterministic ASCII, LF-only, final-newline-terminated
`smart132-ordinal31-tick46-pair-aabb-control-v1`. Each production is one line and
fields occur in the shown order:

```text
smart132-ordinal31-tick46-pair-aabb-control-v1
descriptor ordinal=31 seed=0 mirrored=true target=brute offset_x_raw=-163840 offset_y_raw=0 fingerprint=3796840901852190123 chamber_ticks=28 strike_ticks=28 reach_raw=65536
smart131_source sha256=8ba428ecace7dba5f281c879c8ceaec907d8b5f9a504f67fc8d28b53811bde7e bytes=18433 lines=208 first_scope=aabb_control first_field=pair_region_count reference=2 held=0
horizon run=<run> tick_after=46 solver_count=<u32> solver_delta=<u32> contact=false cap_hits=0 max_energy_excess_raw=0 requested_receipt=<hex16> stored_receipt=<hex16> replay_receipt=<hex16> state_domain=<domain> state_schema=<u16> state_value=<hex16>
pair_aabb run=<run> a_index=1 b_index=3 encounter_count=1 a_entity=0:0 a_slot=1 a_owner=0 b_entity=1:0 b_slot=255 b_owner=1 kind=weapon_body a_shape=segment b_shape=body orientation=segment_body start_raw=<u32> end_raw=65536 a_point_count=<u8> b_point_count=<u8> bound_count=<u8> gap_count=<u8> terminal=<terminal> recorder_invalid=none
point run=<run> side=<a|b> ordinal=<u8> source=<point_source> region=<u8|none> endpoint=<start|end> x=<wide-rational> y=<wide-rational> z=<wide-rational>
side_radius run=<run> side=<a|b> value=<i32|none>
bound run=<run> ordinal=<u8> axis=<x|y|z> left_min=<wide-rational> left_max=<wide-rational> right_min=<wide-rational> right_max=<wide-rational>
combined_radius run=<run> value=<wide-rational|none>
gap run=<run> ordinal=<u8> axis=<x|y|z> right_gap=<wide-rational> right_comparison=<less|equal|greater> left_gap=<wide-rational|none> left_comparison=<less|equal|greater|none> disjoint=<bool>
first_aabb_difference scope=<scope> field=<field> side=<a|b|none> point=<u8|none> axis=<x|y|z|none> reference=<atom> held=<atom>
source_boundary reference_pair_aabb_disjoint=false reference_regions=2 reference_visits=96 held_pair_aabb_disjoint=true held_regions=0 held_visits=0
decision=diagnostic-only
```

Runs are exactly `reference_before|held|reference_after`. Emit all three horizons,
then three pair blocks in that order; each block is its header, all A points, the A
radius line, all B points, the B radius line, all computed-bound rows, then its
mandatory combined-radius line (literal
`none` when uncomputed), then its actually visited gap rows. Finish with exactly one
first-difference, source boundary and decision. Total lines equal
`21 + sum(a_point_count + b_point_count + bound_count + gap_count)`.

`<point_source>` is exactly `segment_hilt|segment_tip|body_lower|body_upper`.
`<terminal>` is exactly
`overlap|disjoint|reject:arithmetic_envelope|reject:budget|reject:compatibility_identity|reject:trajectory|reject:unsupported_exact_sweep`.
Recorder-invalid evidence is never rendered; internal values are exactly
`capacity|cardinality|lifecycle|overflow|word_copy` and produce a named refusal.

Compare reference-before to held in actual computation order:

1. window `start_raw`, `end_raw`;
2. control `a_point_count`, then aligned A points in ordinal order with fields
   `point_source`, `point_region`, `point_endpoint`, `point_x`, `point_y`, `point_z`,
   then radius `a_radius_raw`;
3. control `b_point_count`, then the same aligned B point fields, then radius
   `b_radius_raw`;
4. the three already-computed X/Y/Z bound rows in ordinal order, fields
   `bound_left_min`, `bound_left_max`, `bound_right_min`, `bound_right_max`;
5. radius `combined_radius`;
6. aligned actually visited gap rows in ordinal order, fields `right_gap`,
   `right_comparison`, optional `left_gap`, optional `left_comparison`,
   `gap_disjoint`.

`<scope>` is exactly `window|control|point|radius|bound|gap`. The numbered sequence
above is the registered comparison order; within it, `<field>` uses exactly this
exhaustive vocabulary (the point tokens repeat for side B):

```text
start_raw|end_raw|a_point_count|point_source|point_region|point_endpoint|point_x|point_y|point_z|a_radius_raw|b_point_count|b_radius_raw|bound_left_min|bound_left_max|bound_right_min|bound_right_max|combined_radius|right_gap|right_comparison|left_gap|left_comparison|gap_disjoint
```

The A and B point coordinate/source tokens share the point field names; side and
ordinal disambiguate them. Source-label differences are real control-field differences,
not admission failures. Pair identity, side, ordinal and bound/gap axis identity remain
admission controls. If all shared validated bound/gap rows agree but gap cardinality,
authoritative terminal or containing pair result differs, stop
`smart132-incomplete-aabb-transcript`; do not emit a gap-count or result-only
explanation. Do not compare later fields as candidate causes after the first
difference, though all bounded rows remain in the artifact.

Publish only after full validation. Use sibling `PATH.tmp`, `create_new`, complete
write, flush, destination recheck and rename to an absent destination. On handled
failure remove only the temporary created by this invocation. Existing final/temp,
worker start/panic, validation or rendering failures publish nothing.

## Exact tests and witnessed mutations

Add feature-only Sim tests:

- `the_pair_aabb_target_records_points_bounds_and_the_actual_early_exit`;
- `the_pair_aabb_target_is_tick_local_bounded_and_inert`;
- `a_completed_pair_aabb_view_can_coexist_with_one_pending_next_tick_request`;
- `the_pair_aabb_words_round_trip_without_truncation`;
- `an_authoritative_pair_aabb_reject_is_not_a_recorder_failure`.

`the_pair_aabb_target_records_points_bounds_and_the_actual_early_exit` drives real
right-gap-disjoint, left-gap-disjoint, empty-side and
non-disjoint segment/body sweeps; it proves absent left fields remain `none`, the
empty-side path records zero bounds/gaps, all nonempty paths retain three computed
bounds, only visited gaps are recorded, and the recorder stops at the actual
separating comparison. It also drives a real arithmetic/compatibility rejection and
requires `terminal=Reject` with recorder-invalid absent.

`the_pair_aabb_target_is_tick_local_bounded_and_inert` compares scan return, existing
rejection rows and Smart131 rows with AABB recording off/on; it proves logical 24/3/3
bounds, scratch-time `try_reserve`, request-time no allocation, no growth, next-tick
expiry and first-owner duplicate behavior. Its injected recorder-capacity failure
leaves the original scan result and authoritative terminal unchanged while producing
recorder-invalid.

`a_completed_pair_aabb_view_can_coexist_with_one_pending_next_tick_request` owns every
requested/active lifecycle assertion through the real owner: after tick N completes,
the active accessor remains readable while either mode can be requested for tick N+1;
that pending request does not change the active accessor;
`begin_exact_diagnostics` replaces active with the requested mode; two consecutive
requested ticks each produce their own non-stale completed record; and cross-mode
second pending requests are refused in both orders. Clone preserves both a completed
active record and a simultaneously pending next-tick request.

`the_pair_aabb_words_round_trip_without_truncation` includes a synthetic value using
limbs above bit 127 so an `i128` shortcut goes red.
`an_authoritative_pair_aabb_reject_is_not_a_recorder_failure` independently locks the
two failure categories.

Add feature-only Lab tests:

- `ordinal_31_tick_46_pair_aabb_reproduces_the_smart131_boundary`;
- `ordinal_31_tick_46_pair_aabb_is_the_only_diagnostic_horizon`;
- `ordinal_31_tick_46_pair_aabb_reference_brackets_match`;
- `ordinal_31_tick_46_pair_aabb_live_rerun_and_single_replay_match`;
- `ordinal_31_tick_46_pair_aabb_names_the_first_difference`;
- `ordinal_31_tick_46_pair_aabb_refuses_every_measurement_override`;
- `ordinal_31_tick_46_pair_aabb_artifact_is_byte_identical_and_atomic`.

The artifact test builds one complete typed synthetic artifact that includes semantic
segment/body point labels with a skipped body region, a right-gap early exit with
`left_gap=none`, and a non-disjoint three-gap arm. It runs the ordinary
validator/comparator/renderer and locks the entire ASCII bytes and
`21 + points + bounds + gaps` cardinality. A separate typed pair-render fixture locks
the exhaustive authoritative `reject:<name>` terminal tokens with recorder-invalid
absent; the frozen production guard still refuses such a terminal. Another test proves
recorder-invalid refuses before the writer. No fixture concatenates strings that typed
evidence could not produce.

Use test-only mutations with a distinct fired receipt for every variant:

- corrupt one real copied point limb in rerun;
- drop one real point row, reorder two real point rows, and alter one real point source
  label after copying; each is a separate mutation and fired receipt;
- corrupt one real bound or visited gap/comparison in rerun;
- drop/reorder one bound row and one visited gap row;
- continue recording after a real separating axis;
- remove and reorder actual Replay submissions while retaining the independent
  expected vector;
- run horizon `47`;
- request a wrong target and the real alternate `(0,4)` body/segment pair;
- clear the active view when a next-tick request is accepted, refuse a request merely
  because active is occupied, retain the old active mode across tick begin, and allow
  or overwrite a second cross-mode pending request; each lifecycle mutation has its
  own fired receipt and is caught by
  `a_completed_pair_aabb_view_can_coexist_with_one_pending_next_tick_request`, whose
  both-order assertions prove pending mutual exclusion is load-bearing;
- suppress held's recorded authoritative `Disjoint` while leaving its gap rows intact;
- replace a real authoritative reject with recorder-invalid, and separately inject a
  recorder-invalid condition without changing the authoritative result;
- route recorder presence into the scan result;
- inject open/write/flush/rename failures and second-rename-style cleanup hazards.

Each named test first passes the unmutated path, then asserts the mutation fired and
the ordinary validator/equality/early-exit assertion returns the named error. Do not
make a mutation branch return an error merely because it saw itself. Deliberately
break and restore at least: the point-word copy, the axis comparison/early return,
point drop/order/source validation, the independent Replay comparison, authoritative
reject versus recorder-invalid classification, requested/active slot separation, and
writer cleanup after a failed publication.
Record the red test names and restored green commands before commit.

## Stop branches

Interpret only the registered first field:

- source boundary, bracket, replay, target, cardinality or reference-bracket mismatch:
  repair instrumentation and repeat from clean source;
- first difference in point source, region or endpoint label: preregister a new
  point-construction/control provenance session for that exact side and ordinal; the
  label is evidence, not an admission failure;
- first difference in window, radius or point coordinates: preregister a new operand-
  provenance session for that exact field and point; do not infer which upstream
  command/state change caused it;
- first difference in a derived bound, gap or comparison: preregister a new named-axis
  AABB-expression provenance session for that exact operand;
- identical validated shared rows with different gap count or terminal, identical
  transcript with different containing pair result, malformed wide words, an
  authoritative reject relabelled recorder-invalid, recorder effect on scan output or
  replay disagreement: record a diagnostic contradiction and repair it before drawing
  a mechanics conclusion.

No branch authorizes changing the 96-visit bound, swept-AABB law, wide arithmetic,
contact selection, Tactical policy, descriptor, held-out corpus, competence gate,
feature default, training, promotion or `v2-18`.

## Verification and evidence

Run focused mutation-proven tests, then both workspace modes and both freshly built
wasm artifacts. The feature environment must be removed on success, failure or throw;
leave the final default artifact:

```powershell
cargo test -p sim --features cartesian-recoil the_pair_aabb_target
cargo test -p sim --features cartesian-recoil a_completed_pair_aabb_view
cargo test -p sim --features cartesian-recoil the_pair_aabb_words
cargo test -p sim --features cartesian-recoil an_authoritative_pair_aabb_reject
cargo test -p lab --features cartesian-recoil ordinal_31_tick_46_pair_aabb
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

Commit green source before evidence. From that one clean MSVC x86-64 Windows commit,
run A then B sequentially with the final fixed 1,800-second external timeout for each:

```powershell
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --ordinal-31-tick-46-pair-aabb --write target/smart132-ordinal31-tick46-pair-aabb-A.txt
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --ordinal-31-tick-46-pair-aabb --write target/smart132-ordinal31-tick46-pair-aabb-B.txt
Get-FileHash -Algorithm SHA256 target/smart132-ordinal31-tick46-pair-aabb-A.txt,target/smart132-ordinal31-tick46-pair-aabb-B.txt
```

Do not extend the timeout. A failure means no B. A B failure, timeout or byte mismatch
leaves A operational only and supports no decision. Record command, direct exit,
wall time, source commit, stdout/stderr classification, bytes, lines, SHA-256, sibling
temp absence and direct A/B byte equality before reading the registered fields.
