# Friction projection before and after joint elimination

`predictPointContacts` accepts an explicit `frictionMetric`: `coupled` (the existing default)
or `rigid-body`. Both use the full coupled dynamics to propagate impulses, including grips and
joint constraints. Only the two-dimensional metric used to project a trial tangential impulse
onto its Coulomb disk differs. Neither option applies forces to the live world.

Rapier's pinned per-point contact implementation computes the local tangent effective-mass
matrix from the two contacting rigid bodies. It interleaves these contact updates with joint
constraints. Eliminating joints first and using the resulting articulated contact mobility
inside the tangent projection changes the saturated friction law. For a free slab the two
metrics agree; a welded load can make them different. A converged residual alone does not
establish agreement with the chosen engine.

The source is Rapier `b716d375efc0201003f0cd9ef7168eee0b62c177`, particularly
`src/dynamics/solver/contact_constraint/contact_constraint_element.rs`'s tangent `solve`, and
the effective-mass assembly in `contact_with_coulomb_friction.rs`. At a saturated fixed point,
`j = project_disk(j - K^-1 v)`: the metric `K` affects the direction. This is distinct from
maximum-dissipation friction pointing directly opposite slip in every metric.

## Fixture

Harness: Node core stand, Rapier `.7` / adapter 8, corrected angular limits and native per-point
friction, 120 and 1920 Hz. Each trial covers the same 1/120-second physical interval; the fine
trial reads every fine step and sums impulses over that interval. No timing claim is made.

The [fixture asset](../../assets/research/contact-projection.json) supplies all synthetic spec
values: a 1 kg sphere of radius 0.05 m, centre initially at (0, 0.05, 0), with isotropic inertia
0.001 kg m², welded to a 3 kg load at (0.08, 0.3, 0.11) with isotropic inertia 0.02 kg m².
The load's 0.02 m sphere stays clear of the floor. Both receive the same initial velocity,
either (30, 0, 10) or its negative, through centre-of-mass impulses. Gravity is the only
subsequent external load besides ground contact; there are no muscles or assists.

The task compares predictions with the same actual trajectory. Each prediction starts at the
measured physical state; it is not an independently rolled-out trajectory. Ground impulse is
inferred from total linear-momentum change after subtracting gravity, so joint reactions cancel
without depending on a contact-impulse cache or its tangent basis. The fixture tests the
direction of the aggregate tangential impulse. It also records normal impulse and next-step
velocity errors, which are not claimed to pass a general contact-acquisition gate.

Every query leaves the world snapshot unchanged. Restoring the initial snapshot reproduces
all predictions, physical samples, equipment state and reported metrics exactly.

```powershell
node research/contact-projection.mjs
node --test tests/research-contact-projection.test.mjs
```

## Scope

The [complete record](contact-projection.json) contains physical hashes, inferred impulses,
prediction errors and settings. Direction error is the Euclidean distance between normalized
horizontal impulse vectors, and is dimensionless:

| Rate | Velocity sign | Rigid-body metric error | Coupled metric error |
|---|---:|---:|---:|
| 120 Hz | -1 | 0.000935 | 0.067643 |
| 120 Hz | +1 | 0.000236 | 0.066759 |
| 1920 Hz | -1 | 0.000464 | 0.067547 |
| 1920 Hz | +1 | 0.000399 | 0.067636 |

All four trials replay and reject no predictions. The regression requires local-metric error
below 0.005 and coupled-metric error above 0.04, so the fixture must distinguish the two laws.
Temporarily removing the local metric fails that physical assertion. Covariance, detached
results and query nonmutation are also checked with both explicit options and the default.

The rigid-body metric applies to this predictor's contact against a fixed plane. Moving
counterbodies would require both bodies' local mobility and their relative contact response.
Patch/twist friction, tangential anchor stabilization, contact softness and within-step
geometry changes remain separate issues. The original coupled option and all gameplay
defaults remain available unchanged. This comparison does not establish an anatomical hold
or recovery route.
