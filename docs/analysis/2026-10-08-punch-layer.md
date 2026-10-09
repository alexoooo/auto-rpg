# A punch layer on today's stance

The question: can a small layer on today's planted cross, with the pelvis held by the stance, the
chest driven, and the fist following, meet the punch competency? To meet it, every trial stays
upright, 95 % of blows land, every landed blow is at least 6.8 m/s over its last 10 cm, and first
contact comes within 0.5 s, at 120 and 480 Hz, on the Warrior and the Rogue. The other candidate,
the whole-body solve during a blow, lands at 4.2 to 4.4 m/s ([whole-body spike](../reference/whole-body-spike.md)).

**No.** Laid on the tracked arm, the layer lands almost nothing. When its blows do land, they are
no faster than today's.

## What was tried

The layer was a prototype, with no code installed. One setting, `drive`, turned it on, and with it
off the game was unchanged. With it on:

- the cross's trunk turns the right way, the striking shoulder back in the chamber and forward in
  the swing;
- the arm is aimed from where the trunk actually is: the effector goal reads its chain's held
  freedoms from the body, not the posture (the tracker's `fromActual`, asked per goal);
- the chamber winds up deeper, with `windup` up to 0.37 m and `torso` up to 0.6 rad;
- in the swing, `thoracic rotation right` is pushed flat out (`MusclePush`, level `drive`) until
  the trunk is turned as far as asked;
- the swing's time is the time an evenly accelerating fist takes from where it is at launch to
  reach the contact speed at the target: twice the distance over the speed.

Harness: Node, the core's world on Rapier, `punchStand` (`research/punch-calibration.mjs`).
Everything else is the punch competency's (`research/competencies.mjs`): the planted execution, a
compliant pad, both hands, the cell's place and full reach, seeds 0 and 1, and 8 s of blows from
2 s. Landed means a qualified impact; speeds are over the last 10 cm.

| Cell | Landed / thrown | Mean, m/s | Slowest |
|---|---|---|---|
| Warrior 120 Hz, today's cross | 38/55 | 4.84 | 4.36 |
| Warrior 120 Hz, drive 1, torso 0.43, windup 0.3, contact 7.5 m/s | 0/32 | - | - |
| Warrior 480 Hz, the same | 0/32 | - | - |
| Rogue 120 Hz, the same | 0/31 | - | - |
| Warrior 120 Hz, drive 1, torso 0.3, windup 0.2, contact 7 m/s | 0/39 | - | - |
| Warrior 120 Hz, drive 0.6, torso 0.43, windup 0.3, contact 8 m/s | 0/32 | - | - |

## Why

**A foot rolls.** A committed stroke ends when its bearing support fails (`bearingSupport`,
`src/core/control/support-readiness.ts`): both feet loaded, flat to 1.5 cm across their corners,
the mass centre over them. Every driven swing traced ended this way, with one foot's corners off
flat, 0.08 to 0.13 s after launch. This held at every drive from 0.2 to 1. It held with the push at
0.001, when only the trunk's new sense and the aim from the actual trunk were left.

**With that rule bypassed, the fist does not get there.** These runs are diagnostics only, with
support taken as held:

| Cell, support bypassed | Landed / thrown | Mean, m/s | Slowest |
|---|---|---|---|
| Warrior 120 Hz, today's cross | 47/53 | 4.78 | 3.70 |
| Warrior 120 Hz, drive 1, torso 0.43, windup 0.3, contact 7.5 | 6/31 | 5.08 | 3.97 |
| Warrior 480 Hz, the same | 4/32 | 4.96 | 2.12 |
| Rogue 120 Hz, the same | 0/32 | - | - |
| Warrior 120 Hz, the same, windup 0.12 | 10/35 | 4.23 | 2.82 |
| Warrior 120 Hz, the same, the trunk unwound only to square | 3/31 | 5.26 | 4.16 |
| Warrior 120 Hz, torso 0.6, windup 0.37, contact 8, unwound to square | 1/22 | 4.81 | 4.81 |

Step by step, for the Warrior's right hand at the place cell at 120 Hz, the fist peaks at 5.8 to
6.2 m/s, and two things keep it off the pad:

- **The trunk turned through to the far side** (0.40 to -0.34 rad) carries the fist across. It
  comes within 0.19 m of the target and then moves away, while the arm's shoulder flexion and
  elbow sit at their bounds and cannot steer.
- **The trunk unwound only to square** turns at 1.5 rad/s, from 0.40 to 0.21 rad in 0.125 s,
  pushed flat out. The arm reaches its full extension with the striking shoulder still back, and
  the fist stops 0.26 m from the target.

In a boxer's cross the trunk turns at 11.6 rad/s and the pelvis at 10.4, with the hand at
8.5 m/s (PMC11466798).

**What the body can give at this pad.** The earlier flat-out search over the trunk, the legs and
the arm, with the stance kept, measured how fast the hand reaches the pad's plane. Its best
schedule reached 6.62 m/s at 120 Hz and 6.00 at 480 when starting from the guard. With a quarter
second's wind-up first (the hand 0.37 m back, the trunk turned), it reached 12 m/s 0.28 s after
the wind-up, about 0.53 s from the start. That motion was a lunging whip: the lumbar spine flexed
0.89 rad and the elbow was thrown straight. A search of pushes laid on today's cross, scored by
impulse, raised the blow's mass and left its speed at 4.0 to 4.2 m/s. Those runs are
`docs/analysis/2026-10-08-punch-and-rise-speed.md@7f3ebcdb`, on the body as it stood then.

## What it says

- **A layer on the tracked arm does not reach 6.8 m/s.** The arm saturates within 0.06 s of the
  swing, and the trunk is too slow to add to it before the arm runs out of reach.
- **From the guard, the place cell is beyond the body as searched.** The best schedule found
  reached 6.0 to 6.6 m/s there. Only a wind-up clears 6.8, and one at the searched depth uses
  about 0.53 s of the 0.5 s allowed for first contact.
- **The stroke's flat-foot rule ends any swing that drives the trunk.** A real cross lifts the rear
  heel. Whether a committed stroke may pivot on the ball of its foot is a rule of the planted
  execution, not of the body.

## Open choices

- **Keep today's cross.** It lands the Warrior's blows at 4.4 to 4.9 m/s and fails the speed bar.
- **A ballistic punch controller.** A searched, flat-out schedule from a wind-up, aimed by a few
  parameters, with a stroke that lets the rear heel lift. This is a controller project, not a
  layer: the body's ceiling clears the bar only from a wind-up, and the timing is marginal.
- **Faster trunk and hip curves.** The hip's and trunk's unloaded speeds come from a two-point
  extrapolation (`BORROWED`, `src/core/human/speed.ts`). A body change like this is felt in every
  walk, rise and kick, and needs its before/after tables.
