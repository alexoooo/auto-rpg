# Smart AI 11 -- effective articulated contact response

**Status:** checkpoint B closed `revise`; no authority edit. Session 10 measured a strong sword/body fact
with closure energy `381 -> 381` and zero channels although the flesh restitution is
zero. This session repairs, or explicitly rejects, the generalized response that
chooses the group impulse. It does not tune the energy floor, anatomy thresholds,
weapon masses, actuator effort, or tactical policy.

**Goal:** make a projected contact meet its material restitution target while
accounting for every generalized collider the projector moves. Preserve whole-closure
energy non-increase and fixed-point determinism. Then rerun the matched strong/tactical
corpus to learn whether a separate energy-scale successor is still required.

The first test-only comparison on 2026-08-12 did not authorize a candidate. The
current upper-root selector failed a deliberately red captured-strike test because it
still dissipated zero. An exhaustive translation-only projector then produced this
matrix:

| candidate | independent restitution | captured five-row translation | simultaneous/shared target | nonlinear response |
|---|---|---|---|---|
| projected restitution over the current impulse | pass | reject: no energy-admissible alpha reaches restitution | pass at exact alpha `43,691` under `(maximum absolute target error, alpha, energy)` | bounded enumeration only |
| finite response from one probe | pass on a linear pair | reject | not established | named reject |
| ownership aggregate plus projected restitution | pass | pass | pass on a symmetric two-contact target | not tested against the World joint clamp |

The last row is promising, not selected. Its projector replaced a body's divisor with
the mass of every row translated with it and recomputed the proposal from that same
mass. It was still a translation-only model: it did not run the captured state through
`ContactProjector::project`, whose inverse-hand map and clamp are the nonlinear part
that can invalidate the algebra. The 29 focused resolution tests passed with the
test-only comparison installed; the prototype was then removed so no partial selector
looks authoritative. Resume at checkpoint A with an actual World-projector capture,
including the fact's stored normal. Do not reconstruct that normal from a rounded
impulse.

The resumed actual-World checkpoint on 2026-08-12 also closed `revise`, with all sim
edits reverted. Replaying the retained 48+48 captured diagnostic to immediately before
contact and sampling the real private `ContactProjector` produced exact
`(alpha, closure energy, signed post-normal speed)` rows:

```text
(0,381,-6346) (4096,357,-5914) (8192,339,-5511)
(16384,314,-4713) (29536,299,-3431) (32768,300,-3115)
(58679,376,-597) (65536,416,68)
```

The stored fact normal was raw `(2256,65497,0)`. Thus no energy-admissible alpha of
the old proposal reaches the zero-restitution target. With target translated mass raw
`211681` used in both the proposal and body response, an exhaustive **test-only**
oracle found exact best `(error, alpha, energy, signed speed) = (0,64858,103,0)`.
This proves the planar captured mechanism can be repaired; it does not prove the
scalar ownership rule in general. World discards body Z, joint projection is
anisotropic/nonlinear, and friction supplies tangential impulses, so nonzero-Z normals
and tangential contacts require a directional response matrix or named rejection.
The attempted bounded selector correctly changed zero-restitution simultaneous case
1 but rejected a persistent zero-time corpus case, confirming that a common scalar
alpha is not a general simultaneous-contact solver. Resume with a response-matrix/LCP
design covering planar, vertical, frictional, mixed opening/closing, source-side joint,
and shared-target groups; do not special-case the captured horizontal blow.

Read the [determinism contract](../reference/determinism.md#contract) and the
[contact solver reference](../reference/contact-solver.md) before editing. The
authoritative seam is `resolve_group_into` in
[`crates/sim/src/combat/resolution.rs`](../../crates/sim/src/combat/resolution.rs);
the coupled response is `ContactProjector::project` in
[`crates/sim/src/world.rs`](../../crates/sim/src/world.rs). `sim` remains dependent on
`fx` only.

## The captured defect

The exact strong-reference fact reported velocity A raw `(332, 6338, 0)`, velocity B
raw `(0, 0, 0)`, proposed impulse on A raw `(-183, -3508, 0)`, energy before `381`,
full-alpha energy `416`, and accepted energy `381`. Its five-row closure was:

| row | entity/slot | kind | mass raw | velocity raw | accumulated impulse raw |
|---:|---|---|---:|---|---|
| 0 | attacker/body | body | 65,536 | `(0, 0, 0)` | `(0, 0, 0)` |
| 1 | attacker/right | sword | 81,264 | `(332, 6338, 0)` | `(-183, -3508, 0)` |
| 2 | attacker/left | held equipment | 58,982 | `(0, 0, 0)` | `(0, 0, 0)` |
| 3 | target/body | body | 65,536 | `(0, 0, 0)` | `(183, 3508, 0)` |
| 4 | target/right | club | 146,145 | `(0, 0, 0)` | `(0, 0, 0)` |

`proposed_impulse` divides by the sword and target-body inverse masses. The projector
then gives the target body's delta to its club as well. The club therefore receives
kinetic energy despite contributing no effective mass to the proposal. Full alpha
overshoots. The present bit-greedy search asks for the **largest** alpha whose integer
closure energy is no greater than the input, so it selects the far, return-to-input
root rather than a material response. The ledger consequently rounds back to
`381 -> 381`; zero dissipation means zero allocated share and zero cut, thrust, and
pressure.

An offline translation-only reproduction of those five rows, using the production
fixed-point `scaled_delta` parenthesization and dragging the target club with its body,
gives this diagnostic curve. It omits the joint inverse/clamp and therefore explains
the shape, not the production endpoint `416`:

| alpha raw | ledger energy | unrounded energy loss |
|---:|---:|---:|
| 0 | 381 | 0.000 |
| 4,096 | 361 | 19.684 |
| 8,192 | 344 | 36.523 |
| 16,384 | 319 | 61.265 |
| 29,536 | 304 | 76.208 |
| 32,768 | 306 | 75.041 |
| 58,679 | 380 | 0.098 |
| 65,536 | 420 | -39.824 |

The minimum is near alpha `29,536`; the upper admissible root is near `58,679`.
Production projection changes those exact values but not the diagnosis. A search that
compares adjacent integer energies is also invalid here: fixed-point plateaus can make
`E(mid) == E(mid + 1)` before the true minimum.

## Checkpoint A -- freeze response observations

Before changing authority, add a test-only response probe beside the private World
projector in [`crates/sim/src/world.rs`](../../crates/sim/src/world.rs). It builds the
five captured generalized rows and samples alphas in this stable order:

```rust
const RESPONSE_ALPHAS: [u32; 8] =
    [0, 4_096, 8_192, 16_384, 29_536, 32_768, 58_679, 65_536];

#[test]
fn the_captured_strike_has_two_energy_roots_and_one_dissipative_basin() {}
```

The fixture must use `ContactProjector::project`, not a copied projector. Assert raw
row velocities, closure energies, pre/post normal closing speeds, and whether a joint
limit was active. Keep the translation-only table above as provenance; record the
actual production table in
[`docs/performance/smart-ai-matched-tactical.md`](../performance/smart-ai-matched-tactical.md).
Add a second fixture with the target club removed:

```rust
#[test]
fn target_held_mass_changes_the_projected_contact_response() {}
```

This must fail if the club is removed from the closure but its expected response is
left unchanged. It proves the defect is generalized coupling rather than a sword
constant. Checkpoint A is instrumentation only and moves no pin.

## Checkpoint B -- compare candidate response rules

Implement all candidates first as pure, test-only selectors over
`ContactTrialProjector::project`. Each returns either one `alpha_raw` or a named
rejection; it does not commit rows or allocate wound energy.

1. **Projected restitution target.** For every fact, measure projected relative
   normal speed from the fact's two generalized rows. Select the smallest stable alpha
   at which closing has crossed the material target
   `v_n_after >= restitution * closing_before`, subject to closure energy not
   increasing. Simultaneous groups minimize the maximum absolute target error, then
   choose the smallest alpha, then energy. All comparisons are raw integer tuples;
   energy is a validity constraint and never a license to exceed restitution.
2. **Finite-response effective mass.** Probe a fixed nonzero alpha, derive the
   projected change in relative normal velocity per applied normal impulse, recompute
   the impulse required for `(1 + restitution) * closing`, and project once more.
   Refuse zero slope, a sign reversal, saturation, or a probe/final slope disagreement
   greater than one raw velocity unit. This candidate may win only if it agrees with
   candidate 1 on every linear fixture and rejects nonlinear joint clamps by name.
3. **Ownership aggregate.** Add masses of equipment translated rigidly by an impacted
   body to that body's inverse-mass term before proposing the impulse. This is the
   cheapest algebraic candidate, but it may win only if it also covers source-side
   joint coupling and simultaneous shared-limb groups. A target-club-only fit is an
   invalid result.

Do **not** ship “minimize closure energy,” “divide the old accepted alpha by two,” or
“bill the classical two-point energy loss without removing it from state.” Minimizing
alpha-space energy makes an overshooting elastic contact maximally inelastic and
erases restitution. Half the upper root assumes a quadratic through the origin despite
fixed-point clamps. Billing energy not removed lets anatomy spend energy the state
still carries.

Add these exact tests in [`crates/sim/src/combat/resolution.rs`](../../crates/sim/src/combat/resolution.rs)
using a deterministic fixture projector, and repeat the captured-world assertion in
`world.rs`:

```rust
#[test]
fn zero_restitution_stops_relative_normal_closing_after_projection() {}
#[test]
fn positive_restitution_preserves_the_requested_rebound() {}
#[test]
fn opening_contacts_apply_no_impulse() {}
#[test]
fn simultaneous_contacts_choose_one_order_independent_response() {}
#[test]
fn fixed_point_plateaus_do_not_end_the_search_before_the_target() {}
#[test]
fn a_nonlinear_joint_response_is_rejected_instead_of_linearized() {}
#[test]
fn the_captured_strike_does_not_choose_the_return_to_input_energy_root() {}
```

Show the first test red under the current greedy upper-root selector; show the
restitution test red under a minimum-energy selector; show the held-mass test red when
row 4 is excluded from the response; show the plateau test red with an adjacent-slope
binary minimum. Revert every mutation before selecting a candidate.

## Checkpoint C -- authority and decision

Only the candidate that passes checkpoint B may replace the alpha/impulse selection
inside `resolve_group_into`. Preserve `closure_energy`, accumulator ordering,
`allocate_shares_into`, `ContactResolution` layout, contact ordering, and the
`after_group` seam. No new float, allocation on the warmed solve path, stateful RNG,
or unstable iteration is permitted. If candidate 1 needs bounded enumeration, state
the bound and tie order in code and prove the existing contact scratch capacities do
not grow.

The candidate passes mechanics correctness only if all of these hold:

- every independent two-point fixture matches the closed-form restitution response
  within one raw normal-velocity unit;
- the captured zero-restitution strike leaves normal closing at most one raw unit,
  has `after < before`, and selects an alpha inside the measured dissipative basin,
  never its upper return root;
- elastic and partially elastic fixtures rebound within one raw unit of their target;
- every accepted group has `after <= before`; every unsupported nonlinear response is
  rejected and counted rather than silently accepted;
- results and serialized bytes are identical across entity/limb permutations, eight
  native threads, and native/wasm execution;
- no warmed solve-path allocation or capacity growth is introduced.

Then rerun session 10's bracketed calibration and held-out corpora. This session is
**pass** if mechanics correctness holds and the strong-tip nonzero-dissipation rate is
at least 95%, with zero new solver rejections or energy excess. It is still a pass if
the median dissipated energy remains below `CONTACT_ENERGY_FLOOR = 144`; record that as
evidence for a separate energy-scale/floor successor rather than changing the floor
here. It is **revise** if no candidate meets restitution and energy together, if the
strong reference loses contacts, or if rejection/cap rates increase. Tactical body
decisions are reported but are not an acceptance criterion for this mechanical rule.

### Post-mechanics Lab validation

The rerun has two deliberately separate answers. The mechanical response passes by the
criteria above; a sword becomes visibly meaningful only when the same legal reference
also clears the damage path. `strong_strike::meaningful_strike_validity` defines one
case without reading authority internals:

- exactly one attacker-right-sword/target-body resolution and no competing fact;
- a crossing of the contacted observed region by consecutive published sword poses;
- `after < before` and positive published dissipated energy;
- positive cut or thrust (pressure alone is not anatomy damage);
- positive integrity loss in the exact region named by the resolution; and
- a matched zero-effort control with no fact, energy, channel, integrity, wound, or
  blood change.

The crossing is not a policy/reporting boolean: the validator reruns
`swept_segment_segment` over the stored consecutive published sword poses and the
stored observed capsule for the resolution's region. Contact attribution likewise
matches attacker identity, right-sword slot, target identity, and `BODY_SLOT`; every
other resolution on that tick is competing. Legal-run validity comes from actual
`SubmitArticulatedOutcome` refusals, `World::contact_solver_rejections`, and the maximum
published `after - before` energy excess. Tests move the observed capsule off the arc,
zero dissipation, zero the damaging channels, restore regional integrity, add a
competing fact, activate the control, and add a refusal independently; each mutation
makes the same validator reject.

Calibration is valid only with byte-equal reference brackets, zero command refusals,
solver rejections, energy excess, unattributed anatomy changes, ambiguous contacts, or
active controls. Run held-out only after that count is zero. Preserve the existing
absolute rates: at least 95% uniquely attributed reference crossings/contacts and
nonzero dissipation, and at least 90% positive cut-or-thrust with matching regional
integrity loss. Report cut wounds separately because an axial thrust may lower
integrity while correctly adding no open wound. A mechanics response can satisfy its
restitution checkpoint yet leave this visible-attack gate `revise`; do not hide that
outcome by pooling pressure or pre-resolution energy with damage.

`--held-out` enforces the order rather than trusting an operator note: it first reruns
all 900 calibration cases through the structural predicate and exits 2 with the failure
count unless every case is valid. Only then does the process enumerate seeds
`900_000..900_100`. This costs one extra calibration pass and prevents a stale CSV from
unlocking held-out after either the mechanics or harness changes.

The reference command remains observation-bounded: its bearing comes from the observed
opponent position, and its command height is the observed Legs region centre converted
to a fraction of the subject's published standing height. It never reads a World pose
or actuator state to repair a miss.

Update the coupled impulse argument in
[`docs/reference/contact-solver.md`](../reference/contact-solver.md), the pin history
in [`docs/reference/hashes.md`](../reference/hashes.md#golden-registry), and the raw
tables and conclusion in
[`docs/performance/smart-ai-matched-tactical.md`](../performance/smart-ai-matched-tactical.md)
in the same change.

## Pin budget

This is an authoritative `crates/sim` behavior change. Before implementation, record
all current values. The expected moves are:

- `CONTACT_BEHAVIOR_DIGEST`: **must move**. The zero-restitution simultaneous case 1
  currently accepts full alpha and over-rebounds, so its response must change. The
  elastic shared-limb case 2's alpha `43,691` is a correct restitution response and
  must remain byte-identical; changing case 2 is evidence that the implementation
  minimized energy instead of honoring restitution.
- `ARTICULATED_STREAM_DIGEST`: **expected to move** because its twenty-tick clinch
  reaches the coupled contact projector. Rebuild native and wasm and require agreement
  before re-recording both owners.

These must not move: `LAB_HASH`, `GOLDEN_STATE_HASH`, `ROOM_HASH`, `BATTLE_HASH`,
`SWAP_HASH`, `BOW_HASH`, `COMBAT_GEOMETRY_HASH`, `ARTICULATED_COMMAND_HASH`, the
contact format corpus, combat spec-table digest, both shipped duel fingerprints,
`LEARNED_INFERENCE_DIGEST`, and both legacy-feature-prefix values. No layout/version,
scenario fingerprint, command stream, spec value, or inference byte changes here.
`ARTICULATED_HASH` remains absent. If any must-not-move pin changes, stop and diagnose;
do not widen the budget. If the articulated stream unexpectedly stays byte-identical,
prove from its per-tick facts that it never reaches a changed response before retaining
the old value.

The behavioral corpus's expected new literal rows and digest are printed only after
the rule passes checkpoint C. Record old and new alpha, ledger, impulse, channel, and
final-velocity words for every changed case; a bare digest replacement is not enough.

## Exact commands

```powershell
cargo test -p sim the_captured_strike_has_two_energy_roots_and_one_dissipative_basin -- --nocapture
cargo test -p sim combat::resolution::tests -- --nocapture
cargo test -p sim contact
cargo test -p lab tactical_mechanics
cargo run --release -p lab -- tactical-mechanics --quick
cargo run --release -p lab -- tactical-mechanics --calibration --write target/smart-ai-11-calibration.csv
cargo run --release -p lab -- tactical-mechanics --held-out --write artifacts/smart-ai-11-held-out.csv
cargo run --release -p lab -- hash
cargo test -p sim --test determinism -- --nocapture golden
cargo test -p web -- --ignored --nocapture print_the_golden_hashes
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

Run the required red demonstrations before the full suite, then restore and run the
commands above. Do not run `cargo fmt`. Retain a held-out CSV only if repository
artifact policy admits it; otherwise record its SHA-256, byte count, header, exact
command, and complete summary in the performance document.
