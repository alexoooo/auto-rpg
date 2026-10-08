# What holds the punch and the rise below a person's

The question: how far the Warrior's punch and rise are from a person's, and whether the body or
the controller holds them there. This study is open, for the choices at its end. Its
[probes, experiment patches and raw rows](2026-10-08-punch-and-rise-speed.json) run against code
at `38cdc1cb` (the body as `83c3540c` built it), each from a copy of the tree with the named
patch applied, and the capacity and push searches at `f55820e1` (the same `src/`) unpatched; no
experiment is installed.

Harnesses: the punch cells are `punchStand` (`research/punch-calibration.mjs`), right hand,
compliant pad, planted execution, 960 Hz, rapier-coordinate. The flat-out probes are the combat
guard stand (`tests/harness/core-stand.mjs`) at the game's 120 Hz. The rise is the battery
(`research/core-rise.mjs`), the Warrior alone, 16 shoves a loadout, each watched 40 s, 120 Hz,
under the staged rise.

## Where they stand

A person's punch: 8 m/s and 22.8 N s (Adamec, `HUMAN_PUNCH`), 17.2 N s trained (Vagner); a
boxer's cross brings the hand to 8.5 m/s with the pelvis at 10.4 rad/s and the trunk at 11.6
(PMC11466798). The Warrior's best qualified cells reach 5 m/s and 6.6 to 7.1 N s, with an
effective mass of 1.3 to 1.45 kg. Its rise takes a median 22 to 26 s; a person's is a few
seconds (not sourced here).

## The punch

The punch cells in the two tables below run with the cross's trunk turned the right way and the
arm aimed from its actual trunk (the change described under [The cross's trunk](#the-crosss-trunk)).
The capacity and push searches after them run on the code as it is, unpatched.

**The hip's and the trunk's speed.** Hip extension's Hill curve, solved through Anderson 2007's
two points, falls to zero at 6.5 rad/s with a curvature of 22.7: nearly a straight line,
extrapolated from points at 1.6 and 3.2 rad/s. Hip flexion's ends at 8.9 rad/s, and the trunk,
the neck and the hip's other freedoms borrow it (`BORROWED`, `src/core/human/speed.ts`). The
elbow's own rule (Thelen's curvature, the unloaded speed fitted by least squares) applied to
the same two points gives hip extension 20.4 rad/s and flexion 27.2; knee extension's rises from
20 to 24 and the dorsiflexors' falls from 17 to 12. With the stance and the arm commanded as the game
commands them, the punch does not notice:

| cell | torso, rad | heading, rad | speed, m/s (6.5/8.9) | impulse, N s | speed (20.4/27.2) | impulse |
|---|---|---|---|---|---|---|
| straight, defaults | - | 0 | 4.49 | 3.89 | 4.73 | 4.07 |
| cross, defaults | - | 0 | 5.05 | 4.39 | 5.11 | 4.25 |
| cross, searched | 0.122 | 0 | 4.98 | 6.65 | 4.97 | 6.62 |
| cross, searched, further | 0.122 | -0.4 | 4.89 | 7.09 | 5.04 | 7.31 |
| cross, searched | 0.3 | 0 | 4.37 | 5.07 | 4.74 | 5.34 |
| cross, searched | 0.43 | 0 | 4.27 | 4.83 | 3.90 | 4.62 |

The upper arm's forward speed peaks at 1.1 to 1.9 m/s in both. Under this controller the curve does
not bind; it would bind one that drove the hip and trunk near their unloaded speed.

**The stance's turn.** The stance turns the pelvis to its heading critically damped at 0.15 s
(`STANCE_SECONDS.turn`): a turn of 0.4 rad peaks near 1 rad/s, a tenth of a boxer's pelvis.
Faster turns, with the heading turned through the chamber and swing, give nothing:

| turn, s | heading, rad | impacts | speed, m/s | impulse, N s | faults |
|---|---|---|---|---|---|
| 0.15 | 0 | 8 | 4.98 | 6.65 | |
| 0.15 | -0.3 | 7 | 4.60 | 6.97 | |
| 0.15 | -0.6 | 5 | 4.39 | 4.58 | |
| 0.06 | 0 | 7 | 4.49 | 6.05 | |
| 0.06 | -0.3 | 2 | 4.36 | 6.58 | fall |
| 0.06 | -0.6 | 1 | 4.16 | 6.09 | too few impacts |
| 0.03 | 0 | 3 | 4.56 | 6.32 | |
| 0.03 | -0.3 | 5 | 4.87 | 6.22 | |
| 0.03 | -0.6 | 2 | 4.54 | 7.86 | failed cycle |

In these cells the turn upsets the base more than it speeds the hand.

**A released stance chatters.** With the stance released (`stance: null`) on planted feet and
nothing pushed, the posture servo drives lumbar flexion and both hips' flexion into a two-step
oscillation at 120 Hz: their speeds reverse sign above 5 rad/s on 81 of 84 steps, and lumbar
lateral flexion and hip abduction on more than half. With the stance kept, no channel does. The servo takes the
root to be held (`servo`, `src/core/control/servo.ts`); on planted feet a free pelvis is far
lighter than that, which would make its computed torques overshoot each step. That cause is a
hypothesis; the chatter is measured. Every probe that released the stance is void on that
account: hand-timed hip and trunk pushes, and a flat-out search over 18 channels' push
schedules, which found a 10 m/s hand at shoulder height by riding this chatter (trunk freedoms
reversing at 14 to 17 rad/s against an unloaded speed of 8.9).

**What the body can do, the stance kept.** A flat-out search on the combat guard stand with the
stance kept (`cap-opt.mjs`, `cap-eval.mjs`: 18 channels' push levels, starts and lengths from
the trunk, legs and right arm, diagonal CMA-ES, 70 generations at 120 Hz) scores the hand's
forward speed at shoulder height, in the punch lane (x -0.1 to 0.35 m), more than 0.3 m ahead of
the trunk, the trunk up. No channel chatters with the stance kept. Its best schedule, run again
at each rate (time from 2 s into the stand, where the schedule's clock starts):

| rate, Hz | hand, m/s | wrist, m/s | hand at (x, y, z), m | time, s |
|---|---|---|---|---|
| 120 | 12.72 | 10.12 | 0.27, 1.57, 0.38 | 0.258 |
| 480 | 12.57 | 10.09 | 0.28, 1.57, 0.39 | 0.252 |
| 960 | 12.37 | 9.78 | 0.27, 1.60, 0.40 | 0.252 |

The wrist is the hand's joint (the hand segment's origin), its speed read from its travel each
step: the arm without the hand's own flail. The schedule is a cross: the trunk turned to bring the
right shoulder forward (thoracic rotation pushed left at 0.86), the lumbar spine flexed (0.9),
the shoulder flexed (0.9) and the elbow extended (0.78), with the legs braced. It is a whip:
the elbow extends near 30 rad/s against an unloaded speed of 25.5, and the wrist's freedoms pass
twice theirs, carried by the segments behind them. The arm reaches a boxer's hand speed with the
body's own muscles. Nothing struck in this search, and its hand arrives with a loose wrist: it
measures what the body can move, not a blow.

**Pushes on the game's cross, for impulse.** The same search over the punch cell, the game's
cross as it stands at `f55820e1` (its trunk turning the way described below), with nine channels
of the trunk and right arm pushed on a schedule timed from the swing (`punch-opt.mjs`,
`cell-fn.mjs`), scored by the pad's mean impulse over qualified impacts. Scored at 120 Hz, the
search found 14.8 N s that read 3.1 at 960 Hz: the coarse rate's contact is what it learned.
Scored at 480 Hz, its best read 16.4 N s there and one impact at 960 Hz. Scored at the worse of
480 and 960 Hz (25 generations of 28, started from the 480 Hz search's mean), its best reads
14.3 and 15.0, and nearby it falls apart; its final mean holds:

| schedule | 240 Hz | 960 Hz | 960 Hz, pad 2 cm nearer | 960 Hz, 2 cm further | 1920 Hz |
|---|---|---|---|---|---|
| none | 6.19 (7) | 4.50 (8) | 4.05 (8) | 4.48 (8) | 3.62 (7) |
| best | 11.28 (3) | 14.95 (3) | 9.56 (3), failed cycle | 16.06 (1) | 12.15 (3), pad stroke |
| mean | 11.26 (1) | 7.90 (3) | 6.60 (5) | 9.92 (3) | 8.01 (5) |

Impulse in N s (qualified impacts). The mean schedule leans the trunk forward (thoracic flexion
at 0.52) and drives the shoulder in and the elbow out at the swing's start; the hand is no faster
(4.0 to 4.2 m/s) and the effective mass rises from about 1 kg to 1.6 to 2.5. Pushes laid on
today's cross nearly double its impulse and leave its speed, at a third of a trained person's
17.2 N s. Two cautions for every impulse figure here: it still moves with the rate between 960
and 1920 Hz (4.50 to 3.62 with nothing pushed), and a schedule scored on one cell is fragile to
a cell 2 cm away.

**The cell's distance holds its speed.** Laid on the cross in the cell (18 channels from the
capacity search's best, scored by the impacts' speed at the worse of 480 and 960 Hz), pushes
reach 4.7 m/s and stop there (seven generations; the search was stopped). The hand starts its
swing 0.3 m from the pad: in the guard its centre is at z 0.25 to 0.31, it meets the pad's face
at 0.44 (the fist at 0.52), and in that distance the flat-out arm reaches 4.5 m/s. The planted
cross does not reach a pad at 0.75. So the capacity search was asked again with a gate in
place of the lane: the hand's forward speed when its centre first reaches a plane, scored only
within 0.1 m of (0.1, 1.55) with the trunk up. Each search ran 40 generations at 120 Hz with the
stance kept; its best, run again at each rate:

| start | gate, z | 120 Hz | 480 Hz | 960 Hz | wrist, 960 Hz | at, s |
|---|---|---|---|---|---|---|
| the guard | 0.45, the pad's | 6.62 | 6.00 | 6.08 | 5.79 | 0.283 |
| the guard | 0.55, full reach | 8.73 | 8.58 | 8.60 | 7.64 | 0.330 |
| a quarter second's wind-up | 0.45, the pad's | 12.00 | 11.99 | 12.11 | 9.48 | 0.283 |

Hand speeds in m/s. From the guard, with nothing before the clock starts, the body brings the
hand to a boxer's 8.5 m/s at full reach in a third of a second; to the pad's place, 6. The
wind-up draws the hand 0.37 m behind the guard while the trunk turns the right shoulder back,
then unwinds the trunk, flexes the lumbar spine 0.89 rad and throws the elbow straight: a
lunging whip, not a boxer's cross, but it says what the distance gives. The cell's pad is nearer
than a cross lands, and a blow aimed nearer than full reach is slow by geometry before any
controller is asked.

## The rise

No freedom chatters in any stage of a staged rise (a Warrior felled at 0 degrees: under 0.25
reversals a step in its settle, none after). The rise's time is its script's: that Warrior
spends 19.1 s in its stages, settle included, before it stands, 60 % of it in pose stages of a
set time. Scaling every pose stage's time:

| pose times | club: rose of fell | median s | empty: rose of fell | median s |
|---|---|---|---|---|
| 1 | 9 of 14 | 25.49 | 11 of 16 | 22.32 |
| 0.75 | 9 of 14 | 21.19 | 9 of 16 | 18.41 |
| 0.5 | 0 of 14 | - | 0 of 16 | - |

A quarter comes out at a similar rate on these 16 shoves; half breaks every rise. The stages
drive toward poses at a set speed and wait to be near them; a rise in a few seconds carries
momentum from one support to the next, which this design does not.

Where a rise's time goes, timed stage by stage over the same 32 shoves (`stage-time.mjs`,
`felled` from `research/core-rise-trials.mjs` under the battery's staged-rise mind, 40 s, 120 Hz,
at `1cab92ec` unpatched; it reproduces the battery's 11 of 16 at a median 22.33 s and 9 of 14 at
25.49 s). Medians over the rises that stood, s:

| part | empty | club |
|---|---|---|
| settle, lying still before it begins | 3.42 | 4.12 |
| roll, onto the front | 3.00 | 3.00 |
| onto all fours (fold, tuck, prop: poses) | 4.50 | 6.18 |
| all fours (bearing) | 1.40 | 1.15 |
| kneel up (sit to tall: poses) | 5.55 | 5.55 |
| the step through (poses) | 1.62 | 1.62 |
| half kneel to standing (bearing) | 4.32 | 4.32 |
| attempts | 1 | 2 |

The pose stages alone are 14.7 s of set time, the settle another 3 to 4. A rise of a few seconds
is not this script made faster: it skips the kneel-up and the step, and goes from a hand and a
foot to standing in one motion.

## The cross's trunk

`attackPath` (`src/core/skills/attack-path.ts`) asks a cross or a hook to turn the trunk toward
its hand's side in the swing (`torso = side * tuning.torso`, read as `thoracic rotation right`):
the striking shoulder goes back as the hand goes out. The arm's goal also places the hand from
the trunk's posture angles, not where the trunk is, so a trunk that turns under a blow throws the
point off its line. Turned the other way (`torso = -side * tuning.torso`), with an effector goal
that reads its chain's held freedoms where the body has them, the stand's cells do not improve,
and the Combat self-play gate (`tests/core-combat-skill.test.mjs`) drops from at least 10 driven
blows a side to 6; each half alone gives 6. It is not installed. The recipes and tuning were
found with the trunk turning the wrong way.

## Open choices

- **A servo that does not hold the root.** `servoSolve` takes the root's acceleration, which
  the stance supplies; where the stance is released nothing does, and on planted feet that
  acceleration is the contacts' to decide. Leaving the legs to the stance's solve while the rest
  is pushed, or solving the floating root with its contacts, may end the chatter (untested); it
  is the step before a flat-out search can say what the body can do, and costs no body change.
- **An explosive punch controller.** A cross from the legs, pelvis and trunk to the hand, in
  sequence and at full effort, needs a stance that lets the pelvis turn at 10 rad/s and an arm
  path that rides it. Today's stance holds the heading and today's path ignores it. The body
  moves the wrist at 10 m/s with the stance kept, and from the guard the hand at 8.6 m/s to a
  target at full reach; pushes laid on today's path add mass to the blow and no speed. Such a
  controller throws at a target at full reach, and the punch cell's pad (0.55) is nearer.
- **The hip's and trunk's curves.** The two-point extrapolation puts the hip's unloaded speed
  below what the elbow's rule gives from the same points. Replacing it is a body change felt in
  every walk, rise and kick, and wants its before/after tables; it pays only with the controller
  above.
- **A dynamic rise.** The staged rise can lose a quarter of its time and no more; a rise near a
  person's carries momentum between supports, which is another controller.
- **The cross's trunk.** Turning it the right way is correct physically and costs the Combat
  fighter blows until its recipes are found again.
