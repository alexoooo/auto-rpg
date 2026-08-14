# Smart AI 115 -- trace tick-299 SolveGroup and audit the competence law

**Status:** complete and stopped. The exact tick-299 row is an admissible final
impulse whose physical-energy delta is positive, so the lifted solver correctly
returns `LiftedNoDissipativeCandidate`. The frozen 100-trial audit then measured only
`21/100` strict zero-refusal body decisions and `55/100` body outcomes even when
refused ticks are ignored. Neither reaches 95. General Tactical competence and the
Smart104 default-Arena premise are blocked; no solver rule, gate, schedule or policy
was changed.

## A -- frozen canonical reproduction

Run only canonical Tactical-versus-Tactical seed 0 through its first refusal and
freeze before diagnostics:

```text
tick 299 -> 300, SolveGroup / ExactSolver
key entity0 slot1 -> entity1 BODY_SLOT, WeaponBody
pair None
command/state 0x667109859aa387b3 / 0x987128c826a69090
```

Require mirrored seed 0 still has no rejection through 1800 as a control. Do not run
the full competence gate until the focused trace is complete. The missing group
ordinal, selected time and region are measurements, not values to infer.

## B -- group, driver and lifted-input provenance

Add feature/test-only first-failure capture in
[`crates/sim/src/combat/resolution.rs`](../../crates/sim/src/combat/resolution.rs) at
the ordinary tick-299 group, before `exact_solver_error` maps a
[`LiftedSolverReject`](../../crates/sim/src/combat/lifted_solver.rs) to public
`ExactSolver`. Record:

```text
tick; group ordinal; selected absolute time; mapped member count
scan candidates and their time/key/region/medial ordering words
all sorted group facts: complete ContactFact and wide provenance
closure entity and row identities; generalized mass/motor/response velocity
driver facts, collider indices and WeaponBody channel
LiftedContact fact/trajectory indices, restitution, friction and all three exact
  pre-relative-velocity rationals
all relevant retained len/capacity words before and after refusal
```

Require the public key equal the sole group key if there is one; otherwise state why
the public key is present. Capture facts and drivers already built by production.
Never rescan, recompute, rebuild a lifted contact or invoke the solver twice.

## C -- exact lifted root and refusal trace

Inside `solve_lifted_group`, use a typed first-error stage:

```text
Bounds
InitialTrial
NormalDirection
NormalOrigin
NormalRootRay
NormalRootTrial
NormalRootConstraint
NormalCandidateRay
NormalCandidateTrial
NormalCandidateConstraint
NormalCandidateScore
TangentInitialTrial
TangentDirection
TangentZeroRootRay
TangentZeroRootTrial
TangentZeroRootProjection
ConeRootRay
ConeRootConstraint
TangentCandidateRay
TangentCandidateTrial
TangentCandidateConstraint
TangentCandidateScore
CandidateSelection
FinalTrial
FinalConstraint
PhysicalEnergy
DissipativeSelection
```

For every fact visit/sweep and both 32-step searches record visit/sweep ordinal,
low/high/mid scale, ray origin/direction, component-lift words, attempted impulse,
trial success/refusal, cone and restitution decisions, exact post-relative velocity,
candidate score `(slip, overshoot, impulse)` and deterministic tie order. For tangent
work record the initial tangent, zero-root and cone-root brackets. Record candidate and
normal-candidate high-water and the selected impulse tuple.

At the first returned error, freeze the exact internal `LiftedSolverReject` variant
and exact helper/function/operands. If the failure is `NoRestitutionCandidate` or
`NoDissipativeCandidate`, prove which candidate set was empty or inadmissible. If it
is `ArithmeticEnvelope`, name the first operation and full wide operands. If it is an
identity/capacity/impulse envelope, name the violated bound.

For every final or energy-reached candidate record:

```text
physical owner momentum before/after
signed exact energy delta and loss_raw
cone/restitution result per fact
whether retain_dissipative_trial accepted, refused positive energy, or had no row
```

This diagnostic must distinguish a nonlinear/root-search miss from an admissible but
energy-increasing row. Do not describe all `ExactSolver` variants as equivalent.

## D -- atomicity and mutation proof

Add:

```rust
#[test] fn smart114_tick_299_names_group_facts_drivers_and_lifted_inputs() {}
#[test] fn smart114_tick_299_names_the_exact_lifted_root_and_reject_variant() {}
#[test] fn a_refused_tick_299_group_restores_owners_trajectories_rows_and_reactions() {}
#[test] fn lifted_failure_capture_is_first_only_bounded_and_observational() {}
#[test] fn lifted_failure_controls_distinguish_roots_constraints_and_energy() {}
```

Atomicity compares owners, trajectories, colliders, resolutions, floor reactions,
solver state, retained lengths/capacities and World digest before/after the refused
group. It also runs the ordinary rollback path with capture erased and requires the
same public failure and receipts. Make tests red by erasing the internal variant,
changing group/fact order, skipping a root iteration, swapping zero/cone brackets,
reporting a constraint before its trial, changing the energy sign, retaining a dirty
owner on refusal, overwriting the first error and calling trial twice. Restore every
mutation.

```powershell
cargo test -p sim --features cartesian-recoil smart114_tick_299 -- --nocapture
cargo test -p sim --features cartesian-recoil lifted_failure -- --nocapture
cargo test -p lab --features cartesian-recoil smart103_first_moving_rejection -- --nocapture
```

Retain stdout or a log path, byte length and SHA-256. Remove runtime diagnostics and
prints after freezing evidence; keep held behavior unchanged.

## E -- audit body outcomes versus bounded refusals

The existing Smart103 gate counts a body decision from timeout status, then separately
requires zero command refusals and zero solver-rejected ticks. Do not alter that code
or threshold. Read its authority in Smart37/103 and audit the semantic question with
two side-by-side reports over the already-frozen 50 canonical plus 50 mirrored seeds:

```text
strict: current pass law (>=95 body decisions and zero command/solver refusals)
outcome-only diagnostic: body-decision count regardless of solver refusal
```

For every trial record body/points/draw outcome, decision tick, total refusals, first
refusal tick/phase/internal variant/key, whether the body outcome preceded or followed
the first refusal, and whether every refusal was bounded, named and atomically rolled
back. Aggregate:

- body outcomes with zero refusals;
- body outcomes before their first refusal;
- body outcomes after one or more refusals, by exact variant and count;
- points/draw trials with and without refusals;
- worst and total refusal counts per orientation.

This is an audit, not a second pass criterion. A later plan may propose counting a
body outcome despite refusals only if every such refusal is named, bounded, atomic,
does not create a command refusal, and the architectural authority explicitly accepts
that a mechanically skipped group can still support the competence claim. Otherwise
the zero-refusal law remains. Do not lower 95, hide refusals, stop early or choose a
subset after measurement.

```powershell
# Add a refusal-audit reporting mode that accepts no measurement-changing overrides.
cargo test -p lab --features cartesian-recoil competence_refusal_audit -- --nocapture
cargo run --release -p lab --features cartesian-recoil -- articulated --competence-refusal-audit
```

Run the 100 trials once only after B-D are green. Record complete output and retained
log receipt. Do not call it a competence pass even if outcome-only reaches 95.

## F -- stop boundary

Stop after the exact tick-299 variant/root/energy cause and the strict-versus-outcome
audit are recorded. Do not fix the solver, change its bounds, select a lower-ranked
candidate, relax cone/restitution/energy, alter the gate, retune ordinal 3144 or touch
Arena/UI. Any solver or gate decision requires a later pre-code plan.

Expected registered pin moves are zero; diagnostics are removed and held behavior is
not repinned. Run no pin update, wasm promotion or browser verification.

```powershell
node tools/check_docs.js
git diff --check
```

## Completed evidence

At tick 299, group 0 at absolute time `13408` succeeds. Group ordinal 1 at time
`14904` contains exactly one candidate, mapped member, fact, driver and lifted
contact: region 0, WeaponBody key hero entity 0 slot 1 to monster entity 1
`BODY_SLOT`. Its closure has two entities and five rows. The selected impulse is
`[45288,-50928,-13422]`. All final contact constraints pass; the first failing stage
is `PhysicalEnergy`, which returns `LiftedNoDissipativeCandidate` because the exact
energy delta is positive:

```text
numerator limbs   [1449571627,4017933352,2373096635,4158022200,4120701068,
                   2826361588,4023264781,3701134889,235491842,761805498]
denominator limbs [3004317696,2050287807,3355440956,3701518679,1167090672,
                   2579578631,1760700809,132541238,670462381,5611]
bit lengths       318 / 301
comparison        Greater
truncated delta   +135766
loss_raw          0
```

The refusal is therefore neither a missed root nor an arithmetic-envelope failure,
and accepting it would violate physical dissipation. Diagnostic capture was removed.
The refusal audit's complete retained receipt is
`target/smart115-refusal-audit.log`, 28,791 bytes, SHA-256
`7ABFD8F2CC4B6E71DEFC9A0FC8F3536E32036924EDE7CAF86DF88C3CE034DAAA`.
Its final aggregate is:

```text
outcome_only_body=55/100 strict_zero_refusal_body=21/100
body_before_first=0 body_after_first=34 points_clean=8 points_refused=37
total_solver_rejections=1825 worst_canonical=96 worst_mirrored=1286
```

Zero body outcomes occurred before their first refused tick. Counting later body
outcomes cannot rescue the `95/100` gate, and would in any case discard a named
physical-energy refusal. Smart116 may land the independently proven arithmetic and
certificate repairs as mechanics maintenance; it makes no competence claim.
