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
node research/reach-bed.mjs
node research/step-garbage.mjs --sites
node research/crypt-plan.mjs --seeds 1,2,3,4
node research/crypt-plan.mjs --seeds 1,2,3,4 --profile
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
its verdict at 1145 steps (9.54 s), played four times in one process, a world each. This section,
with its profile and what it allocates, is the bout as it was before the reach's Jacobian was in
closed form (`src/core/control/kinematics.ts@889b3c3d`); the bout with it is read in
[The reach solver at its cap](#the-reach-solver-at-its-cap). A bout plays
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
moves 1e-10 rad in a pass (`IK_TOLERANCE`). A solve says how many passes it took and whether it
stopped of itself (`ReachEnd`), and motor control sums them for each body (`ReachMeter`), which
`research/step-time.mjs` prints.

Its Jacobian is the kinematics' own derivative in closed form (`reachJacobianTo`): the point's
velocity for a unit of each freedom's rate, from the joint's own axes (`motionAxesToRef`,
`turningToRef`, `src/core/build/joint-state.ts`), one walk of the chain a pass. Against central
differences of 1e-5 rad over 200 poses drawn across each freedom's range, on the Warrior's arm
(joints of 3, 3, 3, 1 and 3 freedoms) and leg (3, 1, 2), it is within 9.9e-11 m/rad, and
`tests/core-reach.test.mjs` holds it within 1e-8. The Jacobian it replaced was read by forward differences of
1e-7 rad (`@889b3c3d`), within 8.8e-8 of the same.

**The bed.** The 144 solves of the bout as it was at `889b3c3d` (all of them the Rogue's right arm,
steps 1022 to 1069), each as it was asked: its chain, the angles it started from, its freedoms and
its tasks (`tests/fixtures/reach-solves.json`). Each is solved again alone, so two solves are
judged on the same questions where in a bout every change of the solve is another bout.
`node research/reach-bed.mjs`, kinematics alone, Node core stand; the two rows read one after the
other on a quiet machine, a pass's time the least of seven readings of the 144.

| The Jacobian | At 200 passes | All passes | Of those that end: median, most | At their place (0.1 mm), and of them at the cap | Solved again from its answer, the most an angle moves | A step's three: the greatest second difference | A pass |
|---|---|---|---|---|---|---|---|
| Differenced (`@889b3c3d`) | 117 of 144 | 24583 | 27, 146 | 102, 75 | 1.8e-9 rad where it ended, 3.7e-2 where it did not | 0.2949 rad | 10.65 us |
| In closed form | 43 of 144 | 11470 | 28, 109 | 102, 1 | 7.6e-11 rad where it ended, 3.7e-2 where it did not | 0.2949 rad | 9.86 us |

- **A solve at its place ends**, but one: solve 98, with a freedom of the wrist at its stop, is
  1.1e-9 m from its place and still closing at the cap. Solved again from its answer it ends in
  42 passes, having moved under 1e-9 rad.
- **The other 42 at the cap are of a place out of reach**, 6.6 mm to 0.49 m beyond the hand.
- A pass costs no more than it did, and the 144 solves take 113 ms where they took 262.

In the bout, `node research/step-time.mjs` read one after the other on a quiet machine, each step
the least of its times over three playings:

| The Jacobian | Steps, and how it ends | Solves, at the cap, all passes | A step, ms: mean, median, 99th per cent, longest | The rest beside the solver, ms: mean, 99th per cent | Steps over 3 ms in three playings |
|---|---|---|---|---|---|
| Differenced (`@889b3c3d`) | 1145: the Warrior, by a fatal blow, at 9.54 s | 144, 117, 24583 | 1.547, 1.225, 9.337, 11.294 | 0.998, 8.660 | 144 of 3435 |
| In closed form | 1244: the Warrior, by a fall, at 10.37 s | 144, 43, 11469 | 1.418, 1.165, 7.767, 10.355 | 0.908, 7.117 | 70 of 3732 |

- The steps over 3 ms are halved and **the longest are left**: the eight dearest, steps 1057 to 1068,
  take 8.7 to 10.4 ms, each with the solver's 0.64 to 0.70. They are the steps whose three solves
  are out of reach and each runs its 200 passes. They go with a solve whose answer out of reach
  is defined ([below](#the-reach-solvers-remedies-tried)).

Read with a counter put into `solveReach` at `8d783172`, before the meter, in three bouts:

| Bout | Steps | Steps with a reach | Solves | Solves that ran all 200 passes | Passes in a step with a reach: the median, the most |
|---|---|---|---|---|---|
| Warrior against Rogue | 1145 | 48 | 144 | 117 | 600, 600 |
| Skeleton against skeleton | 2236 | 0 | 0 | 0 | |
| Warrior against skeleton | 1578 | 0 | 0 | 0 | |

With the Jacobian differenced, a solve that ended did so in 25 to 59 passes, and the 117 that did
not were of two kinds, by how the last six passes moved:

- **At its place, and never still.** The point was at its target to the tenth of a millimetre,
  and every pass still moved an angle by 2e-10 to 1e-8 rad, never under the 1e-10 it stops at.
  The Jacobian was read by differences of 1e-7 rad, which left it rounding of about 1e-9; the
  posture's pull is projected through it, so the step never fell under that. The solve was done
  by about the 30th pass and ran the other 170. The closed form ends these.
- **Out of reach, and turning back and forth.** With the target 0.24 to 0.45 m beyond the hand and
  a freedom at its stop, every pass turns the most a pass may (`IK_TURN`, 0.2 rad) and the next
  turns it back: the distance left alternates between two values (0.4098 and 0.3642 m in one
  solve) to the 200th pass. What the solve returns is whichever end of the swing the 200th pass
  is.

Tried on the Warrior against the Rogue at `8d783172`, with the Jacobian differenced, each a change
of the solve alone:

| The solve | Solves at 200 passes | Passes in a step with a reach, median | The bout |
|---|---|---|---|
| As it was | 117 of 144 | 600 | the Warrior, by a fatal blow, at 9.54 s |
| The turn a pass may take halved whenever the distance left did not fall | 74 of 288 | 201 | the Warrior, fatal, 14.01 s |
| That, stopping at 1e-8 rad | 71 of 288 | 65 | the Warrior, fatal, 14.21 s |
| That, stopping at 1e-7 rad | 103 of 432 | 53 | the Warrior, by a fall, 20.20 s |
| That, stopping at 1e-6 rad | 72 of 288 | 40 | the Warrior, by a fall, 13.57 s |

A looser stop ends the solves that were at their place. Halving the turn does not end the ones out
of reach: once the turn is small the distance falls a little every pass, so it is never halved
again and the solve creeps to its cap. Each row is another bout, since the answers differ, so the
rows say little of the solve itself: the next table asks every solve the same questions.

### The reach solver's remedies, tried

The bed's 144 solves, by `solveReach` with its Jacobian differenced (`@889b3c3d`) and by scratch
copies of it at `8d783172`. So every row answers the same 144 questions. The closed form is the
solve in the tree, and `node research/reach-bed.mjs` reads its row again. Read beside the passes:

- **Solved again**: the solve run once more from its own answer, and the most any angle moves. An
  answer is one a second solve leaves alone.
- **Farther, nearer**: the solves that end farther from their place than the differenced solve
  does, and nearer.

| The solve | At 200 passes | All passes | Of those that end: median, most | Farther, nearer | Solved again, rad |
|---|---|---|---|---|---|
| Differenced | 117 of 144 | 24583 | 27, 146 | | 1.8e-9 where it ended, 3.7e-2 where it did not |
| **The Jacobian in closed form**, the solve in the tree | 43 | 11470 | 28, 109 | 16 (by 0.036 mm at most), 4 | 7.6e-11 where it ended |
| That, and a step refused when the error grows: the damping four times on a refusal, halved on a step taken | 0 | 4024 | 27, 142 | 0, 42 | 0.20 |
| The same on the differenced Jacobian | 48 | | | | |
| Closed form, and the turn a pass may take halved on a refusal and doubled on a step taken | 28 | 12113 | | 3, 39 | 9.8e-2 |
| Closed form, both of those | 0 | 3979 | | | 0.44 |
| Closed form, the place's step refused alone and the posture's pull taken whatever | 43 | 11470 | | 2, 37 | |
| Closed form, the pull taken by halves with the place's step put right after it | 35 | 11310 | | | 0.62 |
| Closed form, the pull dropped on a refusal, then the damping raised | 39 to 40 | 9212 to 10899 | | | 0.77 |

- **The closed form ends the solves that were at their place**: 74 of the 117. Where the
  differenced solve ended, the two answers are within 1.2e-8 rad. All passes fall by more than
  half.
- **The 43 left are the ones out of reach (but solve 98, above), and no rule of the step ends
  them.** The rows that read 0 at the cap are not cures: 69 of the solves in the third row end because the damping has
  grown until nothing moves, and solved again from where they stopped their angles move 0.2 rad.
  A count of solves at the cap reads the same for a solve that converged and one that gave up;
  the reading that tells them apart is the solve taken again.
- The same holds across a step. A hand's three solves a step apart are differenced for its rate
  and its acceleration (`solveAt`), so three answers that are not the same function of their
  place make an acceleration of nothing: the greatest second difference of a step's three is
  0.29 rad with either Jacobian and 0.56 with the pull dropped on a refusal.
- Why out of reach has no still point: the posture's pull is asked in the directions that leave
  the place where it is, to first order. Where the place is reached those are the directions the
  answers lie along. Out of reach they are not: the pull bends the elbow and turns the shoulder
  to hold the point, the point falls back by the second order, the place's step straightens the
  arm again, and near a straight arm each over-corrects the other (the angles alternate, each
  pass about 0.93 of the last and against it). The remedy is a solve whose answer out of reach
  is defined, which is a design and not a rule of its step; it is the roadmap's
  ([roadmap](../roadmap.md#body-and-motor-control)).

In the bout, each a bout of its own, read with the counter in scratch copies:

| The solve | Steps, and how it ends | Solves at 200 passes | Passes in a step with a reach: median, most |
|---|---|---|---|
| Differenced | 1145: the Warrior, by a fatal blow, at 9.54 s | 117 | 600, 600 |
| The Jacobian in closed form | 1244: the Warrior, by a fall, at 10.37 s | 43 | 89, 600 |
| That, and a step refused when the error grows | 1270: the Warrior, by a fall, at 10.58 s | 0 | 70, 175 |

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

### Control written into arrays made once

The step's dearest functions are written to do the same operations in the same order on the same
numbers as the readable form they replace, in arrays made once with the body's control (a matrix
its rows end to end), with loops for `map` and `reduce` and no closure: every bout, run and
fingerprint is the same to the bit (`node scripts/fingerprint.mjs`, the bout's digest
`c7bab8ed0472a94d`). A row is a change landed, read before and after it: the bout
(`research/step-time.mjs`, the least of three playings, read twice), one and eight skeletons
standing (`research/step-garbage.mjs --bodies 1,8`), and what a body's step allocates, the
highest of five readings each in a process of its own (`tests/harness/step-allocation.mjs`, the
fixtures `tests/core-step-cost.test.mjs` holds under a ceiling).

| | A bout's step, mean ms | Its median, ms | One body standing, ms | Eight, ms | Standing, KiB a body a step | The bout, KiB a body a step |
|---|---|---|---|---|---|---|
| Before | 1.447, 1.441 | 1.192, 1.184 | 0.62 | 4.41 | 603 | 654 |
| The ground's wrench (`shareGroundWrench`, `activeSet`) | 1.168, 1.194 | 1.012, 1.039 | 0.53 | 3.66 | 379 | 437 |
| Bearing on limbs (`carryRoot`, `bearLimbs`; `src/core/math/flat.ts`) | 1.045, 1.068 | 0.890, 0.911 | 0.48 | 3.16 | 267 | 319 |
| The body's dynamics and its joints (`bodyDynamics`, `joint-state.ts`) | 0.997, 1.018 | 0.851, 0.870 | 0.45 | 2.98 | 80 | 128 |

- **The ground's wrench**: on the bout's own 4576 calls, each asked as the bout asked it and
  answered alone, the least of nine passes, 57.2 us a call before and 12.5 after, all 68544
  numbers the same. Under the CPU profiler it was 20.7 % of the bout and is 5.4 %: 0.33 ms of a
  two-body step to 0.07. The bout from 2 s to its verdict allocates 1137 KiB a step against
  1856 (`--sites`).
- **Bearing on limbs**: `carryRoot` with what it calls was 14.9 and 14.4 % of the bout under the
  CPU profiler and is 6.1 and 6.3 %: 0.17 ms of a two-body step to 0.07. Its solves are
  `flat.ts`'s, each the twin of one in `linalg.ts` (`tests/core-flat.test.mjs`). The bout from 2 s
  to its verdict allocates 933 KiB a step against 1137 (`--sites`).
- **The body's dynamics and its joints**: the bout from 2 s to its verdict allocates 495 KiB a step
  against 933 (`--sites`): `dynamics.ts` 280 KiB of it to none, `joint-state.ts` 146 to 16. Under
  the CPU profiler the joints' trackers were 4.9 and 4.0 % of the bout and are 2.6 and 2.7; the
  dynamics' update was 6.5 and 6.7 % and is 6.8 and 7.4, its time the same. The rest of the step's
  gain is the collector's: a scavenge every 33 and 30 steps of the bout to every 63 and 67, its
  99th per cent step 7.47 and 7.45 ms to 6.50 and 6.54, and the collector's share of one body
  standing 0.9 % to 0.3.

## The crypt's plan in the step

`research/crypt-plan.mjs`. A crypt run with no visuals, the hero exploring by itself with three
Warriors following, to the run's end or 90 s; every step timed with the run's own planning inside
it (`DungeonRun.plan`: who is built and held, who sees whom, each walker's path). The first 2 s are
not read. A row is a level's seed. These are read with sight sample by sample, before it was read
through an index ([below](#sight-read-through-an-index)).

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
  (`reveal`), and an enemy's line to each member (`canSee`).
- The slow steps with no plan in them are the bodies': the reach solver's, as in a bout.

The same runs under V8's CPU profiler at 100 us (`--profile`), from their first step: microseconds
a step in the mean, each function with everything it calls.

| Seed | The run | Steps | A step | `plan` | `reveal` | `canSee` | `walkable` | `findPath` | `explorationGoal` |
|---|---|---|---|---|---|---|---|---|---|
| 1 | playing | 10800 | 3758 | 108.2 | 78.6 | 66.7 | 68.5 | 0.4 | 0.2 |
| 2 | dead | 7386 | 3683 | 114.0 | 89.1 | 84.2 | 78.2 | 0.1 | 0.0 |
| 3 | dead | 7664 | 3663 | 148.3 | 117.7 | 109.1 | 103.2 | 0.2 | 0.1 |
| 4 | playing | 10800 | 4477 | 166.5 | 136.0 | 129.6 | 120.8 | 0.9 | 0.0 |

- **The plan's time is sight.** `reveal` is 73 to 82 % of it, and nearly all of `reveal` is
  `canSee` asking `walkable` at every 0.2 m of a line to every floor cell within 12 m of every
  living member. `walkable` reads the nine cells about a point, every door and every obstacle,
  each time.
- **The path search is nothing**: `findPath` and `explorationGoal` together are under 1 us a
  step in every run. The long plans are long reads of sight, in the open rooms where most cells
  are in range.

### Sight read through an index

How the crypt reads sight (`SightIndex`, `src/dungeon/map.ts`): a byte a cell, 1 where the cell
is floor and no sight-blocking obstacle and no closed door reaches any point of it. A sample of a
sight line in such a cell, within `SIGHT_RIM` (0.498 m) of the cell's middle on both axes, is seen
through with nothing more read: rock stops sight within 1 mm of itself and no farther. Every other
sample is `walkable`'s. The run makes its index as it first looks and again when a door has
opened, and reads its party's sight into one set, a cell one member sees not looked at for the
next (`DungeonRun.sight`). `tests/crypt-sight.test.mjs` holds every answer to the map's own: on
the levels of seeds 1 to 8, from 60 points a level off the cells' middles, with the doors closed
and as each opens, with an index made at each and with one made before they opened; about
obstacles, at a cell's edge, and through a corner where two rock cells meet. The fingerprint is
the same to the bit.

The four runs, `node research/crypt-plan.mjs --seeds 1,2,3,4` with sight read sample by sample
(`src/dungeon/map.ts@24ce4c51`) and through the index, one after the other on a quiet machine:

| Seed | Sight | The plan, ms: mean / 99th per cent / longest | Plans over 1 ms | Plans over 4 ms | Steps over 8.33 ms | A step, ms: mean / 99th per cent / longest |
|---|---|---|---|---|---|---|
| 1 | sample by sample | 0.09 / 1.76 / 4.73 | 381 | 3 | 12 of 10560 | 3.63 / 6.38 / 12.36 |
| 1 | the index | 0.04 / 0.19 / 4.40 | 3 | 1 | 2 | 3.46 / 5.74 / 12.77 |
| 2 | sample by sample | 0.09 / 2.17 / 5.81 | 199 | 1 | 2 of 7146 | 3.43 / 5.97 / 9.81 |
| 2 | the index | 0.03 / 0.24 / 3.38 | 1 | 0 | 0 | 3.32 / 4.41 / 7.14 |
| 3 | sample by sample | 0.12 / 2.55 / 5.08 | 306 | 2 | 24 of 7424 | 3.37 / 7.26 / 19.95 |
| 3 | the index | 0.04 / 0.27 / 3.13 | 4 | 0 | 5 | 3.36 / 6.33 / 9.93 |
| 4 | sample by sample | 0.11 / 3.17 / 4.32 | 279 | 17 | 52 of 10560 | 3.98 / 7.71 / 24.56 |
| 4 | the index | 0.04 / 0.31 / 3.00 | 4 | 0 | 7 | 3.87 / 5.52 / 10.77 |

Each run ends as it did, at the same step, with the same bodies built. Under the profiler
(`--profile`), microseconds a step in the mean:

| Seed | Sight | `plan` | `reveal` | `canSee` | `walkable` |
|---|---|---|---|---|---|
| 1 | sample by sample | 108.5 | 77.2 | 65.7 | 68.2 |
| 1 | the index | 33.2 | 4.1 | 1.0 | 1.5 |
| 2 | sample by sample | 114.2 | 88.9 | 83.6 | 77.2 |
| 2 | the index | 32.6 | 7.0 | 1.8 | 1.5 |
| 3 | sample by sample | 143.8 | 117.2 | 109.8 | 104.6 |
| 3 | the index | 34.7 | 8.1 | 1.3 | 1.5 |
| 4 | sample by sample | 165.4 | 136.3 | 129.1 | 120.0 |
| 4 | the index | 39.5 | 9.6 | 2.0 | 1.7 |

- The plan's 99th per cent falls to 0.19 to 0.31 ms, and the plans over 1 ms from 199 to 381 a
  run to 1 to 4.
- **What is left over 1 ms is a body being built.** Timed by part in the same four runs, all 11
  plans over 1 ms build an enemy's body as the party comes near (`DungeonRun.build`): 2.8 to
  4.2 ms each, of which sight is under 0.25.
- The steps still over 8.33 ms are the bodies'.

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
