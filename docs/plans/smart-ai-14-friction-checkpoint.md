# Smart AI 14 -- pure static-friction checkpoint

**Status:** test-only pure static-friction checkpoint complete; sliding solver and
actual-projector checkpoints blocked
on session 13. Session 13 owns the bounded
nonlinear normal search and actual `ContactProjector` fixtures. This session adds no
production response, changes no authority, and moves no pin.

**Goal:** freeze the deterministic tangent basis and static Coulomb constraints before
the normal prototype grows a friction stage. This does not claim a general friction
solver: static friction may cancel tangential velocity, while sliding friction must
retain slip and satisfy a boundary KKT condition. Actual-projector integration waits
until session 13's normal fixtures are stable.

## Pure contract

For a nonzero contact normal, normalize it and choose the Cartesian axis with the
smallest absolute alignment. Equal alignments choose X, then Y, then Z. The first
tangent is `normalize(axis cross normal)` and the second is
`normalize(normal cross first)`. A zero or degenerate result rejects by name.

Given normal impulse `lambda_n` and coefficient `mu`, compute the raw Coulomb limit
with checked `i128` multiplication and one fixed-point division. Each signed tangent
coordinate lies in `[-mu*lambda_n,+mu*lambda_n]`. Those boxes bound the deterministic
active-set search but are not the physical cone: final validation also requires
`lambda_t0^2 + lambda_t1^2 <= (mu*lambda_n)^2`. A square corner that passes both box
comparisons must fail the cone.

That coordinate check is necessary but not final. Fixed-point normalization can make
a nominally unit tangent slightly long. Reconstruct the actual world-space impulse
from the rounded basis and coefficients, then check its widened component-square sum
against the same physical limit. The diagonal-normal boundary fixture proves the
coordinate check alone can accept an over-limit represented impulse.

After both tangent coordinates are applied in one projection, recompute every normal
relative velocity from the resulting rows. Tangential cross-response may reopen a
normal constraint that passed before friction, so pre-friction normal validation is
not evidence about the combined result.

The pure sliding successor is specified, not solved: if the unconstrained static
impulse lies outside the cone, a sliding result has nonzero tangent residual, lies on
the physical cone boundary, and its physical `impulse_on_a` is parallel to that
residual under production's `q = velocity_b - velocity_a` convention (`q_after =
q_before - W*J`). A 3-4-5 fixture freezes that sign without faking a zero residual.

Energy validity is decided before the public `u64` energy conversion. Sum each row's
`mass_raw * (vx_raw^2 + vy_raw^2 + vz_raw^2)` in checked `i128`, then require
`normal_only <= initial`, `combined <= normal_only`, and directly `combined <=
initial`. The 100 -> 81 -> 80 fixture passes, while 100 -> 81 -> 82 fails even though
all four fixture numerators divide to the same public energy zero.

The first pure tests live under `#[cfg(test)]` at the end of
`crates/sim/src/combat/resolution.rs`:

```rust
#[test] fn canonical_tangents_use_the_least_aligned_axis_and_xyz_ties() {}
#[test] fn friction_box_constraints_bound_each_signed_tangent_coordinate() {}
#[test] fn a_box_corner_outside_the_coulomb_cone_is_rejected() {}
#[test] fn fixed_point_basis_rounding_is_rechecked_in_world_space() {}
#[test] fn sliding_friction_lies_on_the_boundary_and_is_parallel_to_nonzero_slip() {}
#[test] fn friction_energy_is_ordered_before_public_u64_flooring() {}
#[test] fn friction_uses_two_projected_tangent_directions() {}
#[test] fn friction_rechecks_the_normal_after_both_tangent_coordinates() {}
```

The pure checkpoint's four red demonstrations were run on 2026-08-12. Reversing the
axis iteration failed `canonical_tangents_use_the_least_aligned_axis_and_xyz_ties`;
accepting every box corner failed `a_box_corner_outside_the_coulomb_cone_is_rejected`;
omitting the second matrix column failed
`friction_uses_two_projected_tangent_directions`; and validating only the two tangent
residuals failed `friction_rechecks_the_normal_after_both_tangent_coordinates`. The
mutations were reverted before the green verification below. Do not edit
`resolve_group_into`, `solve_contact_tick`, World commit,
scratch capacities, or any digest until the session 13 normal gate and the later
actual-projector friction fixture both pass.

The follow-up audit also ran two red demonstrations. Returning coordinate-cone
validity without reconstructing the rounded world impulse failed
`fixed_point_basis_rounding_is_rechecked_in_world_space`; omitting the exact boundary
equality failed
`sliding_friction_lies_on_the_boundary_and_is_parallel_to_nonzero_slip`. Both
mutations were reverted. This KKT fixture specifies the blocked sliding successor;
it is not evidence that an articulated sliding solve exists.

Replacing the widened comparison with comparisons after the public energy division
failed `friction_energy_is_ordered_before_public_u64_flooring` on the 82 > 81 case;
that mutation was also reverted. Non-positive mass and overflowing products reject
instead of being coerced into an ordering.

## Verification

```powershell
cargo test -p sim canonical_tangents -- --nocapture
cargo test -p sim friction_box -- --nocapture
cargo test -p sim coulomb_cone -- --nocapture
cargo test -p sim friction_rechecks -- --nocapture
cargo test -p sim directional_response -- --nocapture
node tools/check_docs.js
git diff --check
```
