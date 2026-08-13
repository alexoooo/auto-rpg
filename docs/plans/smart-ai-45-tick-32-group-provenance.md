# Smart AI 45 -- tick-32 group provenance

**Status:** complete on 2026-08-13. With the temporary two-Y reproduction mutation,
the tick-32 group-0 diagnostic first differed at `selected_time_raw`: plain `38127`,
mirror `38111`. The plain rejection was `None`; the mirror was `EmptyDriverSet`.
This 16-raw TOI difference occurs at exact scan/geometry selection, before
recomputation or the lifted solver. The actuator mutation was fully reverted, all
five focused diagnostics passed, and no pin measurement, pin update, or full corpus
ran.

Code inspection narrowed the public cause. On the feature-only
`ExactKinematics::resolve_group` path in
[`resolution.rs`](../../crates/sim/src/combat/resolution.rs#L908),
`ResolutionCount` at phase `SolveGroup` can only be the `drivers.is_empty()` guard.
It is not the collection scratch candidate count, not the lifted solver's bounded
candidate pool (all `LiftedSolverReject` variants map to `ExactSolver`), and not the
published-output ceiling (checked after `ApplyGroup`/`Lifecycle`). Thus the immediate
fact is: scan selected a time, recomputation retained zero facts, and the driver set
was empty. Smart45 measures where the plain and mapped mirror group stopped agreeing;
it does not widen anything. The measurement now assigns the successor to exact wide
detector/root selection rather than recomputation, mapping, or response.

## Checkpoint A -- exact bounded group provenance

Extend the existing feature-only evidence seam in
[`crates/sim/src/combat/resolution.rs`](../../crates/sim/src/combat/resolution.rs#L82).
Add public, `Copy + Eq + Debug` diagnostic values containing only public IDs, scalar
counts, time, and mapped key tuples -- no private `ContactFact`, trajectories,
remainders, impulses, or solver scratch:

```rust
pub struct ExactContactKeyDiagnostic {
    pub a: EntityId, pub a_slot: u8,
    pub b: EntityId, pub b_slot: u8,
    pub kind: ContactKind,
}

pub enum ExactSolveGroupRejectDetail {
    EmptyDriverSet,
    LiftedIdentity, LiftedFactEnvelope, LiftedRowEnvelope,
    LiftedCandidateEnvelope, LiftedImpulseEnvelope,
    LiftedArithmeticEnvelope, LiftedNoRestitutionCandidate,
    LiftedNoDissipativeCandidate,
}

pub struct ExactContactGroupDiagnostic {
    pub tick: u32,
    pub group_ordinal: u8,
    pub selected_time_raw: u32,
    pub scan_candidates: u32,
    pub mapped_time_members: u32,
    pub recomputed_facts: u8,
    pub closure_entities: u8,
    pub closure_rows: u8,
    pub driver_contacts: u8,
    pub lifted_contacts: u8,
    pub output_rows: u8,
    pub reject: Option<ExactSolveGroupRejectDetail>,
    pub mapped_member_keys: [Option<ExactContactKeyDiagnostic>; 16],
    pub recomputed_keys: [Option<ExactContactKeyDiagnostic>; 16],
}
```

Use the existing `MAX_CONTACT_FACTS_PER_GROUP` for the array length in production;
the literal `16` above documents its public shape. Add one fixed array of at most
`MAX_CONTACT_GROUPS_PER_TICK` diagnostics plus a length to `ContactTickScratch`.
Clear its length at tick-solver entry and write each group ordinal in place. Never
allocate or grow a vector. Counts are sampled immediately around the production
operations: after scan, after `count_group_members`, after recompute/dedup, after
closure, after driver construction, after lifted construction, and after output
construction. Keys are copied in production sorted order, before any Lab mapping.

Refine the existing rejection detail without changing `ResolutionError`: preserve
the exact `LiftedSolverReject` variant rather than collapsing all variants to an
anonymous `ExactSolver`, and attach `EmptyDriverSet` at the current guard. Keep the
existing phase/cause/key fields intact. This evidence is `cfg(feature =
"cartesian-recoil")`, unhashed, unrecorded, absent from wasm exports, and outside all
authoritative state.

In [`crates/sim/src/world.rs`](../../crates/sim/src/world.rs#L1518), add:

```rust
#[cfg(feature = "cartesian-recoil")]
pub fn exact_contact_group_diagnostics(&self) -> &[ExactContactGroupDiagnostic]
```

It borrows the completed tick's fixed scratch prefix. Re-export the public diagnostic
types beside `ExactContactRejectionDiagnostic` in
[`crates/sim/src/lib.rs`](../../crates/sim/src/lib.rs#L112). No ABI, layout version,
hash byte, or replay row changes.

Required tests:

```rust
#[test] fn empty_recomputed_group_is_named_empty_driver_set_not_a_count_envelope() {}
#[test] fn lifted_reject_variants_survive_the_public_diagnostic_mapping() {}
#[test] fn group_provenance_counts_the_production_rows_at_each_boundary() {}
#[test] fn group_provenance_is_fixed_bounded_unhashed_and_cleared_each_tick() {}
#[test] fn rejected_group_provenance_survives_whole_tick_rollback() {}
```

Mutation proof: map `EmptyDriverSet` back to undifferentiated `ResolutionCount` and
watch the first test fail; move the recomputed count sample before recomputation and
watch the boundary-count test fail. Restore production before proceeding.

## Checkpoint B -- compare only the diagnosed tick

Extend `tactical-mechanics --mirror-trace-1536` in
[`crates/lab/src/strong_strike.rs`](../../crates/lab/src/strong_strike.rs#L850) to
print and compare group diagnostics. Map mirror key limb slots `0 <-> 1`, preserve
entities/kind/body slot, and compare group ordinal, selected exact time, every count,
and both sorted key lists. Print the first boundary mismatch as:

```text
tick=32 group=<n> boundary=<name> plain=<count-or-keys> mirror=<count-or-keys>
plain_reject=<detail-or-none> mirror_reject=<detail-or-none>
```

The landed production actuator remains unchanged. To reproduce the Smart44 tick-32
input, temporarily reapply its already-reviewed two-line `mul_div(..., Fx::ONE)` Y
mutation, run exactly the one ordinal-1536 trace, save the first group-boundary row,
then fully revert that mutation and its actuator tests before any gate. This is a
diagnostic mutation like a test mutation, not a Smart45 source change. Confirm with
`git diff -- crates/sim/src/combat/actuator.rs` that no actuator diff remains.

Stop after recording one of these predeclared outcomes:

- scan candidate/key mismatch: next work belongs to exact scanning/geometry;
- equal scan group but recomputed mismatch: next work belongs to exact recomputation;
- equal recomputed facts but closure/driver mismatch: next work belongs to mapping;
- all pre-solver counts/keys equal but a lifted detail differs: only then may a later
  plan diagnose the lifted solver.

Do not correct the found subsystem, widen a count, restore the actuator change for
shipping, measure/update `ARTICULATED_STREAM_DIGEST`, or run the full corpus here.

## Pin firewall and verification

Existing registered-pin movement budget and new-pin budget are both zero. The
temporary diagnostic mutation is reverted before the firewall. All default and
feature pins must remain byte-identical.

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p sim empty_recomputed_group --features cartesian-recoil -- --nocapture
cargo test -p sim lifted_reject_variants --features cartesian-recoil -- --nocapture
cargo test -p sim group_provenance --features cartesian-recoil -- --nocapture
cargo test -p sim rejected_group_provenance --features cartesian-recoil -- --nocapture
cargo test -p lab mirror_trace --features cartesian-recoil -- --nocapture

# With the temporary two-line reproduction mutation only:
cargo run --release -p lab --features cartesian-recoil -- tactical-mechanics --mirror-trace-1536
# Revert it, then prove actuator.rs is clean before gates.
git diff -- crates/sim/src/combat/actuator.rs

cargo test -p sim
cargo test -p sim --features cartesian-recoil
cargo test -p lab
cargo test -p lab --features cartesian-recoil
cargo test
cargo test -p web
cargo test -p web --features cartesian-recoil
cargo run --release -p lab -- hash
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
node --test tools/wasm_check.js
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

`wasm_check.js` checks the artifact already present, so run it after its matching
build. No server, browser, full audit, or damage measurement is authorized.
