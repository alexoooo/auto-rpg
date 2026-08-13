# Smart AI 42 -- measurement fidelity and rejection provenance

**Status:** complete on 2026-08-13. Checkpoints A/B repaired the Lab witness and added
feature-only exact rejection provenance. The sole authorized ordinal-1536 trace first
diverged at tick 1, phase `PostStepPose`: `right.hand.y 442259|442260`, with causes
`none|none`. `Config`, `Command`, and `PreStepPose` mapped exactly. The first cause
is therefore a one-raw actuator fixed-point reflection bias before contact, not the
detector, lifted solver, or rejection handling. No full corpus ran and no pin moved.

Smart42 changes no contact law, solver bound, command domain, mirror grammar, damage
rule, policy, hash, replay encoding, or browser ABI. Existing registered-pin movement
and new-pin budgets are zero. A full Smart39/40/41 corpus is explicitly out of scope.

## Diagnosed measurement defects

The anatomical mirror correctly chooses its attacking limb, and contact attribution
already reads that limb. Two later measurements do not:

1. [`measure_case_schedule_with`](../../crates/lab/src/strong_strike.rs#L345)
   reconstructs shoulder, reach, and arm motion from `arms[1]` unconditionally.
   On the source-41 mirror the sword is in `LeftArm` (`arms[0]`), so a real left-arm
   contact is graded using the neutral right shield arm.
2. The crossing oracle stores the target region from
   `attacker_before.opponents()`. Opponent geometry is perception-noised by contract.
   The contact solver crossed authoritative geometry; judging that fact against a
   separately noised capsule can reject a real crossing asymmetrically.

The audits also count `ExactSolver` refusals but retain only the first payloadless
cause for the whole fight. A refused tick publishes no `ContactResolution`, so Lab
cannot say which phase or contact pair diverged. Before interpreting another corpus,
the focused trace needs the first rejected tick, exact outer cause, rejection phase,
and canonical key when the failing operation owns one unambiguously.

## Checkpoint A -- repair the Lab witness

Keep the changes in
[`crates/lab/src/strong_strike.rs`](../../crates/lab/src/strong_strike.rs#L168).
The production measurement must use one local `limb_index = limb as usize` for every
attacking-arm read: configured weapon, hand, velocity, shoulder side, reach, command,
and attribution. Compute shoulder side from the selected limb, not from the old
right-arm literal:

```rust
let side = if limb == LimbSlot::LeftArm {
    anatomy.shoulder_half_width
} else {
    -anatomy.shoulder_half_width
};
let shoulder = attacker_before.body_position + Vec3::new(
    -yaw.sin() * side, yaw.cos() * side, anatomy.shoulder_height,
);
let hand = attacker_before.arms[limb_index].hand;
let planar = Vec2::new(hand.x - shoulder.x, hand.y - shoulder.y);
answer.contact_reach_raw = Some((planar.length() / attacker_before.arm_length).raw());
answer.contact_arm_velocity = attacker_before.arms[limb_index].velocity;
```

Do not “fix” this by weakening `FAILURE_REACH` or `FAILURE_MOTION`. The same physical
predicate must read the limb that owns the attributed weapon.

Replace only the crossing oracle's region source with ground-truth presentation
state. Before each step retain the defender's public
[`ArticulatedPose`](../../crates/sim/src/pose.rs#L99), select its anatomy row from the
configured Scenario's `CombatSpecTableV1`, and call
[`body_region_volumes`](../../crates/sim/src/combat/geometry.rs#L194) with its body,
yaw, two hands, and presence derived from `severed_mask`. After the step build the
requested volume the same way. Test the weapon's previous/requested segment against
the target region's previous/requested lower/upper endpoints. This is the exact
noise-free geometry publication already intended for render/trace diagnostics; it
does not expose hidden state to a policy or modify authority.

Add a Lab-only value carrying both region endpoints so `observed_crossing` cannot
silently collapse a moving arm region back to one static capsule:

```rust
struct CrossingOracle {
    previous: RegionVolume,
    requested: RegionVolume,
}
```

Use `swept_segment_segment(previous weapon, requested weapon, previous region,
requested region)` with the existing radii. Remove the perception-derived
`observed_contact_region` from mechanical eligibility. A damage sidecar may retain
whatever presentation fields it needs, but selection receives only the oracle's
boolean.

Required tests:

```rust
#[test] fn mirrored_reach_and_motion_are_read_from_the_attributed_left_weapon_limb() {}
#[test] fn swapping_only_the_neutral_right_arm_cannot_change_mirrored_eligibility() {}
#[test] fn noise_free_crossing_uses_ground_truth_previous_and_requested_region_geometry() {}
#[test] fn opponent_perception_noise_cannot_change_the_crossing_oracle() {}
#[test] fn deleting_the_requested_region_motion_breaks_the_crossing_fixture() {}
```

Make the first test red by restoring `arms[1]`. Make the noise test red by routing
the oracle back through `attacker_before.opponents()`. Make the moving-region test
red by feeding `previous` twice. Restore all three before checkpoint B.

## Checkpoint B -- minimal exact-rejection provenance

Add one feature-only evidence type beside
[`ResolutionError`](../../crates/sim/src/combat/resolution.rs#L76), re-exported from
`crates/sim/src/lib.rs` only under `cartesian-recoil`:

```rust
#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ExactContactRejectPhase {
    BuildTrajectories,
    Preflight,
    Scan,
    Recompute,
    Closure,
    SolveGroup,
    ApplyGroup,
    Lifecycle,
    Finish,
    StageCommit,
}

#[cfg(feature = "cartesian-recoil")]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ExactContactRejectionDiagnostic {
    pub tick: u32,
    pub phase: ExactContactRejectPhase,
    pub cause: ResolutionError,
    pub key: Option<(EntityId, u8, EntityId, u8, ContactKind)>,
}
```

The tuple is the public `ContactKey` grammar without making private solver/contact
types public. `key` is `Some` only when the failing operation has exactly one
canonical fact in hand: keyed recomputation, keyed row construction/application, or
a single-fact solver group. A multi-fact group failure is `None`; choosing its first
key would falsely attribute a coupled refusal. Build/preflight/finish/staging errors
also use `None` unless they already own one unambiguous key. `kind` is therefore
present whenever the key is.

Internally, make the feature-only exact driver return a crate-private failure wrapper
containing `cause`, `phase`, and optional key. Do not add payload to public
`ResolutionError`, change the compatibility driver, print from sim, or infer phase in
World from the error variant. Annotate the error at the operation that produced it:
scan, recompute, closure construction, `resolve_group`, `apply_group`, lifecycle, and
finish in
[`solve_contact_tick_with`](../../crates/sim/src/combat/resolution.rs#L1011);
trajectory build and stage commit remain World-owned phases.

Retain only the first rejection in feature-only `ContactRuntime`:

```rust
#[cfg(feature = "cartesian-recoil")]
first_exact_rejection: Option<ExactContactRejectionDiagnostic>,
```

Expose it beside `first_contact_rejection`:

```rust
#[cfg(feature = "cartesian-recoil")]
pub fn first_exact_contact_rejection(&self)
    -> Option<ExactContactRejectionDiagnostic>;
```

Write it before clearing rejected resolution rows, using the current authoritative
`World::tick()`. Once `Some`, never replace it. Reset only with World construction;
it describes the first refusal of the run just like the existing cause. The field is
evidence-only: omit it from every state hash, replay byte, frame/publication layout,
wasm export, JS/TS ABI, and equality digest. It stores no exact owners, wide words,
remainders, impulses, or scratch state and allocates nothing.

Refusal atomicity is unchanged. Capturing diagnostics may mutate only the unhashed
first-diagnostic slot and existing rejection counter/cause. Owners, trajectories,
colliders, anatomy, credit, resolutions, exact external ledger, and retained
capacities must match the pre-tick entry after refusal.

Required tests:

```rust
#[test] fn single_fact_exact_solver_refusal_names_tick_phase_cause_and_contact_key() {}
#[test] fn coupled_group_refusal_names_solve_phase_but_not_a_false_single_key() {}
#[test] fn scan_and_stage_failures_name_their_actual_phase_without_a_key() {}
#[test] fn the_first_exact_rejection_is_never_replaced_by_a_later_refusal() {}
#[test] fn rejection_provenance_changes_no_hash_replay_publication_or_retained_capacity() {}
#[test] fn recording_rejection_provenance_preserves_whole_tick_atomicity() {}
```

Temporarily label a solver refusal `Recompute` and watch the first test fail. Then
force a two-fact refusal to retain the first sorted key and watch the coupled-group
test fail. Restore both.

## Checkpoint C -- ordinal 1536 tick-by-tick divergence trace

Add a separate focused mode to
[`tactical_mechanics.rs`](../../crates/lab/src/tactical_mechanics.rs#L251):

```powershell
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536
```

This command accepts no seed, ordinal, tolerance, or corpus override. It resolves
central ordinal `1536` through the source-41 `declared_central_cases()`, uses
`DeclaredSpawnOffset`, anatomical hand/loadout reflection, zero local deltas, and the
declared chamber/strike/reach bytes. It runs exactly one plain/mirror pair -- never
the full audit -- and compares every tick from construction through the first
divergence or through the schedule plus one following tick.

Define the trace phases and comparison order literally:

1. `Config`: scenario bytes after applying the declared anatomical reflection;
2. `Command`: both ordinary submitted commands after limb/key mapping;
3. `PreStepPose`: body/yaw, mapped hands, weapons, shield, integrity, and presence;
4. `PostStepPose`: the same ground-truth pose after `World::step`;
5. `Resolution`: canonical published rows mapped by entity/held slot, point/vector,
   TOI, alpha, physical energy, and region;
6. `Rejection`: count plus `first_exact_contact_rejection`, with mapped key when
   present;
7. `CrossingOracle`: previous/requested authoritative target region and result.

Stop at the first unequal phase in that order and print exactly one structured row:

```text
tick=<u32> phase=<name> pair=<plain-value>|<mirror-value>
cause=<plain diagnostic or none>|<mirror diagnostic or none>
```

The pair field names the first unequal mapped field (for example
`weapon.tip.y`, `resolution.key.a_slot`, `rejection.phase`) and both raw values. For a
rejection it prints tick, phase, exact `ResolutionError`, key tuple, and kind on both
sides. Do not continue and report a downstream pose difference as the cause of an
earlier solver refusal. If no difference occurs, print the compared tick count and
`phase=none`.

Required tests:

```rust
#[test] fn ordinal_1536_trace_uses_source_41_and_zero_local_deltas() {}
#[test] fn trace_comparison_stops_at_the_first_phase_and_first_mapped_field() {}
#[test] fn trace_maps_left_right_slots_points_vectors_and_shield_winding_exactly() {}
#[test] fn trace_reports_exact_rejection_phase_pair_and_cause_instead_of_empty_rows() {}
#[test] fn trace_never_runs_more_than_one_plain_mirror_pair() {}
```

Use synthetic traces with an earlier command mismatch and later rejection mismatch;
removing the early stop must make the second test red. Use one real focused trace only
after A/B and these tests are green.

## Decision boundary

Smart42 ends by recording the first divergence in this plan and in
[`v2-articulated-contact-research.md`](../performance/v2-articulated-contact-research.md).
Only then may a later plan choose one of three paths:

- a measurement-only correction, if the first divergence is another false Lab read;
- a solver/mechanics repair, if mapped inputs and geometry agree through a named
  rejection phase and exact cause;
- a new bounded audit, only if the trace agrees through the representative schedule
  and the repaired witness changes the premise that stopped Smart41.

Do not declare or run a full audit, solver retune, corpus expansion, or policy
calibration inside Smart42. A trace that finds no divergence is evidence about one
predeclared pair, not permission to call the 7,560-run gate passed.

### Recorded decision

```text
tick=1 phase=PostStepPose pair=right.hand.y 442259|442260
cause=none|none
```

Configuration, submitted commands, and entry poses agreed first, so this one-raw
post-step hand difference is the earliest cause. Later missing contacts and solver
refusals are consequences, not competing explanations. Smart43 is the narrow
actuator-reflection successor; another full audit remains unauthorized.

## Pin budget and verification

**Existing registered pin movement budget: zero. Smart42 may add no pin.** The new
diagnostic is unhashed and absent from every ABI. `LAB_HASH`, browser hashes,
articulated/contact digests, combat fingerprints, inference digest, and registered
exact-state pins must remain byte-identical. Any move stops the session and is not
re-recorded.

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p lab mirrored_reach -- --nocapture
cargo test -p lab noise_free_crossing -- --nocapture
cargo test -p sim --features cartesian-recoil rejection_provenance -- --nocapture
cargo test -p lab --features cartesian-recoil mirror_trace -- --nocapture
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536

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

`wasm_check.js` tests the artifact already present; run it immediately after its
matching build. No development server or browser is needed. The focused trace is the
only measurement authorized by this plan.
