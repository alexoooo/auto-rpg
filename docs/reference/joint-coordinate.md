# Measured joint-coordinate motion

The diagnostic model in `src/core/build/joint-coordinate.ts` supplies a scalar
motion row for one measured joint angle. It reads actual rotations and angular velocities,
including residual motion on locked axes. It neither chooses active stops nor applies effort.
The whole-body reference tracker does not yet use stop reactions.

For a relative unit quaternion expressed in the joint frame, angle i is
2 atan2(q_i, w). With cyclic indices i, j, k and D = w*w + q_i*q_i,
the gradient against parent-frame relative angular velocity is:

- g_i = 1
- g_j = (q_i*q_j + w*q_k) / D
- g_k = (q_i*q_k - w*q_j) / D

The freedom's sign and the parent's current rotation carry this gradient into the world.
The row applies it to child angular velocity and its negative to parent angular velocity.
Its time derivative includes both changing quaternion components and the rotating parent frame.
If J is that world row, measured angle acceleration is J a + Jdot v.
The supplied acceleration target is -Jdot v, so holding the coordinate asks J a = target.
D = 0 is an undefined coordinate and returns null; an invalid axis is rejected.
No numerical activation margin, force threshold or anatomical parameter is introduced.

A caller predicting a lower stop uses the inward row, while an upper stop negates it.
Such a row is unilateral: a negative inward reaction cannot hold the stop. Selecting a
consistent active set, handling departure/arrival and verifying released rows remain controller
work. A bilateral row by itself is not a general stop solver.

## Verification

Run `node --test tests/core-joint-coordinate.test.mjs`.
The quaternion test uses independently rotating parent and child bodies, tilted joint axes,
nonidentity rest rotations, both freedom signs, and one through three declared freedoms.
It intentionally includes residual locked-axis motion. Central differences at 1e-5 s read:

| Reading | Maximum |
|---|---:|
| Angle-rate difference | 1.410053851458315e-9 rad/s |
| Curvature difference | 1.216210954169128e-8 rad/s2 |
| Nonzero curvature in the fixture | 11.909379397773527 rad/s2 |
| Rate difference from the plain motor-axis reading | 2.8435757144156995 rad/s |

Negating the quaternion preserves the result. Replacing the curvature target with zero fails
the test. Undefined coordinates and invalid indices have explicit tests.

The physical test uses the Node core stand, Rapier 0.21.0-auto-rpg.5 with corrected coordinate
limits, 1920 Hz, no gravity, no ground and no assist. A pinned-parent two-rod hinge presses
each of its +/-0.3 rad stops with 2 N m before the measurement. It is a synthetic mechanical
fixture, not an anatomical strength measurement. The table gives signed magnitudes for the
positive stop; the negative stop has opposite signs.

| Prediction/measurement | Angular acceleration (rad/s2) |
|---|---:|
| Loaded model omitting the stop | 33.33333254419606 |
| Loaded model including the stop | 1.5327432954949128e-29 |
| Physical loaded stop | 0 |
| Model after reversing effort and releasing the row | -33.33333254419606 |
| Physical inward release | -33.33386988976514 |

The measured window is 16 physics steps after settling for one second. Holding the row after
reversing effort requires a tensile stop reaction, which the test identifies before evaluating
the free model. Prediction leaves the complete world snapshot unchanged; the physical branch
replays exactly. This validates the motion/load primitive, not a whole-body active-set policy,
impact law, recovery route or gameplay migration.
