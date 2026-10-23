# Locomotion

What each gait holds and what was tried on it and not kept. Node stand, Rapier, 120 Hz unless a line
says otherwise; a figure is read again before it is compared at another commit. How the gaits are
built is in the [architecture](../architecture.md#skills); what is open is in the
[roadmap](../roadmap.md).

## The stance's walk

The walk a fight uses. Its envelope (`assets/core/stance-envelope.json`, measured by
`research/core-stance-envelope.mjs` at `8a363623`, every body and thing held, 642 s on 8 workers)
walks the Warrior 1.7 m/s forward, 1.2 back and 0.7 to either side; the Rogue 1.4, 1 and 0.7; the
skeleton 1.5, 1.2 and 0.7, where a person's preferred walk is near 1.4 m/s (`PERSON_PACE`,
`src/core/human/gait.ts`). Its turns hold 1 rad/s at 0.2 to 0.5 m/s (the Rogue to 0.4, then 0.5),
0.25 to 0.5 at 0.7, and none at 1 m/s or faster. A turn holds at a speed only if all 28 of its
trials do, a walk if all 4 of its do: at 1 m/s a 0.25 rad/s turn stands in each of 8 trials read
alone. A dash, a roll, a crouch and turning on the spot are not built.

**Steering by it** (the crowd battery's 24 cases, then the 69 of seeds 1 to 12; shoved under orders
at 20 N s, seeds 1 to 200; at `8a363623`):

| Envelope | Falls, 24 | Done of reached | Done, s, median | Pushed apart, steps a case | Falls / not done, 69 | Shoved falls of 200, Rogue / Warrior |
|---|---:|---:|---:|---:|---:|---:|
| the one before it (0.5 m/s every way for the Warrior, 0.4 the others, turns to 4 rad/s) | 0 | 23/23 | 37.7 | 20 | 2 / 2 | 17 / 9 |
| this one | 0 | 22/23 | 25.7 | 29 | 1 / 3 | 19 / 0 |

The Rogue walks the 0.5 m/s its orders ask, where the envelope before held it to 0.4. What the walk
steers by, each found where a member at this envelope stood, walked away or fell:

- **the heading turns at the rate for the pace under way** (`LocomotionState.going`,
  `src/core/skills/locomotion.ts`): the pace asked, or one asked before it, slowing no faster than
  the walk is asked to stop (`STANCE_STOPPING`). Turned at the rate for the pace asked, a lone hero
  running at 1.8 m/s when its order reverses hands over to the walk at 0.8 with a half turn to go
  at 1 rad/s, catches 12 times in 4 s and falls. Turned at the rate for the pace the stance plans its
  steps at (`StanceReading.pace`), which reads 0.702 walking at 0.7, a member whose way is behind it
  never turns, as the envelope holds none past 0.7;
- **a heading still to turn where the envelope holds no turn at the pace asked walks at the fastest
  pace that turns** (`fastestTurning`), or it would never turn;
- **a body that faces its travel walks the way its route goes** and turns to it (`travelFacing`,
  `src/core/skills/arbiter.ts`); walked forward along the heading as it turns, a body facing away
  walks away from its waypoint, at 0.7 m/s on an arc 1.4 m across;
- **a walk the solids stop turns from its own way** (`SLIDES`, `clearMove`,
  `src/core/mind/clear-step.ts`): mirrored across the heading or sent to its sides, as it was, it
  went anywhere once the heading no longer pointed the way it went;
- **a route is found again** where the body takes more room than it was found for (less, by more
  than `NAV.margin`), and once it has stalled (`NAV.stalled`), from where it stands: a route kept
  from where it was led through a jamb, and a member stood in a doorway for good;
- **the crowd holds a walk back only for another body** (`CrowdWalk.held`), not for its gait's own
  cap: a member held so was never stalled, and waited forever.

Not done at `8a363623`: in a reversal (seed 2) a member's post lies behind two arrived members
1.3 m apart, too close to pass between; the crowd holds it, and the route search does not see
members standing. With the ankle's hold ([stance tuning](stance-tuning.md#ankle-hold)) it is done,
in 93 s; the route search still does not see them.

**What caps the turn**, from the slowest walk up (the Warrior with the club, each sense, the
envelope's 14 moments of setting off, at `827b28a6`):

- the pelvis's own turn, critically damped at `STANCE_SECONDS.turn` (0.15 s), trails a steady
  turn by twice that times its rate: 0.3 rad at 1 rad/s and 0.6 at 2, against the 0.5 a turn must
  end within;
- each step lands no further round than the hip's rotation lets the pelvis serve both feet
  (`landingHeading`, some 0.75 rad a step): at 2 or 4 rad/s the pelvis turns at most about
  1.4 rad/s, lagging 0.7 to 2.5 rad;
- from 0.5 m/s a turn starts a catch, and a catch holds the pelvis's facing through its swing
  (`StanceState.step.facing`): the body's way lags the heading, so in the frame turned to the
  heading it drifts outward, and the outside foot's next walking step would land 0.55 to 0.9 m
  across from the bearing one, past its reach (`reachablePace` finds no pace whose step it
  reaches, the body's own among them);
- at 1 m/s the path does not bend: through a half turn at 1 rad/s the way the body goes falls
  0.4 to 2 rad behind the heading while the pelvis keeps up.

Quicker steps do little: at 2 rad/s the median lag is 1.07 rad with `STANCE_GAIT`'s 0.3 s swing,
1.01 at 0.25 s and 0.77 at 0.2 s (18 trials each), short of the 0.5 a turn must keep to.

**What caps it is where the body bears.** Through each swing the realised centre of pressure stays
about 3 cm ahead of the bearing sole's middle whatever the stance asks, a braking that costs about
the fifth of the pace the walk falls short of; asking the pivot further back moves the place asked,
not the one realised. Stripping one limit at a time (the bed's `--probe`): twice the strength lifts
the forward walk about 16 %, and an assist with it to 1.4 m/s; the yaw given alone, lighter legs,
stronger ankles, 240 Hz and more friction hold no more. What lifted the pace is the swing's share of
the step: a longer swing and a shorter double support. The ankle gives 4 to 7 % of the stride's
positive work, where a person's gives about half (`research/gait-audit.mjs`).

**A catch holds the facing it began at** (`step.facing`, `src/core/control/stance.ts`). A catch's
landing is aimed facing the way the pelvis faces as it begins. A pelvis that turns on toward the
heading through the swing (a radian in a quarter second after an order a half turn round) turns
that landing out from under the body: the feet land crossed, the next step drops the hips, and the
walk runs off. With the envelope off, where falls are five times as many, 35 % of catch landings
crossed against 0.7 % of a walk's, and 53 of 66 falls came within 1.5 s of crossed feet.

The braced walk given random orders (`research/core-stance-sweep.mjs --batteries orders`: the club
in the guard, the body's own envelope, 30 s at 0.5 and 1 m/s; Node stand, rapier-coordinate,
120 Hz), trials that fell:

| Body, seeds | The pelvis turning on | The facing held |
|---|---:|---:|
| Rogue, 1 to 50 | 8 of 100 | 0 of 100 |
| Warrior, 1 to 50 | 20 of 100 | 3 of 100 |
| Warrior, 51 to 150 | 44 of 200 | 10 of 200 |

A placebo (the goal's height 1e-9 m higher) moves the first two rows' 28 to 24. The crowd battery's
falls over its 24 cases go from 10 to 4.

**What still falls**: a pelvis carried past the held facing under a catch leaves the swing foot
starting behind the bearing one, and the swing's path through the bearing leg throws the body off
the ground. Not kept, each within the placebo with the envelope off: the catch's reach limit
stripped; the pace the legs can take judged at the pelvis's facing, not the heading; the pelvis
aimed on one foot no further round than the step lands (`landingHeading`).

**Shoved while it walks it falls.** The same battery with a level shove at the middle trunk, a
random way, at a third of its orders (`--shoves`; Warrior, seeds 1 to 100, 0.5 m/s, at `ed479bd0`):

| Shove | None | 10 N s | 20 N s | 30 N s |
|---|---:|---:|---:|---:|
| Trials that fell | 3 of 100 | 6 | 24 | 56 |

20 N s moves the Warrior 0.24 m/s. A fall came 1 to 2.5 s after its shove, most from the side,
after 5 to 10 catch steps: the capture point ran past the bearing foot's outside, the other foot
stepped in beside it again and again, and a step out by the bearing foot landed short of it. A
catch taken by whichever foot lands nearer the capture point, as long as 1.2 of the leg, and a
crossed foot landing back on its own side, and a catch landing where the capture point will be
and not past it, cut the Rogue's falls at 20 N s from 199 of 400 to 37 and the Warrior's from 68
to 15 ([which foot catches](stance-tuning.md#which-foot-catches)).

What the Rogue still falls by at 20 N s (18 of seeds 1 to 200, at `e0adc9dc`; 3 of 400 unshoved):
in 8 the trunk folds over the bearing hip, past 0.8 rad, 0.4 s or more before the hips are low
enough to count. The swing's bow round the bearing sole (`swingBowToRef`) jumps from one control
step to the next as the landing is re-aimed, between a few centimetres and 2.9 m, and its turn
from bending out across to bending toward the sole's end; the foot is asked for up to 1,800 m/s²,
the solve misses thousands of newtons, and the plan the landing is aimed from jumps with it. The
others are chains of crossovers and steps out that the capture point outruns.

Not kept, against 18 (a placebo moves it 3 or 4): the bow capped at twice the box's half-diagonal
(17); the bow turned toward the sole's end only for a landing past its far side (27); the bow kept
from the lift (25, and 24 capped as well); no crossover (15, and 19 against 19 on seeds 201 to
400); a catch's swing over 0.25 s or 0.35 s (20, 19), `fast` 0.25 (19), a lift of 0.03 m (26),
the longest catch 1 of the leg (28), a reach of -0.05 or -0.1 (19, 33).

Not kept, read on 600 unshoved Warrior trials (the walk as it was 14 falls, a placebo 16) or on the
shoved battery at 20 N s (24): the swing's bow round the bearing sole (`swingBowToRef`), which
reaches metres before 9 of 10 falls, capped at the box's diagonal (20) or bent only to take the
way's deepest point out of the box (21); 10 cm between the thighs (`STRIDE_ROOM`) in place of 3
(13 of 300 against 6); a catch that would land no nearer the capture point than the bearing foot
stands put down at once, and the bearing foot stepping out (27).

## The stride

Experimental. It plans its own steps on the capture point and holds 0.7 m/s every way for the
Warrior and 0.5 for the Rogue and the skeleton (`assets/core/stride-envelope.json`). On the Lab's
lines (`research/locomotion-run.mjs`, 20 N gusts) the Warrior holds 1.2 m/s asked forward, 0.95
along the line, and 0.7 the other ways; the Rogue 1 forward (0.75 along). Its defaults are the best
of a search over its settings (`research/locomotion-search.mjs`): against the stance's own step
they fell 364 times against 425 in 640 paired runs on the lines, and 41 against 62 in 120 on the
turns.

**It does not help a fight.** In the empty-hand league (66 bouts a striding entrant, at the
stride's earlier settings: a 0.3 s swing after 0.08 s on both feet), each preset on the stride
rates under itself on the stance's walk:

| Preset | Stance's walk | Stride |
|---|---|---|
| Puncher | 1546 | 1412 |
| Scrapper | 1204 | 1126 |
| Classic | 400 | 312 |

The Puncher on the stride falls 1.74 times a bout against 0.11: its straight punch drives as soon as
its foe is in the band, mid-step. Waiting for both feet as the drive begins (`landed`) brings that to
1.45; waiting 0.1 s on both feet (`settle`) cures the falls and loses every bout to the Puncher on
the stance's walk; no `EDGE` helps.

## The run

Experimental (`run.ts`). It flies between steps, its feet placed as a hopping machine places them
and the capture point asked where a steady run's is as each foot lands, the arms swinging against
each other. On the spot it stays up; forward it holds 10 s at about 1 m/s whatever pace is asked (a
search over its settings reached 0.9 m/s held, 0.76 for the Rogue, by giving up the flight). Each
step the pelvis yaws some 0.8 rad: the swing's yaw is more than the bearing sole's twist gives at
the ground's friction (0.5), and the bearing hip turns to its stop. A foot landed behind its neutral
point, to speed up, falls within about 2 s.

## The SIMBICON walk

The walk every fighter travels by (`simbicon.ts`): it drives the legs itself, with no stance goal.
Told it may not run, it walks forward to 1.31 m/s. Its envelope (`assets/core/simbicon-envelope.json`:
calm and in four seeds of 5 N gusts, with each thing held) is every way 1.4 m/s for the Warrior, 1
for the Rogue and 0.7 for the skeleton, and forward 1.5, 1.2 and 1.5. It is measured from 0.3 m/s,
since slower a step's pendulum carries the body past the pace asked or short of it. Each way changes
the walk asked at its own rates: forward 1.16 m/s² faster and 0.47 slower, the side and back ways
0.5.

Departures from the paper: the late swing lands by the inverted pendulum (Coros 2010) in place of
the paper's feedback on distance; there is no gravity term through the stance leg; gains are a
settling time and shares of strength, not N m/rad.

## The SIMBICON run

Past 1.31 m/s the walk tracks a person's run cycle (`runCycle`, `cycle-run.ts`): three CMU clips'
cycles (16_35 at 2.75 m/s, 16_45 at 3.94, 102_05 at 4.38; `assets/core/run-cycle.json`,
`research/run-cycle.mjs`), its phase from landing to landing, blended by the pace and scaled by
Froude. Its pace is held no more than `ahead` past the body's own; its settings (`RUN_CYCLE`) were
searched on the three bodies bare-handed in the guard, calm and in gusts, at haste 0 and +50 %
(`research/run-cycle-search.mjs`).

- **Pace.** Asked 4 or 5 m/s, each body settles at its own pace, cadence times step: 3.50 m/s for
  the Warrior, 2.65 for the Rogue, 2.98 for the skeleton (calm, empty-handed and with the club). Its
  stride falls short of the clips' at the cadence it runs, and no leg muscle but the ankles is at
  its ceiling there. Haste and balance move it ([assist](assist.md#haste)).
- **Envelope** (`assets/core/simbicon-run-envelope.json`, each walk set off 10 s and resting 10 s
  after): forward to 4 m/s for the Warrior by the rule, to 1.2 for the Rogue and the skeleton, since
  a few of their trials at every pace fall. Forward at 3 m/s the Warrior held 10 of 10 trials, the
  Rogue 7, the skeleton 10; at 4, 10, 3 and 10.
- **How fast a body runs is the speed rule's** (`travelSpeed`, `src/core/mind/travel.ts`): the
  fastest each way that every trial held, under what it stops from and corners at, and the goal's
  ceiling. The gait itself takes any pace that held a fifth of its trials (`REACH`).
- **Its feet land narrow.** Each swinging foot is placed across from the hip's abduction in the
  reference pose, and the lateral settings were searched with a cut past a step width of 0.3 of the
  leg: median step width at 3 to 5 m/s 0.31 m on the Warrior, 0.21 on the Rogue, 0.22 on the
  skeleton (0.53, 0.40 and 0.33 without the cut).
- **The club is what throws the run.** On gust seeds the search never saw (5 to 8; asked 1.4 to 5,
  three stops and two turns, balance 0), the trials that fell, of 50 each:

  | Body | Empty-handed | With the club |
  |---|---|---|
  | Warrior | 1 | 1 |
  | Rogue | 0 | 16 |
  | skeleton | 0 | 1 |

  The Rogue with the club falls in nearly every trial asked 3.5 m/s or more, 15 to 21 s in: it
  gains speed past what it holds empty-handed, and at about 3.3 m/s its hips sink and its trunk
  goes over.
- **Stopping.** A run gives way only from its second landing (`RUN_SWITCH.landings`); late in a
  swing the thigh leans no farther than the straight leg reaches the ground. Asked 1.4 to 3.5 m/s
  and to stop at 2.5 to 8 s (calm, balance 0), empty and with the club, 6 of 96 trials fall: the
  Rogue with the club (3), and the skeleton as it slows to a halt (3). A stop from 3.5 m/s takes
  7.6 s and 15 m at the walk's `slowdown` (0.47 m/s²). In an Arena bout opened at 8 m the Warrior
  asked 1.4 runs, stops and stays up, but changes gait 3.3 s after the Rogue comes near
  (`tests/move.test.mjs@2a1b29ac`, a `todo` against 3 s).
- **With balance** the gait asks the assist to right the pelvis ([assist](assist.md#a-gaits-assist)).

## The walk and run

The game's Run (`walk-run.ts`): the stance's walk, and past its threshold the SIMBICON run's cycle,
facing the way asked. Its envelope (`assets/core/walk-run-envelope.json`, `walkRunEnvelope`) holds
each way's fastest speed at which every one of 20 trials held (`fastestEvery`): calm and in four
seeds of 5 N gusts, with each of the empty hand, the club, the buckler and the sword; each walk set
off 10 s and resting 10 s after.

| Body | Forward | Sides | Back |
|---|---|---|---|
| Warrior | 4.5 | 0.7 | 1.0 |
| Rogue | 0.7 (3.5 without the club) | 0.7 | 1.0 |
| skeleton | 3.5 (4.0 without the club) | 0.5 (0.7) | 1.2 |

To a side the run turns to face the way and runs it: the Warrior held 16 of 20 to each side at every
speed from 1 to 4.5 m/s.

**Stopping.** The run slows at about 0.47 m/s² but begins late, going 0.3 to 0.5 m/s past the pace
asked, so the walk and run states 0.15 m/s² while it may run (`RUN_STOPPING`) and the speed rule
brakes for it. A place goal 8 m off (Node stand, Rapier, 120 Hz, open stage, ordered 3 s after the
bout opens, balance 0):

| Body | Held direct goal, last 2 s of 5 | Place goal 8 m off |
|---|---|---|
| Warrior, empty-handed | 1.68 m/s | ends 0.19 m short, no overshoot |
| Warrior, club | 1.85 m/s | ends 0.20 m short |
| skeleton | 1.33 m/s; 1.26 with the club | ends within its `near` |
| Rogue | falls turning into the run (goal to its side); 0.38 with the club | with the club, short of it in 20 s |

At 0.3 and 0.2 m/s² the Warrior and the skeleton run up to 2.7 m past the place and fall.

**Turns** stay the SIMBICON run's. On the walk-run, the Warrior empty-handed and calm, 28 turns a
rate and speed (each sense, from 14 moments of setting off): at 1 m/s and faster no rate from
0.25 rad/s held all 28 (27 at 0.25 rad/s to 3.5 m/s, 21 at 4.5 m/s); slower, 0.7 to 1.4 rad/s
held. Most that fail fall, turning left, from 0.5 s after setting off.

**Setting off turning.** The run begins only once the body has faced the way asked for 0.6 s
(`RUN_SWITCH.settled`): a run begun as the walk's turn comes onto the way, the pelvis still
turning, twists off its heading and falls within a second. The crowd's lone walker, which turns
round between its runs (Node stand, Rapier, 120 Hz, `.tmp` sweep of the crowd's cases at seeds 1
to 12 of every situation and the lone walker's 13 to 44, at `3eace0e6`):

| Run begins | Falls, 69 cases | Lone walker, seeds 13–44 |
|---|---:|---:|
| facing the way | 6 (5 lone) | 7 in 32 |
| facing it 0.6 s | 2 (1 lone) | 1 in 32 |

A cap on the facing's turn rate at the switch (0.5 and 1 rad/s) kept 4 and 5 of the 5 lone falls.

## Move

`move.ts` walks by the first gait whose rule matches (`MOVE`): braced, in the stance's guard, while
it stands or a standing foe is within 5 m; otherwise by the walk and run
([above](#the-walk-and-run)), which runs once the speed rule's speed is past its walk's. A rule lets
go of its gait half a metre past its distance. Classic and the options fighter get about by it (the
Scrapper by the stride); an Arena bout opens at 4 m, so it fights braced from its first step. Every
goal, a tactic's, the Crypt's and the Lab's orders and a person's keys alike, goes at the speed
rule's speed; Shift in the Arena caps it at the plain walk forward (`Orders.walk`). The walk and the
run are one machine and change at once; a gait that drives the legs is asked to stand before it
changes to another.

The braced rule holds at 5 m: at 2 m two Arena fighters opened 4 m apart run into each other and one
falls.

## Motion capture

Human joint trajectories by phase as a gait's targets, with SIMBICON's landing, balance feedback and
stance hip on top (Lee, Kim and Lee 2010, "Data-driven biped control"); the physics drives the body
throughout. The run is built this way ([The SIMBICON run](#the-simbicon-run)); the walk's ways are
not.

- **The data**: the CMU Graphics Lab database (mocap.cs.cmu.edu), which places no restriction on
  use; cgspeed's BVH conversion (github.com/Shriinivas/cmubvh) adds none. Subjects 111, 113, 141 and
  143 each walk forward, back and to the side and run in one session; 132 walks slow (45 to 50),
  fast (17 to 22) and back (13); 83 sidesteps; 127 runs sidesteps (13, 14); 16, 69, 104 and 127
  turn. The list is cgspeed's. Raw clips stay outside the repo as untrusted data; only derived
  tables are committed.
- **The import** (`research/mocap-import.mjs`) reads a clip into what a SIMBICON walk asks of the
  legs, step by step: forward 141_25, 1.08 m/s at 1.84 steps a second; 132_17, 1.83 m/s at 2.03;
  back 141_31, 0.97 m/s at 1.97; side 141_33, 0.58 m/s at 1.6 to 1.9; the run 141_34, 2.05 m/s at
  2.42. The side and back walks already match a person's speeds; forward a person goes faster by
  longer steps.

## Tried and not kept

On the stance's walk and the stride:

- a shoe's sole (`withSoles`): falls less under gusts, but the stride holds less;
- a sole that rolls from heel to toe (`--probe '{"rocker": 0.3}'`): the solver touches one flat
  piece of it at a time, and every rocker walked slower than the box;
- the trunk cancelling the swing's yaw: not built, since the yaw given free held less;
- a person's cadence forward (`paced`), landing on contact (`lands`), lengthening a short swing
  (`lengthen`), the push-off as a torque (`launch`, `lead`), a swing from its launch (`momentum`)
  and a swing's missed moment at its own lever (`lever` 0.3, falls less and walks no faster):
  settings left off;
- the plan yielding to what the soles miss; soles narrowed to where the ankle holds the whole weight
  (the Rogue falls at 0.5 m/s); the pelvis turning with the stride, either way; the yaw weighed
  less in the share; a straighter knee;
- a search's best stride settings (a 0.31 s swing, `lengthen` and `lever` on): on the forward line
  under gusts (10 seeds, 20 s) the Warrior holds 1.2 m/s asked and reaches 1.01, against the
  defaults' 1.0 and 0.88, the Rogue 1.0 and 0.79 against 0.7 and 0.64; but the Warrior falls walking
  back with the club at 0.7 m/s, so its every-way envelope is 0.5 against 0.7;
- a second envelope figure, the fastest walk straight ahead that turns no slower than the walk
  every way: the stride reaches its ask to 1 m/s and stays up to 1.4, but at 1 m/s turns half as
  fast and nothing slows a walk for a bend; the stance's walk gained 0.7 m/s by it, and its faster
  approach felled the Rogue in the smoke bout;
- a tendon in series with the ankle's plantar flexors (`MuscleSpec.tendonPositive`), as stiff as a
  person's Achilles tendon: the Warrior's stride falls 3 times in 10 at 1 m/s and every time at
  1.2, at two and four times the stiffness too, which points at the stance's torque control; on the
  spot it keeps the run up 8 times in 8, against 3 rigid. The mechanism is in the core; no body has
  one.

On the stance's walk's turn (the Warrior with the club, 28 trials a cell, at `827b28a6`):

- every turn at 2 rad/s with this envelope's walks (at `4813e84b`): the crowd's 24 fall 23 times,
  done in 17 of 23;
- this envelope's turns with the walks of the one before it (0.5 m/s for the Warrior, 0.4 the
  others; at `827b28a6`, and members' routes held at the most room they took over 2 s): shoved, the
  Rogue falls 11 times and the Warrior once; the crowd's 24 fall none, done in 23 of 23 and pushed
  apart 65 steps a case; the 69 fall none, one not done. Its walks are not this envelope's;
- the pelvis following the heading at its rate as well, read from the heading's change a step
  and fed to the turn's spin (no faster than a radian in the turn's constant). Its half turns:

  | Speed, rate | Held, without | Held, with | Median lag, rad |
  |---|---:|---:|---:|
  | 0.5 m/s, 1 rad/s | 28 | 28 | 0.39 to 0.12 |
  | 0.7 m/s, 1 rad/s | 22 | 27 | 0.45 to 0.23 |
  | 1 m/s, 0.25 rad/s | 27 | 28 | 0.19 to 0.05 |
  | 1 m/s, 0.5 rad/s | 25, 2 fell | 22, 6 fell | 0.20 to 0.19 |
  | 0.3 m/s, 2 rad/s | 1 | 7 | 0.79 to 0.65 |

  The envelope measured with it (657 s) walks as before and turns faster: the Warrior 1 rad/s at
  0.7 m/s against 0.5, the Rogue 1 at 0.5 against 0.5 and 0.25 at 1 m/s against none, the
  skeleton 0.5 at 0.7 against 0.25. Shoved under orders (20 N s, seeds 1 to 200) on the asset as it
  is, the Rogue falls 33 times against 17 and the Warrior 20 against 9: the pelvis takes the
  asset's 4 rad/s turns the legs cannot. With each its own envelope, 24 and 1 against 19 and 0;
  the crowd battery with its envelope is done in 15 of 23 against 18, falling 0.21 a case
  against 0.08 and pushing apart 464 steps a case against 355;
- with that, a landing foot turned past the pelvis by 0.7 of its own hip's rotation, not only as
  far as the bearing hip lets the pelvis turn (`landingHeading`): at 0.3 m/s and 2 rad/s 17 of 28
  held against 7, but at 1 m/s and 0.25 rad/s one fell, and at 0.5 m/s and up the catch still
  holds the facing, so its gait is not a faster turn.

On the SIMBICON run (its battery above):

- a search with the club in hand (`--holds empty,club`, 13 generations): nothing past its start;
- a run that begins only while the body goes across its heading slower than 0.15 or 0.25 m/s: the
  Warrior and the Rogue never run;
- the club's arm kept in the guard as the other swings: the Warrior 4 run falls of 20 against 6,
  the Rogue no better;
- a jog clip (CMU 141_34, 2.13 m/s) as the slowest of three clips: scored lower;
- the run braked at its own rates (`brake`, 1.17 m/s²): 26 of 45 stops fell against 16 at the
  walk's 0.47; a `slowdown` of 0.7 stops in 5.5 s and fells 14 of 96, the skeleton 10, whose guard
  walk does not take a quicker slowing;
- guard arms in the walk after a run.

On the walk and run's stopping (Node stand, Rapier, 120 Hz, empty and the club, at `6c2142ec`):
the run holds about its own speed between 1.2 m/s and it (1.7 to 2.2 for the Warrior) whatever it
is asked, so the speed rule's slowing is not followed and the body goes 0.3 to 0.5 m/s over it.

- a run asked under its pace by once or twice what the body goes over it: slows 0.1 to 0.2 m/s
  sooner, stops no shorter;
- the run's `brake` at 1 and 2 m/s²: from its top speed the Warrior and the Rogue fall, the
  skeleton at 2;
- the run slowing from the body's speed, not from its pace up to `ahead` over it: halted from
  runs of 2, 4 and 6 s, each body empty and with the club, it stops in 4.75 m against 6.22 (the
  16 both stood), and the Rogue with the club falls after its 4 s run, which stood; at the stated
  0.15 m/s² a place goal 8, 15 and 30 m off plays the same;
- stated at 0.2 m/s² with that slowing: a place goal is reached 5 to 10 % sooner, and the skeleton
  sent 8 m falls as the run gives way, its pelvis turning at about 3 rad/s; at 0.3, 20 to 25 %
  sooner, the Warrior runs up to 1.7 m past with the club and the skeleton falls once;
- the catch's foot chosen by how far the capture point lands from the support it leaves (the
  bearing sole to the landing) in place of from the landing: shoved, the Rogue 16 and the Warrior 7
  falls of 200 against 18 and 7; no stop changed.

On the walk and run's speeds:

- a fixed share of the forward pace for a goal to the side (`STRAFE`,
  `docs/reference/orders.md@aaae9b48`): the speed rule asks what each way held instead;
- `RUN_STOPPING` 0.3 and 0.2 m/s²: the body runs past a place goal and falls ([above](#the-walk-and-run)).

On the SIMBICON walk (the Lab's three tracks, three bodies, seeds 1 to 6, on the wider gait):

- the stance leg's servo on the side way (`vfSide` 2): speeds the Warrior's and the Rogue's square
  and throws the skeleton's (0.51 to 0.39 of the pace, 19 falls against 10), capped or not;
- the landing's trim to the side: oscillates; forward it brings a slow walk from 1.4 to 1 of the
  pace asked, and is a wash on the tracks;
- the stance ankle's share set per way, and its inversion against the side error (`cvAnkleSide`):
  under 0.01 of the pace;
- more or less lead on the side walk (`leadSide`, `leadOut`): more lifts its pace from 0.75 to about
  1 of asked and falls at paces it holds; less is slower;
- a cadence quickened with the pace: worse for every body;
- a side way searched on the square: its envelope certified side walks the skeleton could not hold
  there.

Haste as a gait timed to its muscles (`SimbiconSettings.hasted`) and a forward force on the root
are in [assist](assist.md#haste).
