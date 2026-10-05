# Angular-limit coordinates

The vendored engine offers an explicit `rapier-coordinate` configuration. Its angular limit
rows use the spatial gradient of the angle the joint reports. The `rapier` configuration keeps
the parent-axis rows used by gameplay. Both use one initialized WASM module, the same body and
equipment representation, and the same actuator and controller interfaces. Selection belongs
to the environment, not to a policy. Neither configuration changes anatomy or muscle strength.

`loadEngine("rapier-coordinate")` selects the correction. Node stands and the common task runner
accept `CORE_ENGINE=rapier-coordinate`; the physical-task viewer exposes the choice under
**Joint limits**, with `engine=rapier-coordinate` in its URL. `coordinateAngularLimits` is an
integration parameter serialized by Rapier. The adapter includes the choice in the engine
identity/revision and rejects a snapshot from the other configuration without changing the world.

## The row and its measurement

For relative joint rotation `q = (w, x, y, z)`, the limited coordinate is
`theta_i = 2 atan2(q_i, w)`, recentered around the allowed range and wrapped. For cyclic axes
`j = (i + 1) mod 3`, `k = (i + 2) mod 3`, its gradient in the parent's joint frame is:

```
g_i = 1
g_j = (q_i q_j + w q_k) / (w^2 + q_i^2)
g_k = (q_i q_k - w q_j) / (w^2 + q_i^2)
```

Rotating `g` through the parent's joint frame gives the world angular Jacobian. A range's
center does not change this derivative away from the wrap. The default parent-axis row omits
the two cross terms, allowing motion along other axes to carry the reported angle through a
limit that sees no corresponding speed. At exactly `q_i = w = 0` the coordinate is undefined;
the implementation retains a finite parent-axis row rather than dividing by zero. This does
not make the coordinate continuous at that singularity.

`angular_limit_jacobian` supplies scalar/SIMD impulse-joint rows and generic external joint
constraints. Two-dimensional limits retain their unit row. Motor rows remain parent-axis
spatial torque directions, and locked-axis quaternion rows retain their definitions. Internal
reduced-coordinate multibody limits are a separate path; this work does not validate the
unfinished multibody comparison.

## Mechanical checks

Harness: Node 24.19, core stand, Rapier `.5`, adapter 6, no gravity, ground or assistance,
a fixed parent and driven child on the Rogue shoulder's axes, symmetric actuation. The goal
ramps over 1.5 seconds and holds for one second. Each axis is pressed in both senses while
the other axes are straight or substantially rotated. Limits and motor strength are identical
between configurations. These are stop-error measurements, not strike-energy measurements.

| Check | Parent-axis reference | Coordinate gradient |
|---|---:|---:|
| Maximum symmetric stop error, 480 Hz | 0.04594285688344435 rad | 0.0000016614668520986697 rad |
| Maximum interior-pose error, 480 Hz | 0.00006536244248556144 rad | 0.00006536244248556144 rad |
| Maximum asymmetric stop error, 120/480 Hz, 24 cases | 1.181491571508796 rad | 0.00002557814109643841 rad |
| Asymmetric cases exceeding the existing 0.015 rad tolerance | 4/24 | 0/24 |

The asymmetric ranges have centers -0.4 and +0.4 rad and half-width 0.6 rad. Faster-rate
results here are independent endpoint checks, not a claim of physical convergence across rates.
The native finite-difference test independently perturbs world rotations along all three axes,
with rotated parents and recentered ranges. The native library's 85 tests pass. The Node
regression also distinguishes the reported coordinates from Euler angles and checks motor
speed semantics. Replacing the experimental selection with parent-axis rows makes both
coordinate-limit regressions fail.
The complete endpoint rows and prototype failure list are preserved in
[joint-limits.json](joint-limits.json).

`tests/core-limit-profile.test.mjs` drives a complete body, saves it, and compares subsequent
joint angles and velocities after restoration into the same and another corrected world.
It checks serialized configuration and transactional rejection in both directions across
configurations. `tests/core-joint-state.test.mjs` retains the reference configuration's TODO;
the correction's tests are mandatory passes.

## Migration remains open

An unconditional prototype of the same gradient passed the mechanical test but failed 18 of
789 existing tests (769 pass, two existing TODOs). The failures include changed replay-fixture
coverage, guard contacts, recovery stages, strike measurements and passive settling. They also
include actual capability losses: the Rogue's right-club defense admits 12.772056329529732 N s
of protected-region contact in its test, a skeleton standing-bar move misses its 0.03 m gate
at 0.03006015268204415 m, and the assisted Warrior falls in the lab shove fixture.
Changing the expected trajectories would not establish that these capabilities work.

A six-case prototype shared-strike screen, at 120 Hz with directional actuation and zero
assistance, retains both humans' success but leaves the skeleton's shared return outside the
0.02 m tolerance: 0.03200585295396584 m after contact and 0.03188770193254128 m after a miss.
Thus this coordinate fix alone does not solve shared-item return or general recovery.

The existing task tables name their engine configuration. Their success rates do not transfer
to `rapier-coordinate`. Corrected-limit control, directional-actuator migration, defense,
recovery and integrated gameplay must pass their physical gates before gameplay switches.

## Package and browser validation

The `.5` archive rebuilds to identical bytes in two managed directories. Offline installation,
type checking and production build pass. The default suite reads 792 tests: 790 pass, zero
failures and the two existing TODOs. All 138 default physical baseline rows equal `.4` after
excluding timing, and all three stock-package parity bouts retain their hashes. See the
[engine record](rapier-vendor.md) for artifact and source identities.

Three built-page checks agree with Node in every sampled body observation and the entire task
outcome: the Warrior shared strike with right-hand release under each configuration, and the
skeleton shared strike retaining both grips under corrected limits. All three browser replays
match. The selector preserves the chosen task, equipment and release on navigation. Initial
and final poses were inspected; browser warning/error logs were empty. The corrected skeleton
remains upright but visibly bends forward and returns 0.028904571971773277 m off target in
development seed 0. That is still a failed 0.02 m return gate. The zero-offset prototype above
and this seeded start are different cases. Full browser outputs are in
[joint-limits-browser.json](joint-limits-browser.json).

Reproduction:

```powershell
node --test tests/core-joint-state.test.mjs tests/core-limit-profile.test.mjs
node research/rapier-package-parity.mjs --reference ../rapier-npm-pkg
node research/control-foundation.mjs --suite baseline --split development --workers 3
$env:CORE_ENGINE = "rapier-coordinate"
node research/control-foundation.mjs --suite bar --support standing --actuation directional --split development --workers 3
Remove-Item Env:CORE_ENGINE
```

The last command sequence is an experimental capability measurement, not a statement that
every bar case passes. The task viewer uses
`/control-tasks.html?engine=rapier-coordinate&task=point-strike&model=crypt-skeleton&side=both&held=shared&balance=centre&continuation=10&seed=0`.
