# Rigid-body contact-patch friction

The installed Rapier uses its `Simplified` friction model for rigid bodies. This applies one
tangential constraint at the mean contact position and a separate twist constraint about the
normal for each group of at most four contacts. Its normal loads remain per contact. Multibody
contacts use per-point Coulomb friction instead. A coefficient alone does not specify this
difference; the current controller's per-point friction bounds do not reproduce the rigid-body
patch's sliding response.

Source: pinned upstream `b716d375efc0201003f0cd9ef7168eee0b62c177`,
`src/dynamics/integration_parameters.rs::FrictionModel`,
`src/dynamics/solver/staged_island_solver/init.rs` and
`src/dynamics/solver/contact_constraint/contact_with_twist_friction.rs`.
The adapter leaves this default unchanged. The vendored TypeScript binding exposes its selector
as `pointContactFriction` in package `.6`; the upstream binding does not expose it.
This is an upstream modeling choice, not an anatomy or motor-strength defect.

For positive normal loads `N_i`, coefficient `mu`, patch centre `c` and contact positions `p_i`,
the translation cap is `mu * sum(N_i)` and the independent twist cap is
`mu * sum(N_i * length(p_i - c))`. Fully sliding translation opposes velocity at `c`; fully
sliding twist opposes spin about the normal. Both can saturate simultaneously. This differs
from imposing a separate circular friction cone at every corner: corner friction must share
its capacity between translation and twist.

## Measurement

Harness: Node core stand, Rapier SIMD `0.21.0-auto-rpg.5`, adapter 6, both the reference and
coordinate-limit profiles, directional actuation, no muscles or assists. A free 1 kg box is
0.6 by 0.1 by 0.4 m, with principal inertia `[.02, .04, .04] kg m²`. It settles for one second,
receives a horizontal impulse of either sign with magnitude 1 N s and a vertical angular impulse
corresponding to -3, 0 or 3 rad/s, then advances one step. The subsequent 1/30 s is measured at
120 or 1920 Hz. All four contacts remain loaded and tangentially sliding; the spinning trials
exclude stopping. This is a driven initial impulse followed by passive dissipation.

`research/contact-friction.mjs` compares two model-only load predictions through the same
coupled dynamics. Both use geometric box support points, current velocities, positive normal
loads, and zero normal/tilt acceleration within an explicit `1e-8` acceleration band. The band
avoids duplicate exactly opposing constraints in the active-set solver. The minimum squared
normal load selects the otherwise underdetermined load distribution. The point model applies
kinetic friction separately at each corner; the patch model uses central friction and the
independent twist moment described above. Neither prediction changes the physics state.

Maximum component errors over the full measured windows, aggregated over signs:

| Rate | Initial spin | Patch linear, m/s² | Patch angular, rad/s² | Point linear, m/s² | Point angular, rad/s² |
|---|---|---:|---:|---:|---:|
| 120 Hz | zero | 0.000264 | 0.001170 | 0.000264 | 0.001170 |
| 120 Hz | ±3 rad/s | 0.019928 | 0.006026 | 1.566186 | 23.443653 |
| 1920 Hz | zero | 0.000240 | 0.000530 | 0.000240 | 0.000530 |
| 1920 Hz | ±3 rad/s | 0.020534 | 0.194931 | 1.764110 | 23.421585 |

Both engine profiles give identical records apart from identity. Full branch replay is exact.
The committed [records](contact-friction.json) contain the coordinate-profile rows; tests repeat
both profiles. Samples are retained at 120 Hz spacing for either rate. Error maxima use each
rate's individual steps; this table makes no claim that a difference between rates is physical.
The geometric support model does not duplicate Rapier's frozen contact lever arms, substeps or
warmstarts. The residual error is not a certificate for other shapes, near-sticking motion or
transitions. The complete prediction stays outside the production controller.

```powershell
node research/contact-friction.mjs
node --test tests/research-contact-friction.test.mjs
```

The regression requires patch errors below 0.03 m/s² and 0.25 rad/s², and substantial point-model
error on the spinning trials. Suppressing the patch's twist moment must fail it. These are
measured validation tolerances, not tuned body properties.

## Per-point profile and projected impulses

Package `0.21.0-auto-rpg.6`, adapter 7, exposes the native selector without changing either
native solver. `rapier-coulomb` uses reference limits and per-point friction;
`rapier-coordinate-coulomb` combines corrected limits and per-point friction. `rapier` and
`rapier-coordinate` retain patch friction. All four share one WASM instance, identify themselves
in task/replay records, and reject snapshots from another configuration without changing the
destination. The task viewer offers all four; gameplay remains on `rapier`.

Per-point friction also differs from the simple kinetic-force model. Rapier's
`ContactConstraintTangentPartSlim::solve` solves the two-axis effective-mass system for a
stopping impulse and projects that impulse onto the friction disk. For anisotropic point
mobility, its direction need not oppose slip exactly. The research fixture's `projectedPoint`
prediction computes this two-axis mobility through the coupled model and caps the resulting
direction. It approximates sustained fast sliding; it does not reproduce iterative warmstarts,
frozen lever arms or the finite-step sticking transition.

The same 12-case slab battery on each per-point profile gives identical physical records across
the two limit choices. The [coordinate-profile records](contact-friction-coulomb.json) include
all three predictions. Maximum projected-point errors across signs and spins are 0.005827 m/s²
and 0.008795 rad/s² at 120 Hz, and 0.041652 m/s² and 0.189211 rad/s² at 1920 Hz. Simple opposing-slip
friction has linear error above 0.4 m/s² even without spin; its spinning angular error exceeds
18 rad/s². The patch prediction's spinning angular error exceeds 30 rad/s² on this profile.
No between-rate physical conclusion is inferred from these maxima.

Tests require projected-point errors below 0.05 m/s² and 0.25 rad/s², positive support loads,
compatible normal/tilt accelerations and exact physical replay on both profiles. Removing the
effective-mass direction calculation fails the regression. Removing the snapshot friction check
fails the configuration-isolation test. Physical replay compares every segment pose, velocity,
ground-contact record and world state at every step; raw serialized cache bytes need not be
canonical after restoring a world.

```powershell
node research/contact-friction.mjs --engine rapier-coordinate-coulomb
node --test tests/core-friction-profile.test.mjs tests/research-contact-friction.test.mjs
```

The built task viewer also passes three standing shared-bar checks at 120 Hz with directional
actuation and no assists: Warrior/corrected-limit per-point, Rogue/reference-limit per-point,
and skeleton/gameplay reference, each releasing its left hand at development seed 0. All return
upright without rejected solves, contact the obstacle, and replay exactly. Node reproduces the
complete observation hash and outcome for each [browser record](contact-friction-browser.json).
They establish profile integration, not a comparative capability result across bodies.

## Consequence for control

The engine's friction law is now explicit and both sustained-sliding predictors have a measured
mechanical fixture. Neither experimental profile is selected as the gameplay default. A general
controller model must include sticking, sliding, release and contact
acquisition, then pass the installed all-fours hold before recovery entry is attempted again.
This record establishes a friction-model mismatch; it does not establish that changing the
engine's friction law will repair recovery. It also matters to any impulse-joint versus
multibody comparison, where the native default friction laws differ.
