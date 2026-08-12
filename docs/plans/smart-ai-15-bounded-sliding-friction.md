# Smart AI 15 -- bounded projected sliding friction

**Status:** test-only successor, detailed coupled solve in progress. Session 13's ownership-aware nonlinear normal solve
reaches exact restitution on the retained articulated contact. Session 14 froze the
two-tangent basis and physical Coulomb cone, but the combined fixture remained sliding
with an impulse strictly inside the cone. No production authority or pin changed.

**Goal:** after the accepted normal projection, find either a static interior tangent
impulse with residual at most one raw unit, or a sliding impulse on the circular cone
boundary whose production `impulse_on_a` is parallel to post-contact slip under
`q=velocity_b-velocity_a`. Do not use zero tangent residual as a sliding condition.

## Exact energy and bounded search

Test helpers compute the widened checked kinetic numerator
`sum(mass_raw*(vx_raw^2+vy_raw^2+vz_raw^2))` before `closure_energy` divides it.
Acceptance requires combined numerator no greater than both the initial and normal-only
numerators. The divided `u64` is diagnostic only: the retained 64-raw Z perturbation
already proves it can hide a subunit change on the same reported energy plateau.

Use the canonical session-14 tangents and production impulse sign. Static search may
accept only an interior physical impulse and both tangent residuals within one raw unit.
Sliding search enumerates a fixed 256-entry canonical boundary table constructed with
checked integer arithmetic, projects each unique candidate once, and scores valid rows
by `(normal_error, KKT_cross_error, negative_alignment, combined_energy_numerator,
canonical_impulse_words)`. It must reject rather than loosen if no candidate has normal
error at most one, exact physical cone membership within rounding tolerance, positive
alignment, and no energy increase. Cache hits spend no projection; the hard cap is 256.

## Fixtures

Freeze actual-projector tests in `crates/sim/src/world.rs`:

```rust
#[test] fn widened_energy_numerator_sees_subunit_velocity_energy() {}
#[test] fn zero_friction_keeps_the_normal_projection_byte_identical() {}
#[test] fn projected_static_friction_sticks_inside_the_cone() {}
#[test] fn projected_sliding_friction_is_on_the_cone_and_parallel_to_slip() {}
#[test] fn tangent_projection_rechecks_the_normal_and_energy_numerators() {}
#[test] fn projected_friction_is_invariant_under_tangent_coordinate_permutation() {}
```

The retained articulated sliding fixture must keep session 13's normal scale 64,858,
normal residual at most one, and both nonzero tangent coordinates. Record exact initial,
normal-only, and combined energy numerators. A result that repeats `(99,-64)` with slip
96 and radius 1,406 is the red control, not acceptance: it is interior while sliding.

## Authority and pins

All work remains under `#[cfg(test)]`. No pin may move and `ARTICULATED_HASH` remains
absent. Production is forbidden until actual static, sliding, zero-friction, normal
recheck, permutation, physical rounded-cone, evaluation-cap, and allocation fixtures
pass together. A later authority session must declare a new exact pin budget first.

The first coarse actual-projector boundary diagnostic enumerated all 256 canonical tangent
directions with fixed Coulomb radius 1,406. The retained normal row was
`q=(0,-97,-12)` with widened numerator `889498653156` from initial
`3273684808896`; no boundary direction simultaneously preserved normal restitution,
stayed below both widened energy ceilings, and satisfied production-sign KKT. This is
a named diagnostic rejection, not a tolerance change. `889498653156` is the earlier
interior `(99,-64)` combined numerator, not a normal-only ceiling. The search neither
re-solved normal per angle nor proved the greatest representable radius, so `None`
proves only that the coarse sampler is insufficient. The earlier zero-friction test
also projected identical sums twice and is a red control for test strength, not mu=0
evidence. The detailed checkpoint below must replace both claims before closure. The
subunit fixture still usefully rejects numerator 82 against normal 81 even though both
divided energies are zero.

The detailed coupled attempt removes the stale proposal tangent, seeds from the actual
pre-slip `atan2`, normalizes each tangent ray, and re-solves the pure `-normal*lambda`
coordinate for every visited direction. On the retained articulated projector its
fixed-point direction iteration repeats after 540 actual projections and returns the
named `Cycle` rejection within the 3,072 cap. That is the current honest checkpoint
outcome. It is still not authority or a complete solver: the prototype has not yet
added a fixed cache, proven the greatest representable radius with a `rho+1` rejection,
or performed neighbor KKT and independent uncached final validation. Those omissions
must not be converted into a looser acceptance test.

## Commands

```powershell
cargo test -p sim sliding_friction -- --nocapture
cargo test -p sim widened_energy_numerator -- --nocapture
cargo test -p sim friction_ -- --nocapture
cargo test -p sim nonlinear_ -- --nocapture
node tools/check_docs.js
git diff --check
```
