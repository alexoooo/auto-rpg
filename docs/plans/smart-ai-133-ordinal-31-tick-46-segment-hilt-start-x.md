# Smart133 -- ordinal-31 tick-46 segment-hilt start-X operand provenance

**Status:** preregistered, not implemented. Smart132 is closed measurement evidence.
This session diagnoses one exact word already frozen by Smart132. It changes no
mechanics, policy, calibration, gate, feature default or registered hash.

**Committed, and this plan is paused (corrected 2026-08-15):** the handoff describing
this implementation as intentionally uncommitted is stale. Commit
`32bef221888d90d2c178a96692e46ec7d3c5d550` carries all nine files -- the seven
authorized Sim/Lab sources, this plan, and one `hashes.md` line-anchor refresh -- on
top of the stated clean-plan authority `682b05cac6cf23a3f9e13845702654dfcfcbfa6f`,
and `main` is clean at the merge `55393d6`. The pre-commit gate this section asked
the next session to hold was therefore passed by the commit rather than by the
review, and nothing was production-run: there is no Smart133 source commit of
record, no A/B pair, and no artifact. Sim has one observer-parametric authoritative arithmetic path,
the 42-event diagnostic/lifecycle, exact reject prefixes and focused Smart131/132/133
regressions green. Lab has the O(T) three-arm harness, full source SHA check,
non-narrowing wide validation, candidate/witness comparator, strict CLI/worker and
atomic writer. The latest focused commands were green:

```text
cargo test -p sim --features cartesian-recoil segment_hilt_start_x
cargo test -p sim --features cartesian-recoil an_operand_recorder_failure_does_not_change_the_authoritative_scan_result
cargo test -p lab --features cartesian-recoil ordinal_31_tick_46_segment_hilt_start_x -- --test-threads=1
cargo test -p lab ordinal_31_tick_46_segment_hilt_start_x
```

The final Lab feature filter passed `7/7` in `19.70` seconds; the default refusal
filter passed `1/1`. Deliberately swapping candidate ordinals `0/2` made the named
first-operand test red, and removing the post-race no-replace check made the atomic
test red; both were restored. An independent review had raised six blockers: exact
Smart132 SHA authority, coherent all-candidate/all-witness mutation receipts, an
independent full 138-line byte oracle, full-width rather than `i128`-narrowed
validation, validation before comparison, and true destination-race plus worker
failure seams. Repairs for all six are in the working tree and the focused filters
are green, but the final read-only re-review was interrupted for shutdown before it
returned. Whoever resumes this plan starts by reviewing those six repairs, and runs
no broad, wasm, production or evidence A/B pass until that review is CLEAR.

**Two things then paused it, and neither withdraws it.** The build host lost its MSVC
linker, so nothing in the workspace compiles here at all: `cargo test -p fx --no-run`
fails with `linker link.exe not found`, `wasm32-unknown-unknown` is not an installed
target, and there is no `web.wasm` or `target/release` binary to fall back on. Every
gate and evidence command below is therefore unrunnable until Build Tools with the
C++ workload are installed. And the owner redirected the topic on 2026-08-15: the
goal is an articulated fight that lands visible blows in the browser, which this plan
by its own charter cannot produce -- it renders `decision=diagnostic-only`, and each
of its stop branches preregisters a further provenance session. Smart134 later landed;
its outcome is durable in [actuator calibration](../performance/smart-ai-actuator-calibration.md)
and the [tactical policy record](../performance/smart-ai-tactical-policy.md). This plan keeps its
frozen authority, its commands and its stop branches exactly as written for whoever
returns to it.

## Question and immutable authority

Smart132 A and B were produced from source commit
`02815f841a5831bd5747ffd813b1965f9ee73a01`. Each is `19,525` bytes, `109`
LF-terminated ASCII lines and has SHA-256
`aeb7364bb8d93ba2ad907628c83819b43745d6b67281c9377cede1f6d817078a`.
They are byte-identical. Their registered first pair-AABB difference is:

```text
first_aabb_difference scope=point field=point_x side=a point=0 axis=none reference=+1:c0345d08/1:000013d7 held=+1:c2daa358/1:000013d7
```

The row is A-side ordinal `0`, source `segment_hilt`, region `none`, endpoint
`start`. Smart132 also measured its Y words as reference
`+1:9895b819/1:000013d7` and held `+1:91b0349e/1:000013d7`, while both Z words are
`+1:0ab478d7/1:000013d7`. Those values remain admission guards, but Smart133
compares only the frozen X computation. It asks:

> In the real `wide_evaluated_point` computation that produced A-side ordinal-0
> `segment_hilt/start` X at ordinal 31, post-step tick 46, which admitted scalar
> operand or exact intermediate first differs between reference and held?

This is not a causal question. A differing motor or response operand does not prove
that the effort change caused it, that either arm is wrong, or that changing it would
alter the solver boundary. Smart133 has diagnostic authority only.

Retain all earlier frozen admission facts:

- ordinal `31`, seed `0`, mirrored `true`, target `Brute`, offset raw
  `(-163840,0)`, fingerprint `3796840901852190123`, chamber/strike `28/28`, reach
  raw `65536`;
- first command/state/boundary ticks `36/37/46`, reference delta/count `1/7`, held
  `0/6`, no tick-46 contact, cap hit or positive energy excess;
- target indexes `1:3`, Hero `0:0` slot `1` owner `0` against Brute `1:0` body slot
  `255` owner `1`, `weapon_body`, `segment_body`, group time raw `0`, encountered
  exactly once;
- reference receipts `68380c01b08a4bba` and state digest
  `articulated_v1:1:b103c18d16641a9f`; held receipts `f1cbac3ada86d1b5` and state
  digest `articulated_v1:1:602273fa3b8cc80c`; requested, stored and replay receipts
  equal within each arm;
- reference containing result `reject:budget`, regions/visits `2/96`, Smart132 AABB
  terminal `overlap` with three gaps; held containing result
  `pair_aabb_disjoint`, regions/visits `0/0`, Smart132 AABB terminal `disjoint` with
  one X gap; both group counts zero;
- both arms have three computed bounds and combined radius
  `+1:000070a3/1:00000001`.

The whole Smart132 artifact is the source boundary, not merely the quoted line.
Before reading Smart133 evidence, rebuild Smart132 typed evidence in memory and
require its complete rendered bytes, byte count, line count and SHA-256 above. Any
mismatch stops as `smart133-source-boundary-mismatch`; never regenerate or reinterpret
Smart132 after seeing Smart133 output.

## File, seam and pin budget

Production edits are limited to:

- `crates/sim/src/combat/contact.rs`: the existing wide coordinate functions at
  lines 2673--2727, the pair recorder at lines 546--642, target modes/state at
  lines 493--838 and AABB point production at lines 3016--3061;
- `crates/sim/src/combat/resolution.rs`: request/view forwarding beside
  `ContactTickScratch::begin_exact_diagnostics` at line 779 and the Smart132
  forwarding at lines 5425--5438;
- `crates/sim/src/world/query.rs` and `crates/sim/src/lib.rs`: public feature-only
  request/view forwarding beside lines 179--214 and exports beside lines
  119--126;
- `crates/lab/src/strong_strike.rs`: factor the existing O(T) Smart132 runner at
  lines 2083--2917; add validation, comparison and rendering beside it;
- `crates/lab/src/tactical_mechanics.rs` and `crates/lab/src/main.rs`: strict mode,
  one worker and atomic writer beside lines 451--573 and main routing/help at lines
  53--55 and 135--155.

Do not edit `fx`, `policy`, learning, web runtime, manifests or hash registries. Every
registered movement budget is exactly zero: `LAB_HASH`, `GOLDEN_STATE_HASH`,
`ROOM_HASH`, `BATTLE_HASH`, `SWAP_HASH`, `BOW_HASH`, `COMBAT_GEOMETRY_HASH`,
`ARTICULATED_COMMAND_HASH`, `CONTACT_BEHAVIOR_DIGEST`,
`ARTICULATED_STREAM_DIGEST`, the `contact format corpus`, the
`combat spec-table digest`, the `articulated-duel-v1` fingerprint,
`LEARNED_INFERENCE_DIGEST`, `EXACT_TRAJECTORY_STATE_DIGEST`, both `legacy feature
prefix` values and `LIFTED_COULOMB_SOLVER_DIGEST`. `ARTICULATED_HASH` remains
absent. Smart130, Smart131 and Smart132 exact artifact tests remain byte-identical.

## Admissible computation boundary

Instrument the computation that already executes; do not recompute a parallel
answer. The frozen chain is:

1. `World::build_contact_colliders` at `crates/sim/src/world/contact_phase.rs:1456` obtains the
   segment collider from `geometry::held_segment_colliders` at
   `crates/sim/src/combat/geometry.rs:87`. `segment_pose` at line 76 defines the
   previous hilt as `previous_body + previous_arm.hand`.
2. `build_exact_contact_trajectories` at `crates/sim/src/world/contact_phase.rs:399` copies that
   previous hilt X to `ExactMotorPoint::at_tick_start_raw[0]` and the requested-minus-
   previous hilt X to `tick_delta_raw[0]`.
3. `wide_swept_aabbs_are_disjoint` at `crates/sim/src/combat/contact.rs:3153` chooses
   start time from A owner's common `group_time_raw`; the frozen value is zero.
4. `fill_wide_swept_aabb_points` at line 3016 calls `wide_segment_at_time` at line
   2910 and publishes the first returned hilt as A ordinal 0, `segment_hilt/start`.
5. `wide_evaluated_point` at line 2712 computes X by calling
   `wide_motor_coordinate` at line 2673, adding
   `wide_response_coordinate(owner.common_response, owner.common_scale, ...)` at
   line 2687, then, because this row has held index `1`, adding
   `wide_response_coordinate(held.affine, held.affine.mass_raw, ...)`.

Smart133 records step 5's actual scalar reads and exact intermediates. Steps 1--2 are
admission provenance only: record the resulting `ExactMotorPoint` operands, but do
not add a second geometry recorder or claim which body/hand input produced them.
If the motor start is the first difference, that is the preregistered boundary for a
later previous-hilt construction session. This keeps the session solely on the
already-measured point-X evaluation.

For X and `time_raw=0`, preserve the actual checked operation order:

```text
motor_start = rational(at_tick_start_raw_x, 1)
motor_step_numerator = checked_mul(tick_delta_raw_x, time_raw)
motor_step = rational(motor_step_numerator, 65536)
motor_value = wide_add(motor_start, motor_step)

common_position = rational(common_at_group_raw_x, 1)
common_remainder = rational(common_at_group_remainder_x, common_scale * 65536)
common_momentum = common_scale * common_velocity_raw_x + common_momentum_remainder_x
common_travel = rational(common_momentum * (time_raw - common_group_time_raw),
                         common_scale * 65536)
common_value = wide_add(wide_add(common_position, common_remainder), common_travel)
after_common = wide_add(motor_value, common_value)

held_position = rational(held_at_group_raw_x, 1)
held_remainder = rational(held_at_group_remainder_x, held_mass_raw * 65536)
held_momentum = held_mass_raw * held_velocity_raw_x + held_momentum_remainder_x
held_travel = rational(held_momentum * (time_raw - held_group_time_raw),
                       held_mass_raw * 65536)
held_value = wide_add(wide_add(held_position, held_remainder), held_travel)
final = wide_add(after_common, held_value)
```

Record each scalar read, checked product, rational construction and addition at the
point it executes, in one ordered event stream. The two response denominator
products are separate events because `wide_response_coordinate` computes
`scale * 65536` once for the remainder and again for travel. Likewise record the
scaled-velocity product before the checked momentum add. Record checked scalar
products as signed decimal `i128` and every rational/add result using Smart132's
complete 128-limb wide-word copy.

A failed checked operation or rational/add construction appends one terminal reject
event immediately after the last successfully produced event. It does not fabricate
the failed result or any later input/intermediate. A successful computation appends
one terminal success event after `final`. The terminal is authoritative observation,
not a comparison candidate. Recorder-invalid is separate and must not manufacture,
suppress or replace the scan result.

## Sim diagnostic and lifecycle

Add feature-only plain diagnostic values in `contact.rs`:

```rust
pub struct ExactPointXAdmissionDiagnostic {
    pub side: ExactPairAabbSideDiagnostic,
    pub ordinal: u8,
    pub source: ExactPairAabbPointSourceDiagnostic,
    pub region: Option<u8>,
    pub endpoint: ExactPairAabbEndpointDiagnostic,
    pub axis: ExactPairAabbAxisDiagnostic,
    pub row_entity: EntityId,
    pub row_slot: u8,
    pub owner_index: usize,
    pub held_index: usize,
    pub held_slot: u8,
    pub held_spec: EquipmentSpecId,
    pub time_raw: u32,
    pub common_group_time_raw: u32,
    pub held_group_time_raw: u32,
}

pub enum ExactPointXEventScopeDiagnostic { Motor, Common, Combine, Held, Final }
pub enum ExactPointXEventRoleDiagnostic {
    OperandCandidate, DerivedWitness, Terminal,
}
pub enum ExactPointXEventFieldDiagnostic {
    StartRaw, DeltaRaw, StepNumerator, Value, Scale, AtGroupRaw,
    AtGroupRemainder, RemainderDenominator, VelocityRaw, ScaledVelocity,
    MomentumRemainder, Momentum, TravelTimeRaw, TravelNumerator,
    TravelDenominator, MassRaw, Terminal,
}
pub enum ExactPointXEventStageDiagnostic {
    Input, Cast, Subtract, CheckedProduct, CheckedAdd, RationalStart,
    RationalStep, RationalPosition, RationalRemainder, RationalTravel,
    AddStartStep,
    AddPositionRemainder, AddTravel, AddMotorCommon, AddAfterCommonHeld,
    Terminal,
}
pub enum ExactPointXEventAtomDiagnostic {
    I32(i32), U32(u32), I128(i128), Wide(ExactWideRationalDiagnostic),
    TerminalSuccess, TerminalReject(ExactScanRejectDiagnostic),
}
pub struct ExactPointXEventDiagnostic {
    pub ordinal: u8,
    pub role: ExactPointXEventRoleDiagnostic,
    pub scope: ExactPointXEventScopeDiagnostic,
    pub field: ExactPointXEventFieldDiagnostic,
    pub stage: ExactPointXEventStageDiagnostic,
    pub atom: ExactPointXEventAtomDiagnostic,
}

pub enum ExactPointXRecorderInvalidDiagnostic {
    Capacity, Cardinality, Lifecycle, Overflow, WordCopy,
}

pub struct ExactSegmentHiltStartXDiagnostic<'a> {
    pub admission: ExactPointXAdmissionDiagnostic,
    pub events: &'a [ExactPointXEventDiagnostic],
    pub recorder_invalid: Option<ExactPointXRecorderInvalidDiagnostic>,
}
```

Do not expose private arithmetic or format `Debug`. Add
`ExactTargetMode::SegmentHiltStartX` to the existing requested/active lifecycle, with
one separate fixed state containing one optional admission header and an event vector
reserved for exactly 42 rows: 41 successful computation events plus one terminal.
Extend `ContactCollectionScratch::try_reserve`; request
time allocates nothing. The existing pending-only mutual exclusion remains across all
three modes. A completed active view can coexist with one pending request; accepting
the pending request cannot erase or relabel the completed view. Clone preserves both.
Tick begin moves requested to active, clears only completed rows, and no request
expires the prior view. Existing Smart131 and Smart132 accessors still select only
their own active modes and render byte-for-byte unchanged.

Add `World::request_exact_segment_hilt_start_x_diagnostic(target)` and
`World::exact_segment_hilt_start_x_diagnostic()`. The target remains the existing
`ExactSegmentBodyDiagnosticTarget`; do not introduce a configurable point. First
identity match owns the record, later matches only increment the existing `u32`
encounter count. Within that pair, arm the operand recorder only for side A, ordinal
0, segment hilt, start endpoint, X axis. Every other point and axis passes `None`.

Factor `wide_motor_coordinate`, `wide_response_coordinate` and
`wide_evaluated_point` so the authoritative operations occur once and optionally
publish each input/result immediately after it is produced. The recorder is
infallible from the solver's perspective: full storage or copy failure marks
recorder-invalid and the exact scan continues with the same values and return. Wrap
the targeted X evaluation once so every authoritative `?` finalizes its actual prefix
with exactly one reject terminal. Do not append the absent failed event. The frozen
success path has exactly 42 rows and ends with terminal success; any shorter success,
any event after a terminal or any non-prefix label sequence is recorder-invalid. The
final recorded word must equal Smart132 A point 0 X from the same execution. Capacity
is a logical 42, never allocator capacity.

## Fixed O(T) Lab harness

Add exactly:

```text
tactical-mechanics --ordinal-31-tick-46-segment-hilt-start-x --write PATH
```

The parser accepts one bare mode flag and one nonempty write pair. Refuse by name
every positional, valued-mode, duplicate, unknown, thread, seed, mirror, target,
offset, horizon, tick, chamber, strike, reach, effort, calibration, held-out, quick,
Smart130, Smart131 or Smart132 override. A valueless `--write` is a named refusal.
Without `cartesian-recoil`, exit status is `2` with a requires-feature refusal.
Return errors to main; never print an error and return success.

Use one worker named `smart133-ordinal31-tick46-segment-hilt-start-x` with a fixed
16 MiB stack. Factor, but do not alter, Smart132's runner at
`crates/lab/src/strong_strike.rs:2293`. Run reference-before, held and
reference-after only through commands `0..45`. Keep independent requested-command,
stored-command, expected-Replay and actual-Replay vectors. Compare actual Replay
length, order, tick, entity, variant and payload bytes to the independent expected
vector before `finish(46)` and exactly one `play_until(46)` per arm. Replay is never
diagnostically armed.

Arm both live Worlds once only after proving `tick()==45`, immediately before
`45 -> 46`. Request the fixed Smart133 mode, not Smart132 mode, and copy the complete
borrowed view immediately after the step. The same active mode must also retain the
containing Smart131 pair and complete Smart132 AABB evidence so one run owns the
source-boundary proof; do not run an additional O(T) Smart132 pass. Compare complete
authoritative state and all Smart130/131/132 evidence across live/rerun/replay,
excluding only the opt-in Smart133 operand view. Require reference-before and
reference-after to match as typed values.

Before comparison, validate target identity, encounter count one, semantic point
identity, time/group/held identity, exactly 42 ordered events on the frozen successful
path, canonical wide words, all checked scalar operations, every rational/add event
recomputed independently from its recorded inputs and predecessor, and final equality with the
containing Smart132 point word. Reject an unexecuted, missing, duplicate, reordered
or stale event. Refuse recorder-invalid before render or writer.

## Comparison and artifact grammar

Use Smart132's exact wide-rational token grammar unchanged. Atom encodings are
literal and disjoint:

```text
i32:<canonical-signed-decimal>
u32:<canonical-unsigned-decimal>
i128:<canonical-signed-decimal>
wide:<wide-rational>
enum:success
enum:reject:<arithmetic_envelope|budget|compatibility_identity|trajectory|unsupported_exact_sweep>
```

Signed decimal has no leading `+`, leading zero or negative zero; unsigned decimal
has no leading zero. Enum/token rendering is exhaustive `match`, never `Debug`.

The admission row is validated before the event stream and is not a candidate table:
`a_index=1`, `b_index=3`, encounter one, entity `0:0`, row slot `1`, owner index `0`,
held index/slot `1`, equipment spec `1` (the Fighter sword), A-side point `0`,
`segment_hilt/none/start/X`, `time_raw=0`, common group time `0` and held group time
`0`. A mutation to any admission field stops `smart133-source-boundary-mismatch`.
It cannot render a `first_operand_difference`.

The following table is the successful-prefix validator. Its row order is the actual
execution order. `operand_candidate` is reserved for primitive, non-admission values
read by the computation. Casts, subtractions, checked products, checked adds,
rationals and wide adds are `derived_witness`; they are independently recomputed and
can never select a successor boundary. No other
`(role,scope,field,stage,atom_kind)` tuple is legal:

| Ordinal | Role | Scope | Field | Stage | Atom kind |
|---:|---|---|---|---|---|
| 0 | `operand_candidate` | `motor` | `start_raw` | `input` | `i32` |
| 1 | `derived_witness` | `motor` | `value` | `rational_start` | `wide` |
| 2 | `operand_candidate` | `motor` | `delta_raw` | `input` | `i32` |
| 3 | `derived_witness` | `motor` | `step_numerator` | `checked_product` | `i128` |
| 4 | `derived_witness` | `motor` | `value` | `rational_step` | `wide` |
| 5 | `derived_witness` | `motor` | `value` | `add_start_step` | `wide` |
| 6 | `operand_candidate` | `common` | `scale` | `input` | `i128` |
| 7 | `operand_candidate` | `common` | `at_group_raw` | `input` | `i32` |
| 8 | `derived_witness` | `common` | `value` | `rational_position` | `wide` |
| 9 | `operand_candidate` | `common` | `at_group_remainder` | `input` | `i128` |
| 10 | `derived_witness` | `common` | `remainder_denominator` | `checked_product` | `i128` |
| 11 | `derived_witness` | `common` | `value` | `rational_remainder` | `wide` |
| 12 | `operand_candidate` | `common` | `velocity_raw` | `input` | `i32` |
| 13 | `derived_witness` | `common` | `scaled_velocity` | `checked_product` | `i128` |
| 14 | `operand_candidate` | `common` | `momentum_remainder` | `input` | `i128` |
| 15 | `derived_witness` | `common` | `momentum` | `checked_add` | `i128` |
| 16 | `derived_witness` | `common` | `travel_time_raw` | `subtract` | `u32` |
| 17 | `derived_witness` | `common` | `travel_numerator` | `checked_product` | `i128` |
| 18 | `derived_witness` | `common` | `travel_denominator` | `checked_product` | `i128` |
| 19 | `derived_witness` | `common` | `value` | `rational_travel` | `wide` |
| 20 | `derived_witness` | `common` | `value` | `add_position_remainder` | `wide` |
| 21 | `derived_witness` | `common` | `value` | `add_travel` | `wide` |
| 22 | `derived_witness` | `combine` | `value` | `add_motor_common` | `wide` |
| 23 | `operand_candidate` | `held` | `mass_raw` | `input` | `i32` |
| 24 | `derived_witness` | `held` | `scale` | `cast` | `i128` |
| 25 | `operand_candidate` | `held` | `at_group_raw` | `input` | `i32` |
| 26 | `derived_witness` | `held` | `value` | `rational_position` | `wide` |
| 27 | `operand_candidate` | `held` | `at_group_remainder` | `input` | `i128` |
| 28 | `derived_witness` | `held` | `remainder_denominator` | `checked_product` | `i128` |
| 29 | `derived_witness` | `held` | `value` | `rational_remainder` | `wide` |
| 30 | `operand_candidate` | `held` | `velocity_raw` | `input` | `i32` |
| 31 | `derived_witness` | `held` | `scaled_velocity` | `checked_product` | `i128` |
| 32 | `operand_candidate` | `held` | `momentum_remainder` | `input` | `i128` |
| 33 | `derived_witness` | `held` | `momentum` | `checked_add` | `i128` |
| 34 | `derived_witness` | `held` | `travel_time_raw` | `subtract` | `u32` |
| 35 | `derived_witness` | `held` | `travel_numerator` | `checked_product` | `i128` |
| 36 | `derived_witness` | `held` | `travel_denominator` | `checked_product` | `i128` |
| 37 | `derived_witness` | `held` | `value` | `rational_travel` | `wide` |
| 38 | `derived_witness` | `held` | `value` | `add_position_remainder` | `wide` |
| 39 | `derived_witness` | `held` | `value` | `add_travel` | `wide` |
| 40 | `derived_witness` | `final` | `value` | `add_after_common_held` | `wide` |

Successful row 41 is exactly
`(terminal,final,terminal,terminal,enum:success)` and is not a candidate. An authoritative
failure is a strict prefix of rows 0--40 followed at the next ordinal by exactly
`(terminal,final,terminal,terminal,enum:reject:<name>)`. It may also occur at ordinal zero.
No rows follow a terminal. A reject cannot retain the failed event, skip an earlier
event, or use `success`. The frozen production arms must all contain rows 0--40 plus
success, exactly 42 events. Reject-prefix fixtures exercise failures before the first
rational, in each response, and at the final add.

The comparator consumes this same table by cursor; it does not keep a disconnected
order constant. Once both arms independently validate, compare only
`operand_candidate` atoms in their table order. The first unequal candidate becomes
the stored difference. Every `derived_witness` has already been recomputed within its
own arm. Equal preceding candidates with unequal witnesses is therefore an arithmetic,
portability or incomplete-transcript contradiction, never a first operand. Different
row labels, terminal/cardinality, a final-word mismatch without an earlier candidate
difference, or a failure to reproduce Smart132 stops as
`smart133-incomplete-operand-transcript`.
Validation recomputes the first difference and requires exact equality with the
stored row before rendering.

Write deterministic ASCII, LF only, with one final newline. Fields occur in exactly
the shown order:

```text
smart133-ordinal31-tick46-segment-hilt-start-x-v1
descriptor ordinal=31 seed=0 mirrored=true target=brute offset_x_raw=-163840 offset_y_raw=0 fingerprint=3796840901852190123 chamber_ticks=28 strike_ticks=28 reach_raw=65536
smart132_source commit=02815f841a5831bd5747ffd813b1965f9ee73a01 sha256=aeb7364bb8d93ba2ad907628c83819b43745d6b67281c9377cede1f6d817078a bytes=19525 lines=109 first_scope=point first_field=point_x side=a point=0 source=segment_hilt region=none endpoint=start reference=+1:c0345d08/1:000013d7 held=+1:c2daa358/1:000013d7
horizon run=<run> tick_after=46 solver_count=<u32> solver_delta=<u32> contact=false cap_hits=0 max_energy_excess_raw=0 requested_receipt=<hex16> stored_receipt=<hex16> replay_receipt=<hex16> state_domain=<domain> state_schema=<u16> state_value=<hex16>
admission run=<run> a_index=1 b_index=3 encounter_count=1 entity=0:0 slot=1 owner_index=0 held_index=1 held_slot=1 held_spec=1 side=a point=0 source=segment_hilt region=none endpoint=start axis=x time_raw=0 common_group_time_raw=0 held_group_time_raw=0
event run=<run> ordinal=<u8> role=<operand_candidate|derived_witness|terminal> scope=<scope> field=<field> stage=<stage> atom=<typed-atom>
first_operand_difference role=operand_candidate scope=<scope> field=<field> stage=input atom_kind=<i32|i128> reference=<typed-atom> held=<typed-atom>
source_boundary smart132_reference=+1:c0345d08/1:000013d7 smart132_held=+1:c2daa358/1:000013d7 reference_pair_result=reject:budget held_pair_result=pair_aabb_disjoint reference_regions=2 reference_visits=96 held_regions=0 held_visits=0
decision=diagnostic-only
```

Runs are exactly `reference_before|held|reference_after`. Emit three horizon lines,
then for each run one admission row and exactly 42 event rows in cursor order. Finish
with one difference, source boundary and decision. The artifact therefore has exactly
`138` lines:
`3 fixed prefix + 3 horizons + 3 * (1 admission + 42 events) + 3 fixed suffix`.
The table above literally closes `<role>`, `<scope>`, `<field>`, `<stage>` and atom
kind for every ordinal. Only its 12 `operand_candidate` rows are legal
`first_operand_difference` tuples; all have `stage=input` and atom kind `i32|i128`.
Derived, `u32`, `wide` and terminal enum atoms are forbidden there. Terminal enum
atoms are legal only at the terminal ordinal. The renderer refuses unknown tuples or
atom/type mismatches. Both reference/held atoms must carry the same prefix named by
`atom_kind`; it never emits `missing`, `cardinality` or a `Debug` spelling.

Publish only after full validation. Use sibling `PATH.tmp`, `create_new`, complete
write, flush, destination recheck and rename to an absent destination. On handled
failure, remove only the temporary created by this invocation. Existing final/temp,
worker start/panic, validation or rendering failure publishes nothing. A destination
appearing after the recheck is an atomic refusal and must not be cleaned up.

## Exact tests and witnessed mutations

Add feature-only Sim tests:

- `the_segment_hilt_start_x_target_records_the_actual_operand_chain`;
- `the_segment_hilt_start_x_target_is_tick_local_bounded_and_inert`;
- `the_segment_hilt_start_x_final_word_equals_the_pair_aabb_point_word`;
- `a_completed_segment_hilt_start_x_view_can_coexist_with_one_pending_request`;
- `an_operand_recorder_failure_does_not_change_the_authoritative_scan_result`.

The first test uses nonzero synthetic common and held position, remainder and momentum
terms and proves all 42 events against an independent exact construction. It also uses
a nonzero time fixture so deleting the motor/common/held travel paths goes red; the
production target remains time zero. The final-word test drives the real pair-AABB
path and compares the recorder's final full 128-limb word with the actual A point 0 X,
not with a second call to the same helper. The inertness test compares complete scan
result, candidates, first rejection, Smart131 pair rows and Smart132 AABB rows off/on,
excluding only the new view; it snapshots capacities and proves request-time no
allocation, 42-row bound, first-owner behavior and next-tick expiry. The lifecycle
test uses `ContactTickScratch` and `World`, covers active plus pending, clone,
consecutive ticks and cross-mode refusal in all three mode orders.

Add feature-only Lab tests:

- `ordinal_31_tick_46_segment_hilt_start_x_reproduces_the_smart132_boundary`;
- `ordinal_31_tick_46_segment_hilt_start_x_is_the_only_diagnostic_horizon`;
- `ordinal_31_tick_46_segment_hilt_start_x_reference_brackets_match`;
- `ordinal_31_tick_46_segment_hilt_start_x_live_rerun_and_single_replay_match`;
- `ordinal_31_tick_46_segment_hilt_start_x_names_the_first_operand_difference`;
- `ordinal_31_tick_46_segment_hilt_start_x_refuses_every_measurement_override`;
- `ordinal_31_tick_46_segment_hilt_start_x_artifact_is_byte_identical_and_atomic`.

The artifact test assembles a complete typed three-arm fixture with distinct scalar
and wide event values, validates it through production code and locks the entire exact
138-line byte string. Separate typed fixtures move every one of the 12 registered
input candidates alone and coherently recompute every dependent later witness. For
each candidate ordinal `i`, a priority fixture mutates candidate `i` and **all later
input candidates simultaneously**, again recomputes every dependent witness and
retains the valid success terminal, then requires candidate `i`'s literal tuple and
atom kind as the first difference. Thus deleting, permuting or bypassing any candidate
cursor step changes a named result even if all later candidate values also differ.
Separately corrupt every one of the 29 derived witnesses without changing its inputs;
ordinary per-arm validation must fail and its distinct receipt must fire, so a derived
value can never become a first-operand row. Exhaustive fixtures render and parse
every legal table tuple, every scalar/wide atom format, terminal success and every
terminal reject enum. Admission mutations separately require
`smart133-source-boundary-mismatch` and prove no first-difference row was built. A
stale or false stored difference must fail recomputation.

Use test-only mutations with a distinct `AtomicU64` fired receipt for every variant:

- mutate every one of the 12 real copied operand candidates, coherently recompute all
  dependent witnesses, and reach each variant through the ordinary table-driven
  comparator; for each candidate also mutate all later candidates, recompute, and
  require the current candidate to retain priority;
- separately corrupt every one of the 29 derived witnesses with a distinct fired
  receipt and require ordinary independent witness validation to refuse it before
  comparison;
- drop, duplicate and swap adjacent event rows; append after terminal; fabricate a
  failed event before a reject terminal; retain a stale prior-tick row;
- mutate side, point, axis, entity, row slot, owner index, held index/slot/spec, common
  or held group time; record Y or the segment tip while labeling it frozen X/hilt;
  request the wrong target and real next pair `(0,4)`; every one stops at admission
  and is excluded from the candidate table;
- skip common addition, skip held addition, replace `after_common`, and route a
  recorder fault into the authoritative scan result;
- inject recorder capacity/word-copy failure while preserving the real result; inject
  genuine authoritative failures at multiple computation stages and require strict
  event prefixes with one reject terminal and no fabricated later values;
- remove and reorder actual Replay submissions while preserving the independent
  expected vector; run horizon 47; alter the stored first difference;
- clear active on request, let pending replace active, retain old active at tick
  begin, and accept/overwrite a second pending request in each cross-mode order;
- inject worker start/panic, open/write/flush/rename and destination-race failures.

Each named test first passes normally, then proves the mutation receipt fired and the
ordinary validator/equality assertion fails by name. A mutation cannot fail merely
because it recognized itself. Deliberately edit and restore at least the real
`add_motor_common` addition, event ordering, final-to-Smart132 equality, independent
Replay comparison, pending/active separation and atomic cleanup; record the exact red
test and restored green command.

## Preregistered stop branches

Interpret only the registered first operand:

- any source bytes, target, semantic identity, horizon, receipt, replay, bracket,
  state, containing-pair or Smart132 AABB mismatch: repair instrumentation and repeat
  from one clean source commit;
- candidate `(motor,start_raw,input)`: preregister a previous-hilt-X construction
  session separating previous body-origin X from tick-entry hand X; do not infer an
  effort cause;
- candidate `(motor,delta_raw,input)`: record that the frozen time-zero witnesses
  independently validate a zero contribution; preregister no mechanics change. A
  later endpoint diagnosis requires its own plan and authority;
- any candidate common input
  (`scale|at_group_raw|at_group_remainder|velocity_raw|momentum_remainder`):
  preregister a common-response-X input-provenance session beginning at the exact
  owner trajectory; do not change response integration;
- any candidate held input
  (`mass_raw|at_group_raw|at_group_remainder|velocity_raw|momentum_remainder`):
  preregister a slot-1 held-response-X input-provenance session beginning at the
  exact held affine row; do not change grip integration;
- equal inputs with a differing derived witness, a noncanonical word, a final word that
  does not equal Smart132, or different final words with no registered first field:
  record `smart133-incomplete-operand-transcript` or a portability/arithmetic
  contradiction and repair it before any mechanics conclusion;
- recorder influence on scan output, authoritative reject relabeled as recorder
  invalid, or live/rerun/replay disagreement: repair the diagnostic seam; no evidence
  branch is authorized.

No branch authorizes changing the 96-visit bound, swept-AABB law, exact wide
arithmetic, trajectory/response integration, contact selection, Tactical policy,
descriptor, held-out corpus, competence gate, feature default, training, promotion
or `v2-18`.

## Gates and fixed A/B evidence

Run focused mutation-proven tests, then both workspace modes and both freshly built
wasm artifacts. Always remove the feature environment and leave the default artifact:

```powershell
cargo test -p sim --features cartesian-recoil the_segment_hilt_start_x
cargo test -p sim --features cartesian-recoil a_completed_segment_hilt_start_x
cargo test -p sim --features cartesian-recoil an_operand_recorder_failure
cargo test -p lab --features cartesian-recoil ordinal_31_tick_46_segment_hilt_start_x
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

Commit the green source before evidence. From that one clean MSVC x86-64 Windows
commit, run A then B sequentially with one fixed 1,800-second external timeout per
process:

```powershell
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --ordinal-31-tick-46-segment-hilt-start-x --write target/smart133-ordinal31-tick46-segment-hilt-start-x-A.txt
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --ordinal-31-tick-46-segment-hilt-start-x --write target/smart133-ordinal31-tick46-segment-hilt-start-x-B.txt
Get-FileHash -Algorithm SHA256 target/smart133-ordinal31-tick46-segment-hilt-start-x-A.txt,target/smart133-ordinal31-tick46-segment-hilt-start-x-B.txt
```

Do not extend the timeout and do not start B if A fails. A B failure, timeout or byte
mismatch leaves A operational only and supports no decision. Record command, direct
exit, wall time, source commit, stdout/stderr classification, bytes, LF line count,
SHA-256, sibling-temp absence and direct A/B byte equality before reading the
registered first-operand row. The resulting observation selects only one stop branch
above; it grants no causal or mechanics authority.
