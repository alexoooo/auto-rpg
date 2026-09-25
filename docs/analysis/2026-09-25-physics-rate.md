# Physics rate: 180 and 120 Hz against 240

2026-09-25. **Question:** can the solver and the control loop run at 180 or 120 Hz instead of
`CONFIG.world.physicsHz = 240`, so that a laptop can hold bigger fights? And if 120 breaks
something, can it be designed around with minimum part widths, lower speeds or a speed limit?

**Answer:** tunnelling does not stand in the way. Havok caught every thin-body crossing up to
90 m/s at 120 Hz. What changes is the **drives**. Every servo gain and motor ceiling in the tree
was tuned per substep at 240, so at 120 the arms overshoot and the feet slip. The fight changes
too: bouts are 38 % shorter and damage lands 50 % faster. **180 Hz is close to free at bout level**
(within the noise of a 250 Hz control) and costs 23 red tests. **120 Hz is a retune**, and 44 tests
go red. Nothing about it looks impossible, and the largest single lever for the arm is identified
below. The cheapest large saving may not be the rate at all: per-substep control is **two thirds**
of the step cost.

No `src/` or `tests/` file was edited. Every rate was set by a preload that writes
`CONFIG.world.physicsHz` before any harness module reads it at import. Each harness reads it
into a module-level constant (`FIXED` in `tests/harness/bout-runner.mjs`, and the same pattern in
`golem-bench.mjs`, `golem-headless-arena.mjs`, `golem-torso-bench.mjs`, `impact-bench.mjs` and
`lift-bench.mjs`):

```bash
PHYSICS_HZ=120 node --import ./.review/rate/hz.mjs <script>   # .review/rate/hz.mjs is 4 lines
```

Worker threads inherit `execArgv` and the environment, so every `research/` lane runs at the same
rate. The override was checked live by counting `onBeforePhysicsObservable` over 120 frames of a
real bout: 239.5, 180 and 119.5 substeps per simulated second (Node bout runner). The scripts are
in `.review/rate/`, which is not committed.

## 1. Cost

Node bout runner, one realm, sequential, on a quiet box. Two stone default golems, four
mind pairings × 3 seeds, 8 s cap, supported locomotion, first bout discarded as warm-up.
Havok's time is `plugin.executeStep` and the control's is the `onBeforePhysicsObservable`
notification. Two repeats agreed within 2 %.

| Rate | Wall ms / simulated s | Havok | Control (per substep) | Everything else | ms per 60 Hz frame |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 240 | 138.2 | 45.6 | 92.1 | 0.5 | 2.30 |
| 180 | 101.5 | 34.0 | -- | 67.5 (control + rest) | 1.69 |
| 120 | 73.3 | 25.8 | 48.5 | 0.4 | 1.22 |

- **Cost is linear in the rate:** 180 is 1.37× cheaper than 240, and 120 is 1.93× cheaper.
- **Control is two thirds of the step.** Havok costs about 0.19 ms a substep for two golems, and
  the servos, anchors, minds and ledger that hang on `onBeforePhysicsObservable` cost about
  0.38 ms. So running the controllers more cheaply, or on a slower clock than the solver, is worth
  as much as halving the physics rate. That is **not measured here**, and it is the obvious next
  probe.
- These figures do not include the page's rendering. `CONFIG.world.physicsHz`'s own comment says
  about 2.5 ms a frame at 240 on the page. The Node figure is 2.30 without a renderer, so the two
  agree.

## 2. Tunnelling: not the problem

**Harness:** a bare Havok scene (`NullEngine` with `attachPhysics`, as `src/physics.ts` sets it up,
gravity off; `.review/rate/tunnel.mjs`).

- **The mover:** a free dynamic 1.3 kg blade box, 0.80 × 0.05 × 0.01 m (`TERMINAL_BLADE`), either
  edge-first or flat.
- **Two motions:**
  - fired straight through the target;
  - spun about its own centre, so that the tip sweeps the target at 0.35–0.40 m of radius.
- **The targets:** a crossing blade presenting 10 mm or 50 mm, and capsules of 22 mm radius (the
  whip segment), 40 mm and 60 mm.
- **Speeds and phases:** 10–90 m/s, with 12 start phases per cell spread over one substep of
  travel.
- **A control that has to miss:** the same capsule, 1.5 m off the line. It read 0 of 12 at every
  speed and rate, so the detector can say no.

| Motion | Touched | Momentum handed over (target speed / mover speed) |
| --- | --- | --- |
| Straight, every target, every speed, every rate | 12 of 12 | **Identical at every rate**: 0.60 to a blade, 0.36 to a capsule, 10–90 m/s |
| Spinning, every target, every speed, every rate | 12 of 12 | Full (0.24 blade, 0.12 capsule) up to a tip speed of **~40 m/s at 120 Hz, ~55 at 180, ~80 at 240**. Past that it falls by 15–30 % (e.g. blade-flat 0.24 → 0.20 → 0.17 from 45 to 90 m/s at 120) |

No body passed through another in any trial. Havok sweeps a body's linear motion
continuously. It does not expose a CCD or motion-quality setter: the wasm's `HP_Body_*` setters
cover activation, damping, velocity, mass, motion type, shape and transform, and nothing else. It
does not need one here. What it approximates is **rotation within one substep**: 45 m/s at 0.4 m
of radius is 0.94 rad a substep at 120 Hz. The contact is still found, and some of the momentum is
not delivered.

What this means for the owner's three proposals:

- **Minimum widths:** not needed. A 10 mm blade and a 22 mm whip segment were caught at every
  speed.
- **Lower speeds by design:** the driven peaks are already below the rotational limit. Stroke peaks
  run 18–24 m/s (§3). Only struck and glancing blades pass 100 m/s, and those are what the damage
  model's quarter-second post-contact exclusion already ignores.
- **A speed limit:** if one is wanted at 120, cap the **angular** speed rather than the linear.
  `setVelocityLimits(220, 220)` in `attachPhysics` sets both to 220. An angular cap of about
  100 rad/s bounds a 0.4 m tip at 40 m/s and the rotation to 0.83 rad a substep at 120. Not tried.

## 3. The arm benches: where 120 hurts

**Harness:** the Node bench (`tests/harness/golem-bench.mjs`: `runGolemBench`, `runStrokeBench`
with `timed: true`, and `runParryBench`), bodies kept awake. The columns:

- **idle stray:** anchor stray at rest;
- **stroke stray:** the peak anchor stray during the timed cut (the test ceiling is 50 mm);
- **stroke peak:** the driven tip peak;
- **parry over:** the cover's overshoot;
- **parry arrive:** the time for the cover to arrive.

| Module | Rate | Idle stray mm | Stroke stray mm | Stroke peak m/s | Stroke miss m | Parry over mm | Parry arrive s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| wrist blade | 240 | 3.05 | 37.9 | 18.1 | 0.101 | 188 | 0.204 |
| | 180 | 8.01 | 48.3 | 19.3 | 0.115 | 248 | 0.261 |
| | 120 | 24.7 | **108.9** | 24.4 | 0.149 | 338 | 0.475 |
| wrist mace | 240 | 12.7 | 153 | 18.3 | 0.442 | 43 | 0.304 |
| | 120 | 30.8 | 174 | 21.4 | 0.389 | 170 | 0.317 |
| wrist maul | 240 | 23.1 | 106 | 13.3 | 0.878 | 62 | 3.90 |
| | 120 | 36.0 | 119 | 14.4 | 0.927 | 320 | 2.30 |
| wrist whip | 240 | 2.3 | 8.1 | 14.3 | 0.809 | 157 | 3.91 |
| | 120 | 4.8 | 25.2 | 12.4 | 0.848 | 311 | 3.88 |
| wrist plate | 240 | 2.2 | 7.7 | -- | -- | 17 | -- |
| | 120 | 26.5 | 32.9 | -- | -- | 92 | -- |
| skeletal blade | 240 | 10.0 | 46.5 | 17.6 | 0.050 | 19 | 0.158 |
| | 120 | 41.4 | **137.3** | 24.3 | 0.061 | 282 | 0.492 |
| anatomical (human) blade | 240 | 73.2 | 76.0 | 11.2 | 0.182 | 113 | 0.287 |
| | 120 | 102.8 | 98.9 | 11.6 | 0.280 | 498 | 0.592 |

Other rows (same harness):

- Skeletal maul stroke stray: 30 / 113 / 230 mm at 240 / 180 / 120.
- Reach blade stroke stray: 13.7 / 23.5 / 49.0 mm.
- Pitch blade stroke crossings: 14 / 11 / 2.
- No stuck steps and no self-contacts at any rate.

The pattern is one thing: **a limb driven harder than it can follow at a coarser step
overshoots**. The command is the same. The servos (`JointServo.track` for the stone and skeleton
chains, `HUMAN_ARM_DRIVE.response` with a velocity feed-forward for the human arm) correct once
per substep with gains chosen at 240. The whip's lash also drops, from 19.6 to about 12–13 m/s,
below its own test's floor.

### A design-around for the arm: the target filter's response

Same harness, wrist blade, one knob changed at a time. Dimensions proved live by their output moving.

| Rate | Change | Idle stray mm | Stroke stray mm | Stroke peak m/s | Parry over mm | Parry arrive s |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 240 | shipped | 3.05 | 37.9 | 18.1 | 188 | 0.204 |
| 240 | `CHAIN_REACH.targetResponse` 40 → 20 | 2.26 | 17.2 | 13.4 | 1 | 0.250 |
| 120 | shipped | 24.7 | 108.9 | 24.4 | 338 | 0.475 |
| 120 | `targetResponse` 20 | **5.70** | 67.2 | 18.4 | **45** | **0.358** |
| 120 | `jointResponse` and `targetResponse` 20 | 4.93 | 83.5 | 18.9 | 26 | 0.342 |
| 120 | `jointResponse` 20 alone | 21.2 | 120.4 | 24.0 | 242 | 0.333 |
| 120 | both 30 | 10.6 | 108.5 | 23.8 | 200 | 0.383 |
| 120 | both 60 | 39.4 | 90.6 | 23.3 | 491 | 0.592 |
| 120 | chain torques × 0.6 | 25.3 | 78.7 | 18.9 | 434 | 0.542 |
| 120 | wrist torques × 0.6 | 18.1 | 59.2 | 19.2 | 340 | 0.475 |
| 120 | link damping × 2 | 23.9 | 109.4 | 24.3 | 310 | 0.467 |
| 120 | `jointInertiaFloor` × 2 | 6.88 | 113 | 22.8 | 347 | 0.367 |
| 120 | `ANCHOR_DRIVE` forces × 0.5 | identical to shipped: **this chain does not read it** | | | | |

What the target filter's response does on the other chains:

- **Skeletal blade** (`SKELETAL_REACH` spreads `CHAIN_REACH` at import, so it has to be overridden
  on its own), `targetResponse` 20 at 120: idle stray 10.4 mm, stroke stray 74.8 mm, parry
  overshoot 73 mm and parry arrival 0.40 s. That is within reach of its own 240 figures (10.0,
  46.5, 19 and 0.158).
- **Wrist mace** at 120: stroke stray 174 → 73 mm and parry overshoot 170 → 29 mm.
- **Wrist maul** at 120: parry overshoot 320 → 48 mm, and its stroke stray does not move (110 mm).
- **Human arm:** no single knob. `HUMAN_ARM_DRIVE.inertiaFloor` × 4 is the best of three: parry
  overshoot 498 → 223 mm and idle stray 103 → 72 mm at 120. Its response at 5 or at 20 makes it
  worse.

Two things follow:

1. **The input filter was the part tuned for 240.** Halving its response gives back most of the
   arm at 120. It does not make the wrist blade's stroke stray pass (67 against the test's 50).
2. **The same change at 240 is better than what ships on every stray and overshoot column**
   (parry overshoot 188 → 1 mm, stroke stray 37.9 → 17.2). It costs a quarter of the stroke's
   peak speed (18.1 → 13.4 m/s). That is the trade AGENTS.md's "a flung blade is fast, and fast is
   not the same as good at fighting" describes, and it is worth a bout sweep of its own at 240,
   whatever rate is chosen.

## 4. Locomotion

**Harness:** the Node locomotion bench (`runGolemLocomotion` in `tests/harness/golem-bench.mjs`).

- **full** is the default `LOCOMOTION_SEQUENCE`: stand, walk, strafe, turn, a crouched walk, a
  shove above the fall line, and the rise.
- **walk** is `walkSequenceFor(module)`.
- Mean planted slip carries a 300 mm/s budget in the module files.

| Module | Reading | 240 | 180 | 120 |
| --- | --- | ---: | ---: | ---: |
| biped | walk: mean planted slip mm/s | 99 | 264 | **567** |
| skeleton | walk: mean planted slip mm/s | 96 | 189 | **1414** |
| multileg | walk: mean planted slip mm/s | 526 | 671 | 736 |
| wheel | walk: mean contact slip mm/s | 20.6 | 23.0 | 14.0 |
| biped | full: seconds to rise | 1.95 | 2.18 | 2.21 |
| skeleton | full: seconds to rise | 1.82 | 1.89 | 2.28 |
| multileg | full: seconds to rise | 1.19 | 1.19 | 1.22 |
| wheel | full: seconds to rise | 1.93 | 1.92 | 1.82 |

- **Every body is knocked down and gets up at every rate.**
- **Feet are where 120 fails outright.** The skeleton's walk slips 15× what it does at 240, and
  the biped's slips 6×. The suite agrees (§6): at 180 the skeleton at movement ×0.75 slips 546 mm/s,
  and 21 substeps of the biped's walk have no sole down, against 8.
- Nothing was tried on the legs. The same diagnosis as the arm is the first thing to test: gains
  chosen per substep at 240.

## 5. Bouts

**Harness:** Node research runner (`research/stat-sweep.mjs --stat weight --levels 1 --pairs 96
--workers 10`).

- Setup: stone default golems; `PROBE_MINDS` (champion, miser, brawler, duelist) in every
  pairing; 192 bouts per rate; cap 150 s; `locomotionMode: "supported"`; seed 20260923.
- The seeds are identical across rates, so bouts pair by id.
- **250 Hz is the chaos control**: the smallest change available, run the same way, to show how
  much any perturbation moves these figures.
- Run directories: `research/runs/rate-{250,240,180,120}/` (gitignored).

| Rate | Median s [p10, p90] | Mean s | Damage / s | Contacts / s | Real blows / s | Knockdowns / min | Severed / bout | Left / right wins |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 250 | 16.4 [7.4, 39.8] | 21.2 | 0.721 | 14.8 | 7.39 | 2.94 | 1.46 | 94 / 98 |
| 240 | 15.0 [6.7, 35.5] | 19.5 | 0.786 | 15.6 | 7.71 | 2.70 | 1.39 | 100 / 92 |
| 180 | 12.4 [6.7, 29.3] | 18.4 | 0.860 | 15.2 | 8.31 | 2.83 | 1.47 | 98 / 93 |
| 120 | 9.7 [3.3, 21.7] | 13.1 | **1.176** | 18.0 | **10.2** | 2.92 | 1.31 | 95 / 94 |

Every bout ended `exhausted`. Draws were 0, 0, 1 and 3 bouts.

Paired against 240 on the same ids, with 95 % intervals:

| Rate | ln(seconds) | Damage / s | Real blows / s |
| ---: | --- | --- | --- |
| 250 (control) | +0.097 ± 0.127 | -0.138 ± 0.243 | -0.39 ± 0.39 |
| 180 | -0.101 ± 0.143 | +0.141 ± 0.242 | +0.48 ± 0.34 |
| 120 | **-0.483 ± 0.153** | **+0.746 ± 0.297** | **+1.74 ± 0.40** |

- **180 is indistinguishable from 240**, just as 250 is. Real blows a second come out +0.48 ± 0.34,
  which is marginal and the same size as the control's own swing the other way.
- **120 is a different fight.** Bouts run 38 % shorter, damage lands about 50 % faster and real
  blows come a quarter faster. This is what §3 predicts: stroke peaks are higher (18.1 → 24.4 m/s
  on the wrist blade) and the limbs overshoot into contact.
- **Which corner wins a given bout is chaotic under any change**, so do not read single bouts.
  The same winner came out 112 of 192 times for 250 against 240, 114 for 180 and 101 for 120.
- **The minds' standing may move at 120**, as a win rate pooled over both corners, n = 96 each:

  | Mind | 250 | 240 | 180 | 120 |
  | --- | ---: | ---: | ---: | ---: |
  | miser | 39.6 | 40.6 | 31.3 | 58.3 |
  | duelist | 49.0 | 52.1 | 44.8 | 38.5 |

  The miser's move from 240 to 120 is about 2.5 standard errors. The 250 control moves the
  brawler 8 points on its own. **A rate change would need the mind league re-measured.**

## 6. The test suite at each rate

`node --import ./.review/rate/hz.mjs --test tests/*.test.mjs` with `PHYSICS_HZ` set, 970 tests.

| Rate | Fail |
| ---: | ---: |
| 240 (preload, no override: the control) | 0 |
| 180 | 23 |
| 120 | 44 |

The 23 that fail at 180 fall into three kinds.

- **Instruments that assume 240 (rewrite, not retune):**
  - `tests/golem-arm-transients.test.mjs` advances its own clock by a literal `1/240` per substep
    and slices `.25*240` samples. That accounts for 6 fails ("the awake settling window must
    actually be sampled").
  - `real_Havok_brackets_...` asserts the rate is 240.
  - Exact per-trajectory pins, which any physics change breaks, 250 Hz included:
    - the worker's knockdown and severed counts;
    - the latch's stroke count;
    - "the fixture is a real body lying down";
    - "a standing mind … crouches over it";
    - "a fallen one rises clear";
    - the art-proof demo staying in frame.
- **Contracts that 180 misses narrowly:**
  - a plate corner 2.2 mm inside the torso;
  - the shipped cut reaching the mark at 14.4 against 15.5;
  - the x2-weight mace straying 57.2 mm against 50;
  - rung 1's guard settling in 0.35 s;
  - the whip lash at 12.1 m/s.
- **Contracts that 180 misses widely:**
  - the ram's lunge arrives with 2.9 J against a floor of 29.67 J, and carries only 0.49 rad past
    its drive;
  - the biped's walk has 21 soleless substeps against 8;
  - the skeleton at movement ×0.75 slips 546 mm/s against 300.

At 120 the same set fails, plus:

- the elbow-reversal tracking family;
- idle wrist and skeleton arms settling after a shove;
- "covers arrive promptly";
- the maul's grip;
- the multileg tripod holding its ground;
- a skeleton rising at the cap;
- stagger and fall lines;
- the anatomical whip.

## 7. Where the tree assumes 240

- **Read correctly from the config**, so they follow the rate:
  - `CONFIG.world.physicsHz`;
  - the page and bench `setSubTimeStep` calls (`src/arena.ts`, `src/bench/main.ts`,
    `src/dungeon/main.ts`, `src/art-proof/main.ts`);
  - `FIXED_STEP` in `src/main.ts`;
  - `ContactPress` in `src/golem/golem.ts`;
  - every harness's module-level `FIXED`.
- **Literals:**
  - `ACTION_SHOT_TIMING.release: 1 / 240` in `src/action-primitives.ts`;
  - the `?? 1 / 240` fallback dt in `src/supported-locomotion-production.ts` (twice);
  - `BENCH_READOUT.stuckWindowSteps: 24` in `src/golem/config.ts` ("0.1 s at 240 Hz", readout
    only);
  - `tests/harness/stroke-phase.mjs`, which prints `1/240`;
  - `tests/golem-arm-transients.test.mjs` (above).
  - 23 test files contain a literal `240`. Not every one is a rate, and they have not been read.
- **Tuned per substep at 240**, which is the real dependency:
  - `CHAIN_REACH.jointResponse` and `targetResponse` (and `SKELETAL_REACH`, which copies them);
  - `HUMAN_ARM_DRIVE`;
  - the torso, neck and wrist tables;
  - the legs' gains, which is where the slip lives;
  - every motor ceiling that `JointServo.track` hands over per substep.
  - `POSITION_RESPONSE = 10` in `src/golem/joint-servo.ts` is a per-second gain. At 120 it is 0.083
    a step and stable, so it is not the problem. A gain that is stable per second can still be
    wrong per step once the arm is at its torque ceiling.

## 8. Recommendation

- **240 stays until one of the following lands.** It is the only rate at which the suite passes and
  the benches meet their own budgets.
- **180 is the near-term step:** 1.37× cheaper and bout-level indistinguishable. It costs about 13
  test rewrites where the instrument assumed 240, and about 10 contract retunes. The only large
  misses are the ram's lunge and the biped and skeleton feet.
- **120 is reachable, but it is a retune, not a setting:** 1.93× cheaper. The design-arounds it
  needs, in order:
  1. Make the servo and filter gains per-step aware, starting with `targetResponse`. The table
     above gives most of the arm back.
  2. Diagnose the foot slip the same way.
  3. Give the human arm its own drive work.
  4. Re-measure the mind league, because the fight changes: shorter, faster damage.

  Minimum widths are not needed. An angular speed cap of about 100 rad/s is optional insurance
  for struck blades.
- **Measure next:** the control loop's share. Per-substep control is 0.38 ms against Havok's
  0.19. Controllers held at 120 or 60 while the solver runs at 240 could save more than 240 → 120
  does, and they keep every contact and foot figure as it is. Also worth a sweep: `targetResponse`
  20 at 240 on its own merits.
