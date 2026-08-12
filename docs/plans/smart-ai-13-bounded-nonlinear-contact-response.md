# Smart AI 13 -- bounded nonlinear projected contact response

**Status:** checkpoint A in progress, test-only. Session 12 measured the retained
captured strike through the real `ContactProjector`: impulse probes 256 and 512
changed signed normal speed by 502 and 965 raw. The -39 raw doubling error rejects
a fixed response column. No production authority or pin changed.

Checkpoint A now separates the two defects. Searching the existing local-body-mass
map is rejected because its restitution crossing exceeds the pre-contact energy.
The ownership-aware proposal/map plus bounded actual-projector search selects exact
`(scale,q,energy,evaluations)=(64858,0,103,33)` on the same captured rows. This is
evidence for the combined candidate, not authority: two-contact, vertical, joint,
friction, and allocation gates remain open.

Checkpoint B's bounded two-coordinate scaffold is green on an actual body-only World
projection: two equal one-mass sources close on one one-mass target, and the shared
target's coupled accumulator selects impulses `(21845,21845)`, residuals `(-1,-1)`,
and closure energy `43690` from `65536`. The fixed cache remains below 65 actual
projections. A canonical permutation maps back to the same physical words, an opening
coordinate receives zero impulse, repeated iterates return `Cycle`, and an eight-sweep
escape returns `NoConvergence`. This does not yet cover articulated shared ownership,
nonzero Z, or joint branches, so it is still test-only and does not authorize normal
production response.

Two reverted red demonstrations were run. Deleting the second source's contribution
to the shared target changed the pinned answer to `(32768,32768)`, proving the actual
cross response is load-bearing. Requiring an inactive opening coordinate to have an
absolute restitution residual at most one made the opening/permutation test cycle,
proving the complementarity distinction is load-bearing.

Checkpoint C freezes two actual-projector boundaries. A nonzero-Z body/body impulse
projects both body Z velocities to zero because the floor owns that reaction; the
normal search therefore returns `UnsupportedNonlinear` rather than inventing a body
vertical degree of freedom. The retained articulated capture also proves its source
row is held equipment and repeats the exact 256/512 response `(502,965)`: the -39
doubling discrepancy names that joint branch `UnsupportedNonlinear` before a linear
root search. Preserving body Z would fail the floor fixture; accepting a tolerance of
39 would fail the pinned joint rejection. Neither rejection authorizes falling back
to the old upper energy root.

The final session-13/session-14 integration closes `revise` for friction authority.
On the retained articulated projector, the ownership-aware normal scale 64,858 plus
the current two-tangent proposal survives one final projection with exact normal
`q=0`, energy `381 -> 103`, normal impulse 5,627 raw, tangent coordinates `(99,-64)`,
and Coulomb radius 1,406. Both tangent coordinates are nonzero and the physical
coefficient vector is strictly inside the disk. But projected slip only falls
`129 -> 96` raw: it does not stick, while its impulse is not on the cone boundary.
That is neither the interior static condition nor the boundary sliding KKT condition.
The box solver plus circular rejection can validate a candidate but cannot construct
the required disk-boundary sliding response. Production authority is therefore not
viable from these prototypes. A successor needs a bounded circular-cone solve with
actual-projector static, sliding, zero-friction, permutation, cap, and normal-recheck
fixtures before revisiting authority; no tolerance or old-alpha fallback is allowed.

**Goal:** solve normal restitution against the actual bounded projector response,
without pretending it is linear. Friction, wounds, authority, and pin recording are
out of scope until the normal fixtures pass.

Read [the determinism contract](../reference/determinism.md#contract),
[contact solver](../reference/contact-solver.md), and
[session 12](smart-ai-12-directional-contact-response.md) first.

## Checkpoint A -- one projected coordinate

Add a test-owned evaluator beside `ContactProjector` in
[`crates/sim/src/world.rs`](../../crates/sim/src/world.rs). A candidate is a
nonnegative raw scale on the contact's recomputed ownership-aware proposal, applied
through `project`. Its result is `(q_raw, closure_energy, scale_raw)` from the
projected generalized rows. The current Coulomb tangent direction remains a frozen
dependent component because removing it changes the joint response; checkpoint A
does not solve or authorize friction independently.

For one closing contact, evaluate raw zero first, then double the upper impulse from
one through at most `i32::MAX` until `q >= target`, projector rejection, component
saturation, or the bound.
Every adjacent bracket endpoint must be nondecreasing in `q`; otherwise return
`NonMonotone`. Binary-search the first raw impulse whose actual projected `q` reaches
the target. Evaluate that word and its predecessor, accepting only
`abs(q-target)<=1` and `energy_after<=energy_before`. Score accepted candidates by
`(abs(q-target), energy_loss, scale_raw)`, where smaller energy loss wins after
restitution so elastic contacts preserve energy rather than acquire a rounding loss.
The hard budget is 65 actual projections: zero, at most 31 doublings, at most 31
bisections, the lower neighbor, and the independent final validation. A fixed
65-entry cache uses canonical insertion order; a cache hit spends no projection.
Sampled monotonicity cannot prove a joint map globally monotone, so failure to bracket,
a sampled reversal or gap, saturation, and exhaustion are conservatively named
`UnsupportedNonlinear`. Projector error remains distinct.

Freeze:

```rust
#[test] fn nonlinear_response_reaches_zero_restitution_on_the_captured_strike() {}
#[test] fn nonlinear_response_has_a_fixed_evaluation_budget() {}
#[test] fn nonlinear_response_refuses_a_nonmonotone_projector() {}
```

The captured fixture must retain normal `(2256,65497,0)`, `q0=-6346`, and energy
381. It must repeat session 12's failed linear-doubling evidence. Searching the old
local-mass proposal/projector is an explicit red control: its
restitution crossing is not energy-admissible and must return `UnsupportedNonlinear`,
not be promoted. The passing candidate must combine the ownership-aware proposal/map
repair session 11 identified with this nonlinear root search, then pin selected raw
impulse, q, energy, and evaluation count before any two-contact work.

## Checkpoint B -- two projected coordinates

Only after checkpoint A passes, add a shared-target fixture with two canonical
`ContactKey` coordinates. Use cyclic coordinate lower-bound searches in canonical
order. Each coordinate search holds the other impulse fixed and uses the same bounded
bracket rule. Stop when every residual is within one raw unit, or reject after eight
full sweeps. Record every impulse pair in a fixed 16-slot visited table and return
`Cycle` on repetition. Each coordinate search shares one fixed candidate cache and
counter; the whole solve hard-stops at 256 actual projections regardless of how many
of the eight sweeps are entered. Cached pairs do not spend the cap. Ties use
`(maximum absolute residual, energy loss, symmetry class, canonical impulse words)`.

Freeze:

```rust
#[test] fn nonlinear_shared_target_uses_both_projected_coordinates() {}
#[test] fn nonlinear_shared_target_is_invariant_under_contact_permutation() {}
#[test] fn nonlinear_shared_target_rejects_a_cycle_by_name() {}
#[test] fn nonlinear_opening_coordinates_receive_zero_impulse() {}
```

Deleting either coordinate update or reversing canonical order must fail a named
test. A successful mathematical iterate is not accepted until one final real
projection independently verifies every restitution residual and nonincreasing
closure energy.

## Authority gate and pin budget

No production edit is authorized by checkpoint A alone. Normal checkpoint B,
nonzero-Z, joint-branch, capacity, allocation, and later friction fixtures must pass
before editing `resolve_group_into`, `solve_contact_tick`, or commit authority.

All session-13 prototype work is under `#[cfg(test)]`; therefore every registered
hash and corpus must remain unchanged and `ARTICULATED_HASH` remains absent. If a
later session promotes an authority solver, it must state a new exact pin budget
before the first production edit rather than inherit session 12's hypothetical one.

## Commands

```powershell
cargo test -p sim nonlinear_response -- --nocapture
cargo test -p sim directional_response -- --nocapture
cargo test -p sim combat::resolution::tests -- --nocapture
node tools/check_docs.js
git diff --check
```
