# Physics rate 2: is 120 Hz a retune or a limit, and can control run slower than physics?

2026-09-25, follow-up to `2026-09-25-physics-rate.md`. **The questions:**

- Is 120 Hz physics "just a matter of re-tuning", or does it limit what a body or a mind can do?
- Can the control rate be decoupled from the physics rate, so a mind can run at 60 or 90 Hz if
  120 or 240 is too costly?

**Answer, in one paragraph.** 120 Hz is a retune, and most of the retune is one line. Babylon's
Havok plugin tells Havok to expect exactly the step it takes (`HP_World_SetIdealStepTime`), and
Havok derives every constraint's, motor's and contact's stiffness from that ideal step. So halving
the rate silently halved the stiffness of everything tuned at 240. Holding the ideal step at 1/240
while stepping at 1/120 (`CONFIG.world.solverTuningHz`, committed) gives back almost all of the
240 envelope:

- it fully fixes the foot slip;
- it brings the arms to within 1.0-1.3x of 240 on every idle and parry figure;
- it brings contact mass, lift and the head ram within a few per cent.

It costs 3 ms per simulated second of Havok time. An exact discretisation of the arm servo and its
command filter (an experiment, off by default) closes most of what is left. Three things remain:

- Stroke stray stays 1.3-1.6x higher at 120. It is dynamic, and the servo gain can trade it
  against parry overshoot.
- The whip's lash loses a quarter of its peak tip. This may be a real limit (section 6).
- At bout level the retuned 120 fights **longer and less bloodily** than 240. Untuned 120 fought
  shorter and bloodier. The paired differences are significant. Their attribution is in section 5.

No drive has a stability boundary anywhere near what ships: the arm gains break at 4-16x their
shipped values at 120, and at more than 8x at 240. **Decoupling works** at 240 physics: a mind deciding at 120, 80 or 60 Hz leaves the fight statistically unchanged and cuts the step cost by up to 20 %. Below 80 Hz the saving stops, because what remains per substep (servos, the locomotion boundary, Havok) cannot leave the physics clock. The mind itself is 5 % of the cost; publishing its view is 18 %.

Every figure names its harness. All are Node, headless. The rates were set by the preload
`.review/rate2/hz.mjs` (not committed). It writes `CONFIG.world.physicsHz`, `solverTuningHz`,
`controlHz` and the experimental `SERVO_TUNING` knobs before any harness module reads them.
Worker threads inherit `execArgv` and the environment, so `research/` lanes run at the preloaded
rate. That was confirmed by the bout sets differing from each other.

**The configurations named throughout:**

| name | physics step | ideal step | servo and filter |
|---|---|---|---|
| **s240** | 1/240 | 1/240 | shipped (explicit Euler) |
| **u120** | 1/120 | 1/120 (Babylon's default behaviour) | shipped |
| **t120** | 1/120 | 1/240 | shipped |
| **r120** | 1/120 | 1/240 | exact discretisation |
| **r240** | 1/240 | 1/240 | exact discretisation, to separate the discretisation from the rate |

## 1. What was wrong at 120, and the fix

### 1.1 Havok's ideal step

`HavokPlugin.executeStep(delta)` calls `HP_World_SetIdealStepTime(world, delta)` and then
`HP_World_Step(world, delta)`. `setTimeStep` has no effect, because `useDeltaForWorldStep` is
true. Havok uses the ideal step to turn per-second stiffness into a per-step correction, so every
motor, constraint and contact in the tree was answering half as stiffly per second at 120.

The legs show it most, and they explain the foot slip: the leg joints are Havok **POSITION**
motors, whose stiffness comes from nothing else. The arms are velocity servos (`JointServo`, `v =
feed-forward + k*error`), so they suffer partly from the ideal step and partly from their own
explicit discretisation.

`holdIdealStep` in `src/physics.ts` wraps the plugin's bindings so that
`HP_World_SetIdealStepTime` always receives `1/solverTuningHz`. At 240 this is bit-identical to
shipped: all twelve arm modules and all four locomotion runs reproduced their numbers exactly
(Node golem bench, Node locomotion bench).

The ideal step was swept with the step fixed at 1/120 (Node golem bench, wrist blade; Node
locomotion bench, biped):

| ideal step | stroke stray (mm) | parry overshoot (mm) | biped walk slip (mm/s) | skeleton walk slip (mm/s) |
|---|---|---|---|---|
| 1/120 (u120) | 108.9 | 338 | 567 | 1414 |
| **1/240** | **48.8** | **268** | 151 | **92** |
| 1/360 | 52.4 | 296 | 120 | 144 |
| 1/480 | 114.1 | 322 | 154 | 201 |
| s240 for reference | 37.9 | 188 | 99 | 96 |

Idle stray at 1/240 is 1.6 mm, against 24.7 untuned and 3.05 at s240. 1/360 trades a little arm for
a little biped. Past that, everything gets worse.

At a 1/240 step, an ideal step of 1/480 stiffens the arm (stroke stray 16.3, overshoot 125) but
wrecks the legs: walk slip goes to 811 mm/s on the biped and 830 on the skeleton (Node locomotion
bench). So the right value is the rate the tuning was done at, not "stiffer". **Havok cost at 120: 25.7 ms per simulated second untuned, 28.6 with the ideal
held at 1/240** (Node bout runner, one realm).

### 1.2 Exact discretisation of the arm servo and its command filter (experimental)

Two per-substep integrations in the arm are explicit, so each responds differently per second at a
different step:

- **The servo gain.** `JointServo.track` asks for `feed-forward + k*(target - measured)`. The exact
  first-order equivalent over a step `dt` is `k' = (1 - e^{-k*dt})/dt`.
- **The command filter.** `stepToward` in `src/golem/effectors/chains/arm-core.ts` is a critically
  damped second-order filter (`targetResponse` 40) integrated by semi-implicit Euler. The exact
  step is `e1 = (e0 + c*dt)*e^{-r*dt}` and `v1 = (v0 - r*c*dt)*e^{-r*dt}`, with `c = v0 + r*e0`.
  The per-step distance cap is applied to the combined move, as before.

Both are behind `SERVO_TUNING` in `src/golem/joint-servo.ts`, which is not on main (section 9). The knob is off by default, so the
branch is bit-identical to shipped at 240. The human arm has its own velocity drive
(`HUMAN_ARM_DRIVE.response`) and is untouched by the knob, which is why its r240 row equals s240.

## 2. Capability envelope

### 2.1 Arm chains (Node golem bench: step response, stroke bench, parry bench)

Idle stray is the anchor stray at rest (mm); wander is the rest-tip wander (mm); stroke stray is the
peak anchor stray through a timed cut (mm); peak tip is m/s; parry arrival is in seconds and parry
overshoot in mm.

| module | measure | s240 | u120 | r120 | r240 |
|---|---|---:|---:|---:|---:|
| wrist blade | idle stray | 3.05 | 24.7 | 3.16 | 4.46 |
| | wander | 0.86 | 1.89 | 1.01 | 1.12 |
| | stroke stray | 37.9 | 108.9 | 49.8 | 35.9 |
| | peak tip / stroke peak | 27.9 / 18.1 | 28.8 / 24.4 | 27.4 / 18.3 | 27.6 / 18.0 |
| | parry arrival / overshoot | .204 / 188 | .475 / 338 | .208 / 213 | .196 / 154 |
| wrist mace | idle / stroke stray | 12.7 / 153 | 30.8 / 174 | 12.1 / 135 | 18.7 / 153 |
| | peak tip / parry overshoot | 20.7 / 43 | 20.5 / 170 | 20.4 / 56 | 20.5 / 42 |
| wrist fist | idle / stroke stray | 1.97 / 6.6 | 8.74 / 23.1 | 1.45 / 12.0 | 1.67 / 6.5 |
| | peak tip / parry overshoot | 15.2 / 0 | 17.9 / 58 | 15.3 / 0 | 14.9 / 0 |
| wrist plate | idle / stroke stray | 2.23 / 7.7 | 26.5 / 32.9 | 2.07 / 15.8 | 3.4 / 7.7 |
| | parry overshoot | 17 | 92 | 32 | 14 |
| skeletal blade | idle / stroke stray | 10.0 / 46.5 | 41.4 / 137.3 | 7.55 / 53.2 | 10.1 / 42.9 |
| | peak tip / stroke peak | 30.3 / 17.6 | 32.1 / 24.3 | 31.2 / 17.5 | 30.5 / 17.2 |
| | parry arrival / overshoot | .158 / 19 | .492 / 282 | .142 / 18 | .150 / 20 |
| reach blade | idle / stroke stray | 1.08 / 13.7 | 5.58 / 49.0 | 1.05 / 20.1 | 1.10 / 13.5 |
| | parry overshoot | 0 | 27 | 0 | 0 |
| pitch blade | peak tip / parry overshoot | 15.4 / 6 | 17.8 / 26 | 15.3 / 8 | 15.4 / 6 |
| anatomical (human) blade | idle / stroke stray | 73.2 / 76.0 | 102.8 / 98.9 | 78.1 / 91.9 | = s240 |
| | parry arrival / overshoot | .287 / 113 | .592 / 498 | .292 / 119 | = s240 |
| anatomical (human) mace | idle / stroke stray | 41.8 / 136 | 77.2 / 170 | 42.8 / 144 | = s240 |
| | parry overshoot | 180 | 436 | 228 | = s240 |
| wrist whip | peak tip / stroke peak | 19.6 / 14.3 | 13.4 / 12.4 | 13.9 / 6.1 | 17.3 / 14.8 |
| | stroke stray | 8.1 | 25.2 | 15.4 | 8.0 |
| wrist maul | parry overshoot | 62 | 320 | 304 | 326 |
| skeletal maul | parry overshoot | 164 | 257 | 226 | 227 |

Reading the table:

- Untuned 120 is worse everywhere. Its larger peaks (24 against 18 m/s on the wrist blade's stroke)
  are a flung blade, not a better one.
- **r120 matches 240 on idle stray, wander, peak tip, stroke peak and parry arrival for every
  module.**
- Two residuals remain. Stroke stray is 1.1-2x (typically 1.3-1.6x). Parry overshoot is 1.0-1.3x,
  apart from the maces and the plate.
- **The two mauls are not a rate effect.** They move as much at r240 as at r120, so they are a
  property of the discretisation. They are also chaotic single trials: parry arrival near 4 s
  means the maul never settled.
- **The whip is the one row where r120 does not recover and r240 does.** See section 6.

A first hypothesis was that the stroke-stray residual was the instrument. The stray is sampled
before the solver step, and a command moving twice as far per step would read as twice the stray.
That was tested and rejected: measuring against the previous command made it worse, and in ideal
kinematics the servo holds `measured = target` at the sample point at any rate. What is left is
dynamic. The likeliest cause is solver iterations per simulated second, which halve at 120; Havok
exposes no iteration count to raise.

### 2.2 Locomotion (Node locomotion bench)

Walk slip is the mean sole slip while walking (mm/s). Top speed and turn rate are the best 0.5 s
window of the stand block (m/s, rad/s). Rise is the time to rise from `LOCOMOTION_SEQUENCE`'s
knockdown (s).

| body | measure | s240 | u120 | r120 |
|---|---|---:|---:|---:|
| biped | walk slip | 99 | 567 | 151 |
| | top speed / turn rate | 4.54 / 3.0 | 4.82 / 3.0 | 4.69 / 3.0 |
| | rise | 1.95 | 2.21 | 1.96 |
| skeleton | walk slip | 96 | 1414 | 92 |
| | top speed / turn rate | 4.81 / 3.0 | 4.44 / 3.0 | 4.63 / 3.0 |
| | rise | 1.82 | 2.28 | 1.88 |
| multileg | walk slip | 526 | 736 | 571 |
| | top speed / turn rate / rise | 1.40 / 1.2 / 1.19 | 1.40 / 1.2 / 1.22 | 1.40 / 1.2 / 1.21 |
| wheel | walk slip | 20.6 | 14.0 | 13.7 |
| | top speed / turn rate / rise | 3.2 / 4.9 / 1.93 | 3.2 / 4.9 / 1.82 | 3.2 / 4.9 / 2.30 |

**Shove bracket** (impulse in N s, the fraction of `shoveImpulseNs` swept 0.3-1.0): identical at
every rate. The biped stands 185 and falls at 278 or more. The multileg stands 540 and falls at 720.
The wheel falls at 240. The fall line (`fellAt`) is identical too.

The carrier's lag is exactly one substep at every rate, so it doubles in time at 120 (4 to 8 ms).
Nothing measured reads it.

### 2.3 Contact (Node impact bench, Node lift bench, Node torso bench)

| module | measure | s240 | u120 | r120 | r240 |
|---|---|---:|---:|---:|---:|
| wrist blade | tap chain mass (kg) | 0.694 | 0.709 | 0.699 | 0.694 |
| wrist mace | tap chain mass (kg) | 1.96 | 2.01 | 1.98 | 1.96 |
| wrist maul | tap chain mass (kg) | 6.14 | 6.05 | 12.0 | 13.2 |
| skeletal blade | tap chain mass (kg) | 0.688 | 0.705 | 0.694 | 0.688 |
| anatomical blade | tap chain mass (kg) | 0.711 | 0.746 | 0.707 | 0.711 |
| reach blade | lift capacity (N) | 1688 | 1313 | 1781 | 1625 |
| wrist blade | lift capacity (N) | 1406 | 688 | 1500 | 1406 |
| skeletal blade | lift capacity (N) | 1313 | 563 | 1531 | 1313 |
| pitch blade | lift capacity (N) | 156 | 156 | 156 | 156 |
| head ram | lunge deepest / carried (rad) | 0.76 / 0.54 | 0.80 / 0.57 | 0.80 / 0.59 | 0.76 / 0.54 |

Tap mass is rate-invariant. The maul's doubling is the discretisation: it appears at r240 too.
Untuned 120 had lost half its lift, and r120 has all of it back. The head ram carries 5 % further at
120. The stroke-into-sphere readings (impact bench `strokeProbe`) are chaotic single trials for
blades, and are not tabulated.

### 2.4 Attribute extremes (Node golem bench, Node locomotion bench)

Five sets were run: size 0.8, size 1.25, armSpeed 1.5, weight 2, and the all-max giant (every
attribute at its maximum). Each was run on the wrist blade, wrist mace, skeletal blade, anatomical
blade and reach blade, and on all four bodies. The pattern is the base table's at every extreme:

- r120 reproduces 240's idle stray and peak tip within a few per cent.
- r120's stroke stray is 1.1-2.5x, largest where 240's is smallest.
- Untuned 120 is 2-5x worse.

| attribute | module | stroke stray (mm): s240 / u120 / r120 | idle stray (mm): s240 / r120 | peak tip (m/s): s240 / r120 |
|---|---|---|---|---|
| size 0.8 | wrist blade | 103 / 167 / 106 | 23.1 / 19.9 | 24.6 / 24.9 |
| size 0.8 | reach blade | 30 / 115 / 48 | 15.7 / 8.3 | 23.7 / 23.8 |
| size 1.25 | wrist mace | 35.5 / 112 / 50 | 2.16 / 2.13 | 19.9 / 19.5 |
| armSpeed 1.5 | reach blade | 16.2 / 67 / 40.6 | 1.08 / 1.05 | 24.0 / 23.9 |
| armSpeed 1.5 | skeletal blade | 43.5 / 146 / 56.2 | 10.0 / 7.55 | 30.8 / 31.5 |
| weight 2 | wrist mace | 32.7 / 98.8 / 58 | 4.84 / 4.88 | 24.6 / 24.5 |
| giant | wrist blade | 37.2 / 104 / 52.4 | 1.56 / 1.47 | 26.4 / 27.0 |
| giant | skeletal blade | 28.1 / 82.6 / 43.5 | 2.14 / 1.82 | 36.3 / 35.0 |

In locomotion, r120's walk slip is within 1.0-1.5x of 240 at every extreme. There are two
exceptions:

- the biped at size 1.25 (135 against 233 mm/s);
- the giant biped, where 240 itself slips 717 and r120 slips 548.

Top speeds are within 5 % at every extreme, and turn rates are identical.

The parry bench ignores `attributes`, so parry figures are not reported per attribute.

## 3. Stability boundaries (Node golem bench, ideal step 1/240 at both rates)

Each drive's gain was raised until the arm stopped arriving or stopped settling.

**Arm servo gain** (`JointServo` response `k`, shipped 40/s, scaled). Figures are wrist blade
idle stray / stroke stray / parry arrival / parry overshoot:

| scale | 120 | 240 |
|---|---|---|
| x0.5 | 2.1 / 55.7 / .175 / 85 | 2.4 / 39.3 / .129 / 17 |
| **x1 (shipped)** | 1.6 / 48.8 / .258 / 268 | 3.05 / 37.9 / .204 / 188 |
| x2 | 3.5 / 23.5 / .467 / 406 | 5.2 / 26.1 / .362 / 330 |
| x4 | 13.7 / 25.4 / 1.05 / 523 | 7.4 / 26.3 / .633 / 423 |
| x6 | **74 / never still** / 2.16 / 524 | 7.8 / 23.3 / .846 / 432 |
| x8 | **224 / 176 / 3.98 (never arrives)** / 243 | 9.1 / 32.9 / .954 / 450 |

Across the five modules swept (wrist blade, skeletal blade, reach blade, wrist mace, plate):

- **At 120 the servo degrades from x4 and breaks at x6.**
- At 240 it is still sane at x8.
- Raising the gain lowers stroke stray and raises parry overshoot at both rates. x2 at 120 beats
  shipped 240 on stroke stray (23.5 against 37.9 mm), so **the stroke-stray residual can be bought
  back with gain**, paid for in cover overshoot.
- x0.5 is better on cover at both rates.

**Command filter** (`targetResponse`, shipped 40 on `CHAIN_REACH` and `SKELETAL_REACH`). Wrist
blade stroke stray / stroke peak / parry arrival / parry overshoot:

| response | 120 | 240 |
|---|---|---|
| 10 | 11 / 7.3 / .51 / 1 | 7.6 / 8.0 / .51 / 1 |
| 20 | 24.8 / 13.8 / .26 / 1 | 17.2 / 13.4 / .25 / 1 |
| **40 (shipped)** | 48.8 / 18.7 / .26 / 268 | 37.9 / 18.1 / .20 / 188 |
| 80 | 70.2 / 20.1 / .29 / 394 | 44.8 / 18.8 / .22 / 268 |
| 160 | **93 / 15.7 / 1.42 (never idle)** | 60.9 / 19.9 / .22 / 269 |
| 320 | 154 / 24.1 / 1.42 | 86 / 20.4 / .63 / 257 |

At 120 the filter breaks at 160, 4x shipped; at 240 it degrades but stays stable to 320.
Independent of the rate, 20 gives near-zero cover overshoot and half the stroke stray, but costs a
quarter of the stroke's peak.

**Human arm** (`HUMAN_ARM_DRIVE.response`, shipped 10). Anatomical blade parry arrival /
overshoot:

| response | 120 | 240 |
|---|---|---|
| 5 | .32 / 95 | .36 / 106 |
| **10 (shipped)** | .29 / 119 | .29 / 113 |
| 20 | .33 / 260 | .29 / 179 |
| 40 | .33 / 299 | .29 / 219 |
| 80 | .55 / 404 | .45 / 304 |
| 160 | **2.93** / 502 | .53 / 380 |

At 120 it fails at 16x shipped; at 240 it is fine to 16x.

**Verdict:** there is 4-16x of headroom at 120 above every shipped gain. A body tuned stiffer
than today would meet the 120 boundary first, and the constraint on the arm at 120 is overshoot,
not instability.

## 4. Bouts (research/stat-sweep.mjs, Node bout runner in worker lanes)

**Setup:**

- `--stat weight --levels 1 --pairs 96 --workers 24`, run seed 20260923, which is 192 bouts per
  set;
- PROBE_MINDS (champion, miser, brawler, duelist), stone default golems, supported locomotion;
- 150 s cap (the protocol's), side-split.

Every set ran on the same job list, so bout *i* in one set is paired with bout *i* in every other.
The `/cN` sets are the control clock of section 7.

| set | median s | p10 | p90 | damage/s | contacts/s | real blows/s | blocks/s | knockdowns/min | severs/bout | champion | duelist | brawler | miser |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| s240 | 14.95 | 6.67 | 35.5 | 0.786 | 15.6 | 7.71 | 6.17 | 2.70 | 1.39 | 58.3 | 52.1 | 49.0 | 40.6 |
| r240 | 14.25 | 5.97 | 31.0 | 0.811 | 16.1 | 8.20 | 6.51 | 2.63 | 1.39 | 53.1 | 47.9 | 66.7 | 32.3 |
| s240/c120 | 15.52 | 6.27 | 45.9 | 0.755 | 15.5 | 8.43 | 5.94 | 2.85 | 1.42 | 51.0 | 54.2 | 62.5 | 32.3 |
| s240/c80 | 16.30 | 7.20 | 37.3 | 0.750 | 15.8 | 8.52 | 6.13 | 2.07 | 1.48 | 53.1 | 56.3 | 61.5 | 29.2 |
| s240/c60 | 17.55 | 7.03 | 37.0 | 0.732 | 15.7 | 8.15 | 6.26 | 2.39 | 1.34 | 53.1 | 54.2 | 62.5 | 30.2 |
| u120 | 9.68 | 3.35 | 21.7 | 1.176 | 18.0 | 10.23 | 5.94 | 2.92 | 1.31 | 59.4 | 38.5 | 43.8 | 58.3 |
| t120 | 21.82 | 9.43 | 57.7 | 0.555 | 14.9 | 7.43 | 6.11 | 3.05 | 1.30 | 64.6 | 49.0 | 55.2 | 31.3 |
| r120 | 21.20 | 6.77 | 49.8 | 0.589 | 14.8 | 6.92 | 5.87 | 3.48 | 1.30 | 56.3 | 47.9 | 51.0 | 44.8 |
| r120/c60 | 20.28 | **0.35** | 50.9 | 0.570 | 14.4 | 6.36 | 6.35 | 3.35 | 1.28 | 65.6 | 50.0 | 63.5 | 20.8 |

Paired against s240 (mean difference ± 95 % interval; same bout id in both sets):

| set | winner agreement | Δ ln(seconds) | Δ damage/s | Δ real blows/s | Δ knockdowns/bout |
|---|---:|---:|---:|---:|---:|
| r240 | 109/192 | -0.071 ± 0.141 | +0.034 ± 0.234 | +0.12 ± 0.35 | -0.07 ± 0.29 |
| s240/c120 | 104/192 | -0.000 ± 0.136 | +0.020 ± 0.244 | -0.11 ± 0.34 | +0.10 ± 0.28 |
| s240/c80 | 119/192 | +0.066 ± 0.125 | -0.139 ± 0.200 | -0.05 ± 0.37 | -0.17 ± 0.27 |
| s240/c60 | 105/192 | +0.083 ± 0.132 | -0.153 ± 0.210 | -0.15 ± 0.35 | -0.04 ± 0.26 |
| u120 | 101/192 | **-0.483 ± 0.153** | **+0.746 ± 0.297** | **+1.74 ± 0.40** | -0.25 ± 0.26 |
| t120 | 102/192 | **+0.345 ± 0.137** | **-0.408 ± 0.217** | **-0.74 ± 0.32** | +0.50 ± 0.42 |
| r120 | 102/192 | **+0.231 ± 0.140** | **-0.278 ± 0.235** | **-0.81 ± 0.34** | **+0.60 ± 0.42** |
| r120/c60 | 104/192 | -0.164 ± 0.233 | **+0.854 ± 0.533** | **-1.99 ± 0.59** | +0.49 ± 0.44 |

How to read the tables:

- **Winner agreement is chaos, not signal.** r240 differs from s240 by nothing but a slightly
  different servo discretisation, and it still agrees on only 109 of 192 winners. Every set here is
  within that band. So a bout's winner is decided by the bit pattern, and only distributions can
  be compared.
- **Per-mind win rates** are about ±7 points (one standard error) per set. r240 moves the brawler
  49 → 67 on a change that alters nothing at bout level, which is the size of that noise. None of
  the per-mind columns is read as an effect.
- **Untuned 120 fights 38 % shorter and 50 % bloodier.** This reproduces the first analysis. It is
  a flung blade: the impact bench's stroke peaks at 24 m/s against 18 (section 2.3).
- **Retuned 120 over-corrects: fights run 26 % longer (e^0.231), with 25 % less damage per second,
  10 % fewer real blows per second, and more knockdowns.** The ideal step without the exact
  discretisation (t120) does the same, slightly more so.

## 5. Attribution of the bout-level difference

Four candidate causes were each isolated by one set. Each is compared with its reference by
paired bout id.

| candidate | the set that isolates it | result |
|---|---|---|
| Mind constants that count substeps, and minds deciding at a different rate | **s240/c120**: physics 240, the mind decides at 120 and is told `dt = 2/240` | **null**: Δ ln(seconds) 0.000 ± 0.136, Δ damage/s +0.02 ± 0.24. The same null holds at c80 and at c60 |
| The servo and filter discretisation | **r240** against s240, and **r120** against t120 | **null** at both rates: r240 is -0.07 ± 0.14 on ln(seconds); r120 against t120 is -0.11 ± 0.16, with damage/s +0.13 ± 0.18 |
| Hard-coded `1/240` in `src/` | grep | three hits, and none in a probe mind's path. `ACTION_SHOT_TIMING.release` is a 4 ms release phase, but `options.ts` tests only `!== "draw"`, so a skipped release is harmless. The two `?? 1/240` in `supported-locomotion-production.ts` are fallbacks before the first committed step. Minds that roll dice per decide (`planner.ts`' `P.explore`, the style minds' `feintFraction`) roll per *opening*, or sit outside PROBE_MINDS |
| **What the physics does at 120 with the ideal step held** | t120 and r120 against s240 | **the whole effect**: +0.23 to +0.35 on ln(seconds), -0.28 to -0.41 damage/s |

So the longer, less bloody fight at retuned 120 is physical. It is not the minds, the rate they
decide at, or the discretisation. The envelope names two physical residuals that could produce it:

- **Stroke stray is 1.3-1.6x at 120.** A blade that strays further from its anchor lands fewer
  clean blows. Real blows per second fall 10 %.
- **Damage per real blow falls about 15 %** (0.102 at s240, 0.085 at r120, 0.075 at t120). That
  points at how hard a blow lands, or at how its speed is *read*. A blade that penetrates within one
  1/120 step is resolved in one larger correction, and what `Combat` reads in the contact callback
  may be later in the blow than at 240.

**Not done, and the next step:** log the per-contact speed and energy distribution in bouts at s240
and r120, to separate "blows land slower" from "blows are read later". Then try servo gain x1.5-2 at
120, which the boundary sweep says buys stroke stray back at a cost in cover overshoot, and see
whether the bout-level shift closes.

**`r120/c60` has an opening artefact of its own.** 27 of its 192 bouts end inside 3 s, against 8 at
r120 and 4 at s240/c60, and most end at exactly 0.35 s. That is the source of its p10 of 0.35 s and
of its damage/s. Traced (Node bout runner, brawler against miser, seeds 2158207037/3265167439), the
brawler's opening cut reaches the miser's right leg at 0.33 s in all three settings:

| setting | first leg contact |
|---|---|
| r120 (control 120) | thigh at 10.7 m/s, no sever |
| s240/c60 | thigh at 8.9 m/s, no sever |
| **r120/c60** | **shin at 19.5 m/s**, 310 J, **severed**, and the bout ends |

The cause is not established. It needs both the halved physics rate and a held command, because
neither alone shows it. Until it is diagnosed, **60 Hz control on 120 Hz physics is not
recommended.**

## 6. The whip

The whip is the one module whose peak r120 does not bring back and r240 does. It was stepped
through intermediate rates (Node golem bench, ideal step 1/240, exact discretisation):

| physics Hz | 240 | 216 | 200 | 180 | 160 | 144 | 120 |
|---|---:|---:|---:|---:|---:|---:|---:|
| peak tip (m/s) | 17.3 | 11.9 | 10.9 | 11.4 | 13.6 | 14.9 | 13.9 |
| stroke peak (m/s) | 14.8 | 13.1 | 6.8 | 14.4 | 7.6 | 8.2 | 6.1 |
| stroke stray (mm) | 8.0 | 9.1 | 9.6 | 10.7 | 12.9 | 12.9 | 15.4 |
| parry overshoot (mm) | 146 | 214 | 103 | 73 | 84 | 63 | 164 |

The peaks do not fall with the rate. They jump about: 240 is the high outlier, and 180 matches
240's stroke peak. A lash is a long chain of links whose peak depends on the phase the crack happens
to land in. So a single bench trial per rate cannot distinguish "120 cannot crack a whip" from "this
trial missed the crack". Only stroke stray moves monotonically, and it is the same 1.3-1.9x residual
every arm shows.

**Verdict: not shown to be a limit. Unresolved.** Settling it needs a multi-trial study: many
starting phases or stroke timings per rate, with the distribution of peak tip compared. If it does
turn out to be a limit, the design-around the owner suggested applies directly. Fewer, longer lash
links need fewer solver iterations per second to carry a wave.

## 7. Decoupling the control clock (Part B)

### 7.1 The prototype

`CONFIG.world.controlHz` (default 240) sets how often a golem's mind is asked. The substep interval
is `every = max(1, round(physicsHz / controlHz))`.

`stepControlledPair` in `src/control-host.ts` counts substeps per pair, in a `WeakMap` keyed on the
left body. On a due substep it behaves exactly as before. On the substeps in between:

- `Golem.observe(opponent, clock, publish = false)` still runs `locomotionModule.beginSubstep()`
  (the root velocity sample the port reads) and stamps `view.clock`. It skips `describe` for both
  bodies, `nearestPartTo` and the projectile publication.
- `sampleContactPress`, `beginControlStep`, the pair resolution and `afterLocomotion` run unchanged.
- The driver calls `hold(dt)` instead of `step(dt)`. `GolemDriver.hold` re-applies the last
  `Intent` through the same `apply` path, which does three things. It re-stages the locomotion
  request, which `beginControlStep` clears every substep. It re-commands every module. And it
  records the intent.
- On a due substep the mind is told `dt * every`, the time its decision will stand for.

A driver with no `hold` is stepped every substep as before. Today that is every driver but the
golem's.

At the default `controlHz` this is bit-identical to shipped, with `every = 1` and every substep due.
All four sets that ran on it at 240 or 120 control (s240, r240, u120, r120 in section 4) ran on this
code.

**What must stay per substep.** Everything that touches the solver:

- **the servo tracking** (`JointServo.track` in each module's `step`), which is the lesson of the
  keyframed anchor that coasted;
- **the locomotion boundary**: `beginSubstep`, `beginControlStep`, the staged request and
  `resolvePhysicalSupportedPair`;
- **the gait and `endSubstep`**;
- **the contact press**, because it feeds the boundary.

Only the *view* and the *decision* can move to a slower clock.

The bout runner's own instruments are a caveat. The recorder's engagement tracker and the peak tip
sample read `view.self` every substep, so between two decisions they read a view up to `every - 1`
substeps old. That is harmless to the fight and slightly coarsens those instruments.

### 7.2 Cost (Node bout runner, one realm, sequential, quiet box)

The fixture is two stone default golems, four pairings x 3 seeds, 8 s cap, with the first bout
discarded as warm-up. Figures are ms per simulated second, mean of two repeats that agree within
3 %.

- **Havok** is `plugin.executeStep`.
- **Control** is the `onBeforePhysicsObservable` span, broken into its pieces.
- **Observe** includes `beginSubstep`.
- **Apply** is the driver less the mind.
- **After** is `afterLocomotion`: gait, `endSubstep`, torso, head and effector servos, wear.
- **Begin** is `beginControlStep`: contact and support readings.
- **Rec** is the harness's recorder.
- **Rest** is the pair resolution and bookkeeping.

| physics / control | wall | Havok | control | observe | decide | apply | after | begin | rec | rest | vs s240 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 240 / 240 | 138.6 | 45.3 | 92.9 | 25.1 | 7.0 | 0.9 | 23.8 | 25.6 | 4.8 | 5.3 | 1.00x |
| 240 / 120 | 123.1 | 44.1 | 78.7 | 13.2 | 3.9 | 0.8 | 24.0 | 26.0 | 4.9 | 5.3 | 0.89x |
| 240 / 80 | 112.9 | 43.3 | 69.3 | 8.8 | 2.6 | 0.8 | 22.6 | 24.7 | 4.6 | 4.8 | 0.81x |
| 240 / 60 | 111.1 | 42.5 | 68.2 | 6.9 | 1.9 | 0.8 | 22.8 | 25.5 | 4.6 | 5.3 | 0.80x |
| 120 (r) / 120 | 76.4 | 28.6 | 47.4 | 12.6 | 3.6 | 0.5 | 12.2 | 13.1 | 2.5 | 2.7 | 0.55x |
| 120 (r) / 60 | 67.6 | 28.1 | 39.2 | 6.6 | 1.6 | 0.5 | 11.9 | 13.2 | 2.5 | 2.7 | 0.49x |
| 120 (u) / 120 | 73.9 | 25.9 | 47.6 | 12.9 | 3.9 | 0.5 | 12.0 | 12.8 | 2.4 | 2.7 | 0.53x |

What the table says:

- **The mind is cheap.** `decide` is 7 ms of 139 at 240/240. Publishing the view (`describe` on
  both bodies) costs 3.5x as much.
- Decoupling saves observe and decide and nothing else. That is 21 % of the wall at 240 physics
  (240/60 against 240/240) and 12 % at 120 physics.
- **Past 80 Hz control the saving stops.** What is left per substep is the servos (`after`, 23 ms),
  the locomotion boundary (`begin`, 26 ms) and Havok (43 ms), and none of it can move off the
  physics clock.
- `beginControlStep` is as large as all the servos together. It is the next place to look for
  cost, independent of either rate.
- **The rate is the big lever: 120/120 is 0.55x.** 120/60 would be 0.49x, but see the section 5
  artefact.

### 7.3 Bouts (section 4, rows `/cN`)

- **At 240 physics, control at 120, 80 or 60 is indistinguishable from 240 at bout level.** Every
  paired interval spans zero, and the winner agreement (104-119/192) sits in the chaos band of the
  r240 control.
- Median seconds creep up (14.9, 15.5, 16.3, 17.6 at control 240, 120, 80, 60) and damage/s creeps
  down (0.786 → 0.732), but neither paired difference is significant. It would take 384+ bouts per
  set to say whether the creep is real.
- At 120 physics, control 60 carries the opening artefact of section 5.

## 8. Verdict per subsystem

| subsystem | verdict | evidence |
|---|---|---|
| Legs, locomotion | **Retune, and it is done.** The ideal step alone restores the envelope | biped and skeleton walk slip 99/96 at s240, 567/1414 at u120, 151/92 at r120; top speed, turn rate, rise and shove brackets all equal |
| Golem arms (JointServo chains) | **Retune**: the ideal step plus exact discretisation, with a residual. Idle stray, peak tip, stroke peak and parry arrival match 240. Stroke stray is 1.3-1.6x and parry overshoot 1.0-1.3x | section 2.1. The residual is dynamic, and servo gain trades it against cover overshoot (section 3) |
| Human arm | **Retune.** The ideal step alone restores it (parry overshoot 498 → 119 against 113) | section 2.1. Its own drive is untouched by the discretisation |
| Contact, mass, lift, head ram | **Retune.** Within a few per cent after the ideal step | section 2.3 |
| Attribute extremes | **Same verdict as the base**, at every extreme | section 2.4 |
| Stability boundary | **Not a limit.** 4-16x headroom above every shipped gain at 120 | section 3 |
| Whip | **Unresolved.** Its peaks are chaotic and not monotone in the rate | section 6 |
| The fight | **Not yet a match.** Retuned 120 fights 26 % longer and 25 % less bloodily, and the cause is physical (section 5). It is a shift of the size a tuning pass moves, not a missing capability | section 4 |
| Control clock | **Works at 240 physics down to 60 Hz**: bout level unchanged, 20 % cheaper. At 120 physics, 120 Hz control is fine; 60 Hz shows an unexplained opening artefact | section 7 |

**Overall: 120 Hz is a retune, not a limit on what a body or mind can do.** Nothing measured is
lost that a gain or a design choice cannot buy back, and no drive is near its stability boundary.
What 120 Hz is not yet is the *same game* as 240: the fight's tempo moves. Whether that matters is
a design call. Section 5 names the experiment that decides whether the tempo can be tuned back.

## 9. What landing on main would take

**Landed on main 2026-09-25:** `solverTuningHz` and `controlHz`. `SERVO_TUNING` was not landed.
It is kept on the branch `physics-rate-servo-tuning` (main plus that one commit) for the follow-up
studies, which need its gain knob.

As it stood on the study branch:

- **`solverTuningHz`** (`src/config.ts`, `holdIdealStep` in `src/physics.ts`), committed.
  Bit-identical at 240, so it can land as it stands. It is the precondition for any rate below 240.
- **`controlHz`**, committed with this document. It covers `src/control-host.ts`, `Golem.observe`'s
  `publish` flag and `GolemDriver.hold`, and it is bit-identical at its default. It can land.
- **`SERVO_TUNING`**, committed, off by default. It covers `src/golem/joint-servo.ts` and the exact
  filter branch in `stepToward`. It is an experiment knob, and a mutable object on the import path,
  which is what the house rules keep out of anything a mind could be trained against. To land it,
  either make the exact form the only form and re-measure every chain table at 240, or delete it.
  It buys little over the ideal step alone (t120 against r120 is a null at bout level, section 5).
  **Recommendation: delete it** unless the whip or the maul study needs it.

To move the page to 120 Hz:

1. **Close the bout-level tempo gap** of section 5 first, or decide it does not matter. That means
   the per-contact speed log, then a gain pass at 120.
2. **Fix the tests pinned to 240.** At r120, with the ideal step held and exact discretisation, 30
   of 978 tests fail (Node test runner, preloaded rate). The first analysis counted 44 at u120. By
   file:
   - `golem-arm-coordination` (7) and `golem-arm-transients` (6): stroke-stray and overshoot
     ceilings, the section 2 residual;
   - `golem-locomotion` (3), `golem-bench` (3), `golem-knockdown` (2), `research-physical` (2) and
     `tactics-v4` (2);
   - one each in `art-proof`, `humanoid`, `lab`, `recorder` and
     `supported-locomotion-stability-physical`.

   None was fixed here. Each is a measured threshold, and moving a threshold without the table
   beside it is what `AGENTS.md` forbids. That is not cheap, so it is left open.
3. **Diagnose `r120/c60`'s 0.35 s severs** before shipping any control rate below physics at 120.
4. **Settle the whip** with a multi-trial study (section 6).
5. **Re-measure one thing in the browser:** the page's per-frame cost at 120/120 on the owner's
   laptop. The Node figures here say 0.55x, but the page carries rendering too, and
   `AGENTS.md` records a 9 % page/Node disagreement on transients.

**Eye-checks for the owner** (the page, not Node):

- the wrist blade's cut and cover at 120 against 240, side by side;
- a whip lash at 120;
- a stone biped walking and being shoved at 120;
- a full bout at 120, for tempo;
- a bout at 240 physics with 60 Hz control, which should feel no different.
