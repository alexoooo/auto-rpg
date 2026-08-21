# Arena response 03 -- the hand keeps up

**Status:** client freshness evidence implemented; native response sweep and tuning remain
blocked on Session 02. See the [2026-08-21 handoff](arena-response-99-handoff.md).
**Blocks:** session 04.

## Outcome

Make a quick mouse stroke produce a quick achieved slash while preserving a slower stroke,
weapon inertia, fatigue, replay determinism and the new anatomical constraint. Tune the
authoritative actuator only after session 01 proves the delay is in the actuator rather
than frame cadence or worker acceptance.

## Current seams

The present rates are owned together at
[`ARM_BEARING_MAX_SPEED_RAW`](../../crates/sim/src/combat/actuator.rs#L115) and
[`ARM_LINEAR_MAX_SPEED_RAW`](../../crates/sim/src/combat/actuator.rs#L135). Ordinary and
exact-law arms both enter through
[`integrate_arm_for_grip_with_profile`](../../crates/sim/src/combat/actuator.rs#L532) and
its exact sibling. [`ArmRateProfile`](../../crates/sim/src/combat/actuator.rs#L242) owns
bearing speed, bearing acceleration, linear speed, linear acceleration and elbow-plane
speed together, while
[`World::step_with_arm_rate_profile`](../../crates/sim/src/world/mod.rs#L1679) supplies the
host-free full-row sweep seam. Keep the older two-bearing-rate seam and every captured
fixture pair unchanged; use the full profile for this measurement rather than inventing a
Human-only motor or host ABI.

## Response fixture

Add one deterministic actuator sweep beside the current arm-rate evidence. Start from the
shipped Fighter guard with (a) no item, (b) sword, and (c) shield plus sword. The third is
a shield-coexistence and self-clearance case; the left-hand shield does not add inertia to
the right-hand sword actuator and must not be described as a third right-arm load.

Preregister the initial and final target as literal
`(bearing.raw(), height.raw(), reach.raw())` rows on a proven clear front-body path. Do not
specify only "one arm length away": the shipped MID, quarter-reach guard and the
quantized two-link clamp do not identify one exact endpoint. Measure the achieved start
and end hands from those literal poses and define progress along that displacement. Submit
a stationary target, then the full-effort endpoint. Record per tick:

- accepted target and achieved hand;
- 10%, 50% and 90% arrival ticks;
- peak/median achieved hand and blade-centre speed, with blade centre at the equipment's
  declared balance rather than the geometric midpoint;
- overshoot and settle tick;
- work/fatigue; and
- any anatomical constraint or hostile contact.

The accepted envelope is:

- unloaded 10--90% arrival in at most six ticks;
- sword 10--90% arrival in at most eight ticks;
- overshoot no more than `1/16` arm length;
- no self constraint on the deliberately clear path; and
- a slow path that submits the same literal endpoint at `Fx::HALF` effort has lower median
  achieved speed and no greater work/fatigue than the `Fx::ONE` path.

Compute 10%, 50% and 90% progress with fixed-point dot-product numerators against the
declared start-to-end vector; do not normalize with float or a square root. These
thresholds are two-sided tests. Pin a positive lower arrival bound and a first-tick
acceleration witness as well as the upper bounds, so a zero-tick snap or disabled
acceleration fails. Universal full effort or removed inertia must also fail even if it
feels fast.

## Tuning ownership

The likely owners are `ARM_BEARING_MAX_SPEED_RAW`, `ARM_BEARING_ACCEL_RAW`,
`ARM_LINEAR_MAX_SPEED_RAW`, `ARM_LINEAR_ACCEL_RAW` and the elbow-plane rate coupled to
bearing. Sweep a declared, coupled ladder of complete `ArmRateProfile` rows in an explicit
total order; five independently varied dimensions do not have a unique “smallest” tuple.
Choose the first row meeting every bound for unloaded and sword timing plus shield
coexistence in default and exact-law builds. Record the immediately slower rejected row
and the immediately faster row, and state which lower bound makes an over-fast or
acceleration-bypassed mutation fail. Do not change `TICKS_PER_SECOND`, global playback
speed, stats, weapon mass or damage to make this test pass.

The browser keeps its absolute cursor mapping. A fast powered gesture already encodes
`Fx::ONE` effort; the evidence must prove that its accepted target arrives on the next
tick. If it does not, repair command freshness before tuning the motor. No pointer velocity
or host timestamp enters `CommandV1` or authoritative state.

If the full-effort arm meets the bound but locomotion still feels slow in the foreground,
record that as a separate footwork finding and insert a measured session before 04. Do not
silently accelerate the whole game inside this arm session.

## Files

| file | change |
|---|---|
| `crates/sim/src/combat/actuator.rs` | measured rate constants, coupled profile ladder and two-sided unit fixtures |
| `crates/sim/src/world/articulated.rs` | full-profile response fixture and integration behavior tests |
| `crates/sim/tests/determinism.rs` | rerun/replay and reached golden evidence |
| `crates/lab/src/main.rs` | ordered full-profile arm-response sweep/report and corpus comparison |
| `crates/policy/src/guard.rs` | mirror any deliberately coupled rate assumption or refuse the change |
| `crates/web/src/lib.rs`, `tools/wasm_check.js` | paired reached-pin mirrors |
| `client/src/arena/arena.ts`, `client/src/arena/control-lab.ts` | accepted/achieved latency and slash report, no authoritative rate |
| `client/test/studio-shell.test.mjs` | fast/slow gesture-to-receipt behavior |
| `docs/performance/embodied-stance-and-elbow-constants.md` | sweep grid, neighbours and chosen values |
| `docs/performance/arena-human-control.md` | physical fast/slow evidence and remaining owner judgement |
| `docs/design/combat.md`, `docs/reference/hashes.md` | current actuator law and reached-pin provenance |

## Tests and mutations

- `an_unloaded_full_effort_hand_reaches_ninety_percent_within_six_ticks`
- `a_sword_hand_reaches_ninety_percent_within_eight_ticks_without_overshoot`
- `a_clear_fast_slash_neither_self_constrains_nor_teleports`
- `a_slow_and_fast_path_to_one_endpoint_keep_distinct_achieved_speeds`
- `a_left_shield_does_not_change_the_right_swords_inertia_or_cross_the_clear_path`
- `the_latest_eligible_mouse_target_is_accepted_on_the_next_tick`
- `arm_response_is_identical_on_rerun_and_exact_on_replay`
- `the_selected_rates_are_bounded_by_rejected_slower_and_faster_neighbours`

Replace the selected row with its declared slower and faster neighbours, bypass
acceleration, ignore weapon inertia, turn the half-effort path into full effort and hold
one stale browser target. The corresponding test must fail before restore.

## Hash expectations and verification

Session 01's exact-feature audit measured the first changed tick below. `--` means the
complete registered fixture did not reach that constant; the two exact fixtures freeze
their historical bearing pair, which is why both bearing columns are intentionally `--`.
The corrected Session 02 observer records the preconstraint pair, ignores structural entry
overlap until release and detects a later re-entry. That correction changed every reached
crossing tick but none of these rate-reach ticks, so this table and its mover predictions
remain the measured result rather than an inferred carry-over.

| registered pin fixture | bearing max | bearing accel | linear max | linear accel | elbow-plane max |
|---|---:|---:|---:|---:|---:|
| `EMBODIED_CORPUS_DIGEST` | 3 | 1 | 3 | 1 | 1 |
| `EMBODIED_GOLDEN_DIGEST` | 3 | 1 | 3 | 1 | -- |
| `ARTICULATED_COMMAND_HASH` | -- | -- | -- | -- | -- |
| `ARTICULATED_STREAM_DIGEST` | 3 | 1 | 3 | 1 | -- |
| `EXACT_TRAJECTORY_STATE_DIGEST` | -- | -- | -- | 1 | -- |
| `LIFTED_COULOMB_SOLVER_DIGEST` | -- | -- | -- | 1 | -- |

Every reached
state/stream pin is expected to move by value; every unreached pin and every layout,
fingerprint, replay grammar and learned inference digest must remain exact. Re-run the
400-seed mirrored embodied comparison as behavior evidence in addition to the full gate;
a faster arm may change policy outcomes even though no policy source changed.
