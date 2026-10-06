# Named striking effectors

An effector declares a segment, a named physical point and an ancestor base. Only joint channels
between that base and the segment belong to its reach. The body exposes detached point/channel
capabilities; direct actuator policies remain independent of this reference tracker.

The legacy hand interface delegates to the same tracker. A named additional reach cannot own a
bearing foot or a hand already commanded by the hand interface. Omitted additional paths release
their limbs; recovery resets every path.

A point's translation uses the existing measured Hermite trajectory. Optional orientation is the
segment's turn since its reference pose in the root frame, interpolated separately by minimum
jerk. The six-row IK solve combines point translation with angular error and the exact joint
angular Jacobian. Its angular rows use the segment's existing length as their positional lever;
this is objective conditioning, not additional muscle or an external torque.

A foot's named `strike` is the centre of the distal half of the existing box sole. Its `sole`
point is the plantar-face centre. Both are derived from existing sourced dimensions. They add no
mass, collision authority, inertia, strength or fictional articulated toes.

## Tracking cost and retained behavior

Node unpinned Warrior stand, `rapier-coordinate`, symmetric actuation, 120 Hz, empty hands,
balance zero. Both feet bear, one hand reaches 10 cm after two seconds. Four alternating
before/after playings warm 360 steps and time the following 720; the first playing is excluded.
Before uses the committed body/motor/kinematics modules; after uses named effectors. Anatomy,
commands and physics settings are identical. The quiet-machine mean milliseconds per step are:

| Playing | Before | After |
|---|---:|---:|
| 2 | 2.113 | 2.187 |
| 3 | 2.139 | 2.124 |
| 4 | 2.117 | 2.173 |

Every final segment position, quaternion and linear velocity produces the same SHA-256 digest
`4380b4ec09ffaa07b680311ad51e323ec708eca29619cf151d565475e232e5ed` in all eight playings.
This is a cost check for the retained hand path, not a claim about Arena performance or kicks.

## Fixed fist orientation diagnostic

Node unpinned Warrior punch stand, `rapier-coordinate`, symmetric actuation, 120 Hz, empty
hands, balance zero, eight seconds. The ordinary bounded-impact executor receives an additional
orientation: the shortest turn from the hand's reference axis to body-forward. The diagnostic
captures the actual guard orientation for return. It uses the existing compliant pad and
matched target feedback; translation and strength are unchanged.

| Orientation time (s) | Left straight | Left cross | Right straight | Right cross |
|---|---|---|---|---|
| 0.12 | 2 impacts, 2 failures | 0 impacts, 6 failures | 0 impacts, 2 failures | 0 impacts, 6 failures |
| 0.25 | 1 impact, 4 failures | 0 impacts, 5 failures | 0 impacts, 6 failures | 0 impacts, 5 failures |

No trial falls, but none passes repeatability. Fixed orientation is not promoted as a punch
correction. This only tests one fixed target orientation; it does not reject independently
planned orientations or the general tracker.
