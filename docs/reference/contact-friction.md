# Rigid-body contact-patch friction

Which friction law the vendored Rapier applies to rigid bodies, the per-point profiles the engine
list offers beside it (`src/core/engine/engines.ts`, `src/core/engine/rapier.ts`), and how well a
model of each predicts a sliding slab. Gameplay stays on patch friction (`rapier-coordinate`).

## The patch law

Rapier's default `Simplified` friction model for rigid bodies applies one tangential constraint at
the mean contact position and a separate twist constraint about the normal, for each group of at
most four contacts; normal loads stay per contact. Multibody contacts use per-point Coulomb
friction instead. Source: upstream `b716d375efc0201003f0cd9ef7168eee0b62c177`,
`src/dynamics/integration_parameters.rs::FrictionModel`,
`src/dynamics/solver/staged_island_solver/init.rs`,
`src/dynamics/solver/contact_constraint/contact_with_twist_friction.rs`.

For normal loads `N_i`, coefficient `mu`, patch centre `c` and contact positions `p_i`: the
translation cap is `mu * sum(N_i)` and the independent twist cap `mu * sum(N_i * length(p_i - c))`.
Sliding translation opposes velocity at `c`, sliding twist opposes spin, and both can saturate at
once. A circular cone at each corner instead makes a corner share its capacity between the two.

## The profiles

The vendored binding exposes the selector as `pointContactFriction` (package `.6`, adapter 7;
upstream does not). The engine list names four configurations, sharing one WASM instance, each
naming itself in records and refusing another's snapshot:

- `rapier`: reference limits, patch friction.
- `rapier-coordinate`: corrected limits, patch friction; the gameplay default.
- `rapier-coulomb`: reference limits, per-point friction.
- `rapier-coordinate-coulomb`: corrected limits, per-point friction.

Rapier's per-point solve (`ContactConstraintTangentPartSlim::solve`) computes a two-axis stopping
impulse through the tangent effective mass and projects it onto the friction disk. For anisotropic
point mobility its direction need not oppose slip; the `projectedPoint` prediction reproduces this
through the coupled model's mobility. It approximates sustained fast sliding, not warmstarts,
frozen lever arms or the sticking transition.

## Measurement

Node core stand, Rapier SIMD `0.21.0-auto-rpg.5`/`.6`, directional actuation, no muscles or assists;
`research/contact-friction.mjs`. A free 1 kg box 0.6 × 0.1 × 0.4 m, principal inertia
`[.02, .04, .04] kg m²`, settles one second, receives a ±1 N s horizontal impulse and a vertical
angular impulse for -3, 0 or 3 rad/s, and is read over the next 1/30 s at 120 or 1920 Hz with all
four contacts loaded and sliding. Predictions use geometric support points, current velocities,
positive normal loads and zero normal/tilt acceleration within a `1e-8` band (which keeps exactly
opposed constraints out of the active-set solve), the least squared normal load choosing among
distributions. Maximum component errors over the window, both signs:

On the patch profiles (records: [contact-friction.json](contact-friction.json), coordinate rows;
both limit profiles identical):

| Rate | Initial spin | Patch linear, m/s² | Patch angular, rad/s² | Point linear, m/s² | Point angular, rad/s² |
|---|---|---:|---:|---:|---:|
| 120 Hz | zero | 0.000264 | 0.001170 | 0.000264 | 0.001170 |
| 120 Hz | ±3 rad/s | 0.019928 | 0.006026 | 1.566186 | 23.443653 |
| 1920 Hz | zero | 0.000240 | 0.000530 | 0.000240 | 0.000530 |
| 1920 Hz | ±3 rad/s | 0.020534 | 0.194931 | 1.764110 | 23.421585 |

On the per-point profiles (records: [contact-friction-coulomb.json](contact-friction-coulomb.json);
both limit profiles identical), the projected-point prediction's largest errors are 0.005827 m/s²
and 0.008795 rad/s² at 120 Hz, 0.041652 m/s² and 0.189211 rad/s² at 1920 Hz. Simple opposing-slip
friction errs above 0.4 m/s² even without spin and above 18 rad/s² spinning; the patch prediction
above 30 rad/s² spinning.

- Every branch replays exactly. Error maxima are per rate; no difference between rates is read as
  physical.
- `tests/research-contact-friction.test.mjs` requires patch errors below 0.03 m/s² and 0.25 rad/s²
  on the patch profile and projected-point errors below 0.05 m/s² and 0.25 rad/s² on the per-point
  one; dropping the twist moment, or the effective-mass direction, fails it.
  `tests/core-friction-profile.test.mjs` fails without the snapshot's friction check.
- On the built task viewer (120 Hz, directional, no assists, development seed 0, left hand
  released), the Warrior on corrected-limit per-point, the Rogue on reference-limit per-point and
  the skeleton on the gameplay profile each return upright from the standing shared bar, touch the
  obstacle and replay; Node reproduces each [browser record](contact-friction-browser.json).

```powershell
node research/contact-friction.mjs
node research/contact-friction.mjs --engine rapier-coordinate-coulomb
node --test tests/core-friction-profile.test.mjs tests/research-contact-friction.test.mjs
```
