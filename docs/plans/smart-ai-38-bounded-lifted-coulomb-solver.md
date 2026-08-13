# Smart AI 38 -- bounded lifted normal and circular-Coulomb solver

**Status:** proposed feature-only successor to Smart36/37. Checkpoints A and B
may begin once the full `cartesian-recoil` trajectory/lifecycle suite and the
non-boundary replay proof in
[`smart-ai-36-exact-lifted-trajectories.md`](smart-ai-36-exact-lifted-trajectories.md)
are green. Checkpoint E's ordinary wall/cap replay is blocked on the stronger
response this session supplies: after B, complete that replay and register its
native/wasm exact-state digest before beginning C or D. This is an explicit
dependency split, not permission to omit the checkpoint-E boundary row.

Smart36 makes an exact response trial authoritative, but it deliberately keeps the
old point-mass proposal from
[`proposed_impulse`](../../crates/sim/src/combat/resolution.rs#L73) and chooses only
one scalar alpha in
[`ExactKinematics::resolve_group`](../../crates/sim/src/combat/resolution.rs#L797).
That is a lifecycle proof, not a response law. Earlier research already rejected
retuning that ray, importing a normal bracket from another mapper, and fitting a
black-box Jacobian to a rounded projector. This session replaces the feature path's
proposal and alpha search together. It uses the linear lifted momentum authority,
integer impulse words, an exact restitution inequality, and the actual circular
Coulomb cone.

This is intentionally a small mechanical session. It does not tune policy, score
damage while selecting a solver result, enable `cartesian-recoil` by default, train a
checkpoint, or claim the Arena is fixed. Its exit is one robust mirrored
ordinary-command strike. Tactical calibration is the next session only if that gate
passes.

## Law

At one simultaneous group, sort facts by canonical `ContactKey` and freeze their
pre-group exact owner state. Contact `i` carries the published nonzero normal raw
vector `N_i`, restitution `e_i = min(e_a, e_b)`, friction
`mu_i = min(mu_a, mu_b)`, and one signed integer impulse vector `Q_i` applied to A;
B receives `-Q_i`. `Q_i` is the final `ContactImpulse` word -- there is no later
alpha. The trial state is always rebuilt from the frozen pre-group state by one call
to [`apply_exact_group`](../../crates/sim/src/combat/trajectory.rs#L659) with the
complete ordered impulse array. A candidate never accumulates onto the result of a
previous candidate trial.

For the exact post-trial relative velocity `V_i(Q) = V_b - V_a`, define:

```text
n2_i       = dot(N_i, N_i)
normal_i   = dot(V_i(Q), N_i)
closing_i  = min(dot(V_i(0), N_i), 0)
target_i   = -e_i * closing_i
dotq_i     = dot(Q_i, N_i)
tangentQ_i = n2_i * Q_i - dotq_i * N_i
tangentV_i = n2_i * V_i(Q) - normal_i * N_i
```

The dots are mathematical dots over raw integer/rational words, not `Fx::dot` and
not published rounded velocities. A selected group must satisfy, for every contact:

```text
dotq_i <= 0                                      unilateral impulse on A
normal_i >= target_i                            Newton restitution, no closing remainder
|tangentQ_i|^2 * 65_536^2
    <= mu_i.raw^2 * dotq_i^2 * n2_i             circular Coulomb cone
```

The last inequality is the Euclidean circle written without a square root or
normalisation. It must not be replaced by independent component clamps, an L1 cone,
or a four-/eight-sided friction pyramid. Zero friction forces `tangentQ_i == 0`.
An initially separating contact has `target_i == 0`; its unique minimum candidate is
zero unless another contact in the same closure makes a compensating impulse
necessary.

Among candidates that satisfy all three laws, selection is lexicographic and exact:

1. minimise `sum_i |tangentV_i|^2 / n2_i^2` (post-group physical slip);
2. minimise `sum_i (normal_i - target_i)^2 / n2_i` (restitution overshoot);
3. minimise `sum_i |Q_i|^2`;
4. compare `(Q_0.x,Q_0.y,Q_0.z,...Q_n.z)` as signed integers.

Fractions are compared by checked cross-products through `WideRational4096`; they
are never divided for the decision. Damage, energy allocation, target region,
severance, and policy outcome are absent from this score. Exact physical energy is
checked only after selection. A selected group whose energy rises is
`ExactSolverNoDissipativeCandidate`, not permission to resurrect the global alpha
ray.

The complete integer cone is too large to enumerate. The bounded algorithm below is
therefore part of the law, not an approximation hidden behind the equations.

## Bounded deterministic search

Add `crates/sim/src/combat/lifted_solver.rs` behind `cartesian-recoil`, beside
`resolution.rs`; expose only crate-private types:

```rust
pub(crate) const MAX_LIFTED_SOLVER_FACTS: usize = 16;
pub(crate) const MAX_LIFTED_SOLVER_ROWS: usize = 42;
pub(crate) const LIFTED_SOLVER_SWEEPS: usize = 8;
pub(crate) const LIFTED_LIFTS_PER_VISIT: usize = 96;

pub(crate) struct LiftedImpulse { pub(crate) raw: [i32; 3] }
pub(crate) struct LiftedSolverScratch {
    impulses: Vec<LiftedImpulse>,
    trial_rows: Vec<ContactResolution>,
    candidates: Vec<LiftedCandidate>,
    trial_owners: FixedExactOwners,
}

pub(crate) enum LiftedSolverReject {
    Identity, FactEnvelope, RowEnvelope, CandidateEnvelope, ImpulseEnvelope,
    ArithmeticEnvelope, NoRestitutionCandidate, NoDissipativeCandidate,
}

pub(crate) fn solve_lifted_group(
    trajectories: &[ExactContactTrajectory], owners: &[ExactOwnerTrajectory],
    physical_rows: &[usize], facts: &[LiftedContact], time_raw: u32,
    motor_velocities: &[[i32; 3]], scratch: &mut LiftedSolverScratch,
) -> Result<LiftedGroup, LiftedSolverReject>;
```

The `42`-row boundary is the already-measured worst-case 96-bit exact-energy
envelope: 42 independent terms fit the fixed 4,096-bit word and term 43 refuses.
Sixteen facts cover an ordinary two-fighter group without pretending the existing
512-fact collection ceiling is a proved solver ceiling. Both limits are checked
before clearing scratch or constructing a trial. The sweep and lift counts are
algorithmic constants and therefore hashed into the new feature-only diagnostic
digest described below.

One **visit** updates one contact while all other impulse words remain fixed:

1. Read its exact current normal and tangent residuals from a trial of the complete
   impulse array.
2. Form a normal ray in direction `-N_i`. Binary-search the full nonnegative `u32`
   scale interval for the first scalar whose rounded component lift reaches the
   restitution half-space. At every scalar enumerate all floor/ceiling combinations
   of the three rational components (at most eight), plus the existing word. Retain
   the boundary scalar, its predecessor, and successor. Component conversion must
   use checked `i32`; an out-of-range lift is `ImpulseEnvelope`, not saturation.
3. From each retained normal lift, form the physical tangent residual above and a
   ray opposite that residual. Binary-search once for its zero-slip crossing and once
   for the circular-cone boundary. Enumerate the same eight component neighbours at
   each boundary and at `boundary +/- 1`. Reject candidates outside the cone rather
   than component-clamping them onto it.
4. Deduplicate exact impulse triples, evaluate at most 96 candidates, discard any
   candidate that violates unilateral/restitution/cone constraints for the visited
   contact, and choose it by the global score above. Exceeding 96 is
   `CandidateEnvelope`; truncation would make iteration order authoritative by
   accident.

Run eight complete forward sweeps in `ContactKey` order. Do not early-exit: a fixed
sweep count makes the same arithmetic path execute when the last word happens to
stabilise on different sweeps. After sweep eight, rebuild one final trial and validate
all contacts simultaneously. Coupling can reopen an earlier constraint; any reopened
normal or cone constraint is `NoRestitutionCandidate`, with no state mutation. This
fixed bounded projected search is the solver definition. Increasing a limit after
observing the strike corpus is a law change and needs a new plan and new diagnostic
digest.

Every scalar search compares exact rational signs and squared words through
[`WideRational4096`](../../crates/sim/src/combat/wide.rs#L295). No float, square root,
GCD, host integer intrinsic, unchecked product, heap bigint, stochastic order,
iteration-to-convergence loop, or damage feedback is permitted. Wide overflow maps
to `ArithmeticEnvelope`. The final impulse remains three `i32` raw words because that
is the existing resolution/replay/publication grammar; response position and momentum
remainders continue to live only in exact owner state.

## Integration boundary

In [`solve_contact_tick_with`](../../crates/sim/src/combat/resolution.rs#L970), keep
collection, simultaneous grouping, whole-entity closure, group recomputation,
suppression, cap semantics, allocation, channels, anatomy, and lifecycle order
unchanged. Split proposal ownership at the existing `ContactKinematics` seam:

- `CompatibilityKinematics` continues to call `proposed_impulse` and
  `resolve_group_into` byte for byte.
- `ExactKinematics` constructs ordered `LiftedContact` rows directly from facts and
  surfaces, calls `solve_lifted_group`, then uses the selected integer impulses as the
  input to the existing exact physical-energy, allocation, channel, `after_group`, and
  [`apply_exact_group`](../../crates/sim/src/combat/trajectory.rs#L659) path.
- Delete the exact path's `build_group_sums`, projector trial, and 16-bit alpha
  search. Leave those functions in place for compatibility. Every exact resolution
  reports `group_alpha_raw == 65_536`; this means “the published selected impulse was
  applied in full”, not that the old proposal ray won.

`ExactKinematics` must not call `ContactTrialProjector`: the lifted common/held
incidence is the response map. Motor velocities are constants during the breakpoint;
only exact response momentum changes. A trial derives relative velocities from
`exact_response_velocity`'s rational source rather than the rounded `ContactFact`
velocity fields.

Extend [`ContactTickScratch`](../../crates/sim/src/combat/resolution.rs#L581) with one
retained `LiftedSolverScratch`. `try_reserve` reserves 16 impulses, 16 published rows,
and 96 candidates before World allocation completes; capacity reporting includes all
three `Vec`s. `FixedExactOwners` stays inline. No candidate, trial, cone comparison,
or score may allocate after warm-up. A refusal leaves owners, colliders, resolutions,
anatomy, external ledger, and retained capacities byte-identical. At group-cap
settlement, preserve every earlier committed group and roll back only the current
uncommitted solver trial, matching Smart37's cap rule.

Add `ResolutionError::ExactSolver(LiftedSolverReject)` only if the enum remains
crate-private end to end; otherwise add one named `ExactSolver` outer error and retain
the specific cause in a feature diagnostic row. Do not print from a library refusal.

## Checkpoint A -- exact cone and candidate grammar

Land `lifted_solver.rs`, pure dot/tangent/cone comparisons, component floor/ceiling
lifts, candidate deduplication, global score comparison, limits, and retained scratch.
The production driver does not call it yet.

Required tests:

```rust
#[test] fn circular_cone_accepts_the_boundary_and_refuses_each_axis_pyramid_corner() {}
#[test] fn zero_friction_admits_no_nonzero_tangent_impulse() {}
#[test] fn restitution_and_score_compare_unreduced_rationals_without_division() {}
#[test] fn component_lifts_cover_all_eight_floor_ceiling_neighbours_once() {}
#[test] fn sign_mirror_and_xy_permutation_select_mapped_impulse_words() {}
#[test] fn sixteen_facts_and_forty_two_rows_fit_but_each_next_word_refuses_atomically() {}
#[test] fn ninety_six_candidates_fit_and_the_ninety_seventh_refuses_instead_of_truncating() {}
```

The cone fixture uses a point that is inside the componentwise square but outside the
circle; replacing the squared circular comparison with three clamps must make it red.
For every numeric envelope, test both the last accepted and first refused word.

## Checkpoint B -- lifted group solve and production feature route

Implement the fixed eight-sweep visits, final simultaneous validation, and exact
energy check. Route only `ExactKinematics` to it and retain every default byte.

Required tests:

```rust
#[test] fn one_frictionless_contact_meets_restitution_with_the_smallest_lattice_overshoot() {}
#[test] fn static_friction_cancels_slip_inside_the_circle() {}
#[test] fn sliding_friction_lands_on_the_circle_and_opposes_slip() {}
#[test] fn two_shared_owner_contacts_are_valid_only_after_final_simultaneous_recheck() {}
#[test] fn fixed_sweeps_are_invariant_to_input_permutation_after_contact_key_sort() {}
#[test] fn a_nondissipative_candidate_refuses_before_allocation_or_owner_mutation() {}
#[test] fn a_solved_group_grows_no_retained_scratch() {}
#[test] fn exact_feature_resolution_no_longer_calls_the_proposal_alpha_ray() {}
```

For the last mutation test, inject a test-only `ContactTrialProjector` that always
fails. The exact feature fixture must still solve while the compatibility fixture must
fail through that projector. Then temporarily route the exact path back through
`proposed_impulse`; the named exact feature test must go red. A test that only checks
`group_alpha_raw == 65_536` cannot prove which law ran.

The static and sliding tests share one predeclared input and differ only in `mu` on
opposite sides of the analytically computed sticking threshold. They assert the exact
post-slip word and strict inside/on-boundary cone relation, not merely “friction made
the number smaller.” The two-contact fixture must fail if the final all-contact
validation is removed.

## Checkpoint C -- retained strike and robust mirrored mechanical gate

First rerun the retained right-sword/Brute-body fixture. Its old frozen ray literals
are research evidence, not expected output. Before running the new solver, write down
the expected identities and mechanically eligible conditions below; do not select a
candidate because it wounds more:

- ordinary submitted `ArticulatedCommandV1` rows only; no exact-state, pose, velocity,
  anatomy, or collider poisoning after spawn;
- one uniquely attributed interior WeaponBody contact for the attacking weapon;
- TOI strictly inside `(0, 65_536)`, nonzero selected impulse, no solver/detector
  refusal, no group cap, and final simultaneous restitution plus cone validation;
- exact endpoint and momentum remainders remain nonzero after commit and survive the
  following tick;
- damage and severance are recorded only after those mechanical predicates choose the
  row, as outcome evidence rather than selection input.

Then run one **predeclared** mirrored command corpus in a sim test. Reuse the exact
convention already encoded by `mirrored_articulated_duel` and the strong-strike
fixture: reflect across `y = 8`, mapping every spawn `(x,y)` to `(x,16-y)`, while
keeping entity, faction, loadout, and attacking hand unchanged. The shipped spawn
yaws are zero and `HALF`, both their own reflected heading, so no invented yaw column
or faction/hand swap belongs here. Reflect the strong-strike approach offset
`(x,y) -> (x,-y)` and negate its chamber/follow bearing commands; height, reach,
effort, and the 24-tick wind-up/strike/recovery timing remain byte-identical. Around
its central strike command, enumerate the Cartesian product of bearing
`{-1,0,+1}` raw and reach
`{-1,0,+1}` raw perturbations on the attacking arm: nine neighbours per side. The
central row and all 18 mirrored neighbours must satisfy the mechanical conditions
above with mapped `ContactKey`, region, TOI within one raw word, mapped impulse
`(x,-y,z)` within one raw word per component, identical exact dissipated energy,
identical anatomy result, and no cap/refusal. At least one outcome on each side must
have positive cut or thrust and positive integrity loss.

Required tests:

```rust
#[test] fn retained_strike_is_selected_by_mechanics_and_then_records_a_wound() {}
#[test] fn ordinary_command_strike_and_eighteen_neighbours_pass_the_mirrored_gate() {}
#[test] fn mirrored_gate_rejects_a_direct_pose_or_exact_state_fixture() {}
#[test] fn removing_normal_or_friction_response_breaks_the_gate_before_damage_is_read() {}
```

The corpus bytes and perturbation order must be literal before the first result is
inspected. If it finds no robust pair, stop this session and preserve the measured
failure; do not widen angles, reach, TOI tolerance, sweep count, candidate count, or
solver limits after seeing the output. A successor may declare a different corpus.

## Checkpoint D -- feature digest and handoff

Append one `LIFTED_COULOMB_SOLVER_DIGEST` to the golden registry only after direct
native run, native rerun, recorded-command replay, and wasm replay agree. Hash the
solver version, four bounds, ordered selected impulse words, exact owner state,
energy/ledger, anatomy, and refusal code for the mechanical corpus. Do not put scratch
capacity or search temporaries in authoritative state. Add matching native and web
exports only behind `cartesian-recoil`; the default wasm export set remains unchanged.

Update the durable contact-solver reference and articulated-contact research record
with the law, envelope, and retained/mirrored measurements. Mark Smart38 complete in
the overview, but do not delete Smart36/37/38 until the parent smart-AI topic is
finished; they still explain why policy promotion is gated.

## Pin budget

At the time this plan was written, `EXACT_TRAJECTORY_STATE_DIGEST` was still
unregistered. Its first native/wasm agreement and one-time registration belong to
Smart36 checkpoint E and are not a pin this session may create or silently
substitute for. Because the ordinary boundary row requires Smart38's stronger
response, A and B may run while it is absent; stop after B, complete checkpoint E,
and register that digest before C. Once registered, Smart38 treats it as fixed with
the pins below.

**Existing registered pin movement budget: zero.** In particular, `LAB_HASH`,
`ROOM_HASH`, `ARTICULATED_COMMAND_HASH`, `ARTICULATED_STREAM_DIGEST`,
`CONTACT_BEHAVIOR_DIGEST`, contact-format pins, combat fingerprints,
and `LEARNED_INFERENCE_DIGEST` must not move; the prerequisite
`EXACT_TRAJECTORY_STATE_DIGEST` must not move after Smart36 registers it. Default sim
and web do not compile the new route. The only pin Smart38 may add is the feature-only
`LIFTED_COULOMB_SOLVER_DIGEST`, recorded once after native/wasm agreement. Any
existing move stops the session; it is not re-recorded.

## Verification

Run each checkpoint's focused test first and deliberately break the cone comparison,
final simultaneous validation, exact-route dispatch, and mirrored response once to
show their named tests fail. Restore them before the full gates.

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p sim lifted_solver -- --nocapture
cargo test -p sim --features cartesian-recoil lifted_solver -- --nocapture
cargo test -p sim --features cartesian-recoil retained_strike -- --nocapture
cargo test -p sim --features cartesian-recoil ordinary_command_strike -- --nocapture
cargo test -p sim
cargo test -p sim --features cartesian-recoil
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

`wasm_check.js` tests the artifact already present, so run it immediately after each
matching default/feature build rather than once after both. No development server is
needed for this mechanics session.
