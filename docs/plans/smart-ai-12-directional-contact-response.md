# Smart AI 12 -- directional projected contact response

**Status:** planned, test-only prototype first. Session 11 proved that the current
two-point impulse plus upper energy root cannot satisfy flesh restitution for the
captured strong strike, and that a scalar ownership mass repairs only its planar
special case. No authority or pin changed.

Checkpoint B's pure max-eight normal LCP and integerization prototype is green. The
first actual-World checkpoint A probe closes `revise`: on the retained captured strike,
normal impulse probes raw 256 and 512 changed signed normal speed by exactly 502 and
965 raw. Linear scaling predicts 1,004, so the actual joint projector differs by -39
raw against the predeclared one-raw tolerance. The captured planar column is therefore
named `Nonlinear` and may not feed the LCP. No production edit or pin move follows.
The next successor needs a bounded piecewise response (with branch intervals proved),
or a nonlinear complementarity solve with a fixed iteration/state bound; loosening the
linearity tolerance until this column passes is not an accepted path.

**Goal:** derive a bounded deterministic response matrix from the actual
`ContactProjector`, solve contact normal/tangent targets in that projected space, and
either land one general response or reject unsupported groups by name. Do not tune
surfaces, energy floor, anatomy, equipment, actuators, or policy.

Read [the determinism contract](../reference/determinism.md#contract),
[contact solver](../reference/contact-solver.md), and
[session 11](smart-ai-11-effective-contact-response.md) before editing. Work remains
inside `fx <- sim`; use only checked integer/Fx arithmetic, fixed row order, bounded
loops, and explicit lexicographic ties.

## Model and scope

Stage 1 prototypes the normal block only, bounded at eight active facts and canonical
`ContactKey` order. It solves the complementarity system `lambda >= 0`,
`w = b + W*lambda >= 0`, `lambda*w = 0`, where
`b = q0 - restitution*max(-q0,0)` and `lambda` acts along `-normal`. Reject the whole
group above eight; never solve a privileged prefix. Opening/resting contacts are
inactive and keep the existing alpha-65,536 identity fast path.

Build `W` from actual projector basis probes at raw magnitudes `P` and `2P`. Require
scale agreement within one raw unit, positive diagonal, reciprocal cross terms within
one raw unit, no component saturation, zero-probe identity, and no impulse coordinate
assigned to an inactive contact. Coupled held rows may still move with an active
owner. Use a deterministic
test solver that enumerates all 256 masks in ascending canonical-`ContactKey` bit order,
so cycling is impossible by construction; within a mask, use largest-absolute Gaussian
pivot with lowest-coordinate tie. Singular full response, non-positive response and
checked-`i128` overflow are named rejections. A future iterative optimization must use
Bland's lowest-key add/remove rule and add a visited-mask `Cycle` rejection.

Stage 2 adds friction only after every normal fixture passes. Give each active contact
two deterministic tangents: choose the Cartesian axis least aligned with the normal
(X, then Y, then Z tie order), cross and normalize, then cross again and normalize the
result. The friction
fixture remains a production gate; normal-only authority is forbidden.

Build a test-only response matrix by projecting zero plus one fixed raw impulse probe
in every active coordinate. Matrix entry `(i,j)` is the raw change in contact `i`'s
signed normal/tangent relative velocity caused by coordinate `j`. The target vector is
stored explicitly from pre-contact facts and surfaces:

```rust
struct ContactTarget {
    normal_raw: i32,       // restitution * max(-q0, 0)
    tangent_limit_raw: i32 // Coulomb bound, never a restitution surrogate
}
```

Never infer restitution from a rounded proposed impulse. Reproject the solved impulse
once and validate the actual rows; the matrix predicts, the projector decides.

The complete prototype may support at most `MAX_DIRECTIONAL_CONTACTS = 8` active facts.
Larger or rank-deficient groups return a named test-only rejection.
Use fraction-free deterministic Gaussian elimination with `i128` checked products,
row pivot chosen by largest absolute raw coefficient then lowest stable coordinate.
No division occurs until back substitution. Refuse overflow, zero pivot, a negative
normal impulse, friction-cone violation, component saturation, or residual above one
raw velocity unit. Probe at raw impulse 256 and repeat at 512; any matrix coefficient
that differs by more than one raw unit after scale normalization is `Nonlinear`.

This is a bounded prototype, not permission to ship a general LCP by assertion. If a
single equality solve cannot handle separating constraints, add a deterministic active
set enumeration over the at most four normal constraints in ascending bit mask. Score
valid solutions by `(maximum absolute residual, total closure energy, mask, impulse
words)`; do not iterate to convergence.

## Checkpoint A -- actual-projector fixtures

Add test-only helpers beside private `ContactProjector` in
[`crates/sim/src/world.rs`](../../crates/sim/src/world.rs). They must call its `project`
method and inspect post-projection generalized rows. Freeze these exact tests:

```rust
#[test] fn a_planar_owner_response_meets_zero_restitution() {}
#[test] fn a_vertical_normal_accounts_for_the_body_floor_constraint() {}
#[test] fn friction_uses_two_projected_tangent_directions() {}
#[test] fn a_joint_clamp_is_rejected_as_nonlinear() {}
#[test] fn two_contacts_sharing_one_target_use_cross_response_terms() {}
#[test] fn source_side_held_mass_enters_the_response_matrix() {}
#[test] fn opening_contacts_leave_every_row_byte_identical() {}
```

The planar fixture retains session 11's stored normal raw `(2256,65497,0)`, closure
energy `381`, target aggregate mass raw `211681`, and test-oracle solution
`(error,alpha,energy,q)=(0,64858,103,0)` as comparison, not as the matrix's required
parameterization. The matrix answer must achieve `abs(q-target)<=1`, `after<381`, and
must not choose the old upper energy root.

The vertical fixture has a normal with nonzero Z and asserts that the body row remains
Z zero; it must fail a scalar aggregate implementation. The friction fixture begins
with nonzero velocity in both tangent axes and must fail if either tangent column is
deleted. The joint fixture deliberately crosses a reach limit and must return
`Nonlinear`, not a plausible impulse. The shared-target fixture must fail when
off-diagonal response entries are zeroed. Opening must return no active coordinates,
alpha 65,536, and byte-identical rows.

## Checkpoint B -- pure solve and red demonstrations

Put pure matrix arithmetic and tests in
[`crates/sim/src/combat/resolution.rs`](../../crates/sim/src/combat/resolution.rs).
Keep all prototype types under `#[cfg(test)]` until every checkpoint passes.

```rust
#[test] fn independent_pairs_match_closed_form_at_restitution_zero_half_and_one() {}
#[test] fn fixed_point_pivot_ties_use_coordinate_order() {}
#[test] fn rank_deficiency_is_rejected_by_name() {}
#[test] fn the_active_set_is_independent_of_contact_input_order() {}
#[test] fn mixed_opening_and_closing_contacts_do_not_couple_the_opening_fact() {}
#[test] fn probe_doubling_detects_a_nonlinear_response() {}
#[test] fn every_accepted_solution_meets_targets_and_never_adds_energy() {}
```

Required red demonstrations, reverted before review:

- zero all off-diagonal terms: shared-target test fails;
- replace the pivot tie with visitation order: permutation test fails;
- omit the second tangent: friction test fails;
- accept unequal 256/512 probes: joint-clamp test fails;
- include an opening fact in the active set: byte-identity test fails;
- replace checked `i128` multiplication with saturating arithmetic: overflow fixture
  fails by accepting a false solution.

## Checkpoint C -- authority gate

Do not edit `resolve_group_into`, `solve_contact_tick`, or World commit authority until
A and B pass. Before promotion, prove no allocation after scratch warmup and add all
matrix/target buffers to `ContactTickScratch` with exact maximum capacities. The
production candidate must preserve contact ordering, re-sweep, anatomy timing,
serialization layout, and `after_group`.

Acceptance requires:

- all seven actual-projector fixtures and all seven pure tests pass;
- every active fact has absolute normal residual at most one raw unit and respects its
  friction cone after the final real projection;
- closure energy never increases; opening rows remain identical;
- unsupported nonlinear/rank/capacity cases increment solver rejection with a stable
  first cause rather than silently falling back to the old upper root;
- solved per-contact impulses replace the provisional proposals before the final
  projection; `group_alpha_raw` is honestly `65,536`, meaning the solved response was
  applied in full, not a fabricated ratio or sentinel;
- case 1 has impulses `-21,845/+21,845`, ledger
  `32,768 -> 10,922` with dissipation `21,846`, finals
  `[(32768,21846),(32767,21845),(32767,21845)]`;
- elastic shared-limb case 2 preserves its physical impulses, ledger and final state,
  but its diagnostic alpha changes from `43,691` to `65,536` under the superseding
  meaning above; this exact diagnostic-only move must be recorded rather than hidden;
- native order/thread tests and native/wasm bytes agree; no warmed allocation or
  scratch growth occurs.

Then rerun session 10/11 strong and tactical calibration. Pass requires at least 95%
strong-tip nonzero dissipation, no energy excess, and no increase in rejection rate.
Otherwise close `revise`; do not tune another layer in this session.

## Pin budget

Test-only checkpoints move no pin. If checkpoint C promotes authority,
`CONTACT_BEHAVIOR_DIGEST` must move with exact case-1 words above and case 2's sole
predeclared diagnostic-alpha change `43,691 -> 65,536`; its physical impulse, ledger,
and finals remain identical. The contact format corpus remains byte-identical because
the field width/order does not change. `ARTICULATED_STREAM_DIGEST` is expected
to move and requires native/wasm agreement.

Must not move: `LAB_HASH`, `GOLDEN_STATE_HASH`, `ROOM_HASH`, `BATTLE_HASH`,
`SWAP_HASH`, `BOW_HASH`, `COMBAT_GEOMETRY_HASH`, `ARTICULATED_COMMAND_HASH`, contact
format corpus, combat spec-table digest, shipped duel fingerprints,
`LEARNED_INFERENCE_DIGEST`, and both legacy feature-prefix values. `ARTICULATED_HASH`
remains absent. Stop on any unpredicted move; do not re-record pins in the prototype
checkpoint.

## Commands

```powershell
cargo test -p sim directional_response -- --nocapture
cargo test -p sim combat::resolution::tests -- --nocapture
cargo test -p sim contact
cargo test -p sim --test determinism
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```

Run each red mutation individually and record its failing test sentence. Do not run
`cargo fmt` and do not regenerate any digest until checkpoint C has passed in full.
