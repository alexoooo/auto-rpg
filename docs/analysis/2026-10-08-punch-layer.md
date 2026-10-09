# A punch on today's body

The question: what can carry today's body to the punch competency? To meet it, every trial stays
upright, 95 % of blows land, every landed blow is at least 6.8 m/s over its last 10 cm, and first
contact comes within 0.5 s, at 120 and 480 Hz, on the Warrior and the Rogue. The whole-body solve
during a blow, on a timed path, lands at 4.2 to 4.4 m/s ([whole-body spike](../reference/whole-body-spike.md)).
Three more things were tried:

- **A layer on today's planted cross** lands almost nothing, and the blows it does land are no
  faster than today's.
- **The whole-body solve asked for all it can give**, every step, with no path and no set time,
  lands at 2.8 to 4.6 m/s. Faster trunk and hip curves change nothing.
- **The body's ceiling**, searched with flat-out pushes, has a straight blow over the bar at every
  cell searched:
  - 7.1 to 12 m/s for both fighters' rear hands;
  - 7.4 m/s for the Warrior's lead hand, landing just inside the time.

  The muscle curves move none of these figures by more than the search's own noise.

The body can meet the bar. What is missing is a controller that sequences the blow.

Speed is not what a blow is worth, though. Priced as the game prices it, the fastest blows the
search finds take 2 to 5 % of a Warrior's head, because they land with the elbow bent and the fist
meets 0.2 to 1.4 kg. The same arm straight and on the line of the blow meets 6 kg free, and 1.4 to
2.7 kg with the elbow or the wrist 20° off. The way to a punch that hurts is a blow that lands
with the arm lined up ([What a blow is worth](#what-a-blow-is-worth)).

## A layer on the tracked arm

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

### Why

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

## The greedy solve

The question here: with no path and no set time, how fast does the whole-body solve bring the fist
to the pad if it is asked, every step, for as much as it can give? `research/greedy-punch.mjs`
asks the spike's solve to drive the fist's strike point along the line from where the blow begins
to 0.2 m past the pad's target. The demand along the line is `push` m/s², beyond anything a muscle
gives. Across the line, the fist is held to it with 0.05 s of feedback. The base is the spike's:
the mass centre over the soles and the pelvis at its height. The arm's and the trunk's guard goals
are let go while the fist is driven.

From the guard, the fist stands only 0.2 m from the pad's face, so the blow is first drawn back
along the line to `runup` from the target. That uses a goal with feedback and no time, and the
drive starts from wherever the fist is once it gets there. `turns` adds the spike's pelvis and
chest turns. These are minimum-jerk profiles in time, so with them the trunk is the one part that
has a set time.

Harness: Node, the core's world on Rapier, the spike's body and solve (`spikeBody`), and the punch
competency's cells. A cell is both hands at the place and at full reach, three blows each, plus
the place with the pad moved 1 m aside, read by `spikeFigures`.

The settings were picked on the Warrior's right hand at the place, 120 Hz, by a grid:

- `push`: 120, 240, 320, 400 and 500 m/s²;
- `runup`: none, 0.2, 0.25 and 0.3 m;
- which channels are let go of the guard;
- `turns` on or off.

Best was `push` 240, `runup` 0.25 m, the arm and trunk let go, and the turns on: 5.1 to 5.9 m/s,
with no fall. Without the run-up the fist arrived at about 3.6 to 4.0 m/s. Without the turns it
arrived at 5.0 at best, and fell. At `push` 320 and above, the line's demand swamps the base's
goals: the solve rejects steps, which zeroes every torque, and the body falls.

Muscle speeds are given two ways:

- **Today's curves.** The trunk and the hip's other freedoms borrow hip flexion's curve, fitted
  through Anderson's two points: unloaded 8.86 rad/s, curvature 13.1. That is nearly linear, so
  it gives no torque at all past 8.86 rad/s.
- **The elbow's rule on Anderson's points.** Thelen's curvature, 0.25, with the unloaded speed
  fitted by least squares through the same two points: 27.2 rad/s at the trunk and hip, and
  20.4 in hip extension. The knee goes from 26.6 to 31.5, and the ankle from 17.3 to 11.6. This
  curve is weaker than today's below about 4 rad/s and stronger above it. At 11.6 rad/s, the
  boxer's trunk, it gives 21 % of isometric.

The second was built in a worktree for this run only. It is not in the game.

| Cell, `push` 240, `runup` 0.25 | Landed | Mean, m/s | Slowest | Fastest | Latency, s | Fell, hit / miss |
|---|---|---|---|---|---|---|
| Warrior 120 Hz, today's curves | 10/12 | 4.60 | 3.65 | 5.87 | 0.20 | 2/4, 2/2 |
| Warrior 480 Hz, today's curves | 8/12 | 3.77 | 2.73 | 4.33 | 0.18 | 2/4, 2/2 |
| Rogue 120 Hz, today's curves | 12/12 | 3.17 | 2.31 | 3.63 | 0.24 | 0/4, 2/2 |
| Rogue 480 Hz, today's curves | 12/12 | 3.22 | 2.62 | 3.70 | 0.23 | 0/4, 2/2 |
| Warrior 120 Hz, the elbow's rule | 12/12 | 4.42 | 3.48 | 5.68 | 0.22 | 0/4, 2/2 |
| Warrior 480 Hz, the elbow's rule | 4/12 | 4.27 | 4.20 | 4.33 | 0.16 | 4/4, 2/2 |
| Rogue 120 Hz, the elbow's rule | 12/12 | 3.43 | 3.26 | 3.70 | 0.24 | 0/4, 2/2 |
| Rogue 480 Hz, the elbow's rule | 12/12 | 2.79 | 0.75 | 3.44 | 0.24 | 0/4, 2/2 |

No cell comes near 6.8 m/s, on either curve. Every trial with the pad moved aside falls. That
is the test's own fault, not the body's: nothing stops a blow that meets no pad until 0.45 s
have passed, and by then the body has been driven off its feet.

**Why.** Step by step, on the Warrior's right hand at the place at 120 Hz, the fist is drawn back
to the run-up. Once the drive starts, it goes 5 cm further back in the first 0.04 s, with the
elbow bending, before it comes forward. It reaches 5.4 m/s 13 cm along the line, 0.08 s into the
drive, and then slows to 4.3 m/s by contact as the elbow straightens, from 1.56 rad to 0.33. The thoracic
joint turns 0.3 rad in all, never faster than 6.5 rad/s. On the elbow's rule it is the same: a peak of
5.5 m/s, the trunk under 6 rad/s. A solve that asks for the most acceleration of the fist *now*
takes it from the arm, which gives it soonest. A trunk turned early would pay off only later, so
the solve never turns it early, and the fist runs out of arm first. A fast cross is sequenced
from the pelvis out, and a one-step solve does not look ahead far enough to sequence it.

## The body's ceiling

The question here: how fast can the body itself bring its fist to the pad, whatever controls it?
`research/punch-ceiling.mjs` lays flat-out pushes on the combat guard, with the stance kept. There
are 18 channels:

- the trunk's two rotations and two flexions;
- each hip's three freedoms, each knee and each ankle;
- the striking shoulder's three freedoms and its elbow.

Each push has a level, a start and a length after the order, and diagonal CMA-ES searches them.
A blow is scored the way the competency reads one: the strike point's speed over its last 10 cm
before the pad's face. It counts only if it reaches the face within the face's bounds, no later
than 0.5 s after the order, with the body still up 0.3 s later. No pad stands there, and no
flat-foot rule applies. The schedules are fitted to one cell and are a measuring stick, not a
skill.

Harness: Node, the core's world on Rapier, the body built in its guard, symmetric actuation, and
14 workers a search, with 56 schedules a generation. Each cell was searched three ways:

- 40 generations on seed 1;
- 150 generations each on seeds 1 and 2;
- 100 generations at 240 Hz, begun at the best schedule found so far on either set of curves
  (for the left hand, at its fastest blow at any angle).

Every best was run again at 120, 240, 480 and 960 Hz. The rates from 240 up agree to within
about 3 %. 120 Hz reads 5 to 10 % higher than 480, since every search but the last ran at 120 Hz.

**Every fast blow winds up first.** Over 0.25 to 0.4 s, the fist is drawn back or up while the
trunk takes the chest 13 to 20 cm forward and the pelvis up to 10 cm back. Then, in the last 0.05
to 0.1 s, the elbow and shoulder throw the arm straight. Contact comes 0.32 to 0.47 s after the
order. Most of the hip and trunk pushes start 0.1 to 0.3 s before the elbow's. Not every best comes
in the same way:

- the Rogue's at the place draws the fist level, 0.37 m back past the chest, and drives it level
  into the face at 10.5 to 12 m/s, 14° to 16° off the face's normal;
- the Warrior's first best raises the fist to 1.8 m and chops it down through the face at
  34°.

The competency counts both. So a second score counts a blow only if its last 10 cm come in within
20° of the face's normal, which allows 3.6 cm across over those 10 cm. That is called straight
below, and the table takes, for each cell, the best blow from any search that meets it.

| Cell, at 480 Hz, m/s | Straight, today's curves | Straight, the elbow's rule | Any angle, today's | Any angle, the elbow's rule |
|---|---|---|---|---|
| Warrior, right hand, place | 9.57† | 9.27 | 11.07 | 9.96 |
| Warrior, right hand, full reach | 7.14 | 7.29 | 13.54† | 12.80† |
| Warrior, left hand, place | 7.36 | 8.80† | 10.97 | 10.94 |
| Rogue, right hand, place | 10.47 | 11.97 | 10.47 | 11.97 |
| Rogue, right hand, full reach | 7.06 | 7.55 | 8.51 | 7.91 |

A figure is the best found, read at 480 Hz. † marks a best that counts only at a lower rate. The
Warrior's straight right hand at the place came in at 21° at 480 Hz, and 9.41 m/s within 20° at
240. The chops at full reach crossed the face's plane just outside its edge at 480 Hz, and counted
at 13.42 and 13.21 m/s at 240 and 120. The left hand's straight blow on the elbow's rule came in at
20.5° at 480 Hz, and counted at 8.86 m/s at 240 and 8.83 at 960.

Each figure is a floor, not the ceiling itself. The searches disagree by up to half:

- the Warrior's straight right hand at the place came out at 5.41 on one seed and 8.20 on the
  other;
- the Rogue's straight right hand at full reach came out at 3.64 and 7.00;
- the searches held to 20° found the Rogue's right hand at the place no faster than 5.9 m/s,
  while the open search found the blow at 10.5 to 12 m/s within 16°.

For the left hand, the lead, no search from scratch found a straight blow over 5.4 m/s. Begun from
its fastest blow at any angle, 11 m/s at 24°, the search found one at 7.36 m/s. It lands 0.49 s
after the order, a hundredth inside the competency's limit.

The shorter searches add that the Warrior's right hand at the place, with the blow due 0.3 s
after the order, lands straight at 7.3 to 7.7 m/s, and at 8.2 to 8.6 by 0.4 s. A Warrior with speed ×0.85 reaches 7.7 to
8.8 m/s, and one with strength ×0.8 reaches 6.7 to 7.1 m/s.

**The curves.** Neither set of curves is ahead of the other by more than the seeds differ:
9.57 and 9.27, 7.14 and 7.29, 7.36 and 8.80, 10.47 and 11.97, 7.06 and 7.55. The body's ceiling is not set by the trunk's and
hip's unloaded speeds.

## What a blow is worth

`research/punch-objective.mjs` prices a fist that reaches the pad as the arena would price it on
the head of a Warrior standing in guard there:

- **the fist** meets what its body gives along the approach, with each muscle holding at the
  bounds it had that step (`ContactMass.yielding`);
- **the head** meets what the guard's body gives, with its own muscles holding: 7.0 kg free, 7.3
  to 7.8 kg held;
- **the two hold for the time their surfaces in series take** (`contactGive`), about 10 ms;
- **the surfaces share the energy** by compliance: the fist takes 62 % against a head;
- **each share is damage** by the rulebook, the fist's less its threshold (`Rulebook.fist`,
  36.8 J).

The score is the exchange: the hit points the head loses less the ones the fist loses. It peaks
at 0.22 HP, half a Warrior's head, where the fist's share meets its threshold: a blow of 59 J.
Past that, each joule costs the fist more than it gives the head. A Warrior's hand comes off at a
blow of about 80 J on a head.

`research/punch-ceiling.mjs --score damage` searches on it. Harness: Node, Rapier, the body built
in its guard, symmetric actuation, held within 20° of the face's normal, 150 generations of 56 at
120 Hz, read again at 480 Hz. Each cell was searched three ways: on speed; on the exchange, begun
at the speed search's best; and on the exchange, from scratch.

| Cell, at 480 Hz | Speed search: m/s, fist kg, J, head HP | Best on the exchange: m/s, fist kg (free), J, head HP |
|---|---|---|
| Warrior, right, place | 6.12, 0.28, 5.1, 0.019 | 4.34, 0.65 (0.59), 5.7, 0.021 |
| Warrior, right, full reach | 5.59, 0.35, 5.3, 0.020 | 4.96, 0.85 (0.78), 9.4, 0.036 |
| Warrior, left, place | 4.35, 0.42, 3.8, 0.014 | 4.42, 0.60 (0.53), 5.4, 0.020 |
| Rogue, right, place | 3.53, 0.19, 1.2, 0.004 | 3.87, 0.35 (0.31), 2.5, 0.010 |
| Rogue, right, full reach | 3.85, 0.17, 1.3, 0.005 | 3.96, 0.28 (0.26), 2.1, 0.008 |

These searches are weaker than the ones above (6.1 m/s against 9.6 for the Warrior's straight
right hand), and the figures are floors. Two more on the Warrior's full reach at 240 Hz, 200
generations, reached 0.047 HP. Read at 120 Hz the fist's masses are up to 60 % larger.

**The fist's mass is the arm's alignment.** On a stand with no gravity, the Warrior's right
shoulder flexed 90°, every other freedom in guard, a push along +z through the strike point:

| Arm | Free, kg | Every muscle held at its peak, kg | J at 9.14 m/s | Head HP |
|---|---|---|---|---|
| straight, wrist on line | 6.15 | 15.9 | 207 | 0.78 |
| elbow 9° short of straight | 3.57 | 8.3 | 161 | 0.61 |
| elbow 20° short | 1.42 | 2.7 | 82 | 0.31 |
| straight, wrist 23° off | 1.08 to 1.44 | 2.2 to 2.7 | 70 to 82 | 0.27 to 0.31 |
| elbow 32° short | 0.74 | 1.3 | 46 | 0.18 |
| elbow 49° short | 0.40 | 0.67 | 26 | 0.10 |

The elbow's straight is its range's end, -0.86 rad: the reference pose has it bent 49°. A boxer's
2.9 kg at 9.14 m/s (Walilko, Viano and Bir 2005) is the elbow about 20° short of straight. The
searched blows land 35 to 50° short: the trunk carries the fist to the face while the elbow is
still opening. How the muscles hold barely matters: holding at the activation's isometric peak,
or its eccentric ceiling, rather than at the step's bounds, raises the fist's mass by under 10 %.

## What it says

- **Today's body clears the bar.** On the muscles as they are, every cell searched has a straight
  blow, upright, within 0.5 s:
  - both fighters' rear hands at both cells, 7.1 to 12 m/s;
  - the Warrior's lead hand at the place, 7.4 m/s, with a hundredth of a second to spare.

  The Warrior's rear hand does it within 0.3 s. Faster trunk and hip curves are not needed for
  the punch.
- **No controller tried here gets there.**
  - The layer on the tracked arm ends its swing on the stroke's flat-foot rule.
  - The whole-body solve on a timed path lands at 4.2 to 4.4 m/s.
  - Asked for all it can give each step, the solve lands at 2.8 to 4.6 m/s.
  The one-step solve takes the fist's acceleration from the arm, which gives it soonest. The fast
  blows the search finds start the hips and trunk 0.1 to 0.3 s before the elbow. A controller
  that meets the bar has to choose now what pays off a third of a second later.
- **The competency's bar counts a chop.** It reads the fist's speed toward the pad and where it
  lands on the face, not the angle it comes in at. Blows coming down across the face at 10 to
  14 m/s pass it.
- **What a blow is worth is where the arm is when it lands.** Today's fastest blows hurt least:
  a bent elbow brings a third of a kilogram. A blow 20° short of straight at a boxer's speed
  takes 70 % of a Warrior's head, and with it the hand. Flat-out pushes on the trunk, legs and
  arm do not find that blow.
- **The lead hand at the place is tight on time.** Its straight blow needs nearly all of the
  0.5 s. The Rogue's lead hand was not searched.

## Open choices

- **A blow that lands lined up.** The skill chooses its distance and its contact pose (elbow
  10 to 20° short of straight, wrist on the line) first, then the motion that arrives there
  fast. The exchange is the score to search it on.
- **The fist's threshold against a head.** At 36.8 J and a 62 % share, the exchange stops paying
  at 59 J, and a boxer's blow costs the hand. Against a trunk the fist takes an eighth and the
  threshold is never reached.
- **A controller that looks ahead.** It decides from the state toward the goal, over the blow's
  whole third of a second, rather than one step at a time:
  - the whole-body solve over a horizon, solved again each step;
  - or a policy trained against this score.
  Either is a controller project. The one-step solve already costs 2.2 to 2.8 ms a body a step,
  and a horizon multiplies that.
- **The competency's angle.** Whether a blow counts only if it comes in straight, and at what
  angle, is the competency's rule. With it, the fastest chop no longer passes.
- **Keep today's cross.** It lands the Warrior's blows at 4.4 to 4.9 m/s and fails the speed bar.
