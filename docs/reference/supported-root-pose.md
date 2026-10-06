# Supported root poses

## Contract and harness

`StanceGoal.pose` supplies a root pitch and response time while two feet remain planted.
The existing body, IK, muscles and contact solver execute it. It owns no movement step,
and a walk or swing supplied with it is refused. The effort-aware bearing solve is
allocated after the leg channels are bound. Its solved leg accelerations carry the
remaining body's servo solve through `limbMotion`; its muscles still cap every torque.
The posture follows the slower support response while a requested hand path retains
its ordinary tracking response. Arm IK reads the measured held trunk angles during
this mode. No assist, anatomy, inertia, muscle strength or damage rule changes.

A supported pose retains a recovery bar at least the reference standing height less
`FALLEN`. Asking for a lower root height therefore still reports a physically fallen
body to the host. A shove from the low posture exercises that path; removing the bar
makes that test fail. Fresh-world save/load during descent reproduces the complete
low striking and standing return state and body motion bit for bit.

All figures below use the Node unpinned Warrior stand, `rapier-coordinate`, 120 Hz,
empty hands and balance 0. `research/combat-strikes.mjs` accepts `support` and applies
`supportedStrikeCommand` through the ordinary Body driver. The raw configurations,
phases, driven pre-contact velocity, path error, saturation, impulses, returns and
failures are in [supported-root-pose.json](supported-root-pose.json).

## Physical probe

These are commanded values, not claims that the body reaches them: lower the requested
COM height by 0.5 m over 4 s after 2 s of ordinary standing; pitch the root by 0.9 rad;
request lumbar flexion 0.89 rad and thoracic flexion 0.368 rad with a 0.5 s support
response. Begin the ordinary downward combat path at 7 s, stop requesting strikes at
16 s, reverse the fold over 4 s and resume the ordinary stance. The target is
(+/-0.2, 0.3, 0.15) m. The fixed obstacle is 0.2 by 0.2 by 0.08 m, with its front face
at the target's z. Its height spans 0.2?0.4 m: these contacts establish low striking,
and do not yet establish attacking a prone opponent's particular surface.

| Hand / case, 25 s | Contacts / closing >= 1 m/s | Verified returns | Failed cycles | Final head height |
| --- | ---: | ---: | ---: | ---: |
| Left / hit | 12 / 11 | 12 | 0 | 1.612669 m |
| Right / hit | 12 / 11 | 11 | 1 | 1.612172 m |
| Left / miss | 0 / 0 | 11 | 1 | 1.612225 m |
| Right / miss | 0 / 0 | 8 | 1 | 1.612244 m |

None of these four cases falls or contacts the floor with the head or trunk. Both soles'
final corners are within 0.015 m of the physical floor. Left and right hit cases each
have at least six contacts closing faster than 2 m/s. The first contacts are slow
(0.912 / 0.851 m/s), and are not promoted as powerful strikes. Impulse is a collision
measurement and neither work nor damage. Miss errors and occasional failed cycles
remain in the raw record.

## Range and failed cells

The following 14 s hit probes vary only root pitch and target z; target x/y and all
other commands match the probe above. A larger z is a longer stroke. The final head
is still low because the return to standing starts at 16 s.

| Pitch | Target z | Contacts | Falls | Floor-contact steps | Verified returns / failures |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0.3 | 0.15 | 16 | 0 | 0 | 15 / 0 |
| 0.3 | 0.25 | 4 | 1 | 422 | 4 / 4 |
| 0.3 | 0.35 | 6 | 1 | 197 | 7 / 2 |
| 0.6 | 0.15 | 16 | 0 | 0 | 16 / 0 |
| 0.6 | 0.25 | 10 | 0 | 0 | 9 / 0 |
| 0.6 | 0.35 | 0 | 0 | 0 | 7 / 0 |
| 0.9 | 0.15 | 9 | 0 | 0 | 9 / 0 |
| 0.9 | 0.25 | 10 | 0 | 0 | 10 / 0 |
| 0.9 | 0.35 | 0 | 0 | 0 | 5 / 1 |
| 1.2 | 0.15 | 8 | 0 | 0 | 5 / 2 |
| 1.2 | 0.25 | 7 | 0 | 0 | 3 / 3 |
| 1.2 | 0.35 | 0 | 0 | 0 | 5 / 0 |

This is a local capability gate. It proves neither arbitrary kneeling nor safe walking
while folded, and does not authorize chasing a vertically unreachable target into a
fallen opponent. Autonomous entry, physical target clearance, grounded/rising enemy
contact, and competitive measurement remain required before gameplay promotion.

## Combat fold settings

`COMBAT_FOLD` enables the supported transition behind `Intent.lower`. Its maximum
lowering is 0.5 m, root pitch 0.9 rad, root/posture response 0.5 s, and transition
2 s. Lumbar/thoracic requests are 0.89/0.368 rad, clamped to the body's limits.
The standing reference is read from the actual body's first step. These are the same
fold settings as the physical probe, with the faster transition checked in
[supported-entry-probes.json](supported-entry-probes.json). Both hands, for each of
1, 1.5, 2 and 3 s transitions, survive contact and return to standing without falls
or head/trunk floor contacts. The 2 s cases have 17/14 verified returns and no failed
cycles in those probes. They establish a supported transition, not a ground finish.

The executor waits for an actual standing control phase and planted physical feet.
The readiness settings are conservative engineering gates: every sole corner within
0.015 m of the body's lowest point; positive fixed-contact impulse at each foot with
its into-ground normal's y at most -0.9; head/trunk shape clearance at least 0.15 m;
COM speed at most 0.1 m/s; COM within the actual sole polygon; and 0.05 s of held
readiness after the transition. Thus a floating body cannot enter merely by requesting
support. This is an entry rule for low combat; the separate recovery sub-mind restores
missing support. A committed strike retains its support request through its return.
Returning to ordinary locomotion also waits for quiet physical support.
