# Stone and skeleton wrist task targets, 2026-09-27

The off-by-default `effector` channel now drives a world business-end target on the stone and
skeleton wrist chains. A blade, fist or single-socket mace on either hand declares target, speed
and force. Flexible lashes, forearm shields and paired grips do not declare this actuator.
Existing anatomical hand targeting remains as described in `2026-09-26-effector-target.md`.

The wrist owns five command axes: a hand point, roll and bend. It cannot promise an arbitrary
six-axis orientation, so the requested quaternion is projected onto the roll and bend stops
while the hand point is solved for the terminal's actual overhang. The solve reads commanded
geometry, never an achieved pose, to avoid winding up against physical lag. A full fixed-point
correction crossed the skeletal mace's reachable shell; six passes at 0.3 of the remaining
error converge in the physical bench. `speed` scales the core and wrist command rates;
`force` scales their motor ceilings. A legacy hand command clears the target and restores both
scales to one. The target and scales are included in exact-fork state.

The headless Havok stand first holds a reachable legacy pose, returns to neutral, then sends
the saved world tip and wrist orientation through the new command. Across both families, all
three rigid terminals and both sockets (12 cases), actual tip error is below 5 mm and
orientation error below 0.01 rad. Representative primary-hand errors are:

| Body | Blade | Fist | Mace |
|---|---:|---:|---:|
| Stone tip error | 1.6 mm | 0.6 mm | 1.7 mm |
| Skeleton tip error | 1.8 mm | 0.4 mm | 2.2 mm |

The bench also checks that zero speed holds all five commanded axes, zero force loses the
physical pose while leaving target geometry intact, and an impossible point stays finite
within published stops. A production-bout test checks dispatch and exact-fork restoration.
Removing the task solve makes the physical blade test fail at 618 mm tip error; removing the
damping fails it at 549 mm. The 15 named six-second bout trajectories are bit-identical to the
prior checkout with the flag off. Full validation: 1100/1100 tests, typecheck and build.

This establishes that the new actuator can hold reachable poses, not that a policy using it
raises combat headroom. The channel remains off. Full-length paired headroom and the owner's
body-release choices remain separate gates.
