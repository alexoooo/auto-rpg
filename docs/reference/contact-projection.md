# Friction projection before and after joint elimination

Which metric `predictPointContacts` (`build/contact-step.ts`) projects a trial tangential impulse
in: its `frictionMetric` is `coupled` (the default) or `rigid-body`. Both propagate impulses through
the full coupled dynamics, grips and joints included; only the two-dimensional metric of the
projection onto the Coulomb disk differs. Neither applies force to the world.

## Why the metric matters

Rapier's per-point contact solve builds the tangent effective mass from the two contacting rigid
bodies alone and interleaves contact updates with joint constraints (upstream
`b716d375efc0201003f0cd9ef7168eee0b62c177`,
`src/dynamics/solver/contact_constraint/contact_constraint_element.rs`'s tangent `solve` and
`contact_with_coulomb_friction.rs`). At a saturated fixed point `j = project_disk(j - K^-1 v)`, so
the metric `K` sets the direction; this differs from maximum dissipation, which opposes slip in
every metric. Eliminating joints first and projecting in the articulated mobility changes the law.
For a free slab the two agree; a welded load separates them. `rigid-body` is for a fixed plane:
a moving counterbody would need both bodies' local mobility.

## Measurement

Node core stand, Rapier `.7`, adapter 8, corrected limits and per-point friction, 120 and 1920 Hz,
each trial over the same 1/120 s. The [fixture asset](../../assets/research/contact-projection.json)
gives the inputs: a 1 kg sphere of radius 0.05 m at (0, 0.05, 0), inertia 0.001 kg m², welded to a
3 kg load at (0.08, 0.3, 0.11), inertia 0.02 kg m², whose 0.02 m sphere stays clear of the floor;
both start at (30, 0, 10) m/s or its negative; gravity and ground only.

Each prediction starts from the measured state. Ground impulse is inferred from the change of total
linear momentum less gravity, so joint reactions cancel. Direction error is the distance between
normalized horizontal impulse vectors ([record](contact-projection.json)):

| Rate | Velocity sign | Rigid-body metric error | Coupled metric error |
|---|---:|---:|---:|
| 120 Hz | -1 | 0.000935 | 0.067643 |
| 120 Hz | +1 | 0.000236 | 0.066759 |
| 1920 Hz | -1 | 0.000464 | 0.067547 |
| 1920 Hz | +1 | 0.000399 | 0.067636 |

All four trials replay and reject no prediction; queries leave the snapshot unchanged. The
regression requires the rigid-body error below 0.005 and the coupled above 0.04, so the fixture
tells the laws apart; removing the local metric fails it.

```powershell
node research/contact-projection.mjs
node --test tests/research-contact-projection.test.mjs
```
