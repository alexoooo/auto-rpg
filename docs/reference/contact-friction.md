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
The adapter leaves this default unchanged. The TypeScript binding does not expose its selector.
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

## Consequence for control

Before relying on sliding predictions, make the engine's friction law explicit and compare an
opt-in per-point Coulomb profile against the patch model. Preserve the existing profile's replay
identity and measured behavior. A new model must include sticking, sliding, release and contact
acquisition, then pass the installed all-fours hold before recovery entry is attempted again.
This record establishes a friction-model mismatch; it does not establish that changing the
engine's friction law will repair recovery. It also matters to any impulse-joint versus
multibody comparison, where the native default friction laws differ.
