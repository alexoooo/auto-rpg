# What a step costs

What one world step (`World.step`, `src/core/world.ts`) takes in time and in memory, as bodies are
added, in a bout and in a crypt run: where the time goes, what a step allocates, what the collector
takes, and which steps are long and why.

Every figure here is wall time or bytes read in **Node 24.19, the core world, Rapier, 120 Hz, one
thread of the development host** (a 16-core desktop), with nothing else running on it. A step is
8.33 ms of the game's time, so a step of 8.33 ms is real time with nothing drawn; a page at 60
frames a second takes two steps a frame and draws. None of it is read on a page yet.

The bytes and the counts are the same on any machine. The times are this machine's: compare rows
of one run.

```powershell
node research/step-garbage.mjs --bodies 1,2,4,8,10,12,16,24,32,48
node research/step-time.mjs --profile
node research/step-garbage.mjs --sites
node research/crypt-plan.mjs --seeds 1,2,3,4
node research/rest-probe.mjs
node research/rest-probe.mjs --bodies 4
```

## Bodies in a step

`research/step-garbage.mjs`. Skeletons with the club, 3 m apart on a ground, each under the command
layers with an order to stand, as `research/body-cost.mjs` stands them
([play.md](play.md#bodies-in-the-step)). A row is one count in a process of its own: 1200 steps
timed after 3 s, with every collection inside them (`PerformanceObserver`), then 240 steps under
V8's sampling heap profiler (`allocatedIn`, `tests/harness/garbage.mjs`). Nobody fell in any row.

| Bodies | A step, ms | Its 99th per cent, ms | The longest, ms | Of real time, % | Allocated a step, MiB | A body, KiB | Steps to a scavenge | A scavenge, ms | The longest pause, ms | Collections of the whole heap | The collector, % of the step |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 0.64 | 1.19 | 2.39 | 8 | 0.66 | 675 | 27 | 0.24 | 0.70 | 0 | 1.4 |
| 2 | 1.17 | 1.71 | 2.16 | 14 | 1.20 | 612 | 14 | 0.23 | 0.36 | 0 | 1.4 |
| 4 | 2.30 | 3.34 | 4.63 | 28 | 2.09 | 535 | 7 | 0.23 | 0.50 | 0 | 1.4 |
| 8 | 4.73 | 6.55 | 8.51 | 57 | 4.31 | 552 | 4 | 0.26 | 1.05 | 0 | 1.3 |
| 10 | 5.73 | 9.00 | 11.60 | 69 | 5.39 | 552 | 4 | 0.27 | 1.15 | 0 | 1.1 |
| 12 | 7.12 | 8.68 | 12.63 | 85 | 6.30 | 537 | 4 | 0.29 | 1.22 | 0 | 1.1 |
| 16 | 9.22 | 12.11 | 18.09 | 111 | 8.56 | 548 | 4 | 0.31 | 1.90 | 2 (2 ms) | 0.9 |
| 24 | 14.45 | 20.12 | 25.66 | 173 | 12.68 | 541 | 3 | 0.33 | 3.01 | 4 (6 ms) | 0.9 |
| 32 | 18.82 | 25.17 | 30.86 | 226 | 16.92 | 541 | 3 | 0.38 | 2.86 | 4 (5 ms) | 0.8 |
| 48 | 29.40 | 36.05 | 44.67 | 353 | 25.36 | 541 | 2 | 0.46 | 7.42 | 6 (14 ms) | 0.7 |

- **A body under control costs 0.58 to 0.61 ms a step**, and the step is the bodies' sum: nothing
  in it grows faster than the count. Fourteen bodies are real time with nothing drawn; eight are
  57 % of it.
- **A body allocates about 0.54 MiB a step**: 65 MiB a second for one body, half a gigabyte a
  second for eight.
- **The collector takes about 1 % of the step at every count.** What a step allocates dies in the
  step, so a scavenge finds almost nothing alive and takes 0.2 to 0.5 ms whatever was allocated.
  V8 grows the young generation with the rate, so a scavenge comes every 2 to 4 steps from eight
  bodies on. Its longest pause is 1.2 ms or less to twelve bodies, 3 ms at 24 to 32, and 7.4 ms at
  48, where the whole heap is collected six times in ten seconds.
- So what bounds the bodies in a step is the work each takes, not the collector. The allocation
  costs the code that makes it, which a collector's pause does not show
  ([Where a bout allocates](#where-a-bout-allocates)).

## A bout's step

`research/step-time.mjs`. One arena bout, the Warrior against the Rogue, each with the club, to
its verdict at 1145 steps (9.54 s), played four times in one process, a world each. A bout plays
the same to the bit each time, so step k is the same work in every playing: the least of its times
over the last three playings is what that work takes, and what a playing took beyond it was the
machine's or the collector's.

| | Mean, ms | Median | 99th per cent | 99.9th | The longest |
|---|---|---|---|---|---|
| A step, the least over three playings | 1.487 | 1.167 | 9.306 | 10.787 | 11.290 |
| The solver's part (`PhysicsWorld.step`) | 0.511 | 0.507 | 0.641 | 0.693 | 0.723 |
| The rest: senses, minds, motor control, blows | 0.973 | 0.669 | 8.659 | 10.142 | 10.589 |

- The solver's step is even: its longest is 1.4 times its mean.
- The rest is not. Its median is 0.67 ms and **42 steps in a row, a third of a second, take 6 to
  11 ms each**: steps 1028 to 1069, every one over the step's 8.33 ms from step 1037 on. The
  eight dearest are 9.8 to 11.3 ms with the solver's part 0.61 to 0.69. They are the same steps in
  every playing, so they are the work, and the work is the reach solver's
  ([The reach solver at its cap](#the-reach-solver-at-its-cap)).
- The collector, over the 3435 steps read: 232 scavenges, one every 15 steps, 0.28 ms each and
  1.37 ms the longest; one mark-compact of 1.74 ms; one incremental marking step of 0.26 ms. Of
  the 145 steps over 3 ms, 67 had a collection inside: they are the reach solver's steps, which
  allocate most.

### Where a bout's time goes

The same bout once more under V8's CPU profiler at 100 us (`--profile`), each function with
everything it calls, as a share of the profile (1975 ms, of which the profiler's own calls are
5 %).

| Of the bout, % | What |
|---|---|
| 93.3 | `World.step` |
| 55.7 | the two bodies' muscle hooks (`driveMuscles`): reading the joints, the mind, the motors |
| 47.7 | the minds' steps (`embody`), of which motor control (`motor.ts`'s `control`) is 45.0 |
| 32.1 | the solver (`PhysicsWorld.step`), 30.7 inside Rapier's wasm |
| 17.0 | the stance's root solve (`stance.carry`, `carryRoot`), of which `shareGroundWrench` is 16.0 and its `activeSet` 8.9 |
| 15.0 | the hands' reach (`solveAt`, `solveReach`), in 48 of the 1145 steps |
| 9.0 | the stance's limbs (`stance.bear`, `bearLimbs`) |
| 4.0 | the body's dynamics (`bodyDynamics.update`) |
| 3.2 | the joints' angles (`jointTracker.update`) |
| 3.1 | the senses' read of every segment (`createSenses`) |
| 2.2 | the touches the sound is made from (`src/core/touches.ts`) |

By file, each function's own body: Rapier's wasm 31.6, `math/linalg.ts` 12.9,
`control/contact-wrench.ts` 11.9, `control/kinematics.ts` 7.3, `build/joint-state.ts` 4.6,
`math/real.ts` 4.0, `build/dynamics.ts` 3.7, `control/bearing.ts` 2.8, `mind/senses.ts` 2.6,
`control/servo.ts` 1.9.

Tactics and skills are under 1 %: deciding what to do costs a step nothing next to carrying it out.

### The reach solver at its cap

A hand sent to a place (`BodyCommand`'s places, `motor.ts`'s `solveAt`) is solved three times a
step, at the path's point a step back, now and a step on, so its freedoms' rates and accelerations
are differences of the three. Each solve is `solveReach` (`src/core/control/kinematics.ts`), damped
least squares from the last step's answer, to at most 200 passes (`IK_PASSES`) or until no angle
moves 1e-10 rad in a pass (`IK_TOLERANCE`).

Read with a counter put into `solveReach` for the reading and taken out again, in three bouts:

| Bout | Steps | Steps with a reach | Solves | Solves that ran all 200 passes | Passes in a step with a reach: the median, the most |
|---|---|---|---|---|---|
| Warrior against Rogue | 1145 | 48 | 144 | 117 | 600, 600 |
| Skeleton against skeleton | 2236 | 0 | 0 | 0 | |
| Warrior against skeleton | 1578 | 0 | 0 | 0 | |

A solve that ends does so in 25 to 59 passes. The 117 that do not are of two kinds, by how the last
six passes moved:

- **At its place, and never still.** The point is at its target to the tenth of a millimetre, and
  every pass still moves an angle by 2e-10 to 1e-8 rad, never under the 1e-10 it stops at. The
  Jacobian is read by differences of 1e-7 rad (`IK_STEP`), which leaves it rounding of about 1e-9;
  the posture's pull is projected through it, so the step never falls under that. The solve was
  done by about the 30th pass and runs the other 170.
- **Out of reach, and turning back and forth.** With the target 0.24 to 0.45 m beyond the hand and
  a freedom at its stop, every pass turns the most a pass may (`IK_TURN`, 0.2 rad) and the next
  turns it back: the distance left alternates between two values (0.4098 and 0.3642 m in one
  solve) to the 200th pass. What the solve returns is whichever end of the swing the 200th pass
  is.

Tried on the Warrior against the Rogue, each a change of the solve alone:

| The solve | Solves at 200 passes | Passes in a step with a reach, median | The bout |
|---|---|---|---|
| As it is | 117 of 144 | 600 | the Warrior, by a fatal blow, at 9.54 s |
| The turn a pass may take halved whenever the distance left did not fall | 74 of 288 | 201 | the Warrior, fatal, 14.01 s |
| That, stopping at 1e-8 rad | 71 of 288 | 65 | the Warrior, fatal, 14.21 s |
| That, stopping at 1e-7 rad | 103 of 432 | 53 | the Warrior, by a fall, 20.20 s |
| That, stopping at 1e-6 rad | 72 of 288 | 40 | the Warrior, by a fall, 13.57 s |

A looser stop ends the solves that were at their place. Halving the turn does not end the ones out
of reach: once the turn is small the distance falls a little every pass, so it is never halved
again and the solve creeps to its cap. Each row is another bout, since the answers differ. The
remedy is not found; it is the roadmap's ([roadmap](../roadmap.md#body-and-motor-control)).

### Where a bout allocates

`research/step-garbage.mjs --sites`: the same bout from 2 s to its verdict, 905 steps, under the
sampling heap profiler: **1905 KiB a step**, 0.93 MiB a body.

By file, each function's own body:

| KiB a step | Of all, % | Where |
|---|---|---|
| 361 | 18.9 | `src/core/math/linalg.ts` |
| 346 | 18.1 | native: `Array.prototype.map`, array iterators, `Array.from` |
| 280 | 14.7 | `src/core/build/dynamics.ts` |
| 263 | 13.8 | `src/core/control/contact-wrench.ts` |
| 235 | 12.3 | `src/core/control/kinematics.ts` |
| 117 | 6.1 | `src/core/build/joint-state.ts` |
| 60 | 3.2 | Rapier's JavaScript binding |
| 59 | 3.1 | `src/core/control/bearing.ts` |
| 47 | 2.5 | `src/core/math/real.ts` |
| 34 | 1.8 | `src/core/engine/rapier.ts` |
| 22 | 1.2 | `src/core/control/support.ts` |
| 18 | 1.0 | Babylon's vectors |

By function, with everything it calls:

| KiB a step | Of all, % | What |
|---|---|---|
| 1778 | 93.3 | the two bodies' muscle hooks |
| 1358 | 71.3 | motor control (`motor.ts`'s `control`) |
| 550 | 28.9 | `shareGroundWrench`, of which `activeSet` 297 |
| 514 | 27.0 | `solveReach`, in the steps a hand reaches |
| 495 | 26.0 | `carryRoot`, of which `limitToPatches` 303 |
| 292 | 15.3 | `bodyDynamics.update` |
| 274 | 14.4 | `bearLimbs`, of which `solveLimb` 168 |
| 80 | 4.2 | the senses and the minds above motor control |
| 64 | 3.4 | the touches |
| 42 | 2.2 | the engine's step: its binding's wrappers for each body's pose |

What is allocated is small arrays: a matrix as an array of row arrays made for each solve
(`solveLinear` copies its matrix; `activeSet` builds its system afresh every iteration), a vector
as a three-number array returned from each cross product, a closure for each loop written as
`map` or `forEach`, and a wrapper object for each vector read from the engine.

## The crypt's plan in the step

`research/crypt-plan.mjs`. A crypt run with no visuals, the hero exploring by itself with three
Warriors following, to the run's end or 90 s; every step timed with the run's own planning inside
it (`DungeonRun.plan`: who is built and held, who sees whom, each walker's path). The first 2 s are
not read. A row is a level's seed.

| Seed | The run | Seconds | Bodies built | A step, ms: mean / 99th per cent / longest | The plan in it, ms: mean / 99th per cent / longest | Steps over 8.33 ms | Plans over 1 ms | Plans over 4 ms |
|---|---|---|---|---|---|---|---|---|
| 1 | playing | 90 | 8 | 3.77 / 6.99 / 12.78 | 0.11 / 2.41 / 4.97 | 27 of 10560 | 387 | 3 |
| 2 | dead | 62 | 7 | 3.58 / 7.15 / 15.60 | 0.12 / 3.18 / 6.85 | 17 of 7146 | 203 | 6 |
| 3 | dead | 64 | 8 | 3.50 / 8.26 / 12.05 | 0.14 / 3.36 / 5.80 | 72 of 7424 | 307 | 20 |
| 4 | playing | 90 | 8 | 4.18 / 9.36 / 14.90 | 0.16 / 4.70 / 8.89 | 181 of 10560 | 439 | 158 |

The ten slowest steps of each run, with the plan's part in brackets, ms:

- Seed 1: 12.8 (0.0), 10.9 (0.1), 10.5 (0.1), 10.3 (4.6), 10.3 (0.0), 9.5 (3.9), 9.4 (2.6),
  9.3 (2.1), 9.2 (0.1), 9.2 (0.0).
- Seed 2: 15.6 (0.0), 10.9 (6.9), 10.3 (4.2), 9.2 (4.2), 9.1 (3.6), 9.0 (0.1), 8.9 (3.6),
  8.8 (3.5), 8.8 (4.5), 8.7 (3.5).
- Seed 3: 12.1 (0.1), 11.5 (4.2), 11.3 (5.2), 10.9 (4.2), 10.9 (4.6), 10.7 (4.1), 10.3 (4.1),
  10.3 (4.8), 10.2 (4.1), 10.2 (0.1).
- Seed 4: 14.9 (6.4), 14.9 (6.0), 14.6 (7.1), 13.7 (8.9), 12.6 (7.0), 12.3 (6.8), 12.2 (5.8),
  12.1 (6.6), 11.9 (6.3), 11.7 (6.4).

- The plan is 3 to 4 % of a run's steps in the mean and **half of its slowest steps**: on seed 4
  every one of the ten slowest has 6 to 9 ms of planning in it.
- A plan over 1 ms comes about five times a second, which is how often the run reads who sees
  whom (`RUN_TIMING.perceive`, 0.2 s): the party's sight is read cell by cell for each member
  (`reveal`), and an enemy's line to each member (`canSee`). The plans over 4 ms have a path
  search in them as well (`findPath`, `explorationGoal`).
- The slow steps with no plan in them are the bodies': the reach solver's, as in a bout.

## A limp body put to sleep

`research/rest-probe.mjs`. A body out of a crypt fight lies limp and costs the solver 0.28 ms a
step ([play.md](play.md#bodies-in-the-step)); no body of the core's sleeps
(`setCanSleep(false)`, `src/core/engine/rapier.ts`). The probe stands skeletons with the club,
lets them go limp, and 5 s on puts every segment to sleep through the binding's own rigid body
(`RigidBody.sleep`), which the engine seam does not offer.

| Bodies | Standing, ms a step | Limp | Asleep, the next 5 s | Segments still asleep at their end | The fastest segment then, m/s | A 5 kg ball dropped on the first body |
|---|---|---|---|---|---|---|
| 4 | 2.22 | 1.11 | 0.03 | 64 of 64 | 0.000 | its 16 segments wake, no other |
| 8 | 4.41 | 2.21 | 0.21 | 80 of 128 | 49.0 | its 16 segments wake, no other |

- Asleep, a body costs a step under 0.01 ms, and a touch wakes the body touched and no other.
- With eight, three bodies woke of themselves within the 5 s and a segment read 49 m/s. It is the
  same every time the probe runs. What wakes them and what throws the segment is not read, so a
  body is not put to sleep in the game.
