# Named striking effectors

What a named effector is, and the check that moving the hand path onto it changed neither result
nor cost. An effector declares a segment, a named physical point and an ancestor base; only the
joint channels between base and segment are its reach. The body exposes detached point and channel
capabilities; direct actuator policies do not need this tracker.

The hand interface delegates to the same tracker. A named additional reach cannot own a bearing
foot or a hand the hand interface already commands; omitted paths release their limbs, and
recovery resets every path. A point's translation follows the measured Hermite trajectory;
optional orientation is the segment's turn from its reference pose in the root frame, interpolated
by minimum jerk. The six-row IK solve combines point translation with angular error through the
exact joint angular Jacobian, its angular rows weighted by the segment's length as lever: objective
conditioning, not muscle or external torque.

A foot's `strike` is the centre of the distal half of the box sole and its `sole` the plantar-face
centre, both from sourced dimensions; they add no mass, collision, inertia, strength or toes.

## Tracking cost and retained behavior

Node Warrior stand (unpinned), `rapier-coordinate`, symmetric actuation, 120 Hz, empty hands,
balance 0; both feet bear, one hand reaches 10 cm after 2 s. Four alternating before/after playings
warm 360 steps and time the next 720, the first playing excluded. Quiet-machine mean ms a step:

| Playing | Before | After |
|---|---:|---:|
| 2 | 2.113 | 2.187 |
| 3 | 2.139 | 2.124 |
| 4 | 2.117 | 2.173 |

All eight playings give the same final-state SHA-256,
`4380b4ec09ffaa07b680311ad51e323ec708eca29619cf151d565475e232e5ed`.

## Tried and not kept

- **Fixed fist orientation** (punch stand as above, 8 s, compliant pad, matched feedback): the
  bounded-impact executor also asks the shortest turn from the hand's reference axis to body-forward.
  No trial falls and none passes repeatability: at 0.12 s orientation time, 2 impacts in 16
  failures across both hands and families; at 0.25 s, 1 impact in 20 failures.
