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
- **On the Strike drill a straight blow reaches the bar from the guard only on a faster body**:
  at the curves read it makes 6.0 to 6.2 m/s with the trunk bowed to its range end, the elbow no
  faster than its muscles' curve allows; with the arms and trunk at 2.5 times the curves read, a
  punch of a punch's form lands at 120 and 480 Hz, in its own cell alone
  ([a timed punch on the drill](#a-timed-punch-on-the-drill), [the punch's body](../reference/punch-body.md)).
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

## On the Strike drill

The `strike` drill's rung 0 (`still`, record `2026-10-24-43b15ceb`; Node, Rapier, 120 Hz) gives the
Puncher's straight punch no blow at 6.8 m/s: it starts only 0.6 to 0.7 m from the target, centre to
centre (its stand-off, `reach` 0.8 of the arm, ±0.05 m), and its 8 touches on the mark close at
1.4 to 4.4 m/s. Traced at 0.7 m, right hand:

- **The guards touch first.** The striker's guard hand meets the target's 0.06 s into the drive,
  and the punching forearm strikes the target's guard hand before the fist reaches the chest.
- **The fist starts from rest and meets the target half open.** It reaches 3.5 to 4.0 m/s 0.12 s
  after the drive begins, then contact, the hand about 0.44 m from the upper arm of its 0.5 m;
  nothing winds up first.

The owner watched the Puncher's and the Duellist's reels: the two stand very close, and the punch
looks awkward and does not land.

## A timed punch on the drill

The Punch plan's step 2 asked whether a straight, aligned blow at the bar exists from the guard.
**On today's body, no; with a faster elbow, only a chop from overhead, and only at 120 Hz.**

`research/punch-drill.mjs` searches the Puncher's straight punch with its drive on a schedule
(`StraightPunch.timed`: the trunk's, both legs' and the striking arm's 18 channels, each a level,
a start and a length; the gap, the arm's aim and, in two runs, the posture beneath) by CMA. Each
candidate is a trial of the drill's still rung (the Warrior's right hand, the middle mark), scored
by the bar. Node, Rapier, 120 Hz; the best are read again at 480 Hz.

| Run | Gap, m | Speed, m/s | Mass, kg | Straight, cos | Contact, s | At 480 Hz |
|---|---|---|---|---|---|---|
| seed 1, 60 generations | 0.84 | 6.01 | 2.81 | 0.935 | 0.47 | 5.61 m/s, 2.35 kg, 0.639 |
| seed 2, 80 generations | 0.98 | 6.24 | 2.02 | 0.932 | 0.26 | 5.90 m/s, 1.57 kg, 0.948 |
| seed 3 from seed 1, 80 generations | 0.84 | 6.01 | 2.81 | 0.935 | 0.47 | as seed 1 |
| target 0.2 m to the right, posture searched, 15 generations | 0.83 | 4.01 | 1.85 | 0.943 | 0.13 | - |
| from seed 2, posture searched, 25 generations | 1.09 | 5.19 | 2.34 | 0.983 | 0.33 | - |

**No blow meets the bar** (6.8 m/s, 2.12 kg, within 20°, within 0.5 s). The best come 0.6 to 0.8
m/s short, and are slower at 480 Hz. **Nor do they look like a punch.** Seed 2's best bends the
lumbar spine to the end of its range (0.89 rad) to carry the fist in. At contact the elbow is
still 82° short of straight, and the forearm meets the target's guard hand as the fist meets the
chest.

**The elbow limits the fist's speed.** The fist gains its last speed as the elbow opens, and the
elbow opens at 13 to 17 rad/s. There its extensors give a sixth to a tenth of their isometric
torque. Boxers' straight punches open the elbow at 22 to 41 rad/s: 32.9 rad/s for professionals
(Gait Posture 49S, 2016, "Peak joint angular velocities of the straight punch in professional
boxers"). The model's elbow extension is Frey-Law's column (60 to 300 deg/s, up to 5.2 rad/s) on
Thelen's curvature 0.25. That puts its unloaded speed at 25.5 rad/s, so a person's punch is past
what the model's muscles can turn.

Frey-Law's points fix the curve near rest, not at its end. A flatter curve fits them as well or
better, with 1.5 to 3 times the torque at 15 to 20 rad/s:

| Curvature | Unloaded, rad/s | Fit, rms of the shares | N m at 10 rad/s | at 15 | at 20 |
|---|---|---|---|---|---|
| 0.05 | 94.8 | 0.030 | 15.2 | 10.7 | 8.0 |
| 0.1 | 51.5 | 0.032 | 14.5 | 9.6 | 6.6 |
| 0.1755, unloaded at the boxers' 32.9 rad/s | 32.9 | 0.035 | 13.4 | 8.0 | 4.6 |
| 0.25 (the model's) | 25.5 | 0.037 | 12.5 | 6.5 | 2.8 |

**With a faster elbow, the search finds a chop.** These runs used a scratch worktree that set the
elbow's curvature; nothing of it is kept. The shoulder borrows the elbow flexors' curve, so it
moved with them.

| Arm curves | Run | Outcome | Speed, m/s | Mass, kg | Straight | Contact, s |
|---|---|---|---|---|---|---|
| curvature 0.1 | from seed 2, 60 generations | weak | 6.58 | 2.49 | 0.961 | 0.21 |
| curvature 0.1 | 40 more generations | weak | 6.66 | 2.13 | 0.997 | 0.20 |
| elbow unloaded at 32.9 rad/s both ways (extension 0.1755, flexion 0.1319) | from the above, 40 generations | **landed** | 7.86 | 2.27 | 0.963 | 0.31 |
| the same, read at 480 Hz | | weak | 6.19 | 1.90 | 0.891 | 0.31 |

The landed blow is no punch. The shoulder flexes to 2.17 rad and lifts the fist to 1.62 m, above
the head. The fist then comes down onto the chest, with the lumbar spine bent 0.76 rad and the
elbow 69° short of straight. Every run's best bends the lumbar spine to near its range end. The
bar's straight test reads only the fist's last 0.1 m against the contact's normal, so a chop
onto the chest's capsule counts. The drill cannot tell a chop from a punch; only the owner's eye
can.

**What it took.** The arms, trunk and neck at 2.5 times the curves read, and a bar that reads a
punch's form: the fist's last 0.1 m more along the arm than across it, the elbow within 30° of
straight, the chest within 30° of upright. The trunk's turn was left as it is: twice and four
times its torque gained nothing ([the punch's body](../reference/punch-body.md)). Near a straight
elbow the forearm opens mostly across the arm's line (at 30° short, three quarters across), so
the fist's path keeps to the line only as far as the shoulder carries it; a 20° cone failed every
fast blow found.

## Across places

The Punch plan's step 4 asks for a punch that lands off its own cell. **A timed punch's landing
band is a few centimetres of range**: open-loop, it lands where its trunk puts the shoulder an arm's
length from the target as the elbow straightens, and the bar leaves little room there. With the
elbow within 30° of straight the shoulder-to-fist length changes 2 cm (0.628 to 0.65 m on the
Warrior), so the shoulder at contact must be within about 2 cm of where it was found. Searches by
`research/punch-drill.mjs`, the Warrior's right hand at the middle mark, Node, Rapier:

| Search | Places | Landed |
|---|---|---|
| from the reference punch, scored by the mean over places | 12: the Warrior and the Rogue, three gaps each, square on and 0.1 m across | 0 |
| the same, the arm opened at a distance (`fire`) | 12 | 1 |
| the schedule held, its time scale, shift, aim and posture tuned per place | 1 each | none off the reference's place |
| scored by each test's room inside the bar, capped (`scoreOf`) | the Warrior at 0.92, 0.94 and 0.96 m, square and 0.1 m across, 120 Hz | 5 of 6 |
| the same, both rates | 0.93 and 0.95 m, square and 0.1 m across | 2 of 4 |
| the same, eased (`ease` searched), each push its share of a step, `fire` searched | 0.91, 0.93, 0.95 and 0.97 m, square, both rates | 2 of 4; read at 0.89 to 1.01 m, it lands from 0.93 to 0.97 m at 120 Hz and from 0.95 to 0.97 m at 480 Hz |

What narrows it:

- **The arm chattered on its line.** The shoulder's channels were pushed flat out at a goal that
  moves each step, so they overshot it each step: near contact the fist's heading turned by 20 to 50°
  from one step to the next, and whether its last 0.1 m came in within 20° of the normal was luck.
  Eased onto its goals (`StraightPunch.ease`, 0.05 rad), the same schedule's fist meets the chest at
  every gap from 0.91 to 0.97 m with the elbow within 30° of straight; searched with it, at 120 Hz it
  lands from 0.93 to 0.96 m.
- **The schedule ran on whole steps.** A push began and ended on a control step, 8.3 ms at 120 Hz,
  so 120 and 480 Hz played different schedules. A push now covers its share of a step.
- **Nearer, the elbow meets the target bent**; further, the arm is straight before contact and the
  fist slows below the bar, or meets the guard. A distance trigger (`fire`) opens the arm earlier
  when nearer, but the earlier blow meets lighter (0.8 kg at 0.91 m).
- **The lean cannot be taken off the schedule**: pushed at a goal instead, the punch's timing comes
  apart at every gap.

**A policy over the schedule widens it.** The punch steered (`StraightPunch.steered`,
`src/core/skills/learned-punch.ts`): 60 times a second through the drive a network reads the
drive's age, the target from the shoulder, the fist from the target, the fist's and the centre of
mass's velocity, whether the hand touches, and the trunk's, legs' and arm's angles and speeds, and
adds a level to each push the schedule or the contact pose is making (a channel not being pushed
stays with the posture or the stance: a push of any level takes it from them, and with it every
punch). Trained by PPO (`research/run-train.py` on `research/punch-learning-environment.mjs`)
from the schedule above, on the Warrior's two hands, gaps 0.86 to 1.04 m and 0 to 0.15 m across,
each episode a drill trial loaded at the drive's first step and scored by the bar. Read whole
(the trial played out, falls counted) on 60 places training never drew
(`research/punch-policy-check.mjs`, seed 1001):

| Punch | 120 Hz landed | 480 Hz landed | Fell |
|---|---|---|---|
| the schedule alone | 8 of 60 | 2 of 60 | 0 |
| steered, trained 2 M decisions at 120 Hz | 35 of 60; 33 of the 39 at 0.86 to 0.98 m | 9 of 60 | 0 |
| the same, 1 M more with half its episodes at 480 Hz | 33 of 60 | 24 of 60 | 0 |

Past 0.98 m the fist does not reach at the bar steered or not.

The last network, played as the core plays it (`learned: true`, `assets/core/learned-punch.json`),
admitted 0.90 to 0.98 m from the target, to 0.3 m either side of the line it faces and no higher
than 0.1 m over the shoulder, on the still rung (Node, Rapier, 120 Hz, the Warrior only, not
recorded): 8 of 64 trials thrown, 4 landed at 6.9 to 7.7 m/s and 3.2 to 5.0 kg, none fell. The
four not landed were thrown at 1.0 m or 0.2 m across, where the body had swayed into the window
after it settled. The high mark is refused: its point is 0.2 to 0.28 m over the shoulder on
both bodies, the middle mark's 0.12 m under it to level, and the schedule thrown at it meets the
chest at 7 to 8.7 m/s. Searched for the high mark from it (`punch-drill.mjs --mark high --near`,
the Warrior's rear hand at 0.91 to 0.99 m, 120 and 480 Hz), the best schedule meets the head at
6.3 m/s but coming down onto its crown, 79° off the surface's normal and 84° off the arm's line:
the guard covers the face, and the open lane over it is the top of the head, which a straight
punch cannot meet square.

### Both bodies and fight moments

Trained on: still targets for both bodies, and the fight rung's moments 1 to 8 against its seven
foes, the half not held out by a digest of each moment's condition. Each body's punch is admitted
in a window of its own. The features add the target's velocity. Read on held-out trials (Node,
Rapier, `punch-policy-check.mjs`, seed 1001): 80 still places across both bodies, and the 28 held-out
moments of each body at the middle mark:

| Network | Warrior still, 0.90 to 0.98 m: 120 / 480 Hz | Rogue still: 120 / 480 Hz | Fights: 120 / 480 Hz | Fell |
|---|---|---|---|---|
| 4.0 M decisions, the Rogue trained at 0.72 to 0.96 m | 12 of 16 / 4 of 16 | 0 of 41 / 0 of 41 | 0 of 56 / 0 of 56 | 2 |
| 5.0 M, the Rogue at 0.77 to 0.88 m, the target's velocity read | 14 of 16 / 7 of 16 | 1 of 41 / 2 of 41 | 0 of 56 / 0 of 56 | 2 |

- **At 480 Hz the elbow meets the target more bent**: the Warrior's blows that land at 120 Hz meet
  it 0.35 to 0.45 rad short of straight, and at 480 Hz the same places 0.4 to 0.8 rad, where the
  fist meets 0.7 to 2.3 kg instead of 3 to 7.
- **The Rogue's blow is light**: its body is 57.6 kg to the Warrior's 79.0, its arm 0.65 times as
  heavy. Its schedules reach its straight arm only from 0.84 to 0.88 m, and meet 1.2 to 1.9 kg
  there, its fist's line 45° or more off the arm's (`along`). Searched at 0.79 to 0.83 m or 0.88 to
  0.92 m (`--heavier 3`), no schedule passes: nearer, the elbow meets the target 0.6 to 0.9 rad
  short of straight and 0.3 kg; farther, the fist arrives below 6.5 m/s or not at all.
- **In a fight the foe comes on**: the punch is admitted at its window's near edge, and the foe
  closes during the 0.2 s before contact: the fist meets the guard or the trunk with the elbow
  0.8 to 1.5 rad short of straight, 0.5 to 1.9 kg, often at 7 to 8.8 m/s.

### Why the two rates part

Read on the still rung (Node, Rapier, the Warrior's rear hand, `research/punch-drill.mjs --verify`):

- **The sweet spot is about 2 cm deep.** The arm's two segments make the elbow's bend at contact
  a steep function of the shoulder's distance from the target: 2 cm nearer moves it about 0.27 rad.
  A schedule lands over a few centimetres of gap and no more: the one searched at 480 Hz across
  0.92 to 0.96 m meets the target 0.76, 0.49, 0.39 and 0.18 rad short of straight at 0.90, 0.92,
  0.94 and 0.96 m.
- **`ease` is what the rates disagree on.** It sets each push's level from the error left, read once
  a control step; at 120 Hz the shoulder runs ahead and the fist reaches the target 2 cm sooner, the
  elbow 0.2 rad more bent. With `brake` in its place (flat out, then the posture's servo near the
  goal, solved within the step) the two rates' bends at contact agree to 0.1 rad at 0.93 and 0.96 m.
- **The mass a fist meets is its holds'.** With every joint free it meets 0.45 to 2.6 kg, alike at
  both rates; the muscles' holds make it 0.9 to 9.2 kg at 120 Hz and 1.1 to 5.5 kg at 480, differently
  at the same gap. On the touch step the elbow is still opening at 35 to 63 rad/s, where its
  muscles' ceiling is 0.2 to 8 N m, so which step the touch falls on decides the hold.
- **Tried and not kept**: holds at no less than the activation's isometric strength (raises every
  mass, 1.1 to 3 times, and leaves the rates apart); holds that decay over a deactivation time of 20
  or 40 ms (likewise); the arm's push kept full within 3 to 10 cm of the target (no change).
- **In a fight the fist meets the guard or comes too close**: of the Warrior's 28 held-out moments
  at 120 Hz, 11 meet the foe's hands or forearms first; at moments the tactics ask from 0.35 to 0.5 m
  apart the fist is on the foe as the drive begins; where both close at 1.4 m/s the blow comes 0.4
  s later on the thigh or the belly.

## On the fight rung

The Strike drill's `fight` rung (record `2026-10-24-9047625b-070af15a`; Node, Rapier, 120 Hz)
throws each strike in place of its mind's own first to fourth action, in that mind's bout against
seven game minds. No strike lands at the bar:

| Strike | Weak | Elsewhere | Missed | Outside | Unreached | Fell | Abandoned |
|---|---|---|---|---|---|---|---|
| puncher/strike | 48 | 112 | 10 | 22 | 32 | 0 | 0 |
| scrapper/straight | 47 | 134 | 38 | 5 | 0 | 0 | 0 |
| scrapper/cross | 34 | 136 | 49 | 5 | 0 | 0 | 0 |
| duellist/swing high | 116 | 82 | 3 | 10 | 8 | 3 | 2 |
| vanguard-warrior/strike | 45 | 57 | 9 | 1 | 0 | 0 | 0 |

"Elsewhere" is mostly the foe's guard. "Unreached" is a fight that never came to its third or
fourth action within 30 s.

## Open choices

- **A controller that looks ahead**: the whole-body solve over a horizon, solved again each step,
  or a policy trained against the exchange. The one-step solve already costs 2.2 to 2.8 ms a body
  a step, and a horizon multiplies it.
- **The competency's angle**: whether a blow counts only if it comes in straight, and at what
  angle; with it, the fastest chop no longer passes.
- **The mass bar for a lighter body**: the bar's 2.1 kg is an adult's from Adamec; the Rogue
  weighs 0.73 of the Warrior and its arm 0.65, and the most any of its schedules meets is 2.1 kg.
  Whether the bar scales with the striker's mass decides whether the Rogue has a punch at the bar.
- **The head behind the guard**: the punch aims at the head and lands on the chest; a punch that
  reaches the head has to go around or over the guard.
- **The fist's threshold against a head**: at 36.8 J and a 62 % share the exchange stops paying at
  59 J, and a boxer's blow costs the hand.
- **How a punch is searched**: against Classic one fall decides a bout, so a candidate needs 16 or
  more bouts, or bouts that go on after a fall (`&recovery=`).
