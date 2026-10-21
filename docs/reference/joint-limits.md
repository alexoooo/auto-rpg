# Angular-limit coordinates

The measured-angle limit rows of the `rapier-coordinate` engine configuration, which gameplay runs
(`DEFAULT_ENGINE`, `src/core/engine/engines.ts`), against the parent-axis rows of `rapier`, kept as
the reference. Both share one WASM module, body and equipment representation, actuators and
controller interfaces; neither changes anatomy or strength.

## Selection

`loadEngine("rapier-coordinate")` selects it; Node stands and the common runner take
`CORE_ENGINE=rapier-coordinate`, and the task viewer offers **Joint limits**
(`engine=rapier-coordinate`). `coordinateAngularLimits` is an integration parameter Rapier
serializes; the adapter puts the choice in the engine's revision and refuses a snapshot from the
other configuration without changing the world. Selection belongs to the environment, never to a
policy.

## The row and its measurement

For relative joint rotation `q = (w, x, y, z)`, the limited coordinate is
`theta_i = 2 atan2(q_i, w)`, recentred on the allowed range and wrapped. For cyclic axes
`j = (i + 1) mod 3`, `k = (i + 2) mod 3`, its gradient in the parent's joint frame is:

```
g_i = 1
g_j = (q_i q_j + w q_k) / (w^2 + q_i^2)
g_k = (q_i q_k - w q_j) / (w^2 + q_i^2)
```

Rotated through the parent's joint frame it is the world angular Jacobian; a range's centre does
not change it away from the wrap. The parent-axis row omits the two cross terms, so motion on other
axes can carry the reported angle through a limit that sees no speed. At `q_i = w = 0` the
coordinate is undefined and a finite parent-axis row is kept.

`angular_limit_jacobian` supplies the scalar and SIMD impulse-joint rows and generic external joint
constraints. Two-dimensional limits keep their unit row; motor rows stay parent-axis torque
directions, and locked-axis rows are unchanged. Internal multibody limits are a separate path
([solver contract](solver-contract.md#anatomical-joint-shape-compatibility)).

## Mechanical checks

Node 24.19, core stand, Rapier `.5`, adapter 6, no gravity, ground or assistance: a fixed parent and
a driven child on the Rogue shoulder's axes, symmetric actuation; the goal ramps over 1.5 s and
holds 1 s, each axis pressed both ways with the others straight or well turned. Limits and motor
strength are the same in both configurations.

| Check | Parent-axis reference | Coordinate gradient |
|---|---:|---:|
| Maximum symmetric stop error, 480 Hz | 0.04594285688344435 rad | 0.0000016614668520986697 rad |
| Maximum interior-pose error, 480 Hz | 0.00006536244248556144 rad | 0.00006536244248556144 rad |
| Maximum asymmetric stop error, 120/480 Hz, 24 cases | 1.181491571508796 rad | 0.00002557814109643841 rad |
| Asymmetric cases exceeding the existing 0.015 rad tolerance | 4/24 | 0/24 |

The asymmetric ranges are centred at -0.4 and +0.4 rad with half-width 0.6 rad. The native
finite-difference test perturbs world rotations on all three axes with rotated parents and
recentred ranges. Parent-axis rows in place of the selection fail both coordinate-limit
regressions. Full endpoint rows: [joint-limits.json](joint-limits.json).

- `tests/core-limit-profile.test.mjs@2a1b29ac`: a driven body saved and restored into the same and
  another corrected world gives the same angles and velocities; cross-configuration loads are
  refused both ways.
- `tests/core-joint-state.test.mjs@2a1b29ac`: the gameplay default selects coordinate rows and
  passes the stop checks.
- `tests/arena-gameplay-physics.test.mjs@2a1b29ac` runs the default explicitly: four shove
  directions recover and walk, and both hands contact and return in the hit and miss fixtures.

## Package and browser validation

The `.5` archive rebuilds to identical bytes in two directories; its 138 default baseline rows
equal `.4`'s, timing excluded ([engine record](rapier-vendor.md)). Three built-page checks match
Node in every sampled observation and outcome, and replay: the Warrior's shared strike releasing
the right hand under each configuration, and the skeleton's shared strike holding both grips under
corrected limits ([joint-limits-browser.json](joint-limits-browser.json)). That skeleton returns
0.028904571971773277 m off target at development seed 0, failing its 0.02 m gate.

```powershell
node --test tests/core-joint-state.test.mjs tests/core-limit-profile.test.mjs   # both @2a1b29ac
node research/rapier-package-parity.mjs --reference ../rapier-npm-pkg
node research/control-foundation.mjs --suite baseline --split development --workers 3
$env:CORE_ENGINE = "rapier-coordinate"
node research/control-foundation.mjs --suite bar --support standing --actuation directional --split development --workers 3
Remove-Item Env:CORE_ENGINE
```

Task viewer:
`/control-tasks.html?engine=rapier-coordinate&task=point-strike&model=crypt-skeleton&side=both&held=shared&balance=centre&continuation=10&seed=0`.

## Tried and not kept

- The gradient applied unconditionally, with no reference profile: 18 of 789 tests failed, among
  them real losses (the Rogue's right-club defense admitted 12.772056329529732 N s of protected
  contact; a skeleton standing-bar move missed its 0.03 m gate at 0.03006015268204415 m; the
  assisted Warrior fell in the lab shove), and the skeleton's shared return missed 0.02 m at
  0.03200585295396584 m after contact and 0.03188770193254128 m after a miss.
