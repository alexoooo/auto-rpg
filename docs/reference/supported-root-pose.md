# Supported root poses

Low striking from a folded stance: `StanceGoal.pose`, its physical probes, and the settings
`COMBAT_FOLD` (`src/core/skills/locomotion/support-fold.ts`) takes from them. Figures use the Node unpinned
Warrior stand, `rapier-coordinate`, 120 Hz, empty hands, balance 0; `research/combat-strikes.mjs`
with `support` applies `supportedStrikeCommand` through the ordinary body driver. Configurations,
phases, pre-contact velocity, path error, saturation, impulses, returns and failures are in
[supported-root-pose.json](supported-root-pose.json).

## Contract and harness

`StanceGoal.pose` gives a root pitch and response time while one or two selected feet stay planted;
it owns no step, and a walk or swing with it is refused. The bearing solve is allocated after the
leg channels are bound and carries the rest of the body's solve through `limbMotion`. Optional
sole anchors (a selected bearing foot, finite position, unit quaternion) correct the feet through
the bearing muscles. A supported pose keeps a recovery bar of at least the standing height less the
spec's fall bar (`DownSpec` `asked`), so a lowered root still reports a fall: a shove from the low
posture tests it, and removing the bar fails that test. Save and load during descent replay bit for
bit.

## Physical probe

Commanded, not reached: after 2 s standing, lower the centre of mass 0.5 m over 4 s, pitch the
root 0.9 rad, ask lumbar 0.89 and thoracic 0.368 rad flexion at 0.5 s support response; the
downward combat path from 7 s to 16 s, then unfold over 4 s and resume the stance. Target
(+/-0.2, 0.3, 0.15) m; a fixed 0.2 by 0.2 by 0.08 m obstacle, front face at the target's z,
spanning 0.2 to 0.4 m in height. This is low striking, not a prone opponent's surface.

| Hand / case, 25 s | Contacts / closing >= 1 m/s | Verified returns | Failed cycles | Final head height |
| --- | ---: | ---: | ---: | ---: |
| Left / hit | 12 / 11 | 12 | 0 | 1.612669 m |
| Right / hit | 12 / 11 | 11 | 1 | 1.612172 m |
| Left / miss | 0 / 0 | 11 | 1 | 1.612225 m |
| Right / miss | 0 / 0 | 8 | 1 | 1.612244 m |

No case falls or touches the floor with head or trunk; both soles end within 0.015 m of the floor.
Each hit case has at least six contacts closing faster than 2 m/s; the first are slow (0.912 and
0.851 m/s). Impulse is a collision reading, not work or damage.

## Range and failed cells

14 s hit probes varying root pitch and target z (a larger z is a longer stroke), all else as above;
the head ends low because the return starts at 16 s.

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

A local gate: it shows neither arbitrary kneeling nor walking folded.

## Combat fold settings

`COMBAT_FOLD` enables the supported transition behind `Intent.lower`, with the physical probe's
fold settings and a faster transition:

| Field | Value | Meaning |
|---|---:|---|
| `lower` | 0.5 m | greatest lowering |
| `pitch` | 0.9 rad | root pitch |
| `response` | 0.5 s | root and posture response |
| `transition` | 2 s | lowering time |
| `lumbar` / `thoracic` | 0.89 / 0.368 rad | flexion asked, clamped to the body's limits |
| `footGap` | 0.015 m | every sole corner within this of the body's lowest point |
| `normal` | 0.9 | each foot's into-ground normal y at most minus this, with positive fixed-contact impulse |
| `clearance` | 0.15 m | head and trunk shape clearance at least |
| `slow` | 0.1 m/s | centre-of-mass speed at most |
| `hold` | 0.05 s | readiness held after the transition |

The standing reference is read from the body's first step. In
[supported-entry-probes.json](supported-entry-probes.json) both hands, at 1, 1.5, 2 and 3 s
transitions, survive contact and return to standing without falls or head or trunk floor contact;
the 2 s cases have 17 and 14 verified returns and no failed cycles.

The readiness fields are conservative entry gates: the executor waits for a standing control phase,
planted feet and the centre of mass within the sole polygon, so a floating body cannot enter by
asking. A committed strike keeps its support request through its return, and the return to
locomotion also waits for quiet support. Missing support is the recovery sub-mind's to restore.
