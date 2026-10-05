# Joint-angle acceleration in the motion tracker

The coupled dynamics model uses motor-axis speeds `u`: relative angular velocity projected on
the parent joint frame. Joint objectives use the rates of Rapier's measured angles, `a'`.
Those quantities differ away from the reference pose. `ratesToRef` supplies `a' = G(a) u`;
therefore an angle-acceleration objective requires

```
a'' = G(a) u' + (dG/dt) u
```

`rateBiasToRef` in `build/joint-state.ts` supplies the second term analytically. With the
engine-sense half-angle tangents `t`, the relative quaternion gives
`t' = (u - t × u + t (t · u)) / 2`. Differentiating the existing rate map yields the bias.
For a two-axis joint, the locked third quaternion component also requires
`u_z = t_x u_y - t_y u_x`; its derivative is included even while the two motor speeds remain
constant. A one-axis joint has zero coordinate bias. Freedom signs are applied in both directions.

`wholeBodyTracking` subtracts this coordinate term and `G` times the coupled-model bias from
the requested angle acceleration. The term changes no actuator bound, muscle source, inertia,
contact constraint or assist. Frame objectives already use the model's spatial acceleration
bias; this correction concerns joint-angle objectives. It does not fix Rapier's separate
joint-limit gradient mismatch or supply joint-stop reaction prediction.

## Independent checks

The kinematic test constructs quaternion trajectories from explicitly chosen angle, rate and
acceleration polynomials. Differences of those rotations provide motor speeds and their
derivatives independently of the conversion under test. It covers one, two and three axes,
positive and negative freedom senses, tilted axes, and poses well away from zero.
Harness: Node analytic/finite-difference test, no physics engine, centred sampling at 0.0001 s.

| Quantity | Maximum discrepancy, rad/s² |
|---|---:|
| Angle acceleration with the coordinate term | 0.0000027581 |
| Angle acceleration when the term is omitted | 13.1738 |

The physical test uses a spherical-inertia rotor on a pinned parent, with its centre of mass at
the three-axis joint. Harness: Node core stand, Rapier `.4`, adapter 5, 1920 Hz, directional
actuation, no gravity, ground or assists. Synthetic input: mass 1 kg per segment, principal
rotor moments 0.02 kg m², limits ±2.5 rad, muscle peaks 2 N m, unloaded speed 30 rad/s,
force/velocity curvature 0.25, eccentric ceiling 1.4 and slope ratio 2. A world torque impulse
(0.04, -0.06, 0.08) N m s starts rotation, followed by 288 unactuated steps. The controller then
asks for the current angles and rates with zero angle acceleration, feedback time 0.2 s,
weight 1 and normalized effort regularization 1e-8. These are test inputs, not anatomy.

| Channel | Coasting angle acceleration | Controlled angle acceleration | Commanded torque |
|---|---:|---:|---:|
| 0 | 4.52198 rad/s² | 0.0278974 rad/s² | -0.0885598 N m |
| 1 | 5.11389 rad/s² | 0.0354535 rad/s² | -0.0777649 N m |
| 2 | 4.10779 rad/s² | 0.0441764 rad/s² | -0.0794389 N m |

The same saved physical state supplies both branches. No motor saturates. Removing the
coordinate term from the tracker returns the controlled accelerations to the coasting values
and fails the physical test's 0.05 rad/s² ceiling. This is an instantaneous high-rate mechanics
check, not a gameplay-rate or joint-limit result.

```powershell
node --test --test-name-pattern="angle acceleration" tests/core-joint-state.test.mjs
node --test tests/core-joint-acceleration.test.mjs
```

## Return-readiness regression

The skeleton bar fixture's return became ready before its former fixed finish time. A test
that depended on its old slow trajectory therefore ceased to exercise waiting. The replacement
uses the Node core stand, Rapier `.4`, 120 Hz, directional actuation and no assistance. It
applies a declared 2 N s impulse along world +x at the held item's centre of mass, 25 steps
before that finish time. It verifies an actual excursion beyond 0.03 m, refuses completion
before 30 consecutive ready steps, and regains readiness before the same 12 s deadline without
falling. This is an external disturbance in a test, not an assist supplied to the controller.
Removing the readiness condition from the fixture makes this regression fail at completion.

## Capability remeasurement

[All 252 trial records](joint-acceleration-tasks.json) preserve the manifests, starts, per-cell
denominators and outcomes. Harness: Node 24.19 core world, Rapier `.4`, adapter 5, 120 Hz,
directional actuation, zero root/weapon assistance, development seeds 0 and 1. The corrected
source content is `5deb835bbaa05ca39fa3d7e298c9971d5bb43d6919172d0f41a36365b3d86467`.
Three research workers overlapped tests and browser checks, so timing is not compared.

| Task | Before correction | Corrected map |
|---|---:|---:|
| Predictive defense | 32/36 | 33/36 |
| Pose defense | 0/36 | 0/36 |
| Moving strikes, tracked/fixed aim and misses | 108/108 | 108/108 |
| Static strikes and misses | 72/72 | 72/72 |

The strike fixtures use combined-centre control and watch ten seconds after measured return.
All 252 corrected trials replay exactly, remain upright, reject no support solve and use no
assist. Maximum final return error is 0.0134478 m for moving targets and 0.00450867 m for static
targets. The same thresholds and watches apply before and after; the physical correction is
not judged by whether it produces an identical bout.

Defense still fails with two independent clubs for Warrior seed 1 and Rogue seeds 0 and 1,
despite qualifying blocks. Their protected impulses over the watch are 13.0353, 11.9222 and
14.4717 N s respectively, including sustained loading. The formerly failing skeleton left-hand
case now passes; that single improvement does not close the defense gate. A separate nominal
screen passes 17/18, with Rogue's simultaneous clubs still failing.

| Archive under `research/runs/control-foundation/` | Manifest SHA256 |
|---|---|
| `rate-bias-defense-v1` | `6e12b54e238b30fe85ba731b14c652cfedcf78b44f22752c91ba2a0462505fd6` |
| `rate-bias-moving-v1` | `55d31e94c9114c9300152660f94c6f4c78f02e785d1f1d0cdfef6e0b788cd2d4` |
| `rate-bias-static-v1` | `eb5072fff29244678f2c46b3d9362854b737c2d8dd612252f9c6bcc6bbfeff25` |

The full test suite passes 782 tests with two pre-existing TODOs: the engine's joint-limit
gradient mismatch and the staged riser's three-support hand unload. The prototype hybrid
recovery screen still does not rise on any of the three bodies; no recovery capability is
inferred from the acceleration correction. The held-out integrated battery remains unused.

[Nine built-browser branches](joint-acceleration-browser.json) match their corrected Node
observation hashes and final step counts exactly and replay controller/task state. They include
all three bodies, successful and failed defense, the pose baseline, moving and static strikes,
independent items and a deliberate miss with the ten-second continuation. Visible initial and
completed poses were inspected. No browser warnings or errors were reported; the owned preview
was stopped after the checks.
