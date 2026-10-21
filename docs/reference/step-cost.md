# What a step costs

What one world step (`World.step`, `src/core/world.ts`) takes in time and memory as bodies are
added, in a bout and in a crypt run: where the time goes, what a step allocates, what the collector
takes, and which steps are long and why. `tests/core-step-cost.test.mjs` holds the allocation
ceilings; `tests/core-reach.test.mjs` holds the reach bed's count.

Unless a section says otherwise, figures are **Node 24.19, core world, Rapier, 120 Hz, one thread of
the development host** (a 16-core desktop), nothing else running. A step is 8.33 ms of game time, so
8.33 ms of work is real time with nothing drawn; a 60 Hz page takes two steps a frame and draws. Bytes
and counts are the same on any machine; times are this machine's, so compare rows of one run.

```powershell
node research/step-garbage.mjs --bodies 1,2,4,8,10,12,16,24,32,48
node research/step-time.mjs --profile
node research/reach-bed.mjs
node research/step-garbage.mjs --sites
node research/crypt-plan.mjs --seeds 1,2,3,4
node research/crypt-plan.mjs --seeds 1,2,3,4 --profile
node research/rest-probe.mjs
node research/rest-probe.mjs --bodies 4
node research/blow-cost.mjs
```

## Allocation ceilings

`tests/harness/step-allocation.mjs`, Node 24.15.0 (background searches running, so no timing): two
standing skeletons, 240 steps after 3 s; the Warrior against the Rogue with clubs, 480 steps after
2 s; each reading in its own process. A ceiling is the highest of five readings plus a quarter,
rounded up: `CEILING` is 140 standing, 393 in the bout, 206 for a down body (KiB a body a step).

| Fixture | KiB per body per step | Ceiling |
|---|---|---|
| Standing | 111.69, 110.86, 110.23, 111.07, 111.05 | 140 |
| Bout, options fighter | 367.46, 369.48, 367.61, 368.14, 366.96 | 393 |

The bout's ceiling is the options fighter's, which weighs every option each control step. Its
opening selector (`openingSelector`, `src/core/mind/openings.ts`), asked through each strike's
readiness many times a step, allocates only its result, its distances, path samples and candidate
points in work arrays of its own. Before that the bout read 2370 KiB, and its step (`step-time.mjs`)
went from a mean of 4.06 ms and median 3.23 to 2.99 and 1.62, a scavenge every 90 steps against
every 20, with every fingerprint case unchanged.

## Bodies in a step

`research/step-garbage.mjs`: skeletons with the club, 3 m apart, each under the command layers
ordered to stand, as `research/body-cost.mjs` stands them ([play.md](play.md#bodies-in-the-step)).
A row is one count in its own process: 1200 steps timed after 3 s with every collection inside
(`PerformanceObserver`), then 240 steps under the sampling heap profiler (`allocatedIn`,
`tests/harness/garbage.mjs`). Nobody fell; no row collected the whole heap.

| Bodies | A step, ms | 99th per cent, ms | Longest, ms | Of real time, % | A body, KiB a step | Steps to a scavenge | A scavenge, ms | The collector, % of the step |
|---|---|---|---|---|---|---|---|---|
| 1 | 0.46 | 0.71 | 1.16 | 6 | 71 | 200 | 0.26 | 0.3 |
| 2 | 0.80 | 1.08 | 1.22 | 10 | 63 | 120 | 0.25 | 0.3 |
| 4 | 1.52 | 1.94 | 2.52 | 18 | 58 | 67 | 0.26 | 0.3 |
| 8 | 3.05 | 4.62 | 6.19 | 37 | 55 | 35 | 0.26 | 0.2 |
| 12 | 4.30 | 7.22 | 8.12 | 52 | 55 | 24 | 0.24 | 0.2 |
| 16 | 5.77 | 8.38 | 11.55 | 69 | 55 | 19 | 0.28 | 0.3 |
| 24 | 9.39 | 11.33 | 16.81 | 113 | 55 | 24 | 0.31 | 0.1 |
| 32 | 12.94 | 17.57 | 21.41 | 155 | 55 | 18 | 0.33 | 0.1 |
| 48 | 20.99 | 26.42 | 32.78 | 252 | 55 | 12 | 0.39 | 0.1 |

- **A body under control costs 0.36 to 0.46 ms a step**, and the step is the bodies' sum: about 21
  bodies are real time with nothing drawn, eight are 37 % of it.
- **A body allocates about 55 KiB a step.** It dies in the step, so a scavenge finds almost nothing
  alive: the collector takes 0.3 % of the step or less at every count, its longest pause 1 ms.
- What bounds the bodies in a step is the work each takes, the solver's about 0.25 ms of it.

## A bout's step

`research/step-time.mjs`: the Warrior against the Rogue, each with the club, to its verdict at 1244
steps (10.37 s), four playings in one process, read twice. A bout is the same each playing, so the
least of a step's times over the last three is what its work takes.

| The least over three playings, two readings | Mean, ms | Median | 99th per cent | 99.9th | The longest |
|---|---|---|---|---|---|
| A step | 0.883, 0.901 | 0.796, 0.814 | 2.902, 2.917 | 4.066, 4.139 | 4.097, 4.189 |
| The solver's part (`PhysicsWorld.step`) | 0.496, 0.507 | 0.491, 0.504 | 0.552, 0.553 | 0.567, 0.569 | 0.737, 0.682 |
| The rest: senses, minds, motor control, blows | 0.385, 0.392 | 0.298, 0.303 | 2.367, 2.395 | 3.532, 3.585 | 3.536, 3.632 |

- **The solver is more than half the step**, and even: its longest is 1.3 to 1.5 times its mean.
- The rest's longest steps are the hand's reach out of reach: the eight dearest, steps 1057 to 1068,
  take 3.1 to 4.2 ms. No step's least passes 8.33 ms.
- The collector over 3732 steps: a scavenge every 120 steps (0.53 to 0.55 ms), one mark-compact
  (1.69 and 1.99 ms).

Under V8's CPU profiler at 100 us (`--profile`), each function with what it calls, as a share of the
bout, two readings: `World.step` 91.1, 90.9; the solver 51.4, 52.4 (49.0, 49.7 inside Rapier's
wasm); the two bodies' muscle hooks 35.0, 34.6; the minds' steps 25.4, 25.7, of which motor control
(`motor.ts`'s `control`) 22.4, 22.2; the ground's wrench (`shareGroundWrench`) 8.7, 7.5; the stance's
root solve (`carryRoot`) 7.7, 8.0; the stance's limbs 5.0, 4.6; `bodyDynamics.update` 4.9, 4.9. The
senses, tactics and skills are each under 1 %: deciding costs nothing next to carrying it out.

### The reach solver at its cap

A hand sent to a place (`motor.ts`'s `solveAt`) is solved three times a step (the path's point a step
back, now, a step on), and its rates and accelerations are differences of the three. Each solve is
`solveReach` (`src/core/control/kinematics.ts`): damped least squares from the last answer, to at most
200 passes (`IK_PASSES`) or until no angle moves 1e-10 rad (`IK_TOLERANCE`). A solve reports its
passes and whether it stopped of itself (`ReachEnd`), summed per body (`ReachMeter`).

Its Jacobian is the kinematics' derivative in closed form (`reachJacobianTo`, from `motionAxesToRef`
and `turningToRef`), one walk of the chain a pass: within 9.9e-11 m/rad of central differences over
200 poses on the Warrior's arm and leg, and `tests/core-reach.test.mjs` holds it within 1e-8.

**The bed** (`tests/fixtures/reach-solves.json`, `node research/reach-bed.mjs`): the 144 solves of
the Warrior–Rogue bout at `889b3c3d`, all the Rogue's right arm, steps 1022 to 1069, each kept as it
was asked and solved again alone, so two solves answer the same questions. Kinematics alone, Node
core stand, a pass's time the least of seven readings, quiet machine:

| The Jacobian | At 200 passes | All passes | Of those that end: median, most | At their place (0.1 mm), and of them at the cap | Solved again from its answer, the most an angle moves | A step's three: the greatest second difference | A pass |
|---|---|---|---|---|---|---|---|
| Differenced (`@889b3c3d`) | 117 of 144 | 24583 | 27, 146 | 102, 75 | 1.8e-9 rad where it ended, 3.7e-2 where it did not | 0.2949 rad | 10.65 us |
| In closed form | 43 of 144 | 11470 | 28, 109 | 102, 1 | 7.6e-11 rad where it ended, 3.7e-2 where it did not | 0.2949 rad | 9.86 us |

- **43 of the bed's 144 run to the cap**; a change of the solve may lower that, and none raises it.
- **A solve at its place ends**, but one: solve 98, a wrist freedom at its stop, 1.1e-9 m from its
  place and still closing; solved again from its answer it ends in 42 passes.
- **The other 42 at the cap are of a place out of reach**, 6.6 mm to 0.49 m beyond the hand. There
  every pass turns the most it may (`IK_TURN`, 0.2 rad) and the next turns back, and the answer is
  whichever end of the swing the 200th pass is.
- With the Jacobian differenced (1e-7 rad), its rounding of about 1e-9 kept solves at their place
  moving 2e-10 to 1e-8 rad a pass, never under the tolerance; the closed form ends them.

In the bout, each step the least over three playings:

| The Jacobian | Steps, and how it ends | Solves, at the cap, all passes | A step, ms: mean, median, 99th per cent, longest | The rest beside the solver, ms: mean, 99th per cent | Steps over 3 ms in three playings |
|---|---|---|---|---|---|
| Differenced (`@889b3c3d`) | 1145: the Warrior, by a fatal blow, at 9.54 s | 144, 117, 24583 | 1.547, 1.225, 9.337, 11.294 | 0.998, 8.660 | 144 of 3435 |
| In closed form | 1244: the Warrior, by a fall, at 10.37 s | 144, 43, 11469 | 1.418, 1.165, 7.767, 10.355 | 0.908, 7.117 | 70 of 3732 |

The longest steps left are those whose three solves are out of reach and each runs 200 passes. They
go with a solve whose answer out of reach is defined ([roadmap](../roadmap.md#body-and-motor-control)).

### The reach solver's remedies, tried

Each row answers the bed's 144 questions, against the differenced solve (`@889b3c3d`) by scratch
copies at `8d783172`. "Solved again" is the most an angle moves when the answer is solved once more:
an answer is one a second solve leaves alone.

| The solve | At 200 passes | All passes | Farther, nearer | Solved again, rad |
|---|---|---|---|---|
| Differenced | 117 of 144 | 24583 | | 1.8e-9 where it ended, 3.7e-2 where it did not |
| **The Jacobian in closed form**, the solve in the tree | 43 | 11470 | 16 (by 0.036 mm at most), 4 | 7.6e-11 where it ended |
| That, and a step refused when the error grows: the damping four times on a refusal, halved on a step taken | 0 | 4024 | 0, 42 | 0.20 |
| Closed form, the turn halved on a refusal and doubled on a step taken | 28 | 12113 | 3, 39 | 9.8e-2 |
| Closed form, both of those | 0 | 3979 | | 0.44 |
| Closed form, the pull taken by halves with the place's step put right after it | 35 | 11310 | | 0.62 |
| Closed form, the pull dropped on a refusal, then the damping raised | 39 to 40 | 9212 to 10899 | | 0.77 |

- The rows reading 0 at the cap are not cures: 69 solves of the third row stop because the damping
  grew until nothing moves, and solved again their angles move 0.2 rad. Only the second solve tells
  convergence from giving up.
- Across a step, three answers that are not one function of their place make an acceleration of
  nothing: the greatest second difference is 0.29 rad with either Jacobian, 0.56 with the pull
  dropped on a refusal.
- Out of reach has no still point: the posture's pull is asked in the directions that leave the
  place where it is to first order; out of reach it bends the elbow, the point falls back by the
  second order, the place's step straightens the arm, and near a straight arm each over-corrects the
  other (each pass about 0.93 of the last and against it). The remedy is a design, not a rule of
  the step.
- On the differenced solve in the bout, halving the turn when the distance did not fall, with stops
  of 1e-8, 1e-7 or 1e-6 rad, ended the solves at their place but not those out of reach, which crept
  to the cap.

### Where a bout allocates

`research/step-garbage.mjs --sites`, the bout from 2 s to its verdict (1004 steps): **248 KiB a
step**, 124 a body. By file: Rapier's JavaScript binding 55 KiB (22 %), native iterators, `sort` and
`map` 36, `control/support.ts` 21, `engine/rapier.ts` 20, `build/joint-state.ts` 16, Babylon's
vectors 15, `math/real.ts` 14. By function with what it calls: the muscle hooks 147, motor control
110, the touches 54 (`contactsOf` 29), the stance's command 45, the engine's step 42. What is left is
Rapier's binding (callbacks from wasm, a wrapper for each velocity and pose read), small arrays made
once a step, and doubles boxed across calls.

### Control written into arrays made once

The step's dearest functions do the same operations in the same order on the same numbers as the
readable form they replace, in arrays made once with the body's control (a matrix its rows end to
end), with loops for `map` and `reduce` and no closure: every bout, run and fingerprint is the same
to the bit (the bout's digest `c7bab8ed0472a94d`). A row is a change landed, read before and after:
the bout (`step-time.mjs`, read twice), one and eight skeletons standing (`step-garbage.mjs
--bodies 1,8`), and the highest of five allocation readings (`step-allocation.mjs`).

| | A bout's step, mean ms | Its median, ms | One body standing, ms | Eight, ms | Standing, KiB a body a step | The bout, KiB a body a step |
|---|---|---|---|---|---|---|
| Before | 1.447, 1.441 | 1.192, 1.184 | 0.62 | 4.41 | 603 | 654 |
| The ground's wrench (`shareGroundWrench`, `activeSet`) | 1.168, 1.194 | 1.012, 1.039 | 0.53 | 3.66 | 379 | 437 |
| Bearing on limbs (`carryRoot`, `bearLimbs`; `src/core/math/flat.ts`) | 1.045, 1.068 | 0.890, 0.911 | 0.48 | 3.16 | 267 | 319 |
| The body's dynamics and its joints (`bodyDynamics`, `joint-state.ts`) | 0.997, 1.018 | 0.851, 0.870 | 0.45 | 2.98 | 80 | 128 |
| The hands' reach (`solveReach`) | 0.937, 0.937 | 0.847, 0.852 | 0.45 | 2.85 | 80 | 129 |
| A body's velocities kept from the step (`rapier.ts`) | 0.971, 0.931 | 0.883, 0.846 | 0.43 | 2.98 | 80 | 118 |
| The senses' frames all of one kind (`senses.ts`) | 0.909, 0.919 | 0.820, 0.826 | 0.46 | 2.96 | 80 | 117 |
| A body's contacts read through one callback (`contactsOf`) | 0.886, 0.900 | 0.799, 0.811 | 0.45 | 2.83 | 80 | 111 |
| Each mind's own threat work, one centre-of-mass read (`threatReader`, `massCentreToRef`) | 0.975, 0.997 | 0.876, 0.896 | 0.49 | 3.16 | 81 | 113 |

- **The ground's wrench**: on the bout's 4576 calls answered alone, 57.2 us a call to 12.5, all 68544
  numbers the same; 20.7 % of the bout under the profiler to 5.4.
- **Bearing on limbs**: `carryRoot` 14.9 % of the bout to 6.1; its solves are `flat.ts`'s, each the
  twin of one in `linalg.ts` (`tests/core-flat.test.mjs`).
- **The body's dynamics and its joints**: `dynamics.ts` allocates nothing a step (from 280 KiB),
  `joint-state.ts` 16 (from 146); a scavenge every 63 steps against 33.
- **The hands' reach**: 8.15 us a pass on the bed to 3.26, every answer the same; the bout's 99th per
  cent step 6.50 ms to 2.92.
- **Velocities kept**: the bout reads each segment's velocities about 3.3 times a step, each read a
  binding call that makes an object; the engine keeps them until the next step, an impulse, new mass
  or a hold.
- **Frames of one kind**: every senses frame is a `Float64Array` of `frameLength`; mixing it with a
  plain array boxed every number (9 KiB a step); the senses allocate nothing a step.
- **One callback**: Rapier offers 80 pairs a step and the touches want 0.44; one callback made with the
  world finds a collider's body by handle and makes nothing until a pair is wanted.
- **Threat work**: each mind makes its own vectors (`threatReader`, the rise's `lying`), and the stance,
  supported motor and physical reading share `massCentreToRef` (`support.ts`); time and allocation
  unchanged within the readings' spread.
- A ceiling sees a copy put back in a dear loop and not in a small one: a `[...row]` copy in
  `eliminate` (`contact-wrench.ts`) reads 137 KiB standing and 196 in the bout, over both; one in
  `solveLinearTo` (`flat.ts`) 82 and 114, under both.
- Read and not landed, `turningToRef`'s tangents through a `Float64Array` (1124 bytes a pass of 15
  joints against 2010, 278 and 289 ns a joint against 287 and 283) or written out by a `switch`
  (2804 bytes, 309 and 318 ns): neither changes the time.

## The crypt's plan in the step

`research/crypt-plan.mjs`: a crypt run with no visuals, the hero exploring with three Warriors
following, to the run's end or 90 s, every step timed with the run's planning inside it
(`DungeonRun.plan`: who is built and held, who sees whom, each walker's path); the first 2 s not
read. Under the CPU profiler the plan's time is sight: `reveal` is 73 to 82 % of it, nearly all
`canSee` asking `walkable` at every 0.2 m of a line to every floor cell within 12 m of every living
member, five times a second (`RUN_TIMING.perceive`, 0.2 s). The path search (`findPath`,
`explorationGoal`) is under 1 us a step.

### Sight read through an index

`SightIndex` (`src/dungeon/map.ts`): a byte a cell, 1 where the cell is floor and no sight-blocking
obstacle or closed door reaches any point of it. A sight line's sample in such a cell within
`SIGHT_RIM` (0.498 m) of the cell's middle on both axes is seen through with nothing more read: rock
stops sight within 1 mm of itself (`walkable`), so such a sample is at least 0.002 m from every other
cell. Every other sample is `walkable`'s. The run makes its index as it first looks and again when a
door opens, and reads its party's sight into one set (`DungeonRun.sight`).
`tests/crypt-sight.test.mjs` holds every answer to the map's own on seeds 1 to 8, from 60 points a
level, doors closed and opening, about obstacles, at a cell's edge and through a rock corner.

The four runs, sight read sample by sample (`src/dungeon/map.ts@24ce4c51`) and through the index,
one after the other on a quiet machine:

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

- Each run ends as it did, at the same step with the same bodies; the fingerprint is unchanged.
- Under the profiler `reveal` falls from 77 to 136 us a step to 4 to 10, the plan from 108 to 165 to
  33 to 40.
- **What is left over 1 ms is a body being built**: all 11 such plans build an enemy as the party
  nears (`DungeonRun.build`), 2.8 to 4.2 ms each, sight under 0.25. The steps still over 8.33 ms
  are the bodies'.

## A limp body put to sleep

`research/rest-probe.mjs`. A limp body costs the solver 0.28 ms a step
([play.md](play.md#bodies-in-the-step)); no core body sleeps (`setCanSleep(false)`,
`src/core/engine/rapier.ts`). The probe stands skeletons with the club, lets them go limp, and 5 s
on puts every segment to sleep through the binding's `RigidBody.sleep`, which the engine seam does
not offer.

| Bodies | Standing, ms a step | Limp | Asleep, the next 5 s | Segments still asleep at their end | The fastest segment then, m/s | A 5 kg ball dropped on the first body |
|---|---|---|---|---|---|---|
| 4 | 2.22 | 1.11 | 0.03 | 64 of 64 | 0.000 | its 16 segments wake, no other |
| 8 | 4.41 | 2.21 | 0.21 | 80 of 128 | 49.0 | its 16 segments wake, no other |

Asleep, a body costs under 0.01 ms a step, and a touch wakes only the body touched. With eight, three
bodies wake of themselves within the 5 s and a segment reads 49 m/s, the same every run; what wakes
and throws them is not read, so the game puts no body to sleep.

## A blow part's step

`research/blow-cost.mjs`: one body on the punch stand (`punchStand`), its right hand throwing at the
pad 0.1 m right, 1.55 m up and 0.55 m ahead, 8 s from 2 s; steps with a blow under way and without,
each cell the least mean of three playings after one to compile. A step without a blow, about
1.05 ms, is the stand's instruments and the body together; a blow adds the difference.

| Body | Blow | Striking: mean | longest | steps | Guarding: mean | longest |
|---|---|---:|---:|---:|---:|---:|
| Warrior | path strike | 1.21 | 8.51 | 664 | 1.07 | 3.78 |
| Warrior | driven strike | 1.71 | 7.91 | 692 | 1.11 | 3.46 |
| Warrior | whole-body, timed | 2.46 | 7.47 | 699 | 1.06 | 3.32 |
| Warrior | whole-body, flat out | 2.47 | 11.15 | 699 | 1.05 | 3.36 |
| Rogue | path strike | 1.21 | 9.13 | 672 | 1.18 | 6.46 |
| Rogue | driven strike | 1.63 | 4.61 | 692 | 1.11 | 3.45 |
| Rogue | whole-body, timed | 2.40 | 5.73 | 700 | 1.04 | 3.38 |
| Rogue | whole-body, flat out | 2.50 | 5.83 | 699 | 1.01 | 3.33 |

The path strike adds 0.03 to 0.14 ms a step while it strikes, the driven strike about 0.5 to 0.6, and
the whole-body strike 1.4 to 1.5, either drive: the spike's solve
([whole-body spike](whole-body-spike.md#cost)). Two whole-body strikers fit in the 8.33 ms step.
