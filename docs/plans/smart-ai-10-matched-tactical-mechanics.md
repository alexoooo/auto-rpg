# Smart AI 10 -- match the strike before changing the mechanics

**Status:** calibration complete, `invalid`; held-out was not opened. The reference
seam is parameterized over seed, mirror, target anatomy and all nine frozen offsets,
and each case runs `reference -> tactical -> reference` without bracket drift. Of 900
calibration cases, 519 fail validity: 308 have no reference weapon/body fact, 207 have
multiple or competing reference facts, and six tactical rows fail the tactical
validity conjunction (categories overlap). The command derives aim from public noisy
observation, so missing and ambiguous contacts are measurement results rather than
facts the harness may repair after seeing authority. `--held-out` refuses with exit 2.
No mechanics edit, training run, browser promotion, or `ARTICULATED_HASH` is authorized.

**Goal:** distinguish a controller that loses energy before contact from mechanics
that cannot turn the strongest legal tip crossing into a timely body decision. Measure
one hand-authored strong-tip reference and the tactical controller on the same cases,
then name exactly one successor hypothesis or stop.

Session 06 compared two different questions: a stationary neutral corpus established
that the planner can cross a named region, while a tactical-versus-tactical fight
established that moving fights do not finish. Neither says how much of the strongest
strike the current command vocabulary can express reaches the tactical blade. This
session makes that comparison paired at the case and committed-sweep level.

## Session order and landable boundary

This file is one evidence session with three checkpoints. Each checkpoint must land
green and the next does not begin if its validity conditions fail.

1. **Strong-tip reference and trace.** Parameterize
   [`crates/lab/src/strong_strike.rs`](../../crates/lab/src/strong_strike.rs)
   without copying its command sequence. It submits a fixed legal sequence through
   `World::submit_articulated_v1`: hold measure, chamber for 28 ticks at one eighth
   turn off the target bearing and reach `3/4`, commit for 28 ticks through the
   opposite eighth at reach `1`, then recover. Derive target bearing, weapon hand and
   `CombatHeight` from the same observation and named `RegionVolume` the striker sees;
   do not call `StrikePlanner`, inspect `World`, or reconstruct an actuator. Ties use
   `BodyPart::ALL`, then `LimbSlot`, then raw bearing, matching the planner ordering.
   The landed `strong_strike` seam instead owns one controlled torso case. Parameterize
   that implementation over seed, mirror, target anatomy and offset before phases 2--3
   expand beyond `--quick`; the harness must not fork its command sequence.
2. **Matched tactical corpus.** Run reference and tactical as a bracketed
   `reference -> tactical -> reference` triplet for every scenario, seed and mirror.
   The two reference rows must be byte-equal. Record one row per completed sweep and
   one summary per fight; do not reduce several grazing facts to one apparent blow.
3. **Decision record.** Write the raw CSV plus method and summary to
   `docs/performance/smart-ai-matched-tactical.md`. Select one branch below before any
   authority edit. A mechanics successor gets its own plan and golden budget; it is
   not appended opportunistically to this session.

## Fixed corpus

`lab tactical-mechanics` lives in
[`crates/lab/src/tactical_mechanics.rs`](../../crates/lab/src/tactical_mechanics.rs)
and is dispatched from [`crates/lab/src/main.rs`](../../crates/lab/src/main.rs).

The calibration set is seeds `0..25`, both mirror states, both shipped target
anatomies, and the nine committed approach offsets already frozen as
`APPROACH_OFFSETS`: 900 cases per condition. The held-out decision set is seeds
`900_000..900_100` over the same 36 scenario/orientation rows: 3,600 cases per
condition. Refuse any explicit seed range that overlaps the other set, and print the
scenario fingerprint and ordered seed range in the header. `--quick` is exactly seeds
`0..2`, one Fighter target, the centre offset and both mirrors; it is diagnostic and
cannot print `pass`.

Run three conditions on every case:

- `strong-tip`: the hand-authored reference above against a neutral target;
- `tactical-neutral`: tactical against the identical neutral target;
- `tactical-moving`: tactical against each of composed, windmill, attack-moves and
  tactical, with both bodies using the shipped anatomy/loadout and the same seed.

The first two are the mechanical attribution pair. The moving rows establish whether
the result survives defence and motion; they do not substitute for the pair or get
pooled with it.

## Energy trace and row grammar

Append these fields to a new `TacticalMechanicsRow`; do not change `StrikeRow`, whose
CSV is already evidence for sessions 02--05:

```rust
struct TacticalMechanicsRow {
    condition: TacticalMechanicsCondition,
    scenario_fingerprint: u64,
    seed: u64,
    mirrored: bool,
    target_anatomy: AnatomyChoice,
    approach_offset: Vec2,
    sweep_ordinal: u32,
    intended_region: BodyPart,
    intended_hand: LimbSlot,
    chamber_tick: u32,
    commit_tick: u32,
    recover_tick: u32,
    first_cross_tick: Option<u32>,
    first_contact_tick: Option<u32>,
    requested_tip_travel_raw: i32,
    actual_tip_travel_raw: i32,
    peak_tip_speed_raw: i32,
    peak_relative_closing_speed_raw: i32,
    energy_before_raw: u64,
    dissipated_raw: u64,
    cut_raw: u64,
    thrust_raw: u64,
    pressure_raw: u64,
    intended_region_integrity_before_raw: i32,
    intended_region_integrity_after_raw: i32,
    severed: bool,
    body_decided_tick: Option<u32>,
    refusals: u32,
    solver_rejections: u32,
    max_energy_excess_raw: u64,
}
```

`requested_tip_travel_raw` is the distance between consecutive commanded segment
endpoints; `actual_tip_travel_raw` and `peak_tip_speed_raw` come from consecutive
published weapon poses. `peak_relative_closing_speed_raw` must use the same collider
relative velocity consumed by contact energy, exposed as Lab-only diagnostic data if
necessary; it may not be reverse-engineered from the resolved energy. Copy the exact
`ContactResolution` ledgers (`before`, `dissipated`, cut, thrust and pressure) from the
world immediately after each step, as the existing articulated loop does at
[`crates/lab/src/main.rs#L872`](../../crates/lab/src/main.rs#L872). Attribute only a
`WeaponBody` fact owned by the intended hand and intended opponent region.

The drafted waterfall included two values the current public seam cannot report.
`ContactResolution` publishes the whole group's dissipated ledger and post-floor
cut/thrust/pressure channels, not a per-fact allocated share; armour penetration is
applied inside `World`, which publishes only resulting integrity and wound fractions.
Do not infer either backwards. The observable waterfall is positive normal closing ->
group dissipation -> positive post-floor channel -> cut/thrust -> axial integrity loss
-> open cut wound. Integrity loss and wound gain remain separate: thrust may produce
the former without the latter.

Write raw rows in stable `(condition, fingerprint, seed, mirrored, target anatomy,
offset x, offset y, sweep ordinal)` order. Hash the UTF-8 CSV bytes with SHA-256 and
record that digest in the evidence document. CSV is an evidence artifact, not a new
simulation golden.

## Predeclared summaries and thresholds

Report counts and Wilson 95% intervals for crossings, contacts, nonzero wound energy,
severances and body decisions. Report median plus `[p10, p90]` for actual/requested tip
travel, relative closing speed, energy before, dissipated energy, wound energy and
integrity loss. For tactical minus reference, report paired per-case differences and
a deterministic 10,000-resample percentile interval seeded with `20_261_010`; preserve
case pairing during resampling. A maximum is printed only as a safety tail, never as a
tuning statistic.

The held-out result is classified without changing these thresholds:

- **Invalid:** either bracket reference differs, any command is refused, any solver
  tick is rejected, any contact appears without a geometric crossing, or observed
  energy excess is nonzero. Fix measurement or correctness and rerun; do not interpret
  combat strength.
- **Controller successor:** strong-tip reaches the named region in at least 95% of
  cases, carries nonzero wound energy in at least 90%, and decides at least 95 of each
  100-seed mirrored neutral pairs by tick 1,800, while tactical falls below any of
  those floors or its paired median energy-before ratio is below 80% of reference.
  Mechanics are demonstrably expressive; revise targeting, measure, phase timing or
  feedback before touching authority.
- **Mechanics successor:** strong-tip itself crosses at least 95% but has nonzero
  wound energy below 90% or fewer than 95 of 100-seed mirrored neutral pairs decide
  by tick 1,800. Choose the first failed link in the trace: actual/requested travel,
  relative closing speed, energy allocation, or integrity conversion. The successor
  plan may change only that link and must bracket it against this frozen reference.
- **Tactical prerequisite passes:** tactical-neutral clears the same three absolute
  floors, its paired median energy-before ratio is at least 80%, and the lower bound
  for its crossing and nonzero-wound-rate differences is no worse than -5 percentage
  points from strong-tip. Then rerun the 100-seed moving rows. Session 08 may reopen
  only if at least 95 of 100 mirrored tactical-versus-tactical fights are body-decided
  by tick 1,800 with at least 90% named-region crossings and zero validity failures.

No condition passes by point decisions at the clock. Do not combine the four moving
opponents to manufacture a larger `n`; print each separately.

## Tests -- and required red demonstrations

Add these exact tests in `crates/lab/src/tactical_mechanics.rs`:

```rust
#[test]
fn the_strong_tip_reference_uses_only_public_observation_and_legal_commands() {}
#[test]
fn matched_rows_share_scenario_seed_mirror_target_and_offset() {}
#[test]
fn bracketed_reference_rows_are_byte_identical() {}
#[test]
fn one_resolution_is_attributed_only_to_its_intended_hand_region_and_sweep() {}
#[test]
fn a_contact_without_a_geometric_crossing_invalidates_the_corpus() {}
#[test]
fn calibration_and_held_out_seed_ranges_are_disjoint() {}
#[test]
fn a_quick_run_cannot_print_a_gate_decision() {}
#[test]
fn paired_resampling_keeps_both_conditions_on_the_same_case() {}
```

Show `matched_rows...` fail by adding one to the tactical seed, the attribution test
fail by accepting the other hand, and `a_quick_run...` fail by removing its refusal.
These mutations are local demonstrations and are reverted before the evidence run.

## Golden and authority budget

The instrumentation, strong-tip policy, matched harness and evidence must move no
registered hash. In particular all six legacy hashes, `ARTICULATED_COMMAND_HASH`,
`CONTACT_BEHAVIOR_DIGEST`, `ARTICULATED_STREAM_DIGEST`, both combat-spec identities,
and `LEARNED_INFERENCE_DIGEST` remain byte-identical. `ARTICULATED_HASH` remains absent.

This session does not pre-authorize a generic mechanics re-record. The successor plan
must state its exact path before editing:

- a closing-velocity or resolution-energy change is expected to move
  `CONTACT_BEHAVIOR_DIGEST` and `ARTICULATED_STREAM_DIGEST`, while
  `ARTICULATED_COMMAND_HASH`, both spec identities, every legacy pin and
  `LEARNED_INFERENCE_DIGEST` must not move;
- an anatomy/equipment table change owns the combat spec-table digest and both shipped
  duel fingerprints, and must separately prove whether construction pose bytes move
  `ARTICULATED_COMMAND_HASH` and whether the portable stream reaches the changed row;
- a policy/controller correction moves none of those pins.

An unpredicted move is a bug, not permission to widen the successor's budget.

## Exact commands

```powershell
cargo test -p lab strike_corpus
cargo run --release -p lab -- tactical-mechanics --quick
cargo run --release -p lab -- tactical-mechanics --calibration --write target/smart-ai-10-calibration.csv
cargo run --release -p lab -- tactical-mechanics --held-out --write artifacts/smart-ai-10-held-out.csv
cargo run --release -p lab -- articulated --seeds 100 --mirrored --policy tactical
cargo test -p lab
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```

The calibration CSV may live under `target/`; the held-out CSV is retained only if
the repository's artifact policy admits it, otherwise record its SHA-256, byte count,
header, generation command and complete summary in the performance document. Never
commit a partial file as the held-out corpus.
