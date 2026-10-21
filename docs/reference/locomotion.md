# Locomotion

What each gait holds and what was tried on it and not kept. Node stand, Rapier, 120 Hz unless a line
says otherwise; a figure is read again before it is compared at another commit. How the gaits are
built is in the [architecture](../architecture.md#skills); what is open is in the
[roadmap](../roadmap.md).

## The stance's walk

The walk a fight uses. The fastest walk held every way is 0.5 m/s for the Warrior and 0.4 for the
Rogue and the skeleton (`assets/core/stance-envelope.json`), where a person's preferred walk is
near 1.4 m/s (`PERSON_PACE`, `src/core/human/gait.ts`). Asked 1.2 m/s forward it goes 0.80. A dash,
a roll, a crouch and turning on the spot are not built ([orders](orders.md)).

**What caps it is where the body bears.** Through each swing the realised centre of pressure stays
about 3 cm ahead of the bearing sole's middle whatever the stance asks, a braking that costs about
the fifth of the pace the walk falls short of; asking the pivot further back moves the place asked,
not the one realised. Stripping one limit at a time (the bed's `--probe`): twice the strength lifts
the forward walk about 16 %, and an assist with it to 1.4 m/s; the yaw given alone, lighter legs,
stronger ankles, 240 Hz and more friction hold no more. What lifted the pace is the swing's share of
the step: a longer swing and a shorter double support. The ankle gives 4 to 7 % of the stride's
positive work, where a person's gives about half (`research/gait-audit.mjs`).

**A half turn at the next rate past the envelope's** still runs away sideways and falls now and
then, one to three of 56 in four cells: after the turn the plan outruns the pace asked
([human and strikes](human-and-strikes.md#turning)).

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
- **Whether a body runs is its mind's choice of risk.** The envelope keeps each way's trials
  (`StanceEnvelope.tried`); the gait takes any pace that held a fifth of them (`REACH`), an order to
  run or a destination the fastest that held 0.6 (`RUN`, `ordered.ts`), and the options fighter
  closing on a place 0.8 (`SPACE.share`, `walk.ts`). In an Arena bout opened at 12 m
  (`research/bout.mjs`, 8 s) two skeletons close at up to 2.1 and 1.25 m/s, two Rogues at 1.9 and
  2.0, and two Warriors run from 5.25 s, stop from about 1.3 m/s and close; all stay up, empty-handed
  and with the club.
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

## Move

`move.ts` walks by the first gait whose rule matches (`MOVE`): braced, in the stance's guard, while
it stands or a standing foe is within 5 m; otherwise by the SIMBICON walk free to run, which runs
where the pace asked is past its walk's. A rule lets go of its gait half a metre past its distance.
Classic and the options fighter get about by it (the Scrapper by the stride); an Arena bout opens at
4 m, so it fights braced from its first step. The options fighter closes on a place as fast as held
0.8 of its gait's trials and stops before it (`walker`); Classic's tactics close at the walk. The
Crypt's and the Lab's orders give a destination, and a person in the Arena runs with Shift
(`Orders.run`): each is asked the fastest pace forward that held 0.6 of its trials
(`orderedIntent`), the Crypt's slowed for its route's corners (`CORNER`, `src/dungeon/run.ts`). The
walk and the run are one machine and change at once; a gait that drives the legs is asked to stand
before it changes to another.

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
