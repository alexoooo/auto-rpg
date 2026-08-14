# Smart AI 120 -- retain lifted trial owners off the wasm stack

**Status:** complete. Retained lifted trial/accepted-owner staging is green, the real
feature artifact runs twice in two fresh instances without second-call growth, and
the measured active chain is 422,384 bytes with 626,192 bytes headroom. Native and
wasm agree at `0xa6835666303601d2`; no registered pin moved. Smart117 is unblocked.

## A -- one retained owner authority

Edit
[`crates/sim/src/combat/lifted_solver.rs`](../../crates/sim/src/combat/lifted_solver.rs),
[`crates/sim/src/combat/resolution.rs`](../../crates/sim/src/combat/resolution.rs), and
only if a slice accessor is required,
[`crates/sim/src/combat/trajectory.rs`](../../crates/sim/src/combat/trajectory.rs).
Extend `LiftedSolverScratch` with:

```rust
trajectory_work: ExactTrajectoryWork,
accepted_owner_stage: Vec<ExactOwnerTrajectory>,
```

They are separate atomicity domains. `trajectory_work.owner_stage` is overwritten by
every trial; `accepted_owner_stage` changes only after final constraints and exact
physical-energy comparison pass. Reserve `ExactTrajectoryWork` to its existing exact
bounds and `accepted_owner_stage` to `MAX_EXACT_OWNERS` in `try_reserve`. Report all
four new capacities beside the existing five. A manual `Clone` must re-reserve empty
or partially used stages to the same bounds; cloning an empty reserved Vec must not
silently return capacity zero.

Change `trial` to call `apply_exact_group_into` and return no owner aggregate. It may
borrow `trajectory_work.owner_stage` while deriving relative velocities, but must
release that borrow before the next trial. Change `exact_physical_energy_delta`
narrowly to accept the final owner slice rather than `FixedExactOwners`; retain its
length, identity, physical-row order, exact arithmetic and refusal rules. Existing
native controls must prove byte equivalence.

At the final candidate:

1. Run the same trial into `trajectory_work`.
2. Prove every cone/restitution constraint from that trial.
3. Compute the same exact physical-energy delta from its owner slice.
4. On positive energy return `NoDissipativeCandidate` without touching the accepted
   stage.
5. Otherwise swap the two owner Vecs; clone or element-copy neither.
6. Publish the same `LiftedGroup`, selected rows and loss words.

The outer resolver still reapplies returned impulses through its distinct
`ContactTickScratch::exact_trajectory_work`. A later trial or refused group must not
alias or partially overwrite the lifted solver's accepted stage.

## B -- equivalence, atomicity and mutation tests

Add:

```rust
#[test] fn retained_lifted_trial_matches_every_by_value_owner_row_velocity_and_refusal() {}
#[test] fn lifted_acceptance_swaps_owner_vectors_only_after_physical_energy_passes() {}
#[test] fn a_positive_energy_trial_leaves_the_prior_accepted_owner_stage_unchanged() {}
#[test] fn lifted_trial_failure_is_atomic_for_rows_velocities_owners_and_reactions() {}
#[test] fn lifted_scratch_clone_re_reserves_every_empty_and_dirty_stage() {}
#[test] fn retained_lifted_stages_never_grow_across_two_maximum_groups() {}
```

Cover zero/one/maximum owners, every existing trajectory refusal, Smart115's positive
energy row, accepted negative/zero energy, capacity failure before clear, and two
groups with different owner counts. Freeze values, lengths, capacities and pointers.
Accepted contents/pointer remain unchanged on failure; working dirt clears before
reuse and cannot publish. Mutate independently back to by-value apply, alias stages,
swap before energy, clear accepted on refusal, omit clone reserve, permit growth and
change the energy comparison; each named test must fail, then restore it.

```powershell
cargo test -p sim --features cartesian-recoil retained_lifted -- --nocapture
cargo test -p sim --features cartesian-recoil lifted_acceptance -- --nocapture
cargo test -p sim --features cartesian-recoil positive_energy_trial -- --nocapture
cargo test -p sim --features cartesian-recoil apply_exact_group_into -- --nocapture
cargo test -p sim --features cartesian-recoil exact_physical_energy -- --nocapture
```

## C -- complete native and release-wasm gates

Run both workspaces. Build a fresh named feature artifact and parse the same Smart119
chain. Acceptance is an active total at most 936,608 bytes and therefore at least
111,968 measured headroom; 65,536 is the absolute floor. If a root is absent/inlined,
use an `#[cfg(test)] #[inline(never)]` driver measured before and after, not an
estimate.

```powershell
cargo test
cargo test --workspace --features cartesian-recoil
$env:CARGO_TARGET_DIR='target/smart120-feature-wasm'
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
node tools/wasm_stack_frames.js target/smart120-feature-wasm/wasm32-unknown-unknown/release/web.wasm "compute_articulated_stream_digest|advance|step_with_arm_rates|resolve_contact|solve_exact_contact_tick|resolve_group|solve_lifted_group|trial|apply_exact_group_into|validate_owner"
```

Run the real feature artifact in two fresh wasm instances. In each call the isolated
articulated stream digest twice; record hi/lo and memory pages before, after call one
and after call two. Both instances/calls must agree with a fresh feature-native value,
and call two must not grow memory.

The checker has a feature-aware mode. Default remains the unchanged 28-test suite;
`ARPG_CARTESIAN_RECOIL=1` selects only command receipt
`0x5fcaba34556b2737` and stream receipt `0xa6835666303601d2`, while all 26 other
checks run unchanged. The mode fails on any other environment spelling rather than
silently testing the wrong artifact.

```powershell
Remove-Item Env:CARGO_TARGET_DIR
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
$env:ARPG_CARTESIAN_RECOIL='1'
node --test tools/wasm_check.js
Remove-Item Env:ARPG_CARTESIAN_RECOIL
node --test tools/wasm_stack_frames.test.js
node tools/check_docs.js
git diff --check
```

## D -- pin and handoff boundary

Expected registered pin movement is zero. Default stream
`0xdbbd86fedd61c4c7`, geometry `0x9d15344883cf6e9c`, contact behavior
`0x587b0259e877105a`, its 3,548 bytes, legacy hashes, replay/state grammar and all ABI
versions remain unchanged. Feature native/wasm digest and command values are receipts,
not goldens.

Stop on a semantic difference, pin movement, target disagreement, total above
936,608, headroom below 65,536, trap, second-call growth, dirty accepted stage or a
checker mode hiding more than one default-only witness. Only a complete pass unblocks
Smart117. It authorizes no competence, solver/policy retune or UI work itself.

## Completed receipt

The retained caller-output path produced this fresh feature-wasm active ledger:

```text
compute_articulated_stream_digest     313264
Sim::advance                            3568
World::step                                0 (inlined)
World::step_with_arm_rates             16096
resolve_contact                        18864
solve_exact_contact_tick                 464
ExactKinematics::resolve_group          6672
solve_lifted_group                     45344
trial                                  17600
apply_exact_group_into                   304
validate_exact_rows                        0 (inlined)
validate_owner                           208
active total                          422384
wasm stack                           1048576
headroom                              626192
```

The artifact is
`target/smart120-feature-wasm/wasm32-unknown-unknown/release/web.wasm`, 984,816 bytes.
Its SHA-256 is
`45ad3c11a2c899d433ab637f4d0926d0d1d5e873212b8a8bc5c11ee0f79f5f2c`.
Feature-native and two fresh wasm instances each produced
`0xa6835666303601d2`; each instance reported memory pages `23/77/77`, so the
second call grew no memory. Default and feature workspaces, parser fixtures,
documentation and diff checks passed. Registered pins did not move.

The later complete-checker control used the current standard feature artifact,
986,144 bytes and SHA-256
`A1C99043468EEE05CAF0F2BA1B1A4E4AEE2122C59BFFE461B914443E68580663`.
All 28 tests passed with zero skips in 159,771 ms. Its retained log is
`target/smart117-feature-wasm-check.log`, SHA-256
`CB3AC6CB5ED877EBB76E9EC2AE3944C479AAA213357FDB341E8299FF97D92C7A`.
