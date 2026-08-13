# Smart AI 41 -- noise-free mirrored strike schedule

**Status:** stopped and refuted at checkpoint B on 2026-08-13. The complete release
audit evaluated all 7,560 central orientations in `2,854,599` ms; the enclosing
command reported `2,857.4` seconds. It found 109 eligible plain individuals and zero
eligible mirror individuals, hence zero local runs, zero robust pairs, and no
selection. Removing perception noise from the schedule bearing increased plain-side
eligibility but did not restore mirror symmetry. Checkpoint C did not run, and no
successor is declared. Existing registered-pin movement and new-pin budgets remained
zero.

Smart40 proved the anatomical/loadout reflection and still found all 57 eligible
central rows on the plain side. A pre-tick comparison then isolated one asymmetric input:
[`measure_case_schedule`](../../crates/lab/src/strong_strike.rs#L227) derives its
schedule bearing from the first `ObservedOpponent`, whose reported position may
contain deterministic perception noise. This successor changes only that bearing
source. Existing registered-pin movement and new-pin budgets are zero.

Smart41 reuses Smart40's exact anatomical mirror, central domain, enumeration, four
shards, local product, eligibility, one-word mapping tolerances, maximin physical
dissipation ranking, damage exclusion, and stop/pass handoff. It does not alter
perception authority or make hidden truth available to a policy. This is a controlled
Lab schedule whose declared spawn geometry is already its own input; deriving the
command from that declaration removes observation noise from the fixture rather than
from the game.

## Checkpoint A -- one production helper, exact schedule proof

Keep the implementation in
[`crates/lab/src/strong_strike.rs`](../../crates/lab/src/strong_strike.rs#L168).
Extract one crate-private pure helper used by the production corpus measurement:

```rust
fn declared_schedule_bearing(case: StrongCase) -> Angle {
    let offset = if case.mirrored {
        Vec2::new(case.approach_offset.x, -case.approach_offset.y)
    } else {
        case.approach_offset
    };
    (-offset).angle()
}
```

`approach_offset` is target-to-attacker in `scenario_for_ticks`; therefore
`-offset` is the attacker-to-target vector. Use this helper once before chambering
and retain the returned `Angle` for the whole run. Delete only the schedule-bearing
read of `shown.opponents().first().body_position`. Continue using ordinary
`observe_articulated` for commands, published weapon poses, target regions, contact
attribution, crossing, damage sidecars, and every other measurement. Do not add a
World truth getter or change `ArticulatedObservation`.

The anatomical mirror remains Smart40's exact transform: reflect points by
`(x,y,z) -> (x,16-y,z)`, vectors by `(x,y,z) -> (x,-y,z)`, swap every left/right
hand binding, command the plain Hero's `RightArm` and mirror Hero's `LeftArm`, map
held `ContactKey` slots `0 <-> 1`, and preserve entity/faction/body slot. Chamber and
follow are still `bearing - arc` and `bearing + arc`; the mirror's complete schedule
must be the exact angular negation of the plain schedule.

Required tests run the real helper, not a duplicate expression in test code:

```rust
#[test] fn declared_schedule_bearings_are_exact_negations_at_ordinal_1536() {}
#[test] fn perception_noise_cannot_enter_the_declared_schedule_bearing() {}
#[test] fn smart40_and_smart41_inputs_differ_only_in_schedule_bearing_source() {}
#[test] fn noise_free_schedule_still_submits_only_ordinary_articulated_commands() {}
```

Resolve ordinal `1536` through `declared_central_cases()` rather than spelling its
fields twice. Construct its plain and anatomical-mirror `StrongCase`, call the
production helper, build chamber/follow angles through the production schedule
helper, and require both mirror angles to equal exact wrapping negation of their
plain counterparts. Also require the reflected spawn and swapped attacking limb so
the bearing assertion cannot pass against two unrelated schedules.

For the noise test, construct two `ArticulatedObservation` copies whose opponent rows
report different legal positions/noise while the same `StrongCase` is passed to the
production helper. Both schedule bearings and commands must be byte-equal. Make the
test red by temporarily restoring `foe.body_position - shown.body_position` as the
bearing source. A test that calls a pure helper without routing production through it
does not satisfy this gate.

The Smart40/41 comparison serializes every input before `World::new` and every
submitted schedule row. It permits one difference in derivation metadata --
`ObservedOpponent` versus `DeclaredSpawnOffset` -- and the resulting bearing/command
bytes implied by that source. It requires exact equality for central ordinal,
anatomy, offset, chamber/strike/reach, seed, loadout reflection, attacking limb,
effort, target height, local deltas, solver bounds, eligibility, mirror tolerances,
and selection key. It must reject any changed domain word disguised as the bearing
correction.

Add a source-owned enum only to the Lab audit grammar:

```rust
#[repr(u8)]
enum ScheduleBearingSource {
    ObservedOpponent = 40,
    DeclaredSpawnOffset = 41,
}
```

Smart41's unregistered checksum writes `41` before the unchanged arrays and selected
rows. Smart40's completed checksum remains `3e8c6246190b6b28`; do not retroactively
recompute or rename it.

## Checkpoint B -- unchanged bounded audit with source 41

Add a separate
`tactical-mechanics --noise-free-mirror-corpus` mode in
[`tactical_mechanics.rs`](../../crates/lab/src/tactical_mechanics.rs#L251) and the
help/refusal text in [`main.rs`](../../crates/lab/src/main.rs#L113). Do not change the
meaning of completed `--strike-corpus` or `--anatomical-mirror-corpus` evidence.

The central domain remains literal and unchanged:

```rust
const INTERIOR_CHAMBER_TICKS: [u32; 7] = [8, 12, 16, 20, 24, 28, 32];
const INTERIOR_STRIKE_TICKS: [u32; 6] = [12, 16, 20, 24, 28, 32];
const INTERIOR_REACH_TARGETS_RAW: [i32; 5] =
    [32_768, 40_960, 49_152, 57_344, 61_440];
// Existing nine APPROACH_OFFSETS, [Fighter, Brute], seed 0, both orientations.
```

Enumeration is chamber, strike, reach, target anatomy, approach offset, then
plain/anatomical mirror: `7 * 6 * 5 * 2 * 9 * 2 = 7_560` central oriented runs.
Run exactly four contiguous ordinal shards on 16 MiB stacks, join in ordinal order,
and evaluate all central cases without early exit. The anatomical loadout/limb/key
grammar is byte-for-byte Smart40. Only `declared_schedule_bearing` supplies the base
angle.

Central eligibility is unchanged: exactly one uniquely attributed attacking-weapon
body contact; observed crossing; contact reach in
`[ONE/4 + 1_024, ONE - 1_024]`; nonzero arm, hilt, and tip motion; nonzero selected
impulse and physical dissipation; `group_alpha_raw == 65_536`; and zero command
refusal, exact-solver rejection, competing fact, cap, or energy increase. Selection
accepts stripped `MechanicalRow` values only; damage sidecars cannot affect it.

For every centrally eligible anatomical mirror pair, run the unchanged local product
with chamber fixed:

```rust
const STRIKE_TICK_DELTAS: [i32; 3] = [-1, 0, 1];
const REACH_DELTAS_RAW: [i32; 3] = [-256, 0, 256];
```

Order remains strike delta, reach delta, then plain/mirror: eighteen oriented cases
per eligible pair. Run all local cases for all eligible pairs even after a robust pair
exists. Robust mapping swaps held key slots, preserves body/entity/kind/region,
requires exact physical dissipation, and allows one raw word for TOI and each mapped
point/normal/impulse component -- exactly Smart40's contract.

Selection remains:

1. maximise minimum physical `energy_dissipated_raw` across eighteen cases;
2. minimise central `chamber_ticks + strike_ticks`;
3. minimise central ordinal.

Required audit tests:

```rust
#[test] fn source_41_reuses_all_7560_central_orientations_without_early_exit() {}
#[test] fn source_41_runs_eighteen_local_orientations_for_every_eligible_pair() {}
#[test] fn source_41_retains_anatomical_slot_and_pose_mapping() {}
#[test] fn source_41_selection_is_maximin_then_duration_then_ordinal() {}
#[test] fn source_41_selection_ignores_contradictory_damage_sidecars() {}
#[test] fn source_41_checksum_cannot_alias_the_smart40_grammar() {}
#[test] #[ignore = "bounded Smart41 noise-free mirror audit; use release CLI"]
fn select_the_predeclared_noise_free_mirror_corpus() {}
```

Run once, with no measurement-dependent arguments:

```powershell
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --noise-free-mirror-corpus
```

Print elapsed time, central/local counts, overlapping predicate counters, eligible
counts by orientation, robust keys, selection, bearing-source version `41`, and
checksum. If no robust pair exists, stop and preserve the failure without changing
the bearing source, reflection, domain, solver, tolerance, or selector. If eligible
rows remain one-sided, the observation-noise diagnosis is refuted for this exact
corpus. Do not declare another bearing correction inside this session.

### Measured result -- stopped and refuted

The exact four-shard source-41 audit completed all 7,560 central orientations. Its
internal timer reported `elapsed_ms=2854599`; the command wall report was `2,857.4`
seconds. It found `eligible_plain=109`, `eligible_mirror=0`, `local_runs=0`,
`robust_pairs=0`, and `selected=none`. The overlapping predicate counters were:

```text
missing_or_attribution=5830  crossing=7092  reach=6695  motion=6685
impulse=6040                 dissipation=6188
refusal=0                    solver=3218     cap=0       energy=0
alpha=5830
checksum=8ae36d7d170892dd
```

The counters are independent predicate failures and therefore do not sum to 7,560.
Deriving the schedule from declared spawn geometry nearly doubled plain eligibility
from Smart40's 57 to 109, but produced no eligible mirror row. That is the declared
refutation of the bearing-only hypothesis. The stop path ran before local or outcome
measurement; no domain, reflection, law, tolerance, or selector changed after the
result, and checkpoint C below remains the unexecuted pass contract.

## Checkpoint C -- pass handoff only after selection

Only if checkpoint B selects a robust pair, paste its literal anatomy, offset,
chamber/strike ticks, reach, ordinal, source version `41`, and audit checksum into the
feature-only sim fixture beside
[`measure_ordinary_lifted_strike`](../../crates/sim/src/world.rs#L9736). The sim gate
must reproduce the declared-spawn schedule directly; it must not rerun the Lab search
or read an opponent observation to derive the base bearing.

Required gates:

```rust
#[test] fn noise_free_mirror_strike_and_eighteen_cases_pass_the_mechanical_gate() {}
#[test] fn noise_free_mirror_strike_retains_both_remainders_across_the_following_tick() {}
#[test] fn noise_free_selected_centre_records_a_strong_wound_after_selection() {}
#[test] fn noise_free_mirror_held_controls_are_inert() {}
#[test] fn noise_free_gate_refuses_direct_pose_or_exact_state_provenance() {}
```

Mechanics uses Smart40's exact local and anatomical mapping. Outcome remains strictly
post-selection: each centre needs positive cut or thrust and at least `6_554` raw
attributed-region integrity loss. Failure stops; never choose a damaging runner-up.
Held controls change only attacking-limb effort to zero and must publish no contact,
energy, anatomy change, refusal, or cap.

Then replace the ordinary schedule in
[`crates/sim/src/replay.rs`](../../crates/sim/src/replay.rs#L407) with the selected
literal pair. Require at least two accepted breakpoints, both exact remainder classes,
ordinary release, no `ExactSolver` refusal, and tick-for-tick live/rerun/recorded
command equality. Record pass or stop beside Smart39/40 in
[`v2-articulated-contact-research.md`](../performance/v2-articulated-contact-research.md).
Smart38 still owns later native/wasm digest registration.

## Pin budget and verification

**Existing registered pin movement budget: zero. Smart41 may add no pin.** The
source-41 checksum is an unregistered research receipt. Every legacy, articulated,
contact-format, combat, inference, and registered exact-trajectory pin remains fixed.
Any movement stops the session and is not re-recorded.

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p lab declared_schedule -- --nocapture
cargo test -p lab --features cartesian-recoil noise_free -- --nocapture
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --noise-free-mirror-corpus
cargo test -p sim noise_free_mirror_strike -- --nocapture
cargo test -p sim --features cartesian-recoil noise_free_mirror_strike -- --nocapture
cargo test -p sim --features cartesian-recoil exact_trajectory_replay -- --nocapture

cargo test -p sim
cargo test -p sim --features cartesian-recoil
cargo test -p lab
cargo test -p lab --features cartesian-recoil
cargo test
cargo test -p web
cargo test -p web --features cartesian-recoil

cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
node --test tools/wasm_check.js

node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

`wasm_check.js` checks the artifact already present; run it immediately after its
matching build. No development server or browser is needed for this corpus session.
