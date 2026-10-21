# Joint-angle acceleration in the motion tracker

The coordinate term a joint-angle acceleration objective needs, which `rateBiasToRef`
(`build/joint-state.ts`) supplies and `wholeBodyTracking` subtracts, and what it changed on the
task batteries. It changes no actuator bound, muscle, inertia, contact constraint or assist.

## The term

The coupled model uses motor-axis speeds `u` (relative angular velocity on the parent joint frame);
joint objectives use the rates of Rapier's measured angles, `a' = G(a) u` (`ratesToRef`). So

```
a'' = G(a) u' + (dG/dt) u
```

With the engine-sense half-angle tangents `t`, `t' = (u - t × u + t (t · u)) / 2`, and
differentiating the rate map gives the bias. A two-axis joint's locked third component also needs
`u_z = t_x u_y - t_y u_x` and its derivative; a one-axis joint's bias is zero. `wholeBodyTracking`
subtracts this term and `G` times the coupled-model bias from the requested angle acceleration.
Frame objectives already carry the spatial bias.

## Measurement

**Kinematic** (Node, no engine, centred differences at 0.0001 s): quaternion paths built from
chosen angle polynomials, one to three axes, both senses, tilted axes, poses far from zero.

| Quantity | Maximum discrepancy, rad/s² |
|---|---:|
| Angle acceleration with the coordinate term | 0.0000027581 |
| Angle acceleration when the term is omitted | 13.1738 |

**Physical** (Node core stand, Rapier `.4`, adapter 5, 1920 Hz, directional actuation, no gravity,
ground or assists): a rotor of spherical inertia on a pinned parent, centre at the three-axis joint;
test inputs of 1 kg per segment, moments 0.02 kg m², limits ±2.5 rad, muscle peaks 2 N m, unloaded
speed 30 rad/s, curvature 0.25, eccentric ceiling 1.4, slope ratio 2. A torque impulse
(0.04, -0.06, 0.08) N m s starts it, 288 steps coast, then the controller asks the current angles
and rates with zero angle acceleration (feedback 0.2 s, effort regularization 1e-8).

| Channel | Coasting angle acceleration | Controlled angle acceleration | Commanded torque |
|---|---:|---:|---:|
| 0 | 4.52198 rad/s² | 0.0278974 rad/s² | -0.0885598 N m |
| 1 | 5.11389 rad/s² | 0.0354535 rad/s² | -0.0777649 N m |
| 2 | 4.10779 rad/s² | 0.0441764 rad/s² | -0.0794389 N m |

No motor saturates. Without the term the controlled accelerations return to the coasting values
and fail the test's 0.05 rad/s² ceiling.

```powershell
node --test --test-name-pattern="angle acceleration" tests/core-joint-state.test.mjs
node --test tests/core-joint-acceleration.test.mjs
```

The skeleton bar fixture's return readiness is tested with a declared 2 N s push along +x at the
held item's centre 25 steps before its finish (Node core stand, Rapier `.4`, 120 Hz, directional,
no assists): it must leave by more than 0.03 m, wait 30 ready steps, and be ready again by 12 s
without falling.

## Capability remeasurement

Node 24.19 core world, Rapier `.4`, adapter 5, 120 Hz, directional actuation, no root or weapon
assist, development seeds 0 and 1; source content
`5deb835bbaa05ca39fa3d7e298c9971d5bb43d6919172d0f41a36365b3d86467`;
[252 trial records](joint-acceleration-tasks.json). Same thresholds and watches before and after.

| Task | Before correction | Corrected map |
|---|---:|---:|
| Predictive defense | 32/36 | 33/36 |
| Pose defense | 0/36 | 0/36 |
| Moving strikes, tracked/fixed aim and misses | 108/108 | 108/108 |
| Static strikes and misses | 72/72 | 72/72 |

- Strikes use combined-centre control and a ten-second watch after return; all 252 corrected trials
  replay, stay upright, reject no solve and use no assist. Largest final return error: 0.0134478 m
  moving, 0.00450867 m static.
- Defense with two independent clubs still fails for the Warrior at seed 1 and the Rogue at seeds 0
  and 1, despite qualifying blocks: protected impulses of 13.0353, 11.9222 and 14.4717 N s. The
  skeleton's left-hand case passes.
- [Nine built-page branches](joint-acceleration-browser.json) match their Node observation hashes
  and step counts and replay.

| Archive under `research/runs/control-foundation/` | Manifest SHA256 |
|---|---|
| `rate-bias-defense-v1` | `6e12b54e238b30fe85ba731b14c652cfedcf78b44f22752c91ba2a0462505fd6` |
| `rate-bias-moving-v1` | `55d31e94c9114c9300152660f94c6f4c78f02e785d1f1d0cdfef6e0b788cd2d4` |
| `rate-bias-static-v1` | `eb5072fff29244678f2c46b3d9362854b737c2d8dd612252f9c6bcc6bbfeff25` |
