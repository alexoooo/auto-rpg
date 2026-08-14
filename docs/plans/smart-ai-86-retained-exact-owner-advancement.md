# Smart AI 86 -- retain exact owner advancement and rollback

**Status:** complete for the owner prerequisite. Caller-output owner advancement and
group application, distinct solve/World rollback entries, and clone re-reservation
landed. Focused advance/apply equivalence and clone tests are green. A verified wasm
owner-path run completes twice, matches native at `0x2d323ac56c901e88`, and grows
memory only on its first initialization. The full feature suite still has 28 reds,
predominantly because Smart85 geometry remains reverted and old exact fixtures still
reach that known stack path; Smart87 owns their classification and repair. The one
Smart86-owned red was a stale capacity expectation missing the five declared Vecs and
was corrected. No registered pin or corpus ran.

## A -- caller-output trajectory primitives and one group workspace

Edit `crates/sim/src/combat/trajectory.rs`. Keep the existing by-value functions only
as `#[cfg(test)]` word/refusal oracles. Add one retained group workspace and production
APIs which return only `Result<(), ExactTrajectoryReject>`:

```rust
pub(crate) struct ExactTrajectoryWork {
    owner_stage: Vec<ExactOwnerTrajectory>, // 64
    reaction_stage: Vec<FloorReaction>,     // 64
    impulse_stage: Vec<[i128; 3]>,          // 192
}

pub(crate) fn advance_exact_into(
    owners: &[ExactOwnerTrajectory], next_group_raw: u32,
    output: &mut Vec<ExactOwnerTrajectory>,
) -> Result<(), ExactTrajectoryReject>;

pub(crate) fn apply_exact_group_into(
    rows: &[ExactContactTrajectory], owners: &[ExactOwnerTrajectory],
    resolutions: &[ContactResolution], group_time: u32,
    work: &mut ExactTrajectoryWork,
) -> Result<(), ExactTrajectoryReject>;
```

`ExactTrajectoryWork::try_reserve` reserves owners to `64`, reactions to `64`, and
impulses to `192` (`64 * 3`). Each function clears every dirty non-authoritative stage
at entry, refuses if capacity is insufficient, and writes rows directly; it never
constructs or returns `FixedExactOwners`,
`FixedFloorReactions`, `ExactImpulseOutcome`, or an inline owner array. Preserve
validation order, `advance_affine` parenthesization, held-row order, impulse
accumulation, floor reaction order and every rejection. On error authoritative input
is untouched; staging may be dirty and is cleared on its next call.

`advance_exact_into` validates and pushes one completed owner at a time. It must not
mutate an already pushed row after a later refusal. `apply_exact_group_into` first
validates and fills the retained impulse vector, calls `advance_exact_into`, then
applies impulses directly to staged owner rows and stages reactions. Replace
`apply_row_impulse(&mut FixedExactOwners, ...)` with a slice/Vec caller-output form;
identity lookup and validation stay byte-for-byte. Do not shrink any ceiling, box per
call, raise stack size, use unsafe code, or change the test oracle representation.

## B -- solve-local work and rollback cannot borrow the whole scratch

Edit `crates/sim/src/combat/resolution.rs`. Under `cartesian-recoil`, extend
`ContactTickScratch` with exactly:

```text
exact_trajectory_work        ExactTrajectoryWork
exact_solve_owner_entry      Vec<ExactOwnerTrajectory>    bound 64
exact_solve_trajectory_entry Vec<ExactContactTrajectory>  bound 192
```

Reserve all five underlying Vecs in `try_reserve`, include them in test capacity
snapshots, and prove two-run no-growth behavior. Pass the nested
`ExactTrajectoryWork` separately to kinematics finish/apply hooks; change
`solve_contact_tick_with` plumbing or destructure field borrows so a hook never needs
`&mut ContactTickScratch` while other scratch fields are live. Compatibility
kinematics accepts and ignores the work argument.

Exact finish calls `advance_exact_into` into `work.owner_stage` and swaps with
authoritative owners only after complete success. Exact apply calls
`apply_exact_group_into`; after success, require
`floor_reactions.len() + work.reaction_stage.len() <= floor_reactions.capacity()`
before either authoritative mutation, append without reserve/growth, then swap staged
owners. The cumulative authoritative reaction vector is separately reserved to
`MAX_CONTACT_RESOLUTIONS_PER_TICK = 4096`; the per-group reaction stage remains `64`.
Capacity/refusal before the checked infallible append/swap changes neither owners nor
reactions. Dirty owner/reaction/impulse stages are cleared on every next entry.

In `solve_exact_contact_tick`, replace the local trajectory array and by-value owner
entry with `exact_solve_owner_entry` and `exact_solve_trajectory_entry`. Copy rows
only after capacity is proven. On driver error, restore from these Vecs and clear
reactions. Reusing `work.owner_stage` as the solve owner entry must make the second-
group rollback test red. Their rollback boundaries, not source scopes, require
distinct storage.

## C -- World owns the earlier build-to-stage snapshot

Edit `crates/sim/src/world.rs` mandatorily. Add feature-only retained fields to
`ContactRuntime`:

```text
exact_owner_entry       Vec<ExactOwnerTrajectory>       bound 64
exact_trajectory_entry  Vec<ExactContactTrajectory>     bound 192
```

They are distinct from the solve entries in `ContactTickScratch`. Populate them
before `build_contact_colliders`/`build_exact_contact_trajectories`; they preserve the
state entering the complete build -> solve -> stage transaction. Restore from them
on BuildTrajectories, solve, or StageCommit failure. Add both to
`ContactRuntime::reserve`, and retain cumulative `floor_reactions` capacity `4096`.

Remove derived `Clone` from `ContactRuntime` and implement it manually. Clone every
value and row, save the source `high_water`, set the clone's `high_water` to zero, then
call `reserve(saved_high_water)` before reporting/restoring the saved high water.
Cloning an empty reserved Vec produces capacity zero; copying a nonzero high water
first would make `reserve` return early and allocate on the next wasm step. The clone
may `expect` only the already-validated source bound and must not lower it. Clear all
runtime entries, solve entries and group stages before cloning in the test; step the
clone twice and require unchanged pointers/capacities plus the original high water.

## D -- equivalence, atomicity and mutation proof

Compare caller-output APIs with the old by-value oracles for owner counts 0, 1, 2 and
64; body-only and all held slots; times 0, group time and 65536; zero, planar and held
Z impulses; multiple rows per owner; and every capacity, duplicate, identity, mass,
time, arithmetic and lifecycle refusal. Compare every owner/reaction word and exact
rejection. Dirty stages and repeat.

```rust
#[test] fn advance_exact_into_matches_every_old_owner_word_and_refusal() {}
#[test] fn apply_exact_group_into_matches_every_old_owner_reaction_and_refusal() {}
#[test] fn exact_finish_swaps_retained_owners_only_after_success() {}
#[test] fn exact_group_staging_is_atomic_for_owners_and_floor_reactions() {}
#[test] fn exact_tick_rollback_uses_distinct_retained_entry_backups() {}
#[test] fn exact_owner_workspaces_reserve_once_and_never_grow() {}
#[test] fn contact_runtime_clone_rereserves_empty_exact_work_before_early_return() {}
#[test] fn world_exact_entry_survives_build_solve_and_stage_failures() {}
```

Mutation proof: restore a by-value owner/outcome local (frame gate red); skip one held
advance or owner validation (word/refusal red); commit owners before reaction capacity
is known (atomicity red); alias group and entry owner vectors (rollback red); omit one
trajectory entry row (rollback red); and reduce every bound by one (named capacity
red before authoritative mutation). Copy the clone's nonzero `high_water` before
reserving and require the empty-stage clone/two-step pointer test to expose the lost
capacity. Restore every mutation.

## E -- wasm runtime, frames and stop boundary

Build a fresh feature release artifact with Smart85 geometry still absent. Record
absolute path, bytes and full SHA-256. Parse `from_slice`, `advance_exact_into`,
`apply_exact_group_into`, exact finish/apply, `solve_exact_contact_tick`, World step
and compute-digest. Acceptance requires the new caller-output helpers to contain no
`46096`-byte owner/result frame, the solve and step frames to lose their inline entry
backups, and no large sret edge in `--show-prefix`.

Because the old geometry may trap before finish, frame addition alone is not runtime
acceptance. Add a temporary feature-only diagnostic export in `crates/web/src/lib.rs`
that drives the real `advance_exact_into`, finish and apply-group paths at bounds 1,
2 and 64 using retained scratch, twice in one wasm instance. It returns only a small
digest/status and exposes no raw owner storage. `tools/exact_owner_wasm_probe.js`
instantiates the exact named artifact, calls every case twice, records memory pages,
and fails on trap, disagreement or second-call growth; add fixture tests and mutation
proof. Remove the export and probe after capture so public ABI does not change.

The direct owner probe must complete with at least 64 KiB measured shadow-stack
headroom at its deepest real owner call and no second-call memory growth. Also run the
ordinary feature stream: an earlier geometry OOB is an expected Smart87 boundary,
but an owner-chain OOB is a Smart86 stop/revert. Do not declare the old additive frame
sum sufficient and do not reapply Smart85 geometry merely to make the stream reach
finish.

If equivalence, rollback, no-growth, direct wasm runtime, or 64-KiB owner headroom
fails, revert Smart86. If green, retain the behavior-neutral owner rewrite, record
that the full stream remains pending Smart87 geometry, and stop. No registered pin
may move and no full corpus is authorized.

```powershell
cargo test -p sim advance_exact_into --features cartesian-recoil -- --nocapture
cargo test -p sim apply_exact_group_into --features cartesian-recoil -- --nocapture
cargo test -p sim exact_tick_rollback --features cartesian-recoil -- --nocapture
cargo test -p sim exact_owner_workspaces --features cartesian-recoil -- --nocapture
cargo test -p sim contact_runtime_clone_rereserves --features cartesian-recoil -- --nocapture
cargo test -p sim world_exact_entry_survives --features cartesian-recoil -- --nocapture
cargo test -p sim --features cartesian-recoil
cargo test -p sim
$env:CARGO_TARGET_DIR='target/smart86-feature-wasm'
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
$wasm=Resolve-Path 'target/smart86-feature-wasm/wasm32-unknown-unknown/release/web.wasm'
$wasm.Path; (Get-Item $wasm).Length; (Get-FileHash -Algorithm SHA256 $wasm).Hash
node tools/wasm_stack_frames.js $wasm 'compute_articulated_stream_digest|step_with_arm_rates|solve_exact_contact_tick|advance_exact|apply_exact_group|ExactKinematics|FixedExactOwners::from_slice'
node tools/wasm_stack_frames.js --show-prefix $wasm 'solve_exact_contact_tick|advance_exact|apply_exact_group|ExactKinematics'
node --test tools/exact_owner_wasm_probe.test.js
node tools/exact_owner_wasm_probe.js $wasm
Remove-Item Env:CARGO_TARGET_DIR
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

## Completed evidence and remaining boundary

```text
C:\Users\ostro\IdeaProjects\auto-rpg\target\smart86-feature-wasm\wasm32-unknown-unknown\release\web.wasm
bytes 970464
sha256 42F00A2F79C4FFEB2D69FED2FD7A9894108B4FECF19EB50737050891D6D7ADAA

advance_exact_into       1872   (old advance_exact 93344)
apply_exact_group_into    304
ExactKinematics finish      0
ExactKinematics apply       0
solve_exact_contact_tick  480   (old 183200)
World::step_with_arm_rates 96256 (old about 325000)
compute_articulated_stream_digest 352256
```

The isolated real owner runtime returned low/high words `1821384328/758266565`, or
`0x2d323ac56c901e88`, twice in wasm and identically natively. Wasm memory changed
`1572864 -> 4784128` bytes on first initialization and was unchanged on the second
call. Focused `advance_exact_into`, `apply_exact_group_into`, and clone re-reservation
tests passed. The capacity fixture was corrected to count the five new retained Vecs;
that was an expected test-shape update, not a behavior correction.

The full feature run remains red in 28 tests while the Smart85 geometry state machine
is absent. Smart86 does not relabel those reds green: Smart87 must rerun, name and
classify every one after geometry is restored. Owner return/storage is now accepted;
full-stream wasm health is not.
