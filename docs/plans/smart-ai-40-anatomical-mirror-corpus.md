# Smart AI 40 -- anatomical planar-mirror corpus

**Status:** stopped and refuted at checkpoint B on 2026-08-13. The complete release
audit evaluated all 7,560 central orientations in `3,832,944` ms; the enclosing
command reported `3,836.5` seconds. It found 57 eligible plain individuals and zero
eligible mirror individuals, hence zero local runs, zero robust pairs, and no
selection. Swapping anatomical limbs and reflected loadouts did not restore physical
symmetry. Checkpoint C did not run. Existing registered-pin movement and new-pin
budgets remained zero.

[Smart39](smart-ai-39-ordinary-strike-corpus.md#measured-result----stopped) kept the
Hero's sword in `RightArm`, its shield in `LeftArm`, and the Brute's club in
`RightArm` on both spatial sides. With the shipped yaw fixed at zero/`HALF`, an
anatomical right shoulder does not map to anatomical right under reflection across
the fighter's forward plane: it maps to left. The old comparison therefore paired a
right-handed plain trajectory with a different right-handed trajectory, not with its
physical reflection. Finding 57 eligible individuals, all `mirrored=false`, is
consistent with that diagnosis. It is evidence for this predeclared correction, not
permission to change the response law or search for a damaging row.

Smart40 reruns Smart39's exact central grid, local product, eligibility, mapping
tolerances, maximin physical-dissipation selector, shard count, and deterministic
tie-break. It changes only the mirror transform described below. Damage, anatomy
loss, wounds, severance, winner, and policy score remain excluded from selection.

## Checkpoint A -- prove the reflection before measuring it

Keep the implementation in
[`crates/lab/src/strong_strike.rs`](../../crates/lab/src/strong_strike.rs#L168) and
the audit entry point in
[`tactical_mechanics.rs`](../../crates/lab/src/tactical_mechanics.rs#L251). Add a
separate `tactical-mechanics --anatomical-mirror-corpus` mode rather than changing
what the completed Smart39 `--strike-corpus` command means. Both modes reuse the
same measurement, stripped mechanical rows, ranking, checksum writer, and four
contiguous ordinal shards. Update the refusal/help text in
[`main.rs`](../../crates/lab/src/main.rs#L113).

Define the physical reflection across `y = 8` as:

```text
point P(x,y,z)       -> P'(x, 16-y, z)
vector V(x,y,z)      -> V'(x, -y, z)
angle a              -> -a
LeftArm (slot 0)     <-> RightArm (slot 1)
body slot 0xff       -> body slot 0xff
entity/faction       -> unchanged
```

The plain Hero keeps the shipped `[left shield, right sword]` loadout and attacks
with `RightArm`. The mirror Hero carries `[left sword, right shield]` and attacks
with `LeftArm`. Reflect every other held row too: swap the mirror target's two hand
entries, so the shipped Brute's right club becomes a left club. `DuelConfigV1` binds
an item from its hand index, so swap the `Option<HandItemV1>` entries before
`Scenario::duel_from`; do not reuse a right-bound equipment row in the left hand.
Target anatomy, stats, item geometry/material, entity, faction, and seed remain
unchanged.

In `measure_case_schedule`, choose the attacking limb from the orientation:

```rust
let attacking_limb = if case.mirrored {
    LimbSlot::LeftArm
} else {
    LimbSlot::RightArm
};
```

Write the chamber/follow target into `command.arms[attacking_limb as usize]`; the
other arm remains neutral. Attribute the weapon/body fact to that same limb. Negate
both schedule bearings on the mirror. Reflect the approach offset `(x,y) -> (x,-y)`
as before. The shipped zero and `HALF` body yaws stay unchanged because both are
their own reflected headings.

Before the release audit, add exact construction and pose tests:

```rust
#[test] fn anatomical_mirror_swaps_every_hand_binding_and_preserves_item_specs() {}
#[test] fn anatomical_mirror_maps_spawn_yaw_hands_weapon_and_shield_exactly() {}
#[test] fn anatomical_mirror_commands_left_with_the_negated_right_arm_schedule() {}
#[test] fn anatomical_mirror_maps_contact_key_limb_slots_without_swapping_entities() {}
```

The construction test compares the scenarios before stepping: Hero shield/sword and
target empty/club hand slots are swapped; action, mass, balance, geometry, anatomy,
stats, faction, and identities are otherwise byte-equal. The pose test observes both
worlds at tick zero and requires exact mapped body position, shoulder/hand positions,
weapon hilt/tip/radius, and shield corner set. Points use `(x,16-y,z)` and velocity or
normal vectors use `(x,-y,z)`. A reflection reverses shield corner winding, so compare
corners after the one explicit index permutation derived by the test, not after a
sort that could conceal duplication. It also checks right-arm plain pose maps to
left-arm mirror pose and left maps to right.

The command test captures every submitted chamber/follow row without stepping and
asserts: the mirror's left target is the exact negative angle with identical height,
reach, and effort; its right target is neutral; and the plain has the converse. The
key test maps any held slot by `0 <-> 1`, preserves `BODY_SLOT`, kind, region, entity,
and faction, and must fail if same-slot equality is restored.

These are prerequisites rather than post-run explanations. Deliberately omit the
loadout swap, command the mirror's right arm, and preserve a held `ContactKey` slot;
watch the three corresponding tests fail independently, then restore them.

## Checkpoint B -- unchanged bounded audit under the corrected mirror

Reuse Smart39's literal central domain without adding or removing a word:

```rust
const INTERIOR_CHAMBER_TICKS: [u32; 7] = [8, 12, 16, 20, 24, 28, 32];
const INTERIOR_STRIKE_TICKS: [u32; 6] = [12, 16, 20, 24, 28, 32];
const INTERIOR_REACH_TARGETS_RAW: [i32; 5] =
    [32_768, 40_960, 49_152, 57_344, 61_440];
// Existing nine APPROACH_OFFSETS, target order [Fighter, Brute], seed 0.
```

Enumeration remains chamber, strike, reach, target anatomy, approach offset, then
plain/mirror: `7 * 6 * 5 * 2 * 9 * 2 = 7_560` central oriented runs. Use exactly four
contiguous ordinal shards with 16 MiB stacks, join in ordinal order, and run all
central cases without early exit. The only input difference from Smart39 is the
predeclared anatomical mirror flag; include a mirror-grammar version word in the
unregistered audit checksum so the two receipts cannot alias.

Central eligibility is byte-for-byte Smart39's predicate: one uniquely attributed
attacking-weapon/body contact, observed crossing, contact reach in
`[ONE/4 + 1_024, ONE - 1_024]`, nonzero arm/hilt/tip motion, nonzero selected impulse
and physical dissipation, `group_alpha_raw == 65_536`, and zero command refusal,
solver rejection, competing fact, cap, or energy increase. Selection receives only
the stripped `MechanicalRow`, never its `DamageSidecar`.

For every centrally eligible corrected mirror pair, run Smart39's unchanged local
product with chamber fixed:

```rust
const STRIKE_TICK_DELTAS: [i32; 3] = [-1, 0, 1];
const REACH_DELTAS_RAW: [i32; 3] = [-256, 0, 256];
```

Order remains strike delta, reach delta, then plain/mirror: nine cases per side,
eighteen per eligible pair. Run all local cases for every eligible pair even after a
robust pair exists. A robust pair requires all eighteen eligible. For each local
plain/mirror pair, map its `ContactKey` by swapping held slots `0 <-> 1` while
preserving body slot and entities; require the same region and exact physical
dissipation, TOI within one raw word, and point, normal, and impulse under the
point/vector reflection within one raw word per component. These are Smart39's
tolerances, not new fitting knobs.

Select among all robust pairs by the unchanged order:

1. maximise minimum physical `energy_dissipated_raw` across eighteen cases;
2. minimise central `chamber_ticks + strike_ticks`;
3. minimise central ordinal.

Required audit tests:

```rust
#[test] fn anatomical_mirror_reuses_all_7560_central_orientations_without_early_exit() {}
#[test] fn anatomical_local_freeze_has_eighteen_orientations_for_every_eligible_pair() {}
#[test] fn anatomical_pair_mapping_swaps_only_held_contact_slots() {}
#[test] fn anatomical_selection_is_maximin_dissipation_then_duration_then_ordinal() {}
#[test] fn anatomical_selection_is_unchanged_by_contradictory_damage_sidecars() {}
#[test] fn smart39_and_smart40_differ_only_in_the_declared_mirror_grammar() {}
#[test] #[ignore = "bounded Smart40 anatomical-mirror audit; use release CLI"]
fn select_the_predeclared_anatomical_mirror_corpus() {}
```

The last comparison serializes every central input before World construction and
allows differences only in mirrored spawn Y, swapped hand bindings, attacking limb,
and negated schedule bearings. It rejects a changed solver bound, anatomy, timing,
reach, offset, effort, item dimension, or selection tolerance.

Run exactly once, with no measurement-dependent arguments:

```powershell
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --anatomical-mirror-corpus
```

Print the elapsed time, central/local counts, overlapping predicate counters,
eligible counts by orientation, robust keys, selection, and checksum. If no robust
pair exists, stop and preserve the complete failure without changing the mirror,
domain, law, tolerance, or damage exclusion. If every eligible row remains on one
side, this symmetry diagnosis is refuted; do not add another transform inside this
session.

### Measured result -- stopped and refuted

The exact four-shard audit completed all 7,560 central orientations. Its internal
timer reported `elapsed_ms=3832944`; the command wall report was `3,836.5` seconds.
It found `eligible_plain=57`, `eligible_mirror=0`, `local_runs=0`,
`robust_pairs=0`, and `selected=none`. The overlapping predicate counters were:

```text
missing_or_attribution=5792  crossing=7138  reach=6940  motion=6935
impulse=6033                 dissipation=6233
refusal=0                    solver=3309     cap=0       energy=0
alpha=5792
checksum=3e8c6246190b6b28
```

The counters are independent predicate failures and therefore do not sum to the
corpus size. The result is the plan's named refutation: the corrected anatomical
reflection left every eligible central row on the plain side. The declared stop path
ran before any local or outcome measurement. No mirror, grid, tolerance, law, or
selection key was changed after seeing it, and no successor is declared here.

## Checkpoint C -- literal sim gate after selection only

Only if checkpoint B selects a robust pair, paste its literal anatomy, offset,
chamber/strike ticks, reach, ordinal, mirror-grammar version, and audit checksum into
the feature-only fixture beside
[`measure_ordinary_lifted_strike`](../../crates/sim/src/world.rs#L9736). Do not rerun
the Lab selector inside sim. Replace Smart38's ignored failed-corpus gates with:

```rust
#[test] fn anatomical_mirror_strike_and_eighteen_cases_pass_the_mechanical_gate() {}
#[test] fn anatomical_mirror_strike_retains_both_remainders_across_the_following_tick() {}
#[test] fn mechanically_selected_anatomical_centre_records_a_strong_wound_after_selection() {}
#[test] fn anatomical_mirror_held_controls_are_inert() {}
#[test] fn anatomical_gate_refuses_direct_pose_or_exact_state_provenance() {}
```

The first two tests read mechanics only and reproduce the exact limb/loadout/key
mapping plus Smart39's local product and tolerances. The outcome test remains after
selection and requires, on each centre, positive cut or thrust and at least `6_554`
raw attributed-region integrity loss. If the mechanically selected pair misses that
predeclared bar, stop; do not choose a more damaging runner-up. Each held control
changes only the attacking limb's effort from `ONE` to `ZERO` and must publish no
weapon/body contact, energy, anatomy change, refusal, or cap.

Then replace the ordinary schedule in
[`crates/sim/src/replay.rs`](../../crates/sim/src/replay.rs#L407) with the selected
literal pair while preserving the wall/cap purpose. Require at least two accepted
breakpoints, both exact remainder classes, ordinary release, no `ExactSolver`
refusal, and tick-for-tick live/rerun/recorded-command replay equality. This is the
corpus prerequisite for Smart38's native/wasm digest checkpoint; Smart40 registers
no digest itself.

## Evidence and pin budget

On either stop or pass, add the declared anatomical transform, full counters, audit
checksum, and conclusion to
[`v2-articulated-contact-research.md`](../performance/v2-articulated-contact-research.md).
Do not erase Smart39's one-sided result; the before/after comparison is the argument.

**Existing registered pin movement budget: zero. Smart40 may add no pin.** In
particular `LAB_HASH`, `ROOM_HASH`, `BATTLE_HASH`, `SWAP_HASH`, `BOW_HASH`,
`ARTICULATED_COMMAND_HASH`, `ARTICULATED_STREAM_DIGEST`,
`CONTACT_BEHAVIOR_DIGEST`, contact-format pins, combat fingerprints,
`LEARNED_INFERENCE_DIGEST`, and any registered exact-trajectory digest remain fixed.
`LIFTED_COULOMB_SOLVER_DIGEST`, if absent, remains Smart38's later one-time
native/wasm agreement. Any existing move stops the session and is not re-recorded.

## Verification

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p lab anatomical_mirror -- --nocapture
cargo test -p lab --features cartesian-recoil anatomical_mirror -- --nocapture
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --anatomical-mirror-corpus
cargo test -p sim anatomical_mirror_strike -- --nocapture
cargo test -p sim --features cartesian-recoil anatomical_mirror_strike -- --nocapture
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

`wasm_check.js` checks the artifact already present, so run it immediately after its
matching build. No development server or browser is needed for this corpus session.
Arena promotion and visible review remain later boundaries after a robust strike,
Smart38's digest, and tactical calibration all pass.
