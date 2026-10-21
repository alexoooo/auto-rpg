# A punch on today's body

The question: what carries today's body to the punch competency? Its bar: every trial upright, 95 %
of blows landed, each landed blow at least 6.8 m/s over its last 10 cm, first contact within 0.5 s,
at 120 and 480 Hz, on the Warrior and the Rogue ([competencies](../reference/competencies.md)).

The current answer:

- **The body clears the bar.** Flat-out pushes find a straight blow over 6.8 m/s, upright, within
  0.5 s at every cell searched: 7.1 to 12 m/s for both fighters' rear hands, 7.4 m/s for the
  Warrior's lead hand. Faster trunk and hip curves are not needed.
- **No controller tried gets there.** A layer on the tracked arm ends on the stroke's flat-foot
  rule; the whole-body solve lands 4.2 to 4.4 m/s on a timed path
  ([whole-body spike](../reference/whole-body-spike.md)) and 2.8 to 4.6 m/s asked for all it can
  give each step. The fast blows start the hips and trunk 0.1 to 0.3 s before the elbow; a
  controller has to choose now what pays off a third of a second later.
- **Speed is not worth.** The fastest blows land with the elbow bent, the fist meets 0.2 to
  1.4 kg, and they take 2 to 5 % of a Warrior's head. A straight arm on the line meets 6 kg. The
  game's straight punch wounds the chest at 0.05 to 0.15 HP a blow.

Harness throughout: Node, the core's world on Rapier. A cell is a hand (right is rear, left is
lead) at the competency's place or at full reach; speeds are over the last 10 cm.

## A layer on the tracked arm

A prototype, behind one setting (`drive`), on the planted cross: the trunk turned the right way,
the arm aimed from the actual trunk (`fromActual`), a deeper chamber (`windup` to 0.37 m, `torso`
to 0.6 rad), `thoracic rotation right` pushed flat out in the swing, timed as an evenly
accelerating fist. On `punchStand` (`research/punch-calibration.mjs`), the competency's cells, seeds
0 and 1, 8 s of blows:

| Cell, 120 Hz unless named | Landed / thrown | Mean, m/s |
|---|---|---|
| Warrior, today's cross | 38/55 | 4.84 |
| Warrior, drive 1, torso 0.43, windup 0.3, contact 7.5 m/s | 0/32 | - |
| Warrior 480 Hz, the same | 0/32 | - |
| Rogue, the same | 0/31 | - |

**A foot rolls.** A committed stroke ends when its bearing support fails (`bearingSupport`,
`src/core/control/support-readiness.ts`). Every driven swing ended so, a foot's corners off flat
0.08 to 0.13 s after launch, at every drive from 0.2 to 1 and even at 0.001.

**With that rule bypassed** (a diagnostic), the fist still does not get there: at most 10 of 35
land, at 4.2 to 5.3 m/s. The fist peaks at 5.8 to 6.2 m/s. A trunk turned through to the far
side carries it across the target, 0.19 m off, with the shoulder and elbow at their bounds; a
trunk unwound only to square turns at 1.5 rad/s and the arm reaches full extension 0.26 m short. A
boxer's cross turns the trunk at 11.6 rad/s and the pelvis at 10.4, with the hand at 8.5 m/s
(PMC11466798).

## The greedy solve

`research/greedy-punch.mjs` asks the spike's whole-body solve each step to drive the fist along
the line to 0.2 m past the target at `push` m/s², with no path and no set time; the base holds
the mass centre over the soles. Picked on the Warrior's right hand at the place: `push` 240, a
0.25 m run-up drawn back first, the arm and trunk guard goals let go, and the spike's pelvis and
chest turns on. At 320 and above the line swamps the base, the solve rejects steps and the body
falls.

Two sets of muscle curves: today's (the trunk and the hip's other freedoms borrow hip flexion's,
unloaded 8.86 rad/s), and the elbow's rule on Anderson's points (Thelen's curvature 0.25, unloaded
27.2 rad/s at the trunk and hip), built for this run only.

| Cell, three blows a hand and cell | Landed | Mean, m/s | Fastest | Latency, s |
|---|---|---|---|---|
| Warrior 120 Hz, today's curves | 10/12 | 4.60 | 5.87 | 0.20 |
| Warrior 480 Hz, today's curves | 8/12 | 3.77 | 4.33 | 0.18 |
| Rogue 120 Hz, today's curves | 12/12 | 3.17 | 3.63 | 0.24 |
| Warrior 120 Hz, the elbow's rule | 12/12 | 4.42 | 5.68 | 0.22 |
| Rogue 120 Hz, the elbow's rule | 12/12 | 3.43 | 3.70 | 0.24 |

No cell comes near 6.8 m/s. **Why:** the fist reaches 5.4 m/s 0.08 s into the drive, then slows
to 4.3 m/s by contact as the elbow straightens; the thoracic joint turns 0.3 rad in all, never
faster than 6.5 rad/s. A solve that asks for the most acceleration of the fist now takes it from
the arm, which gives it soonest, and never turns the trunk early. (A trial with the pad moved
aside falls, because nothing stops a blow that meets no pad for 0.45 s.)

## The body's ceiling

`research/punch-ceiling.mjs` lays flat-out pushes on 18 channels of the guard (the trunk's four,
each hip's three, each knee and ankle, the striking shoulder's three and its elbow), each with a
level, a start and a length, and diagonal CMA-ES searches them. A blow counts if the strike point
reaches the pad's face within its bounds within 0.5 s and the body is up 0.3 s later; straight
means its last 10 cm come within 20° of the face's normal. The schedules are a measuring stick,
not a skill. Each cell was searched on several seeds and read again at 480 Hz.

| Cell, at 480 Hz, m/s | Straight, today's curves | Straight, the elbow's rule | Any angle, today's |
|---|---|---|---|
| Warrior, right, place | 9.57† | 9.27 | 11.07 |
| Warrior, right, full reach | 7.14 | 7.29 | 13.54† |
| Warrior, left, place | 7.36 | 8.80† | 10.97 |
| Rogue, right, place | 10.47 | 11.97 | 10.47 |
| Rogue, right, full reach | 7.06 | 7.55 | 8.51 |

† counts only at a lower rate (it came in just past 20°, or just outside the face). Each figure
is a floor: seeds disagree by up to half (5.41 and 8.20 for the Warrior's straight right at the
place). The lead hand's 7.36 m/s lands 0.49 s after the order. The Warrior's right hand at the
place lands straight at 7.3 to 7.7 m/s within 0.3 s.

**Every fast blow winds up first**: over 0.25 to 0.4 s the fist is drawn back or up while the
chest goes 13 to 20 cm forward and the pelvis back, then the elbow and shoulder throw the arm
straight in the last 0.05 to 0.1 s. The fastest any-angle blows are chops that come down across
the face, which the competency's bar counts.

**The curves** differ by less than the seeds do; the trunk's and hip's unloaded speeds do not set
the ceiling.

## What a blow is worth

`research/punch-objective.mjs` prices a fist on a Warrior's head in guard as the arena does: each
side meets what its body gives with its muscles holding (`ContactMass.yielding`; the head 7.0 to
7.8 kg), for the time their surfaces take (`contactGive`, about 10 ms); the fist takes 62 % of the
energy and pays it less its threshold (`Rulebook.fist`, 36.8 J). The exchange, head HP lost less
fist HP lost, peaks at 0.22 HP at a 59 J blow; a hand comes off at about 80 J.

Searched on the exchange (`punch-ceiling.mjs --score damage`), the best blows meet 0.3 to 0.9 kg
and take 0.008 to 0.036 HP (0.047 at best, 240 Hz).

**The fist's mass is the arm's alignment.** The Warrior's right arm, shoulder flexed 90°, pushed
along +z through the strike point, no gravity:

| Arm | Free, kg | Muscles held at peak, kg | J at 9.14 m/s | Head HP |
|---|---|---|---|---|
| straight, wrist on line | 6.15 | 15.9 | 207 | 0.78 |
| elbow 9° short of straight | 3.57 | 8.3 | 161 | 0.61 |
| elbow 20° short | 1.42 | 2.7 | 82 | 0.31 |
| straight, wrist 23° off | 1.08 to 1.44 | 2.2 to 2.7 | 70 to 82 | 0.27 to 0.31 |
| elbow 49° short | 0.40 | 0.67 | 26 | 0.10 |

Straight is the elbow's range end, -0.86 rad. A boxer's 2.9 kg at 9.14 m/s (Walilko, Viano and
Bir 2005) is the elbow about 20° short. The searched blows land 35 to 50° short: the trunk carries
the fist to the face while the elbow is still opening. How the muscles hold changes the fist's
mass by under 10 %.

## The straight punch in the game

`straightPunch` (`src/core/skills/straight-punch.ts`) walks to a stand-off, faces the target,
drives the hips, the chest's turn, the trunk's lean and every arm channel flat out at a contact
pose its arm IK solves each step (the arm straight through the target, the wrist on the line),
then returns to guard. Its 15 settings were searched by CMA in Arena bouts
(`research/punch-in-bout.mjs`); the stand-off is a share of the arm's straight length, 0.9 in the
game. Bare-handed, Node, Rapier, 120 Hz, on gaps the search never saw:

| Puncher | Foe | Bouts | HP given | HP taken | Thrown | Lost | Won |
|---|---|---|---|---|---|---|---|
| recipe strike (Classic) | standing in guard | 8 | 0.10 | 0.02 | 0.9 | 0 | - |
| straight punch | standing in guard | 8 | 1.65 | 0.04 | 12.1 | 0 | 3 |
| straight punch | Classic | 16 | 0.82 | 0.27 | 10.3 | 1 | 3 |

Most damage lands on the chest, past the guard over the head (the head takes 0.01 to 0.04 HP a
bout). A wounding fist meets 0.9 to 1.5 kg at 2.5 to 7 m/s, the elbow 0 to 1 rad, 0.03 to 0.09 s
into the drive: it meets the chest before the arm has opened. A longer stand-off, the arm held
behind the trunk, or an aim at the chest does not wound more.

## Open choices

- **A controller that looks ahead**: the whole-body solve over a horizon, solved again each step,
  or a policy trained against the exchange. The one-step solve already costs 2.2 to 2.8 ms a body
  a step, and a horizon multiplies it.
- **The competency's angle**: whether a blow counts only if it comes in straight, and at what
  angle; with it, the fastest chop no longer passes.
- **The head behind the guard**: the punch aims at the head and lands on the chest; a punch that
  reaches the head has to go around or over the guard.
- **The fist's threshold against a head**: at 36.8 J and a 62 % share the exchange stops paying at
  59 J, and a boxer's blow costs the hand.
- **How a punch is searched**: against Classic one fall decides a bout, so a candidate needs 16 or
  more bouts, or bouts that go on after a fall (`&recovery=`).
