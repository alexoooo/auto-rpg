# The rules the screens set

The numbers of the arena's bout and the crypt's run that decide what happens (who sees whom, whom
each fights, where each walks, how a level is laid out) and are the screens' own, not the core's.
Each section names its constants, where they live, their values, and whose choice they are.

None of these is measured on the core. Each is **set**: chosen while the rule was written. Two
were once backed by a measurement on a body and an engine that are gone, and are named below as
set; what is still to measure is on the [roadmap](../roadmap.md). Unless a line says the
owner chose it, every value here is **kept as found; the owner to confirm**.

## The bout

`src/arena/duel.ts`. A recipe may give its own of either (`?gap=`, `&cap=` on the page).

- `GAP_METRES`: the two stand 4 m apart. That is beyond the 1.8 m a fighter attacks from
  (`ATTACK_METRES`, [human and strikes](human-and-strikes.md#attack-distance)), so each walks in
  before the first blow. The standing tables are read at 3, 4 and 5 m ([bouts](bouts.md)) and
  the oracle's at 4 ([oracle](oracle.md)).
- `CAP_SECONDS`: a bout runs 120 s before the fuller bar decides it. With no balance a bout
  lasts 14 s on average, and with a balance of 25 % 55 s ([assist](assist.md)), so the cap
  decides few bouts without balance and more with it.

## Sight

`src/dungeon/run.ts`. Every sight line is `canSee`'s: a clear line on the map, no farther than
the distance given. The run reads it through an index of the cells where nothing need be read
(`SightIndex`, `src/dungeon/map.ts`), which changes no answer
([step-cost.md](step-cost.md#sight-read-through-an-index)).

- `SIGHT_METRES`: an enemy sees a party member within 14 m.
- `WAKE_METRES`: an enemy's body is built once a standing party member comes within 16 m of
  where it waits, 2 m beyond its sight, so that it is standing when it can first see; or a body
  going somewhere comes within `LEVELS.company` of it, so that nothing stands where it is built
  (`stirs`, [Levels](#levels)). An enemy not yet built saves the step what a standing body costs
  it ([Bodies in the step](#bodies-in-the-step)).

`WAKE_METRES` is **set, not measured**: it is the distance of the rule the crypt had on an engine
that is gone (`src/dungeon/run.ts@e029c1e7`), which held a far enemy asleep in that engine.
- `PARTY_SIGHT`: a party member sees the enemy its order locks within 12 m, picks one for itself
  within 8 m, and keeps the one it fights while it is within 5 m and nothing ranks above it.

## Levels

`src/core/rules/levels.ts`, `src/dungeon/run.ts`. **A body with nothing to do and nobody near is
held; any other is at full in the fight and limp out of it** (`levelsOf`, `BodyLevel`). Held,
its segments are fixed where they are and nothing drives it; limp, nothing drives it and the
solver alone moves it. In the crypt a body in the fight has nothing to do when it waits: an enemy
with no target, unalerted, within `HOME_METRES` (0.5 m) of its home. One out of the fight has
nothing to do once it has lain `settle` seconds. Somebody is near a body when a body going
somewhere (in the fight, at full, not waiting: a party member, or an enemy that is not waiting,
so two waiting side by side are held together) is within `company`, or, for a body in the fight,
a party member in the fight is within `wake`; once it is loose, the farther `clear` and `rest`
keep it so. Nobody watches for the dead, so only a walker is near one: the dead lie loose while
the party is about them, are fixed where they lie once it has walked off, and are loose again
when somebody walks near, so a body underfoot can still be pushed aside.

`LEVELS`, the crypt's distances:

- `wake`, 16 m, and `rest`, 18 m: `WAKE_METRES`, and 2 m beyond it; `company`, 4 m, and
  `clear`, 5 m. These are **set, not measured**: they are the distances of the rule the crypt
  had on an engine that is gone (`src/dungeon/run.ts@e029c1e7`). The gap within each pair keeps a
  body on a line from being held and let go by turns.
- `settle`, 10 s: how long a body out of the fight lies loose before it may be held, long enough
  for its fall to end. Read, below.
- `HOME_METRES`, 0.5 m: how near its home a waiting enemy stands, set with the others.

**There is no cap.** A level is read from the game alone, never from the machine, so a run is the
same on every machine; with more bodies near than a machine carries, it plays the same game
slower (`World.advance` drops the time it cannot take). How many are near at once is the level's
design to decide, as it places them.

**How long a fall takes to end.** Each crypt model with the club, alone on a ground under the
crypt's mind and orders to stand: stood 2 s, then shoved at its root's centre of mass by its
whole weight for a quarter second toward each of four bearings and let go limp as it is found
down; or let go limp standing, as one whose pool ends on its feet. Seconds from going limp until
its centre of mass stays under 0.05 m/s, and then until its fastest segment does, read over 15 s;
"moving" is still moving at the end.

Harness: Node, the core world, Rapier, 120 Hz.

```powershell
node research/rest-probe.mjs
```

| Model | Shoved ahead | Shoved behind | Shoved left | Shoved right | Let go standing |
|---|---:|---:|---:|---:|---:|
| crypt-skeleton | moving, moving | 1.74, 8.24 | 6.04, 7.14 | 0.82, 1.55 | 5.17, 5.52 |
| workshop-fighter | 9.05, moving | 4.27, 4.47 | 2.17, moving | 3.43, 13.56 | 1.55, 2.09 |
| workshop-rogue | 0.93, 1.18 | 1.02, 1.20 | 1.19, moving | 4.98, 9.99 | 1.38, 3.15 |

The longest fall that ends takes 9.05 s, so `settle` is 10 s: a body has come down, whatever its
limbs do after. They do not all come to rest. A limp body's joints have nothing passive in them
(no damping, no stiffness: `BodyLevel` `limp` releases every motor), and some poses do not
settle: the Warrior shoved ahead still moves a hand 2 to 3 cm a second at the end, and the
skeleton shoved ahead crawls, 25 cm a second. Read by a script that is not kept (the same
harness): in half a second of the skeleton's crawl, 2 s after it went limp, its potential energy
rises from 97 J to 106 J and its kinetic from 0.2 J to 3.5 J with nothing pushing it, while a
raised leg rocks on its limit. Holding the dead stops it once nobody is near; while somebody is, the dead may stir.
The sleep that the second half of the probe reads (Rapier's own, which the core does not use) is
the same with a body let go limp by its level as by the end of its driving.

## Bodies in the step

`src/dungeon/run.ts`. A run steps every body it has built, and a body costs a step what its
control and the solver take for it.

Harness: Node, the core world (`src/core/world.ts`), Rapier, 120 Hz, one thread of the development
host; skeletons with the club, 3 m apart on a ground, each under the command layers with an order
to stand. Read standing; then held (`Body.setLevel`), their muscles released and every segment
fixed where it is; then let go, the same bodies and minds going on; then felled by a shove at the
root and still driven by a mind with no sub-minds; then lying, under the sub-minds the game's mind
has (`FIGHTER`); then limp, their muscles released; then held where they lie; then let go limp
and rising, under the riser that plays stages (`stagedRise`, `rising.md#stages`), the row
saying what part of the bodies' steps the riser lay slack, held a pose and bore on its limbs. A
row is the mean of 600 steps.
The step is 8.33 ms of the run's time, so a step of 8.33 ms is real time with nothing drawn.

```powershell
node research/body-cost.mjs
```

| Bodies | State | Down | A step, ms | The solver, ms | The rest, ms | A body, ms | Of real time, % |
|---|---|---|---|---|---|---|---|
| 1 | standing, driven | 0 | 0.71 | 0.33 | 0.38 | 0.71 | 8 |
| 1 | standing, held | 0 | 0.05 | 0.05 | 0.00 | 0.05 | 1 |
| 1 | let go, driven | 0 | 0.61 | 0.29 | 0.33 | 0.61 | 7 |
| 1 | down, driven | 1 | 0.79 | 0.32 | 0.46 | 0.79 | 9 |
| 1 | down, lying | 1 | 0.37 | 0.28 | 0.08 | 0.37 | 4 |
| 1 | down, limp | 1 | 0.27 | 0.27 | 0.00 | 0.27 | 3 |
| 1 | down, held | 1 | 0.02 | 0.02 | 0.00 | 0.02 | 0 |
| 1 | down, rising: slack 47 %, posing 40 %, bearing 14 % | 1 | 0.43 | 0.30 | 0.13 | 0.43 | 5 |
| 4 | standing, driven | 0 | 2.24 | 1.01 | 1.23 | 0.56 | 27 |
| 4 | standing, held | 0 | 0.07 | 0.07 | 0.00 | 0.02 | 1 |
| 4 | let go, driven | 0 | 2.21 | 0.99 | 1.22 | 0.55 | 26 |
| 4 | down, driven | 4 | 3.02 | 1.17 | 1.84 | 0.75 | 36 |
| 4 | down, lying | 4 | 1.44 | 1.13 | 0.31 | 0.36 | 17 |
| 4 | down, limp | 4 | 1.10 | 1.10 | 0.00 | 0.28 | 13 |
| 4 | down, held | 4 | 0.07 | 0.07 | 0.00 | 0.02 | 1 |
| 4 | down, rising: slack 11 %, posing 62 %, bearing 27 % | 4 | 1.68 | 1.09 | 0.59 | 0.42 | 20 |
| 8 | standing, driven | 0 | 4.32 | 1.97 | 2.35 | 0.54 | 52 |
| 8 | standing, held | 0 | 0.13 | 0.12 | 0.00 | 0.02 | 2 |
| 8 | let go, driven | 0 | 4.31 | 1.97 | 2.35 | 0.54 | 52 |
| 8 | down, driven | 8 | 5.91 | 2.36 | 3.55 | 0.74 | 71 |
| 8 | down, lying | 8 | 2.97 | 2.33 | 0.64 | 0.37 | 36 |
| 8 | down, limp | 8 | 2.26 | 2.26 | 0.00 | 0.28 | 27 |
| 8 | down, held | 8 | 0.13 | 0.13 | 0.00 | 0.02 | 2 |
| 8 | down, rising: slack 32 %, posing 64 %, bearing 4 % | 8 | 2.88 | 2.17 | 0.71 | 0.36 | 35 |

A standing body costs 0.54 ms a step, over half of it control. Held, it costs 0.02 ms, and let
go it stands as before, its own mind going on: none of the eight is down. A body that is down
and still driven costs more than one standing, 0.74 ms: its stance goes on solving for a ground
its soles cannot give. Lying, it costs 0.37 ms: the solver's 0.28, and 0.08 for its mind's look
at it each step, which is how it knows it is down. Limp, it costs the solver's 0.28 ms and
nothing else; held where it lies, 0.02 ms. Rising, it costs 0.36 to 0.43 ms by what its riser
is at: a stage that bears on its limbs solves what a stance does, and a pose or lying slack
costs little more than lying. A rise is begun from bodies let go limp from held, so its stages
are not the ones the table had before the held row was read: at `bf88bd38`, risen from limp,
one body bore three steps in five and cost 0.59 ms, 0.30 of it outside the solver. The Warrior's
rows read as the skeleton's (`--model workshop-fighter --bodies 1`: standing 0.67 ms, rising
0.60).

Read on one machine the same evening at `bf88bd38`, the rule before the levels, which held a
body by releasing its muscles and fixing its segments and drove it afresh when let go: one body
standing 0.69 ms, held 0.04, let go 0.61; eight 4.27, 0.12 and 4.26. A level costs what the
disposal did.

So a body out of the fight goes limp ([Levels](#levels)): its assist is withdrawn and its muscles
released at the next step. In the crypt the stance of a body that is down cost more than under an
order to stand. Read at `69549c6c`, before the rule, with a script that is not kept (Node, a crypt
run of seed 42 with no visuals, every enemy built by hand at its home and seven of the nine bodies
felled by a shove): 12.5 ms a step, 9.8 of it outside the solver, where the nine standing took
5.2 ms. With the rule the same nine take 3.3 ms, 0.7 of it outside the solver.

Over a run: the hero explores a generated level with three Warriors following, for 180 s or to
the run's end. A rule changes a fight's course, so the three tables are not the same runs.

```powershell
node research/crypt-step.mjs --seeds 1,2,3,4 --seconds 180 --companions 3
```

At `69549c6c`, a body out of the fight still driven:

| Seed | The run | Seconds | Enemies | Bodies built at the end | The most built | Out of the fight | A step, ms | In its slowest second, ms | Of real time, % |
|---|---|---|---|---|---|---|---|---|---|
| 1 | playing | 180 | 8 | 9 | 9 | 3 | 5.09 | 6.77 | 81 |
| 2 | playing | 180 | 8 | 7 | 7 | 2 | 4.50 | 5.09 | 61 |
| 3 | playing | 180 | 8 | 8 | 8 | 2 | 4.66 | 5.55 | 67 |
| 4 | playing | 180 | 8 | 8 | 8 | 5 | 5.63 | 6.36 | 76 |

With a body out of the fight limp:

| Seed | The run | Seconds | Enemies | Bodies built at the end | The most built | Out of the fight | A step, ms | In its slowest second, ms | Of real time, % |
|---|---|---|---|---|---|---|---|---|---|
| 1 | playing | 180 | 8 | 8 | 8 | 2 | 3.98 | 5.18 | 62 |
| 2 | playing | 180 | 8 | 7 | 7 | 2 | 3.69 | 5.26 | 63 |
| 3 | playing | 180 | 8 | 8 | 8 | 2 | 3.88 | 4.97 | 60 |
| 4 | dead | 51 | 8 | 8 | 8 | 4 | 4.33 | 5.16 | 62 |

With an enemy at rest held as well, by the rule before the levels:

| Seed | The run | Seconds | Enemies | Bodies built at the end | The most built | Held | Out of the fight | A step, ms | In its slowest second, ms | Of real time, % |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | playing | 180 | 8 | 8 | 8 | 1 | 2 | 3.43 | 5.09 | 61 |
| 2 | playing | 180 | 8 | 7 | 7 | 1 | 2 | 3.10 | 4.64 | 56 |
| 3 | playing | 180 | 8 | 8 | 8 | 0 | 2 | 3.72 | 4.74 | 57 |
| 4 | dead | 51 | 8 | 8 | 8 | 2 | 4 | 4.09 | 4.83 | 58 |

Four runs a table, on one machine: the mean step is 4.5 to 5.6 ms with neither rule, 3.7 to
4.3 ms with the limp one and 3.1 to 4.1 ms with both. A party of four costs 2.1 ms a step by
itself, and in 180 s it has not left many enemies behind: none to two are held at the end.

With the levels' rule (`LEVELS`), the dead held as well, and the same rule before it at
`bf88bd38`, read by turns on one machine the same evening:

| Seed | The run | Seconds | Enemies | Bodies built at the end | The most built | Held | Out of the fight | Of them held | A step, ms | In its slowest second, ms | Of real time, % | A step at `bf88bd38`, ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | playing | 180 | 8 | 8 | 8 | 1 | 4 | 0 | 3.32 | 5.81 | 70 | 3.31 |
| 2 | dead | 62 | 8 | 7 | 7 | 2 | 4 | 0 | 3.44 | 4.29 | 51 | 3.46 |
| 3 | dead | 64 | 8 | 8 | 8 | 3 | 4 | 0 | 3.33 | 6.09 | 73 | 3.41 |
| 4 | playing | 180 | 8 | 8 | 8 | 1 | 4 | 0 | 3.53 | 5.28 | 63 | 3.49 |

They are the same runs: the other columns read the same at `bf88bd38`. No body out of the fight
is held in them, at any step: on seeds 2 and 3 the whole party falls where it fights, and on 1
and 4 the hero and two of the three fall and the last stands among the dead, 0.6 to 3.1 m from
them at 180 s (counted at every step by a script that is not kept).

**What the blows' watch costs.** A blow is any two segments of two sides that touch
(`watchBlows`, `src/core/rules/blows.ts`), so the watch asks the engine for the contacts of every
segment that has a fighter of another side given after its own, where a watch of the hands alone
asked for two a fighter. The run gives its party first, the fewer bodies. Seed 4 with two
Warriors following, 120 s, `PhysicsWorld.contactsOf` timed by a wrapper in a script that is not
kept (Node, Rapier, 120 Hz), with every pair near a segment read:

| The watch is given | Bodies read a step | A read, µs | The reads, ms a step |
|---|---|---|---|
| the party, then the enemies | 48 | 5.3 | 0.25 |
| the enemies, then the party | 109 | 5.3 | 0.58 |

The watch refuses a pair it does not want before the engine reads it (`wanted`,
`PhysicsWorld.contactsOf`), as a listener does ([below](#hearing-in-the-step)): most of what is
near a segment is its own body's. The same run, the party first, the process held to three
performance cores: 48 bodies read a step at 1.6 µs a read, 0.08 ms a step, where every pair read
took 5.8 µs and 0.28 ms.

The step with the hands alone read and with every segment read, the party first: the same runs
(a wound changes no body's course while its fighter stands, and each row's other columns are the
same in both), run by turns three times over on one machine, the least of the three:

```powershell
node research/crypt-step.mjs
node research/crypt-step.mjs --companions 2
```

| With the hero | Seed | The run | Seconds | Out of the fight | A step, ms: the hands | every segment | In its slowest second, ms: the hands | every segment |
|---|---|---|---|---|---|---|---|---|
| 0 | 1 | dead | 14 | 1 | 1.41 | 1.48 | 2.87 | 3.15 |
| 0 | 2 | dead | 40 | 2 | 1.80 | 1.84 | 2.98 | 2.79 |
| 0 | 3 | dead | 57 | 2 | 1.45 | 1.47 | 3.17 | 3.14 |
| 0 | 4 | dead | 67 | 2 | 2.64 | 2.66 | 3.68 | 3.71 |
| 2 | 1 | playing | 120 | 3 | 2.63 | 2.73 | 4.31 | 4.65 |
| 2 | 2 | playing | 120 | 3 | 2.40 | 2.52 | 3.80 | 3.91 |
| 2 | 3 | playing | 120 | 2 | 3.08 | 3.21 | 4.18 | 4.39 |
| 2 | 4 | playing | 120 | 4 | 3.40 | 3.66 | 4.80 | 5.07 |

Every segment read, and every pair near it, costs a step 1 to 5 % alone and 4 to 8 % with two
following: 0.02 to 0.26 ms. The hands' column is `80b2f84e`'s and the other `cac25ccc`'s; with
the pairs it does not want refused, the watch gives 0.2 ms of that back on seed 4 with two
following.

## Hearing in the step

`src/dungeon/hearing.ts`. A page hears every body its run has built (`hearRun`): one watch of
touches over all of their segments, beside the run's own watch of blows over the party's, and
each body's air.

Harness: Node, a crypt run with no visuals, the core world, Rapier, 120 Hz; the hero exploring a
generated level with three Warriors following, for 120 s. A seed is played twice in one process,
unheard and heard, a step of each by turns, and the script refuses a pair that ends as two runs.
Heard is as a page hears it, by a listener that does nothing with what it is given, and with the
air asked every step where a page asks once a frame. The process is held to three performance
cores of the development host (an i7-13700H: six performance cores, eight efficiency ones) at
high priority. Left to the scheduler it is moved onto the efficiency cores for seconds at a time:
the same unheard step then reads 12 to 23 ms, and the share between the two runs is lost in it
(one reading of 30 s gave -7.8 %).

```powershell
cmd /c "start /b /wait /high /affinity 54 node research/crypt-step.mjs --seeds 1,2,3,4 --seconds 120 --companions 3 --listen"
```

| Seed | The run | Seconds | Enemies | Bodies built at the end | The most built | Held | Out of the fight | A step, ms | In its slowest second, ms | Of real time, % | Heard: a step, ms | In its slowest second, ms | Hearing, % of the unheard step |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | playing | 120 | 8 | 8 | 8 | 1 | 2 | 4.34 | 6.09 | 73 | 4.72 | 6.62 | 8.6 |
| 2 | playing | 120 | 8 | 7 | 7 | 1 | 2 | 4.73 | 7.13 | 86 | 5.17 | 8.07 | 9.4 |
| 3 | playing | 120 | 8 | 8 | 8 | 0 | 2 | 6.04 | 11.17 | 134 | 6.54 | 11.58 | 8.3 |
| 4 | playing | 120 | 8 | 8 | 8 | 0 | 5 | 4.60 | 6.96 | 83 | 5.09 | 7.27 | 10.5 |

Hearing costs 8.3 to 10.5 % of a step, 9 % over the four runs. Another reading of the same four
gave 9.0, 9.4, 7.7 and 10.7 %. Seed 4, where five bodies lie out of the fight, is the dearest,
and stands at a tenth. The machine was in use through both readings, which shows in the steps
(seed 3's is 6.04 ms in one and 4.19 ms in the other); the share between a pair's two runs, a
step of each by turns, holds.

Nearly all of it is asking the engine what is near each segment. A profile of seed 4's pair over
90 s (Node `--cpu-prof`, the two runs in one profile, so a run is half of it): the watches of
touches, three of them (each run's blows, and the heard run's listener), take 6.9 % of the time.
Of that, 5.4 is the engine's reader (`contactsOf`, `src/core/engine/rapier.ts`), 4.5 of it
Rapier's own list of what is near a shape; 0.5 is remembering each segment's velocity for the
next step and 0.3 is pricing the touches that landed. Asking every body's air takes 0.3.

The engine's reader refuses a pair before it reads it (`wanted`, `PhysicsWorld.contactsOf`).
Over 120 s of seed 1 with three following (Node), the 5 to 8 bodies built have 110 segments a
step and 640 pairs near them (403 to 815, the 5th to the 95th per cent of the steps): 27 are with
something fixed (12 to 43), and 563 lie between a body's own neighbouring segments, which no
watch wants. Reading a pair makes objects of Rapier's for its manifold: a body's contacts read
with every pair near it take 5.8 µs, and with the unwanted ones refused 1.6 µs
([above](#bodies-in-the-step)).

What is left is the asking: with eight bodies, 144 segments a step, and a call out of Rapier for
each pair near one. Rapier can tell of a contact as it starts and as it ends instead; a watch on
that would read only what began. It is not built ([roadmap](../roadmap.md)).

## Targets

`src/dungeon/run.ts`, for a hero whose facing the cursor steers.

- `AIM_COSINE`: the hero picks targets from a cone about the cursor's direction whose half-angle
  has a cosine of 0.3: 73 degrees.
- `SET_UPON`: it also takes on any enemy within 2.5 m wherever it stands, and keeps it out to
  3.5 m, so that one circling at 2.5 m is not swapped at every look.

**Set, not measured.** The rule was written against a run in which a hero facing the cursor stood
being hit by an enemy behind it, read on a body and an engine that are gone
(`src/dungeon/run.ts@c4c71cb8`). How long a hero stands being hit from behind on the core, with
the rule and without, is a measurement to make.

## Following

`src/dungeon/run.ts`: how a body walks the path the run plans for it.

- `FOOTPRINT_METRES`: a path keeps 0.35 m from rock. The tops of the Warrior's upper arms are
  0.46 m apart and the arm is 0.05 m in radius (Node stand, the body as its spec writes it), so
  the shoulder's outer face is 0.28 m from the body's middle, and 0.07 m is left for the stance's
  sway. In that pose the elbows stand 0.38 m out, wider than the footprint.
- `STALL`: a body with a route that has not moved 0.05 m in 1 s has its route planned again
  from where it is. The slowest walker, the skeleton, walks at 0.2 m/s
  (`assets/core/stance-envelope.json`): four times that in a second.
- `TRAIL_METRES`: a companion with no post walks after the hero once it is 2.5 m behind, which
  is clear of the 1.8 m the hero attacks from.
- `SLOTS`: several members sent to one floor point take slots about it, no two within 1.3 m: the
  point, then eight bearings on a ring of 1.4 m, then of 2.8 m.
- `AVOID`: a walker steps round a body in its way. A body is in the way within the two
  footprints and 0.15 m of the walker's line, and no more than 1 m beyond that along it. The step
  aside is the walk turned 1.05 rad away from the body, a body within 0.05 m of the line counting
  as on one side; it is taken if the point 0.65 m along it is floor and no more than 0.05 m
  nearer the body, and the other way is tried if not.
- `MOVING`, 0.1, is a numeric setting: a walk is a unit step or none.

## Run timing

`RUN_TIMING` (`src/dungeon/run.ts`), s:

| Field | Value |
|---|---|
| `replan` | a walker with no route plans no sooner than 0.5 after its last plan |
| `perceive` | who sees whom is read every 0.2 |
| `alerted` | an enemy goes on to where it last saw the party for 7 after losing sight of it, then goes home |

## Arrival

`ARRIVAL` (`src/dungeon/run.ts`), how near counts as there, m:

| Field | Value |
|---|---|
| `waypoint` | a route's next point, 0.3 |
| `point` | a point of an order, or where an enemy is going, 0.4 |
| `post` | a companion's post, 0.6 |
| `explored` | the hero's goal while it explores, 0.5 |
| `lastSeen` | where a locked target was last seen, 0.5 |
| `goalMoved` | a goal that has moved more than 0.65 is planned for again |
| `exit` | the run is won within 1.1 of the exit |

## Companions

`COMPANION_SPAWN` (`src/dungeon/party-placement.ts`): a companion starts on the first of twelve
bearings, from -z of the start round, on a ring of 1.6 m about it, then 2.4 m, then 3.2 m, where
0.7 m of floor is clear about it and along the line from the start, and nobody already placed is
within 1.4 m.

## The crypt

`CRYPT_LAYOUT` (`src/dungeon/crypt-dungeon.ts`), the Random Crypt's layout
([the crypt's art](../art/crypt.md#random-crypt)), in cells of 1 m.

| Field | Value |
|---|---|
| `size` | the map is 44 cells a side |
| `first`, `pitch` | four rooms, two by two: the first's centre is 12 cells from the map's corner, and a neighbour's 20 cells on |
| `half` | half a room's side is 5 cells and a draw of 0, 1 or 2 more (one of 3), along x and along z; a chapel's is 5 along x and 7 along z |
| `cornerCut` | a rootbound room keeps as rock the cells fewer than 2 steps from a corner |
| `corridorHalf` | a corridor is 1 cell wide either side of its middle line: 3 cells |
| `variants` | a kind of room has 3 arrangements ([look](look.md#crypt-rooms)) |
| `spawns` | 2 enemies in each room but the entrance |
| `spawnFromStart`, `spawnFromDoor`, `spawnSpacing` | an enemy starts more than 15 m from the party's start, 3 m from every door and 2 m from the other |
| `companions` | the entrance has room for 3 companions (`COMPANION_SPAWN`) |

A body stands, and a path is proved, with `LEVEL.clearance` about it, as in the level below.

## The level

`LEVEL` (`src/dungeon/level.ts`), the generator's table. A level is laid out on a grid of blocks
and carved into cells of 1 m.

| Field | Value |
|---|---|
| `blocks`, `block` | 17 blocks a side, each 3 m |
| `clearance` | 0.65 m: see below |
| `roomMin`, `roomMax` | a room is 2 to 4 blocks a side |
| `corridorMax` | a corridor is 1 or 2 blocks long |
| `maxRooms`, `minRooms` | at most 11 rooms; a layout with fewer than 6 is drawn again |
| `branchChance`, `branchDecay` | each side of a room of the spine grows a room with a chance of 0.75, and of a room a branch grew with 0.8 of its parent's |
| `attempts` | 4 room sizes are tried on one side of a room |
| `dividerChance`, `dividerMinBlocks` | a room 4 blocks long or longer is divided with a chance of 0.6 |
| `doorChance` | a link gets a door with a chance of 0.6 |
| `spawnCount`, `spawnFromStart`, `spawnSpacing` | 8 enemies, each at least 10 m from the start and 2 m from one another |
| `minExitPath` | the walk from start to exit is at least 24 m |
| `loops`, `loopMinDetour`, `minLoops` | at most 3 loops, each cutting 6 blocks of walking or more; at least 1 |
| `candidates`, `tries` | 12 levels are drawn a seed, from no more than 40 layouts a level, and the best kept |
| `score` | a loop is worth 3, a dead end -1, a metre from start to exit 0.15, a room 0.5 |

`score` was set by eye with `scripts/dungeon/print-level.mjs`: a loop is worth three dead ends,
and 20 m more between start and exit is worth one loop.

`LEVEL.clearance` is the radius the generator keeps clear of rock about every place a body is
asked to stand, start, exit and spawns among them, and the radius it proves the level joined at.
It is 0.30 m wider than the 0.35 m a walker's path keeps (`FOOTPRINT_METRES`). It was written as
the widest hero and a margin, for a body that is gone, and the sum is not recorded: the
Warrior's shoulders are 0.28 m from its middle now, which would make the margin 0.37 m.
